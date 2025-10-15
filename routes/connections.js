const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

// Send connection request
router.post('/send-request', async (req, res) => {
  const { from, to } = req.body;
  const db = getDB();

  const existing = await db.collection('connections').findOne({ from, to });
  if (existing) return res.json({ status: existing.status });

  await db.collection('connections').insertOne({ from, to, status: 'pending' });
  res.json({ status: 'pending' });
});

// Get connections
router.get('/get-connections', async (req, res) => {
  const user = req.query.user;
  const db = getDB();

  const connections = await db.collection('connections').find({
    $or: [{ from: user }, { to: user }]
  }).toArray();

  const accepted = [];
  const pending = [];

  for (const conn of connections) {
    const other = conn.from === user ? conn.to : conn.from;
    if (conn.status === 'accepted') accepted.push(other);
    else if (conn.status === 'pending' && conn.from === user) pending.push(other);
  }

  res.json({ accepted, pending });
});

// Accept request
router.post('/accept-request', async (req, res) => {
  const { from, to } = req.body;
  const db = getDB();

  await db.collection('connections').updateOne({ from, to }, { $set: { status: 'accepted' } });
  res.json({ status: 'accepted' });
});

module.exports = router;
