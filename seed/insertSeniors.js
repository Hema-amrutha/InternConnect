const { MongoClient } = require('mongodb');

async function insertSeniors() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('internconnect');

    await db.collection('users').insertMany([
      {
        name: 'Disha Jain',
        email: 'disha@example.com',
        branch: 'IT',
        year: 'Final Year',
        role: 'senior',
        profilePic: 'images/disha.jpg',
        internship: {
          internRole: 'SDE Intern',
          company: 'Google'
        }
      },
      {
        name: 'Annapurna',
        email: 'annapurna@example.com',
        branch: 'IT',
        year: 'Final Year',
        role: 'senior',
        profilePic: 'images/annapurna.jpg',
        internship: {
          internRole: 'SDE Intern',
          company: 'Intuit'
        }
      },
      {
        name: 'Anusha',
        email: 'anusha@example.com',
        branch: 'IT',
        year: 'Final Year',
        role: 'senior',
        profilePic: 'images/anusha.jpg',
        internship: {
          internRole: 'SDE Intern',
          company: 'Adobe'
        }
      },
      {
        name: 'Ragini',
        email: 'ragini@example.com',
        branch: 'IT',
        year: 'Final Year',
        role: 'senior',
        profilePic: 'images/ragini.jpg',
        internship: {
          internRole: 'SDE Intern',
          company: 'Microsoft'
        }
      }
    ]);

    console.log('✅ Dummy seniors inserted');
  } catch (error) {
    console.error('Error inserting seniors:', error);
  } finally {
    await client.close();
  }
}

insertSeniors();
