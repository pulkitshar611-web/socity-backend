const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectInvoices() {
    try {
        const invoices = await prisma.invoice.findMany({
            take: 10,
            select: { id: true, invoiceNo: true, status: true }
        });

        console.log('--- Invoices ---');
        if (invoices.length === 0) {
            console.log('No invoices found.');
        } else {
            invoices.forEach(inv => {
                console.log(`ID: ${inv.id} | InvoiceNo: ${inv.invoiceNo} | Status: ${inv.status}`);
            });
        }
        console.log('----------------');
    } catch (error) {
        console.error('Error inspecting invoices:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectInvoices();
