const multer = require('multer');

// Use memory storage to process file before uploading to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file && file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image or file type invalid!'), false);
  }
};

// Chat: allow images and PDFs
const chatFileFilter = (req, file, cb) => {
  if (!file || !file.mimetype) return cb(new Error('Invalid file'), false);
  const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
  cb(null, ok);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

const uploadChat = multer({
  storage: storage,
  fileFilter: chatFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB for chat
});

module.exports = upload;
module.exports.uploadChat = uploadChat;
