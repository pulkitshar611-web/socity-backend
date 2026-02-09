const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.invoice.count();
        console.log(`Prisma Client is working correctly. Invoice count: ${count}`);
        process.exit(0);
    } catch (error) {
        console.error('Prisma Client verification failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
