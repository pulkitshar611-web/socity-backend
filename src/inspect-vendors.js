const prisma = require('./lib/prisma');
async function main() {
  try {
    const vendors = await prisma.vendor.findMany({ 
        select: { serviceType: true, name: true, status: true, societyId: true } 
    });
    console.log(JSON.stringify(vendors, null, 2));
  } catch(e) { console.error(e); }
}
main();
