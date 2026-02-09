const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const inquiries = await prisma.serviceInquiry.findMany({ take: 1 });
  if (inquiries.length > 0) {
    console.log('Inquiry ID:', inquiries[0].id);
    console.log('ID Type:', typeof inquiries[0].id);
  } else {
    console.log('No inquiries found');
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
