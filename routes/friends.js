const express = require('express');
const router = express.Router();
const friendService = require('../services/friendService');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/friends/request
 * Send friend request
 */
router.post('/request',
  authenticate,
  async (req, res, next) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      if (userId === req.userId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send friend request to yourself'
        });
      }

      const friendship = await friendService.sendFriendRequest(req.userId, userId);

      res.status(201).json({
        success: true,
        friendship
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
 * POST /api/friends/accept/:requestId
 * Accept friend request
 */
router.post('/accept/:requestId',
  authenticate,
  async (req, res, next) => {
    try {
      const { requestId } = req.params;
      const friendship = await friendService.acceptFriendRequest(requestId, req.userId);

      res.json({
        success: true,
        friendship
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
 * GET /api/friends
 * Get user's friends
 */
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const friends = await friendService.getUserFriends(req.userId);

      res.json({
        success: true,
        friends
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/friends/requests
 * Get pending friend requests
 */
router.get('/requests',
  authenticate,
  async (req, res, next) => {
    try {
      const requests = await friendService.getPendingRequests(req.userId);

      res.json({
        success: true,
        requests
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/friends/:friendshipId
 * Remove friend
 */
router.delete('/:friendshipId',
  authenticate,
  async (req, res, next) => {
    try {
      const { friendshipId } = req.params;
      const result = await friendService.removeFriend(friendshipId, req.userId);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

module.exports = router;

