const express = require('express');
const router = express.Router();
const StaffController = require('../controllers/Staff.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']));

// List all staff (supports query params: role, status, shift)
router.get('/', StaffController.list);

// Create new staff
router.post('/', StaffController.create);

// Update staff details (generic update)
router.patch('/:id', StaffController.update);

// Delete staff
router.delete('/:id', StaffController.delete);

module.exports = router;
