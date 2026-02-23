const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCharges() {
  try {
    const charges = await prisma.chargeMaster.findMany();
    console.log('Current Charges in DB:', JSON.stringify(charges, null, 2));

    const invoiceItems = await prisma.invoiceItem.findMany();
    console.log('Current InvoiceItems in DB:', JSON.stringify(invoiceItems, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkCharges();
