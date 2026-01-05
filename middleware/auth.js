const authService = require('../services/authService');

/**
 * Middleware to authenticate requests
 * Supports both Firebase ID tokens and JWT tokens
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization header provided'
      });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    let user = null;

    // Try Firebase token first
    try {
      const decodedToken = await authService.verifyToken(token);
      user = await authService.getUserById(decodedToken.uid);
    } catch (firebaseError) {
      // If Firebase token fails, try JWT
      try {
        const decoded = authService.verifyJWT(token);
        user = await authService.getUserById(decoded.userId);
      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    req.userId = user.uid || user.id;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      try {
        const decodedToken = await authService.verifyToken(token);
        const user = await authService.getUserById(decodedToken.uid);
        if (user) {
          req.user = user;
          req.userId = user.uid || user.id;
        }
      } catch (error) {
        // Ignore auth errors for optional auth
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth
};

