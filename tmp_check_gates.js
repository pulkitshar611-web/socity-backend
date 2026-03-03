const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const gates = await prisma.gate.findMany({ where: { societyId: 1 } });
    console.log('Gates for Society 1:', JSON.stringify(gates, null, 2));
}
main().finally(() => prisma.$disconnect());
