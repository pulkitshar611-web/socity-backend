const prisma = require('../lib/prisma');

class InvoiceController {
    static async list(req, res) {
        try {
            const { status, block, search } = req.query;
            const societyId = req.user.societyId;

            const where = {
                societyId,
                ...(req.user.role === 'RESIDENT' ? { residentId: req.user.id } : {}),
                ...(status && status !== 'all' ? { status: status.toUpperCase() } : {}),
                ...(block && block !== 'all' ? { unit: { block } } : {}),
                ...(search ? {
                    OR: [
                        { invoiceNo: { contains: search } },
                        { unit: { number: { contains: search } } },
                        { resident: { name: { contains: search } } }
                    ]
                } : {})
            };

            const invoices = await prisma.invoice.findMany({
                where,
                include: {
                    unit: true,
                    resident: { select: { name: true, phone: true } },
                    items: true
                },
                orderBy: { createdAt: 'desc' }
            });

            res.json(invoices.map(inv => ({
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                unit: {
                    number: inv.unit.number,
                    block: inv.unit.block,
                    type: inv.unit.type
                },
                resident: inv.resident ? {
                    name: inv.resident.name,
                    phone: inv.resident.phone
                } : null,
                amount: inv.amount,
                maintenance: inv.maintenance,
                utilities: inv.utilities,
                penalty: inv.penalty,
                dueDate: inv.dueDate.toISOString().split('T')[0],
                status: inv.status.toLowerCase(),
                paidDate: inv.paidDate ? inv.paidDate.toISOString().split('T')[0] : null,
                paymentMode: inv.paymentMode,
                description: inv.description,
                items: inv.items
            })));
        } catch (error) {
            console.error('List Invoices Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getStats(req, res) {
        try {
            const societyId = req.user.societyId;
            console.log('Fetching invoice stats for society:', societyId);

            const stats = await prisma.invoice.groupBy({
                by: ['status'],
                where: { societyId },
                _sum: { amount: true },
                _count: { id: true }
            });

            console.log('Raw stats from DB:', JSON.stringify(stats, null, 2));

            const result = {
                totalInvoices: 0,
                paidInvoices: 0,
                pendingInvoices: 0,
                overdueInvoices: 0,
                totalCollection: 0,
                pendingAmount: 0,
                overdueAmount: 0,
                totalBilled: 0
            };

            stats.forEach(s => {
                const amount = s._sum.amount || 0;
                const count = s._count.id || 0;

                result.totalBilled += amount;
                result.totalInvoices += count;

                const status = s.status.toUpperCase();

                if (status === 'PAID') {
                    result.totalCollection += amount;
                    result.paidInvoices += count;
                } else if (status === 'PENDING') {
                    result.pendingAmount += amount;
                    result.pendingInvoices += count;
                } else if (status === 'OVERDUE') {
                    result.overdueAmount += amount;
                    result.overdueInvoices += count;
                }
            });

            console.log('Computed stats result:', result);
            res.json(result);
        } catch (error) {
            console.error('Get Stats Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req, res) {
        try {
            const { unitId, amount, issueDate, dueDate, description } = req.body;
            const societyId = req.user.societyId;

            console.log('Creating single invoice:', { unitId, amount, issueDate, dueDate, societyId });

            const unit = await prisma.unit.findFirst({
                where: {
                    id: parseInt(unitId),
                    societyId
                },
                include: { owner: true, tenant: true }
            });

            if (!unit) {
                console.error(`Unit not found for ID: ${unitId} in Society: ${societyId}`);
                return res.status(404).json({ error: 'Unit not found' });
            }

            const invoiceNo = `INV-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceNo,
                    societyId,
                    unitId: unit.id,
                    residentId: unit.tenantId || unit.ownerId, // Fallback to owner if no tenant
                    amount: parseFloat(amount),
                    maintenance: parseFloat(amount), // Assuming generic amount is maintenance for now
                    utilities: 0,
                    dueDate: new Date(dueDate),
                    status: 'PENDING',
                    description: description || null
                }
            });


            res.status(201).json(invoice);
        } catch (error) {
            console.error('Create Invoice Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async generateBills(req, res) {
        try {
            const { month, dueDate, block } = req.body;
            const societyId = req.user.societyId;

            // Fetch configs
            const [maintenanceRules, activeCharges, lateFeeConfig] = await Promise.all([
                prisma.maintenanceRule.findMany({ where: { societyId, isActive: true } }),
                prisma.chargeMaster.findMany({ where: { societyId, isActive: true } }),
                prisma.lateFeeConfig.findUnique({ where: { societyId } })
            ]);

            // Fetch all units in the society/block
            const units = await prisma.unit.findMany({
                where: {
                    societyId,
                    ...(block && block !== 'all' ? { block } : {})
                }
            });

            const yearMonth = month.replace('-', '');
            const createdInvoices = [];

            for (const unit of units) {
                const invoiceItems = [];
                let totalAmount = 0;
                let maintenanceTotal = 0;
                let utilitiesTotal = 0;

                // 1. Calculate Maintenance based on ALL applicable rules
                const applicableRules = maintenanceRules.filter(r =>
                    r.unitType === unit.type || r.unitType === 'ALL'
                );

                for (const rule of applicableRules) {
                    let amount = 0;
                    if (rule.calculationType === 'FLAT') {
                        amount = rule.amount;
                    } else if (rule.calculationType === 'AREA') {
                        amount = unit.areaSqFt * rule.ratePerSqFt;
                    }

                    if (amount > 0) {
                        const ruleDescription = rule.calculationType === 'AREA'
                            ? `${rule.unitType} Maintenance (${unit.areaSqFt} sq.ft @ ₹${rule.ratePerSqFt})`
                            : `${rule.unitType} Maintenance (Flat)`;

                        invoiceItems.push({
                            name: ruleDescription,
                            amount: amount
                        });
                        maintenanceTotal += amount;
                        totalAmount += amount;
                    }
                }

                // 2. Add Itemized Charges from ChargeMaster
                activeCharges.forEach(charge => {
                    if (charge.defaultAmount > 0) {
                        invoiceItems.push({
                            name: charge.name,
                            amount: charge.defaultAmount
                        });
                        utilitiesTotal += charge.defaultAmount;
                        totalAmount += charge.defaultAmount;
                    }
                });

                // 3. Calculate Overdue Penalty
                let penaltyAmount = 0;
                if (lateFeeConfig && lateFeeConfig.isActive) {
                    const overdueInvoices = await prisma.invoice.findMany({
                        where: {
                            unitId: unit.id,
                            status: 'OVERDUE'
                        }
                    });

                    if (overdueInvoices.length > 0) {
                        if (lateFeeConfig.feeType === 'FIXED') {
                            penaltyAmount = lateFeeConfig.amount;
                        } else if (lateFeeConfig.feeType === 'PERCENTAGE') {
                            const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
                            penaltyAmount = (totalOverdue * lateFeeConfig.amount) / 100;
                        }

                        if (penaltyAmount > 0) {
                            invoiceItems.push({
                                name: `Late Fee Penalty (${lateFeeConfig.feeType})`,
                                amount: penaltyAmount
                            });
                            totalAmount += penaltyAmount;
                        }
                    }
                }

                const invoiceNo = `INV-${yearMonth}-${unit.block}${unit.number}-${Date.now().toString().slice(-4)}`;

                // Create Invoice with itemized items
                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNo,
                        societyId,
                        unitId: unit.id,
                        residentId: unit.tenantId || unit.ownerId,
                        maintenance: maintenanceTotal,
                        utilities: utilitiesTotal,
                        penalty: penaltyAmount,
                        amount: totalAmount,
                        dueDate: new Date(dueDate),
                        status: 'PENDING',
                        description: `Automated itemized bill for ${month}`,
                        items: {
                            create: invoiceItems
                        }
                    },
                    include: {
                        items: true
                    }
                });
                createdInvoices.push(invoice);
            }

            res.status(201).json({
                message: `${createdInvoices.length} itemized bills generated successfully`,
                count: createdInvoices.length
            });
        } catch (error) {
            console.error('Generate Bills Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async markAsPaid(req, res) {
        try {
            const { invoiceNo } = req.params;
            const { paymentMode } = req.body;

            // Determine if invoiceNo is an ID or a reference string
            const isNumericId = /^\d+$/.test(invoiceNo);
            const whereClause = isNumericId ? { id: parseInt(invoiceNo) } : { invoiceNo };

            const invoice = await prisma.invoice.update({
                where: whereClause,
                data: {
                    status: 'PAID',
                    paidDate: new Date(),
                    paymentMode: paymentMode || 'CASH'
                }
            });

            // Create a SocietyReceipt
            const receiptNo = `REC-${invoice.invoiceNo}`;
            await prisma.societyReceipt.create({
                data: {
                    receiptNo,
                    societyId: invoice.societyId,
                    unitId: invoice.unitId,
                    residentId: invoice.residentId,
                    amount: invoice.amount,
                    date: new Date(),
                    paymentMethod: paymentMode || 'CASH',
                    description: `Payment for Invoice ${invoice.invoiceNo}`,
                    breakups: {
                        create: {
                            invoiceId: invoice.id,
                            amount: invoice.amount,
                            description: `Full payment for ${invoice.invoiceNo}`
                        }
                    }
                }
            });

            // Also record this as a transaction
            await prisma.transaction.create({
                data: {
                    type: 'INCOME',
                    category: 'Maintenance',
                    amount: invoice.amount,
                    date: new Date(),
                    description: `Payment for Invoice ${invoice.invoiceNo}`,
                    paymentMethod: (paymentMode || 'CASH').toUpperCase(),
                    status: 'PAID',
                    societyId: invoice.societyId,
                    invoiceNo: invoice.invoiceNo,
                    receivedFrom: invoice.resident ? invoice.resident.name : 'Resident'
                }
            });

            res.json(invoice);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async listDefaulters(req, res) {
        try {
            const societyId = req.user.societyId;
            const { block, search } = req.query;

            // Find all units with PENDING or OVERDUE invoices
            const defaultersRaw = await prisma.invoice.groupBy({
                by: ['unitId', 'residentId'],
                where: {
                    societyId,
                    status: { in: ['PENDING', 'OVERDUE'] }
                },
                _sum: { amount: true },
                _count: { id: true },
                _min: { dueDate: true }
            });

            const unitIds = defaultersRaw.map(d => d.unitId);
            const units = await prisma.unit.findMany({
                where: {
                    id: { in: unitIds },
                    ...(block && block !== 'all' ? { block } : {}),
                    ...(search ? {
                        OR: [
                            { number: { contains: search } },
                            { owner: { name: { contains: search } } },
                            { tenant: { name: { contains: search } } }
                        ]
                    } : {})
                },
                include: { owner: true, tenant: true }
            });

            const unitMap = units.reduce((acc, unit) => {
                acc[unit.id] = unit;
                return acc;
            }, {});

            const result = defaultersRaw
                .filter(d => unitMap[d.unitId])
                .map(d => {
                    const unit = unitMap[d.unitId];
                    const resident = unit.tenant || unit.owner;
                    const dueDays = Math.floor((new Date() - new Date(d._min.dueDate)) / (1000 * 60 * 60 * 24));

                    let status = 'low';
                    if (dueDays > 90 || d._sum.amount > 10000) status = 'critical';
                    else if (dueDays > 60 || d._sum.amount > 5000) status = 'high';
                    else if (dueDays > 30) status = 'medium';

                    return {
                        id: unit.id.toString(),
                        unit: unit.number,
                        block: unit.block,
                        ownerName: resident?.name || 'Unknown',
                        phone: resident?.phone || 'N/A',
                        outstandingAmount: d._sum.amount,
                        dueSince: d._min.dueDate.toISOString().split('T')[0],
                        dueDays,
                        status,
                        reminders: 0, // Placeholder
                        paymentStatus: 'overdue'
                    };
                });

            res.json(result);
        } catch (error) {
            console.error('List Defaulters Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async delete(req, res) {
        try {
            const { id } = req.params;
            const numericId = parseInt(id);
            const societyId = req.user.societyId;

            if (isNaN(numericId)) {
                return res.status(400).json({ error: 'Invalid invoice ID' });
            }

            console.log('Deleting Regular Invoice with ID:', id, 'Society:', societyId);

            const invoice = await prisma.invoice.findFirst({
                where: { id: numericId, societyId }
            });

            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            await prisma.invoice.delete({
                where: { id: numericId }
            });

            res.json({ message: 'Invoice deleted successfully' });
        } catch (error) {
            console.error('Delete Regular Invoice Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getDefaulterStats(req, res) {
        try {
            const societyId = req.user.societyId;

            const overdueData = await prisma.invoice.aggregate({
                where: {
                    societyId,
                    status: { in: ['PENDING', 'OVERDUE'] }
                },
                _sum: { amount: true },
                _count: { id: true }
            });

            const uniqueDefaulters = await prisma.invoice.groupBy({
                by: ['unitId'],
                where: {
                    societyId,
                    status: { in: ['PENDING', 'OVERDUE'] }
                }
            });

            res.json({
                totalOutstanding: overdueData._sum.amount || 0,
                totalDefaulters: uniqueDefaulters.length,
                overdueInvoices: overdueData._count.id,
                criticalCases: 0 // Logic could be added here
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async finalizeSetup(req, res) {
        try {
            const societyId = req.user.societyId;
            const now = new Date();
            const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            const currentMonthStr = `${monthNames[now.getMonth()]}-${now.getFullYear()}`;

            // Default due date to 10 days from now
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 10);

            console.log(`Finalizing setup for society ${societyId} and generating bills for ${currentMonthStr}`);

            // We can reuse generateBills logic by mock-calling it or just implementing the core logic here
            // For simplicity, let's just trigger the generateBills logic

            // Check if bills already exist for this month to avoid duplicates
            const yearMonth = currentMonthStr.split('-').reverse().join('');
            const existing = await prisma.invoice.findFirst({
                where: {
                    societyId,
                    invoiceNo: { contains: `INV-${yearMonth}` }
                }
            });

            if (existing) {
                return res.json({
                    message: "Society billing setup finalized. Invoices for the current month already exist.",
                    count: 0
                });
            }

            // Redirect internal call to generateBills format
            const mockReq = {
                body: {
                    month: currentMonthStr,
                    dueDate: dueDate.toISOString().split('T')[0]
                },
                user: req.user
            };

            // Instead of redirecting, let's call the logic
            // (In a real app, you might refactor the logic into a service)

            return await InvoiceController.generateBills(mockReq, res);
        } catch (error) {
            console.error('Finalize Setup Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = InvoiceController;
