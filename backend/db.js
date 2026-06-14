const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'alerts');

// In-memory data store
let db = {
  users: [],
  alerts: []
};

// Initialize DB and folders
function init() {
  // Ensure DB directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Ensure uploads directory exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Load database from file if it exists
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
      // Double check sections exist
      db.users = db.users || [];
      db.alerts = db.alerts || [];
    } catch (err) {
      console.error('Failed to parse database.json, starting fresh:', err);
      save();
    }
  } else {
    save();
  }
}

// Save database to file
function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save database.json:', err);
  }
}

// User Management
async function createUser(username, password) {
  const existingUser = findUserByUsername(username);
  if (existingUser) {
    throw new Error('Username already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const newUser = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    username: username.toLowerCase().trim(),
    passwordHash
  };

  db.users.push(newUser);
  save();

  // Return user without password hash
  const { passwordHash: _, ...userWithoutHash } = newUser;
  return userWithoutHash;
}

function findUserByUsername(username) {
  if (!username) return null;
  const lowerName = username.toLowerCase().trim();
  return db.users.find(u => u.username === lowerName) || null;
}

async function verifyUser(username, password) {
  const user = findUserByUsername(username);
  if (!user) return null;

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return null;

  const { passwordHash: _, ...userWithoutHash } = user;
  return userWithoutHash;
}

// Alert / Motion Detection Event Management
function addAlert(userId, cameraName, base64Image) {
  const alertId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  let imagePath = '';

  if (base64Image) {
    try {
      // Expecting a base64 string, clean it if it contains headers
      const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      let ext = 'jpg';
      let data = base64Image;

      if (matches && matches.length === 3) {
        ext = matches[1];
        data = matches[2];
      }

      const fileName = `alert_${userId}_${alertId}.${ext}`;
      const fullPath = path.join(UPLOADS_DIR, fileName);

      fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
      imagePath = `/uploads/alerts/${fileName}`;
    } catch (err) {
      console.error('Error saving base64 alert image:', err);
    }
  }

  const newAlert = {
    id: alertId,
    userId,
    cameraName: cameraName || 'Unknown Camera',
    timestamp: new Date().toISOString(),
    imagePath
  };

  db.alerts.push(newAlert);
  save();

  return newAlert;
}

function getAlertsForUser(userId) {
  return db.alerts
    .filter(a => a.userId === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function deleteAlert(userId, alertId) {
  const index = db.alerts.findIndex(a => a.id === alertId && a.userId === userId);
  if (index !== -1) {
    const alert = db.alerts[index];
    // Delete physical file if it exists
    if (alert.imagePath) {
      const fullPath = path.join(__dirname, '..', 'public', alert.imagePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          console.error('Failed to delete physical file:', err);
        }
      }
    }
    db.alerts.splice(index, 1);
    save();
    return true;
  }
  return false;
}

// Initialize on require
init();

module.exports = {
  createUser,
  findUserByUsername,
  verifyUser,
  addAlert,
  getAlertsForUser,
  deleteAlert
};
