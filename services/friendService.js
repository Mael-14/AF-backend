const { getDb } = require('./firebaseService');

const COLLECTIONS = {
  USERS: 'users',
  FRIENDSHIPS: 'friendships'
};

/**
 * Send friend request
 */
const sendFriendRequest = async (fromUserId, toUserId) => {
  const db = getDb();
  
  // Check if friendship already exists
  const existing = await db.collection(COLLECTIONS.FRIENDSHIPS)
    .where('users', 'array-contains', fromUserId)
    .get();

  const friendshipExists = existing.docs.some(doc => {
    const data = doc.data();
    return data.users.includes(toUserId);
  });

  if (friendshipExists) {
    throw new Error('Friendship already exists');
  }

  // Create friend request
  const friendship = {
    users: [fromUserId, toUserId],
    status: 'pending', // pending, accepted, blocked
    requestedBy: fromUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await db.collection(COLLECTIONS.FRIENDSHIPS).add(friendship);
  return { id: docRef.id, ...friendship };
};

/**
 * Accept friend request
 */
const acceptFriendRequest = async (friendshipId, userId) => {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.FRIENDSHIPS).doc(friendshipId).get();
  
  if (!doc.exists) {
    throw new Error('Friend request not found');
  }

  const friendship = doc.data();
  if (!friendship.users.includes(userId)) {
    throw new Error('Unauthorized');
  }

  if (friendship.status !== 'pending') {
    throw new Error('Friend request already processed');
  }

  await db.collection(COLLECTIONS.FRIENDSHIPS).doc(friendshipId).update({
    status: 'accepted',
    updatedAt: new Date().toISOString()
  });

  return { id: doc.id, ...friendship, status: 'accepted' };
};

/**
 * Get user's friends
 */
const getUserFriends = async (userId) => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.FRIENDSHIPS)
    .where('users', 'array-contains', userId)
    .where('status', '==', 'accepted')
    .get();

  const friendships = snapshot.docs.map(doc => doc.data());
  const friendIds = friendships
    .map(f => f.users.find(id => id !== userId))
    .filter(Boolean);

  if (friendIds.length === 0) {
    return [];
  }

  // Get friend user details
  const admin = require('firebase-admin');
  const usersSnapshot = await db.collection(COLLECTIONS.USERS)
    .where(admin.firestore.FieldPath.documentId(), 'in', friendIds)
    .get();

  return usersSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Get pending friend requests
 */
const getPendingRequests = async (userId) => {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.FRIENDSHIPS)
    .where('users', 'array-contains', userId)
    .where('status', '==', 'pending')
    .where('requestedBy', '!=', userId)
    .get();

  const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const requesterIds = requests.map(r => r.requestedBy);

  if (requesterIds.length === 0) {
    return [];
  }

  // Get requester user details
  const admin = require('firebase-admin');
  const usersSnapshot = await db.collection(COLLECTIONS.USERS)
    .where(admin.firestore.FieldPath.documentId(), 'in', requesterIds)
    .get();

  return usersSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    requestId: requests.find(r => r.requestedBy === doc.id)?.id
  }));
};

/**
 * Remove friend
 */
const removeFriend = async (friendshipId, userId) => {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.FRIENDSHIPS).doc(friendshipId).get();
  
  if (!doc.exists) {
    throw new Error('Friendship not found');
  }

  const friendship = doc.data();
  if (!friendship.users.includes(userId)) {
    throw new Error('Unauthorized');
  }

  await db.collection(COLLECTIONS.FRIENDSHIPS).doc(friendshipId).delete();
  return { success: true };
};

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  getUserFriends,
  getPendingRequests,
  removeFriend
};

