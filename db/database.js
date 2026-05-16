const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'store.db');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    cat_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE SET NULL,
    qty        INTEGER NOT NULL DEFAULT 0,
    price      INTEGER NOT NULL DEFAULT 1,
    low_thresh INTEGER NOT NULL DEFAULT 5,
    active     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS students (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    pin     TEXT NOT NULL,
    tickets INTEGER NOT NULL DEFAULT 0,
    active  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    item_id     INTEGER NOT NULL REFERENCES items(id),
    item_name   TEXT NOT NULL,
    price       INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    code        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    fulfilled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    type       TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed default settings
const seedSettings = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
seedSettings.run('admin_password', 'scorpions');
seedSettings.run('store_open', '1');
seedSettings.run('store_name', 'Scorpion Class Store');

// Seed default categories
const seedCat = db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`);
['Supplies','Snacks','Rewards','Books','Other'].forEach(c => seedCat.run(c));

// Seed sample items if none exist
const itemCount = db.prepare('SELECT COUNT(*) as n FROM items').get().n;
if (itemCount === 0) {
  const supplyId = db.prepare(`SELECT id FROM categories WHERE name='Supplies'`).get()?.id;
  const rewardId = db.prepare(`SELECT id FROM categories WHERE name='Rewards'`).get()?.id;
  const snackId  = db.prepare(`SELECT id FROM categories WHERE name='Snacks'`).get()?.id;
  if (supplyId) {
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Pencil',supplyId,20,1,5);
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Eraser',supplyId,15,1,5);
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Ruler',supplyId,10,3,3);
  }
  if (rewardId) {
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Sticker Pack',rewardId,30,2,8);
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Homework Pass',rewardId,5,10,2);
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Sit Anywhere Pass',rewardId,8,8,2);
  }
  if (snackId) {
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Fruit Snack',snackId,20,3,6);
    db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`).run('Juice Box',snackId,12,4,4);
  }
}

module.exports = db;
