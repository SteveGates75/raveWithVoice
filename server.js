'use strict';
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const crypto   = require('crypto'); // built-in, no install needed
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// --- helpers ---
const randId = (n) => crypto.randomBytes(n).toString('hex').toUpperCase().slice(0, n * 2);

// --- rooms store ---
// rooms[roomId] = { users: {socketId: {id,name}}, messages: [] }
const rooms = {};

function getRoom(id) {
  if (!rooms[id]) rooms[id] = { users: {}, messages: [] };
  return rooms[id];
}

// --- HTTP routes ---
// POST /room  → create room, return { roomId }
app.post('/room', (req, res) => {
  const roomId = randId(4); // 8 hex chars e.g. "A1B2C3D4"
  getRoom(roomId);
  console.log('Room created:', roomId);
  res.json({ roomId });
});

// Serve room page
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Serve home page and static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  let roomId = null;
  let userName = null;

  // User joins a room
  socket.on('join', ({ room, name }) => {
    roomId   = room;
    userName = name;
    const r  = getRoom(roomId);
    r.users[socket.id] = { id: socket.id, name };
    socket.join(roomId);

    // Tell this user who else is here
    socket.emit('room-users', Object.values(r.users));
    // Tell everyone else a new user arrived
    socket.to(roomId).emit('user-joined', { id: socket.id, name });
    // Send chat history
    socket.emit('chat-history', r.messages);

    console.log(`${name} joined room ${roomId}`);
  });

  // --- WebRTC signaling (screen share + voice) ---
  // Server is a pure relay — it never reads the SDP content
  socket.on('signal', ({ to, data }) => {
    socket.to(to).emit('signal', { from: socket.id, data });
  });

  // Screen share started — tell everyone in room
  socket.on('share-start', () => {
    socket.to(roomId).emit('share-start', { from: socket.id, name: userName });
  });

  // Screen share stopped
  socket.on('share-stop', () => {
    socket.to(roomId).emit('share-stop', { from: socket.id });
  });

  // Voice started
  socket.on('voice-start', () => {
    socket.to(roomId).emit('voice-start', { from: socket.id, name: userName });
  });

  // Voice stopped
  socket.on('voice-stop', () => {
    socket.to(roomId).emit('voice-stop', { from: socket.id });
  });

  // Chat message
  socket.on('chat', ({ text }) => {
    if (!roomId) return;
    const r = rooms[roomId];
    if (!r) return;
    const msg = {
      id:   crypto.randomBytes(4).toString('hex'),
      name: userName,
      text: String(text).slice(0, 500),
      time: Date.now(),
    };
    r.messages.push(msg);
    if (r.messages.length > 200) r.messages.shift();
    io.to(roomId).emit('chat', msg);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!roomId || !rooms[roomId]) return;
    const r = rooms[roomId];
    delete r.users[socket.id];
    io.to(roomId).emit('user-left', { id: socket.id, name: userName });
    // Clean up empty rooms after 1 hour
    if (Object.keys(r.users).length === 0) {
      setTimeout(() => {
        if (rooms[roomId] && Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
          console.log('Room deleted:', roomId);
        }
      }, 3600000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Server running → http://localhost:${PORT}\n`);
});