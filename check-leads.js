const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const vendors = await prisma.vendor.findMany();
  const inquiries = await prisma.serviceInquiry.findMany();
  
  console.log('--- VENDORS ---');
  console.log(JSON.stringify(vendors, null, 2));
  
  console.log('\n--- INQUIRIES ---');
  console.log(JSON.stringify(inquiries, null, 2));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
