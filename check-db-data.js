const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  console.log('--- DATA CHECK ---');

  // Seed a test inquiry if none exists today
  const existingInq = await prisma.serviceInquiry.findFirst({
    where: { residentName: 'Test Resident' }
  });
  if (!existingInq) {
    const soc = await prisma.society.findFirst();
    const user = await prisma.user.findFirst({ where: { role: 'RESIDENT' } });
    if (soc && user) {
      await prisma.serviceInquiry.create({
        data: {
          residentName: 'Test Resident',
          unit: 'T-101',
          serviceName: 'Test AC Repair',
          serviceId: 'repair',
          type: 'booking',
          societyId: soc.id,
          residentId: user.id,
          phone: '9999999999'
        }
      });
      console.log('Seeded a TEST INQUIRY');
    }
  }

  // Seed a test complaint if none exists
  const existingComp = await prisma.complaint.findFirst({
    where: { title: 'Test Leakage Issue' }
  });
  if (!existingComp) {
    const soc = await prisma.society.findFirst();
    const user = await prisma.user.findFirst({ where: { role: 'RESIDENT' } });
    if (soc && user) {
      await prisma.complaint.create({
        data: {
          title: 'Test Leakage Issue',
          description: 'Water leak in kitchen floor',
          category: 'plumbing',
          priority: 'HIGH',
          societyId: soc.id,
          reportedById: user.id
        }
      });
      console.log('Seeded a TEST COMPLAINT');
    }
  }
  
  const inquiries = await prisma.serviceInquiry.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { society: { select: { name: true } } }
  });
  
  console.log('\nRECENT SERVICE INQUIRIES:');
  inquiries.forEach(inq => {
    console.log(`- [${inq.type.toUpperCase()}] Resident: ${inq.residentName}, Service: ${inq.serviceName}, Society: ${inq.society?.name || 'N/A'}, Status: ${inq.status}`);
  });

  const complaints = await prisma.complaint.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { society: { select: { name: true } } }
  });

  console.log('\nRECENT COMPLAINTS:');
  complaints.forEach(c => {
    console.log(`- Subject: ${c.subject || c.title}, Resident: ${c.reportedBy?.name || 'N/A'}, Society: ${c.society?.name || 'N/A'}, Status: ${c.status}`);
  });

  console.log('\n--- END CHECK ---');
}

checkData()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
