'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:id', (_, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.post('/create', (_, res) => {
  const id = uuidv4().slice(0, 8).toUpperCase();
  res.json({ id });
});

const rooms = {};
function getRoom(id) {
  if (!rooms[id]) rooms[id] = {
    users: {},
    video: { url: '', type: 'direct', playing: false, time: 0 },
    msgs: [],
    sharer: null,
    voiceSet: new Set()
  };
  return rooms[id];
}
const AVATARS = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬'];

io.on('connection', socket => {
  let rid = null;

  socket.on('join', ({ roomId, name }) => {
    rid = roomId;
    const room = getRoom(rid);
    const user = { id: socket.id, name, av: AVATARS[name.charCodeAt(0) % AVATARS.length] };
    room.users[socket.id] = user;
    socket.join(rid);
    socket.emit('init', {
      me: socket.id,
      users: Object.values(room.users),
      video: room.video,
      msgs: room.msgs.slice(-50),
      sharer: room.sharer,
      voiceUsers: [...room.voiceSet],
    });
    socket.to(rid).emit('user-joined', user);
    io.to(rid).emit('users', Object.values(room.users));
  });

  socket.on('v-load',  d => { const r = rooms[rid]; if (!r) return; r.video = { url: d.url, type: d.vtype, playing: false, time: 0 }; io.to(rid).emit('v-load', d); });
  socket.on('v-play',  d => { const r = rooms[rid]; if (!r) return; r.video.playing = true;  r.video.time = d.time; socket.to(rid).emit('v-play',  d); });
  socket.on('v-pause', d => { const r = rooms[rid]; if (!r) return; r.video.playing = false; r.video.time = d.time; socket.to(rid).emit('v-pause', d); });
  socket.on('v-seek',  d => { const r = rooms[rid]; if (!r) return; r.video.time = d.time;                         socket.to(rid).emit('v-seek',  d); });

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

  // Pure relay — server never reads SDP/ICE content
  socket.on('signal', ({ to, kind, data }) => {
    socket.to(to).emit('signal', { from: socket.id, kind, data });
  });

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

  socket.on('msg', ({ text }) => {
    const r = rooms[rid]; if (!r || !r.users[socket.id]) return;
    const u = r.users[socket.id];
    const m = { id: uuidv4(), uid: socket.id, name: u.name, av: u.av, text, t: Date.now() };
    r.msgs.push(m);
    if (r.msgs.length > 200) r.msgs.shift();
    io.to(rid).emit('msg', m);
  });
  socket.on('rx', ({ emoji }) => { if (rooms[rid]) io.to(rid).emit('rx', { emoji }); });

  socket.on('disconnect', () => {
    if (!rid || !rooms[rid]) return;
    const r = rooms[rid];
    if (r.sharer === socket.id) { r.sharer = null; io.to(rid).emit('scr-stopped'); }
    r.voiceSet.delete(socket.id);
    delete r.users[socket.id];
    io.to(rid).emit('user-left', { id: socket.id });
    io.to(rid).emit('users', Object.values(r.users));
    if (!Object.keys(r.users).length)
      setTimeout(() => { if (rooms[rid] && !Object.keys(rooms[rid].users).length) delete rooms[rid]; }, 600000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('✅ http://localhost:' + PORT));