const express = require('express');
const router = express.Router();
const gameService = require('../services/gameService');
const { optionalAuth } = require('../middleware/auth');

/**
 * GET /api/games
 * Get all games
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const games = await gameService.getAllGames();
    res.json({
      success: true,
      games
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/games/:gameId
 * Get game by ID
 */
router.get('/:gameId', optionalAuth, async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const game = await gameService.getGameById(gameId);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.json({
      success: true,
      game
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/games/category/:category
 * Get games by category
 */
router.get('/category/:category', optionalAuth, async (req, res, next) => {
  try {
    const { category } = req.params;
    const games = await gameService.getGamesByCategory(category);

    res.json({
      success: true,
      games
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

