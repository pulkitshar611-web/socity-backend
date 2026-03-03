const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const logs = await prisma.emergencyLog.findMany({
        where: { barcodeId: 'eb-udbffnmccv8' }
    });
    console.log(JSON.stringify(logs, null, 2));
}
main().finally(() => prisma.$disconnect());
