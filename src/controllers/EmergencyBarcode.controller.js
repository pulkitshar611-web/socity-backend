const prisma = require('../lib/prisma');

class EmergencyBarcodeController {
  static async listBarcodes(req, res) {
    try {
      const where = {};
      const role = (req.user.role || '').toUpperCase();
      
      if (role === 'RESIDENT' || role === 'INDIVIDUAL') {
        let phone = req.user.phone;
        if (!phone) {
          const user = await prisma.user.findUnique({ where: { id: req.user.id } });
          phone = user?.phone;
        }

        where.OR = [
          { userId: req.user.id },
          { 
            AND: [
              { phone: phone || 'N/A' },
              { societyId: role === 'INDIVIDUAL' ? null : req.user.societyId }
            ]
          }
        ];
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
      const { label, type, phone: bodyPhone } = req.body;
      const role = (req.user.role || '').toUpperCase();
      let { name, societyId, unit } = req.user;
      let phone = bodyPhone || req.user.phone;

      // Ensure we have name, phone and societyId for the resident
      if (!name || !phone || !societyId) {
        console.log(`[EmergencyBarcode] Fetching full user for ID: ${req.user.id} (Existing - name: ${name}, phone: ${phone}, societyId: ${societyId})`);
        const fullUser = await prisma.user.findUnique({ 
          where: { id: req.user.id }
        });
        
        if (fullUser) {
          name = name || fullUser.name;
          phone = phone || fullUser.phone;
          societyId = societyId || fullUser.societyId;
          console.log(`[EmergencyBarcode] Found full user: ${fullUser.name}, ${fullUser.phone}, ${fullUser.societyId}`);
        } else {
          console.warn(`[EmergencyBarcode] Full user NOT found for ID: ${req.user.id}`);
        }
      }

      console.log(`[EmergencyBarcode] Final data - name: ${name}, phone: ${phone}, societyId: ${societyId}`);

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
      // Use the live domain for the QR code URL
      const publicUrl = `https://socity.kiaantechnology.com/emergency/${barcodeId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

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
          societyId: role === 'INDIVIDUAL' ? null : societyId,
          userId: req.user.id
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
      // Use the live domain for the QR code URL
      const publicUrl = `https://socity.kiaantechnology.com/emergency/${newId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

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

  static async getPublicBarcode(req, res) {
    try {
      const { id } = req.params;
      const barcode = await prisma.emergencyBarcode.findUnique({
        where: { id },
        select: {
          id: true,
          residentName: true,
          unit: true,
          phone: true, // Include primary phone
          label: true,
          type: true,
          status: true,
          societyId: true
        }
      });

      if (!barcode || barcode.status !== 'active') {
        return res.status(404).json({ error: 'Invalid or inactive barcode' });
      }

      // Fetch resident's emergency contacts if it's a society-linked barcode
      let emergencyContacts = [];
      if (barcode.societyId) {
        // Find the user to get their emergency contacts. 
        // We try by phone first, but fallback to name + society if it was a custom phone.
        let residentUser = await prisma.user.findFirst({
          where: {
            phone: barcode.phone,
            societyId: barcode.societyId
          }
        });

        if (!residentUser) {
          residentUser = await prisma.user.findFirst({
            where: {
              name: barcode.residentName,
              societyId: barcode.societyId
            }
          });
        }

        if (residentUser) {
          emergencyContacts = await prisma.emergencyContact.findMany({
            where: {
              residentId: residentUser.id,
              available: true
            },
            select: {
              name: true,
              phone: true,
              category: true
            }
          });
        }
      }

      res.json({
        ...barcode,
        emergencyContacts
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async submitScan(req, res) {
    try {
      const { id } = req.params;
      const { visitorName, visitorPhone, reason, isEmergency } = req.body;

      const barcode = await prisma.emergencyBarcode.findUnique({ where: { id } });
      if (!barcode || barcode.status !== 'active') {
        return res.status(404).json({ error: 'Barcode not found or inactive' });
      }

      const log = await prisma.emergencyLog.create({
        data: {
          visitorName,
          visitorPhone,
          reason,
          isEmergency: !!isEmergency,
          barcodeId: id,
          residentName: barcode.residentName,
          unit: barcode.unit,
          societyId: barcode.societyId
        }
      });

      // TODO: Trigger notification
      res.status(201).json({ message: 'Resident notified successfully', logId: log.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = EmergencyBarcodeController;
