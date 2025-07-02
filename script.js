// --- SOCKET.IO REALTIME SYNC ---
// Use the correct server URL for Socket.IO depending on environment
let socketServerUrl = '';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  socketServerUrl = 'http://localhost:3000';
} else {
  socketServerUrl = window.location.origin;
}
const socket = io(socketServerUrl); // Connects to the backend server

// Shared data (replaces localStorage)
let leaderboard = [];
let users = [];
let appearance = { backdrop: '', banner: '' };
let raceEventName = '';
let checkpoints = ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
let checkpointData = {};
let recentActivity = [];
let importedRunnerIDs = [];

// On initial connection, receive all data
socket.on('allData', data => {
  leaderboard = data.leaderboard || [];
  users = data.users || [];
  appearance = data.appearance || { backdrop: '', banner: '' };
  raceEventName = data.raceEventName || '';
  checkpoints = data.checkpoints || ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
  checkpointData = data.checkpointData || {};
  recentActivity = data.recentActivity || [];
  // Call UI update functions here as needed
  updateAllUI();
  // Auto-logout if current user is removed (after reset all data)
  const session = getUserSession();
  if (session && session.type === 'user') {
    const stillExists = users.some(u => u.username === session.username && u.id);
    if (!stillExists) {
      clearUserSession();
      showNotification('Your account has been removed. Logging out...', 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    }
  }
});

// Listen for real-time updates
socket.on('leaderboardUpdated', data => { leaderboard = data; updateEnhancedLeaderboard(); });
socket.on('usersUpdated', data => {
  users = data;
  displayUserList && displayUserList();
  // Auto-logout if current user is removed
  const session = getUserSession();
  if (session && session.type === 'user') {
    const stillExists = users.some(u => u.username === session.username && u.id);
    if (!stillExists) {
      clearUserSession();
      showNotification('Your account has been removed. Logging out...', 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    }
  }
});
socket.on('appearanceUpdated', data => { appearance = data; applyImages && applyImages(); });
socket.on('raceEventNameUpdated', data => { raceEventName = data; displayRaceEventName && displayRaceEventName(); updateWelcomeBanner && updateWelcomeBanner(); });
socket.on('checkpointsUpdated', data => { checkpoints = data; displayCheckpointList && displayCheckpointList(); });
socket.on('checkpointDataUpdated', data => { checkpointData = data; updateEnhancedLeaderboard && updateEnhancedLeaderboard(); displayCheckpointLog && displayCheckpointLog(); });
socket.on('recentActivityUpdated', data => { recentActivity = data; displayCheckpointLog && displayCheckpointLog(); });

function updateAllUI() {
  updateEnhancedLeaderboard && updateEnhancedLeaderboard();
  displayUserList && displayUserList();
  applyImages && applyImages();
  displayRaceEventName && displayRaceEventName();
  updateWelcomeBanner && updateWelcomeBanner();
  displayCheckpointList && displayCheckpointList();
  displayCheckpointLog && displayCheckpointLog();
}
// --- END SOCKET.IO REALTIME SYNC ---

const ADMIN_PASSWORD = "admin123";
let isAuthenticated = localStorage.getItem("isAdminAuthenticated") === "true";
const RACE_DISTANCE_KM = 10; // Assumed race distance in kilometers
let flagOffTime = localStorage.getItem("flagOffTime") ? parseInt(localStorage.getItem("flagOffTime")) : null;
let leaderboardRefreshInterval = null;

// User authentication and registration logic
const USERS_KEY = "registeredUsers";
const USER_SESSION_KEY = "userSession";

function getRegisteredUsers() {
    return users;
}

function saveRegisteredUsers(newUsers) {
    users = newUsers;
    socket.emit('usersUpdated', users);
}

function setUserSession(session) {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

function getUserSession() {
    return JSON.parse(localStorage.getItem(USER_SESSION_KEY));
}

function clearUserSession() {
    localStorage.removeItem(USER_SESSION_KEY);
}

// Preload images to improve theme switching performance
function preloadImages() {
  const images = [
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80',
    'https://images.unsplash.com/photo-1508098682722-e99e46c8748d?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80',
    localStorage.getItem("backdropImage"),
    localStorage.getItem("bannerImage")
  ].filter(url => url); // Only preload valid URLs

  images.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

// Debounce utility for search inputs and theme toggle
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Format time in milliseconds to HH:MM:SS.mmm
function formatTime(ms) {
  if (!ms && ms !== 0) return "N/A";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

// Format timestamp to local time
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Singapore' });
}

// Format pace in milliseconds to M:SS min/km
function formatPace(ms, distanceKm) {
  if (!ms || !distanceKm || distanceKm === 0) return "N/A";
  const totalMinutes = ms / 1000 / 60 / distanceKm;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} min/km`;
}

// Get icon for checkpoints
function getCheckpointIcon(checkpoint) {
  if (checkpoint === "Start") return "fa-play";
  if (checkpoint === "Finish") return "fa-flag-checkered";
  const index = checkpoints.indexOf(checkpoint);
  if (index > 0 && index < checkpoints.length - 1) return `fa-${index}`; // Simple number icon
  return "fa-map-marker-alt"; // Default icon
}

// Get icon for runner status
function getStatusIcon(status) {
  switch(status) {
    case "finished": return "fa-check-circle";
    case "in-progress": return "fa-hourglass-half";
    case "dnf": return "fa-times-circle";
    case "dns": return "fa-ban";
    default: return "fa-question-circle";
  }
}

// Show notification popup
function showNotification(message, type = "info") {
  let notificationContainer = document.querySelector(".notification-container");
  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.classList.add("notification-container");
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  notification.className = `notification ${type} fade-in`;

  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-circle";
  if (type === "warning") icon = "fa-exclamation-triangle";

  notification.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.classList.add('fade-out'); setTimeout(() => this.parentElement.remove(), 300);">
      <i class="fas fa-times"></i>
    </button>
  `;

  notificationContainer.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.remove("fade-in");
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Update leaderboard with search and sorting for all runners
function updateEnhancedLeaderboard() {
  const tableBody = document.getElementById("leaderboard");
  if (!tableBody) return;

  const headers = document.querySelectorAll('#leaderboardTable th');
  if (headers.length >= 4) {
    headers[3].textContent = 'Average Pace';
  }

  const searchQuery = document.getElementById("searchLeaderboard")?.value.trim().toLowerCase() || "";
  // Only clear tableBody after sorting/filtering to minimize reflow
  leaderboard = [];

  const now = new Date().getTime();

  // Build the full sorted leaderboard for global ranking
  const allRunners = [];
  for (let runnerId in checkpointData) {
    const runnerEntry = checkpointData[runnerId];
    const data = runnerEntry.checkpoints || [];
    const name = runnerEntry.name || "Unknown Runner";
    let status = runnerEntry.status || (data.some(e => e.checkpoint === "Finish") ? "finished" : data.length > 0 ? "in-progress" : "dns");
    if (data.some(e => e.checkpoint === "Finish")) {
        status = "finished";
    }
    const completedCheckpoints = data.map(e => e.checkpoint);
    let pace = null; 
    let totalTime = null;
    let distanceKm = 0;
    let lastCheckpointData = data.length > 0 ? data[data.length - 1] : null;
    let lastCheckpoint = lastCheckpointData ? lastCheckpointData.checkpoint : "None";
    let lastTimestamp = lastCheckpointData ? lastCheckpointData.timestamp : null;
    let priority = 0;
    if (status === "finished") priority = 3;
    else if (status === "in-progress") priority = 2;
    else if (status === "dnf") priority = 1;
    else if (status === "dns") priority = 0;
    if (!flagOffTime || status === "dns" || data.length === 0) {
      totalTime = null; 
      pace = null; 
    } else {
      const finishEntry = data.find(e => e.checkpoint === "Finish");
      const startTime = data.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime;
      let endTimeForCalc;
      if (finishEntry) {
          endTimeForCalc = finishEntry.timestamp;
          distanceKm = RACE_DISTANCE_KM;
      } else if (lastCheckpointData) {
          endTimeForCalc = lastCheckpointData.timestamp;
          const lastCpIndex = checkpoints.indexOf(lastCheckpointData.checkpoint);
          if (lastCpIndex !== -1) {
            if (checkpoints.length > 1) {
              distanceKm = (lastCpIndex / (checkpoints.length -1) ) * RACE_DISTANCE_KM;
            } else {
              distanceKm = 0;
            }
          } else {
              distanceKm = 0;
          }
      } else {
          endTimeForCalc = now;
          distanceKm = 0;
      }
      totalTime = endTimeForCalc - startTime;
      pace = (distanceKm > 0 && totalTime > 0) ? totalTime / distanceKm : null;
    }
    allRunners.push({
      runner: runnerId,
      name,
      pace, 
      totalTime, 
      status,
      priority,
      data,
      completedCheckpoints,
      lastCheckpoint,
      lastTimestamp,
      startTimestamp: data.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime || Infinity 
    });
  }
  // 1. For each runner, determine furthest checkpoint index and when they reached it
  allRunners.forEach(runner => {
    const checkpointsArr = runner.data || [];
    let furthestIndex = 0;
    let furthestTimestamp = null;
    let startTime = checkpointsArr.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime;
    if (checkpointsArr.length > 0 && startTime) {
      let maxIndex = 0;
      let time = null;
      checkpointsArr.forEach(cp => {
        const idx = checkpoints.indexOf(cp.checkpoint);
        if (idx > maxIndex && cp.timestamp && cp.timestamp > startTime) {
          maxIndex = idx;
          time = cp.timestamp;
        }
      });
      furthestIndex = maxIndex;
      furthestTimestamp = time;
    }
    runner.furthestIndex = furthestIndex;
    runner.furthestTimestamp = furthestTimestamp;
  });
  // 2. Find the maximum furthest checkpoint index among all runners
  // 3. Sort: furthest checkpoint index (descending), then earliest timestamp (ascending)
  function getStatusPriority(status) {
    if (status === 'finished' || status === 'in-progress') return 2;
    if (status === 'dnf') return 1;
    if (status === 'dns') return 0;
    return -1;
  }
  allRunners.sort((a, b) => {
    const aPriority = getStatusPriority(a.status);
    const bPriority = getStatusPriority(b.status);
    if (aPriority !== bPriority) return bPriority - aPriority;
    if (b.furthestIndex !== a.furthestIndex) {
      return b.furthestIndex - a.furthestIndex;
    }
    if (a.furthestTimestamp !== null && b.furthestTimestamp !== null) {
      return a.furthestTimestamp - b.furthestTimestamp;
    }
    return 0;
  });
  let rank = 1;
  let dnfDnsStartRank = allRunners.length;
  allRunners.forEach(entry => {
    if (entry.status !== 'dnf' && entry.status !== 'dns') {
      entry.globalRank = rank++;
    }
  });
  allRunners.forEach(entry => {
    if (entry.status === 'dnf' || entry.status === 'dns') {
      entry.globalRank = dnfDnsStartRank--;
    }
  });
  // Now filter for display
  const filteredRunners = allRunners.filter(entry => {
    if (!searchQuery) {
      // Hide DNF/DNS unless searching
      return entry.status !== 'dnf' && entry.status !== 'dns';
    }
    if (searchQuery === "dnf" && entry.status.toLowerCase() === "dnf") return true;
    if (searchQuery === "dns" && entry.status.toLowerCase() === "dns") return true;
    if (
      entry.runner.toLowerCase().includes(searchQuery) ||
      entry.name.toLowerCase().includes(searchQuery)
    ) return true;
    return false;
  });
  // Only render the top 50 runners for performance (can adjust as needed)
  const topRunners = filteredRunners.slice(0, 50);

  // Use document fragment for fast DOM updates
  requestAnimationFrame(() => {
    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();
    if (topRunners.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="9" class="empty-table">
          <div class="empty-message">
            <i class="fas fa-clipboard-list"></i>
            <p>No runners to display${searchQuery ? ' for "' + searchQuery + '"' : ''}.</p>
          </div>
        </td>
      `;
      fragment.appendChild(tr);
    } else {
      topRunners.forEach((entry) => {
        const row = document.createElement("tr");
        row.classList.add("fade-in");
        const globalRank = entry.globalRank;
        if (globalRank <= 3) {
          row.classList.add("rank-" + globalRank);
        }
        const statusIcon = getStatusIcon(entry.status);
        let badge = `<span class=\"badge status-badge ${entry.status}\"><i class=\"fas ${statusIcon}\"></i> ${entry.status.toUpperCase()}</span>`;
        const progressCount = entry.completedCheckpoints.length;
        const totalConfiguredCheckpoints = checkpoints.length > 0 ? checkpoints.length : 1;
        const progressPercent = Math.round((progressCount / totalConfiguredCheckpoints) * 100);
        const progressHTML = `<div class=\"progress-container\"><div class=\"progress-bar\" style=\"width: ${progressPercent}%\"></div><span>${progressPercent}% (${progressCount}/${totalConfiguredCheckpoints})</span></div>`;

        // Calculate start and end times, and distance
        let startTime = null, endTime = null, distanceKm = 0;
        const checkpointsArr = entry.data || [];
        const startEntry = checkpointsArr.find(e => e.checkpoint === "Start");
        if (startEntry) startTime = startEntry.timestamp;
        if (entry.status === "finished") {
          const finishEntry = checkpointsArr.find(e => e.checkpoint === "Finish");
          if (finishEntry) endTime = finishEntry.timestamp;
          distanceKm = RACE_DISTANCE_KM;
        } else if (entry.lastCheckpoint && entry.lastCheckpoint !== "None" && startEntry) {
          endTime = entry.lastTimestamp;
          const lastCpIndex = checkpoints.indexOf(entry.lastCheckpoint);
          if (lastCpIndex > 0 && checkpoints.length > 1) {
            distanceKm = (lastCpIndex / (checkpoints.length - 1)) * RACE_DISTANCE_KM;
          }
        }
        let totalTime = (startTime && endTime && endTime > startTime) ? (endTime - startTime) : null;
        let pace = (totalTime && distanceKm > 0) ? totalTime / distanceKm : null;
        let paceFormatted = (pace && distanceKm > 0) ? formatPace(pace, distanceKm) : "N/A";
        let totalTimeFormatted = (totalTime && totalTime > 0) ? formatTime(totalTime) : "N/A";
        let lastTime = entry.lastTimestamp ? formatTimestamp(entry.lastTimestamp) : "N/A";
        let rankDisplay = `${globalRank}`;
        const medalColors = ["gold", "silver", "#cd7f32"];
        const trophyColors = ["silver", "#cd7f32"];
        if (globalRank <= 3) {
          rankDisplay = `<i class='fas fa-medal' style='color: ${medalColors[globalRank-1]}; font-size: 0.9rem; margin-right: 4px;'></i> ${globalRank}`;
        } else if (globalRank <= 5) {
          rankDisplay = `<i class='fas fa-trophy' style='color: ${trophyColors[globalRank-4]}; font-size: 0.9rem; margin-right: 4px;'></i> ${globalRank}`;
        }
        row.innerHTML = `
          <td>${rankDisplay}</td>
          <td>${entry.runner}</td>
          <td>${entry.name}</td>
          <td>${paceFormatted}</td>
          <td>${badge}</td>
          <td>${progressHTML}</td>
          <td>${entry.lastCheckpoint}</td>
          <td>${totalTimeFormatted}</td>
          <td>${lastTime}</td>
        `;
        fragment.appendChild(row);
      });
    }
    tableBody.appendChild(fragment);
  });
}

function clearLeaderboardSearch() {
    document.getElementById("searchLeaderboard").value = "";
    updateEnhancedLeaderboard();
}

// Authenticate admin user
function authenticate() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("admin-password");
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
        showNotification("Please enter both username and password", "error");
        return;
    }
    if (username === "admin") {
        if (password === ADMIN_PASSWORD) {
            isAuthenticated = true;
            localStorage.setItem("isAdminAuthenticated", "true");
            setUserSession({ type: "admin" });
            document.getElementById("auth-container").style.display = "none";
            document.getElementById("main-content").style.display = "block";
            initializePage();
            showNotification("Admin access granted", "success");
        } else {
            showNotification("Incorrect admin password", "error");
            passwordInput.value = "";
        }
    } else {
        const users = getRegisteredUsers();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            setUserSession({ type: "user", username });
            document.getElementById("auth-container").style.display = "none";
            document.getElementById("main-content").style.display = "block";
            showNotification(`Welcome, ${username}!`, "success");
            initializePage();
        } else {
            showNotification("Invalid username or password", "error");
            passwordInput.value = "";
        }
    }
}

