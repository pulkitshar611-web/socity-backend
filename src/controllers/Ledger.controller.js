const prisma = require('../lib/prisma');

class LedgerController {
  
  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      
      // 1. Fetch User Defined Accounts
      const ledgerAccounts = await prisma.ledgerAccount.findMany({
        where: { societyId },
        include: {
          journalLines: true,
          transactions: {
            where: { status: 'PAID' }
          }
        }
      });

      // 2. Pre-calculate balances for each account
      const accountsWithBalance = ledgerAccounts.map(account => {
        let balance = account.balance || 0; // Starting/Opening balance

        // Add Transactions (if linked directly to this account, e.g. Bank Account)
        account.transactions.forEach(t => {
          if (t.type === 'INCOME') {
            balance += t.amount;
          } else {
            balance -= t.amount;
          }
        });

        // Add Journal Lines
        account.journalLines.forEach(line => {
          // Journal logic: Asset/Expense increase with Debit, Liability/Income increase with Credit
          if (account.type === 'ASSET' || account.type === 'EXPENSE') {
            balance += (line.debit - line.credit);
          } else {
            balance += (line.credit - line.debit);
          }
        });

        return {
          id: account.id,
          name: account.name,
          code: account.code,
          type: account.type, // ASSET, LIABILITY, INCOME, EXPENSE
          balance: balance,
          displayBalanceType: (account.type === 'ASSET' || account.type === 'EXPENSE') ? 'Debit' : 'Credit'
        };
      });

      // 3. Fallback for "Cash" if not in ledgerAccounts (for backward compatibility if needed)
      // Actually, it's better to ensure a "Cash in Hand" account exists in seed or created on fly.
      // But for now, let's group what we have.

      const accountGroups = [
        {
          id: 1,
          name: 'Assets',
          type: 'Asset',
          balance: 0,
          accounts: []
        },
        {
          id: 2,
          name: 'Liabilities',
          type: 'Liability',
          balance: 0,
          accounts: []
        },
        {
          id: 3,
          name: 'Income',
          type: 'Income',
          balance: 0,
          accounts: []
        },
        {
          id: 4,
          name: 'Expenses',
          type: 'Expense',
          balance: 0,
          accounts: []
        }
      ];

      accountsWithBalance.forEach(acc => {
        let group;
        if (acc.type === 'ASSET') group = accountGroups[0];
        else if (acc.type === 'LIABILITY') group = accountGroups[1];
        else if (acc.type === 'INCOME') group = accountGroups[2];
        else if (acc.type === 'EXPENSE') group = accountGroups[3];

        if (group) {
          group.accounts.push({
            id: acc.id,
            name: acc.name,
            code: acc.code,
            balance: acc.balance,
            type: acc.displayBalanceType
          });
          group.balance += acc.balance;
        }
      });

      // 4. Special Handling for Transactions NOT linked to a specific bank account (Global Income/Expense)
      // If a transaction has bankAccountId = null, it might be "General Cash"
      const unlinkedTransactions = await prisma.transaction.findMany({
        where: { societyId, status: 'PAID', bankAccountId: null }
      });

      if (unlinkedTransactions.length > 0) {
        let cashBalance = 0;
        unlinkedTransactions.forEach(t => {
          if (t.type === 'INCOME') cashBalance += t.amount;
          else cashBalance -= t.amount;
        });

        // Add a virtual "General Cash" account if balance exists or just add to Assets
        accountGroups[0].accounts.push({
          id: 'v-cash',
          name: 'General Cash (Unlinked)',
          code: '1000',
          balance: cashBalance,
          type: 'Debit'
        });
        accountGroups[0].balance += cashBalance;
      }

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
