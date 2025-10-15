const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { getDB } = require('./db');

router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      branch,
      year,
      role,
      internRole,
      internCompany,
    } = req.body;

    // Validate college email
    if (!email.endsWith('@svecw.edu.in')) {
      return res.status(400).json({ error: 'Only college email allowed (@svecw.edu.in)' });
    }

    const db = getDB();

    if (role === 'student') {
      // Check if student email already exists
      const existingStudent = await db.collection('students').findOne({ email });
      if (existingStudent) {
        return res.status(400).json({ error: 'Student email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const newStudent = {
        name,
        email,
        password: hashedPassword,
        branch,
        year,
        role,
        profilePic: '',
      };

      await db.collection('students').insertOne(newStudent);
      return res.json({ message: 'Student registered successfully' });

    } else if (role === 'intern') {
      // Check if intern email already exists
      const existingIntern = await db.collection('interns').findOne({ email });
      if (existingIntern) {
        return res.status(400).json({ error: 'Intern email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const newIntern = {
        name,
        email,
        password: hashedPassword,
        branch,
        year,
        role,
        profilePic: '',
        internship: {
          internRole,
          company: internCompany,  // note renaming internCompany -> company inside object
        },
      };

      await db.collection('interns').insertOne(newIntern);
      return res.json({ message: 'Intern registered successfully' });

    } else {
      return res.status(400).json({ error: 'Invalid role specified' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
