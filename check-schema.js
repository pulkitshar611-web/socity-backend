const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const barcodes = await prisma.emergencyBarcode.findMany({ take: 1 });
    console.log('Columns:', Object.keys(barcodes[0] || {}));
    console.log('Schema check successful');
  } catch (error) {
    console.error('Schema check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
