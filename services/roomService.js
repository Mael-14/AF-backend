const { getDb } = require('./firebaseService');
const { v4: uuidv4 } = require('uuid');
const gameService = require('./gameService');

const COLLECTIONS = {
  ROOMS: 'rooms',
  USERS: 'users',
  GAMES: 'games'
};

/**
 * Generate a unique 6-character room code
 */
const generateRoomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

/**
 * Check if room code already exists
 */
const roomCodeExists = async (code) => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.ROOMS)
    .where('code', '==', code)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  
  return !snapshot.empty;
};

/**
 * Create a new room
 */
const createRoom = async (roomData) => {
  const db = getDb();
  let code = generateRoomCode();
  
  // Ensure code is unique
  while (await roomCodeExists(code)) {
    code = generateRoomCode();
  }

  const room = {
    id: uuidv4(),
    code: code,
    name: roomData.name,
    hostId: roomData.hostId,
    hostName: roomData.hostName,
    gameId: roomData.gameId,
    gameName: roomData.gameName,
    maxPlayers: parseInt(roomData.maxPlayers) || 10,
    players: [{
      userId: roomData.hostId,
      username: roomData.hostName,
      avatar: roomData.avatar || '',
      isHost: true,
      isActive: true,
      joinedAt: new Date().toISOString()
    }],
    selectedFriends: roomData.selectedFriends || [],
    status: 'pending', // pending, active, completed, terminated
    currentQuestion: null,
    questions: [],
    votes: {},
    currentPlayerTurn: null,
    answers: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await db.collection(COLLECTIONS.ROOMS).doc(room.id).set(room);
  return room;
};

/**
 * Get room by code
 */
const getRoomByCode = async (code) => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.ROOMS)
    .where('code', '==', code)
    .where('status', 'in', ['pending', 'active'])
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

/**
 * Get room by ID
 */
const getRoomById = async (roomId) => {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  
  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
};

/**
 * Validate room code
 */
const validateRoomCode = async (code) => {
  const room = await getRoomByCode(code);
  if (!room) {
    return { valid: false, message: 'Room not found' };
  }

  if (room.status !== 'pending' && room.status !== 'active') {
    return { valid: false, message: 'Room is not available' };
  }

  if (room.players.length >= room.maxPlayers) {
    return { valid: false, message: 'Room is full' };
  }

  return { valid: true, room };
};

/**
 * Join room
 */
const joinRoom = async (code, playerData) => {
  const db = getDb();
  const room = await getRoomByCode(code);

  if (!room) {
    throw new Error('Room not found');
  }

  // Check active players count
  const activePlayers = room.players.filter(p => p.isActive !== false);
  if (activePlayers.length >= room.maxPlayers) {
    throw new Error('Room is full');
  }

  // Check if player already in room (including inactive)
  const existingPlayer = room.players.find(p => p.userId === playerData.userId);
  if (existingPlayer && existingPlayer.isActive !== false) {
    return room; // Already active in room
  }
  
  // If player exists but is inactive, reactivate them
  if (existingPlayer && existingPlayer.isActive === false) {
    room.players = room.players.map(p => {
      if (p.userId === playerData.userId) {
        return {
          ...p,
          isActive: true,
          rejoinedAt: new Date().toISOString(),
          leftAt: null
        };
      }
      return p;
    });
    room.updatedAt = new Date().toISOString();
    await db.collection(COLLECTIONS.ROOMS).doc(room.id).update({
      players: room.players,
      updatedAt: room.updatedAt
    });
    return room;
  }

  // Add player to room
  room.players.push({
    userId: playerData.userId,
    username: playerData.username,
    avatar: playerData.avatar || '',
    isHost: false,
    isActive: true,
    joinedAt: new Date().toISOString()
  });

  room.updatedAt = new Date().toISOString();

  await db.collection(COLLECTIONS.ROOMS).doc(room.id).update({
    players: room.players,
    updatedAt: room.updatedAt
  });

  // Check if room is now full and should auto-start
  const updatedRoom = await getRoomById(room.id);
  const activePlayersCount = updatedRoom.players.filter(p => p.isActive !== false).length;
  const isFull = activePlayersCount >= updatedRoom.maxPlayers;
  const isPending = updatedRoom.status === 'pending';

  // Return room with autoStart flag if it should start
  return {
    ...updatedRoom,
    shouldAutoStart: isFull && isPending
  };
};