// Logout admin
function logoutAdmin() {
    isAuthenticated = false;
    localStorage.removeItem("isAdminAuthenticated");
    clearUserSession();
    document.getElementById("main-content").style.display = "none";
    document.getElementById("auth-container").style.display = "block";
    const adminPasswordInput = document.getElementById("admin-password");
    if (adminPasswordInput) {
        adminPasswordInput.value = "";
        adminPasswordInput.focus();
    }
    showNotification("Logged out successfully", "info");
    window.location.href = "index.html";
}

// Initialize page based on current URL
function initializePage() {
  displayRaceEventName();
  applyImages(); 
  setupRunnerAutocomplete(); 

  const path = window.location.pathname;

  if (path.includes("leaderboard.html")) {
    updateEnhancedLeaderboard();
    if (leaderboardRefreshInterval) clearInterval(leaderboardRefreshInterval);
    leaderboardRefreshInterval = setInterval(updateEnhancedLeaderboard, 10000);
  } else if (path.includes("settings.html")) {
    displayCheckpointList();
  } else if (path.includes("index.html") || path === "/") { 
    displayCheckpointLog(); 
    updateWelcomeBanner();
  }
  showRegistrationCardIfAdmin();
}

// Apply backdrop and banner images with requestAnimationFrame
function applyImages() {
  requestAnimationFrame(() => {
    try {
      const backdropImage = appearance.backdrop;
      const bannerImage = appearance.banner;

      const backdropStyle = backdropImage
        ? `url('${backdropImage}') no-repeat center center/cover`
        : `url('https://images.unsplash.com/photo-1517649763962-0c623066013b?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80') no-repeat center center/cover`;
      document.body.style.setProperty('--backdrop-image', backdropStyle);

      const bannerStyle = bannerImage
        ? `linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(20, 184, 166, 0.9)), url('${bannerImage}') no-repeat center center/cover`
        : `linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(20, 184, 166, 0.9)), url('https://images.unsplash.com/photo-1508098682722-e99e46c8748d?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80') no-repeat center center/cover`;
      const banners = document.querySelectorAll('.banner');
      banners.forEach(banner => {
        banner.style.background = bannerStyle;
      });
    } catch (error) {
      console.error("Error applying images:", error);
      showNotification("Failed to apply images", "error");
    }
  });
}

