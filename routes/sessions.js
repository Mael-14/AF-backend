const express = require('express');
const router = express.Router();
const roomService = require('../services/roomService');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/sessions
 * Get user's active sessions/rooms
 */
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const rooms = await roomService.getUserRooms(req.userId);

      res.json({
        success: true,
        sessions: rooms
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

