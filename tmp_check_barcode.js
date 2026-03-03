const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const barcode = await prisma.emergencyBarcode.findUnique({ where: { id: 'eb-udbffnmccv8' } });
    console.log(JSON.stringify(barcode, null, 2));
}
main().finally(() => prisma.$disconnect());
