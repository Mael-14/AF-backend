const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const roomService = require('../services/roomService');
const gameService = require('../services/gameService');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/rooms/create
 * Create a new room
 */
router.post('/create', 
  authenticate,
  [
    body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Room name must be 3-50 characters'),
    body('gameId').notEmpty().withMessage('Game ID is required'),
    body('maxPlayers').optional().isInt({ min: 2, max: 20 }).withMessage('Max players must be between 2 and 20')
  ],
  async (req, res, next) => {
    try {
      const { name, gameId, maxPlayers, selectedFriends } = req.body;

      // Get game details
      const game = await gameService.getGameById(gameId);
      if (!game) {
        return res.status(404).json({
          success: false,
          message: 'Game not found'
        });
      }

      // Create room
      const room = await roomService.createRoom({
        name,
        hostId: req.userId,
        hostName: req.user.displayName || req.user.username || 'Anonymous',
        gameId: game.id,
        gameName: game.name,
        maxPlayers: maxPlayers || game.maxPlayers || 10,
        selectedFriends: selectedFriends || [],
        avatar: req.user.photoURL || ''
      });

      res.status(201).json({
        success: true,
        room
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/rooms/join/:code
 * Join a room by code
 */
router.post('/join/:code',
  authenticate,
  [
    param('code').isLength({ min: 6, max: 6 }).withMessage('Room code must be 6 characters')
  ],
  async (req, res, next) => {
    try {
      const { code } = req.params;
      const codeUpper = code.toUpperCase();

      // Validate and join room
      const room = await roomService.joinRoom(codeUpper, {
        userId: req.userId,
        username: req.user.displayName || req.user.username || 'Anonymous',
        avatar: req.user.photoURL || ''
      });

      res.json({
        success: true,
        room
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * POST /api/rooms/validate/:code
 * Validate a room code
 */
router.post('/validate/:code',
  [
    param('code').isLength({ min: 6, max: 6 }).withMessage('Room code must be 6 characters')
  ],
  async (req, res, next) => {
    try {
      const { code } = req.params;
      const codeUpper = code.toUpperCase();

      const validation = await roomService.validateRoomCode(codeUpper);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      res.json({
        success: true,
        room: validation.room
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/rooms/:roomId
 * Get room details
 */
router.get('/:roomId',
  authenticate,
  async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const room = await roomService.getRoomById(roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      res.json({
        success: true,
        room
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/rooms/:roomId/leave
 * Leave a room
 */
router.post('/:roomId/leave',
  authenticate,
  async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const room = await roomService.leaveRoom(roomId, req.userId);

      res.json({
        success: true,
        room
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * POST /api/rooms/:roomId/start
 * Start the room game
 */
router.post('/:roomId/start',
  authenticate,
  async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const room = await roomService.getRoomById(roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      if (room.hostId !== req.userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the host can start the game'
        });
      }

      const updatedRoom = await roomService.startRoom(roomId);

      res.json({
        success: true,
        room: updatedRoom
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * POST /api/rooms/:roomId/set-player-turn
 * Set player turn (host only)
 */
router.post('/:roomId/set-player-turn',
  authenticate,
  [
    body('playerId').notEmpty().withMessage('Player ID is required')
  ],
  async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { playerId } = req.body;
      const room = await roomService.getRoomById(roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      if (room.hostId !== req.userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the host can set player turn'
        });
      }

      const updatedRoom = await roomService.setPlayerTurn(roomId, playerId);

      res.json({
        success: true,
        room: updatedRoom
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * GET /api/rooms/user/my-rooms
 * Get user's rooms
 */
router.get('/user/my-rooms',
  authenticate,
  async (req, res, next) => {
    try {
      const rooms = await roomService.getUserRooms(req.userId);

      res.json({
        success: true,
        rooms
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

