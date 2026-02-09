const prisma = require('../lib/prisma');

class JournalEntryController {
  
  // Create a new Manual Journal Entry
  static async create(req, res) {
    try {
      const { date, narration, lines } = req.body;
      const societyId = req.user.societyId;

      if (!lines || lines.length < 2) {
        return res.status(400).json({ error: 'A journal entry must have at least 2 lines.' });
      }

      // Validate Debits = Credits
      const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
      const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) { // Allowing small floating point diff
        return res.status(400).json({ 
            error: `Journal is unbalanced. Total Debit: ${totalDebit}, Total Credit: ${totalCredit}` 
        });
      }

      // Generate Voucher Number (Simplified: JV-YYYY-Timestamp)
      const year = new Date().getFullYear();
      const voucherNo = `JV-${year}-${Date.now().toString().slice(-6)}`;

      const entry = await prisma.journalEntry.create({
        data: {
          voucherNo,
          date: new Date(date),
          narration,
          status: 'POSTED', // Auto-posting for now, can be DRAFT later
          societyId,
          createdBy: req.user.name || 'Admin',
          lines: {
            create: lines.map(line => ({
              accountId: parseInt(line.accountId),
              debit: parseFloat(line.debit) || 0,
              credit: parseFloat(line.credit) || 0
            }))
          }
        },
        include: {
          lines: {
            include: { account: true }
          }
        }
      });

      // Update Account Balances (Simplified: We usually don't store computed balance in LedgerAccount if we aggregate on fly,
      // but if we did, we'd update it here. Since LedgerController aggregates ALL 'Transaction' records, 
      // AND we want 'JournalEntry' to also affect the Ledger, we need the LedgerController to ALSO read from JournalEntry
      // OR we insert 'Transaction' records for each line? 
      // BETTER APPROACH for this architecture: 
      // Let's stick to reading 'JournalEntry' in the LedgerController as well, 
      // OR for simplicity in this specific "Exact Logic" request: 
      // We will create the entry. The LedgerController aggregation logic (Step 4 of previous task) 
      // currently ONLY reads `Transaction`. 
      // To make these JVs affect the Trial Balance, we should Update LedgerController later to include these.
      
      res.status(201).json(entry);

    } catch (error) {
      console.error('Create JV Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      const entries = await prisma.journalEntry.findMany({
        where: { societyId },
        include: {
          lines: {
            include: { account: true }
          }
        },
        orderBy: { date: 'desc' }
      });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = JournalEntryController;
