const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const crypto  = require('crypto');

function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// ── STORE STATUS ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  const open = db.prepare(`SELECT value FROM settings WHERE key='store_open'`).get()?.value;
  const name = db.prepare(`SELECT value FROM settings WHERE key='store_name'`).get()?.value;
  res.json({ open: open === '1', name });
});

// ── LOGIN ────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { pin } = req.body;
  if (!pin?.trim()) return res.status(400).json({ error: 'PIN required' });
  const student = db.prepare(`SELECT id, name, tickets FROM students WHERE pin=? AND active=1`).get(pin.trim());
  if (!student) return res.status(401).json({ error: 'Invalid PIN. Check with your teacher.' });
  req.session.studentId = student.id;
  res.json({ id: student.id, name: student.name, tickets: student.tickets });
});

router.post('/logout', (req, res) => {
  req.session.studentId = null;
  res.json({ ok: true });
});

// ── REGISTER ─────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, pin } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Please enter your name' });
  if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  const taken = db.prepare(`SELECT id FROM students WHERE pin=?`).get(pin);
  if (taken) return res.status(409).json({ error: 'That PIN is already taken — choose a different one' });
  try {
    const r = db.prepare(`INSERT INTO students (name, pin, tickets) VALUES (?, ?, 0)`).run(name.trim(), pin);
    const student = db.prepare(`SELECT id, name, tickets FROM students WHERE id=?`).get(r.lastInsertRowid);
    req.session.studentId = student.id;
    res.json({ id: student.id, name: student.name, tickets: student.tickets });
  } catch {
    res.status(500).json({ error: 'Could not create account, please try again' });
  }
});

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function requireStudent(req, res, next) {
  if (req.session?.studentId) return next();
  res.status(401).json({ error: 'Not logged in' });
}

// ── STUDENT PROFILE ──────────────────────────────────────────
router.get('/me', requireStudent, (req, res) => {
  const s = db.prepare(`SELECT id, name, tickets FROM students WHERE id=?`).get(req.session.studentId);
  if (!s) return res.status(404).json({ error: 'Student not found' });
  res.json(s);
});

// ── BROWSE ITEMS ─────────────────────────────────────────────
router.get('/items', requireStudent, (req, res) => {
  const items = db.prepare(`
    SELECT i.id, i.name, i.qty, i.price, c.name as cat_name
    FROM items i JOIN categories c ON c.id = i.cat_id
    WHERE i.active = 1
    ORDER BY c.name, i.name
  `).all();
  res.json(items);
});

router.get('/categories', requireStudent, (req, res) => {
  const cats = db.prepare(`
    SELECT DISTINCT c.id, c.name
    FROM categories c
    JOIN items i ON i.cat_id = c.id
    WHERE i.active = 1
    ORDER BY c.name
  `).all();
  res.json(cats);
});

// ── PLACE ORDER ──────────────────────────────────────────────
router.post('/order', requireStudent, (req, res) => {
  const { item_id } = req.body;
  const studentId = req.session.studentId;

  const open = db.prepare(`SELECT value FROM settings WHERE key='store_open'`).get()?.value;
  if (open !== '1') return res.status(403).json({ error: 'The store is currently closed.' });

  const student = db.prepare(`SELECT * FROM students WHERE id=? AND active=1`).get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const item = db.prepare(`SELECT * FROM items WHERE id=? AND active=1`).get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.qty <= 0) return res.status(400).json({ error: 'Sorry, this item is out of stock!' });
  if (student.tickets < item.price) return res.status(400).json({ error: `Not enough tickets! You need ${item.price} 🎟️ but only have ${student.tickets}.` });

  const code = genCode();
  let orderId;

  db.transaction(() => {
    // Deduct tickets
    db.prepare(`UPDATE students SET tickets = tickets - ? WHERE id=?`).run(item.price, studentId);
    // Deduct stock
    db.prepare(`UPDATE items SET qty = qty - 1 WHERE id=?`).run(item_id);
    // Create order
    const r = db.prepare(`INSERT INTO orders (student_id,item_id,item_name,price,code) VALUES (?,?,?,?,?)`)
      .run(studentId, item_id, item.name, item.price, code);
    orderId = r.lastInsertRowid;
    // Log transaction
    db.prepare(`INSERT INTO transactions (student_id,type,amount,note) VALUES (?,?,?,?)`)
      .run(studentId, 'purchase', item.price, `Purchased: ${item.name} (order #${r.lastInsertRowid})`);
  })();

  const newBalance = db.prepare(`SELECT tickets FROM students WHERE id=?`).get(studentId).tickets;
  res.json({ ok: true, orderId, code, newBalance, itemName: item.name, price: item.price });
});

// ── ORDER HISTORY ────────────────────────────────────────────
router.get('/orders', requireStudent, (req, res) => {
  const orders = db.prepare(`
    SELECT id, item_name, price, status, code, created_at, fulfilled_at
    FROM orders WHERE student_id=?
    ORDER BY created_at DESC
  `).all(req.session.studentId);
  res.json(orders);
});

module.exports = router;
