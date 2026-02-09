const prisma = require('../lib/prisma');

class PurchaseOrderController {
  
  // List POs with filters
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      const { status, vendorId, search, period } = req.query;

      const where = { societyId };
      if (status && status !== 'all') where.status = status;
      if (vendorId && vendorId !== 'all') where.vendorId = parseInt(vendorId);
      
      if (search) {
        where.OR = [
          { poNumber: { contains: search } },
          { description: { contains: search } }
        ];
      }

      if (period === 'current') {
         const now = new Date();
         const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
         where.date = { gte: firstDay };
      } else if (period === 'previous') {
         const now = new Date();
         const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
         const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
         where.date = { gte: firstDay, lte: lastDay };
      }

      const orders = await prisma.purchaseOrder.findMany({
        where,
        include: {
          vendor: { select: { name: true, contact: true, email: true } },
          purchaseRequest: { select: { prNumber: true } }
        },
        orderBy: { date: 'desc' }
      });

      res.json(orders);
    } catch (error) {
      console.error('List PO Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create PO
  static async create(req, res) {
    try {
      const societyId = req.user.societyId;
      const { 
        vendorId, 
        prId, 
        items, 
        description, 
        expectedDeliveryDate, 
        paymentTerms,
        subtotal,
        taxAmount,
        totalAmount
    } = req.body;

    console.log('Create PO Request:', {
        user: req.user,
        body: req.body,
        societyId: req.user.societyId
    });

    if (!societyId) {
        return res.status(400).json({ error: 'User is not associated with a society' });
    }

    if (!vendorId) {
        return res.status(400).json({ error: 'Vendor ID is required' });
    }

      // Generate PO Number
      const year = new Date().getFullYear();
      const count = await prisma.purchaseOrder.count({ where: { societyId } });
      const poNumber = `PO-${year}-${String(count + 1).padStart(3, '0')}`;

      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          societyId,
          vendorId: parseInt(vendorId),
          prId: prId ? parseInt(prId) : null,
          items: items || [],
          description,
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          paymentTerms,
          subtotal: parseFloat(subtotal) || 0,
          taxAmount: parseFloat(taxAmount) || 0,
          totalAmount: parseFloat(totalAmount) || 0,
          status: 'DRAFT'
        }
      });
      
      // If linked to a PR, link it (already done via prId) but maybe we want to update PR status?
      if (prId) {
          await prisma.purchaseRequest.update({
              where: { id: parseInt(prId) },
              data: { status: 'CONVERTED_PO' }
          });
      }

      res.status(201).json(po);
    } catch (error) {
      console.error('Create PO Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get Stats
  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      
      const [total, draft, sent, delivered, confirmed, partiallyReceived] = await Promise.all([
        prisma.purchaseOrder.count({ where: { societyId } }),
        prisma.purchaseOrder.count({ where: { societyId, status: 'DRAFT' } }),
        prisma.purchaseOrder.count({ where: { societyId, status: 'SENT' } }),
        prisma.purchaseOrder.count({ where: { societyId, status: 'DELIVERED' } }),
        prisma.purchaseOrder.count({ where: { societyId, status: 'CONFIRMED' } }),
        prisma.purchaseOrder.count({ where: { societyId, status: 'PARTIALLY_RECEIVED' } })
      ]);
      
      // Calculate Total Value (This Month)
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const aggregation = await prisma.purchaseOrder.aggregate({
         _sum: { totalAmount: true },
         where: { 
             societyId,
             date: { gte: firstDay },
             status: { not: 'CANCELLED' } 
         }
      });

      res.json({
        total,
        draft,
        pendingDelivery: sent + confirmed + partiallyReceived,
        delivered,
        totalValueMonth: aggregation._sum.totalAmount || 0
      });
    } catch (error) {
      console.error('Stats PO Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update Status
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body; // DRAFT, SENT, CONFIRMED, DELIVERED, CANCELLED
      
      const updateData = { status };
      if (status === 'DELIVERED') {
          updateData.deliveryDate = new Date();
      }

      const updatedPo = await prisma.purchaseOrder.update({
        where: { id: parseInt(id) },
        data: updateData
      });

      res.json(updatedPo);

    } catch (error) {
      console.error('Update PO Status Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PurchaseOrderController;
