<<<<<<< HEAD
// ============================================================
// SERVER.JS  –  WatchTogether backend
// Handles: rooms · video sync · WebRTC signaling · chat
// ============================================================
'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors   = require('cors');
const path   = require('path');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
=======
'use strict';
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
>>>>>>> my-fix
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

<<<<<<< HEAD
// ---- In-memory rooms store ----
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      users: {},          // socketId → { id, username, avatar, inVoice }
      videoState: {
        url: '', videoType: 'direct',
        isPlaying: false, currentTime: 0, lastUpdated: Date.now(),
      },
      messages: [],
      screenSharer: null, // socketId of current screen sharer
      voiceUsers: new Set(), // socketIds currently in voice
    };
  }
  return rooms[roomId];
}

// ---- Routes ----
app.get('/',              (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:roomId',  (_, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

app.post('/api/create-room', (_, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  getRoom(roomId);
  res.json({ roomId, link: `/room/${roomId}` });
});

app.get('/api/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  res.json(room
    ? { exists: true, userCount: Object.keys(room.users).length, videoState: room.videoState }
    : { exists: false });
});

// ---- Socket.IO ----
io.on('connection', socket => {
  console.log(`✅ connect  ${socket.id}`);
  let currentRoom = null;

  // ── JOIN ──────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, username }) => {
    const room = getRoom(roomId);
    currentRoom = roomId;
    const user = { id: socket.id, username, avatar: pickAvatar(username), inVoice: false };
    room.users[socket.id] = user;
    socket.join(roomId);
    console.log(`👤 ${username} → ${roomId}`);

    // Tell joiner full state
    socket.emit('room-state', {
=======
const rooms = {};

function getRoom(id) {
  if (!rooms[id]) rooms[id] = {
    id,
    users: {},          // socketId → user object
    videoState: { url:'', videoType:'direct', isPlaying:false, currentTime:0 },
    messages: [],
    screenSharer: null,
    voiceUsers: new Set(),
  };
  return rooms[id];
}

const AVATARS = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬','🦈','🐙','🦝','🐯','🦩'];
const avatar  = n => AVATARS[n.charCodeAt(0) % AVATARS.length];

app.get('/',             (_, r) => r.sendFile(path.join(__dirname,'public','index.html')));
app.get('/room/:id',     (_, r) => r.sendFile(path.join(__dirname,'public','room.html')));
app.post('/api/create-room', (_, r) => {
  const id = uuidv4().slice(0,8).toUpperCase();
  getRoom(id);
  r.json({ roomId: id });
});
app.get('/api/room/:id', (req, r) => {
  const room = rooms[req.params.id];
  r.json(room ? { exists:true, userCount:Object.keys(room.users).length } : { exists:false });
});

io.on('connection', sock => {
  let roomId = null;

  sock.on('join-room', ({ roomId: rid, username }) => {
    roomId = rid;
    const room = getRoom(rid);
    const user = { id:sock.id, username, avatar:avatar(username), inVoice:false };
    room.users[sock.id] = user;
    sock.join(rid);

    sock.emit('room-state', {
>>>>>>> my-fix
      users:        Object.values(room.users),
      videoState:   room.videoState,
      messages:     room.messages.slice(-60),
      screenSharer: room.screenSharer,
      voiceUsers:   [...room.voiceUsers],
    });
<<<<<<< HEAD

    // Tell everyone else
    socket.to(roomId).emit('user-joined', user);
    io.to(roomId).emit('users-update', Object.values(room.users));
  });

  // ── VIDEO SYNC ────────────────────────────────────────────
  socket.on('video-load', ({ roomId, url, videoType }) => {
    const room = rooms[roomId]; if (!room) return;
    room.videoState = { url, videoType: videoType||'direct', isPlaying:false, currentTime:0, lastUpdated:Date.now() };
    io.to(roomId).emit('video-load', { url, videoType: room.videoState.videoType });
  });
  socket.on('video-play', ({ roomId, currentTime }) => {
    const room = rooms[roomId]; if (!room) return;
    room.videoState.isPlaying = true;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    socket.to(roomId).emit('video-play', { currentTime });
  });
  socket.on('video-pause', ({ roomId, currentTime }) => {
    const room = rooms[roomId]; if (!room) return;
    room.videoState.isPlaying = false;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    socket.to(roomId).emit('video-pause', { currentTime });
  });
  socket.on('video-seek', ({ roomId, currentTime }) => {
    const room = rooms[roomId]; if (!room) return;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    socket.to(roomId).emit('video-seek', { currentTime });
  });

  // ── SCREEN SHARE SIGNALING ────────────────────────────────
  socket.on('screen-share-start', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    room.screenSharer = socket.id;
    socket.to(roomId).emit('screen-share-started', {
      sharerId: socket.id,
      username: room.users[socket.id]?.username,
    });
  });
  socket.on('screen-share-stop', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    room.screenSharer = null;
    io.to(roomId).emit('screen-share-stopped');
  });
  socket.on('request-screen-share', ({ roomId, sharerId }) => {
    socket.to(sharerId).emit('viewer-joined', { viewerId: socket.id });
  });

  // Generic WebRTC relay (screen share uses these)
  socket.on('webrtc-offer',    ({ targetId, offer })     => socket.to(targetId).emit('webrtc-offer',    { offer,     fromId: socket.id }));
  socket.on('webrtc-answer',   ({ targetId, answer })    => socket.to(targetId).emit('webrtc-answer',   { answer,    fromId: socket.id }));
  socket.on('webrtc-ice',      ({ targetId, candidate }) => socket.to(targetId).emit('webrtc-ice',      { candidate, fromId: socket.id }));

  // ── VOICE SIGNALING ───────────────────────────────────────
  socket.on('voice-joined', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    room.voiceUsers.add(socket.id);
    if (room.users[socket.id]) room.users[socket.id].inVoice = true;
    // Send list of current voice users to joiner so they can connect to each
    socket.emit('voice-peers', { peers: [...room.voiceUsers].filter(id => id !== socket.id) });
    // Tell existing voice users that a new person joined
    socket.to(roomId).emit('new-voice-user', { userId: socket.id });
    io.to(roomId).emit('users-update', Object.values(room.users));
  });
  socket.on('voice-left', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    room.voiceUsers.delete(socket.id);
    if (room.users[socket.id]) room.users[socket.id].inVoice = false;
    socket.to(roomId).emit('voice-user-left', { userId: socket.id });
    io.to(roomId).emit('users-update', Object.values(room.users));
  });

  // Voice WebRTC relay (separate namespace from screen share to avoid mixing)
  socket.on('voice-offer',    ({ targetId, offer })     => socket.to(targetId).emit('voice-offer',    { offer,     fromId: socket.id }));
  socket.on('voice-answer',   ({ targetId, answer })    => socket.to(targetId).emit('voice-answer',   { answer,    fromId: socket.id }));
  socket.on('voice-ice',      ({ targetId, candidate }) => socket.to(targetId).emit('voice-ice',      { candidate, fromId: socket.id }));

  // ── CHAT ─────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId]; if (!room || !room.users[socket.id]) return;
    const msg = {
      id: uuidv4(),
      userId:   socket.id,
      username: room.users[socket.id].username,
      avatar:   room.users[socket.id].avatar,
      text:     message,
      timestamp: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    io.to(roomId).emit('chat-message', msg);
=======
    sock.to(rid).emit('user-joined', user);
    io.to(rid).emit('users-update', Object.values(room.users));
  });

  // ── video ──────────────────────────────────────────────────
  sock.on('video-load',  ({ roomId:r, url, videoType }) => {
    const room = rooms[r]; if (!room) return;
    room.videoState = { url, videoType:videoType||'direct', isPlaying:false, currentTime:0 };
    io.to(r).emit('video-load', { url, videoType: room.videoState.videoType });
  });
  sock.on('video-play',  ({ roomId:r, currentTime }) => {
    const room = rooms[r]; if (!room) return;
    room.videoState.isPlaying = true; room.videoState.currentTime = currentTime;
    sock.to(r).emit('video-play',  { currentTime });
  });
  sock.on('video-pause', ({ roomId:r, currentTime }) => {
    const room = rooms[r]; if (!room) return;
    room.videoState.isPlaying = false; room.videoState.currentTime = currentTime;
    sock.to(r).emit('video-pause', { currentTime });
  });
  sock.on('video-seek',  ({ roomId:r, currentTime }) => {
    const room = rooms[r]; if (!room) return;
    room.videoState.currentTime = currentTime;
    sock.to(r).emit('video-seek',  { currentTime });
  });

  // ── screen share ───────────────────────────────────────────
  sock.on('screen-start', ({ roomId:r }) => {
    const room = rooms[r]; if (!room) return;
    room.screenSharer = sock.id;
    sock.to(r).emit('screen-started', { sharerId:sock.id, username:room.users[sock.id]?.username });
  });
  sock.on('screen-stop', ({ roomId:r }) => {
    const room = rooms[r]; if (!room) return;
    room.screenSharer = null;
    io.to(r).emit('screen-stopped');
  });
  sock.on('screen-request', ({ roomId:r, sharerId }) => {
    sock.to(sharerId).emit('screen-viewer', { viewerId:sock.id });
  });

  // ── generic WebRTC relay (used by screen share) ────────────
  // Each message is addressed to exactly one peer — the server just forwards it.
  sock.on('rtc-offer',  ({ to, offer,  kind }) => sock.to(to).emit('rtc-offer',  { from:sock.id, offer,  kind }));
  sock.on('rtc-answer', ({ to, answer, kind }) => sock.to(to).emit('rtc-answer', { from:sock.id, answer, kind }));
  sock.on('rtc-ice',    ({ to, candidate, kind }) => sock.to(to).emit('rtc-ice', { from:sock.id, candidate, kind }));

  // ── voice ──────────────────────────────────────────────────
  sock.on('voice-join', ({ roomId:r }) => {
    const room = rooms[r]; if (!room) return;
    room.voiceUsers.add(sock.id);
    if (room.users[sock.id]) room.users[sock.id].inVoice = true;
    // Send back the list of peers already in voice so we can dial them
    sock.emit('voice-peers', { peers:[...room.voiceUsers].filter(id => id !== sock.id) });
    sock.to(r).emit('voice-new', { userId:sock.id });
    io.to(r).emit('users-update', Object.values(room.users));
  });
  sock.on('voice-leave', ({ roomId:r }) => {
    const room = rooms[r]; if (!room) return;
    room.voiceUsers.delete(sock.id);
    if (room.users[sock.id]) room.users[sock.id].inVoice = false;
    sock.to(r).emit('voice-gone', { userId:sock.id });
    io.to(r).emit('users-update', Object.values(room.users));
  });

  // ── chat ───────────────────────────────────────────────────
  sock.on('chat', ({ roomId:r, text }) => {
    const room = rooms[r]; if (!room || !room.users[sock.id]) return;
    const msg = { id:uuidv4(), userId:sock.id, username:room.users[sock.id].username,
                  avatar:room.users[sock.id].avatar, text, ts:Date.now() };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    io.to(r).emit('chat', msg);
>>>>>>> my-fix
  });
  sock.on('reaction', ({ roomId:r, emoji }) => { if(rooms[r]) io.to(r).emit('reaction', { emoji }); });

<<<<<<< HEAD
  socket.on('reaction', ({ roomId, emoji }) => {
    const room = rooms[roomId]; if (!room) return;
    io.to(roomId).emit('reaction', { emoji });
  });

  // ── DISCONNECT ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`❌ disconnect ${socket.id}`);
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];

    if (room.screenSharer === socket.id) {
      room.screenSharer = null;
      io.to(currentRoom).emit('screen-share-stopped');
    }
    room.voiceUsers.delete(socket.id);
    delete room.users[socket.id];
    io.to(currentRoom).emit('user-left', { id: socket.id });
    io.to(currentRoom).emit('users-update', Object.values(room.users));

    // Clean up empty rooms after 15 min
    if (Object.keys(room.users).length === 0) {
      setTimeout(() => {
        if (rooms[currentRoom] && Object.keys(rooms[currentRoom].users).length === 0) {
          delete rooms[currentRoom];
          console.log(`🗑️  Room ${currentRoom} deleted`);
        }
      }, 15 * 60 * 1000);
    }
  });
});

function pickAvatar(name) {
  const list = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬','🦈','🐙','🦝','🐯','🦩'];
  return list[name.charCodeAt(0) % list.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WatchTogether on http://localhost:${PORT}`));
=======
  // ── disconnect ─────────────────────────────────────────────
  sock.on('disconnect', () => {
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    if (room.screenSharer === sock.id) { room.screenSharer=null; io.to(roomId).emit('screen-stopped'); }
    room.voiceUsers.delete(sock.id);
    delete room.users[sock.id];
    io.to(roomId).emit('user-left',    { id:sock.id });
    io.to(roomId).emit('users-update', Object.values(room.users));
    if (Object.keys(room.users).length === 0)
      setTimeout(() => { if(rooms[roomId]&&!Object.keys(rooms[roomId].users).length) delete rooms[roomId]; }, 900_000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));
>>>>>>> my-fix
