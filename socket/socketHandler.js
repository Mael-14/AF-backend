const roomService = require('../services/roomService');
const authService = require('../services/authService');

// Store active socket connections
const activeConnections = new Map(); // userId -> socketId
const roomConnections = new Map(); // roomId -> Set of socketIds

const initialize = (io) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      let user = null;
      try {
        // Try Firebase token
        const decodedToken = await authService.verifyToken(token);
        user = await authService.getUserById(decodedToken.uid);
      } catch (error) {
        // Try JWT token
        try {
          const decoded = authService.verifyJWT(token);
          user = await authService.getUserById(decoded.userId);
        } catch (jwtError) {
          return next(new Error('Authentication error: Invalid token'));
        }
      }

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user.uid || user.id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.id})`);

    // Store connection
    activeConnections.set(socket.userId, socket.id);

    /**
     * Join room
     */
    socket.on('join_room', async (data) => {
      try {
        const { roomCode } = data;
        const room = await roomService.getRoomByCode(roomCode);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is in room
        const isPlayer = room.players.some(p => p.userId === socket.userId);
        if (!isPlayer) {
          socket.emit('error', { message: 'You are not a member of this room' });
          return;
        }

        // Join Socket.IO room
        socket.join(`room:${room.id}`);
        
        // Track room connections
        if (!roomConnections.has(room.id)) {
          roomConnections.set(room.id, new Set());
        }
        roomConnections.get(room.id).add(socket.id);

        // Notify others in room
        socket.to(`room:${room.id}`).emit('player_joined', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          room: room
        });

        // Send current room state to the joining user
        socket.emit('room_state', {
          room: room,
          players: room.players,
          currentQuestion: room.currentQuestion,
          currentPlayerTurn: room.currentPlayerTurn
        });

        console.log(`👤 ${socket.userId} joined room ${roomCode}`);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Leave room
     */
    socket.on('leave_room', async (data) => {
      try {
        const { roomId } = data;
        
        socket.leave(`room:${roomId}`);
        
        if (roomConnections.has(roomId)) {
          roomConnections.get(roomId).delete(socket.id);
          if (roomConnections.get(roomId).size === 0) {
            roomConnections.delete(roomId);
          }
        }

        socket.to(`room:${roomId}`).emit('player_left', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username
        });

        console.log(`👤 ${socket.userId} left room ${roomId}`);
      } catch (error) {
        console.error('Error leaving room:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Submit answer
     */
    socket.on('submit_answer', async (data) => {
      try {
        const { roomId, answer, questionId } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Update room with answer
        const { getDb } = require('../services/firebaseService');
        const db = getDb();
        
        const answers = room.answers || {};
        answers[socket.userId] = {
          answer: answer,
          questionId: questionId,
          submittedAt: new Date().toISOString()
        };

        await db.collection('rooms').doc(roomId).update({
          answers: answers,
          updatedAt: new Date().toISOString()
        });

        // Broadcast answer to all viewers
        io.to(`room:${roomId}`).emit('answer_submitted', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          answer: answer,
          questionId: questionId
        });

        console.log(`📝 ${socket.userId} submitted answer in room ${roomId}`);
      } catch (error) {
        console.error('Error submitting answer:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Submit vote
     */
    socket.on('submit_vote', async (data) => {
      try {
        const { roomId, questionId } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Update votes
        const { getDb } = require('../services/firebaseService');
        const db = getDb();
        
        const votes = room.votes || {};
        if (!votes[questionId]) {
          votes[questionId] = [];
        }
        
        // Remove existing vote from this user
        votes[questionId] = votes[questionId].filter(v => v.userId !== socket.userId);
        
        // Add new vote
        votes[questionId].push({
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          votedAt: new Date().toISOString()
        });

        await db.collection('rooms').doc(roomId).update({
          votes: votes,
          updatedAt: new Date().toISOString()
        });

        // Calculate vote counts
        const voteCounts = {};
        Object.keys(votes).forEach(qId => {
          voteCounts[qId] = votes[qId].length;
        });

        // Broadcast vote update
        io.to(`room:${roomId}`).emit('vote_update', {
          voteCounts: voteCounts,
          votes: votes
        });

        console.log(`🗳️ ${socket.userId} voted for question ${questionId} in room ${roomId}`);
      } catch (error) {
        console.error('Error submitting vote:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Set current question (host only)
     */
    socket.on('set_question', async (data) => {
      try {
        const { roomId, question } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.hostId !== socket.userId) {
          socket.emit('error', { message: 'Only host can set questions' });
          return;
        }

        const { getDb } = require('../services/firebaseService');
        const db = getDb();

        await db.collection('rooms').doc(roomId).update({
          currentQuestion: question,
          updatedAt: new Date().toISOString()
        });

        // Broadcast question to all players
        io.to(`room:${roomId}`).emit('question_set', {
          question: question
        });

        console.log(`❓ Host set question in room ${roomId}`);
      } catch (error) {
        console.error('Error setting question:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Set player turn (host only)
     */
    socket.on('set_player_turn', async (data) => {
      try {
        const { roomId, playerId } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.hostId !== socket.userId) {
          socket.emit('error', { message: 'Only host can set player turn' });
          return;
        }

        const { getDb } = require('../services/firebaseService');
        const db = getDb();

        await db.collection('rooms').doc(roomId).update({
          currentPlayerTurn: playerId,
          updatedAt: new Date().toISOString()
        });

        // Broadcast player turn to all players
        io.to(`room:${roomId}`).emit('player_turn_changed', {
          playerId: playerId
        });

        console.log(`🔄 Player turn changed to ${playerId} in room ${roomId}`);
      } catch (error) {
        console.error('Error setting player turn:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Disconnect
     */
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId} (${socket.id})`);
      activeConnections.delete(socket.userId);
      
      // Remove from all room connections
      roomConnections.forEach((connections, roomId) => {
        connections.delete(socket.id);
        if (connections.size === 0) {
          roomConnections.delete(roomId);
        }
      });
    });
  });
};

module.exports = {
  initialize,
  activeConnections,
  roomConnections
};

