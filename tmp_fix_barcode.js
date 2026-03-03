const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const result = await prisma.emergencyBarcode.update({
        where: { id: 'eb-udbffnmccv8' },
        data: {
            userId: 36,
            residentName: 'tell',
            unit: 'A-102'
        }
    });
    console.log('Barcode updated successfully:', JSON.stringify(result, null, 2));
}
main().finally(() => prisma.$disconnect());
