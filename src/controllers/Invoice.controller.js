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
            const { month, dueDate, block, maintenanceAmount, utilityAmount, lateFee } = req.body;
            const societyId = req.user.societyId;

            // Fetch all units in the society/block
            const units = await prisma.unit.findMany({
                where: {
                    societyId,
                    ...(block && block !== 'all' ? { block } : {})
                }
            });

            const yearMonth = month.replace('-', ''); // jan-2025 -> jan2025
            const createdInvoices = [];

            for (const unit of units) {
                const invoiceNo = `INV-${yearMonth}-${unit.block}${unit.number}-${Date.now().toString().slice(-4)}`;

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNo,
                        societyId,
                        unitId: unit.id,
                        residentId: unit.tenantId || unit.ownerId,
                        amount: parseFloat(maintenanceAmount || 0) + parseFloat(utilityAmount || 0),
                        maintenance: parseFloat(maintenanceAmount || 0),
                        utilities: parseFloat(utilityAmount || 0),
                        dueDate: new Date(dueDate),
                        status: 'PENDING'
                    }
                });
                createdInvoices.push(invoice);
            }

            res.status(201).json({ message: `${createdInvoices.length} bills generated successfully`, count: createdInvoices.length });
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
}

module.exports = InvoiceController;
