const prisma = require('../lib/prisma');

class PlatformInvoiceController {
  static async listInvoices(req, res) {
    try {
      const { role, societyId } = req.user;
      const where = {};
      
      if (role === 'ADMIN') {
        where.societyId = societyId;
      }

      const invoices = await prisma.platformInvoice.findMany({
        where,
        include: { society: true },
        orderBy: { createdAt: 'desc' }
      });
      const formattedInvoices = invoices.map(inv => ({
        ...inv,
        societyName: inv.society.name,
        amountRaw: inv.amount,
        amount: `₹${inv.amount.toLocaleString()}`
      }));
      res.json(formattedInvoices);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createInvoice(req, res) {
    try {
      const { societyId, amount, dueDate, invoiceNo } = req.body;
      const invoice = await prisma.platformInvoice.create({
        data: {
          societyId: parseInt(societyId),
          amount: parseFloat(amount),
          dueDate: new Date(dueDate),
          invoiceNo: invoiceNo || `INV-${Date.now()}`,
          status: 'PENDING'
        }
      });
      res.status(201).json(invoice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async bulkCreateInvoices(req, res) {
    try {
      const activeSocieties = await prisma.society.findMany({
        where: { status: 'ACTIVE' }
      });

      const planPrices = {
        BASIC: 10000,
        PROFESSIONAL: 20000,
        ENTERPRISE: 75000
      };

      const createdInvoices = await Promise.all(
        activeSocieties.map(async (society) => {
          const amount = planPrices[society.subscriptionPlan] || 10000;
          return prisma.platformInvoice.create({
            data: {
              societyId: society.id,
              amount: amount,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
              invoiceNo: `INV-${society.id}-${Date.now().toString().slice(-6)}`,
              status: 'PENDING'
            }
          });
        })
      );

      res.status(201).json({ 
        message: `${createdInvoices.length} invoices generated successfully`,
        count: createdInvoices.length 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const totalInvoices = await prisma.platformInvoice.count();
      const paidInvoices = await prisma.platformInvoice.count({ where: { status: 'PAID' } });
      const pendingInvoices = await prisma.platformInvoice.count({ where: { status: 'PENDING' } });
      const overdueInvoices = await prisma.platformInvoice.count({ where: { status: 'OVERDUE' } });

      res.json({
        total: totalInvoices,
        paid: paidInvoices,
        pending: pendingInvoices,
        overdue: overdueInvoices
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getInvoice(req, res) {
    try {
      const { id } = req.params;
      const invoice = await prisma.platformInvoice.findUnique({
        where: { id: parseInt(id) },
        include: { society: true }
      });
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const data = { status };
      if (status === 'PAID') {
        data.paidDate = new Date();
      }
      const invoice = await prisma.platformInvoice.update({
        where: { id: parseInt(id) },
        data
      });
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const numericId = parseInt(id);
      
      if (isNaN(numericId)) {
        return res.status(400).json({ error: 'Invalid invoice ID' });
      }

      console.log('ID received for deletion:', id, 'Parsed ID:', numericId);

      const invoice = await prisma.platformInvoice.findUnique({
        where: { id: numericId }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      await prisma.platformInvoice.delete({
        where: { id: numericId }
      });

      res.json({ message: 'Invoice deleted successfully' });
    } catch (error) {
      console.error('Delete Platform Invoice Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PlatformInvoiceController;
