const prisma = require('../lib/prisma');

class VendorController {
  static async listSocietalVendors(req, res) {
    try {
      const sid = req.user.societyId;
      const role = req.user.role;
      
      let where = {};

      if (role === 'SUPER_ADMIN') {
          // Super Admin sees ONLY vendors they added (Platform Vendors, societyId = null)
          // The user said "jo vendor superadmin add kre vo superadmin ko hi dikhne chiye"
          where = { societyId: null }; 
      } else {
          // Admin sees ONLY vendors they added (Society Vendors)
          // The user said "jo vendor admin add kre vo admin ko hi dikhne chiye"
          // Originally, Admins could see Platform vendors too. Now we RESTRICT this.
          if (sid) {
              where = { societyId: sid };
          } else {
              // Fallback for weird case: Admin with no society? Should not happen.
               where = { societyId: -1 }; // Return empty
          }
      }

      const vendors = await prisma.vendor.findMany({ where });
      res.json(vendors);
    } catch (error) {
      console.error('List Vendors Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async createVendor(req, res) {
    try {
      const {
        name,
        company,
        type,
        serviceType,
        contactPerson,
        contact,
        phone,
        email, // Used for login – must be unique
        password, // Vendor logs in with email + this password
        address,
        gst,
        pan,
        contractStart,
        contractEnd,
        contractValue,
        paymentTerms,
        societyId,
        servicePincodes // Array of strings or comma-separated
      } = req.body;

      // If SUPER_ADMIN, we can either take societyId from body (for societal vendor) 
      // or set it to null (for platform vendor).
      // If ADMIN, we strictly use their own societyId.
      let socId = null;
      if (req.user.role === 'SUPER_ADMIN') {
        socId = societyId || null;
      } else {
        socId = req.user.societyId || null;
      }
      
      const bcrypt = require('bcryptjs');

      if (!email) {
        return res.status(400).json({ error: 'Official Email is required. Vendor will log in with this email.' });
      }
      const loginPassword = password && String(password).trim().length >= 6
        ? String(password).trim()
        : null;
      if (!loginPassword) {
        return res.status(400).json({ error: 'Password is required (minimum 6 characters). Vendor will use this with the Official Email to log in.' });
      }

      // Check for existing user to avoid conflicts
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
           return res.status(400).json({ error: 'User with this email already exists. Please use a different email.' });
      }

      // Normalise servicePincodes to array
      const pincodeArr = Array.isArray(servicePincodes)
        ? servicePincodes
        : (typeof servicePincodes === 'string' && servicePincodes.trim())
          ? servicePincodes.split(',').map(s => s.trim()).filter(Boolean)
          : [];

      // Platform vendors (no society) must have serviceable PIN codes so individual customers can be assigned by PIN code
      const isPlatformVendor = socId == null;
      if (isPlatformVendor && pincodeArr.length === 0) {
        return res.status(400).json({
          error: 'Serviceable PIN Codes are required for platform vendors. Individual customers are assigned to vendors by their PIN code.',
        });
      }

      // Transaction to ensure both Vendor and User are created
      const result = await prisma.$transaction(async (tx) => {
          // 1. Create Vendor Profile
          const vendor = await tx.vendor.create({
            data: {
              name,
              company,
              serviceType: type || serviceType,
              contactPerson,
              contact: phone || contact || '',
              email,
              address,
              gst,
              pan,
              contractStart: contractStart ? new Date(contractStart) : null,
              contractEnd: contractEnd ? new Date(contractEnd) : null,
              contractValue: contractValue ? parseFloat(contractValue) : 0,
              paymentTerms,
              societyId: socId,
              status: 'ACTIVE',
              servicePincodes: pincodeArr.length ? pincodeArr.join(', ') : null
            }
          });

          // 2. Create User – vendor logs in with email + password
          const hashedPassword = await bcrypt.hash(loginPassword, 10);
          await tx.user.create({
              data: {
                  name: name || company || contactPerson,
                  email,
                  phone: phone || contact || '',
                  password: hashedPassword,
                  role: 'VENDOR',
                  status: 'ACTIVE',
                  societyId: socId // Null for Platform Vendor, ID for Societal
              }
          });
          
          return vendor;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Create Vendor Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async listAllVendors(req, res) {
    try {
      let { page = 1, limit = 10, search, status, pincode } = req.query;
      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      const where = {};
      const role = req.user.role;
      const sid = req.user.societyId;

      if (role === 'SUPER_ADMIN') {
           // Super Admin: ONLY Platform Vendors (societyId = null)
           where.societyId = null; 
      } else {
           // Admin: ONLY Society Vendors (societyId = user.societyId)
           if (sid) where.societyId = sid;
           else where.societyId = -1;
      }

      if (search) {
        where.OR = [
            { name: { contains: search } },
            { serviceType: { contains: search } },
            { contact: { contains: search } }
        ];
      }
      if (status && status !== 'all') {
        where.status = status;
      }
      if (pincode && String(pincode).trim()) {
        const pin = String(pincode).trim();
        const pinCond = {
          OR: [
            { servicePincodes: { equals: pin } },
            { servicePincodes: { startsWith: pin + ',' } },
            { servicePincodes: { endsWith: ',' + pin } },
            { servicePincodes: { contains: ',' + pin + ',' } }
          ]
        };
        if (Object.keys(where).length > 0) {
          where = { AND: [ { ...where }, pinCond ] };
        } else {
          Object.assign(where, pinCond);
        }
      }

      console.log('listAllVendors Params:', { page, limit, search, status, pincode });
      console.log('Constructed Where:', JSON.stringify(where, null, 2));

      const [total, vendors] = await Promise.all([
        prisma.vendor.count({ where }),
        prisma.vendor.findMany({
            where,
            skip,
            take: limit,
          include: { society: { select: { name: true } } }
        })
      ]);
      console.log('Query Result:', { total, count: vendors.length });
      res.json({
        data: vendors,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('List All Vendors Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updateVendorStatus(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.vendor.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Vendor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: vendor belongs to another society' });
      }
      const vendor = await prisma.vendor.update({
        where: { id: parseInt(id) },
        data: { status: (req.body.status || '').toUpperCase() }
      });
      res.json(vendor);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteVendor(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.vendor.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Vendor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: vendor belongs to another society' });
      }
      await prisma.vendor.delete({ where: { id: parseInt(id) } });
      res.json({ message: 'Vendor deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      const role = req.user.role;
      // Super Admin should see global stats, others filtered by their society
      const where = role === 'SUPER_ADMIN' ? {} : (societyId ? { societyId } : {});

      const totalVendors = await prisma.vendor.count({ where });
      const activeVendors = await prisma.vendor.count({
        where: { ...where, status: 'ACTIVE' }
      });

      // Count unique societies served by these vendors
      const societyConnectionsData = await prisma.vendor.groupBy({
        by: ['societyId'],
        where: {
          ...where,
          societyId: { not: null }
        }
      });
      const societyConnections = societyConnectionsData.length;

      // Calculate pending payments from vendor invoices
      const pendingPayments = await prisma.vendorInvoice.aggregate({
        where: { ...where, status: 'PENDING' },
        _sum: { totalAmount: true }
      });

      res.json({
        totalVendors,
        activeVendors,
        societyConnections,
        pendingPayments: pendingPayments._sum.totalAmount || 0,
        avgPartnerRating: 4.8 // Mock rating
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateVendor(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.vendor.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Vendor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: vendor belongs to another society' });
      }
      const {
        name,
        company,
        type,
        serviceType,
        contactPerson,
        contact,
        phone,
        email,
        address,
        status,
        gst,
        pan,
        contractStart,
        contractEnd,
        contractValue,
        paymentTerms
      } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (type !== undefined || serviceType !== undefined) updateData.serviceType = type || serviceType;
      if (phone !== undefined || contact !== undefined) updateData.contact = phone || contact;
      if (email !== undefined) updateData.email = email;
      if (address !== undefined) updateData.address = address;
      if (status !== undefined) updateData.status = status.toUpperCase();

      if (contractStart !== undefined) updateData.contractStart = contractStart ? new Date(contractStart) : null;
      if (contractEnd !== undefined) updateData.contractEnd = contractEnd ? new Date(contractEnd) : null;
      if (contractValue !== undefined) updateData.contractValue = contractValue ? parseFloat(contractValue) : 0;
      if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
      if (company !== undefined) updateData.company = company;
      if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
      if (gst !== undefined) updateData.gst = gst;
      if (pan !== undefined) updateData.pan = pan;
      if (req.body.servicePincodes !== undefined) updateData.servicePincodes = req.body.servicePincodes;

      const vendor = await prisma.vendor.update({
        where: { id: parseInt(id) },
        data: updateData
      });
      res.json(vendor);
    } catch (error) {
      console.error('Update Vendor Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async renewContract(req, res) {
    try {
      const { id } = req.params;
      // In a real app, this would update a contractEnd date in the vendor model
      res.json({ message: 'Contract renewed successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async rateVendor(req, res) {
    try {
      const { id } = req.params;
      const { rating } = req.body;
      // In a real app, this would add a record to a VendorRating model
      res.json({ message: 'Rating submitted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getPaymentHistory(req, res) {
    try {
      const { id } = req.params;
      const vendor = await prisma.vendor.findUnique({ where: { id: parseInt(id) } });
      if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && vendor.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: vendor belongs to another society' });
      }
      const payments = await prisma.vendorInvoice.findMany({
        where: { vendorId: parseInt(id) },
        orderBy: { createdAt: 'desc' }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = VendorController;
