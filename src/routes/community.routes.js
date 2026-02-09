const express = require('express');
const CommunityController = require('../controllers/Community.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/chat', CommunityController.getChatMessages);
router.post('/chat', CommunityController.sendChatMessage);
router.delete('/chat/:id', CommunityController.deleteChatMessage);

// Group routes
router.get('/groups', CommunityController.getUserGroups);
router.post('/groups', CommunityController.createGroup);
router.delete('/groups/:groupId', CommunityController.deleteGroup);
router.get('/groups/:groupId/messages', CommunityController.getGroupMessages);
router.post('/groups/:groupId/messages', CommunityController.sendGroupMessage);
router.get('/members', CommunityController.getSocietyMembers);

module.exports = router;
