const prisma = require('./src/lib/prisma');

async function main() {
  try {
    console.log('Checking PurchaseOrder table...');
    const count = await prisma.purchaseOrder.count();
    console.log(`PurchaseOrder table exists! Count: ${count}`);
    
    console.log('Checking Vendor table relations...');
    const vendor = await prisma.vendor.findFirst({
        include: { purchaseOrders: true }
    });
    console.log('Vendor query successful');
    
  } catch (error) {
    console.error('Schema Check Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
