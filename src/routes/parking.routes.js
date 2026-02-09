const express = require('express');
const router = express.Router();
const ParkingSlotController = require('../controllers/ParkingSlot.controller');
const ParkingPaymentController = require('../controllers/ParkingPayment.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// List slots (filters supported)
router.get('/slots', ParkingSlotController.list);

// Get Stats
router.get('/stats', ParkingSlotController.getStats);

// Create Slot (Admin only)
router.post('/slots', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingSlotController.create);

// Assign Slot (Admin only)
router.patch('/slots/:id/assign', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingSlotController.assign);

// Unassign Slot (Admin only)
router.patch('/slots/:id/unassign', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingSlotController.unassign);

// Update Slot (Admin only)
router.patch('/slots/:id', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingSlotController.update);

// Delete Slot (Admin only)
router.delete('/slots/:id', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingSlotController.delete);

// --- Payment Routes ---
// List payments
router.get('/payments', ParkingPaymentController.list);

// Generate monthly payments
router.post('/payments/generate', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingPaymentController.generateMonthly);

// Record payment (Update existing)
router.post('/payments/:id/record', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingPaymentController.recordPayment);

// Create new payment record
router.post('/payments', authorize(['ADMIN', 'SUPER_ADMIN']), ParkingPaymentController.create);


module.exports = router;
