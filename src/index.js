const express = require('express');
// Server restart trigger for staff password field reload
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth.routes');
const complaintRoutes = require('./routes/complaint.routes');
const visitorRoutes = require('./routes/visitor.routes');
const transactionRoutes = require('./routes/transaction.routes');
const societyRoutes = require('./routes/society.routes');
const vendorRoutes = require('./routes/vendor.routes');
const parkingRoutes = require('./routes/parking.routes');
const reportRoutes = require('./routes/report.routes');
const serviceRoutes = require('./routes/service.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const settingRoutes = require('./routes/setting.routes');
const billingPlanRoutes = require('./routes/billing-plan.routes.js');
const platformInvoiceRoutes = require('./routes/platform-invoice.routes.js');
const vendorPayoutRoutes = require('./routes/vendor-payout.routes.js');
const roleRoutes = require('./routes/role.routes');
const sessionRoutes = require('./routes/session.routes');
// New Admin routes
const meetingRoutes = require('./routes/meeting.routes');
const assetRoutes = require('./routes/asset.routes');
const documentRoutes = require('./routes/document.routes');
const staffRoutes = require('./routes/staff.routes');
const parcelRoutes = require('./routes/parcel.routes');
const vehicleRoutes = require('./routes/vehicle.routes');
const eventRoutes = require('./routes/event.routes');
const amenityRoutes = require('./routes/amenity.routes');
const noticeRoutes = require('./routes/notice.routes');
const unitRoutes = require('./routes/unit.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const moveRequestRoutes = require('./routes/moveRequest.routes');
const facilityRequestRoutes = require('./routes/facilityRequest.routes');
const tenantRoutes = require('./routes/tenant.routes');

const http = require('http');
const { initSocket } = require('./lib/socket');
const residentRoutes = require('./routes/resident.routes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

app.use(cors({
  origin: ['https://socity.kiaantechnology.com', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for image uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Debug logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Query:', req.query);
  next();
});

const chatRoutes = require('./routes/chat.routes');
const notificationRoutes = require('./routes/notification.routes');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/society', societyRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchase-requests', require('./routes/purchaseRequest.routes'));
app.use('/api/purchase-orders', require('./routes/purchaseOrder.routes'));
app.use('/api/receipts', require('./routes/receipt.routes'));
app.use('/api/parking', parkingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/billing-plans', billingPlanRoutes);
app.use('/api/platform-invoices', platformInvoiceRoutes);
app.use('/api/vendor-payouts', vendorPayoutRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ledger', require('./routes/ledger.routes'));
app.use('/api/journal', require('./routes/journal.routes'));
app.use('/api/banks', require('./routes/bank.routes'));
app.use('/api/vendor-invoices', require('./routes/vendorInvoice.routes'));

// New Admin routes
app.use('/api/meetings', meetingRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/amenities', amenityRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/move-requests', moveRequestRoutes);
app.use('/api/facility-requests', facilityRequestRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/resident', residentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/incidents', require('./routes/incident.routes'));
app.use('/api/patrolling', require('./routes/patrolling.routes'));
app.use('/api/guard', require('./routes/guard.routes'));
app.use('/api/advertisements', require('./routes/advertisement.routes'));
app.use('/api/community', require('./routes/community.routes'));

const fs = require('fs');
const path = require('path');

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error Handler Caught:', err);
  
  try {
    const log = `[${new Date().toISOString()}] Error: ${err.message}\nStack: ${err.stack}\n\n`;
    fs.appendFileSync(path.join(__dirname, '../crash.log'), log);
  } catch (e) {
    console.error('Failed to write to crash log', e);
  }

  if (err.stack) console.error(err.stack);
  res.status(500).json({ error: err.message, stack: err.stack });
});

const PORT = process.env.PORT || 9000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (with Socket.io support)`);
});
