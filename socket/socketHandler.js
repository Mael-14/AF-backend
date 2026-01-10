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

        // Get fresh room data to check if it's full (in case player just joined via REST API)
        const currentRoom = await roomService.getRoomById(room.id);
        const isFull = currentRoom && currentRoom.players.length >= currentRoom.maxPlayers;
        const isPending = currentRoom && currentRoom.status === 'pending';

        // Notify others in room
        socket.to(`room:${room.id}`).emit('player_joined', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          room: currentRoom || room,
          isFull: isFull
        });

        // Auto-start if room is full and pending (backup check in case REST API didn't trigger it)
        if (isFull && isPending && currentRoom) {
          try {
            const updatedRoom = await roomService.startRoom(room.id);

            // Broadcast game started event to all players
            io.to(`room:${room.id}`).emit('game_started', {
              room: updatedRoom,
              questions: updatedRoom.questions || [],
              currentPlayerTurn: updatedRoom.currentPlayerTurn,
              round: updatedRoom.round || 1
            });

            console.log(`🎮 Room ${roomCode} auto-started via Socket.IO - all players joined`);
          } catch (error) {
            console.error('Error auto-starting room via Socket.IO:', error);
            // Room might already be started, which is fine
          }
        }

        // Send current room state to the joining user
        // Make sure to include all room data including questions
        socket.emit('room_state', {
          room: {
            ...room,
            questions: room.questions || [],
            votes: room.votes || {},
            answers: room.answers || {}
          },
          players: room.players,
          currentQuestion: room.currentQuestion,
          currentPlayerTurn: room.currentPlayerTurn,
          questions: room.questions || [],
          votes: room.votes || {},
          answers: room.answers || {}
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

        // Only the player whose turn it is can submit an answer
        if (room.currentPlayerTurn !== socket.userId) {
          socket.emit('error', { message: 'It is not your turn to answer' });
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

        // Broadcast answer to all players in the room (including the submitter)
        // Include the answer text directly for easy display
        io.to(`room:${roomId}`).emit('answer_submitted', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          answer: answer,
          answerText: answer, // Explicit answer text for display
          questionId: questionId,
          playerTurn: room.currentPlayerTurn,
          playerTurnId: room.currentPlayerTurn,
          countdownStart: new Date().toISOString() // Timestamp for countdown start
        });

        console.log(`📝 ${socket.userId} submitted answer in room ${roomId}`);

        // Broadcast countdown start event to viewers (20 seconds)
        io.to(`room:${roomId}`).emit('viewer_countdown_start', {
          duration: 20, // 20 seconds
          startTime: new Date().toISOString()
        });

        // After 20 seconds, rotate to next turn (give time for viewers to see the answer)
        // Store timeout reference per room to prevent multiple timeouts
        const timeoutKey = `turn_rotation_${roomId}`;
        
        // Clear any existing timeout for this room
        if (global[timeoutKey]) {
          clearTimeout(global[timeoutKey]);
        }
        
        global[timeoutKey] = setTimeout(async () => {
          try {
            // Clear the timeout reference
            delete global[timeoutKey];
            
            const updatedRoom = await roomService.rotatePlayerTurn(roomId);
            
            if (updatedRoom.gameEnded) {
              // Game ended
              io.to(`room:${roomId}`).emit('game_ended', {
                message: 'Game completed! All 10 rounds finished.',
                room: updatedRoom
              });
            } else {
              // Broadcast new turn with new questions
              io.to(`room:${roomId}`).emit('turn_rotated', {
                room: updatedRoom,
                questions: updatedRoom.questions || [],
                currentPlayerTurn: updatedRoom.currentPlayerTurn,
                round: updatedRoom.round
              });
              
              // Also emit player_turn_changed for consistency
              io.to(`room:${roomId}`).emit('player_turn_changed', {
                playerId: updatedRoom.currentPlayerTurn,
                room: updatedRoom
              });
            }
          } catch (error) {
            console.error('Error rotating turn:', error);
            delete global[timeoutKey];
          }
        }, 20000); // 20 second delay before rotating turn

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

        // Don't allow the player whose turn it is to vote
        if (room.currentPlayerTurn === socket.userId) {
          socket.emit('error', { message: 'You cannot vote - it is your turn to answer' });
          return;
        }

        // Update votes
        const { getDb } = require('../services/firebaseService');
        const db = getDb();
        
        const votes = room.votes || {};
        if (!votes[questionId]) {
          votes[questionId] = [];
        }
        
        // Remove existing vote from this user (they can change their vote)
        Object.keys(votes).forEach(qId => {
          votes[qId] = votes[qId].filter(v => v.userId !== socket.userId);
        });
        
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

        // Get updated room to check voting completion
        const updatedRoom = await roomService.getRoomById(roomId);
        const votingPlayers = updatedRoom.players.filter(p => p.userId !== updatedRoom.currentPlayerTurn);
        const totalVotes = Object.values(votes).reduce((sum, voteArray) => sum + voteArray.length, 0);
        const votingComplete = totalVotes >= votingPlayers.length;

        // Determine winning question if voting is complete
        let winningQuestion = null;
        if (votingComplete && Object.keys(voteCounts).length > 0) {
          let maxVotes = 0;
          let winningQuestionId = null;
          Object.entries(voteCounts).forEach(([qId, count]) => {
            if (count > maxVotes) {
              maxVotes = count;
              winningQuestionId = qId;
            }
          });
          if (winningQuestionId && updatedRoom.questions) {
            winningQuestion = updatedRoom.questions.find(q => q.id === winningQuestionId);
          }
        }

        // Broadcast vote update
        io.to(`room:${roomId}`).emit('vote_update', {
          voteCounts: voteCounts,
          votes: votes,
          votingComplete: votingComplete,
          winningQuestion: winningQuestion
        });

        // If voting is complete and winning question is determined, start countdown
        if (votingComplete && winningQuestion) {
          io.to(`room:${roomId}`).emit('question_selected', {
            question: winningQuestion,
            countdown: 60 // 60 seconds countdown
          });
        }

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
     * Share answer - Simple broadcast to viewers (no automatic rotation)
     */
    socket.on('share_answer', async (data) => {
      try {
        const { roomId, answer } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Only the player whose turn it is can share an answer
        if (room.currentPlayerTurn !== socket.userId) {
          socket.emit('error', { message: 'It is not your turn to answer' });
          return;
        }

        // Check if user is in room
        const isPlayer = room.players.some(p => p.userId === socket.userId);
        if (!isPlayer) {
          socket.emit('error', { message: 'You are not a member of this room' });
          return;
        }

        // Update room with answer
        const { getDb } = require('../services/firebaseService');
        const db = getDb();
        
        const answers = room.answers || {};
        answers[socket.userId] = {
          answer: answer,
          submittedAt: new Date().toISOString()
        };

        await db.collection('rooms').doc(roomId).update({
          answers: answers,
          updatedAt: new Date().toISOString()
        });

        // Simple broadcast to all players in the room
        io.to(`room:${roomId}`).emit('answer_shared', {
          userId: socket.userId,
          username: socket.user.displayName || socket.user.username,
          answer: answer,
          answerText: answer,
          timestamp: new Date().toISOString()
        });

        console.log(`📤 ${socket.userId} shared answer in room ${roomId}`);
      } catch (error) {
        console.error('Error sharing answer:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Next turn - Host controls when to move to next turn
     */
    socket.on('next_turn', async (data) => {
      try {
        const { roomId } = data;
        const room = await roomService.getRoomById(roomId);

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Only host can trigger next turn
        if (room.hostId !== socket.userId) {
          socket.emit('error', { message: 'Only the host can move to the next turn' });
          return;
        }

        // Rotate to next turn
        const updatedRoom = await roomService.rotatePlayerTurn(roomId);
        
        if (updatedRoom.gameEnded) {
          // Game ended
          io.to(`room:${roomId}`).emit('game_ended', {
            message: 'Game completed! All 10 rounds finished.',
            room: updatedRoom
          });
        } else {
          // Broadcast new turn with new questions
          io.to(`room:${roomId}`).emit('turn_rotated', {
            room: updatedRoom,
            questions: updatedRoom.questions || [],
            currentPlayerTurn: updatedRoom.currentPlayerTurn,
            round: updatedRoom.round
          });
          
          // Also emit player_turn_changed for consistency
          io.to(`room:${roomId}`).emit('player_turn_changed', {
            playerId: updatedRoom.currentPlayerTurn,
            room: updatedRoom
          });
        }

        console.log(`🔄 Host rotated turn in room ${roomId}`);
      } catch (error) {
        console.error('Error rotating turn:', error);
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



