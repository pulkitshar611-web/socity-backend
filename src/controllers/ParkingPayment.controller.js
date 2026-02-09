const prisma = require('../lib/prisma');

const ParkingPaymentController = {
  // List all payments with filters
  list: async (req, res) => {
    try {
      const { societyId } = req.user;
      const { 
        status, 
        month, 
        year, 
        search 
      } = req.query;

      const where = {
        societyId: parseInt(societyId),
        ...(status && status !== 'all' ? { status } : {}),
        ...(month && year ? {
          month: {
            gte: new Date(`${year}-${month}-01`),
            lt: new Date(`${year}-${parseInt(month) + 1}-01`)
          }
        } : {}),
        ...(search ? {
          OR: [
            { resident: { name: { contains: search } } },
            { slot: { number: { contains: search } } },
            { vehicleNumber: { contains: search } }
          ]
        } : {})
      };

      const payments = await prisma.parkingPayment.findMany({
        where,
        include: {
          slot: true,
          resident: {
            select: { name: true, phone: true }
          }
        },
        orderBy: { dueDate: 'desc' }
      });

      // Calculate stats
      const stats = {
        total: payments.reduce((sum, p) => sum + p.amount, 0),
        collected: payments.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0),
        pending: payments.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amount, 0),
        overdue: payments.filter(p => p.status === 'OVERDUE').reduce((sum, p) => sum + p.amount, 0)
      };

      res.json({
        success: true,
        data: payments,
        stats
      });
    } catch (error) {
      console.error('Error listing payments:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch payments' });
    }
  },

  // Record a payment manually
  recordPayment: async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, paymentDate, transactionId } = req.body;

      const payment = await prisma.parkingPayment.update({
        where: { id: parseInt(id) },
        data: {
          status: 'PAID',
          amount: parseFloat(amount),
          paymentMethod,
          paymentDate: new Date(paymentDate),
          transactionId
        }
      });

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        data: payment
      });
    } catch (error) {
      console.error('Error recording payment:', error);
      res.status(500).json({ success: false, message: 'Failed to record payment' });
    }
  },

  // Create a single payment record
  create: async (req, res) => {
    try {
      const { societyId } = req.user;
      const { slotNumber, amount, month, year, paymentMethod, paymentDate, transactionId } = req.body;

      // Find slot
      const slot = await prisma.parkingSlot.findFirst({
        where: { number: slotNumber, societyId: parseInt(societyId) },
        include: { unit: true }
      });

      if (!slot) {
        return res.status(404).json({ success: false, message: 'Slot not found' });
      }

      // Determine resident
      const residentId = slot.unit?.tenantId || slot.unit?.ownerId;
      
      const startDate = new Date(year, month === 'january' ? 0 : month === 'february' ? 1 : 11, 1); // Simple mapping for now
      const dueDate = new Date(startDate);
      dueDate.setDate(5);

      const sequence = await prisma.parkingPayment.count({ where: { societyId: parseInt(societyId) } });
      const paymentId = `PP-${year}-${(sequence + 1).toString().padStart(4, '0')}`;

      const payment = await prisma.parkingPayment.create({
        data: {
          paymentId,
          slotId: slot.id,
          residentId,
          amount: parseFloat(amount),
          month: startDate,
          dueDate,
          societyId: parseInt(societyId),
          status: 'PAID',
          paymentMethod,
          paymentDate: new Date(paymentDate),
          transactionId
        }
      });

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        data: payment
      });
    } catch (error) {
      console.error('Error creating payment:', error);
      res.status(500).json({ success: false, message: 'Failed to create payment' });
    }
  },

  generateMonthly: async (req, res) => {
    try {
      const { societyId } = req.user;
      const { month, year } = req.body;
      const startDate = new Date(year, month - 1, 1); // Month is 1-indexed from client
      const dueDate = new Date(year, month - 1, 5); // Due on 5th

      // Get all occupied slots
      const occupiedSlots = await prisma.parkingSlot.findMany({
        where: { 
          societyId: parseInt(societyId),
          status: 'occupied',
          allocatedToUnitId: { not: null }
        },
        include: { unit: { include: { owner: true, tenant: true } } }
      });

      let count = 0;
      for (const slot of occupiedSlots) {
        // Determine resident (Tenant prefers over Owner if assigned)
        const residentId = slot.unit.tenantId || slot.unit.ownerId;
        if (!residentId) continue;

        // Check if payment already exists
        const existing = await prisma.parkingPayment.findFirst({
          where: {
            slotId: slot.id,
            month: startDate,
            societyId: parseInt(societyId)
          }
        });

        if (!existing) {
          const sequence = await prisma.parkingPayment.count({ where: { societyId: parseInt(societyId) } });
          const paymentId = `PP-${year}-${(sequence + 1).toString().padStart(4, '0')}`;
          
          await prisma.parkingPayment.create({
            data: {
              paymentId,
              slotId: slot.id,
              residentId,
              amount: slot.monthlyCharge,
              month: startDate,
              dueDate,
              societyId: parseInt(societyId),
              status: 'PENDING'
            }
          });
          count++;
        }
      }

      res.json({
        success: true,
        message: `Generated ${count} payment records for ${month}/${year}`
      });
    } catch (error) {
      console.error('Error generating payments:', error);
      res.status(500).json({ success: false, message: 'Failed to generate payments' });
    }
  }
};

module.exports = ParkingPaymentController;
