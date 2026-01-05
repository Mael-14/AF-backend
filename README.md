# AF Backend Server

Backend server for the AF game application built with Express.js, Firebase, and Socket.IO for real-time communication.

## Features

- 🔐 **Authentication**: Firebase Auth integration with JWT tokens
- 🎮 **Game Management**: CRUD operations for games
- 🏠 **Room Management**: Create, join, leave, and manage game rooms
- 👥 **Friend System**: Send/accept friend requests, manage friends list
- 💬 **Real-time Communication**: WebSocket support for live room updates
- 🗳️ **Voting System**: Real-time voting on questions
- 📝 **Answer Submission**: Players can submit answers in real-time
- 🔄 **Player Turn Management**: Host controls player turns

## Tech Stack

- **Express.js**: Web framework
- **Firebase Admin SDK**: Database and authentication
- **Socket.IO**: WebSocket for real-time communication
- **JWT**: Token-based authentication
- **Express Validator**: Request validation

## Prerequisites

- Node.js (v14 or higher)
- Firebase project with Firestore enabled
- Firebase service account credentials

## Installation

1. **Clone and navigate to the backend directory:**
   ```bash
   cd AF-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Firebase credentials:
   - Get your Firebase service account key from Firebase Console
   - Add all required environment variables

4. **Initialize default games (optional):**
   The server will automatically initialize default games on first run.

## Configuration

### Firebase Setup

1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key
3. Copy the credentials to your `.env` file

### Environment Variables

```env
PORT=3000
NODE_ENV=development

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_CLIENT_X509_CERT_URL=your-cert-url

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:19006,http://localhost:3000
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with Firebase ID token
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile

### Rooms
- `POST /api/rooms/create` - Create a new room
- `POST /api/rooms/join/:code` - Join room by code
- `POST /api/rooms/validate/:code` - Validate room code
- `GET /api/rooms/:roomId` - Get room details
- `POST /api/rooms/:roomId/leave` - Leave room
- `POST /api/rooms/:roomId/start` - Start room game
- `GET /api/rooms/user/my-rooms` - Get user's rooms

### Games
- `GET /api/games` - Get all games
- `GET /api/games/:gameId` - Get game by ID
- `GET /api/games/category/:category` - Get games by category

### Friends
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept/:requestId` - Accept friend request
- `GET /api/friends` - Get user's friends
- `GET /api/friends/requests` - Get pending requests
- `DELETE /api/friends/:friendshipId` - Remove friend

### Sessions
- `GET /api/sessions` - Get user's active sessions

## WebSocket Events

### Client → Server

- `join_room` - Join a room
  ```javascript
  socket.emit('join_room', { roomCode: 'ABC123' });
  ```

- `leave_room` - Leave a room
  ```javascript
  socket.emit('leave_room', { roomId: 'room-id' });
  ```

- `submit_answer` - Submit an answer
  ```javascript
  socket.emit('submit_answer', { 
    roomId: 'room-id', 
    answer: 'My answer', 
    questionId: 'question-id' 
  });
  ```

- `submit_vote` - Vote on a question
  ```javascript
  socket.emit('submit_vote', { 
    roomId: 'room-id', 
    questionId: 'question-id' 
  });
  ```

- `set_question` - Set current question (host only)
  ```javascript
  socket.emit('set_question', { 
    roomId: 'room-id', 
    question: { id: 'q1', text: 'Question text' } 
  });
  ```

- `set_player_turn` - Set player turn (host only)
  ```javascript
  socket.emit('set_player_turn', { 
    roomId: 'room-id', 
    playerId: 'user-id' 
  });
  ```

### Server → Client

- `room_state` - Current room state
- `player_joined` - Player joined notification
- `player_left` - Player left notification
- `answer_submitted` - Answer submitted notification
- `vote_update` - Vote count update
- `question_set` - Question set notification
- `player_turn_changed` - Player turn changed
- `error` - Error message

## Authentication

The API uses two authentication methods:

1. **Firebase ID Token**: Primary method for mobile apps
2. **JWT Token**: Generated after Firebase authentication

Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

For WebSocket connections, pass the token in the connection:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-token-here'
  }
});
```

## Project Structure

```
AF-backend/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env.example          # Environment variables template
├── middleware/
│   └── auth.js           # Authentication middleware
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── rooms.js          # Room management routes
│   ├── games.js          # Game routes
│   ├── friends.js        # Friend management routes
│   └── sessions.js       # Session routes
├── services/
│   ├── firebaseService.js # Firebase initialization
│   ├── authService.js     # Authentication service
│   ├── roomService.js     # Room management service
│   ├── gameService.js     # Game management service
│   └── friendService.js   # Friend management service
└── socket/
    └── socketHandler.js   # WebSocket event handlers
```

## Error Handling

All errors follow a consistent format:
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)"
}
```

## Development

### Adding New Features

1. Create service functions in `services/`
2. Create routes in `routes/`
3. Add WebSocket handlers in `socket/socketHandler.js` if needed
4. Update this README with new endpoints

### Testing

Currently, manual testing is recommended. Future updates may include automated tests.

## License

ISC

## Support

For issues and questions, please contact the development team.

