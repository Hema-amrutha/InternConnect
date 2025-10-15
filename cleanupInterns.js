const { MongoClient } = require('mongodb');

async function deleteIncompleteSeniors() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('internconnect');

    // Delete users where role or internship is missing or empty string
    const result = await db.collection('users').deleteMany({
      $or: [
        { role: { $exists: false } },
        { internship: { $exists: false } },
        { role: "" },
        { internship: "" }
      ]
    });

    console.log(`${result.deletedCount} incomplete user(s) removed.`);
  } catch (error) {
    console.error('Error cleaning users:', error);
  } finally {
    await client.close();
  }
}

deleteIncompleteSeniors();
