const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    try {
        console.log('--- Starting Verification ---');

        // 1. Check if we have active charges
        const charges = await prisma.chargeMaster.findMany({ where: { isActive: true } });
        console.log('Active charges found:', charges.map(c => c.name).join(', '));

        // 2. Create a dummy unit for testing or find one
        const society = await prisma.society.findFirst();
        const unit = await prisma.unit.findFirst({ where: { societyId: society.id } });
        
        console.log('Using Society ID:', society.id, 'Unit:', unit.number);

        // 3. Create a manual invoice
        // (Note: We can't easily call the controller here, but we can simulate the logic or check the DB later)
        // Let's just create one manually in DB to test the applyLateFees logic
        
        const oldDueDate = new Date();
        oldDueDate.setDate(oldDueDate.getDate() - 30); // 30 days overdue

        const testInvoice = await prisma.invoice.create({
            data: {
                invoiceNo: `VERIFY-${Date.now()}`,
                societyId: society.id,
                unitId: unit.id,
                amount: 5000,
                maintenance: 5000,
                dueDate: oldDueDate,
                status: 'PENDING'
            }
        });
        console.log('Created overdue test invoice:', testInvoice.id);

        // 4. Ensure LateFeeConfig exists
        const config = await prisma.lateFeeConfig.upsert({
            where: { societyId: society.id },
            update: { isActive: true, amount: 200, feeType: 'FIXED', gracePeriod: 5 },
            create: { societyId: society.id, isActive: true, amount: 200, feeType: 'FIXED', gracePeriod: 5 }
        });
        console.log('Late Fee Config ensured:', config.feeType, config.amount);

        console.log('Please trigger "Apply Late Fees" from the UI or wait for me to simulate it.');
        
    } catch (error) {
        console.error('Verification Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
