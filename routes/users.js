const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { getDB } = require('../db');

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = getDB();

  try {
    const user = await db.collection('users').findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set session data
    req.session.user = {
      _id: user._id,
      name: user.name,
      role: user.role,
    };

    // Redirect to your static profile page
    res.json({ message: 'Login successful', redirect: '/profile.html' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to fetch logged-in user’s profile
router.get('/api/profile', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDB();
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(req.session.user._id) });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      name: user.name,
      email: user.email,
      branch: user.branch,
      year: user.year,
      internship: user.internship,
      role: user.role,
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
