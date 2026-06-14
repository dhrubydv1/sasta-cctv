const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB limit for base64 uploads via socket if needed
});

const PORT = process.env.PORT || 3050;

// Session Configuration
const sessionMiddleware = session({
  secret: 'sasta-cctv-super-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve Static Files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Share session with Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Authentication APIs
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 6 characters' });
  }

  try {
    const user = await db.createUser(username, password);
    req.session.user = user;
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await db.verifyUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.user = user;
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  return res.json({ loggedIn: false });
});

// Middleware to protect API routes
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Device APIs
app.get('/api/devices/active-cameras', requireAuth, (req, res) => {
  const cameras = getCamerasForUser(req.session.user.id);
  res.json({ count: cameras.length, cameras });
});

// Alert APIs
app.get('/api/alerts', requireAuth, (req, res) => {
  const alerts = db.getAlertsForUser(req.session.user.id);
  res.json({ alerts });
});

app.post('/api/alerts/upload', requireAuth, (req, res) => {
  const { cameraName, image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image content is required' });
  }

  try {
    const alert = db.addAlert(req.session.user.id, cameraName, image);
    
    // Broadcast motion alert to monitors in real-time
    const userRoom = `user_${req.session.user.id}`;
    io.to(userRoom).emit('motion-alert', alert);

    return res.json({ success: true, alert });
  } catch (err) {
    console.error('Failed to upload alert:', err);
    return res.status(500).json({ error: 'Failed to upload alert' });
  }
});

app.delete('/api/alerts/:id', requireAuth, (req, res) => {
  const success = db.deleteAlert(req.session.user.id, req.params.id);
  if (success) {
    return res.json({ success: true });
  }
  return res.status(404).json({ error: 'Alert not found or unauthorized' });
});

// Real-time Socket.io Communications
const activeCameras = {}; // socket.id -> { userId, cameraName, socketId }

const getCamerasForUser = (userId) => {
  return Object.values(activeCameras)
    .filter(cam => cam.userId === userId)
    .map(cam => ({ socketId: cam.socketId, cameraName: cam.cameraName }));
};

io.on('connection', (socket) => {
  const sessionUser = socket.request.session ? socket.request.session.user : null;
  
  // Handshake verification
  if (!sessionUser) {
    // If socket isn't authenticated via session, wait for explicit authentication token/id
    // or disconnect after a timeout.
    // For ease, we will allow them to pass the userId during registration if session cookie isn't available
  }

  socket.on('register-device', ({ type, cameraName, userId }) => {
    // Determine user ID from session or payload
    const finalUserId = sessionUser ? sessionUser.id : userId;
    if (!finalUserId) {
      socket.emit('error', 'Authentication required to register device');
      return;
    }

    socket.userId = finalUserId;
    socket.deviceType = type;
    const userRoom = `user_${finalUserId}`;
    socket.join(userRoom);

    if (type === 'camera') {
      socket.cameraName = cameraName || 'Unknown Camera';
      activeCameras[socket.id] = {
        userId: finalUserId,
        cameraName: socket.cameraName,
        socketId: socket.id
      };
      console.log(`Camera registered: "${socket.cameraName}" (User ID: ${finalUserId}, Socket ID: ${socket.id})`);
      
      // Notify monitors in the room
      io.to(userRoom).emit('camera-list-update', getCamerasForUser(finalUserId));
    } else if (type === 'monitor') {
      console.log(`Monitor registered: (User ID: ${finalUserId}, Socket ID: ${socket.id})`);
      
      // Send active cameras list to the newly connected monitor
      socket.emit('camera-list-update', getCamerasForUser(finalUserId));
    }
  });

  // Relay WebRTC signalling messages (offer, answer, ice-candidate)
  socket.on('webrtc-signal', ({ targetSocketId, signalData }) => {
    if (!socket.userId) return;
    
    // Safety check: ensure target exists and belongs to the same user
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket && targetSocket.userId === socket.userId) {
      targetSocket.emit('webrtc-signal', {
        senderSocketId: socket.id,
        signalData
      });
    }
  });

  // Relay Siren / Alarm commands
  socket.on('trigger-siren', ({ targetSocketId, action }) => {
    if (!socket.userId) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket && targetSocket.userId === socket.userId && targetSocket.deviceType === 'camera') {
      console.log(`Triggering siren on camera ${targetSocketId}: ${action}`);
      targetSocket.emit('trigger-siren', { action });
    }
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    if (socket.deviceType === 'camera') {
      delete activeCameras[socket.id];
      console.log(`Camera disconnected: "${socket.cameraName}" (Socket ID: ${socket.id})`);
      
      if (socket.userId) {
        const userRoom = `user_${socket.userId}`;
        io.to(userRoom).emit('camera-list-update', getCamerasForUser(socket.userId));
      }
    } else if (socket.deviceType === 'monitor') {
      console.log(`Monitor disconnected: (Socket ID: ${socket.id})`);
    }
  });
});

// Run server
server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`   SASTA CCTV Backend is up and running!`);
  console.log(`   Local Server: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
