'use strict';
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const crypto  = require('crypto'); // built-in Node.js — no npm install needed
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: make a random ID without any npm package
function makeId(len) {
  return crypto.randomBytes(len).toString('hex').slice(0, len).toUpperCase();
}
function makeMsgId() {
  return crypto.randomBytes(8).toString('hex');
}

// ── Routes ────────────────────────────────────────────────────
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:id', (_, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

// Create room — POST /create  →  { id: "AB12CD34" }
app.post('/create', (req, res) => {
  try {
    const id = makeId(8);
    res.json({ id });
  } catch (e) {
    console.error('create error', e);
    res.status(500).json({ error: 'failed' });
  }
});

// ── In-memory rooms ───────────────────────────────────────────
const rooms = {};

function getRoom(id) {
  if (!rooms[id]) {
    rooms[id] = {
      users:    {},
      video:    { url: '', type: 'direct', playing: false, time: 0 },
      msgs:     [],
      sharer:   null,
      voiceSet: new Set(),
    };
  }
  return rooms[id];
}

const AVATARS = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬'];

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connection', socket => {
  let rid = null;

  socket.on('join', ({ roomId, name }) => {
    rid = roomId;
    const room = getRoom(rid);
    const user = {
      id:   socket.id,
      name: String(name).slice(0, 30),
      av:   AVATARS[name.charCodeAt(0) % AVATARS.length],
    };
    room.users[socket.id] = user;
    socket.join(rid);

    socket.emit('init', {
      me:         socket.id,
      users:      Object.values(room.users),
      video:      room.video,
      msgs:       room.msgs.slice(-50),
      sharer:     room.sharer,
      voiceUsers: [...room.voiceSet],
    });
    socket.to(rid).emit('user-joined', user);
    io.to(rid).emit('users', Object.values(room.users));
  });

  // Video sync
  socket.on('v-load', d => {
    const r = rooms[rid]; if (!r) return;
    r.video = { url: d.url, type: d.vtype || 'direct', playing: false, time: 0 };
    io.to(rid).emit('v-load', d);
  });
  socket.on('v-play',  d => { const r = rooms[rid]; if (!r) return; r.video.playing = true;  r.video.time = d.time; socket.to(rid).emit('v-play',  d); });
  socket.on('v-pause', d => { const r = rooms[rid]; if (!r) return; r.video.playing = false; r.video.time = d.time; socket.to(rid).emit('v-pause', d); });
  socket.on('v-seek',  d => { const r = rooms[rid]; if (!r) return; r.video.time = d.time;                         socket.to(rid).emit('v-seek',  d); });

  // Screen share
  socket.on('scr-start', () => {
    const r = rooms[rid]; if (!r) return;
    r.sharer = socket.id;
    socket.to(rid).emit('scr-started', { sharerId: socket.id, name: r.users[socket.id]?.name });
  });
  socket.on('scr-stop', () => {
    const r = rooms[rid]; if (!r) return;
    r.sharer = null;
    io.to(rid).emit('scr-stopped');
  });
  socket.on('scr-request', ({ sharerId }) => {
    socket.to(sharerId).emit('scr-viewer', { viewerId: socket.id });
  });

  // WebRTC relay — server never reads SDP/ICE content, just forwards
  socket.on('signal', ({ to, kind, data }) => {
    socket.to(to).emit('signal', { from: socket.id, kind, data });
  });

  // Voice presence
  socket.on('voice-join', () => {
    const r = rooms[rid]; if (!r) return;
    r.voiceSet.add(socket.id);
    socket.emit('voice-peers', { peers: [...r.voiceSet].filter(x => x !== socket.id) });
    socket.to(rid).emit('voice-new', { id: socket.id });
  });
  socket.on('voice-leave', () => {
    const r = rooms[rid]; if (!r) return;
    r.voiceSet.delete(socket.id);
    socket.to(rid).emit('voice-gone', { id: socket.id });
  });

  // Chat
  socket.on('msg', ({ text }) => {
    const r = rooms[rid]; if (!r || !r.users[socket.id]) return;
    const u = r.users[socket.id];
    const m = {
      id:   makeMsgId(),
      uid:  socket.id,
      name: u.name,
      av:   u.av,
      text: String(text).slice(0, 300),
      t:    Date.now(),
    };
    r.msgs.push(m);
    if (r.msgs.length > 200) r.msgs.shift();
    io.to(rid).emit('msg', m);
  });

  socket.on('rx', ({ emoji }) => {
    if (rooms[rid]) io.to(rid).emit('rx', { emoji });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!rid || !rooms[rid]) return;
    const r = rooms[rid];
    if (r.sharer === socket.id) { r.sharer = null; io.to(rid).emit('scr-stopped'); }
    r.voiceSet.delete(socket.id);
    delete r.users[socket.id];
    io.to(rid).emit('user-left', { id: socket.id });
    io.to(rid).emit('users', Object.values(r.users));
    // Clean up empty rooms after 10 minutes
    if (!Object.keys(r.users).length) {
      setTimeout(() => {
        if (rooms[rid] && !Object.keys(rooms[rid].users).length) delete rooms[rid];
      }, 600000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('✅ WatchTogether running at http://localhost:' + PORT));