const toggleThemeDebounced = debounce(() => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeToggleIcon();
  applyImages(); 
}, 100);


function updateThemeToggleIcon() {
  const themeToggleIconAuth = document.querySelector("#auth-container .theme-toggle i"); 
  const themeToggleCheckboxAuth = document.getElementById("theme-toggle-checkbox"); 
  const settingsThemeToggleCheckbox = document.querySelector('#appearance-settings .theme-settings input[type="checkbox"]');

  const isDark = document.body.classList.contains("dark");

  if (themeToggleIconAuth) { 
    themeToggleIconAuth.className = isDark ? "fas fa-sun" : "fas fa-moon";
  }
  if (themeToggleCheckboxAuth) { 
     themeToggleCheckboxAuth.checked = isDark;
  }
  if (settingsThemeToggleCheckbox) { 
    settingsThemeToggleCheckbox.checked = isDark;
  }
}

function toggleTheme() { // Global function for settings page checkbox
    toggleThemeDebounced();
}


document.addEventListener('DOMContentLoaded', function() {
  preloadImages();

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add("dark");
  }
  updateThemeToggleIcon(); 

  const authThemeToggleSwitch = document.querySelector("#auth-container .theme-toggle .switch");
  if (authThemeToggleSwitch) {
    authThemeToggleSwitch.addEventListener('click', toggleThemeDebounced);
  }
  
  const authThemeCheckbox = document.getElementById('theme-toggle-checkbox');
  if (authThemeCheckbox) {
      authThemeCheckbox.addEventListener('change', () => {});
  }

  const path = window.location.pathname;
  const isLeaderboardPage = path.includes("leaderboard.html");
  const isSettingsPage = path.includes("settings.html");
  const isHomePage = !isLeaderboardPage && !isSettingsPage && (path.includes("index.html") || path === "/");

  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const adminPasswordInput = document.getElementById("admin-password"); 

  // --- SESSION LOGIC ---
  const session = getUserSession();
  if (isLeaderboardPage) {
    if (authContainer) authContainer.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    initializePage();
  } else if (session) {
    if (authContainer) authContainer.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    initializePage();
  } else {
    if (authContainer) authContainer.style.display = "block";
    if (mainContent) mainContent.style.display = "none";
    if (adminPasswordInput) {
      adminPasswordInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          authenticate();
        }
      });
      const loginButtonAuthScreen = document.querySelector("#auth-container #login-button");
      if(loginButtonAuthScreen) loginButtonAuthScreen.addEventListener('click', authenticate);
    }
  }

  if (isHomePage && (!mainContent || mainContent.style.display === "block")) {
    const runnerIdInput = document.getElementById("runnerId");
    const logCheckpointButton = document.getElementById("log-checkpoint-button");
    if (logCheckpointButton) logCheckpointButton.addEventListener('click', logCheckpoint);
    if (runnerIdInput) {
      runnerIdInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') { event.preventDefault(); logCheckpoint(); }
      });
    }
    const statusRunnerIdInput = document.getElementById("statusRunnerId");
    const markDnsButton = document.getElementById("mark-dns-button");
    const markDnfButton = document.getElementById("mark-dnf-button");
    if (markDnsButton) markDnsButton.addEventListener('click', markRunnerDNS);
    if (markDnfButton) markDnfButton.addEventListener('click', markRunnerDNF);
    const flagOffButton = document.getElementById("flag-off-button");
    if (flagOffButton) flagOffButton.addEventListener('click', flagOffRace);
  }

  if (isSettingsPage && (!mainContent || mainContent.style.display === "block")) {
    if (!session || session.type !== "admin") {
      // Hide settings content and show a message or redirect
      mainContent.style.display = "none";
      authContainer.style.display = "block";
      showNotification("Access denied: Only admins can access settings.", "error");
      return;
    }
    const saveRaceNameButton = document.getElementById("saveRaceName");
    if (saveRaceNameButton) saveRaceNameButton.addEventListener('click', saveRaceEventName);
    const addCheckpointButton = document.getElementById("addCheckpoint");
    if (addCheckpointButton) addCheckpointButton.addEventListener('click', addCheckpoint);
    const saveBackdropButton = document.getElementById("saveBackdrop");
    if (saveBackdropButton) saveBackdropButton.addEventListener('click', saveBackdropImage);
    const clearBackdropButton = document.getElementById("clearBackdrop");
    if (clearBackdropButton) clearBackdropButton.addEventListener('click', clearBackdropImage);
    const saveBannerButton = document.getElementById("saveBanner");
    if (saveBannerButton) saveBannerButton.addEventListener('click', saveBannerImage);
    const clearBannerButton = document.getElementById("clearBanner");
    if (clearBannerButton) clearBannerButton.addEventListener('click', clearBannerImage);
    const importRunnersInput = document.getElementById("importRunners");
    if (importRunnersInput) {
      importRunnersInput.addEventListener('change', (event) => {
        importRunnerData(event.target.files);
        const fileNameSpan = document.getElementById("importFileName");
        if (fileNameSpan && event.target.files.length > 0) {
            fileNameSpan.textContent = event.target.files[0].name;
        } else if (fileNameSpan) {
            fileNameSpan.textContent = "";
        }
      });
    }
    const resetButton = document.getElementById("resetAllData");
    if (resetButton) resetButton.addEventListener('click', resetData);

    document.querySelectorAll('.settings-card .section-header').forEach(header => {
      header.addEventListener('click', function() {
        const content = this.nextElementSibling;
        const icon = this.querySelector('.toggle-icon');
        const isContentVisible = content.style.display === 'block';
        content.style.display = isContentVisible ? 'none' : 'block';
        icon.classList.toggle('fa-chevron-up', !isContentVisible);
        icon.classList.toggle('fa-chevron-down', isContentVisible);
      });
      // Initialize sections open
       const content = header.nextElementSibling;
       const icon = header.querySelector('.toggle-icon');
       content.style.display = 'block';
       icon.classList.remove('fa-chevron-down');
       icon.classList.add('fa-chevron-up');
    });

    const settingsThemeCheckbox = document.querySelector('#appearance-settings .theme-settings input[type="checkbox"]');
    if (settingsThemeCheckbox) {
        settingsThemeCheckbox.addEventListener('change', toggleThemeDebounced);
    }

    showRegistrationCardSettingsIfAdmin();
    displayUserList();
  }

  if (isLeaderboardPage && (!mainContent || mainContent.style.display === "block")) {
    updateEnhancedLeaderboard();
    if (leaderboardRefreshInterval) clearInterval(leaderboardRefreshInterval);
    leaderboardRefreshInterval = setInterval(updateEnhancedLeaderboard, 10000);
  } else {
    if (leaderboardRefreshInterval) {
      clearInterval(leaderboardRefreshInterval);
      leaderboardRefreshInterval = null;
    }
  }

  document.querySelectorAll('nav a').forEach(link => {
    if (link.id === "logout-button") {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        logoutAdmin();
        if (leaderboardRefreshInterval) {
          clearInterval(leaderboardRefreshInterval);
          leaderboardRefreshInterval = null;
        }
      });
    } else {
      link.addEventListener('click', () => {
        setTimeout(() => {
          displayRaceEventName();
          applyImages();
          setupRunnerAutocomplete();
          // Conditional page re-initialization if needed
          const currentPath = window.location.pathname;
          if (currentPath.includes("leaderboard.html")) {
            updateEnhancedLeaderboard();
            if (leaderboardRefreshInterval) clearInterval(leaderboardRefreshInterval);
            leaderboardRefreshInterval = setInterval(updateEnhancedLeaderboard, 10000);
          } else {
            if (leaderboardRefreshInterval) {
              clearInterval(leaderboardRefreshInterval);
              leaderboardRefreshInterval = null;
            }
          }
          if (currentPath.includes("index.html") || currentPath === "/") displayCheckpointLog();
          else if (currentPath.includes("settings.html")) displayCheckpointList();

        }, 50); 
      });
    }
  });

  // Add spinner on file input change for backdrop and banner
  const backdropInput = document.getElementById('backdropImage');
  const saveBackdropButton = document.getElementById('saveBackdrop');
  if (backdropInput && saveBackdropButton) {
    backdropInput.addEventListener('change', function(e) {
      if (backdropInput.files && backdropInput.files.length > 0) {
        showSpinner('Uploading backdrop image...');
        setTimeout(() => saveBackdropButton.click(), 0);
      } else {
        hideSpinner();
      }
    });
  }
  const bannerInput = document.getElementById('bannerImage');
  const saveBannerButton = document.getElementById('saveBanner');
  if (bannerInput && saveBannerButton) {
    bannerInput.addEventListener('change', function(e) {
      if (bannerInput.files && bannerInput.files.length > 0) {
        showSpinner('Uploading banner image...');
        setTimeout(() => saveBannerButton.click(), 0);
      } else {
        hideSpinner();
      }
    });
  }
});


