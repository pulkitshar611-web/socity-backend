const prisma = require('../lib/prisma');

class EmergencyLogController {
  static async listLogs(req, res) {
    try {
      const where = {};
      const role = (req.user.role || '').toUpperCase();
      
      if (role === 'RESIDENT') {
        // Residents only see logs for their own barcodes
        let phone = req.user.phone;
        if (!phone) {
          const user = await prisma.user.findUnique({ where: { id: req.user.id } });
          phone = user?.phone;
        }
        const userBarcodes = await prisma.emergencyBarcode.findMany({
          where: { phone: phone || 'N/A', societyId: req.user.societyId },
          select: { id: true }
        });
        const barcodeIds = userBarcodes.map(b => b.id);
        if (barcodeIds.length > 0) {
          where.barcodeId = { in: barcodeIds };
        } else {
          // No barcodes found, return empty
          return res.json([]);
        }
      } else if (role === 'INDIVIDUAL') {
        // Individual users: see logs for their own barcodes (by phone, no societyId)
        let phone = req.user.phone;
        if (!phone) {
          const user = await prisma.user.findUnique({ where: { id: req.user.id } });
          phone = user?.phone;
        }
        const userBarcodes = await prisma.emergencyBarcode.findMany({
          where: { phone: phone || 'N/A', societyId: null },
          select: { id: true }
        });
        const barcodeIds = userBarcodes.map(b => b.id);
        if (barcodeIds.length > 0) {
          where.barcodeId = { in: barcodeIds };
        } else {
          // No barcodes found, return empty
          return res.json([]);
        }
      } else if (req.user.role !== 'SUPER_ADMIN') {
        where.societyId = req.user.societyId;
      }

      const logs = await prisma.emergencyLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: 50 // Limit results for performance
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = EmergencyLogController;
