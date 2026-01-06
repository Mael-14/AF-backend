const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config({ path: '.evn' });

const app = express();
const server = http.createServer(app);

// CORS configuration - Allow all origins for mobile testing
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
const corsConfig = corsOrigins.includes('*') 
  ? { 
      origin: true, // Allow all origins
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }
  : { 
      origin: corsOrigins, 
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };

// Initialize Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    ...corsConfig,
    methods: ['GET', 'POST'],
  }
});

// Middleware
app.use(cors(corsConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin
const firebaseService = require('./services/firebaseService');
firebaseService.initialize();

// Initialize default games
const gameService = require('./services/gameService');
gameService.initializeDefaultGames().catch(err => {
  console.error('Error initializing default games:', err);
});

// Routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const gameRoutes = require('./routes/games');
const friendRoutes = require('./routes/friends');
const sessionRoutes = require('./routes/sessions');

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/sessions', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Initialize WebSocket handlers
const socketHandler = require('./socket/socketHandler');
socketHandler.initialize(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 3000;

// Listen on all network interfaces (0.0.0.0) to allow connections from other devices
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Server accessible at:`);
  console.log(`   - http://localhost:${PORT}`);
  console.log(`   - http://127.0.0.1:${PORT}`);
  console.log(`   - http://172.20.10.11:${PORT}`);
  console.log(`   - http://[your-ip]:${PORT}`);
});

module.exports = { app, server, io };