// Log a checkpoint for a runner
function logCheckpoint() {
  const session = getUserSession();
  if (!session) {
    showNotification("Login required", "error");
    return;
  }
  let runnerId = document.getElementById("runnerId")?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }
  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found. Please import runner data first.`, "error");
    return;
  }
  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS and cannot log checkpoints`, "error");
    return;
  }
  if (checkpointData[runnerId].status === "dnf") {
    showNotification(`Runner ${runnerId} is marked as DNF and cannot log further checkpoints`, "error");
    return;
  }
  if (checkpointData[runnerId].status === "finished" || checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Finish")) {
    showNotification(`Runner ${runnerId} has already finished the race`, "error");
    return;
  }
  let timestamp = new Date().getTime();
  const existingCheckpoints = checkpointData[runnerId].checkpoints || [];
  let lastLoggedCheckpoint = existingCheckpoints.length > 0
    ? existingCheckpoints[existingCheckpoints.length - 1].checkpoint
    : null;
  let nextCheckpointIndex = 0;
  if (lastLoggedCheckpoint) {
      nextCheckpointIndex = checkpoints.indexOf(lastLoggedCheckpoint) + 1;
  }
  if (nextCheckpointIndex >= checkpoints.length) {
    showNotification(`Runner ${runnerId} has already completed all defined checkpoints.`, "info");
    return; 
  }
  let nextCheckpoint = checkpoints[nextCheckpointIndex];
  // Prevent double logging of the same checkpoint within 1 minute
  if (existingCheckpoints.length > 0) {
    const lastEntry = existingCheckpoints[existingCheckpoints.length - 1];
    if (
      lastEntry.checkpoint === nextCheckpoint &&
      timestamp - lastEntry.timestamp < 60000 // 60,000 ms = 1 minute
    ) {
      showNotification(`Checkpoint '${nextCheckpoint}' for Runner ${runnerId} was already logged less than 1 minute ago. Please wait before logging again.`, "warning");
      return;
    }
  }
  checkpointData[runnerId].checkpoints.push({
    checkpoint: nextCheckpoint,
    timestamp
  });
  if (nextCheckpoint === "Finish") {
      checkpointData[runnerId].status = "finished";
  } else {
      checkpointData[runnerId].status = "in-progress"; 
  }
  // Real-time sync
  socket.emit('updateCheckpointData', checkpointData);
  socket.emit('addActivity', {
    timestamp,
    html: `<div class='log-item-icon'><i class='fas ${getCheckpointIcon(nextCheckpoint)}'></i></div><div class='log-item-content'><div class='log-item-title'>Runner ${runnerId} reached ${nextCheckpoint}</div><div class='log-item-time'>${formatTimestamp(timestamp)}</div></div>`
  });
  showNotification(`Logged ${nextCheckpoint} for Runner ${runnerId}`, "success");
  if (document.getElementById("checkpointLog")) displayCheckpointLog(); 
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard(); 
  clearInput();
}

