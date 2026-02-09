const prisma = require('../lib/prisma');

class ReceiptController {
  
  // List Receipts
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      const { status, type, search } = req.query;

      const where = { societyId };
      if (status && status !== 'all') where.status = status.toUpperCase();
      if (type && type !== 'all') where.type = type.toUpperCase();
      
      if (search) {
        where.OR = [
          { grNumber: { contains: search } },
          { description: { contains: search } },
          { invoiceNumber: { contains: search } }
        ];
      }

      const receipts = await prisma.goodsReceipt.findMany({
        where,
        include: {
          vendor: { select: { name: true } },
          purchaseOrder: { select: { poNumber: true } }
        },
        orderBy: { date: 'desc' }
      });

      res.json(receipts);
    } catch (error) {
      console.error('List Receipt Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create Receipt
  static async create(req, res) {
    try {
      const societyId = req.user.societyId;
      const { 
        vendorId, 
        poId, 
        type, // GOODS, SERVICE
        items, 
        description, 
        date,
        receivedBy,
        invoiceNumber
    } = req.body;

    if (!societyId) return res.status(400).json({ error: 'User not in society' });
    if (!vendorId) return res.status(400).json({ error: 'Vendor required' });

      // Generate GR Number
      const year = new Date().getFullYear();
      const count = await prisma.goodsReceipt.count({ where: { societyId } });
      const prefix = type === 'SERVICE' ? 'SR' : 'GR';
      const grNumber = `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;

      // Calculate status based on items if passed
      let status = 'COMPLETED';
      let hasPending = false;
      let hasPartial = false;
      
      if (items && Array.isArray(items)) {
          items.forEach(item => {
              if (item.status === 'pending') hasPending = true;
              if (item.status === 'partial') hasPartial = true;
          });
      }
      
      if (hasPending) status = 'PENDING';
      else if (hasPartial) status = 'PARTIAL';

      const receipt = await prisma.goodsReceipt.create({
        data: {
          grNumber,
          societyId,
          vendorId: parseInt(vendorId),
          poId: poId ? parseInt(poId) : null,
          type: type || 'GOODS',
          items: items || [],
          description,
          date: date ? new Date(date) : new Date(),
          receivedBy,
          invoiceNumber,
          status,
          qualityCheckStatus: 'PENDING'
        }
      });
      
      // Update PO status if linked
      if (poId) {
          // Logic could be more complex (check if all items received), but simplified for now
          if (status === 'COMPLETED') {
              await prisma.purchaseOrder.update({
                  where: { id: parseInt(poId) },
                  data: { status: 'DELIVERED', deliveryDate: new Date() }
              });
          } else {
               await prisma.purchaseOrder.update({
                  where: { id: parseInt(poId) },
                  data: { status: 'PARTIALLY_RECEIVED' }
              });
          }
      }

      res.status(201).json(receipt);
    } catch (error) {
      console.error('Create Receipt Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get Stats
  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      
      const [total, completed, partial, pendingQC] = await Promise.all([
        prisma.goodsReceipt.count({ where: { societyId } }),
        prisma.goodsReceipt.count({ where: { societyId, status: 'COMPLETED' } }),
        prisma.goodsReceipt.count({ where: { societyId, status: 'PARTIAL' } }),
        prisma.goodsReceipt.count({ where: { societyId, qualityCheckStatus: 'PENDING' } })
      ]);

      res.json({
        total,
        completed,
        partial,
        pendingQC
      });
    } catch (error) {
      console.error('Stats Receipt Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update QC Status
  static async updateQC(req, res) {
      try {
          const { id } = req.params;
          const { status } = req.body; // PASSED, FAILED
          
          const updated = await prisma.goodsReceipt.update({
              where: { id: parseInt(id) },
              data: { qualityCheckStatus: status }
          });
          res.json(updated);
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }
}

module.exports = ReceiptController;
