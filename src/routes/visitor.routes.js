const express = require('express');
const VisitorController = require('../controllers/Visitor.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

const upload = require('../middlewares/upload.middleware');

router.get('/', authenticate, VisitorController.list);
router.get('/stats', authenticate, VisitorController.getStats);
router.post('/check-in', authenticate, authorize(['GUARD', 'ADMIN']), upload.single('photo'), VisitorController.checkIn);
router.post('/pre-approve', authenticate, authorize(['RESIDENT', 'ADMIN']), upload.single('photo'), VisitorController.preApprove);
router.patch('/:id/check-out', authenticate, authorize(['GUARD', 'ADMIN']), VisitorController.checkOut);
router.patch('/:id/status', authenticate, authorize(['GUARD', 'ADMIN']), VisitorController.updateStatus);

module.exports = router;
