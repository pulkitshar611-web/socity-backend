const prisma = require('../lib/prisma');

class WalletController {
    static async getBalance(req, res) {
        try {
            const { unitId } = req.params;
            const societyId = req.user.societyId;

            let wallet = await prisma.wallet.findUnique({
                where: { unitId: parseInt(unitId) },
                include: { unit: true }
            });

            // Ensure wallet exists
            if (!wallet) {
                wallet = await prisma.wallet.create({
                    data: { unitId: parseInt(unitId) },
                    include: { unit: true }
                });
            }

            // Verify society access
            if (wallet.unit.societyId !== societyId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(wallet);
        } catch (error) {
            console.error('Get Wallet Balance Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async listTransactions(req, res) {
        try {
            const { unitId } = req.params;
            const societyId = req.user.societyId;

            const wallet = await prisma.wallet.findUnique({
                where: { unitId: parseInt(unitId) },
                include: { unit: true }
            });

            if (!wallet || wallet.unit.societyId !== societyId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const transactions = await prisma.walletTransaction.findMany({
                where: { walletId: wallet.id },
                include: { receipt: true },
                orderBy: { date: 'desc' }
            });

            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async addAdvance(req, res) {
        try {
            const { unitId, amount, paymentMethod, transactionId, description } = req.body;
            const societyId = req.user.societyId;

            const unit = await prisma.unit.findUnique({
                where: { id: parseInt(unitId) },
                include: { owner: true, tenant: true }
            });

            if (!unit || unit.societyId !== societyId) {
                return res.status(404).json({ error: 'Unit not found' });
            }

            const residentId = unit.tenantId || unit.ownerId;
            const receiptNo = `REC-ADV-${Date.now().toString().slice(-6)}`;

            const result = await prisma.$transaction(async (tx) => {
                // Ensure wallet exists
                let wallet = await tx.wallet.findUnique({ where: { unitId: unit.id } });
                if (!wallet) {
                    wallet = await tx.wallet.create({ data: { unitId: unit.id } });
                }

                // Create Receipt
                const receipt = await tx.societyReceipt.create({
                    data: {
                        receiptNo,
                        societyId,
                        unitId: unit.id,
                        residentId,
                        amount: parseFloat(amount),
                        paymentMethod,
                        transactionId,
                        description: description || 'Advance Payment'
                    }
                });

                // Update Wallet Balance
                const updatedWallet = await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { advanceBalance: { increment: parseFloat(amount) } }
                });

                // Create Wallet Transaction
                await tx.walletTransaction.create({
                    data: {
                        walletId: wallet.id,
                        type: 'CREDIT',
                        purpose: 'ADVANCE',
                        amount: parseFloat(amount),
                        description: description || 'Advance Payment',
                        receiptId: receipt.id
                    }
                });

                // Record as Income Transaction for Society
                await tx.transaction.create({
                    data: {
                        type: 'INCOME',
                        category: 'Advance',
                        amount: parseFloat(amount),
                        date: new Date(),
                        description: `Advance Payment from ${unit.number} - ${receiptNo}`,
                        paymentMethod: paymentMethod.toUpperCase(),
                        status: 'PAID',
                        societyId,
                        receivedFrom: unit.owner?.name || 'Resident'
                    }
                });

                return updatedWallet;
            });

            res.status(201).json(result);
        } catch (error) {
            console.error('Add Advance Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async addSecurityDeposit(req, res) {
        try {
            const { unitId, amount, paymentMethod, transactionId, description } = req.body;
            const societyId = req.user.societyId;

            const unit = await prisma.unit.findUnique({
                where: { id: parseInt(unitId) },
                include: { owner: true, tenant: true }
            });

            if (!unit || unit.societyId !== societyId) {
                return res.status(404).json({ error: 'Unit not found' });
            }

            const residentId = unit.tenantId || unit.ownerId;
            const receiptNo = `REC-DEP-${Date.now().toString().slice(-6)}`;

            const result = await prisma.$transaction(async (tx) => {
                let wallet = await tx.wallet.findUnique({ where: { unitId: unit.id } });
                if (!wallet) {
                    wallet = await tx.wallet.create({ data: { unitId: unit.id } });
                }

                const receipt = await tx.societyReceipt.create({
                    data: {
                        receiptNo,
                        societyId,
                        unitId: unit.id,
                        residentId,
                        amount: parseFloat(amount),
                        paymentMethod,
                        transactionId,
                        description: description || 'Security Deposit'
                    }
                });

                const updatedWallet = await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { securityDepositBalance: { increment: parseFloat(amount) } }
                });

                await tx.walletTransaction.create({
                    data: {
                        walletId: wallet.id,
                        type: 'CREDIT',
                        purpose: 'SECURITY_DEPOSIT',
                        amount: parseFloat(amount),
                        description: description || 'Security Deposit',
                        receiptId: receipt.id
                    }
                });

                await tx.transaction.create({
                    data: {
                        type: 'INCOME',
                        category: 'Deposit',
                        amount: parseFloat(amount),
                        date: new Date(),
                        description: `Security Deposit from ${unit.number} - ${receiptNo}`,
                        paymentMethod: paymentMethod.toUpperCase(),
                        status: 'PAID',
                        societyId,
                        receivedFrom: unit.owner?.name || 'Resident'
                    }
                });

                return updatedWallet;
            });

            res.status(201).json(result);
        } catch (error) {
            console.error('Add Security Deposit Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = WalletController;
