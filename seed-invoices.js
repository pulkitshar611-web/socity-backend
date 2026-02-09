const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const societyId = 1; // Assuming society ID 1 exists

  // Find a few units
  const units = await prisma.unit.findMany({
    where: { societyId },
    take: 5
  });

  if (units.length === 0) {
    console.log('No units found to create invoices for.');
    return;
  }

  const residents = await prisma.user.findMany({
    where: { societyId, role: 'RESIDENT' },
    take: 5
  });

  console.log(`Creating test invoices for ${units.length} units...`);

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const resident = residents[i] || residents[0];
    const status = i % 3 === 0 ? 'PAID' : (i % 3 === 1 ? 'PENDING' : 'OVERDUE');

    await prisma.invoice.upsert({
      where: { invoiceNo: `INV-TEST-00${i + 1}` },
      update: {},
      create: {
        invoiceNo: `INV-TEST-00${i + 1}`,
        societyId,
        unitId: unit.id,
        residentId: resident?.id,
        amount: 15000 + (i * 1000),
        maintenance: 12000,
        utilities: 3000 + (i * 1000),
        dueDate: new Date(Date.now() + (status === 'OVERDUE' ? -86400000 * 5 : 86400000 * 10)),
        status,
        paidDate: status === 'PAID' ? new Date() : null,
        paymentMode: status === 'PAID' ? 'UPI' : null
      }
    });
  }

  console.log('Test invoices created successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
