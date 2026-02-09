const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillInvoices() {
  console.log('Starting full dashboard backfill...');
  
  // 1. Get all plans
  const plans = await prisma.billingPlan.findMany();
  const planMap = {
    'BASIC': plans.find(p => p.name === 'Basic')?.id,
    'PROFESSIONAL': plans.find(p => p.name === 'Professional')?.id,
    'ENTERPRISE': plans.find(p => p.name === 'Enterprise')?.id,
    'Basic': plans.find(p => p.name === 'Basic')?.id,
    'Professional': plans.find(p => p.name === 'Professional')?.id,
    'Enterprise': plans.find(p => p.name === 'Enterprise')?.id,
  };

  const societies = await prisma.society.findMany({
    include: {
      billingPlan: true
    }
  });

  console.log(`Processing ${societies.length} societies...`);

  for (const society of societies) {
    // Force ACTIVE and PAID for all for demo purposes
    await prisma.society.update({
      where: { id: society.id },
      data: { 
        status: 'ACTIVE',
        isPaid: true
      }
    });

    let planId = society.billingPlanId;
    
    // Fix missing plan ID
    if (!planId && society.subscriptionPlan) {
      planId = planMap[society.subscriptionPlan];
    }
    
    // If still no planId, assign BASIC
    if (!planId) planId = planMap['Basic'];

    if (planId) {
      await prisma.society.update({
        where: { id: society.id },
        data: { billingPlanId: planId }
      });
    }

    // Refresh society with plan data
    const updatedSociety = await prisma.society.findUnique({
      where: { id: society.id },
      include: { billingPlan: true }
    });

    const originalPrice = updatedSociety.billingPlan?.price || 5000;
    const discount = updatedSociety.discount || 0;
    const finalPrice = Math.round(originalPrice * (1 - discount / 100));

    // Upsert Invoice
    const existingInvoice = await prisma.platformInvoice.findFirst({
      where: { societyId: updatedSociety.id }
    });

    if (existingInvoice) {
      await prisma.platformInvoice.update({
        where: { id: existingInvoice.id },
        data: { 
          amount: finalPrice,
          status: 'PAID',
          paidDate: existingInvoice.paidDate || new Date()
        }
      });
      console.log(`Updated invoice for: ${updatedSociety.name} (Amount: ${finalPrice})`);
    } else {
      await prisma.platformInvoice.create({
        data: {
          societyId: updatedSociety.id,
          invoiceNo: `INV-${updatedSociety.id}-${Date.now().toString().slice(-6)}`,
          amount: finalPrice,
          status: 'PAID',
          dueDate: new Date(),
          paidDate: new Date(),
          issueDate: updatedSociety.createdAt || new Date()
        }
      });
      console.log(`Created invoice for: ${updatedSociety.name} (Amount: ${finalPrice})`);
    }
  }

  console.log('Full backfill complete.');
}

backfillInvoices()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
