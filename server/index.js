require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const apiRoutes = require('./routes/api');
const { setupSocketIO } = require('./socket/handlers');
const { startCleanupJob } = require('./jobs/cleanup');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible in route handlers
app.set('io', io);

// ─── Static Files ─────────────────────────────────────────────────────────────
// Serve the public frontend
app.use(express.static(path.join(__dirname, '../public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── SPA Fallback Routes ──────────────────────────────────────────────────────
// Printer dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Student upload page (PWA)
app.get('/upload/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});

// Root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
setupSocketIO(io);

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/printstation';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');

    // Start cleanup cron job after DB is ready
    startCleanupJob();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 PrintStation server running on http://localhost:${PORT}`);
      console.log(`📋 Dashboard: http://localhost:${PORT}/dashboard`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

module.exports = app;