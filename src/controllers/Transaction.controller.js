const prisma = require('../lib/prisma');

class TransactionController {
  static async list(req, res) {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        where.societyId = req.user.societyId;
      }

      const transactions = await prisma.transaction.findMany({
        where,
        include: { society: { select: { name: true } } },
        orderBy: { date: 'desc' }
      });
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async recordIncome(req, res) {
    try {
      console.log('Recording Income:', req.body);
      const { category, amount, date, receivedFrom, paymentMethod, description, invoiceNo, bankAccountId } = req.body;
      
      if (!req.user || !req.user.societyId) {
          console.error('User missing societyId:', req.user);
          return res.status(400).json({ error: 'User does not belong to a society' });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
          return res.status(400).json({ error: 'Invalid amount' });
      }

            // Verify bank if provided
      if (bankAccountId) {
        const bank = await prisma.ledgerAccount.findUnique({ where: { id: parseInt(bankAccountId) } });
        if (!bank || bank.societyId !== req.user.societyId) {
            return res.status(400).json({ error: 'Invalid Bank Account' });
        }
      }

      const transaction = await prisma.transaction.create({
        data: {
          type: 'INCOME',
          category: category || 'Maintenance',
          amount: parsedAmount,
          date: new Date(date),
          receivedFrom,
          paymentMethod,
          description,
          invoiceNo: invoiceNo || null, 
          status: 'PAID',
          societyId: req.user.societyId,
          bankAccountId: bankAccountId ? parseInt(bankAccountId) : null
        }
      });
      console.log('Income Recorded:', transaction);
      res.status(201).json(transaction);
    } catch (error) {
      console.error('Record Income Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async recordExpense(req, res) {
    try {
      const { category, amount, date, paidTo, paymentMethod, description, invoiceNo, bankAccountId } = req.body;
      
      // Verify bank if provided
      if (bankAccountId) {
        const bank = await prisma.ledgerAccount.findUnique({ where: { id: parseInt(bankAccountId) } });
        if (!bank || bank.societyId !== req.user.societyId) {
            return res.status(400).json({ error: 'Invalid Bank Account' });
        }
      }

      const transaction = await prisma.transaction.create({
        data: {
          type: 'EXPENSE',
          category,
          amount: parseFloat(amount),
          date: new Date(date),
          paidTo,
          paymentMethod,
          invoiceNo,
          description,
          status: 'PAID',
          societyId: req.user.societyId,
          bankAccountId: bankAccountId ? parseInt(bankAccountId) : null
        }
      });
      res.status(201).json(transaction);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // 1. Fetch Transactions and Journal Adjustments
      const [
        totalTrIncome, thisMonthTrIncome, pendingTrIncome, 
        totalTrExpenses, thisMonthTrExpenses,
        journalAdjustments,
        thisMonthJournalAdjustments,
        payers
      ] = await Promise.all([
        prisma.transaction.aggregate({
          where: { societyId, type: 'INCOME', status: 'PAID' },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { societyId, type: 'INCOME', status: 'PAID', date: { gte: firstDayOfMonth } },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { societyId, type: 'INCOME', status: 'PENDING' },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { societyId, type: 'EXPENSE' },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { societyId, type: 'EXPENSE', date: { gte: firstDayOfMonth } },
          _sum: { amount: true }
        }),
        prisma.journalLine.findMany({
          where: { journalEntry: { societyId, status: 'POSTED' } },
          include: { account: { select: { type: true } } }
        }),
        prisma.journalLine.findMany({
          where: { 
            journalEntry: { 
              societyId, 
              status: 'POSTED',
              date: { gte: firstDayOfMonth }
            } 
          },
          include: { account: { select: { type: true } } }
        }),
        prisma.transaction.groupBy({
          by: ['receivedFrom'],
          where: { societyId, type: 'INCOME' },
        })
      ]);

      // Calculate Adjustments
      let totalJvIncome = 0;
      let totalJvExpense = 0;
      journalAdjustments.forEach(line => {
        if (line.account.type === 'INCOME') totalJvIncome += (line.credit - line.debit);
        else if (line.account.type === 'EXPENSE') totalJvExpense += (line.debit - line.credit);
      });

      let monthJvIncome = 0;
      let monthJvExpense = 0;
      thisMonthJournalAdjustments.forEach(line => {
        if (line.account.type === 'INCOME') monthJvIncome += (line.credit - line.debit);
        else if (line.account.type === 'EXPENSE') monthJvExpense += (line.debit - line.credit);
      });

      res.json({
        totalIncome: (totalTrIncome._sum.amount || 0) + totalJvIncome,
        thisMonthIncome: (thisMonthTrIncome._sum.amount || 0) + monthJvIncome,
        pendingIncome: pendingTrIncome._sum.amount || 0,
        totalPayers: payers.length,
        totalExpenses: (totalTrExpenses._sum.amount || 0) + totalJvExpense,
        thisMonthExpenses: (thisMonthTrExpenses._sum.amount || 0) + monthJvExpense
      });
    } catch (error) {
      console.error('Transaction Stats Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { amount, ...data } = req.body;
      
      // Check if transaction exists and belongs to society
      const existing = await prisma.transaction.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Transaction not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: transaction belongs to another society' });
      }

      // Update
      const updated = await prisma.transaction.update({
        where: { id: parseInt(id) },
        data: {
            ...data,
            amount: amount ? parseFloat(amount) : undefined,
            date: data.date ? new Date(data.date) : undefined
        }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      
      const existing = await prisma.transaction.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Transaction not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: transaction belongs to another society' });
      }

      await prisma.transaction.delete({ where: { id: parseInt(id) } });
      res.json({ message: 'Transaction deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

}

module.exports = TransactionController;