// Start the race for all eligible runners
function flagOffRace() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (Object.keys(checkpointData).length === 0) {
    showNotification("No runners registered. Please import runners first.", "error");
    return;
  }

  if (flagOffTime) {
      if (!confirm("The race has already been flagged off. Are you sure you want to re-flag? This will update the start time for runners who haven't started or finished yet, but could cause inconsistencies if some runners have already recorded times based on the previous flag-off.")) {
          return;
      }
  } else {
      if (!confirm("Are you sure you want to flag off the race? This will set the race start time and log the 'Start' checkpoint for all eligible runners who haven't started yet.")) {
        return;
      }
  }

  const newFlagOffTime = new Date().getTime();
  flagOffTime = newFlagOffTime; // Update global variable
  // Real-time sync for flagOffTime is not implemented here, but can be added if needed
  let startCount = 0;

  for (let runnerId in checkpointData) {
    const runner = checkpointData[runnerId];
    // Only add/update "Start" if not DNS, not DNF, not finished, and if "Start" is defined as the first checkpoint.
    if (runner.status === "dns" || runner.status === "dnf" || runner.status === "finished" || checkpoints[0] !== "Start") {
      continue;
    }

    const startCheckpointEntry = (runner.checkpoints || []).find(cp => cp.checkpoint === "Start");
    if (!startCheckpointEntry) { // If no "Start" checkpoint exists yet for this runner
      if (!runner.checkpoints) runner.checkpoints = [];
      runner.checkpoints.unshift({ // Add "Start" to the beginning
        checkpoint: "Start",
        timestamp: newFlagOffTime
      });
      runner.status = "in-progress"; 
      startCount++;
    } else {
        // Optionally, if re-flagging, one might update the existing Start time.
        // For now, we only add if not present.
    }
  }

  if (startCount === 0 && !flagOffTime) { // Check newFlagOffTime if it was just set
    showNotification("No eligible runners to start, or 'Start' is not the first defined checkpoint. Runners may have already started, finished, or are marked DNS/DNF.", "warning");
  } else if (startCount > 0) {
    showNotification(`Race flag-off processed! Logged/updated 'Start' checkpoint for ${startCount} runners at ${formatTimestamp(newFlagOffTime)}.`, "success");
  } else {
    showNotification(`Race flag-off time set to ${formatTimestamp(newFlagOffTime)}. No new runners were started (they may have already started or are ineligible).`, "info");
  }

  socket.emit('updateCheckpointData', checkpointData);
  socket.emit('addActivity', {
    timestamp: newFlagOffTime,
    html: `<div class='log-item-icon'><i class='fas fa-flag'></i></div><div class='log-item-content'><div class='log-item-title'>Race flagged off at ${formatTimestamp(newFlagOffTime)}</div></div>`
  });
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Mark runner as Did Not Start
function markRunnerDNS() {
  const session = getUserSession();
  if (!session) {
    showNotification("Login required", "error");
    return;
  }
  const runnerIdInput = document.getElementById("statusRunnerId");
  const runnerId = runnerIdInput?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }
  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found`, "error");
    return;
  }
  if ((checkpointData[runnerId].checkpoints || []).length > 1 || 
      ((checkpointData[runnerId].checkpoints || []).length === 1 && checkpointData[runnerId].checkpoints[0].checkpoint !== "Start")) {
    showNotification(`Runner ${runnerId} has recorded progress beyond 'Start' and cannot be marked as DNS. Consider DNF or clearing data.`, "error");
    return;
  }
   if (checkpointData[runnerId].status === "finished" || checkpointData[runnerId].status === "dnf") {
    showNotification(`Runner ${runnerId} is already finished or DNF and cannot be marked as DNS.`, "error");
    return;
  }
  checkpointData[runnerId].status = "dns";
  checkpointData[runnerId].checkpoints = []; // DNS means no race participation, clear any (potential Start) checkpoints.
  checkpointData[runnerId].lastUpdate = new Date().getTime(); 
  socket.emit('updateCheckpointData', checkpointData);
  socket.emit('addActivity', {
    timestamp: checkpointData[runnerId].lastUpdate,
    html: `<div class='log-item-icon'><i class='fas fa-ban'></i></div><div class='log-item-content'><div class='log-item-title'>Runner ${runnerId} marked as DNS</div><div class='log-item-time'>${formatTimestamp(checkpointData[runnerId].lastUpdate)}</div></div>`
  });
  showNotification(`Runner ${runnerId} marked as DNS`, "success");
  if (runnerIdInput) runnerIdInput.value = "";
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Mark runner as Did Not Finish
function markRunnerDNF() {
  const session = getUserSession();
  if (!session) {
    showNotification("Login required", "error");
    return;
  }
  const runnerIdInput = document.getElementById("statusRunnerId");
  const runnerId = runnerIdInput?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }
  if (checkpointData[runnerId].status === "finished") {
    showNotification(`Runner ${runnerId} has already finished the race`, "error");
    return;
  }
  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS and cannot be marked as DNF`, "error");
    return;
  }
  checkpointData[runnerId].status = "dnf";
  checkpointData[runnerId].lastUpdate = new Date().getTime(); 
  socket.emit('updateCheckpointData', checkpointData);
  socket.emit('addActivity', {
    timestamp: checkpointData[runnerId].lastUpdate,
    html: `<div class='log-item-icon'><i class='fas fa-times-circle'></i></div><div class='log-item-content'><div class='log-item-title'>Runner ${runnerId} marked as DNF</div><div class='log-item-time'>${formatTimestamp(checkpointData[runnerId].lastUpdate)}</div></div>`
  });
  showNotification(`Runner ${runnerId} marked as DNF`, "success");
  if (runnerIdInput) runnerIdInput.value = "";
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Clear runner ID input
function clearInput() {
  const runnerIdInput = document.getElementById("runnerId");
  if (runnerIdInput) {
    runnerIdInput.value = "";
    runnerIdInput.focus();
  }
}

function displayCheckpointLog() {
  const logList = document.getElementById("checkpointLog");
  if (!logList) return; 

  logList.innerHTML = "";
  let foundEntries = false;
  const activities = [];

  for (let runnerId in checkpointData) {
    const runnerInfo = checkpointData[runnerId];
    const runnerName = runnerInfo.name || "Unknown Name";

    if (runnerInfo.status === "dns" || runnerInfo.status === "dnf") {
      if(runnerInfo.lastUpdate) { // Only show status entries if they have a lastUpdate timestamp
        const statusTime = ` (${formatTimestamp(runnerInfo.lastUpdate)})`;
        const statusText = runnerInfo.status === "dns" ? "Did Not Start" : "Did Not Finish";
        const statusIcon = getStatusIcon(runnerInfo.status);
        activities.push({
          timestamp: runnerInfo.lastUpdate,
          html: `
            <div class="log-item-icon status-icon ${runnerInfo.status}">
              <i class="fas ${statusIcon}"></i>
            </div>
            <div class="log-item-content">
              <div class="log-item-title">Runner ${runnerId} (${runnerName}) <span class="badge status-badge ${runnerInfo.status}"><i class="fas ${statusIcon}"></i> ${runnerInfo.status.toUpperCase()}</span></div>
              <div class="log-item-time">${statusText}${statusTime}</div>
            </div>
          `
        });
        foundEntries = true;
      }
    }

    (runnerInfo.checkpoints || []).forEach((entry) => {
      foundEntries = true;
      const icon = getCheckpointIcon(entry.checkpoint);
      const timeFormatted = formatTimestamp(entry.timestamp);
      activities.push({
        timestamp: entry.timestamp,
        html: `
          <div class="log-item-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="log-item-content">
            <div class="log-item-title">Runner ${runnerId} (${runnerName}) reached ${entry.checkpoint}</div>
            <div class="log-item-time">${timeFormatted}</div>
          </div>
        `
      });
    });
  }

  activities.sort((a, b) => b.timestamp - a.timestamp); 

  if (!foundEntries) {
    logList.innerHTML = `
      <li class="log-item">
        <div class="log-item-icon"><i class="fas fa-info-circle"></i></div>
        <div class="log-item-content">
          <div class="log-item-title">No activity yet.</div>
          <div class="log-item-time">Use "Runner Check-in" or "Race Control" to log activities.</div>
        </div>
      </li>`;
  } else {
    activities.forEach(activity => {
      let listItem = document.createElement("li");
      listItem.classList.add("fade-in", "log-item");
      listItem.innerHTML = activity.html;
      logList.appendChild(listItem);
    });
  }
}


function resetData() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (confirm("Are you sure you want to reset ALL data? This includes runner data, checkpoints, race progress, event name, and appearance settings. This cannot be undone.")) {
    // Clear localStorage for appearance only (optional)
    localStorage.removeItem("checkpointData");
    localStorage.removeItem("importedRunnerIDs"); 
    localStorage.removeItem("raceEventName");
    localStorage.removeItem("flagOffTime");
    localStorage.removeItem("backdropImage");
    localStorage.removeItem("bannerImage");
    localStorage.removeItem("checkpoints"); 

    // Emit reset to server (this will trigger allData broadcast)
    socket.emit('resetAllData');

    // Locally reset variables for immediate UI feedback
    checkpointData = {};
    flagOffTime = null;
    leaderboard = [];
    checkpoints = ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
    localStorage.setItem("checkpoints", JSON.stringify(checkpoints)); 

    showNotification("All data has been reset", "info");
    
    if (document.getElementById("checkpointLog")) displayCheckpointLog();
    if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
    
    displayRaceEventName(); 
    applyImages(); 
    setupRunnerAutocomplete(); 
    
    if (window.location.pathname.includes("settings.html")) {
        displayCheckpointList(); 
        const raceEventNameInput = document.getElementById("raceEventName");
        if(raceEventNameInput) raceEventNameInput.value = ""; 
        const importFileNameSpan = document.getElementById("importFileName");
        if(importFileNameSpan) importFileNameSpan.textContent = ""; 
    }
  }
}

