const express = require('express');
const session = require('express-session');
const path    = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'scorpion-store-secret-change-me';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/admin',  require('./routes/admin'));
app.use('/api/store',  require('./routes/store'));

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student', 'index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🦂 Scorpion Class Store running on port ${PORT}`);
});
