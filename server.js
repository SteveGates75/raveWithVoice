'use strict';

let express, Server, crypto, path, http;
try {
  express = require('express');
  ({ Server } = require('socket.io'));
  crypto = require('crypto');
  path   = require('path');
  http   = require('http');
} catch (e) {
  console.error('\n❌ Run "npm install" first, then "npm start"\n');
  process.exit(1);
}

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── IMPORTANT: parse JSON BEFORE routes ──────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── API ROUTES (must be before express.static) ────────────────
app.post('/create', (req, res) => {
  const id = crypto.randomBytes(4).toString('hex').toUpperCase();
  console.log('✅ Room created:', id);
  res.json({ id });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ── STATIC FILES (after API routes) ──────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Fallback: serve index for root ────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ID helpers ────────────────────────────────────────────────
const makeMid = () => crypto.randomBytes(8).toString('hex');
const AVATARS = ['🦊','🐼','🦋','🐉','🦁','🐸','🦄','🐺','🦅','🐬'];
const av = n => AVATARS[n.charCodeAt(0) % AVATARS.length];

// ── Rooms ─────────────────────────────────────────────────────
const rooms = {};
function getRoom(id) {
  if (!rooms[id]) rooms[id] = {
    users: {}, video: { url:'', type:'direct', playing:false, time:0 },
    msgs: [], sharer: null, voiceSet: new Set()
  };
  return rooms[id];
}

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connection', socket => {
  let rid = null;

  socket.on('join', ({ roomId, name }) => {
    rid = roomId;
    const room = getRoom(rid);
    const user = { id: socket.id, name: String(name).slice(0,30), av: av(name) };
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
    console.log(`[${rid}] "${name}" joined — ${Object.keys(room.users).length} user(s)`);
  });

  socket.on('v-load',  d => { const r=rooms[rid]; if(!r)return; r.video={url:d.url,type:d.vtype||'direct',playing:false,time:0}; io.to(rid).emit('v-load',d); });
  socket.on('v-play',  d => { const r=rooms[rid]; if(!r)return; r.video.playing=true;  r.video.time=d.time; socket.to(rid).emit('v-play',d);  });
  socket.on('v-pause', d => { const r=rooms[rid]; if(!r)return; r.video.playing=false; r.video.time=d.time; socket.to(rid).emit('v-pause',d); });
  socket.on('v-seek',  d => { const r=rooms[rid]; if(!r)return; r.video.time=d.time;                        socket.to(rid).emit('v-seek',d);  });

  socket.on('scr-start',   ()  => { const r=rooms[rid]; if(!r)return; r.sharer=socket.id; socket.to(rid).emit('scr-started',{sharerId:socket.id,name:r.users[socket.id]?.name}); });
  socket.on('scr-stop',    ()  => { const r=rooms[rid]; if(!r)return; r.sharer=null; io.to(rid).emit('scr-stopped'); });
  socket.on('scr-request', d   => socket.to(d.sharerId).emit('scr-viewer',{viewerId:socket.id}));
  socket.on('signal',      d   => socket.to(d.to).emit('signal',{from:socket.id,kind:d.kind,data:d.data}));

  socket.on('voice-join',  () => { const r=rooms[rid]; if(!r)return; r.voiceSet.add(socket.id); socket.emit('voice-peers',{peers:[...r.voiceSet].filter(x=>x!==socket.id)}); socket.to(rid).emit('voice-new',{id:socket.id}); });
  socket.on('voice-leave', () => { const r=rooms[rid]; if(!r)return; r.voiceSet.delete(socket.id); socket.to(rid).emit('voice-gone',{id:socket.id}); });

  socket.on('msg', ({ text }) => {
    const r=rooms[rid]; if(!r||!r.users[socket.id])return;
    const u=r.users[socket.id];
    const m={id:makeMid(),uid:socket.id,name:u.name,av:u.av,text:String(text).slice(0,300),t:Date.now()};
    r.msgs.push(m); if(r.msgs.length>200)r.msgs.shift();
    io.to(rid).emit('msg',m);
  });

  socket.on('rx', ({ emoji }) => { if(rooms[rid]) io.to(rid).emit('rx',{emoji}); });

  socket.on('disconnect', () => {
    if(!rid||!rooms[rid])return;
    const r=rooms[rid];
    if(r.sharer===socket.id){ r.sharer=null; io.to(rid).emit('scr-stopped'); }
    r.voiceSet.delete(socket.id);
    delete r.users[socket.id];
    io.to(rid).emit('user-left',{id:socket.id});
    io.to(rid).emit('users',Object.values(r.users));
    if(!Object.keys(r.users).length)
      setTimeout(()=>{ if(rooms[rid]&&!Object.keys(rooms[rid].users).length) delete rooms[rid]; },600000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('✅ WatchTogether is running!');
  console.log('👉 Open this in your browser: http://localhost:' + PORT);
  console.log('');
});