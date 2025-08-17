// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // Add these optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Add compression before other middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(session({
  secret: process.env.SESSION_SECRET || 'race_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Add rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);

// Load admin config
const ADMIN_CONFIG_PATH = path.join(__dirname, 'admin.config.json');
function loadAdminConfig() {
  if (!fs.existsSync(ADMIN_CONFIG_PATH)) {
    // Default config: password is 'admin123' (hashed)
    const defaultHash = bcrypt.hashSync('admin123', 10);
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'hafizhashim17952@gmail.com',
      passwordHash: defaultHash
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH));
}
function saveAdminConfig(config) {
  fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(config, null, 2));
}
let adminConfig = loadAdminConfig();

// In-memory data stores (replace with DB for production)
let leaderboard = [];
let users = [];
let appearance = { backdrop: '', banner: '' };
let raceEventName = '';
let checkpoints = ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
let checkpointData = {}; // { runnerId: { name, status, checkpoints: [{checkpoint, timestamp}], ... } }
let recentActivity = [];

// Helper: broadcast all data to a new client
function sendAllData(socket) {
  socket.emit('allData', {
    leaderboard,
    users,
    appearance,
    raceEventName,
    checkpoints,
    checkpointData,
    recentActivity
  });
}

io.on('connection', (socket) => {
  sendAllData(socket);

  // Leaderboard update
  socket.on('updateLeaderboard', (data) => {
    leaderboard = data;
    io.emit('leaderboardUpdated', leaderboard);
  });

  // User management
  socket.on('addUser', (user) => {
    users.push(user);
    io.emit('usersUpdated', users);
  });
  socket.on('updateUser', (user) => {
    users = users.map(u => u.id === user.id ? user : u);
    io.emit('usersUpdated', users);
  });
  socket.on('removeUser', (userId) => {
    console.log('Server received removeUser for id:', userId);
    users = users.filter(u => u.id !== userId);
    io.emit('usersUpdated', users);
  });

  // Appearance settings
  socket.on('updateAppearance', (data) => {
    appearance = { ...appearance, ...data };
    io.emit('appearanceUpdated', appearance);
  });

  // Race event name
  socket.on('updateRaceEventName', (name) => {
    raceEventName = name;
    io.emit('raceEventNameUpdated', raceEventName);
  });

  // Checkpoint management
  socket.on('updateCheckpoints', (data) => {
    checkpoints = data;
    io.emit('checkpointsUpdated', checkpoints);
  });
  socket.on('updateCheckpointData', (data) => {
    checkpointData = data;
    
    // Only send the specific changes, not all data
    io.emit('checkpointDataUpdated', {
      type: 'incremental',
      changes: data,
      timestamp: Date.now()
    });
    
    // Don't send allData every time - this was causing the lag!
    // io.emit('allData', { ... }); // Removed this!
  });

  // Recent activity logs
  socket.on('addActivity', (activity) => {
    recentActivity.unshift(activity);
    if (recentActivity.length > 100) recentActivity.pop();
    io.emit('recentActivityUpdated', recentActivity);
  });

  // RESET ALL DATA
  socket.on('resetAllData', () => {
    leaderboard = [];
    users = [];
    appearance = { backdrop: '', banner: '' };
    raceEventName = '';
    checkpoints = ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
    checkpointData = {};
    recentActivity = [];
    io.emit('allData', {
      leaderboard,
      users,
      appearance,
      raceEventName,
      checkpoints,
      checkpointData,
      recentActivity
    });
  });
});

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  adminConfig = loadAdminConfig();
  const match = await bcrypt.compare(password, adminConfig.passwordHash);
  if (match) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// --- PASSWORD RESET ---
const resetTokens = {};
app.post('/api/request-reset', (req, res) => {
  const { email } = req.body;
  adminConfig = loadAdminConfig();
  if (email !== adminConfig.email) {
    return res.status(400).json({ success: false, message: 'Email not found' });
  }
  const token = Math.random().toString(36).substr(2) + Date.now();
  resetTokens[token] = { email, expires: Date.now() + 1000 * 60 * 15 }; // 15 min
  // Send email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Race Admin Password Reset',
    text: `Reset your password: ${resetUrl}`
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Failed to send email' });
    }
    res.json({ success: true });
  });
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  const entry = resetTokens[token];
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token' });
  }
  adminConfig = loadAdminConfig();
  adminConfig.passwordHash = await bcrypt.hash(password, 10);
  saveAdminConfig(adminConfig);
  delete resetTokens[token];
  res.json({ success: true });
});

// --- PROTECT ADMIN ROUTES ---
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 