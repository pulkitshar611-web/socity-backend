const express = require('express');
const AdvertisementController = require('../controllers/Advertisement.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

// Public/Authenticated access for active ads (all users see these on dashboard)
router.get('/active', authenticate, AdvertisementController.getActive);

// Super Admin only routes for management
router.post('/', authenticate, authorize(['SUPER_ADMIN']), upload.single('image'), AdvertisementController.create);
router.get('/', authenticate, authorize(['SUPER_ADMIN']), AdvertisementController.getAll);
router.put('/:id', authenticate, authorize(['SUPER_ADMIN']), upload.single('image'), AdvertisementController.update);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), AdvertisementController.delete);

module.exports = router;
