
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { MongoClient, ObjectId } = require('mongodb');

const http = require('http'); // Moved up before usage
const { Server } = require('socket.io');


const app = express();
const PORT = 3000;
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);
let db;

// Session middleware
app.use(session({
  secret: 'your-secret-key', // change in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true if HTTPS
}));

app.use(express.static(__dirname));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Connect to MongoDB
async function connectDB() {
  await client.connect();
  db = client.db('internconnect');
  console.log('✅ Connected to MongoDB');
}

// Serve login and register pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// Register user
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, branch, year, role, internRole, internCompany } = req.body;

    if (!email.endsWith('@svecw.edu.in')) {
      return res.status(400).send('Only college emails are allowed');
    }

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
  return res.status(400).json({
    error: 'Email already registered'
  });
}
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name,
      email,
      password: hashedPassword,
      branch,
      year,
      role,
      profilePic: ''
    };

    if (role === 'intern') {
      newUser.internship = {
        internRole: internRole || '',
        company: internCompany || ''
      };
    }

    await db.collection('users').insertOne(newUser);

    res.status(201).json({
  message: 'User registered successfully'
});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Login user
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await db.collection('users').findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: 'User not found'
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        error: 'Incorrect password'
      });
    }

    // Store session
    req.session.userId = user._id.toString();

    // Send redirect URL instead of redirecting directly
    if (user.role === 'student') {
      return res.json({
        redirect: '/homepage.html'
      });
    } else if (user.role === 'intern') {
      return res.json({
        redirect: '/intern home.html'
      });
    } else {
      return res.status(400).json({
        error: 'Invalid role'
      });
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Server error'
    });
  }
});

// API: get logged-in user profile
app.get('/api/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Not logged in');

  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { password: 0 } }
    );

    if (!user) return res.status(404).send('User not found');

    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).send('Internal server error');
  }
});

// API: get all interns for homepage listing
app.get('/api/interns', async (req, res) => {
  try {
    const interns = await db.collection('users')
      .find({ role: 'intern' })
      .project({ password: 0 }) // exclude sensitive info
      .toArray();
    res.json(interns);
  } catch (error) {
    console.error('Error fetching interns:', error);
    res.status(500).send('Internal server error');
  }
});

// API: get unread notifications for logged-in user
app.get('/api/notifications', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Not logged in');

  try {
    const notifs = await db.collection('notifications')
      .find({ userId: req.session.userId, read: false })
      .sort({ timestamp: -1 })
      .toArray();

    res.json(notifs);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).send('Internal server error');
  }
});

