const express = require('express');
const router = express.Router();
const ResidentController = require('../controllers/Resident.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

router.get('/dashboard', authenticate, ResidentController.getDashboardData);

// My Unit
router.get('/unit', authenticate, ResidentController.getUnitData);
router.post('/unit/family', authenticate, ResidentController.addFamilyMember);
router.put('/unit/family/:id', authenticate, ResidentController.updateFamilyMember);
router.post('/unit/vehicle', authenticate, ResidentController.addVehicle);
router.put('/unit/vehicle/:id', authenticate, ResidentController.updateVehicle);
router.post('/unit/pet', authenticate, ResidentController.addPet);
router.put('/unit/pet/:id', authenticate, ResidentController.updatePet);
router.get('/payments', authenticate, ResidentController.getPaymentHistory);

// SOS
router.get('/sos/data', authenticate, ResidentController.getSOSData);
router.post('/sos/trigger', authenticate, ResidentController.triggerSOS);
router.post('/sos/contact', authenticate, ResidentController.addEmergencyContact);

// Helpdesk
router.get('/tickets', authenticate, ResidentController.getTickets);
router.get('/tickets/:id', authenticate, ResidentController.getTicket);
router.post('/tickets', authenticate, ResidentController.createTicket);

// Marketplace
router.get('/market/items', authenticate, ResidentController.getMarketItems);
router.post('/market/items', authenticate, upload.single('image'), ResidentController.createMarketItem);
router.put('/market/items/:id/status', authenticate, ResidentController.updateMarketItemStatus);
router.delete('/market/items/:id', authenticate, ResidentController.deleteMarketItem);

// Services
router.get('/services', authenticate, ResidentController.getServices);
router.post('/services/inquiry', authenticate, ResidentController.createServiceInquiry);

// Amenities
router.get('/amenities', authenticate, ResidentController.getAmenities);
router.post('/amenities/book', authenticate, ResidentController.bookAmenity);

// Community
router.get('/community/feed', authenticate, ResidentController.getCommunityFeed);
router.post('/community/post', authenticate, upload.single('image'), ResidentController.createPost);
router.put('/community/post/:id', authenticate, ResidentController.updatePost);
router.delete('/community/post/:id', authenticate, ResidentController.deletePost);
router.post('/community/comment', authenticate, ResidentController.createCommunityComment);
router.post('/community/like', authenticate, ResidentController.toggleLike);

// Guidelines
router.get('/guidelines', authenticate, ResidentController.getGuidelines);

module.exports = router;
