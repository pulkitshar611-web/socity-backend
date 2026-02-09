const prisma = require('../lib/prisma');
const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Vendor
const vendorRouter = express.Router();
vendorRouter.get('/', authenticate, async (req, res) => {
  const vendors = await prisma.vendor.findMany({ where: { societyId: req.user.societyId } });
  res.json(vendors);
});
vendorRouter.post('/', authenticate, authorize(['ADMIN']), async (req, res) => {
  const vendor = await prisma.vendor.create({ data: { ...req.body, societyId: req.user.societyId } });
  res.status(201).json(vendor);
});

// Parking
const parkingRouter = express.Router();
parkingRouter.get('/slots', authenticate, async (req, res) => {
  const slots = await prisma.parkingSlot.findMany({ where: { societyId: req.user.societyId } });
  res.json(slots);
});
parkingRouter.patch('/slots/:id/allocate', authenticate, authorize(['ADMIN']), async (req, res) => {
  const slot = await prisma.parkingSlot.update({ where: { id: parseInt(req.params.id) }, data: req.body });
  res.json(slot);
});

// Report
const reportRouter = express.Router();
reportRouter.get('/download', authenticate, authorize(['ADMIN']), async (req, res) => {
  res.json({ message: 'Report generation started. You will be notified when ready.' });
});

module.exports = { vendorRouter, parkingRouter, reportRouter };
