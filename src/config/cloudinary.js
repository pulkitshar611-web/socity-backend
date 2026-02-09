const cloudinary = require('cloudinary').v2;
const path = require('path');
// Explicitly load .env from backend root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary Config Error: Missing environment variables!');
  console.error('Path checked:', path.join(__dirname, '../../.env'));
  console.error('Cloud Name:', CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing');
  console.error('API Key:', CLOUDINARY_API_KEY ? 'Set' : 'Missing');
  console.error('API Secret:', CLOUDINARY_API_SECRET ? 'Set' : 'Missing');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

module.exports = cloudinary;
