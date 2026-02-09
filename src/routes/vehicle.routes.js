const express = require('express');
const router = express.Router();
const VehicleController = require('../controllers/Vehicle.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all vehicles
router.get('/', VehicleController.getAll);

// Get vehicle statistics
router.get('/stats', VehicleController.getStats);

// Register vehicle
router.post('/register', authorize(['ADMIN', 'SUPER_ADMIN']), VehicleController.register);

// Remove vehicle from slot
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), VehicleController.remove);

// Update status
router.patch('/:id/status', authorize(['ADMIN', 'SUPER_ADMIN']), VehicleController.updateStatus);

module.exports = router;
