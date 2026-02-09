const prisma = require('../lib/prisma');

class EmergencyBarcodeController {
  static async listBarcodes(req, res) {
    try {
      const where = {};
      const role = (req.user.role || '').toUpperCase();
      
      if (role === 'RESIDENT') {
        let phone = req.user.phone;
        if (!phone) {
          const user = await prisma.user.findUnique({ where: { id: req.user.id } });
          phone = user?.phone;
        }
        where.phone = phone || 'N/A';
        where.societyId = req.user.societyId;
      } else if (role === 'INDIVIDUAL') {
        // Individual users: filter by phone and residentName (they have no societyId)
        let phone = req.user.phone;
        let userName = req.user.name;
        if (!phone || !userName) {
          const user = await prisma.user.findUnique({ where: { id: req.user.id } });
          phone = phone || user?.phone;
          userName = userName || user?.name;
        }
        // Filter by phone (primary) or residentName (fallback)
        if (phone) {
          where.phone = phone;
        } else if (userName) {
          where.residentName = userName;
        }
        where.societyId = null; // Individual users have no society
      } else if (req.user.role !== 'SUPER_ADMIN') {
        where.societyId = req.user.societyId;
      }

      const barcodes = await prisma.emergencyBarcode.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });
      res.json(barcodes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createBarcode(req, res) {
    try {
      const { label, type } = req.body;
      const role = (req.user.role || '').toUpperCase();
      let { name, phone, societyId, unit } = req.user;

      if (!phone) {
        const fullUser = await prisma.user.findUnique({ 
          where: { id: req.user.id },
          include: { society: true }
        });
        name = fullUser.name;
        phone = fullUser.phone;
        societyId = fullUser.societyId;
      }

      // For Individual users, unit is always 'N/A' (they have no unit)
      if (role === 'INDIVIDUAL') {
        unit = 'N/A';
        societyId = null; // Individual users have no society
      } else if (!unit) {
        // For other roles, try to find unit
        const ownedUnit = await prisma.unit.findFirst({ where: { ownerId: req.user.id } });
        const rentedUnit = await prisma.unit.findFirst({ where: { tenantId: req.user.id } });
        const unitObj = ownedUnit || rentedUnit;
        unit = unitObj ? `${unitObj.block}-${unitObj.number}` : 'N/A';
      }

      // Generate a unique non-guessable ID
      const barcodeId = `eb-${Math.random().toString(36).substring(2, 15)}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${barcodeId}`;

      const barcode = await prisma.emergencyBarcode.create({
        data: {
          id: barcodeId,
          residentName: name,
          unit: unit || 'N/A',
          phone: phone || 'N/A',
          label: label || type,
          type: type || 'property',
          qrCodeUrl,
          status: 'active',
          societyId: role === 'INDIVIDUAL' ? null : societyId
        }
      });

      res.status(201).json(barcode);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateBarcodeStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const barcode = await prisma.emergencyBarcode.update({
        where: { id },
        data: { status }
      });

      res.json(barcode);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteBarcode(req, res) {
    try {
      const { id } = req.params;

      await prisma.emergencyBarcode.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async regenerateBarcode(req, res) {
    try {
      const { id } = req.params;

      const oldBarcode = await prisma.emergencyBarcode.findUnique({ where: { id } });
      if (!oldBarcode) {
        return res.status(404).json({ error: 'Barcode not found' });
      }

      // 1. Mark old as inactive/regenerated
      await prisma.emergencyBarcode.update({
        where: { id },
        data: { status: 'disabled' }
      });
      
      const newId = `eb-reg-${Math.random().toString(36).substring(2, 15)}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${newId}`;

      const newBarcode = await prisma.emergencyBarcode.create({
        data: {
          id: newId,
          residentName: oldBarcode.residentName,
          unit: oldBarcode.unit,
          phone: oldBarcode.phone,
          label: oldBarcode.label,
          type: oldBarcode.type,
          qrCodeUrl,
          status: 'active',
          societyId: oldBarcode.societyId
        }
      });

      res.status(201).json(newBarcode);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = EmergencyBarcodeController;
