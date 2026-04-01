// ============================================================
// SERVER.JS - Main backend for Rave Clone
// This handles: rooms, video sync, voice chat, screen share
// ============================================================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Allow connections from anywhere (needed for Render deployment)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // Increase buffer size for screen sharing data
  maxHttpBufferSize: 1e8, // 100 MB
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// ROOMS - We store all active rooms here in memory
// Each room has: id, users, videoState, messages
// ============================================================
const rooms = {};

// Helper: get or create a room
function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      users: {},
      videoState: {
        url: "",
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now(),
        videoType: "youtube", // youtube | url | screenshare | gdrive
        quality: "1080p",
      },
      messages: [],
      screenSharer: null, // socket ID of who is sharing screen
    };
  }
  return rooms[roomId];
}

// ============================================================
// ROUTES
// ============================================================

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Room page
app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// Create a new room - returns a unique room ID
app.post("/api/create-room", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase(); // Short room code
  getRoom(roomId); // Initialize room
  res.json({ roomId, link: `/room/${roomId}` });
});

// Check if room exists
app.get("/api/room/:roomId", (req, res) => {
  const room = rooms[req.params.roomId];
  if (room) {
    res.json({
      exists: true,
      userCount: Object.keys(room.users).length,
      videoState: room.videoState,
    });
  } else {
    res.json({ exists: false });
  }
});

