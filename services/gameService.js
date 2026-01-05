const { getDb } = require('./firebaseService');

const COLLECTIONS = {
  GAMES: 'games'
};

/**
 * Get all games
 */
const getAllGames = async () => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.GAMES)
    .orderBy('name', 'asc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get game by ID
 */
const getGameById = async (gameId) => {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.GAMES).doc(gameId).get();
  
  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
};

/**
 * Get games by category
 */
const getGamesByCategory = async (category) => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.GAMES)
    .where('category', '==', category)
    .orderBy('name', 'asc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Create a game (admin function)
 */
const createGame = async (gameData) => {
  const db = getDb();
  const game = {
    name: gameData.name,
    description: gameData.description,
    category: gameData.category,
    minPlayers: parseInt(gameData.minPlayers) || 2,
    maxPlayers: parseInt(gameData.maxPlayers) || 10,
    questions: gameData.questions || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await db.collection(COLLECTIONS.GAMES).add(game);
  return { id: docRef.id, ...game };
};

/**
 * Initialize default games
 */
const initializeDefaultGames = async () => {
  const db = getDb();
  const defaultGames = [
    {
      name: 'Never Have I Ever',
      description: 'Classic party game where players reveal things they have never done',
      category: 'Confession',
      minPlayers: 3,
      maxPlayers: 10,
      questions: [
        {
          id: 'nhie1',
          text: 'Never have I ever traveled to another country',
          difficulty: 'easy'
        },
        {
          id: 'nhie2',
          text: 'Never have I ever stayed up all night',
          difficulty: 'easy'
        },
        {
          id: 'nhie3',
          text: 'Never have I ever broken a bone',
          difficulty: 'medium'
        },
        {
          id: 'nhie4',
          text: 'Never have I ever been on a roller coaster',
          difficulty: 'medium'
        },
        {
          id: 'nhie5',
          text: 'Never have I ever gone skydiving',
          difficulty: 'hard'
        }
      ]
    },
    {
      name: 'Truth or Dare',
      description: 'Answer truthfully or take a dare',
      category: 'Dare',
      minPlayers: 4,
      maxPlayers: 8,
      questions: [
        {
          id: 'tod1',
          type: 'truth',
          text: 'What is your biggest fear?',
          difficulty: 'medium'
        },
        {
          id: 'tod2',
          type: 'dare',
          text: 'Do your best impression of someone in the room',
          difficulty: 'easy'
        },
        {
          id: 'tod3',
          type: 'truth',
          text: 'What is the most embarrassing thing that has happened to you?',
          difficulty: 'hard'
        },
        {
          id: 'tod4',
          type: 'dare',
          text: 'Sing a song chosen by the group',
          difficulty: 'medium'
        },
        {
          id: 'tod5',
          type: 'truth',
          text: 'Who was your first crush?',
          difficulty: 'easy'
        }
      ]
    },
    {
      name: 'Would You Rather',
      description: 'Choose between two options',
      category: 'Choice',
      minPlayers: 2,
      maxPlayers: 10,
      questions: [
        {
          id: 'wyr1',
          text: 'Would you rather have the ability to fly or be invisible?',
          optionA: 'Fly',
          optionB: 'Be invisible',
          difficulty: 'easy'
        },
        {
          id: 'wyr2',
          text: 'Would you rather always be 10 minutes late or always be 20 minutes early?',
          optionA: '10 minutes late',
          optionB: '20 minutes early',
          difficulty: 'easy'
        },
        {
          id: 'wyr3',
          text: 'Would you rather have unlimited money or unlimited time?',
          optionA: 'Unlimited money',
          optionB: 'Unlimited time',
          difficulty: 'medium'
        },
        {
          id: 'wyr4',
          text: 'Would you rather be able to read minds or see the future?',
          optionA: 'Read minds',
          optionB: 'See the future',
          difficulty: 'medium'
        },
        {
          id: 'wyr5',
          text: 'Would you rather live without internet or without air conditioning?',
          optionA: 'Without internet',
          optionB: 'Without air conditioning',
          difficulty: 'hard'
        }
      ]
    },
    {
      name: 'Charades',
      description: 'Act out words silently',
      category: 'Action',
      minPlayers: 4,
      maxPlayers: 12,
      questions: [
        {
          id: 'char1',
          text: 'Movie: The Lion King',
          category: 'movie',
          difficulty: 'easy'
        },
        {
          id: 'char2',
          text: 'Action: Brushing teeth',
          category: 'action',
          difficulty: 'easy'
        },
        {
          id: 'char3',
          text: 'Animal: Elephant',
          category: 'animal',
          difficulty: 'medium'
        },
        {
          id: 'char4',
          text: 'Movie: Titanic',
          category: 'movie',
          difficulty: 'medium'
        },
        {
          id: 'char5',
          text: 'Action: Playing basketball',
          category: 'action',
          difficulty: 'hard'
        }
      ]
    },
    {
      name: 'Two Truths and a Lie',
      description: 'Guess which statement is false',
      category: 'Mystery',
      minPlayers: 3,
      maxPlayers: 8,
      questions: [
        {
          id: 'ttal1',
          text: 'Example template: "I have been to 5 countries, I can speak 3 languages, I have never been on a plane"',
          hint: 'Players create their own - this is a template',
          difficulty: 'easy'
        },
        {
          id: 'ttal2',
          text: 'Example template: "I have a pet, I love spicy food, I am afraid of heights"',
          hint: 'Players create their own - this is a template',
          difficulty: 'easy'
        },
        {
          id: 'ttal3',
          text: 'Example template: "I can play piano, I have a twin, I have never broken a bone"',
          hint: 'Players create their own - this is a template',
          difficulty: 'medium'
        },
        {
          id: 'ttal4',
          text: 'Example template: "I have met a celebrity, I can solve a Rubik\'s cube, I have never been to a concert"',
          hint: 'Players create their own - this is a template',
          difficulty: 'medium'
        },
        {
          id: 'ttal5',
          text: 'Example template: "I have been skydiving, I can speak 5 languages, I have never been to a beach"',
          hint: 'Players create their own - this is a template',
          difficulty: 'hard'
        }
      ]
    }
  ];

  const snapshot = await db.collection(COLLECTIONS.GAMES).get();
  
  if (snapshot.empty) {
    // Create new games with questions
    const batch = db.batch();
    defaultGames.forEach(game => {
      const docRef = db.collection(COLLECTIONS.GAMES).doc();
      batch.set(docRef, {
        ...game,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
    await batch.commit();
    console.log('✅ Default games initialized with questions');
  } else {
    // Update existing games that don't have questions
    const updateBatch = db.batch();
    let updatedCount = 0;
    
    for (const defaultGame of defaultGames) {
      // Find existing game by name
      const existingGame = snapshot.docs.find(doc => doc.data().name === defaultGame.name);
      
      if (existingGame) {
        const existingData = existingGame.data();
        // Only update if questions array is empty or missing
        if (!existingData.questions || existingData.questions.length === 0) {
          updateBatch.update(existingGame.ref, {
            questions: defaultGame.questions,
            updatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      } else {
        // Game doesn't exist, create it
        const docRef = db.collection(COLLECTIONS.GAMES).doc();
        updateBatch.set(docRef, {
          ...defaultGame,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      await updateBatch.commit();
      console.log(`✅ Updated ${updatedCount} games with questions`);
    } else {
      console.log('✅ All games already have questions');
    }
  }
};

/**
 * Force update all games with default questions
 * Useful for updating existing games or resetting questions
 */
const forceUpdateGameQuestions = async () => {
  const db = getDb();
  const defaultGames = [
    {
      name: 'Never Have I Ever',
      questions: [
        { id: 'nhie1', text: 'Never have I ever traveled to another country', difficulty: 'easy' },
        { id: 'nhie2', text: 'Never have I ever stayed up all night', difficulty: 'easy' },
        { id: 'nhie3', text: 'Never have I ever broken a bone', difficulty: 'medium' },
        { id: 'nhie4', text: 'Never have I ever been on a roller coaster', difficulty: 'medium' },
        { id: 'nhie5', text: 'Never have I ever gone skydiving', difficulty: 'hard' }
      ]
    },
    {
      name: 'Truth or Dare',
      questions: [
        { id: 'tod1', type: 'truth', text: 'What is your biggest fear?', difficulty: 'medium' },
        { id: 'tod2', type: 'dare', text: 'Do your best impression of someone in the room', difficulty: 'easy' },
        { id: 'tod3', type: 'truth', text: 'What is the most embarrassing thing that has happened to you?', difficulty: 'hard' },
        { id: 'tod4', type: 'dare', text: 'Sing a song chosen by the group', difficulty: 'medium' },
        { id: 'tod5', type: 'truth', text: 'Who was your first crush?', difficulty: 'easy' }
      ]
    },
    {
      name: 'Would You Rather',
      questions: [
        { id: 'wyr1', text: 'Would you rather have the ability to fly or be invisible?', optionA: 'Fly', optionB: 'Be invisible', difficulty: 'easy' },
        { id: 'wyr2', text: 'Would you rather always be 10 minutes late or always be 20 minutes early?', optionA: '10 minutes late', optionB: '20 minutes early', difficulty: 'easy' },
        { id: 'wyr3', text: 'Would you rather have unlimited money or unlimited time?', optionA: 'Unlimited money', optionB: 'Unlimited time', difficulty: 'medium' },
        { id: 'wyr4', text: 'Would you rather be able to read minds or see the future?', optionA: 'Read minds', optionB: 'See the future', difficulty: 'medium' },
        { id: 'wyr5', text: 'Would you rather live without internet or without air conditioning?', optionA: 'Without internet', optionB: 'Without air conditioning', difficulty: 'hard' }
      ]
    },
    {
      name: 'Charades',
      questions: [
        { id: 'char1', text: 'Movie: The Lion King', category: 'movie', difficulty: 'easy' },
        { id: 'char2', text: 'Action: Brushing teeth', category: 'action', difficulty: 'easy' },
        { id: 'char3', text: 'Animal: Elephant', category: 'animal', difficulty: 'medium' },
        { id: 'char4', text: 'Movie: Titanic', category: 'movie', difficulty: 'medium' },
        { id: 'char5', text: 'Action: Playing basketball', category: 'action', difficulty: 'hard' }
      ]
    },
    {
      name: 'Two Truths and a Lie',
      questions: [
        { id: 'ttal1', text: 'Example template: "I have been to 5 countries, I can speak 3 languages, I have never been on a plane"', hint: 'Players create their own - this is a template', difficulty: 'easy' },
        { id: 'ttal2', text: 'Example template: "I have a pet, I love spicy food, I am afraid of heights"', hint: 'Players create their own - this is a template', difficulty: 'easy' },
        { id: 'ttal3', text: 'Example template: "I can play piano, I have a twin, I have never broken a bone"', hint: 'Players create their own - this is a template', difficulty: 'medium' },
        { id: 'ttal4', text: 'Example template: "I have met a celebrity, I can solve a Rubik\'s cube, I have never been to a concert"', hint: 'Players create their own - this is a template', difficulty: 'medium' },
        { id: 'ttal5', text: 'Example template: "I have been skydiving, I can speak 5 languages, I have never been to a beach"', hint: 'Players create their own - this is a template', difficulty: 'hard' }
      ]
    }
  ];

  const snapshot = await db.collection(COLLECTIONS.GAMES).get();
  const batch = db.batch();
  let updatedCount = 0;

  for (const defaultGame of defaultGames) {
    const existingGame = snapshot.docs.find(doc => doc.data().name === defaultGame.name);
    
    if (existingGame) {
      batch.update(existingGame.ref, {
        questions: defaultGame.questions,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await batch.commit();
    return { success: true, updated: updatedCount };
  }

  return { success: true, updated: 0, message: 'No games found to update' };
};

module.exports = {
  getAllGames,
  getGameById,
  getGamesByCategory,
  createGame,
  initializeDefaultGames,
  forceUpdateGameQuestions
};

