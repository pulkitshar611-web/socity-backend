const express = require('express');
const router = express.Router();
const StaffController = require('../controllers/Staff.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD', 'RESIDENT']));
 
 // List all staff (supports query params: role, status, shift)
 router.get('/', StaffController.list);
 
 // Create new staff
 router.post('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), StaffController.create);
 
 // Update staff details (generic update)
 router.patch('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), StaffController.update);
 
 // Update staff status (Check-in/Check-out)
 router.patch('/:id/status', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), StaffController.updateStatus);
 
 // Delete staff
 router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), StaffController.delete);

module.exports = router;
