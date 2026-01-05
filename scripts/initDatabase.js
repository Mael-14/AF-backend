/**
 * Database Initialization Script
 * 
 * This script initializes the Firestore database with:
 * - Default games
 * - Required indexes (via console instructions)
 * - Sample data (optional)
 * 
 * Usage: node scripts/initDatabase.js
 */

require('dotenv').config({ path: '.evn' });
const { getDb } = require('../services/firebaseService');
const gameService = require('../services/gameService');

async function initializeDatabase() {
  try {
    console.log('🚀 Starting database initialization...\n');

    // Initialize Firebase
    const db = getDb();
    console.log('✅ Firebase connection established\n');

    // Initialize default games
    console.log('📦 Initializing default games...');
    await gameService.initializeDefaultGames();
    
    // Force update questions to ensure all games have them
    console.log('📝 Updating games with questions...');
    const updateResult = await gameService.forceUpdateGameQuestions();
    if (updateResult.updated > 0) {
      console.log(`✅ Updated ${updateResult.updated} games with questions\n`);
    } else {
      console.log('✅ All games already have questions\n');
    }

    // Verify games were created
    const games = await gameService.getAllGames();
    console.log(`✅ Found ${games.length} games in database:`);
    games.forEach(game => {
      console.log(`   - ${game.name} (${game.category})`);
    });
    console.log('');

    // Check collections
    console.log('📊 Checking collections...');
    const collections = ['users', 'rooms', 'games', 'friendships'];
    
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).limit(1).get();
      const count = snapshot.size;
      console.log(`   - ${collectionName}: ${count > 0 ? '✅ exists' : '⚠️  empty (normal for new database)'}`);
    }
    console.log('');

    console.log('✅ Database initialization complete!\n');
    console.log('📝 Next steps:');
    console.log('   1. Go to Firebase Console → Firestore → Indexes');
    console.log('   2. Create the required composite indexes (see DATABASE_SETUP.md)');
    console.log('   3. Update Firestore security rules (see DATABASE_SETUP.md)');
    console.log('   4. Test your API endpoints\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run initialization
initializeDatabase();

