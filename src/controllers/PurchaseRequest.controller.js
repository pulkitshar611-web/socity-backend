const prisma = require('../lib/prisma');

class PurchaseRequestController {
  
  // List PRs with filters
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      const { status, priority, search } = req.query;

      const where = { societyId };
      if (status && status !== 'all') where.status = status;
      if (priority && priority !== 'all') where.priority = priority;
      
      if (search) {
        where.OR = [
          { prNumber: { contains: search } },
          { title: { contains: search } },
          { department: { contains: search } }
        ];
      }

      const requests = await prisma.purchaseRequest.findMany({
        where,
        include: {
          requestedBy: { select: { name: true, role: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(requests);
    } catch (error) {
      console.error('List PR Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create PR
  static async create(req, res) {
    try {
      const societyId = req.user.societyId;
      const { title, description, department, priority, items, estimatedAmount } = req.body;

      // Generate PR Number (Simple auto-increment logic or UUID based)
      // For now, let's make a simple one: PR-YYYY-RANDOM
      const year = new Date().getFullYear();
      const random = Math.floor(1000 + Math.random() * 9000);
      const prNumber = `PR-${year}-${random}`;

      const pr = await prisma.purchaseRequest.create({
        data: {
          prNumber,
          title,
          description,
          department,
          priority: priority || 'MEDIUM',
          status: 'PENDING_CM', // Default first step
          items: items || [], // JSON array
          estimatedAmount: parseFloat(estimatedAmount) || 0,
          societyId,
          requestedById: req.user.id
        }
      });

      res.status(201).json(pr);
    } catch (error) {
      console.error('Create PR Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get Stats
  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      
      const [total, pendingCM, pendingFinance, approved, convertedPO] = await Promise.all([
        prisma.purchaseRequest.count({ where: { societyId } }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'PENDING_CM' } }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'PENDING_FINANCE' } }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'APPROVED' } }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'CONVERTED_PO' } })
      ]);

      res.json({
        total,
        pendingCM,
        pendingFinance,
        approved,
        convertedPO
      });
    } catch (error) {
      console.error('Stats PR Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update Status (Approve/Reject)
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      const societyId = req.user.societyId;
      const userId = req.user.id;

      // Valid Transitions
      // PENDING_CM -> PENDING_FINANCE (CM Approves)
      // PENDING_CM -> REJECTED
      // PENDING_FINANCE -> APPROVED (Finance Approves)
      // PENDING_FINANCE -> REJECTED
      // APPROVED -> CONVERTED_PO

      const pr = await prisma.purchaseRequest.findFirst({
        where: { id: parseInt(id), societyId }
      });
      if (!pr) return res.status(404).json({ error: 'Purchase Request not found' });

      const updateData = { status };
      
      // Track who acted
      if (status === 'PENDING_FINANCE' || (status === 'REJECTED' && pr.status === 'PENDING_CM')) {
         updateData.cmActionBy = userId;
         updateData.cmActionDate = new Date();
      } else if (status === 'APPROVED' || (status === 'REJECTED' && pr.status === 'PENDING_FINANCE')) {
         updateData.financeActionBy = userId;
         updateData.financeActionDate = new Date();
      }

      // If we want to capture remarks, we assume they might handle it in a logs system or description update, 
      // but for now we just change status.

      const updatedPr = await prisma.purchaseRequest.update({
        where: { id: parseInt(id) },
        data: updateData
      });

      res.json(updatedPr);

    } catch (error) {
      console.error('Update Status Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PurchaseRequestController;
