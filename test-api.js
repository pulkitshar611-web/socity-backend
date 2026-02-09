const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:9000/api/roles');
    console.log('Roles Data:', res.data);
  } catch (err) {
    console.error('API Error:', err.message);
    if (err.response) console.error('Response Data:', err.response.data);
  }
}

test();
