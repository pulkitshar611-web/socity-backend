const prisma = require('../lib/prisma');

class LedgerController {
  
  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      
      // 1. Fetch Aggregated Data from Transactions
      const transactions = await prisma.transaction.findMany({
        where: { societyId, status: 'PAID' },
        select: { type: true, category: true, amount: true, paymentMethod: true }
      });

      // 2. Fetch User Defined Accounts
      const ledgerAccounts = await prisma.ledgerAccount.findMany({
        where: { societyId }
      });

      // 3. Current Balances
      let cashInHand = 0;
      let bankHDFC = 0; // Simulated logic or from payment methods
      let bankICICI = 0;
      
      // Calculate Assets from Payment Methods
      transactions.forEach(t => {
          if (t.type === 'INCOME') {
              if (t.paymentMethod === 'CASH') cashInHand += t.amount;
              else bankHDFC += t.amount; // Assume Online goes to HDFC for now
          } else {
              if (t.paymentMethod === 'CASH') cashInHand -= t.amount;
              else bankHDFC -= t.amount;
          }
      });

      // Group Income & Expenses by Category
      const incomeMap = {};
      const expenseMap = {};

      transactions.forEach(t => {
          if (t.type === 'INCOME') {
              incomeMap[t.category] = (incomeMap[t.category] || 0) + t.amount;
          } else {
              expenseMap[t.category] = (expenseMap[t.category] || 0) + t.amount;
          }
      });

      // Build Hierarchy
      const assets = [
          { id: '1001', name: 'Cash in Hand', code: '1001', balance: cashInHand, type: 'Debit' },
          { id: '1002', name: 'Bank - HDFC', code: '1002', balance: bankHDFC, type: 'Debit' }
      ];
      
      // Merge defined accounts if any
      // ...

      const liabilities = [
          // Simplified for now
          { id: '2001', name: 'Security Deposits', code: '2001', balance: 0, type: 'Credit' }
      ];

      const income = Object.keys(incomeMap).map((cat, idx) => ({
          id: `300${idx}`, name: cat, code: `300${idx}`, balance: incomeMap[cat], type: 'Credit'
      }));

      const expenses = Object.keys(expenseMap).map((cat, idx) => ({
          id: `400${idx}`, name: cat, code: `400${idx}`, balance: expenseMap[cat], type: 'Debit'
      }));

      const accountGroups = [
        {
            id: 1,
            name: 'Assets',
            type: 'Asset',
            balance: assets.reduce((sum, a) => sum + a.balance, 0),
            trend: 'up',
            accounts: assets
        },
        {
            id: 2,
            name: 'Liabilities',
            type: 'Liability',
            balance: liabilities.reduce((sum, a) => sum + a.balance, 0),
            trend: 'down',
            accounts: liabilities
        },
        {
            id: 3,
            name: 'Income',
            type: 'Income',
            balance: income.reduce((sum, a) => sum + a.balance, 0),
            trend: 'up',
            accounts: income
        },
        {
            id: 4,
            name: 'Expenses',
            type: 'Expense',
            balance: expenses.reduce((sum, a) => sum + a.balance, 0),
            trend: 'down',
            accounts: expenses
        }
      ];

      res.json(accountGroups);

    } catch (error) {
      console.error('Ledger Stats Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async createAccount(req, res) {
      try {
          const { name, code, type } = req.body;
          if (!name || !code || !type) {
              return res.status(400).json({ error: 'Name, code and type are required' });
          }
          const societyId = req.user.societyId;
          const existing = await prisma.ledgerAccount.findFirst({
              where: { societyId, code: String(code).trim() }
          });
          if (existing) {
              return res.status(400).json({
                  error: 'This account code is already in use. Please choose a different code.'
              });
          }
          const account = await prisma.ledgerAccount.create({
              data: {
                  name: name.trim(),
                  code: String(code).trim(),
                  type,
                  societyId
              }
          });
          res.json(account);
      } catch (error) {
          if (error.code === 'P2002') {
              return res.status(400).json({
                  error: 'This account code is already in use. Please choose a different code.'
              });
          }
          res.status(500).json({ error: error.message });
      }
  }
}

module.exports = LedgerController;
