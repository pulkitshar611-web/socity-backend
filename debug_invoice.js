const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: { id: 12 },
        include: { items: true, unit: true }
    });
    fs.writeFileSync('output_invoice_12.json', JSON.stringify(invoices, null, 2));
    process.exit(0);
}

main().catch(err => {
    fs.writeFileSync('output_error_inv.txt', err.stack);
    process.exit(1);
});
