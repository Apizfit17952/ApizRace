// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
    io.emit('checkpointDataUpdated', checkpointData);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 