// API: Update request status (Accept/Reject) and create notification
app.post('/api/request/:requestId/status', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Not logged in');

  const { requestId } = req.params;
  const { status } = req.body;

  if (!['Accepted', 'Rejected'].includes(status)) {
    return res.status(400).send('Invalid status');
  }

  try {
    const request = await db.collection('requests').findOne({ _id: new ObjectId(requestId) });
    if (!request) return res.status(404).send('Request not found');

    await db.collection('requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { status } }
    );

    // Corrected: Template string wrapped with backticks
    await db.collection('notifications').insertOne({
      userId: request.requesterId,
      message: `Your request was ${status.toLowerCase()} by ${req.session.userId}`,
      timestamp: new Date(),
      read: false
    });

    res.json({ message: `Request ${status.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).send('Internal server error');
  }
});

// API: send request from student to intern
app.post('/api/requests', async (req, res) => {
  const { receiverId } = req.body;
  const requesterId = req.session.userId;

  if (!requesterId || !receiverId) return res.status(400).send('Missing IDs');

  const existing = await db.collection('requests').findOne({
    requesterId,
    receiverId,
    status: 'Pending'
  });

  if (existing) return res.status(409).send('Request already sent');

  await db.collection('requests').insertOne({
    requesterId,
    receiverId,
    status: 'Pending',
    createdAt: new Date()
  });

  res.json({ message: 'Request sent' });
});

// Incoming requests to intern
app.get('/api/incoming-requests', async (req, res) => {
  const internId = req.session.userId;
  if (!internId) return res.status(401).send('Not logged in');

  const requests = await db.collection('requests')
    .find({ receiverId: internId, status: 'Pending' })
    .toArray();

  const requesterIds = requests.map(r => new ObjectId(r.requesterId));
  const students = await db.collection('users')
    .find({ _id: { $in: requesterIds } })
    .project({ name: 1, profilePic: 1, branch: 1, year: 1 })
    .toArray();

  const merged = requests.map(req => ({
    ...req,
    student: students.find(s => s._id.toString() === req.requesterId)
  }));

  res.json(merged);
});

// Check connection status between logged-in user and other user
app.get('/api/is-connected/:id', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('Not logged in');
  const otherId = req.params.id;

  const accepted = await db.collection('requests').findOne({
    $or: [
      { requesterId: userId, receiverId: otherId },
      { requesterId: otherId, receiverId: userId }
    ],
    status: 'Accepted'
  });

  res.json({ connected: !!accepted });
});

// Get intern details by ID
app.get('/api/interns/:id', async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    const intern = await db.collection('users').findOne({ _id: new ObjectId(id), role: 'intern' });

    if (!intern) return res.status(404).json({ error: 'Not found' });

    res.json(intern);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get requests made by logged-in student
app.get('/api/myrequests', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const requests = await db.collection('requests')
      .find({ requesterId: userId })
      .toArray();

    const internIds = requests.map(req => new ObjectId(req.receiverId));

    const interns = await db.collection('users')
      .find({ _id: { $in: internIds } })
      .project({ name: 1, branch: 1, year: 1, 'internship.internRole': 1, email: 1 })
      .toArray();

    const enrichedRequests = requests.map(req => {
      const intern = interns.find(i => i._id.toString() === req.receiverId);
      return {
        ...req,
        receiverName: intern?.name || 'Intern',
        receiverBranch: intern?.branch || '',
        receiverYear: intern?.year || '',
        receiverPosition: intern?.internship?.internRole || '',
        receiverUsername: intern?.email?.split('@')[0] || ''
      };
    });

    res.json(enrichedRequests);
  } catch (err) {
    console.error('Error in /api/myrequests:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get accepted students for logged-in intern (Chats)
app.get('/api/intern/accepted-students', async (req, res) => {
  const internId = req.session.userId;

  if (!internId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const acceptedRequests = await db.collection('requests')
      .find({
        receiverId: internId,
        status: 'Accepted'
      })
      .toArray();

    const studentIds = acceptedRequests.map(r => new ObjectId(r.requesterId));

    const students = await db.collection('users')
      .find({ _id: { $in: studentIds } })
      .project({ name: 1 })
      .toArray();

    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Debug routes
app.get('/debug/requests', async (req, res) => {
  try {
    const requests = await db.collection('requests')
      .find({ status: 'accepted' }) // check lowercase/uppercase consistency in your DB!
      .toArray();
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving requests');
  }
});
app.get('/debug/all-requests', async (req, res) => {
  try {
    const requests = await db.collection('requests').find().toArray();
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving all requests');
  }
});

// Create HTTP server and Socket.io server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  // Join room
  socket.on('joinRoom', ({ senderId, receiverId }) => {
    const roomId = [senderId, receiverId].sort().join('-');
    socket.join(roomId);
    console.log(`📥 ${senderId} joined room ${roomId}`);
  });

  // Send message
  socket.on('sendMessage', async ({ senderId, receiverId, message: content }) => {
    const roomId = [senderId, receiverId].sort().join('-');

    // Emit to the other user in the room
    io.to(roomId).emit('receiveMessage', {
  senderId,
  receiverId,
  message: content,
  timestamp: new Date()
});

    // Store the message in MongoDB
    try {
      await db.collection('messages').insertOne({
        senderId,
        receiverId,
        message: content,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('❌ Error saving message:', err);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('🔴 A user disconnected:', socket.id);
  });
});

// API: Get messages between two users
app.get('/api/messages/:senderId/:receiverId', async (req, res) => {
  const { senderId, receiverId } = req.params;

  try {
    const messages = await db.collection('messages').find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    }).sort({ timestamp: 1 }).toArray();

    res.json(messages);
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    res.status(500).send('Error retrieving messages');
  }
});

// API: Save a new message
app.post('/api/messages', async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  if (!senderId || !receiverId || !message) {
    return res.status(400).send('Missing fields');
  }

  try {
    const result = await db.collection('messages').insertOne({
      senderId,
      receiverId,
      message,
      timestamp: new Date()
    });

    res.status(201).json({ message: 'Message saved', id: result.insertedId });
  } catch (err) {
    console.error('❌ Error saving message:', err);
    res.status(500).send('Error saving message');
  }
});
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Could not log out.');
    }
    res.clearCookie('connect.sid');
    res.redirect('/'); // This loads login.html from root
  });
});
// Get accepted students for logged-in intern (for chat list)
app.get('/api/intern/chats', async (req, res) => {
  try {
    const internId = req.session.userId;

    if (!internId) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    console.log("Logged-in intern:", internId);

    // 1. Get accepted requests where this intern is receiver
    const requests = await db.collection('requests')
      .find({
        receiverId: internId.toString(),
        status: 'Accepted'
      })
      .toArray();

    console.log("Accepted requests:", requests);

    if (requests.length === 0) {
      return res.json([]);
    }

    // 2. Convert requesterIds safely
    const studentIds = requests
      .filter(r => ObjectId.isValid(r.requesterId))
      .map(r => new ObjectId(r.requesterId));

    console.log("Converted studentIds:", studentIds);

    // 3. Fetch students
    const students = await db.collection('users')
      .find({
        _id: { $in: studentIds },
        role: 'student'
      })
      .project({ name: 1 })
      .toArray();

    console.log("Students found:", students);

    res.json(students);

  } catch (err) {
    console.error("Intern chat error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.get('/api/students', async (req, res) => {
  try {
    const students = await db.collection('users')
      .find({ role: 'student' })
      .project({ password: 0 })
      .toArray();

    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
// Example using Express and MongoDB
app.post('/api/accept-request', async (req, res) => {
  const { internId, studentId } = req.body;

  await db.collection('connections').updateOne(
    { internId, studentId },
    { $set: { status: 'accepted' } },
    { upsert: true } // optionally insert if not exists
  );

  res.send({ success: true });
});


app.get('/api/students/:id', async (req, res) => {
  try {
    const id = req.params.id;

    console.log("Fetching student:", id);

    const student = await db.collection('users').findOne({
      _id: new ObjectId(id),
      role: 'student'
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(student);
  } catch (err) {
    console.error("Student API error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.get('/api/student/incoming-requests', async (req, res) => {
  const studentId = req.session.userId;
  if (!studentId) return res.status(401).json({ error: 'Not logged in' });

  try {
    // 1. Get pending requests sent TO this student
    const requests = await db.collection('requests')
      .find({
        receiverId: studentId,
        status: 'Pending'
      })
      .toArray();

    // 2. Get intern IDs (requesterId)
    const internIds = requests.map(r => new ObjectId(r.requesterId));

    // 3. Fetch intern details
    const interns = await db.collection('users')
      .find({ _id: { $in: internIds } })
      .project({ name: 1, email: 1, 'internship.internRole': 1 })
      .toArray();

    // 4. Merge data
    const result = requests.map(req => {
      const intern = interns.find(i => i._id.toString() === req.requesterId);
      return {
        requestId: req._id,
        internId: req.requesterId,
        internName: intern?.name || 'Intern',
        internRole: intern?.internship?.internRole || ''
      };
    });

    res.json(result);

  } catch (err) {
    console.error("Student incoming error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/api/requests/update', async (req, res) => {
  const { requestId, status } = req.body;

  try {
    await db.collection('requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { status } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});
// GET requests received by the logged-in student
app.get('/api/receivedrequests', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const requests = await db.collection('requests')
      .find({ receiverId: userId, status: 'Pending' })
      .toArray();

    // For each request, fetch the requester’s name from the users collection
    const requestsWithNames = await Promise.all(
      requests.map(async (r) => {
        const user = await db.collection('users').findOne(
  { _id: new ObjectId(r.requesterId) },
  { projection: { name: 1, 'internship.internRole': 1, 'internship.company': 1 } }
);

return {
  ...r,
  requesterName: user ? user.name : 'Unknown',
  role: user?.internship?.internRole || '',
  company: user?.internship?.company || ''
};
      })
    );

    res.json(requestsWithNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// API: Intern posts internship opening
app.post('/api/internships', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const { company, role, location, applyLink, deadline, description , skills} = req.body;

    // Get intern details
    const intern = await db.collection('users').findOne({
      _id: new ObjectId(req.session.userId),
      role: 'intern'
    });

    if (!intern) {
      return res.status(403).json({ error: 'Only interns can post internships' });
    }

    const newInternship = {
      company,
      role,
      location,
      applyLink,
      deadline,
      description,
      skills,
      postedBy: intern.name,
      postedById: intern._id.toString(),
      postedDate: new Date()
    };

    await db.collection('internships').insertOne(newInternship);

    res.json({ message: "Internship posted successfully" });

  } catch (error) {
    console.error("Error posting internship:", error);
    res.status(500).json({ error: "Server error" });
  }
});
// API: Get all internship openings
app.get('/api/internships', async (req, res) => {
  try {

    const internships = await db.collection('internships')
      .find()
      .sort({ postedDate: -1 })
      .toArray();

    res.json(internships);

  } catch (error) {
    console.error("Error fetching internships:", error);
    res.status(500).json({ error: "Server error" });
  }
});
// API: Filter internships
app.get("/api/internships/filter", async (req, res) => {

  const { type, value } = req.query;

  let filter = {};

  if (type && value) {
    filter[type] = { $regex: value, $options: "i" };
  }

  const jobs = await db
    .collection("internships")
    .find(filter)
    .toArray();

  res.json(jobs);

});
const fetch = require("node-fetch");

app.post("/api/recommend", async (req, res) => {

  const { skills } = req.body;

  const mlRes = await fetch("http://localhost:5001/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skills })
  });

  const data = await mlRes.json();

  res.json(data);

});
// Start the server after DB connects
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
});
