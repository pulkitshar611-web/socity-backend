const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/Chat.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { uploadChat } = require('../middlewares/upload.middleware');

router.get('/available-users', authenticate, ChatController.getAvailableUsersForChat);
router.get('/support-conversation', authenticate, ChatController.getOrCreateSupportConversation);
router.get('/conversations', authenticate, ChatController.listConversations);
router.post('/start', authenticate, ChatController.startConversation);
router.get('/conversations/:id/messages', authenticate, ChatController.getMessages);
router.patch('/conversations/:id/read', authenticate, ChatController.markConversationAsRead);
router.post('/messages', authenticate, ChatController.sendMessage);
router.post('/upload', authenticate, uploadChat.single('file'), ChatController.uploadAttachment);

module.exports = router;