// ============================================================
// SOCKET.IO - Real-time communication
// This is the heart of the app
// ============================================================
io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  let currentRoom = null;
  let currentUser = null;

  // ---- JOIN ROOM ----
  socket.on("join-room", ({ roomId, username }) => {
    const room = getRoom(roomId);
    currentRoom = roomId;
    currentUser = { id: socket.id, username, avatar: getAvatar(username) };

    room.users[socket.id] = currentUser;
    socket.join(roomId);

    console.log(`👤 ${username} joined room ${roomId}`);

    // Send current room state to the joining user
    socket.emit("room-state", {
      users: Object.values(room.users),
      videoState: room.videoState,
      messages: room.messages.slice(-50), // Last 50 messages
      screenSharer: room.screenSharer,
    });

    // Tell everyone else someone joined
    socket.to(roomId).emit("user-joined", currentUser);

    // Update user list for everyone
    io.to(roomId).emit("users-update", Object.values(room.users));
  });

  // ---- VIDEO SYNC EVENTS ----
  // When someone plays a video
  socket.on("video-play", ({ roomId, currentTime, url }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.videoState.isPlaying = true;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    if (url) room.videoState.url = url;
    // Broadcast to everyone EXCEPT the sender
    socket.to(roomId).emit("video-play", { currentTime, url });
  });

  // When someone pauses
  socket.on("video-pause", ({ roomId, currentTime }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.videoState.isPlaying = false;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    socket.to(roomId).emit("video-pause", { currentTime });
  });

  // When someone seeks (jumps to a time)
  socket.on("video-seek", ({ roomId, currentTime }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdated = Date.now();
    socket.to(roomId).emit("video-seek", { currentTime });
  });

  // When someone loads a new video URL
  socket.on("video-load", ({ roomId, url, videoType }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.videoState.url = url;
    room.videoState.videoType = videoType || "url";
    room.videoState.isPlaying = false;
    room.videoState.currentTime = 0;
    io.to(roomId).emit("video-load", { url, videoType });
  });

  // ---- SCREEN SHARE ----
  // WebRTC signaling for screen share
  // When host starts sharing screen
  socket.on("screen-share-start", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.screenSharer = socket.id;
    // Tell all others that this person is now sharing their screen
    socket.to(roomId).emit("screen-share-started", {
      sharerId: socket.id,
      username: room.users[socket.id]?.username,
    });
    io.to(roomId).emit("users-update", Object.values(room.users));
  });

  // When host stops sharing
  socket.on("screen-share-stop", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.screenSharer = null;
    io.to(roomId).emit("screen-share-stopped");
  });

  // WebRTC offer (from screen sharer to viewer)
  socket.on("webrtc-offer", ({ targetId, offer, roomId }) => {
    socket.to(targetId).emit("webrtc-offer", {
      offer,
      fromId: socket.id,
      roomId,
    });
  });

  // WebRTC answer (from viewer back to sharer)
  socket.on("webrtc-answer", ({ targetId, answer }) => {
    socket.to(targetId).emit("webrtc-answer", { answer, fromId: socket.id });
  });

  // ICE candidates (WebRTC connection negotiation)
  socket.on("ice-candidate", ({ targetId, candidate }) => {
    socket.to(targetId).emit("ice-candidate", {
      candidate,
      fromId: socket.id,
    });
  });

  // New viewer joined - sharer needs to send them an offer
  socket.on("request-screen-share", ({ roomId, sharerId }) => {
    // Tell the sharer that this new person wants to see their screen
    socket.to(sharerId).emit("viewer-joined", { viewerId: socket.id });
  });

  // ---- VOICE CHAT (WebRTC Audio) ----
  socket.on("voice-offer", ({ targetId, offer }) => {
    socket.to(targetId).emit("voice-offer", { offer, fromId: socket.id });
  });

  socket.on("voice-answer", ({ targetId, answer }) => {
    socket.to(targetId).emit("voice-answer", { answer, fromId: socket.id });
  });

  socket.on("voice-ice-candidate", ({ targetId, candidate }) => {
    socket.to(targetId).emit("voice-ice-candidate", { candidate, fromId: socket.id });
  });

  // Unified voice ICE (used by new client code)
  socket.on("voice-ice", ({ targetId, candidate }) => {
    socket.to(targetId).emit("voice-ice", { candidate, fromId: socket.id });
  });

  socket.on("voice-joined", ({ roomId }) => {
    socket.to(roomId).emit("new-voice-user", { userId: socket.id });
  });

  socket.on("voice-left", ({ roomId }) => {
    socket.to(roomId).emit("voice-user-left", { userId: socket.id });
  });

  // ---- CHAT MESSAGES ----
  socket.on("chat-message", ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room || !room.users[socket.id]) return;
    const msg = {
      id: uuidv4(),
      userId: socket.id,
      username: room.users[socket.id].username,
      avatar: room.users[socket.id].avatar,
      text: message,
      timestamp: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift(); // Keep last 200
    io.to(roomId).emit("chat-message", msg);
  });

  // ---- REACTIONS (emoji reactions) ----
  socket.on("reaction", ({ roomId, emoji }) => {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit("reaction", {
      emoji,
      username: room.users[socket.id]?.username,
    });
  });

  // ---- DISCONNECT ----
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    if (!currentRoom || !rooms[currentRoom]) return;

    const room = rooms[currentRoom];

    // If screen sharer disconnected, stop sharing
    if (room.screenSharer === socket.id) {
      room.screenSharer = null;
      io.to(currentRoom).emit("screen-share-stopped");
    }

    // Remove user from room
    delete room.users[socket.id];
    io.to(currentRoom).emit("user-left", { id: socket.id });
    io.to(currentRoom).emit("users-update", Object.values(room.users));

    // Clean up empty rooms after 10 minutes
    if (Object.keys(room.users).length === 0) {
      setTimeout(() => {
        if (rooms[currentRoom] && Object.keys(rooms[currentRoom].users).length === 0) {
          delete rooms[currentRoom];
          console.log(`🗑️ Room ${currentRoom} deleted (empty)`);
        }
      }, 10 * 60 * 1000);
    }
  });
});

// Helper: generate avatar emoji from username
function getAvatar(username) {
  const avatars = ["🦊", "🐼", "🦋", "🐉", "🦁", "🐸", "🦄", "🐺", "🦅", "🐬", "🦈", "🐙"];
  const idx = username.charCodeAt(0) % avatars.length;
  return avatars[idx];
}

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Rave Clone running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
});