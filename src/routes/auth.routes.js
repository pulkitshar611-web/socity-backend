const express = require('express');
const UserController = require('../controllers/User.controller');
const { authenticate, authorize, optionalAuthenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// Optional auth: when Super Admin/Admin adds Individual (with token), addedByUserId is set; public register has no token
router.post('/register', optionalAuthenticate, UserController.register);
router.post('/login', UserController.login);
router.get('/me', authenticate, UserController.getMe);
router.put('/profile', authenticate, UserController.updateProfile);
router.post('/profile/photo', authenticate, require('../middlewares/upload.middleware').single('photo'), UserController.uploadPhoto);

// Super Admin
router.get('/b2c-stats', authenticate, authorize(['SUPER_ADMIN']), UserController.getB2CStats);
router.get('/stats', authenticate, authorize(['SUPER_ADMIN']), UserController.getUserStats);
router.get('/all', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'COMMITTEE']), UserController.getAllUsers);
router.patch('/:id/status', authenticate, authorize(['SUPER_ADMIN']), UserController.updateUserStatus);

// Society Admins Management (Super Admin)
router.get('/admins', authenticate, authorize(['SUPER_ADMIN']), UserController.listAdmins);
router.post('/admins', authenticate, authorize(['SUPER_ADMIN']), UserController.createAdmin);
router.put('/admins/:id', authenticate, authorize(['SUPER_ADMIN']), UserController.updateAdmin);
router.delete('/admins/:id', authenticate, authorize(['SUPER_ADMIN']), UserController.deleteAdmin);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), UserController.deleteUser);
router.get('/:id/activity', authenticate, authorize(['SUPER_ADMIN']), UserController.getUserActivity);

module.exports = router;