function exportToCSV() {
  // Use the in-memory checkpointData (synced with server)
  if (!checkpointData || Object.keys(checkpointData).length === 0) {
    showNotification("No runner data to export.", "warning");
    return;
  }
  const allRunners = [];
  const now = new Date().getTime();
  for (let runnerId in checkpointData) {
    const runnerEntry = checkpointData[runnerId];
    const data = runnerEntry.checkpoints || [];
    const name = runnerEntry.name || "Unknown Runner";
    let status = runnerEntry.status || (data.some(e => e.checkpoint === "Finish") ? "finished" : data.length > 0 ? "in-progress" : "dns");
    if (data.some(e => e.checkpoint === "Finish")) {
        status = "finished";
    }
    const completedCheckpoints = data.map(e => e.checkpoint);
    let priority = 0;
    if (status === "finished") priority = 3;
    else if (status === "in-progress") priority = 2;
    else if (status === "dnf") priority = 1;
    else if (status === "dns") priority = 0;

    // Calculate total time and pace
    let startTime = data.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime;
    let finishTime = data.find(e => e.checkpoint === "Finish")?.timestamp;
    let lastCheckpointData = data.length > 0 ? data[data.length - 1] : null;
    let endTime = finishTime || (lastCheckpointData ? lastCheckpointData.timestamp : null);
    let distanceKm = 0;
    if (finishTime) {
      distanceKm = RACE_DISTANCE_KM;
    } else if (lastCheckpointData) {
      const lastCpIndex = checkpoints.indexOf(lastCheckpointData.checkpoint);
      if (lastCpIndex !== -1 && checkpoints.length > 1) {
        distanceKm = (lastCpIndex / (checkpoints.length - 1)) * RACE_DISTANCE_KM;
      }
    }
    let totalTime = (startTime && endTime && endTime > startTime) ? (endTime - startTime) : null;
    let pace = (totalTime && distanceKm > 0) ? totalTime / distanceKm : null;

    // Calculate split times only (no cumulative)
    let splitTimes = [];
    let prevTimestamp = startTime;
    for (let i = 0; i < checkpoints.length; i++) {
      const cpName = checkpoints[i];
      const cpEntry = data.find(e => e.checkpoint === cpName);
      if (cpEntry && prevTimestamp && cpEntry.timestamp > prevTimestamp) {
        let split = cpEntry.timestamp - prevTimestamp;
        splitTimes.push(split);
        prevTimestamp = cpEntry.timestamp;
      } else {
        splitTimes.push(null);
        prevTimestamp = cpEntry ? cpEntry.timestamp : prevTimestamp;
      }
    }

    allRunners.push({
      runner: runnerId,
      name,
      pace,
      totalTime,
      status,
      priority,
      data,
      completedCheckpoints,
      lastCheckpoint: lastCheckpointData ? lastCheckpointData.checkpoint : "None",
      lastTimestamp: lastCheckpointData ? lastCheckpointData.timestamp : null,
      startTimestamp: startTime,
      splitTimes
    });
  }
  // Improved sort and rank: finished/in-progress first, then dnf, then dns
  allRunners.forEach(runner => {
    const checkpointsArr = runner.data || [];
    let furthestIndex = 0;
    let furthestTimestamp = null;
    let startTime = checkpointsArr.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime;
    if (checkpointsArr.length > 0 && startTime) {
      let maxIndex = 0;
      let time = null;
      checkpointsArr.forEach(cp => {
        const idx = checkpoints.indexOf(cp.checkpoint);
        if (idx > maxIndex && cp.timestamp && cp.timestamp > startTime) {
          maxIndex = idx;
          time = cp.timestamp;
        }
      });
      furthestIndex = maxIndex;
      furthestTimestamp = time;
    }
    runner.furthestIndex = furthestIndex;
    runner.furthestTimestamp = furthestTimestamp;
  });
  // Status priority: finished/in-progress = 2, dnf = 1, dns = 0
  function getStatusPriority(status) {
    if (status === 'finished' || status === 'in-progress') return 2;
    if (status === 'dnf') return 1;
    if (status === 'dns') return 0;
    return -1;
  }
  allRunners.sort((a, b) => {
    const aPriority = getStatusPriority(a.status);
    const bPriority = getStatusPriority(b.status);
    if (aPriority !== bPriority) return bPriority - aPriority;
    // If both are not DNS/DNF, sort by progress and time
    if (b.furthestIndex !== a.furthestIndex) {
      return b.furthestIndex - a.furthestIndex;
    }
    if (a.furthestTimestamp !== null && b.furthestTimestamp !== null) {
      return a.furthestTimestamp - b.furthestTimestamp;
    }
    return 0;
  });
  let rank = 1;
  let dnfDnsStartRank = allRunners.length;
  allRunners.forEach(entry => {
    if (entry.status !== 'dnf' && entry.status !== 'dns') {
      entry.globalRank = rank++;
    }
  });
  allRunners.forEach(entry => {
    if (entry.status === 'dnf' || entry.status === 'dns') {
      entry.globalRank = dnfDnsStartRank--;
    }
  });

  // CSV header (no cumulative columns)
  let csvContent = "Rank,Runner ID,Runner Name,Average Pace,Status,Progress (%),Last Checkpoint,Total Time,Last Update Timestamp";
  checkpoints.forEach((cp, idx) => {
    csvContent += `,Split: ${cp}`;
  });
  csvContent += "\n";

  allRunners.forEach((entry, idx) => {
    const rank = idx + 1;
    const runnerId = (entry.runner || "").toString().replace(/"/g, '""');
    const name = (entry.name || "").toString().replace(/"/g, '""');
    const paceFormatted = entry.pace && entry.pace > 0 ? formatPace(entry.pace, RACE_DISTANCE_KM) : "N/A";
    const status = (entry.status || "").toUpperCase();
    const progressCount = (entry.completedCheckpoints || []).length;
    const totalConfiguredCheckpoints = checkpoints.length > 0 ? checkpoints.length : 1;
    const progressPercent = Math.round((progressCount / totalConfiguredCheckpoints) * 100);
    const lastCheckpoint = (entry.lastCheckpoint || "").toString().replace(/"/g, '""');
    const totalTimeFormatted = entry.totalTime && entry.totalTime > 0 ? formatTime(entry.totalTime) : "N/A";
    const lastUpdateFormatted = entry.lastTimestamp ? new Date(entry.lastTimestamp).toISOString() : "N/A";
    let row = `${rank},"${runnerId}","${name}","${paceFormatted}","${status}",${progressPercent},"${lastCheckpoint}","${totalTimeFormatted}","${lastUpdateFormatted}"`;
    // Add split columns only
    for (let i = 0; i < checkpoints.length; i++) {
      row += "," + (entry.splitTimes[i] !== null && entry.splitTimes[i] !== undefined ? formatTime(entry.splitTimes[i]) : "N/A");
    }
    csvContent += row + "\n";
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const raceNameForFile = (localStorage.getItem("raceEventName") || "RaceData").replace(/\s+/g, '_');
  link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${raceNameForFile}_Leaderboard_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showNotification("Leaderboard data exported successfully!", "success");
}

function importRunnerData(files) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const path = window.location.pathname;
  if (!path.includes("settings.html")) {
    showNotification("This function is only available on the settings page.", "error");
    return;
  }

  if (!files || files.length === 0) {
    showNotification("No file selected", "error");
    const importFileNameSpan = document.getElementById("importFileName");
    if(importFileNameSpan) importFileNameSpan.textContent = ""; // Clear file name display
    return;
  }

  const file = files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const contents = e.target.result;
    if (file.name.endsWith('.csv')) {
      processCSVImport(contents);
    } else {
      showNotification("Please upload a CSV file (e.g., .csv)", "error");
       const importFileNameSpan = document.getElementById("importFileName");
       if(importFileNameSpan) importFileNameSpan.textContent = "Invalid file type";
    }
  };
  reader.onerror = function() {
    showNotification("Error reading file", "error");
  };
  reader.readAsText(file);
}

function processCSVImport(csvData) {
  if (!isAuthenticated) return;

  const lines = csvData.split(/\r\n|\n/); 
  if (lines.length <= 1 && lines[0].trim() === "") {
    showNotification("CSV file is empty or has no data rows", "error");
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const runnerIdIndex = headers.findIndex(h => h === 'runner id' || h === 'id');
  const nameIndex = headers.findIndex(h => h === 'name' || h === 'runner name');

  if (runnerIdIndex === -1) {
    showNotification("CSV must contain a 'Runner ID' (or 'ID') column.", "error");
    return;
  }
   if (nameIndex === -1) {
    showNotification("CSV must contain a 'Name' (or 'Runner Name') column.", "error"); 
    return;
  }

  let newRunners = 0;
  let updatedRunners = 0;
  let processedCount = 0;
  let existingRunnerIDs = new Set(Object.keys(checkpointData));
  importedRunnerIDs = importedRunnerIDs || [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length <= Math.max(runnerIdIndex, nameIndex)) {
        console.warn(`Skipping malformed CSV line ${i+1}: ${lines[i]}`);
        continue; 
    }

    const runnerId = values[runnerIdIndex].trim();
    const name = values[nameIndex] ? values[nameIndex].trim() : "Unnamed Runner";

    if (!runnerId || !name) { 
        console.warn(`Skipping line ${i+1}: Missing Runner ID or Name. ID: '${runnerId}', Name: '${name}'`);
        continue;
    }

    if (!existingRunnerIDs.has(runnerId)) {
      checkpointData[runnerId] = {
        name: name,
        checkpoints: [],
        status: null 
      };
      newRunners++;
      existingRunnerIDs.add(runnerId);
    } else {
      checkpointData[runnerId].name = name;
      updatedRunners++;
    }
    if (!importedRunnerIDs.includes(runnerId)) importedRunnerIDs.push(runnerId);
    processedCount++;
  }

  socket.emit('updateCheckpointData', checkpointData);
  showNotification(`Successfully processed ${processedCount} runners (${newRunners} new, ${updatedRunners} updated).`, "success");
  setupRunnerAutocomplete(); 
  if (document.getElementById("checkpointLog")) displayCheckpointLog(); 
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard(); 
}

function parseCSVLine(line) {
  const result = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && i + 1 < line.length && line[i+1] === '"') { // Escaped quote
        if (inQuotes) currentField += '"'; // Add single quote if inside a quoted field
        i++; 
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField); 
  return result.map(field => field.trim()); // Trim each field
}


function setupRunnerAutocomplete() {
  const inputs = [
    document.getElementById("runnerId"),      
    document.getElementById("statusRunnerId") 
  ].filter(input => input); 
  
  let datalist = document.getElementById("runnerIdList");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "runnerIdList";
    document.body.appendChild(datalist); 
  }

  datalist.innerHTML = ""; 

  if (importedRunnerIDs.length > 0) {
    importedRunnerIDs.forEach(id => {
      const option = document.createElement("option");
      option.value = id;
      if (checkpointData[id] && checkpointData[id].name) {
         option.textContent = checkpointData[id].name;
      }
      datalist.appendChild(option);
    });
  }

  inputs.forEach(input => {
    if (importedRunnerIDs.length > 0) {
      input.setAttribute("list", "runnerIdList");
    } else {
      input.removeAttribute("list"); 
    }
  });
}


function saveRaceEventName() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const raceEventNameInput = document.getElementById("raceEventName");
  if (!raceEventNameInput) return;
  const newName = raceEventNameInput.value.trim();
  if (!newName) {
    showNotification("Please enter a race event name", "error");
    return;
  }
  raceEventName = newName;
  socket.emit('updateRaceEventName', raceEventName);
  showNotification(`Race event name "${raceEventName}" saved`, "success");
  displayRaceEventName(); 
}

