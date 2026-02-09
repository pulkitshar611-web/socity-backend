const prisma = require("../lib/prisma");

class ServiceInquiryController {
  static async listInquiries(req, res) {
    try {
      let { page = 1, limit = 10, search, status, societyId } = req.query;
      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      const where = {};
      const role = (req.user.role || "").toUpperCase();

      // Vendor: only inquiries assigned to this vendor (match Vendor by user email)
      if (role === "VENDOR") {
        const vendor = await prisma.vendor.findFirst({
          where: { email: req.user.email },
        });
        if (!vendor) {
          return res.json({
            data: [],
            meta: {
              total: 0,
              page: 1,
              limit: parseInt(limit) || 10,
              totalPages: 0,
            },
          });
        }
        where.vendorId = vendor.id;
      }
      // Role based filtering (non-vendor)
      else if (role === "INDIVIDUAL") {
        // Individual users: only see their own inquiries (by residentId, no societyId)
        where.residentId = req.user.id;
        where.societyId = null; // Individual users have no society
      } else if (
        req.user.role !== "SUPER_ADMIN" &&
        req.user.role !== "super_admin"
      ) {
        where.societyId = req.user.societyId;
      } else if (societyId && societyId !== "all") {
        where.societyId = parseInt(societyId);
      }

      // Filter by status
      if (status && status !== "all") {
        where.status = status;
      }

      // Search
      if (search) {
        where.OR = [
          { residentName: { contains: search } },
          { serviceName: { contains: search } },
          { unit: { contains: search } },
        ];
      }

      const [total, inquiries] = await Promise.all([
        prisma.serviceInquiry.count({ where }),
        prisma.serviceInquiry.findMany({
          where,
          skip,
          take: limit,
          include: {
            society: {
              select: { name: true, pincode: true },
            },
            resident: {
              select: { name: true, phone: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const withResidentName = inquiries.map((i) => {
        const sanitized = { ...i };
        // Hide vendorPrice from non-Vendor/non-Admin users
        if (role !== "VENDOR" && role !== "SUPER_ADMIN" && role !== "ADMIN") {
             delete sanitized.vendorPrice;
        }
        return {
           ...sanitized,
           residentName: i.resident?.name ?? i.residentName ?? "—",
           residentPhone: i.resident?.phone ?? "—",
           residentEmail: i.resident?.email ?? "—",
           residentRole: i.resident?.role ?? "—",
        };
      });

      res.json({
        data: withResidentName,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("List Inquiries Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async createInquiry(req, res) {
    try {
      const {
        residentName,
        unit,
        phone,
        serviceName,
        serviceId,
        type,
        preferredDate,
        preferredTime,

        notes,
        variants, // Array of { name, price }
        total,    // Estimated total amount
      } = req.body;

      const role = (req.user.role || "").toUpperCase();
      
      // Format variants into notes string if present
      let finalNotes = notes || "";
      if (Array.isArray(variants) && variants.length > 0) {
        const variantText = variants.map(v => `- ${v.name} (₹${v.price})`).join("\n");
        finalNotes = (finalNotes ? finalNotes + "\n\n" : "") + 
          "--- Selected Variants ---\n" + variantText + 
          `\nTotal Estimated: ₹${total}`;
      }

      const inquiry = await prisma.serviceInquiry.create({
        data: {
          residentName,
          unit: unit || "N/A",
          phone,
          serviceName,
          serviceId,
          type: type || "service",
          preferredDate,
          preferredTime,
          notes: finalNotes,
          payableAmount: total ? parseFloat(total) : null, // Set initial estimate
          societyId: role === "INDIVIDUAL" ? null : req.user.societyId,
          residentId: req.user.id,
        },
      });

      res.status(201).json(inquiry);
    } catch (error) {
      console.error("Create Inquiry Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async assignVendor(req, res) {
    try {
      const { id } = req.params;
      const { vendorId, vendorName } = req.body;
      console.log("Assign Vendor Request:", {
        id,
        vendorId,
        vendorName,
        userRole: req.user.role,
      });

      const inquiry = await prisma.serviceInquiry.update({
        where: { id: parseInt(id) },
        data: {
          vendorId: parseInt(vendorId),
          vendorName,
          status: "booked",
        },
        include: {
          resident: { select: { name: true } },
        },
      });

      // Notify the vendor's User every time (so they see it in header notifications)
      const vendor = await prisma.vendor.findUnique({
        where: { id: parseInt(vendorId) },
      });
      const vendorEmail = (vendor?.email || "").trim();
      if (vendorEmail) {
        const vendorUser = await prisma.user.findFirst({
          where: { email: vendorEmail },
        });
        if (vendorUser) {
          const residentLabel = inquiry.resident?.name || "Customer";
          try {
            await prisma.notification.create({
              data: {
                userId: vendorUser.id,
                title: "New lead assigned",
                description: `You have been assigned: ${inquiry.serviceName || "Service"} for ${residentLabel}`,
                type: "lead_assigned",
                read: false,
              },
            });
          } catch (notifErr) {
            console.error("AssignVendor: notification create failed", notifErr);
            // Don't fail the whole assign – inquiry is already updated
          }
        }
      }

      res.json(inquiry);
    } catch (error) {
      console.error("Assign Vendor Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get payment details for a confirmed lead. Only owner (resident/individual) or Admin/Super Admin.
   * Payment options visible ONLY when lead status = CONFIRMED.
   */
  static async getPaymentDetails(req, res) {
    try {
      const inquiryId = parseInt(req.params.id);
      const role = (req.user.role || "").toUpperCase();
      const inquiry = await prisma.serviceInquiry.findUnique({
        where: { id: inquiryId },
        include: {
          resident: { select: { name: true, email: true } },
          vendor: { select: { name: true } },
        },
      });
      if (!inquiry) {
        return res.status(404).json({ error: "Lead not found" });
      }
      const isOwner = inquiry.residentId === req.user.id;
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "You can only view payment details for your own leads" });
      }
      if ((inquiry.status || "").toUpperCase() !== "CONFIRMED") {
        return res.status(400).json({
          error: "Payment is only available for confirmed leads. Current status: " + (inquiry.status || "—"),
        });
      }
      res.json({
        id: inquiry.id,
        serviceName: inquiry.serviceName,
        vendorName: inquiry.vendorName,
        status: inquiry.status,
        paymentStatus: inquiry.paymentStatus || "PENDING",
        payableAmount: inquiry.payableAmount ?? null,
        paymentMethod: inquiry.paymentMethod ?? null,
        transactionId: inquiry.transactionId ?? null,
        paymentDate: inquiry.paymentDate ?? null,
        residentName: inquiry.resident?.name ?? null,
      });
    } catch (error) {
      console.error("Get Payment Details Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Initiate payment for a confirmed lead. Only owner (customer). Prevents duplicate payment.
   */
  static async initiatePayment(req, res) {
    try {
      const inquiryId = parseInt(req.params.id);
      const { paymentMethod, amount } = req.body;
      const inquiry = await prisma.serviceInquiry.findUnique({
        where: { id: inquiryId },
      });
      if (!inquiry) {
        return res.status(404).json({ error: "Lead not found" });
      }
      if (inquiry.residentId !== req.user.id) {
        return res.status(403).json({ error: "You can only pay for your own leads" });
      }
      if (!["CONFIRMED", "PENDING"].includes((inquiry.status || "").toUpperCase())) {
        return res.status(400).json({
          error: "Payment is only available when lead status is PENDING or CONFIRMED",
        });
      }
      if ((inquiry.paymentStatus || "").toUpperCase() === "PAID") {
        return res.status(400).json({ error: "This lead has already been paid. Duplicate payment is not allowed." });
      }
      const validMethods = ["UPI", "CARD", "NET_BANKING", "WALLET", "CASH"];
      const method = (paymentMethod || "").toUpperCase().replace(/\s+/g, "_");
      if (!validMethods.includes(method)) {
        return res.status(400).json({
          error: "Invalid payment method. Allowed: " + validMethods.join(", "),
        });
      }
      const payableAmount = amount != null ? parseFloat(amount) : inquiry.payableAmount;
      if (payableAmount == null || isNaN(payableAmount) || payableAmount <= 0) {
        return res.status(400).json({
          error: "Payable amount is required and must be greater than 0. Set amount on the lead or pass it in the request.",
        });
      }
      const updateData = {
        paymentMethod: method,
        payableAmount,
        paymentStatus: "PAID", // Force PAID for ALL modes as requested
        paymentDate: new Date(),
        transactionId: method === "CASH" ? `CASH-${Date.now()}` : "TXN-" + Date.now() + "-" + inquiryId,
        status: "CONFIRMED", // Auto-confirm on payment
      };

      // 1. Generate Invoice Number
      const invoiceNo = `INV-SERV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      // 2. Create Transaction Record (Accounting)
      // Only if societyId exists (it might be null for individual, but schema says Transaction needs societyId?)
      // If Individual user, societyId on inquiry is NULL.
      // We need to check if we can create a transaction without societyId or if we skip it for Individuals.
      // Schema: Transaction needs societyId.
      if (inquiry.societyId) {
          await prisma.transaction.create({
              data: {
                  type: "INCOME",
                  category: "SERVICE_BOOKING",
                  amount: payableAmount,
                  date: new Date(),
                  description: `Service Payment: ${inquiry.serviceName} - ${inquiry.residentName || 'Resident'}`,
                  paymentMethod: method === "UPI" ? "UPI" : method === "CASH" ? "CASH" : "ONLINE", // Mapping to enum
                  status: "PAID",
                  societyId: inquiry.societyId,
                  invoiceNo: invoiceNo,
                  receivedFrom: inquiry.residentName || "Resident",
              }
          });
      }

      // 3. Notify Vendor
      if (inquiry.vendorId) {
        await prisma.notification.create({
          data: {
            userId: inquiry.vendorId,
            title: "Payment Received",
            description: `Payment of ₹${updateData.payableAmount} received via ${method} for ${inquiry.serviceName}.`,
            type: "PAYMENT",
            read: false,
          },
        });
      }

      // 4. Notify SUPER ADMIN(s)
      const superAdmins = await prisma.user.findMany({
          where: { role: "SUPER_ADMIN" },
          select: { id: true }
      });
      
      if (superAdmins.length > 0) {
          await prisma.notification.createMany({
              data: superAdmins.map(admin => ({
                  userId: admin.id,
                  title: "New Service Payment",
                  description: `Received ₹${payableAmount} from ${inquiry.residentName} for ${inquiry.serviceName}. Invoice: ${invoiceNo}`,
                  type: "PAYMENT_RECEIVED",
                  metadata: {
                      inquiryId: inquiry.id,
                      amount: payableAmount,
                      invoiceNo
                  }
              }))
          });
      }

      const updated = await prisma.serviceInquiry.update({
        where: { id: inquiryId },
        data: updateData,
      });
      res.json({
        success: true,
        inquiryId: updated.id,
        paymentStatus: updated.paymentStatus,
        transactionId: updated.transactionId ?? null,
        invoiceNo: invoiceNo,
        message:
          method === "CASH"
            ? "Payment recorded as Cash. Admin will confirm receipt."
            : "Payment initiated successfully. Transaction ID: " + (updated.transactionId || ""),
      });
    } catch (error) {
      console.error("Initiate Payment Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update payment status (Admin/Super Admin: mark as PAID for cash/offline, or webhook callback).
   */
  static async updatePaymentStatus(req, res) {
    try {
      const inquiryId = parseInt(req.params.id);
      const { paymentStatus, transactionId } = req.body;
      const role = (req.user.role || "").toUpperCase();
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Only Admin or Super Admin can update payment status" });
      }
      const inquiry = await prisma.serviceInquiry.findUnique({
        where: { id: inquiryId },
      });
      if (!inquiry) {
        return res.status(404).json({ error: "Lead not found" });
      }
      const status = (paymentStatus || "").toUpperCase();
      if (!["PENDING", "PAID", "FAILED"].includes(status)) {
        return res.status(400).json({ error: "Invalid paymentStatus. Allowed: PENDING, PAID, FAILED" });
      }
      const updated = await prisma.serviceInquiry.update({
        where: { id: inquiryId },
        data: {
          paymentStatus: status,
          ...(transactionId != null && transactionId !== "" && { transactionId: String(transactionId) }),
          ...(status === "PAID" && { paymentDate: new Date() }),
        },
      });
      res.json(updated);
    } catch (error) {
      console.error("Update Payment Status Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Vendor marks lead as contacted (CONTACT button). One-time only.
   * Sets status = CONTACTED, contactedAt, contactedBy, and appends to activityLog.
   */
  static async markAsContacted(req, res) {
    try {
      const { id } = req.params;
      const role = (req.user.role || "").toUpperCase();
      if (role !== "VENDOR") {
        return res
          .status(403)
          .json({ error: "Only vendors can mark a lead as contacted" });
      }
      const vendor = await prisma.vendor.findFirst({
        where: { email: req.user.email },
      });
      if (!vendor) {
        return res.status(403).json({ error: "Vendor profile not found" });
      }
      const existing = await prisma.serviceInquiry.findUnique({
        where: { id: parseInt(id) },
      });
      if (!existing) {
        return res.status(404).json({ error: "Inquiry not found" });
      }
      if (existing.vendorId !== vendor.id) {
        return res
          .status(403)
          .json({ error: "You can only mark inquiries assigned to you as contacted" });
      }
      const statusUpper = (existing.status || "").toUpperCase();
      const alreadyContacted =
        existing.contactedAt != null ||
        ["CONTACTED", "CONFIRMED", "COMPLETED", "DONE"].includes(statusUpper);
      if (alreadyContacted) {
        return res.status(400).json({
          error: "Lead is already contacted or completed. Cannot contact again.",
        });
      }
      const now = new Date();
      const activityEntry = {
        action: "Vendor contacted customer",
        time: now.toISOString(),
        byVendorId: vendor.id,
      };
      const existingLog = Array.isArray(existing.activityLog)
        ? existing.activityLog
        : [];
      const newLog = [...existingLog, activityEntry];
      const inquiry = await prisma.serviceInquiry.update({
        where: { id: parseInt(id) },
        data: {
          status: "CONTACTED",
          contactedAt: now,
          contactedBy: vendor.id,
          activityLog: newLog,
        },
      });
      res.json(inquiry);
    } catch (error) {
      console.error("Mark As Contacted Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /** Vendor updates status of an inquiry assigned to them (confirmed, done, completed, etc.) */
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const role = (req.user.role || "").toUpperCase();
      if (role !== "VENDOR") {
        return res
          .status(403)
          .json({ error: "Only vendors can update inquiry status" });
      }
      const vendor = await prisma.vendor.findFirst({
        where: { email: req.user.email },
        include: { payouts: false } // Avoid fetching unrelated data
      });
      if (!vendor) {
        return res.status(403).json({ error: "Vendor profile not found" });
      }
      const existing = await prisma.serviceInquiry.findUnique({
        where: { id: parseInt(id) },
      });
      if (!existing) {
        return res.status(404).json({ error: "Inquiry not found" });
      }
      if (existing.vendorId !== vendor.id) {
        return res
          .status(403)
          .json({ error: "You can only update inquiries assigned to you" });
      }
      const newStatus = String(status || existing.status);
      
      // Update the inquiry
      // Only update payableAmount if the vendor sets it AND it's not already paid/locked? 
      // ACTUALLY: The requirement is for Vendor to set THEIR price (vendorPrice).
      // So if req.body.payableAmount is sent, we treat it as vendorPrice.
      
      const updateData = { status: newStatus };
      
      // If vendor sends an amount during confirmation, save it as vendorPrice
      if (req.body.payableAmount != null) {
          updateData.vendorPrice = parseFloat(req.body.payableAmount);
      }

      const inquiry = await prisma.serviceInquiry.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: { society: true }
      });

      // --- AUTO-PAYOUT GENERATION ---
      const normalizedStatus = newStatus.toUpperCase();
      const previousStatus = (existing.status || "").toUpperCase();

      // --- AUTO-PAYOUT GENERATION ---
      // Trigger if status becomes COMPLETED or DONE, and it wasn't already
      const isCompleted = normalizedStatus === "COMPLETED" || normalizedStatus === "DONE";
      const wasCompleted = previousStatus === "COMPLETED" || previousStatus === "DONE";

      if (isCompleted && !wasCompleted) {
          // Use vendorPrice if available (Agreed Vendor Amount), else fallback to payableAmount (User Price)
          // Default logic: Vendor gets PAID what they quoted (vendorPrice). 
          // If no vendorPrice, they get user price - commission.
          
          let payoutBasis = inquiry.vendorPrice;
          let commissionPercent = 0; 
          
          let payableToVendor = 0;
          let dealValueForRecord = 0;

          const userPaidTotal = inquiry.payableAmount || 0;

          if (payoutBasis && payoutBasis > 0) {
              // Case 1: Arbitrage (Vendor Price is Explicit)
              // User Paid: 1000, Vendor Quote: 800. Commission = 200 (20%).
              payableToVendor = payoutBasis;
              dealValueForRecord = userPaidTotal > 0 ? userPaidTotal : payoutBasis;

              if (dealValueForRecord > payableToVendor) {
                  const commissionAmount = dealValueForRecord - payableToVendor;
                  commissionPercent = (commissionAmount / dealValueForRecord) * 100;
                  // Round to 1 decimal place
                  commissionPercent = Math.round(commissionPercent * 10) / 10;
              } else {
                  commissionPercent = 0; // No margin or loss
              }

          } else {
              // Fallback to old commission model (Standard 10%)
              if (userPaidTotal > 0) {
                  commissionPercent = 10;
                  const commissionAmount = (userPaidTotal * commissionPercent) / 100;
                  payableToVendor = userPaidTotal - commissionAmount;
                  dealValueForRecord = userPaidTotal;
              }
          }

          if (payableToVendor > 0) {
              await prisma.vendorPayout.create({
                  data: {
                      vendorId: vendor.id,
                      vendorName: vendor.name,
                      societyId: inquiry.societyId,
                      societyName: inquiry.society?.name || "Individual/Direct",
                      dealValue: dealValueForRecord,
                      commissionPercent: commissionPercent,
                      payableAmount: payableToVendor,
                      status: 'PENDING',
                      remarks: `Auto-generated for Service ID #${inquiry.id}: ${inquiry.serviceName} ` + (inquiry.vendorPrice ? '(Agreed Quote)' : '(Commission Based)'),
                      date: new Date()
                  }
              });

              // Notify Super Admin
               const superAdmins = await prisma.user.findMany({
                  where: { role: "SUPER_ADMIN" },
                  select: { id: true }
              });
              
              if (superAdmins.length > 0) {
                  await prisma.notification.createMany({
                      data: superAdmins.map(admin => ({
                          userId: admin.id,
                          title: "Vendor Payout Generated",
                          description: `Job Completed by ${vendor.name}. Pending Payout: ₹${payableToVendor}`,
                          type: "PAYOUT_GENERATED",
                          metadata: {
                              vendorId: vendor.id,
                              amount: payableToVendor,
                              inquiryId: inquiry.id
                          }
                      }))
                  });
              }
          }
      }

      res.json(inquiry);
    } catch (error) {
      console.error("Update Inquiry Status Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = ServiceInquiryController;
