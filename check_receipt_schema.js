const prisma = require('./src/lib/prisma');

async function main() {
  try {
    console.log('Checking GoodsReceipt table...');
    // Try to count to see if table exists
    const count = await prisma.goodsReceipt.count(); 
    console.log(`GoodsReceipt table exists! Count: ${count}`);
  } catch (error) {
    console.error('Check Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