function displayRaceEventName() {
  const name = raceEventName || "Race Event Not Set";
  const elementsToUpdate = [
    document.getElementById("bannerRaceEventName"),
    document.getElementById("leaderboardRaceEventName"), 
    document.getElementById("leaderboardBannerRaceEventName"), 
    document.getElementById("settingsRaceEventName"), 
  ].filter(el => el); 
  elementsToUpdate.forEach(element => {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        if (element.id === "raceEventName" && window.location.pathname.includes("settings.html")){
             element.value = name === "Race Event Not Set" ? "" : name;
        } else {
            element.textContent = name;
        }
    } else {
        element.textContent = name;
    }
    element.title = name; 
  });
  if(window.location.pathname.includes("settings.html")){
    const raceNameInput = document.getElementById("raceEventName");
    if(raceNameInput && (name !== "Race Event Not Set")) {
        raceNameInput.value = name;
    }
  }
}

function addCheckpoint() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const checkpointNameInput = document.getElementById("checkpointName");
  if (!checkpointNameInput) return;
  const checkpointName = checkpointNameInput.value.trim();

  if (!checkpointName) {
    showNotification("Please enter a checkpoint name", "error");
    return;
  }
  if (checkpointName.toLowerCase() === "start" || checkpointName.toLowerCase() === "finish"){
    showNotification("'Start' and 'Finish' are reserved names and cannot be added manually as custom checkpoints.", "error");
    return;
  }

  if (checkpoints.map(c => c.toLowerCase()).includes(checkpointName.toLowerCase())) {
    showNotification("Checkpoint name already exists (case-insensitive)", "error");
    return;
  }

  const finishIndex = checkpoints.indexOf("Finish");
  if (finishIndex !== -1) {
    checkpoints.splice(finishIndex, 0, checkpointName); 
  } else {
    checkpoints.push(checkpointName);
    checkpoints.push("Finish");
  }
  
  // Ensure "Start" is first if it got displaced or wasn't there (defensive)
  if (checkpoints[0] !== "Start") {
    checkpoints = checkpoints.filter(cp => cp.toLowerCase() !== "start");
    checkpoints.unshift("Start");
  }
  // Ensure "Finish" is last
  if (checkpoints[checkpoints.length - 1] !== "Finish") {
    checkpoints = checkpoints.filter(cp => cp.toLowerCase() !== "finish");
    checkpoints.push("Finish");
  }


  socket.emit('updateCheckpoints', checkpoints);
  checkpointNameInput.value = "";
  displayCheckpointList();
  showNotification(`Checkpoint "${checkpointName}" added`, "success");
}

function deleteCheckpoint(checkpointToDelete) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (checkpointToDelete.toLowerCase() === "start" || checkpointToDelete.toLowerCase() === "finish") {
    showNotification("Cannot delete the immutable 'Start' or 'Finish' checkpoints.", "error");
    return;
  }

  if (!confirm(`Are you sure you want to delete the "${checkpointToDelete}" checkpoint? This will remove it from the configuration and from all runner logs where it appears.`)) {
    return;
  }

  checkpoints = checkpoints.filter(c => c.toLowerCase() !== checkpointToDelete.toLowerCase());

  for (let runnerId in checkpointData) {
    if (checkpointData[runnerId].checkpoints) {
        checkpointData[runnerId].checkpoints = checkpointData[runnerId].checkpoints.filter(
          entry => entry.checkpoint.toLowerCase() !== checkpointToDelete.toLowerCase()
        );
    }
  }

  socket.emit('updateCheckpoints', checkpoints);
  socket.emit('updateCheckpointData', checkpointData);
  displayCheckpointList(); 
  showNotification(`Checkpoint "${checkpointToDelete}" deleted`, "success");
  
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
}

function displayCheckpointList() {
  if (!window.location.pathname.includes("settings.html") || !isAuthenticated) return;

  const checkpointListUl = document.getElementById("checkpointList");
  if (!checkpointListUl) return;

  checkpointListUl.innerHTML = ""; 

  if (!checkpoints || checkpoints.length === 0) { // Should always have Start/Finish
    checkpoints = ["Start", "Finish"]; // Reset to minimal defaults if empty
    localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
  }

  checkpoints.forEach(checkpoint => {
    const li = document.createElement("li");
    li.classList.add("fade-in", "log-item");

    const icon = getCheckpointIcon(checkpoint);
    const isImmutable = checkpoint.toLowerCase() === "start" || checkpoint.toLowerCase() === "finish";

    li.innerHTML = `
      <div class="log-item-icon">
        <i class="fas ${icon}"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">${checkpoint}</div>
      </div>
      ${isImmutable ? '<span class="immutable-label">Immutable</span>' : `
        <button class="btn btn-danger btn-sm" onclick="deleteCheckpoint('${checkpoint.replace(/'/g, "\\'")}')" title="Delete ${checkpoint}">
          <i class="fas fa-trash"></i> Delete
        </button>
      `}
    `;
    checkpointListUl.appendChild(li);
  });
}

