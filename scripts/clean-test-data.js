const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'database.json');
const ALERTS_DIR = path.join(__dirname, '..', 'data', 'alerts');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Real users to keep
const REAL_USER_IDS = new Set([
  '1781452990519z22az',   // tester1
  '1781453166328psnl3',   // adminpanel
  '1781454923019xkhhw',   // autotest98231
  '1786462677503nat78',   // demo
]);

const before = { users: db.users.length, alerts: db.alerts.length };

// Filter users
db.users = db.users.filter(u => REAL_USER_IDS.has(u.id));

// Filter alerts — keep only those belonging to real users
db.alerts = db.alerts.filter(a => REAL_USER_IDS.has(a.userId));

// Delete alert images NOT belonging to real users
let filesDeleted = 0;
if (fs.existsSync(ALERTS_DIR)) {
  for (const file of fs.readdirSync(ALERTS_DIR)) {
    if (file === '.' || file === '..') continue;
    // Check if any real user ID appears in the filename
    const isReal = [...REAL_USER_IDS].some(uid => file.includes(uid));
    if (!isReal) {
      try {
        fs.unlinkSync(path.join(ALERTS_DIR, file));
        filesDeleted++;
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err.message);
      }
    }
  }
}

// Write cleaned database atomically
const tempFile = `${DB_FILE}.tmp`;
fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
fs.renameSync(tempFile, DB_FILE);

const after = { users: db.users.length, alerts: db.alerts.length };

console.log('=== Database Cleanup Complete ===');
console.log(`Users:  ${before.users} → ${after.users}  (removed ${before.users - after.users})`);
console.log(`Alerts: ${before.alerts} → ${after.alerts}  (removed ${before.alerts - after.alerts})`);
console.log(`Files:  deleted ${filesDeleted} test alert images`);
console.log('');
console.log('Remaining users:');
db.users.forEach(u => console.log(`  - ${u.username} (${u.id})`));
