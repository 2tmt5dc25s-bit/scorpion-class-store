const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── AUTH ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare(`SELECT value FROM settings WHERE key='admin_password'`).get()?.value;
  if (password === stored) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ── SETTINGS ─────────────────────────────────────────────────
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

router.put('/settings', requireAdmin, (req, res) => {
  const allowed = ['store_open', 'store_name', 'admin_password'];
  const update  = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  const tx = db.transaction((data) => {
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) update.run(k, String(v));
    }
  });
  tx(req.body);
  res.json({ ok: true });
});

// ── CATEGORIES ───────────────────────────────────────────────
router.get('/categories', requireAdmin, (req, res) => {
  const cats = db.prepare(`
    SELECT c.id, c.name, COUNT(i.id) as item_count
    FROM categories c LEFT JOIN items i ON i.cat_id = c.id AND i.active = 1
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(cats);
});

router.post('/categories', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db.prepare(`INSERT INTO categories (name) VALUES (?)`).run(name.trim());
    res.json({ id: r.lastInsertRowid, name: name.trim() });
  } catch { res.status(409).json({ error: 'Category already exists' }); }
});

router.put('/categories/:id', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    db.prepare(`UPDATE categories SET name=? WHERE id=?`).run(name.trim(), req.params.id);
    res.json({ ok: true });
  } catch { res.status(409).json({ error: 'Name already exists' }); }
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  // Move items to "Other" category (create if needed)
  let otherId = db.prepare(`SELECT id FROM categories WHERE name='Other'`).get()?.id;
  if (!otherId) {
    otherId = db.prepare(`INSERT INTO categories (name) VALUES ('Other')`).run().lastInsertRowid;
  }
  if (String(id) === String(otherId)) return res.status(400).json({ error: "Cannot delete 'Other'" });
  db.prepare(`UPDATE items SET cat_id=? WHERE cat_id=?`).run(otherId, id);
  db.prepare(`DELETE FROM categories WHERE id=?`).run(id);
  res.json({ ok: true });
});

// ── ITEMS ────────────────────────────────────────────────────
router.get('/items', requireAdmin, (req, res) => {
  const items = db.prepare(`
    SELECT i.id, i.name, i.qty, i.price, i.low_thresh, i.active,
           c.id as cat_id, c.name as cat_name
    FROM items i JOIN categories c ON c.id = i.cat_id
    ORDER BY c.name, i.name
  `).all();
  res.json(items);
});

router.post('/items', requireAdmin, (req, res) => {
  const { name, cat_id, qty, price, low_thresh } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare(`INSERT INTO items (name,cat_id,qty,price,low_thresh) VALUES (?,?,?,?,?)`)
    .run(name.trim(), cat_id, qty||0, price||1, low_thresh||5);
  res.json({ id: r.lastInsertRowid });
});

router.put('/items/:id', requireAdmin, (req, res) => {
  const { name, cat_id, qty, price, low_thresh, active } = req.body;
  db.prepare(`UPDATE items SET name=?,cat_id=?,qty=?,price=?,low_thresh=?,active=? WHERE id=?`)
    .run(name, cat_id, qty, price, low_thresh, active ?? 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/items/:id', requireAdmin, (req, res) => {
  db.prepare(`UPDATE items SET active=0 WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

router.patch('/items/:id/stock', requireAdmin, (req, res) => {
  const { delta } = req.body;
  db.prepare(`UPDATE items SET qty = MAX(0, qty + ?) WHERE id=?`).run(delta, req.params.id);
  const item = db.prepare(`SELECT qty FROM items WHERE id=?`).get(req.params.id);
  res.json({ qty: item.qty });
});

// ── STUDENTS ─────────────────────────────────────────────────
router.get('/students', requireAdmin, (req, res) => {
  const students = db.prepare(`SELECT id, name, pin, tickets, active FROM students ORDER BY name`).all();
  res.json(students);
});

router.post('/students', requireAdmin, (req, res) => {
  const { name, pin, tickets } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (!pin?.trim())  return res.status(400).json({ error: 'PIN required' });
  try {
    const r = db.prepare(`INSERT INTO students (name,pin,tickets) VALUES (?,?,?)`)
      .run(name.trim(), pin.trim(), tickets||0);
    res.json({ id: r.lastInsertRowid });
  } catch { res.status(409).json({ error: 'Student already exists' }); }
});

router.put('/students/:id', requireAdmin, (req, res) => {
  const { name, pin, tickets, active } = req.body;
  db.prepare(`UPDATE students SET name=?,pin=?,tickets=?,active=? WHERE id=?`)
    .run(name, pin, tickets, active ?? 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/students/:id', requireAdmin, (req, res) => {
  db.prepare(`UPDATE students SET active=0 WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

router.post('/students/:id/tickets', requireAdmin, (req, res) => {
  const { amount, note } = req.body;
  const amt = parseInt(amount);
  if (isNaN(amt)) return res.status(400).json({ error: 'Invalid amount' });
  const student = db.prepare(`SELECT * FROM students WHERE id=?`).get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const newBalance = Math.max(0, student.tickets + amt);
  db.transaction(() => {
    db.prepare(`UPDATE students SET tickets=? WHERE id=?`).run(newBalance, req.params.id);
    db.prepare(`INSERT INTO transactions (student_id,type,amount,note) VALUES (?,?,?,?)`)
      .run(req.params.id, amt >= 0 ? 'credit' : 'debit', Math.abs(amt), note || (amt >= 0 ? 'Admin credit' : 'Admin debit'));
  })();
  res.json({ tickets: newBalance });
});

// ── ORDERS ───────────────────────────────────────────────────
router.get('/orders', requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*, s.name as student_name
    FROM orders o JOIN students s ON s.id = o.student_id
  `;
  const params = [];
  if (status) { sql += ` WHERE o.status = ?`; params.push(status); }
  sql += ` ORDER BY o.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.patch('/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['pending','fulfilled','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.transaction(() => {
    if (status === 'cancelled' && order.status === 'pending') {
      // Refund tickets
      db.prepare(`UPDATE students SET tickets = tickets + ? WHERE id=?`).run(order.price, order.student_id);
      db.prepare(`INSERT INTO transactions (student_id,type,amount,note) VALUES (?,?,?,?)`)
        .run(order.student_id, 'refund', order.price, `Refund: ${order.item_name} (order #${order.id})`);
      // Restore stock
      db.prepare(`UPDATE items SET qty = qty + 1 WHERE id=?`).run(order.item_id);
    }
    const fulfilledAt = status === 'fulfilled' ? new Date().toISOString() : null;
    db.prepare(`UPDATE orders SET status=?, fulfilled_at=? WHERE id=?`).run(status, fulfilledAt, req.params.id);
  })();
  res.json({ ok: true });
});

// ── TRANSACTIONS ─────────────────────────────────────────────
router.get('/transactions', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, s.name as student_name
    FROM transactions t JOIN students s ON s.id = t.student_id
    ORDER BY t.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// ── DASHBOARD STATS ──────────────────────────────────────────
router.get('/stats', requireAdmin, (req, res) => {
  const totalStudents  = db.prepare(`SELECT COUNT(*) as n FROM students WHERE active=1`).get().n;
  const totalItems     = db.prepare(`SELECT COUNT(*) as n FROM items WHERE active=1`).get().n;
  const lowStock       = db.prepare(`SELECT COUNT(*) as n FROM items WHERE active=1 AND qty <= low_thresh AND qty > 0`).get().n;
  const outOfStock     = db.prepare(`SELECT COUNT(*) as n FROM items WHERE active=1 AND qty = 0`).get().n;
  const pendingOrders  = db.prepare(`SELECT COUNT(*) as n FROM orders WHERE status='pending'`).get().n;
  const todayOrders    = db.prepare(`SELECT COUNT(*) as n FROM orders WHERE date(created_at)=date('now','localtime')`).get().n;
  const lowItems       = db.prepare(`SELECT i.name, i.qty, i.low_thresh, c.name as cat FROM items i JOIN categories c ON c.id=i.cat_id WHERE i.active=1 AND i.qty <= i.low_thresh ORDER BY i.qty ASC`).all();
  res.json({ totalStudents, totalItems, lowStock, outOfStock, pendingOrders, todayOrders, lowItems });
});

module.exports = router;