/**
 * Leave room - Mark player as inactive instead of removing
 */
const leaveRoom = async (roomId, userId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Mark player as inactive instead of removing
  room.players = room.players.map(p => {
    if (p.userId === userId) {
      return {
        ...p,
        isActive: false,
        leftAt: new Date().toISOString()
      };
    }
    return p;
  });

  // Get active players count
  const activePlayers = room.players.filter(p => p.isActive !== false);
  
  room.updatedAt = new Date().toISOString();

  // If host leaves, assign new host from active players
  if (room.hostId === userId && activePlayers.length > 0) {
    const newHost = activePlayers.find(p => p.userId !== userId) || activePlayers[0];
    if (newHost) {
      room.hostId = newHost.userId;
      room.players = room.players.map(p => {
        if (p.userId === newHost.userId) {
          return { ...p, isHost: true };
        }
        if (p.userId === userId) {
          return { ...p, isHost: false };
        }
        return p;
      });
    }
  }

  // If no active players left, terminate room
  if (activePlayers.length === 0) {
    room.status = 'terminated';
  }

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    players: room.players,
    hostId: room.hostId,
    status: room.status,
    updatedAt: room.updatedAt
  });

  return room;
};

/**
 * Rejoin room - Reactivate a player who left
 */
const rejoinRoom = async (roomId, userId, playerData) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.status === 'terminated' || room.status === 'completed') {
    throw new Error('Room is no longer available');
  }

  // Check active players count
  const activePlayers = room.players.filter(p => p.isActive !== false);
  if (activePlayers.length >= room.maxPlayers) {
    throw new Error('Room is full');
  }

  // Check if player was previously in the room
  const existingPlayer = room.players.find(p => p.userId === userId);
  
  if (existingPlayer) {
    // Reactivate the player
    room.players = room.players.map(p => {
      if (p.userId === userId) {
        return {
          ...p,
          isActive: true,
          leftAt: null,
          rejoinedAt: new Date().toISOString()
        };
      }
      return p;
    });
  } else {
    // Add as new player if not previously in room
    room.players.push({
      userId: userId,
      username: playerData.username,
      avatar: playerData.avatar || '',
      isHost: false,
      isActive: true,
      joinedAt: new Date().toISOString()
    });
  }

  room.updatedAt = new Date().toISOString();

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    players: room.players,
    updatedAt: room.updatedAt
  });

  return room;
};

/**
 * Update room status
 */
const updateRoomStatus = async (roomId, status) => {
  const db = getDb();
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    status: status,
    updatedAt: new Date().toISOString()
  });
};

/**
 * Start room game - Load questions and set first player turn
 */
const startRoom = async (roomId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Check active players count
  const activePlayers = room.players.filter(p => p.isActive !== false);
  if (activePlayers.length < 2) {
    throw new Error('Need at least 2 active players to start');
  }

  // Load questions from game
  let questions = [];
  if (room.gameId) {
    try {
      const game = await gameService.getGameById(room.gameId);
      if (game && game.questions && Array.isArray(game.questions)) {
        // Select 3 random questions for voting
        const shuffled = [...game.questions].sort(() => 0.5 - Math.random());
        questions = shuffled.slice(0, 3).map(q => ({
          id: q.id || uuidv4(),
          text: q.text,
          difficulty: q.difficulty || 'medium'
        }));
      }
    } catch (error) {
      console.error('Error loading game questions:', error);
      // Continue without questions - they can be loaded later
    }
  }

  // Select first player randomly from active players
  const randomIndex = Math.floor(Math.random() * activePlayers.length);
  const firstPlayer = activePlayers[randomIndex];

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    status: 'active',
    questions: questions,
    currentPlayerTurn: firstPlayer.userId,
    votes: {},
    answers: {},
    round: 1,
    updatedAt: new Date().toISOString()
  });

  // Get updated room to return complete data
  const updatedRoom = await getRoomById(roomId);

  return updatedRoom || { 
    ...room, 
    status: 'active',
    questions: questions,
    currentPlayerTurn: firstPlayer.userId,
    round: 1
  };
};

/**
 * Set player turn
 */
