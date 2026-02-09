const prisma = require('./src/lib/prisma');

async function debugInvoices() {
  try {
    // Mimicking the controller query for societyId: 1
    const invoices = await prisma.vendorInvoice.findMany({
      where: { societyId: 1 },
      include: {
        vendor: true,
        society: { select: { name: true } }
      },
      orderBy: { invoiceDate: 'desc' }
    });

    console.log('--- RAW API RESPONSE DATA ---');
    console.log(JSON.stringify(invoices, null, 2));
    console.log('-----------------------------');
    console.log(`Total Invoices: ${invoices.length}`);

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

debugInvoices();
