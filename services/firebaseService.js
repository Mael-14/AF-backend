const admin = require('firebase-admin');

let db = null;
let initialized = false;

const initialize = () => {
  if (initialized) {
    return db;
  }

  try {
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      // Option 1: Use service account JSON file
      // const serviceAccount = require('../firebase-service-account.json');
      // admin.initializeApp({
      //   credential: admin.credential.cert(serviceAccount)
      // });

      // Option 2: Use environment variables (recommended for production)
      const projectId = process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, '');
      
      if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID environment variable is required');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          clientId: process.env.FIREBASE_CLIENT_ID,
          authUri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
          tokenUri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
          authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
          clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL
        })
      });
    }

    db = admin.firestore();
    initialized = true;
    console.log('✅ Firebase Admin initialized successfully');
    return db;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
  }
};

const getDb = () => {
  if (!initialized) {
    initialize();
  }
  return db;
};

const getAuth = () => {
  if (!initialized) {
    initialize();
  }
  return admin.auth();
};

module.exports = {
  initialize,
  getDb,
  getAuth,
  admin
};

