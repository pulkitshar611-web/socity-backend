const express = require('express');
const ComplaintController = require('../controllers/Complaint.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, ComplaintController.list);
router.get('/stats', authenticate, ComplaintController.getStats);
router.post('/', authenticate, ComplaintController.create);
router.post('/against-vendor', authenticate, authorize(['ADMIN', 'COMMITTEE']), ComplaintController.createAgainstVendor);
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), ComplaintController.updateStatus);
router.patch('/:id/assign', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), ComplaintController.assign);
router.post('/:id/comments', authenticate, ComplaintController.addComment);

module.exports = router;
