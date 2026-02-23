const prisma = require('../lib/prisma');

class InvoiceController {
    static async list(req, res) {
        try {
            const { status, block, search } = req.query;
            const societyId = req.user.societyId;

            const where = {
                societyId,
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
                    resident: { select: { name: true, phone: true } }
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
                description: inv.description
            })));
        } catch (error) {
            console.error('List Invoices Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async myInvoices(req, res) {
        try {
            const userId = req.user.id;
            const societyId = req.user.societyId;

            // Find the unit(s) this resident is linked to (as owner or tenant)
            const myUnits = await prisma.unit.findMany({
                where: {
                    societyId,
                    OR: [
                        { ownerId: userId },
                        { tenantId: userId }
                    ]
                },
                select: { id: true, number: true, block: true }
            });

            const myUnitIds = myUnits.map(u => u.id);

            // Get invoices by residentId OR by unit membership
            const invoices = await prisma.invoice.findMany({
                where: {
                    societyId,
                    OR: [
                        { residentId: userId },
                        ...(myUnitIds.length > 0 ? [{ unitId: { in: myUnitIds } }] : [])
                    ]
                },
                include: {
                    unit: { select: { number: true, block: true, type: true } },
                    items: true
                },
                orderBy: { createdAt: 'desc' }
            });

            // Deduplicate (in case residentId + unitId both match)
            const seen = new Set();
            const unique = invoices.filter(inv => {
                if (seen.has(inv.id)) return false;
                seen.add(inv.id);
                return true;
            });

            res.json(unique.map(inv => ({
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                unit: inv.unit ? `${inv.unit.block}-${inv.unit.number}` : 'N/A',
                amount: inv.amount,
                maintenance: inv.maintenance,
                utilities: inv.utilities,
                penalty: inv.penalty,
                dueDate: inv.dueDate.toISOString().split('T')[0],
                createdAt: inv.createdAt.toISOString().split('T')[0],
                status: inv.status.toLowerCase(),
                paidDate: inv.paidDate ? inv.paidDate.toISOString().split('T')[0] : null,
                paymentMode: inv.paymentMode,
                description: inv.description,
                items: inv.items || []
            })));
        } catch (error) {
            console.error('My Invoices Error:', error);
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

            // Fetch active charges
            const charges = await prisma.chargeMaster.findMany({
                where: { societyId, isActive: true }
            });

            const chargeTotal = charges.reduce((sum, c) => sum + (c.defaultAmount || 0), 0);

            const invoice = await prisma.invoice.create({
                data: {
                    invoiceNo,
                    societyId,
                    unitId: unit.id,
                    residentId: unit.tenantId || unit.ownerId,
                    amount: parseFloat(amount) + chargeTotal,
                    maintenance: parseFloat(amount),
                    utilities: 0,
                    dueDate: new Date(dueDate),
                    status: 'PENDING',
                    description: description || null,
                    items: {
                        create: charges.map(c => ({
                            name: c.name,
                            amount: c.defaultAmount || 0
                        }))
                    }
                },
                include: { items: true }
            });

            res.status(201).json(invoice);
        } catch (error) {
            console.error('Create Invoice Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async generateBills(req, res) {
        try {
            const { month, dueDate, block, maintenanceAmount, utilityAmount, lateFee } = req.body;
            const societyId = req.user.societyId;

            // Fetch all units in the society/block
            const units = await prisma.unit.findMany({
                where: {
                    societyId,
                    ...(block && block !== 'all' ? { block } : {})
                }
            });

            // Fetch active charge master for this society
            const charges = await prisma.chargeMaster.findMany({
                where: { societyId, isActive: true }
            });

            const yearMonth = month.replace('-', ''); // jan-2025 -> jan2025
        
        // Find existing invoices for this month to avoid duplicates
        const existingInvoices = await prisma.invoice.findMany({
            where: {
                societyId,
                invoiceNo: { startsWith: `INV-${yearMonth}-` }
            },
            select: { unitId: true }
        });
        const existingUnitIds = new Set(existingInvoices.map(inv => inv.unitId));

        const createdInvoices = [];
        const skippedUnits = [];

        for (const unit of units) {
            if (existingUnitIds.has(unit.id)) {
                skippedUnits.push(unit.id);
                continue;
            }

            const invoiceNo = `INV-${yearMonth}-${unit.block}${unit.number}-${Date.now().toString().slice(-4)}`;
                
                // Calculate total amount from charges
                const chargeTotal = charges.reduce((sum, c) => sum + (c.defaultAmount || 0), 0);
                const totalAmount = parseFloat(maintenanceAmount || 0) + parseFloat(utilityAmount || 0) + chargeTotal;

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNo,
                        societyId,
                        unitId: unit.id,
                        residentId: unit.tenantId || unit.ownerId,
                        amount: totalAmount,
                        maintenance: parseFloat(maintenanceAmount || 0),
                        utilities: parseFloat(utilityAmount || 0),
                        dueDate: new Date(dueDate),
                        status: 'PENDING',
                        items: {
                            create: charges.map(c => ({
                                name: c.name,
                                amount: c.defaultAmount || 0
                            }))
                        }
                    }
                });
                createdInvoices.push(invoice);
        }

        res.status(201).json({ 
            message: `${createdInvoices.length} bills generated successfully. ${skippedUnits.length} skipped (already generated).`, 
            count: createdInvoices.length,
            skipped: skippedUnits.length 
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

            // Also record this as a transaction
            await prisma.transaction.create({
                data: {
                    type: 'INCOME',
                    category: 'Maintenance',
                    amount: invoice.amount,
                    date: new Date(),
                    description: `Payment for Invoice ${invoiceNo}`,
                    paymentMethod: (paymentMode || 'CASH').toUpperCase(),
                    status: 'PAID',
                    societyId: invoice.societyId,
                    invoiceNo: invoice.invoiceNo,
                    receivedFrom: invoice.residentId ? undefined : 'Resident' // We should ideally link user here but schema uses String
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
            const monthName = now.toLocaleString('default', { month: 'short' }).toLowerCase();
            const year = now.getFullYear();
            const yearMonth = `${monthName}${year}`;

            // Find existing invoices for this month to avoid duplicates
            const existingInvoices = await prisma.invoice.findMany({
                where: {
                    societyId,
                    invoiceNo: { startsWith: `INV-${yearMonth}-` }
                },
                select: { unitId: true }
            });
            const existingUnitIds = new Set(existingInvoices.map(inv => inv.unitId));

            // Fetch all units
            const units = await prisma.unit.findMany({
                where: { societyId }
            });

            // Fetch rules and charges
            const [rules, charges] = await Promise.all([
                prisma.maintenanceRule.findMany({ where: { societyId, isActive: true } }),
                prisma.chargeMaster.findMany({ where: { societyId, isActive: true } })
            ]);

            const createdInvoices = [];
            const skippedUnits = [];

            for (const unit of units) {
                if (existingUnitIds.has(unit.id)) {
                    skippedUnits.push(unit.id);
                    continue;
                }

                let rule = rules.find(r => r.unitType === unit.type);
                if (!rule) rule = rules.find(r => r.unitType === 'ALL');

                let maintenanceAmount = 0;
                if (rule) {
                    if (rule.calculationType === 'FLAT') {
                        maintenanceAmount = rule.amount || 0;
                    } else if (rule.calculationType === 'AREA') {
                        maintenanceAmount = (unit.areaSqFt || 0) * (rule.ratePerSqFt || 0);
                    }
                }

                const chargeTotal = charges.reduce((sum, c) => sum + (c.defaultAmount || 0), 0);
                const totalAmount = maintenanceAmount + chargeTotal;

                const invoiceNo = `INV-${yearMonth}-${unit.block}${unit.number}-${Date.now().toString().slice(-4)}`;

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNo,
                        societyId,
                        unitId: unit.id,
                        residentId: unit.tenantId || unit.ownerId,
                        amount: totalAmount,
                        maintenance: maintenanceAmount,
                        utilities: 0,
                        dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 10),
                        status: 'PENDING',
                        items: {
                            create: charges.map(c => ({
                                name: c.name,
                                amount: c.defaultAmount || 0
                            }))
                        }
                    }
                });
                createdInvoices.push(invoice);
            }

            res.status(201).json({ 
                message: `${createdInvoices.length} bills generated successfully. ${skippedUnits.length} skipped (already generated).`, 
                count: createdInvoices.length,
                skipped: skippedUnits.length
            });
        } catch (error) {
            console.error('Finalize Setup Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async applyLateFees(req, res) {
        try {
            const societyId = req.user.societyId;
            const now = new Date();

            // 1. Fetch Late Fee Config
            const config = await prisma.lateFeeConfig.findUnique({
                where: { societyId }
            });

            if (!config || !config.isActive) {
                return res.json({ message: 'Late fee feature is disabled for this society.', processed: 0 });
            }

            const graceDate = new Date();
            graceDate.setDate(now.getDate() - config.gracePeriod);

            // 2. Find overdue pending invoices
            const overdueInvoices = await prisma.invoice.findMany({
                where: {
                    societyId,
                    status: 'PENDING',
                    dueDate: { lt: graceDate }
                }
            });

            let updatedCount = 0;
            for (const inv of overdueInvoices) {
                let penalty = 0;
                
                if (config.feeType === 'FIXED') {
                    penalty = config.amount;
                } else if (config.feeType === 'PERCENTAGE') {
                    penalty = (inv.amount - inv.penalty) * (config.amount / 100);
                } else if (config.feeType === 'PER_DAY') {
                    const daysOverdue = Math.floor((now - inv.dueDate) / (1000 * 60 * 60 * 24));
                    penalty = daysOverdue * config.amount;
                }

                // Cap penalty if needed
                if (config.maxCap && penalty > config.maxCap) {
                    penalty = config.maxCap;
                }

                // Update invoice if penalty changed
                // Note: We sum existing penalty if we want it to be cumulative, 
                // but usually it's set once or recalculated. Let's set/update it.
                if (penalty > inv.penalty) {
                    await prisma.invoice.update({
                        where: { id: inv.id },
                        data: {
                            penalty,
                            amount: inv.amount + (penalty - inv.penalty)
                        }
                    });
                    updatedCount++;
                }
            }

            res.json({ 
                message: `Successfully processed late fees for ${overdueInvoices.length} invoices. ${updatedCount} were updated with new penalties.`,
                processed: overdueInvoices.length,
                updated: updatedCount
            });
        } catch (error) {
            console.error('Apply Late Fees Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = InvoiceController;
