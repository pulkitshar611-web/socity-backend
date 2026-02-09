const prisma = require('../lib/prisma');

class VendorPayoutController {
  static async listPayouts(req, res) {
    try {
      const payouts = await prisma.vendorPayout.findMany({
        orderBy: { date: 'desc' },
        include: { vendor: { select: { name: true, serviceType: true } } }
      });
      res.json(payouts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createPayout(req, res) {
    try {
      const {
        vendorId,
        vendorName,
        societyId,
        societyName,
        dealValue,
        commissionPercent,
        payableAmount,
        status,
        remarks,
        date
      } = req.body;

      if (!vendorId || !dealValue) {
        return res.status(400).json({ error: 'Vendor and Deal Value are required' });
      }

      const payout = await prisma.vendorPayout.create({
        data: {
          vendorId: parseInt(vendorId),
          vendorName,
          societyId: societyId ? parseInt(societyId) : null,
          societyName,
          dealValue: parseFloat(dealValue),
          commissionPercent: parseFloat(commissionPercent),
          payableAmount: parseFloat(payableAmount),
          status: status?.toUpperCase() || 'PENDING',
          remarks,
          date: date ? new Date(date) : new Date()
        }
      });
      res.status(201).json(payout);
    } catch (error) {
      console.error('Create Payout Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getPayoutStats(req, res) {
    try {
      const payouts = await prisma.vendorPayout.findMany();
      
      const totalSocietyRevenue = payouts.reduce((sum, p) => sum + (Number(p.dealValue) || 0), 0);
      const commissionPayable = payouts.reduce((sum, p) => sum + (Number(p.payableAmount) || 0), 0);
      const pendingPayouts = payouts
        .filter(p => p.status === 'PENDING')
        .reduce((sum, p) => sum + (Number(p.payableAmount) || 0), 0);

      res.json({
        totalSocietyRevenue,
        commissionPayable,
        pendingPayouts
      });
    } catch (error) {
      console.error('Get Payout Stats Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      console.log('Updating Payout:', id, status);
      const payout = await prisma.vendorPayout.update({
        where: { id: parseInt(id) },
        data: { 
            status: status.toUpperCase(),
            ...(status.toUpperCase() === 'PAID' && { date: new Date() }) // Update date on payment? Or keep separate paymentDate? Schema has one date.
        }
      });

      // SYNC TO SERVICE INQUIRY
      // Extract Inquiry ID from remarks: "Auto-generated for Service ID #38: ..."
      if (status.toUpperCase() === 'PAID' && payout.remarks) {
          const match = payout.remarks.match(/Service ID #(\d+)/);
          if (match && match[1]) {
              const inquiryId = parseInt(match[1]);
              console.log('Syncing Payout status to Inquiry #', inquiryId);
              try {
                  // We update paymentStatus to 'PAID' so VendorLeadsPage shows the PAID badge.
                  // Note: VendorLeadsPage checks `paymentStatus === 'PAID'`.
                  await prisma.serviceInquiry.update({
                      where: { id: inquiryId },
                      data: { 
                        paymentStatus: 'PAID',
                        paymentDate: new Date() 
                      }
                  });

                  // NOTIFY VENDOR
                  await prisma.notification.create({
                      data: {
                          userId: payout.vendorId, // Vendor is a User in the system? Need to check linking. 
                          // Wait, Vendor model is separate from User model usually?
                          // In ServiceInquiry list, we check `vendor.email = req.user.email`.
                          // So we need to find the USER record associated with this Vendor to safely notify.
                          // OR, if `notification` table links to `userId` which assumes Auth User.
                          
                          // Let's assume Vendor has a User account with same email.
                          // Actually, let's look at `prisma.notification.create` calls elsewhere.
                          // It uses `userId`.
                          
                          // We need to resolve Vendor -> User ID.
                          // For now, let's try to find the user by Vendor Email.
                      }
                  });
              } catch (err) {
                  console.error('Failed to sync payout status to inquiry:', err);
              }
              
              // Resolve User ID for Vendor
              const vendorUser = await prisma.user.findFirst({
                  where: { email: (await prisma.vendor.findUnique({ where: { id: payout.vendorId } }))?.email }
              });

              if (vendorUser) {
                  await prisma.notification.create({
                      data: {
                          userId: vendorUser.id,
                          title: "Payment Received",
                          description: `You have received a payment of ₹${payout.payableAmount} for Service ID #${inquiryId}.`,
                          type: "PAYMENT_RECEIVED",
                          metadata: {
                              payoutId: payout.id,
                              amount: payout.payableAmount,
                              inquiryId: inquiryId
                          }
                      }
                  });
              }

              // AUTO-GENERATE VENDOR INVOICE (Proof of Payment / Bill)
              // Only if Society ID exists (Schema ignores Individuals for VendorInvoice usually)
              if (payout.societyId) {
                  const invoiceNumber = `INV-${payout.vendorId}-${Date.now().toString().slice(-6)}`;
                  console.log('Generating Vendor Invoice:', invoiceNumber);
                  
                  await prisma.vendorInvoice.create({
                      data: {
                          invoiceNumber: invoiceNumber,
                          vendorId: payout.vendorId,
                          societyId: payout.societyId,
                          description: `Service Payout for Inquiry #${inquiryId} (${payout.societyName})`,
                          category: 'SERVICE_PAYOUT',
                          amount: payout.payableAmount,
                          totalAmount: payout.payableAmount,
                          gstAmount: 0, // Assuming inclusive or 0 for now
                          invoiceDate: new Date(),
                          dueDate: new Date(), // Immediate
                          status: 'PAID',
                          paymentDate: new Date(),
                          paymentMethod: 'PLATFORM_TRANSFER', // General placeholder
                          remarks: `Auto-generated from Vendor Payout #${payout.id}`
                      }
                  });
              }
          }
      }

      res.json(payout);
    } catch (error) {
      console.error('Update Payout Status Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = VendorPayoutController;