// --- Spinner Utility ---
function showSpinner(message = "Uploading image...") {
  let spinner = document.getElementById("image-upload-spinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "image-upload-spinner";
    spinner.style.position = "fixed";
    spinner.style.top = 0;
    spinner.style.left = 0;
    spinner.style.width = "100vw";
    spinner.style.height = "100vh";
    spinner.style.background = "rgba(0,0,0,0.4)";
    spinner.style.display = "flex";
    spinner.style.alignItems = "center";
    spinner.style.justifyContent = "center";
    spinner.style.zIndex = 9999;
    spinner.innerHTML = `
      <div style="background: #fff; padding: 2em 3em; border-radius: 12px; box-shadow: 0 2px 16px #0002; display: flex; flex-direction: column; align-items: center;">
        <div class="spinner" style="margin-bottom: 1em;">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
        </div>
        <div style="font-size: 1.1em; color: #333;">${message}</div>
      </div>
    `;
    document.body.appendChild(spinner);
  } else {
    spinner.style.display = "flex";
  }
}
function hideSpinner() {
  let spinner = document.getElementById("image-upload-spinner");
  if (spinner) spinner.style.display = "none";
}
// --- End Spinner Utility ---

function saveBackdropImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  const backdropInput = document.getElementById("backdropImage");
  if (!backdropInput || !backdropInput.files || backdropInput.files.length === 0) {
    showNotification("Please select a backdrop image file.", "error"); return;
  }
  const file = backdropInput.files[0];
  if (!file.type.startsWith('image/')) {
    showNotification("Please upload an image file (e.g., JPG, PNG, GIF).", "error"); return;
  }
  if (file.size > 5 * 1024 * 1024) { 
    showNotification("Image size exceeds 5MB limit.", "error"); return;
  }
  showSpinner("Uploading backdrop image...");
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      appearance.backdrop = e.target.result;
      socket.emit('updateAppearance', { backdrop: appearance.backdrop });
      applyImages(); 
      showNotification("Backdrop image saved.", "success");
      backdropInput.value = ""; 
      preloadImages(); 
    } catch (error) {
      showNotification(error.name === 'QuotaExceededError' ? "Storage limit exceeded." : "Failed to save image.", "error");
      console.error("Backdrop save error:", error);
    }
    hideSpinner();
  };
  reader.onerror = function() { showNotification("Error reading backdrop image.", "error"); hideSpinner(); };
  reader.readAsDataURL(file);
}

function saveBannerImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  const bannerInput = document.getElementById("bannerImage");
   if (!bannerInput || !bannerInput.files || bannerInput.files.length === 0) {
    showNotification("Please select a banner image file.", "error"); return;
  }
  const file = bannerInput.files[0];
  if (!file.type.startsWith('image/')) {
    showNotification("Please upload an image file.", "error"); return;
  }
  if (file.size > 5 * 1024 * 1024) { 
    showNotification("Image size exceeds 5MB limit.", "error"); return;
  }
  showSpinner("Uploading banner image...");
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      appearance.banner = e.target.result;
      socket.emit('updateAppearance', { banner: appearance.banner });
      applyImages();
      showNotification("Banner image saved.", "success");
      bannerInput.value = ""; 
      preloadImages();
    } catch (error) {
      showNotification(error.name === 'QuotaExceededError' ? "Storage limit exceeded." : "Failed to save image.", "error");
      console.error("Banner save error:", error);
    }
    hideSpinner();
  };
   reader.onerror = function() { showNotification("Error reading banner image.", "error"); hideSpinner(); };
  reader.readAsDataURL(file);
}

function clearBackdropImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  appearance.backdrop = '';
  socket.emit('updateAppearance', { backdrop: '' });
  applyImages(); 
  showNotification("Backdrop image cleared.", "success");
  const backdropInput = document.getElementById("backdropImage");
  if (backdropInput) backdropInput.value = ""; 
  preloadImages();
}

function clearBannerImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  appearance.banner = '';
  socket.emit('updateAppearance', { banner: '' });
  applyImages(); 
  showNotification("Banner image cleared.", "success");
  const bannerInput = document.getElementById("bannerImage");
  if(bannerInput) bannerInput.value = ""; 
  preloadImages();
}

function registerUser() {
    const usernameInput = document.getElementById("registerUsername");
    const passwordInput = document.getElementById("registerPassword");
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
        showNotification("Please enter both username and password", "error");
        return;
    }
    if (users.some(u => u.username === username)) {
        showNotification("Username already exists", "error");
        return;
    }
    // Always assign a unique id
    const user = { id: Date.now().toString() + Math.floor(Math.random()*1000).toString(), username, password };
    users.push(user);
    socket.emit('addUser', user);
    showNotification(`User ${username} registered`, "success");
    usernameInput.value = "";
    passwordInput.value = "";
    displayUserList();
}

// Show/hide registration form based on session
function showRegistrationCardIfAdmin() {
    const session = getUserSession();
    const regCard = document.getElementById("user-registration-card");
    if (regCard) {
        if (session && session.type === "admin") {
            regCard.style.display = "block";
        } else {
            regCard.style.display = "none";
        }
    }
}

function registerUserFromSettings() {
    const username = document.getElementById("new-username-settings").value.trim();
    const password = document.getElementById("new-password-settings").value;
    if (!username || !password) {
        showNotification("Please enter both username and password", "error");
        return;
    }
    if (users.some(u => u.username === username)) {
        showNotification("Username already exists", "error");
        return;
    }
    // Always assign a unique id
    const user = { id: Date.now().toString() + Math.floor(Math.random()*1000).toString(), username, password };
    users.push(user);
    socket.emit('addUser', user);
    showNotification(`User ${username} registered`, "success");
    document.getElementById("new-username-settings").value = "";
    document.getElementById("new-password-settings").value = "";
    displayUserList();
}

function showRegistrationCardSettingsIfAdmin() {
    const session = getUserSession();
    const regCard = document.getElementById("user-registration-card-settings");
    if (regCard) {
        if (session && session.type === "admin") {
            regCard.style.display = "block";
        } else {
            regCard.style.display = "none";
        }
    }
}

function removeUser(userId) {
    console.log('removeUser called with userId:', userId);
    if (!isAuthenticated) {
        showNotification("Admin access required", "error");
        return;
    }
    users = users.filter(u => u.id !== userId);
    socket.emit('removeUser', userId);
    showNotification(`User removed`, "success");
    displayUserList();
}

function displayUserList() {
    if (!window.location.pathname.includes("settings.html") || !isAuthenticated) return;
    const userListUl = document.getElementById("userList");
    if (!userListUl) return;
    userListUl.innerHTML = "";
    const users = getRegisteredUsers();
    if (users.length === 0) {
        userListUl.innerHTML = '<li class="log-item">No users registered.</li>';
        return;
    }
    users.forEach(user => {
        const li = document.createElement("li");
        li.classList.add("fade-in", "log-item");
        li.innerHTML = `
            <div class="log-item-content">
                <div class="log-item-title">${user.username}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeUser('${user.id}')" title="Remove ${user.username}">
                <i class="fas fa-trash"></i> Remove
            </button>
        `;
        userListUl.appendChild(li);
    });
}

function updateWelcomeBanner() {
  const session = getUserSession();
  const welcomeHeader = document.querySelector('.welcome-card .banner-content h1');
  if (welcomeHeader) {
    if (session && session.type === 'admin') {
      welcomeHeader.textContent = 'Welcome, Admin!';
    } else if (session && session.type === 'user') {
      welcomeHeader.textContent = `Welcome, ${session.username}!`;
    } else {
      welcomeHeader.textContent = 'Welcome!';
    }
  }
}