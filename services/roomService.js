const { getDb } = require('./firebaseService');
const { v4: uuidv4 } = require('uuid');

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

  if (room.players.length >= room.maxPlayers) {
    throw new Error('Room is full');
  }

  // Check if player already in room
  const existingPlayer = room.players.find(p => p.userId === playerData.userId);
  if (existingPlayer) {
    return room;
  }

  // Add player to room
  room.players.push({
    userId: playerData.userId,
    username: playerData.username,
    avatar: playerData.avatar || '',
    isHost: false,
    joinedAt: new Date().toISOString()
  });

  room.updatedAt = new Date().toISOString();

  await db.collection(COLLECTIONS.ROOMS).doc(room.id).update({
    players: room.players,
    updatedAt: room.updatedAt
  });

  return room;
};

/**
 * Leave room
 */
const leaveRoom = async (roomId, userId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Remove player from room
  room.players = room.players.filter(p => p.userId !== userId);
  room.updatedAt = new Date().toISOString();

  // If host leaves, assign new host or terminate room
  if (room.hostId === userId) {
    if (room.players.length > 0) {
      room.hostId = room.players[0].userId;
      room.players[0].isHost = true;
    } else {
      room.status = 'terminated';
    }
  }

  await db.collection(COLLECTIONS.ROOMS).doc(room.id).update({
    players: room.players,
    hostId: room.hostId,
    status: room.status,
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
 * Start room game
 */
const startRoom = async (roomId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.players.length < 2) {
    throw new Error('Need at least 2 players to start');
  }

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    status: 'active',
    updatedAt: new Date().toISOString()
  });

  return { ...room, status: 'active' };
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
 * Get user's rooms
 */
const getUserRooms = async (userId) => {
  const db = getDb();
  
  // Query rooms with status filter (simpler query that doesn't require complex index)
  // Then filter and sort in memory for rooms where user is a player
  const snapshot = await db.collection(COLLECTIONS.ROOMS)
    .where('status', 'in', ['pending', 'active'])
    .get();

  // Filter rooms where the user is a player and sort by updatedAt
  const userRooms = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(room => {
      // Check if user is in the players array
      return room.players && room.players.some(player => player.userId === userId);
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
 * Submit a vote for a question
 */
const submitVote = async (roomId, userId, questionId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Initialize votes object if it doesn't exist
  const votes = room.votes || {};
  
  // Initialize question votes array if it doesn't exist
  if (!votes[questionId]) {
    votes[questionId] = [];
  }

  // Check if user already voted for this question
  if (votes[questionId].includes(userId)) {
    throw new Error('You have already voted for this question');
  }

  // Add user vote
  votes[questionId].push(userId);

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    votes: votes,
    updatedAt: new Date().toISOString()
  });

  return { ...room, votes };
};

/**
 * Submit an answer (current player only)
 */
const submitAnswer = async (roomId, userId, answer, questionId) => {
  const db = getDb();
  const room = await getRoomById(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Verify it's the current player's turn
  if (room.currentPlayerTurn !== userId) {
    throw new Error('It is not your turn to answer');
  }

  // Initialize answers object if it doesn't exist
  const answers = room.answers || {};
  
  // Store answer
  answers[userId] = answer;

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    answers: answers,
    updatedAt: new Date().toISOString()
  });

  return { ...room, answers };
};

module.exports = {
  createRoom,
  getRoomByCode,
  getRoomById,
  validateRoomCode,
  joinRoom,
  leaveRoom,
  updateRoomStatus,
  startRoom,
  setPlayerTurn,
  getUserRooms,
  generateRoomCode,
  submitVote,
  submitAnswer
};



