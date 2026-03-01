const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const units = await prisma.unit.findMany({
        where: { number: { in: ['K8', '132', '143', '101', '102'] } },
        select: { number: true, areaSqFt: true, type: true }
    });
    fs.writeFileSync('output_units.json', JSON.stringify(units, null, 2));
    process.exit(0);
}

main().catch(err => {
    fs.writeFileSync('output_error.txt', err.stack);
    process.exit(1);
});
