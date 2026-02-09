const prisma = require('../lib/prisma');

class BankController {
  
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      
      // Fetch LedgerAccounts extending Bank logic
      // We assume accounts with bankDetails are bank accounts OR we can use a specific code range or type
      const banks = await prisma.ledgerAccount.findMany({
        where: { 
            societyId,
            bankDetails: {
                not: prisma.DbNull
            }
        },
        include: {
            transactions: {
                select: { amount: true, type: true }
            }
        }
      });

      const bankData = banks.map(bank => {
          // Calculate dynamic balance based on transactions
          // Opening Balance + Income - Expense
          const transactionBalance = bank.transactions.reduce((acc, txn) => {
              return acc + (txn.type === 'INCOME' ? txn.amount : -txn.amount);
          }, 0);

          return {
              id: bank.id,
              name: bank.name,
              code: bank.code,
              bankDetails: bank.bankDetails,
              balance: bank.balance + transactionBalance, // Base balance + transactions
              type: bank.type
          };
      });

      res.json(bankData);
    } catch (error) {
      console.error('Bank List Error:', error);
      require('fs').writeFileSync('bank_error.log', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { name, ifsc, accountNo, branch, openingBalance } = req.body;
      const societyId = req.user.societyId;

      const bank = await prisma.ledgerAccount.create({
        data: {
            name,
            code: `BANK-${Date.now()}`, // Simple auto-code for now
            type: 'ASSET',
            balance: parseFloat(openingBalance) || 0,
            societyId,
            isSystem: true,
            bankDetails: {
                ifsc,
                accountNo,
                branch
            }
        }
      });
      
      res.status(201).json(bank);
    } catch (error) {
      console.error('Create Bank Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getTransactions(req, res) {
      try {
          const societyId = req.user.societyId;
          const { bankId } = req.query;

          const where = { 
              societyId,
              status: 'PAID'
          };

          if (bankId && bankId !== 'all') {
              where.bankAccountId = parseInt(bankId);
          } else {
              // If no specific bank, ensure we only get transactions that ARE linked to a bank (optional, or all transactions?)
              // The UI implies "Recent Transactions" which might mean ALL transactions or just those affecting banks.
              // Usually Bank Management shows transactions affecting Bank.
              where.bankAccountId = { not: null };
          }

          const transactions = await prisma.transaction.findMany({
              where,
              include: {
                  bankAccount: {
                      select: { name: true }
                  }
              },
              orderBy: { date: 'desc' },
              take: 50
          });

          res.json(transactions);

      } catch (error) {
        console.error('Bank Transactions Error:', error);
        res.status(500).json({ error: error.message });
      }
  }
}

module.exports = BankController;