const setPlayerTurn = async (roomId, playerId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Verify player is in the room
  const playerExists = room.players.some(p => p.userId === playerId);
  if (!playerExists) {
    throw new Error('Player not found in room');
  }

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    currentPlayerTurn: playerId,
    updatedAt: new Date().toISOString()
  });

  return { ...room, currentPlayerTurn: playerId };
};

/**
 * Select new questions for a turn
 */
const selectNewQuestions = async (roomId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room || !room.gameId) {
    return [];
  }

  try {
    const game = await gameService.getGameById(room.gameId);
    if (game && game.questions && Array.isArray(game.questions)) {
      // Select 3 random questions for voting
      const shuffled = [...game.questions].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 3).map(q => ({
        id: q.id || uuidv4(),
        text: q.text,
        difficulty: q.difficulty || 'medium'
      }));
    }
  } catch (error) {
    console.error('Error loading game questions:', error);
  }

  return [];
};

/**
 * Rotate to next player turn - Select new questions and increment round
 */
const rotatePlayerTurn = async (roomId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (!room.players || room.players.length === 0) {
    throw new Error('No players in room');
  }

  // Check if game should end (round 10)
  const currentRound = room.round || 1;
  if (currentRound >= 10) {
    // End the game
    await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
      status: 'completed',
      updatedAt: new Date().toISOString()
    });
    return { ...room, status: 'completed', gameEnded: true };
  }

  // Select new questions for the next turn
  const newQuestions = await selectNewQuestions(roomId);

  // Filter to only active players for turn rotation
  const activePlayers = room.players.filter(p => p.isActive !== false);
  
  if (activePlayers.length === 0) {
    throw new Error('No active players in room');
  }

  // Find current player index in active players
  const currentIndex = activePlayers.findIndex(p => p.userId === room.currentPlayerTurn);
  
  // Get next player (wrap around if at end)
  const nextIndex = currentIndex >= 0 && currentIndex < activePlayers.length - 1 
    ? currentIndex + 1 
    : 0;
  
  const nextPlayer = activePlayers[nextIndex];
  const nextRound = currentRound + 1;

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    currentPlayerTurn: nextPlayer.userId,
    questions: newQuestions,
    round: nextRound,
    // Reset votes and answers for new turn
    votes: {},
    answers: {},
    updatedAt: new Date().toISOString()
  });

  const updatedRoom = await getRoomById(roomId);
  return updatedRoom || { 
    ...room, 
    currentPlayerTurn: nextPlayer.userId,
    questions: newQuestions,
    round: nextRound
  };
};

/**
 * Get user's rooms - Includes rooms where user was a player (even if they left)
 */
const getUserRooms = async (userId) => {
  const db = getDb();
  
  // Query rooms with status filter (exclude terminated)
  // Then filter and sort in memory for rooms where user was/is a player
  const snapshot = await db.collection(COLLECTIONS.ROOMS)
    .where('status', 'in', ['pending', 'active', 'completed'])
    .get();

  // Filter rooms where the user is/was a player and sort by updatedAt
  const userRooms = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(room => {
      // Check if user is/was in the players array (including inactive players)
      return room.players && room.players.some(player => player.userId === userId);
    })
    .map(room => {
      // Add metadata about user's status in the room
      const userPlayer = room.players.find(p => p.userId === userId);
      return {
        ...room,
        userIsActive: userPlayer?.isActive !== false,
        userIsHost: room.hostId === userId
      };
    })
    .sort((a, b) => {
      // Sort by updatedAt descending (most recent first)
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });

  return userRooms;
};

/**
 * Delete/Terminate a room
 */
const deleteRoom = async (roomId, userId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Only host can delete the room
  if (room.hostId !== userId) {
    throw new Error('Only the host can delete this room');
  }

  // Update room status to terminated
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    status: 'terminated',
    updatedAt: new Date().toISOString()
  });

  return { ...room, status: 'terminated' };
};

module.exports = {
  createRoom,
  getRoomByCode,
  getRoomById,
  validateRoomCode,
  joinRoom,
  leaveRoom,
  rejoinRoom,
  deleteRoom,
  updateRoomStatus,
  startRoom,
  setPlayerTurn,
  rotatePlayerTurn,
  getUserRooms,
  generateRoomCode
};

