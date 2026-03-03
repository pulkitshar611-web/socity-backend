const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function run() {
    const visitors = await p.visitor.findMany({
        where: { name: 'John Doe' }
    });

    fs.writeFileSync('john_doe_visitor_records.json', JSON.stringify(visitors, null, 2));
}

run().finally(() => process.exit(0));
