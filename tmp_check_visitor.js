const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const visitor = await prisma.visitor.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { unit: true }
    });
    console.log('Latest Visitor:', JSON.stringify(visitor, null, 2));
}
main().finally(() => prisma.$disconnect());
