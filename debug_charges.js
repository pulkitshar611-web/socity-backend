const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const charges = await prisma.chargeMaster.findMany();
    fs.writeFileSync('output_charges.json', JSON.stringify(charges, null, 2));
    process.exit(0);
}

main().catch(err => {
    fs.writeFileSync('output_error_charges.txt', err.stack);
    process.exit(1);
});
