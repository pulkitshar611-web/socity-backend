const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const barcodes = await prisma.emergencyBarcode.findMany();
    console.log(JSON.stringify(barcodes, null, 2));
}
main().finally(() => prisma.$disconnect());
