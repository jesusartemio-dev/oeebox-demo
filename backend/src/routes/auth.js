const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

const router = express.Router();

// Passwords pre-hasheados con bcrypt (cost 10)
const USERS = [
  { username: 'admin',      passwordHash: '$2b$10$kRmVEOiad18EtoqVIDuahujEsmMV13mVSRI4Q5muFb5Oo48WDvCOS', role: 'admin' },
  { username: 'operador',   passwordHash: '$2b$10$AYe.pZEeCHm12R8XBOrtt.UT7UXhnbL5zVUKAJckrjTXmWSHt4ARK', role: 'operator' },
  { username: 'supervisor', passwordHash: '$2b$10$up7JouKEivOJphyZgAc2OeyebZztrweq4WeD66Fg1JXzR99Rqmbs2', role: 'supervisor' },
];

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username y password son requeridos' });
  }

  const user = USERS.find(u => u.username === username);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { username: user.username, role: user.role } });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
