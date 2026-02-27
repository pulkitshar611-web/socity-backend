const prisma = require('../lib/prisma');

class EmergencyLogController {
  static async listLogs(req, res) {
    try {
      const where = {};
      const role = (req.user.role || '').toUpperCase();
      
      if (role === 'RESIDENT' || role === 'INDIVIDUAL') {
        // Find barcodes owned by this user
        const userBarcodes = await prisma.emergencyBarcode.findMany({
          where: { userId: req.user.id },
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
