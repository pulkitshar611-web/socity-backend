const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const count = await prisma.visitor.count();
    console.log('Total Visitors:', count);
}
main().finally(() => prisma.$disconnect());
