const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function debug() {
    try {
        const users = await prisma.user.findMany({
            where: { email: 'resident1@society.com' },
            include: {
                ownedUnits: true,
                rentedUnits: true
            }
        });

        const user = users[0];
        if (!user) {
            fs.writeFileSync('debug_invoices.json', JSON.stringify({ error: 'User not found' }, null, 2));
            return;
        }

        const unitIds = [...user.ownedUnits.map(u => u.id), ...user.rentedUnits.map(u => u.id)];
        
        const invoices = await prisma.invoice.findMany({
            where: {
                OR: [
                    { residentId: user.id },
                    { unitId: { in: unitIds } }
                ]
            },
            include: {
                unit: true
            }
        });

        const dashboardDataCheck = await prisma.invoice.aggregate({
            where: {
                unitId: { in: unitIds },
                status: { in: ['PENDING', 'OVERDUE'] }
            },
            _sum: { amount: true }
        });

        const result = {
            user: {
                id: user.id,
                email: user.email,
                societyId: user.societyId
            },
            unitIds,
            invoicesCount: invoices.length,
            invoices: invoices.map(i => ({
                id: i.id,
                invoiceNo: i.invoiceNo,
                societyId: i.societyId,
                unitId: i.unitId,
                residentId: i.residentId,
                amount: i.amount,
                status: i.status
            })),
            dashboardDues_sum: dashboardDataCheck._sum.amount
        };

        fs.writeFileSync('debug_invoices.json', JSON.stringify(result, null, 2));
    } catch (e) {
        fs.writeFileSync('debug_invoices.json', JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

debug();
