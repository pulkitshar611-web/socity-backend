const prisma = require('../lib/prisma');

const VendorInvoiceController = {
  // List Invoices
  list: async (req, res) => {
    try {
      const societyId = req.user.societyId;
      const { status, vendorId } = req.query;

      const where = { societyId };
      if (status && status !== 'all') where.status = status;
      if (vendorId && vendorId !== 'all') where.vendorId = parseInt(vendorId);

      const invoices = await prisma.vendorInvoice.findMany({
        where,
        include: {
          vendor: true,
          society: { select: { name: true } }
        },
        orderBy: { invoiceDate: 'desc' }
      });

      res.json(invoices);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  },

  // Create Invoice
  create: async (req, res) => {
    try {
      const societyId = req.user.societyId;
      const { 
        vendorId, invoiceNumber, invoiceDate, dueDate, 
        description, category, amount, gstAmount, remarks 
      } = req.body;

      // Basic Validation
      if (!vendorId || !invoiceNumber || !amount || !dueDate) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check for duplicate invoice number for this vendor
      const existing = await prisma.vendorInvoice.findUnique({
        where: {
          societyId_invoiceNumber_vendorId: {
            societyId,
            invoiceNumber,
            vendorId: parseInt(vendorId)
          }
        }
      });

      if (existing) {
        return res.status(400).json({ error: 'Invoice number already exists for this vendor' });
      }

      const totalAmount = parseFloat(amount) + (parseFloat(gstAmount) || 0);

      const invoice = await prisma.vendorInvoice.create({
        data: {
          societyId,
          vendorId: parseInt(vendorId),
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate: new Date(dueDate),
          description,
          category,
          amount: parseFloat(amount),
          gstAmount: parseFloat(gstAmount) || 0,
          totalAmount,
          remarks,
          status: 'PENDING'
        }
      });

      res.status(201).json(invoice);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  },

  // Approve Invoice
  approve: async (req, res) => {
    try {
      const { id } = req.params;
      const societyId = req.user.societyId;

      const invoice = await prisma.vendorInvoice.findFirst({
        where: { id: parseInt(id), societyId }
      });

      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (invoice.status !== 'PENDING') return res.status(400).json({ error: 'Invoice is not pending' });

      const updated = await prisma.vendorInvoice.update({
        where: { id: parseInt(id) },
        data: { status: 'APPROVED' }
      });

      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to approve invoice' });
    }
  },

  // Pay Invoice
  pay: async (req, res) => {
    try {
      const { id } = req.params;
      const societyId = req.user.societyId;
      const { paymentDate, paymentMethod, bankAccountId, transactionRef, remarks } = req.body;

      if (!bankAccountId) return res.status(400).json({ error: 'Bank Account is required' });

      // transaction
      const result = await prisma.$transaction(async (prisma) => {
        // 1. Get Invoice
        const invoice = await prisma.vendorInvoice.findFirst({
            where: { id: parseInt(id), societyId }
        });

        if (!invoice) throw new Error('Invoice not found');
        if (invoice.status === 'PAID') throw new Error('Invoice is already paid');

        // 2. Get Bank Account
        const bank = await prisma.ledgerAccount.findFirst({
            where: { id: parseInt(bankAccountId), societyId }
        });
        if (!bank) throw new Error('Invalid Bank Account');

        // 3. Update Invoice Status
        const updatedInvoice = await prisma.vendorInvoice.update({
            where: { id: parseInt(id) },
            data: {
                status: 'PAID',
                paymentDate: new Date(paymentDate || new Date()),
                paymentMethod: (paymentMethod || 'ONLINE').toUpperCase(),
                bankAccountId: parseInt(bankAccountId),
                transactionRef,
                remarks: remarks || invoice.remarks 
            }
        });

        // 4. Create Ledger Transaction (Expense)
        // Debit Expense (Conceptually), Credit Bank
        // In our simple Transaction model: Type=EXPENSE, amount=negative or positive depending on convention.
        // Usually Expense is negative cash flow.
        
        await prisma.transaction.create({
            data: {
                type: 'EXPENSE',
                category: invoice.category || 'Vendor Payment',
                amount: invoice.totalAmount, // Amount spent
                date: new Date(paymentDate || new Date()),
                description: `Payment for Invoice ${invoice.invoiceNumber} - ${invoice.description}`,
                paymentMethod: (paymentMethod || 'ONLINE').toUpperCase(),
                status: 'PAID',
                societyId,
                paidTo: (await prisma.vendor.findUnique({where: {id: invoice.vendorId}})).name,
                bankAccountId: parseInt(bankAccountId),
                invoiceNo: invoice.invoiceNumber
            }
        });

        // 5. Update Bank Balance
        await prisma.ledgerAccount.update({
            where: { id: parseInt(bankAccountId) },
            data: {
                balance: { decrement: invoice.totalAmount }
            }
        });

        return updatedInvoice;
      });

      res.json(result);

    } catch (error) {
      console.error(error);
      res.status(400).json({ error: error.message || 'Failed to process payment' });
    }
  }
};

module.exports = VendorInvoiceController;
