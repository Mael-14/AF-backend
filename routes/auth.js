const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Simple login with email and password
 * Backend handles all Firebase Auth operations
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, idToken } = req.body;

    let user;

    // Support both simple email/password and idToken for backward compatibility
    if (idToken) {
      // Legacy: Verify Firebase token
      const decodedToken = await authService.verifyToken(idToken);
      user = await authService.createOrUpdateUser({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
        displayName: decodedToken.name,
        photoURL: decodedToken.picture,
        username: decodedToken.email?.split('@')[0]
      });
    } else if (email && password) {
      // Simple: Verify email and password
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Verify email and password
      const firebaseUser = await authService.verifyEmailPassword(email, password);
      
      // Get or create user in Firestore
      user = await authService.createOrUpdateUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        username: firebaseUser.email?.split('@')[0]
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Email and password, or idToken is required'
      });
    }

    // Generate JWT token
    const jwtToken = authService.generateJWT(user);

    res.json({
      success: true,
      user: {
        id: user.id || user.uid,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        photoURL: user.photoURL
      },
      token: jwtToken
    });
  } catch (error) {
    // Handle authentication errors
    if (error.message === 'User not found' || 
        error.message === 'Invalid password' ||
        error.message === 'Invalid email or password') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/register
 * Simple registration with email, password, and name
 * Backend handles all Firebase Auth operations
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, idToken } = req.body;

    let user;

    // Support idToken for backward compatibility
    if (idToken) {
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Name is required'
        });
      }

      // Verify Firebase token
      const decodedToken = await authService.verifyToken(idToken);
      user = await authService.createOrUpdateUser({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: name,
        displayName: name,
        username: decodedToken.email?.split('@')[0]
      });
    } else {
      // Simple: Create user with email and password
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          message: 'Email, password, and name are required'
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Password validation
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters'
        });
      }

      // Create user in Firebase Auth and Firestore
      user = await authService.createUserWithEmailPassword(email, password, name);
    }

    // Generate JWT token
    const jwtToken = authService.generateJWT(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id || user.uid,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        photoURL: user.photoURL
      },
      token: jwtToken
    });
  } catch (error) {
    if (error.message === 'Email already registered' || error.message === 'Invalid token') {
      return res.status(409).json({
        success: false,
        message: error.message === 'Invalid token' ? 'Invalid authentication token' : error.message
      });
    }
    next(error);
  }
});


/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { displayName, username, photoURL, about } = req.body;
    const { getDb } = require('../services/firebaseService');
    const db = getDb();

    const updateData = {
      updatedAt: new Date().toISOString()
    };

    if (displayName) updateData.displayName = displayName;
    if (username) updateData.username = username;
    if (photoURL) updateData.photoURL = photoURL;
    if (about !== undefined) updateData.about = about;

    await db.collection('users').doc(req.userId).update(updateData);

    const updatedUser = await authService.getUserById(req.userId);

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;



