const prisma = require('./src/lib/prisma');

async function testQuery() {
  try {
    console.log('Testing query with integer 1...');
    const vendorsInt = await prisma.vendor.findMany({
      where: { societyId: 1 }
    });
    console.log('Result count (Int):', vendorsInt.length);

    console.log('Testing query with string "1"...');
    try {
        const vendorsStr = await prisma.vendor.findMany({
        where: { societyId: "1" }
        });
        console.log('Result count (String):', vendorsStr.length);
    } catch (e) {
        console.log('String query failed:', e.message);
    }
    
    // Check actual values in DB
    const all = await prisma.vendor.findMany();
    console.log('First vendor societyId type:', typeof all[0].societyId, all[0].societyId);

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testQuery();
