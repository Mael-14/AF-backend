const { getDb, getAuth, admin } = require('./firebaseService');
const jwt = require('jsonwebtoken');

const COLLECTIONS = {
  USERS: 'users'
};

/**
 * Verify Firebase ID token
 */
const verifyToken = async (idToken) => {
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Create or update user
 */
const createOrUpdateUser = async (firebaseUser) => {
  const db = getDb();
  const userRef = db.collection(COLLECTIONS.USERS).doc(firebaseUser.uid);

  const userData = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.name || firebaseUser.displayName || '',
    photoURL: firebaseUser.picture || firebaseUser.photoURL || '',
    username: firebaseUser.username || firebaseUser.email?.split('@')[0] || '',
    createdAt: firebaseUser.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const userDoc = await userRef.get();
  if (userDoc.exists) {
    // Update existing user
    await userRef.update({
      ...userData,
      createdAt: userDoc.data().createdAt // Preserve original creation date
    });
    return { id: userDoc.id, ...userDoc.data(), ...userData };
  } else {
    // Create new user
    await userRef.set(userData);
    return { id: userRef.id, ...userData };
  }
};

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  
  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
};

/**
 * Generate JWT token
 */
const generateJWT = (user) => {
  return jwt.sign(
    { 
      userId: user.uid || user.id,
      email: user.email 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Verify JWT token
 */
const verifyJWT = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Create user with email and password
 */
const createUserWithEmailPassword = async (email, password, displayName) => {
  try {
    const auth = getAuth();
    
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: displayName,
      emailVerified: false
    });

    // Create user document in Firestore
    const user = await createOrUpdateUser({
      uid: userRecord.uid,
      email: userRecord.email,
      name: displayName,
      displayName: displayName,
      username: email.split('@')[0],
      createdAt: new Date().toISOString()
    });

    return user;
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new Error('Email already registered');
    }
    if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    }
    if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    }
    throw new Error(error.message || 'Failed to create user');
  }
};

/**
 * Get user by email or username
 */
const getUserByEmailOrUsername = async (identifier) => {
  const db = getDb();
  
  // Try to find by email first
  let snapshot = await db.collection(COLLECTIONS.USERS)
    .where('email', '==', identifier)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Try to find by username
  snapshot = await db.collection(COLLECTIONS.USERS)
    .where('username', '==', identifier)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  return null;
};

/**
 * Verify email and password using Firebase REST API
 * This allows backend to verify passwords without client SDK
 */
const verifyEmailPassword = async (email, password) => {
  try {
    const { getAuth } = require('./firebaseService');
    const auth = getAuth();
    
    // Get user by email from Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        throw new Error('User not found');
      }
      throw error;
    }

    // Verify password using Firebase REST API
    // Use the API key from Firebase config (same as frontend)
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBH3MFZvV9af5Kyuc2bt86RuIW32wSJ7fw';
    
    // Use built-in fetch (Node.js 18+)
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || '';
      const errorCode = data.error?.code || 0;
      
      // Handle Firebase REST API error codes
      if (errorMessage.includes('INVALID_LOGIN_CREDENTIALS') || 
          errorMessage.includes('INVALID_PASSWORD') || 
          errorMessage.includes('wrong-password') ||
          errorCode === 400) {
        throw new Error('Invalid email or password');
      }
      if (errorMessage.includes('EMAIL_NOT_FOUND') || 
          errorMessage.includes('user-not-found') ||
          errorCode === 400) {
        throw new Error('User not found');
      }
      // Log the actual error for debugging
      console.error('Firebase Auth Error:', {
        message: errorMessage,
        code: errorCode,
        fullError: data.error
      });
      throw new Error(errorMessage || 'Authentication failed');
    }

    // Return user record
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      emailVerified: userRecord.emailVerified
    };
  } catch (error) {
    // Re-throw known errors
    if (error.message === 'User not found' || 
        error.message === 'Invalid password' ||
        error.message === 'Invalid email or password') {
      throw error;
    }
    
    // Log unexpected errors for debugging
    console.error('verifyEmailPassword error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Provide user-friendly error message
    if (error.message && error.message.includes('INVALID_LOGIN_CREDENTIALS')) {
      throw new Error('Invalid email or password');
    }
    
    throw new Error(error.message || 'Authentication failed');
  }
};

module.exports = {
  verifyToken,
  createOrUpdateUser,
  getUserById,
  generateJWT,
  verifyJWT,
  createUserWithEmailPassword,
  getUserByEmailOrUsername,
  verifyEmailPassword
};

