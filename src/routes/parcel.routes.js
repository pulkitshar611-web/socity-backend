const express = require('express');
const router = express.Router();
const ParcelController = require('../controllers/Parcel.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all parcels
router.get('/', ParcelController.getAll);

// Get stats
router.get('/stats', ParcelController.getStats);

// Get single parcel
router.get('/:id', ParcelController.getById);

// Create parcel entry (Guard can also create)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), ParcelController.create);

// Update parcel status
router.patch('/:id/status', authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), ParcelController.updateStatus);

// Delete parcel
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), ParcelController.remove);

module.exports = router;
