const express = require('express');
const SocietyController = require('../controllers/Society.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/units', authenticate, SocietyController.getUnits);
router.patch('/units/:id/ownership', authenticate, authorize(['ADMIN']), SocietyController.updateOwnership);
router.post('/notices', authenticate, authorize(['ADMIN']), SocietyController.postNotice);
router.get('/admin-dashboard-stats', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), SocietyController.getAdminDashboardStats);
router.get('/members', authenticate, SocietyController.getMembers);
router.post('/members', authenticate, authorize(['ADMIN']), SocietyController.addMember);
router.delete('/members/:id', authenticate, authorize(['ADMIN']), SocietyController.removeMember);

// Super Admin
router.get('/stats', authenticate, authorize(['SUPER_ADMIN']), SocietyController.getStats);
router.get('/all', authenticate, authorize(['SUPER_ADMIN']), SocietyController.getAllSocieties);
router.post('/', authenticate, authorize(['SUPER_ADMIN']), SocietyController.createSociety);
router.put('/:id', authenticate, authorize(['SUPER_ADMIN']), SocietyController.updateSociety);
router.patch('/:id/status', authenticate, authorize(['SUPER_ADMIN']), SocietyController.updateSocietyStatus);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), SocietyController.deleteSociety);
router.post('/:id/pay', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), SocietyController.processSocietyPayment);

// Guidelines: for-me is for any authenticated user (Admin/Resident/Individual/Vendor)
router.get('/guidelines/for-me', authenticate, SocietyController.getGuidelinesForMe);
// Guidelines Management (Super Admin)
router.get('/guidelines', authenticate, authorize(['SUPER_ADMIN']), SocietyController.getGuidelines);
router.post('/guidelines', authenticate, authorize(['SUPER_ADMIN']), SocietyController.createGuideline);
router.put('/guidelines/:id', authenticate, authorize(['SUPER_ADMIN']), SocietyController.updateGuideline);
router.delete('/guidelines/:id', authenticate, authorize(['SUPER_ADMIN']), SocietyController.deleteGuideline);

module.exports = router;
