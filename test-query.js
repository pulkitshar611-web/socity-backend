const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Testing Invoice Query...');
        const invoices = await prisma.invoice.findMany({
            take: 1,
            include: {
                unit: true
            }
        });
        console.log('Query successful:', JSON.stringify(invoices, null, 2));
    } catch (error) {
        console.error('Query failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
