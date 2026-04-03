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
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      users:        Object.values(room.users),
      videoState:   room.videoState,
      messages:     room.messages.slice(-60),
      screenSharer: room.screenSharer,
      voiceUsers:   [...room.voiceUsers],
    });
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
  });
  sock.on('reaction', ({ roomId:r, emoji }) => { if(rooms[r]) io.to(r).emit('reaction', { emoji }); });

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