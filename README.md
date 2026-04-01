# 🎬 WatchTogether – Rave Clone

Watch movies, series, and videos with friends in real-time.  
Supports **screen sharing (1080p 60fps)**, **voice chat**, **YouTube**, **Google Drive**, and any video URL.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🖥️ Screen Share | 1080p 60fps via WebRTC |
| 🎙️ Voice Chat | Real-time voice via WebRTC |
| ▶️ YouTube | Paste any YouTube URL |
| ☁️ Google Drive | Share Google Drive videos |
| 🔗 Direct URL | Any .mp4, .webm, HLS stream |
| 🌐 Any Website | Embed Netflix, Prime, etc. (iframe) |
| 💬 Live Chat | Synchronized chat + emoji reactions |
| 📱 Mobile Friendly | Works on phones and tablets |
| 🔄 Video Sync | Play/pause/seek synced for all users |

---

## 🚀 How to Run Locally (Step by Step)

### Step 1 – Install Node.js
Go to https://nodejs.org and download the **LTS version** (the green button).  
Install it like a normal program. When done, open your terminal/command prompt.

### Step 2 – Download the project
Either download the ZIP and extract it, or if you have Git:
```bash
git clone <your-repo-url>
cd rave-clone
```

### Step 3 – Install dependencies
In your terminal, navigate to the project folder and run:
```bash
npm install
```
This downloads all the required packages (express, socket.io, etc.)

### Step 4 – Start the server
```bash
npm start
```
You should see:
```
🚀 Rave Clone running on port 3000
🌐 Open: http://localhost:3000
```

### Step 5 – Open in browser
Go to: **http://localhost:3000**

---

## 🌐 How to Deploy on Render (Free Hosting)

### Step 1 – Put your code on GitHub
1. Go to https://github.com and create a free account
2. Click "New repository" → name it `watchtogether` → click "Create"
3. Upload all your files there (or use Git commands)

### Step 2 – Deploy on Render
1. Go to https://render.com and create a free account
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select your repository
4. Fill in these settings:
   - **Name**: `watchtogether`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Click **"Create Web Service"**

Render will give you a URL like: `https://watchtogether.onrender.com`  
Share this URL with your friends!

> ⚠️ **Free tier note**: Render free tier sleeps after 15 min of inactivity.  
> First load after sleeping takes ~30 seconds. Upgrade to paid ($7/mo) to avoid this.

---

## 📱 How to Use the App

### Creating a Room
1. Open the app URL
2. Enter your name
3. Click "Create a Room"
4. Copy the room link and share with friends

### Joining a Room
1. Open the app URL
2. Enter your name
3. Paste the room code or click the invite link
4. Click "Join Room"

### Loading a Video

**YouTube:**
- Select "▶ YouTube" from the dropdown
- Paste: `https://www.youtube.com/watch?v=VIDEO_ID`
- Click "▶ Load"

**Google Drive:**
- Upload your video to Google Drive
- Right-click → "Share" → "Anyone with link can view"
- Select "☁ Google Drive" and paste the link

**Direct Video URL (.mp4):**
- Select "🔗 Direct URL"
- Paste a direct link to a .mp4 or .webm file
- This is the only option where play/pause sync works!

**Any Website (Netflix, etc.):**
- Select "🌐 Any Website"
- Paste the URL
- ⚠️ Note: Netflix/Disney+ block iframes for copyright reasons.  
  Use "Screen Share" instead for these platforms!

### Screen Sharing (Best for Netflix, Prime, Disney+)
1. Click **"🖥️ Share"** in the top bar
2. A browser popup will ask what to share:
   - **"Tab"** – share just one browser tab (best quality)
   - **"Window"** – share a specific app window
   - **"Entire Screen"** – share everything
3. Select the tab/window with Netflix/Prime playing
4. Your friends will see your screen in 1080p 60fps automatically!

### Voice Chat
1. Click **"🎙️ Voice"** in the top bar
2. Allow microphone permission when browser asks
3. You can now talk with everyone in the room
4. Click again to leave voice chat

---

## 🔧 Project Structure

```
rave-clone/
├── server.js          ← Main backend (Node.js + Socket.IO)
├── package.json       ← Project dependencies
├── render.yaml        ← Render deployment config
├── .gitignore
└── public/
    ├── index.html     ← Home/landing page
    └── room.html      ← Watch party room (all the magic!)
```

---

## 🛠️ Tech Stack

| Technology | What it does |
|-----------|-------------|
| **Node.js** | Server runtime |
| **Express** | Web server framework |
| **Socket.IO** | Real-time sync (chat, play/pause) |
| **WebRTC** | Peer-to-peer screen share + voice |
| **UUID** | Generates unique room IDs |

---

## ❓ Common Issues

**"Screen share is black/not working"**
- Use Chrome or Edge (Firefox has limited screen share)
- Make sure you select the correct tab/window

**"Voice chat doesn't work"**
- Allow microphone permission in your browser
- Check that your microphone is not muted in your OS

**"My friend can't join"**
- Make sure they use the full URL or correct room code
- If running locally, they need to be on the same network or you need to deploy

**"Video sync doesn't work for YouTube"**
- YouTube embeds have restricted API access. Use "Direct URL" (.mp4 files) for full sync
- Or use Screen Share for any streaming platform

**"Render app is sleeping"**  
- First visit after inactivity takes ~30s. This is normal on the free tier.

---

## 📞 For Beginners – Key Concepts

**What is Socket.IO?**  
Think of it like a live phone call between the server and all browsers.  
When you pause a video, Socket.IO instantly tells everyone else to pause too.

**What is WebRTC?**  
Direct browser-to-browser connection. For screen sharing and voice, data goes  
directly between your browser and your friend's browser (not through the server).  
This is why it's fast and high quality!

**What is a Room?**  
A room is just a group. Everyone in the same room shares the same video state,  
chat, and can hear each other's voice.

---

Made with ❤️ for movie nights
