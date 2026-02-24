const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your_jwt_secret_key_here';

async function test() {
  const token = jwt.sign(
    { id: 3, role: 'resident', societyId: 1 },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  try {
    const res = await axios.get('http://localhost:9000/api/resident/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('=== DASHBOARD API RESPONSE ===');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('API Error Status:', e.response?.status);
    console.error('API Error Data:', JSON.stringify(e.response?.data, null, 2));
  }
}

test();
