const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve room page
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ✅ CREATE ROOM (FIXED)
app.post('/create', (req, res) => {
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  res.json({ id: roomId });
});

// ---------- SOCKET.IO (REAL-TIME FEATURES) ----------
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      users: {},
      video: { url: '', type: 'direct', playing: false, time: 0 },
      msgs: [],
      sharer: null,
      voiceSet: new Set()
    };
  }
  return rooms[roomId];
}

const AVATARS = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬'];

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({ roomId, name }) => {
    currentRoom = roomId;
    const room = getRoom(roomId);
    const user = {
      id: socket.id,
      name: name,
      av: AVATARS[name.charCodeAt(0) % AVATARS.length]
    };
    room.users[socket.id] = user;
    socket.join(roomId);

    socket.emit('init', {
      me: socket.id,
      users: Object.values(room.users),
      video: room.video,
      msgs: room.msgs.slice(-50),
      sharer: room.sharer,
      voiceUsers: [...room.voiceSet]
    });

    socket.to(roomId).emit('user-joined', user);
    io.to(roomId).emit('users', Object.values(room.users));
  });

  // Video sync events
  socket.on('v-load', (data) => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.video = { url: data.url, type: data.vtype, playing: false, time: 0 };
    io.to(currentRoom).emit('v-load', data);
  });

  socket.on('v-play', (data) => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.video.playing = true;
    room.video.time = data.time;
    socket.to(currentRoom).emit('v-play', data);
  });

  socket.on('v-pause', (data) => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.video.playing = false;
    room.video.time = data.time;
    socket.to(currentRoom).emit('v-pause', data);
  });

  socket.on('v-seek', (data) => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.video.time = data.time;
    socket.to(currentRoom).emit('v-seek', data);
  });

  // Screen sharing
  socket.on('scr-start', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.sharer = socket.id;
    socket.to(currentRoom).emit('scr-started', {
      sharerId: socket.id,
      name: room.users[socket.id]?.name
    });
  });

  socket.on('scr-stop', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.sharer = null;
    io.to(currentRoom).emit('scr-stopped');
  });

  socket.on('scr-request', ({ sharerId }) => {
    socket.to(sharerId).emit('scr-viewer', { viewerId: socket.id });
  });

  // WebRTC signaling
  socket.on('signal', ({ to, kind, data }) => {
    socket.to(to).emit('signal', { from: socket.id, kind, data });
  });

  // Voice chat
  socket.on('voice-join', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.voiceSet.add(socket.id);
    socket.emit('voice-peers', {
      peers: [...room.voiceSet].filter(id => id !== socket.id)
    });
    socket.to(currentRoom).emit('voice-new', { id: socket.id });
  });

  socket.on('voice-leave', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    room.voiceSet.delete(socket.id);
    socket.to(currentRoom).emit('voice-gone', { id: socket.id });
  });

  // Chat messages
  socket.on('msg', ({ text }) => {
    const room = rooms[currentRoom];
    if (!room || !room.users[socket.id]) return;
    const user = room.users[socket.id];
    const message = {
      id: uuidv4(),
      uid: socket.id,
      name: user.name,
      av: user.av,
      text: text,
      t: Date.now()
    };
    room.msgs.push(message);
    if (room.msgs.length > 200) room.msgs.shift();
    io.to(currentRoom).emit('msg', message);
  });

  socket.on('rx', ({ emoji }) => {
    if (rooms[currentRoom]) {
      io.to(currentRoom).emit('rx', { emoji });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];

    if (room.sharer === socket.id) {
      room.sharer = null;
      io.to(currentRoom).emit('scr-stopped');
    }

    room.voiceSet.delete(socket.id);
    delete room.users[socket.id];

    io.to(currentRoom).emit('user-left', { id: socket.id });
    io.to(currentRoom).emit('users', Object.values(room.users));

    // Clean up empty rooms after 10 minutes
    if (Object.keys(room.users).length === 0) {
      setTimeout(() => {
        if (rooms[currentRoom] && Object.keys(rooms[currentRoom].users).length === 0) {
          delete rooms[currentRoom];
        }
      }, 600000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving static files from /public`);
});