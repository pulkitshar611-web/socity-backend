const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const { getIO } = require("../lib/socket");

const PIN_CODE_LENGTH = parseInt(process.env.PIN_CODE_LENGTH || "6", 10);
const NO_VENDOR_MESSAGE = "Service not available in your area.";

/** Check if vendor's servicePincodes covers this pincode (comma list or "start-end" ranges). */
function vendorServesPincode(servicePincodes, pincode) {
  if (!servicePincodes || !pincode) return false;
  const parts = servicePincodes
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((s) => s.trim());
      if (start && end && pincode >= start && pincode <= end) return true;
    } else if (part === pincode) return true;
  }
  return false;
}

/** Find first active vendor that serves the given pincode. */
async function findVendorByPincode(pincode) {
  const vendors = await prisma.vendor.findMany({
    where: { status: "ACTIVE", servicePincodes: { not: null } },
  });
  for (const v of vendors) {
    if (vendorServesPincode(v.servicePincodes, pincode)) return v;
  }
  return null;
}

class UserController {
  static async uploadPhoto(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      // Convert buffer to data URI
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;

      // Upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(dataURI, {
        folder: "socity_profiles",
        resource_type: "auto",
      });

      // Update user profile image
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { profileImg: uploadResponse.secure_url },
      });

      // Notify admins/superadmins so user lists show updated photo
      try {
        const io = getIO();
        const payload = {
          userId: user.id,
          name: user.name,
          profileImg: user.profileImg,
          societyId: user.societyId,
        };
        io.to("platform_admin").emit("user-profile-updated", payload);
        if (user.societyId)
          io.to(`society_${user.societyId}`).emit(
            "user-profile-updated",
            payload,
          );
      } catch (_) {}

      res.json({
        message: "Photo uploaded successfully",
        profileImg: user.profileImg,
        avatar: user.profileImg,
      });
    } catch (error) {
      console.error("Upload Photo Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async register(req, res) {
    try {
      let { email, password, name, phone, role, societyCode, pinCode } =
        req.body;
      const effectiveRole = (role || "RESIDENT").toUpperCase();

      // Check if user exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Individual/customer: PIN Code mandatory + vendor auto-assignment
      let pinCodeToSave = null;
      let assignedVendorId = null;
      if (effectiveRole === "INDIVIDUAL") {
        const trimmed =
          pinCode != null && pinCode !== "" ? String(pinCode).trim() : "";
        if (!trimmed) {
          return res.status(400).json({
            error: "PIN Code is required for customer registration.",
          });
        }
        if (!/^\d+$/.test(trimmed)) {
          return res.status(400).json({
            error: "PIN Code must contain only digits.",
          });
        }
        if (trimmed.length !== PIN_CODE_LENGTH) {
          return res.status(400).json({
            error: `PIN Code must be exactly ${PIN_CODE_LENGTH} digits.`,
          });
        }
        const vendor = await findVendorByPincode(trimmed);
        if (!vendor) {
          return res.status(400).json({ error: NO_VENDOR_MESSAGE });
        }
        pinCodeToSave = trimmed;
        assignedVendorId = vendor.id;
      }

      // Handle optional password
      const actualPassword =
        password || `SOCITY${Date.now().toString().slice(-6)}`;

      // Hash password
      const hashedPassword = await bcrypt.hash(actualPassword, 10);

      // Find society if code provided
      let societyId = null;
      if (societyCode) {
        const society = await prisma.society.findUnique({
          where: { code: societyCode },
        });
        if (!society) {
          return res.status(400).json({ error: "Invalid society code" });
        }
        societyId = society.id;
      }

      // If Individual is created by logged-in user (Super Admin/Admin), record who added them (Individual can only chat with Super Admin + this user)
      const addedByUserId =
        req.user && effectiveRole === "INDIVIDUAL" ? req.user.id : null;

      // Create User
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone,
          role: effectiveRole,
          societyId,
          ...(pinCodeToSave != null && { pinCode: pinCodeToSave }),
          ...(assignedVendorId != null && { assignedVendorId }),
          ...(addedByUserId != null && { addedByUserId }),
        },
      });

      res.status(201).json({
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          password: actualPassword, // Return plain password for one-time display
        },
      });
    } catch (error) {
      console.error("Register Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find User
      const user = await prisma.user.findUnique({
        where: { email },
        include: { 
          society: {
            include: { billingPlan: true }
          } 
        },
      });

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Suspended users cannot login
      if (user.status === "SUSPENDED") {
        return res.status(403).json({
          error:
            "Your account has been suspended. Please contact your administrator.",
        });
      }

      // If society is suspended, block login
      if (user.society && user.society.status === "SUSPENDED") {
        return res.status(403).json({
          error: "Your society has been suspended. Access denied. Please contact support.",
        });
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          societyId: user.societyId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );

      // Create Session Record
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token,
          device: req.headers["user-agent"] || "Unknown",
          ipAddress: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
        },
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.toLowerCase(),
          society: user.society,
          avatar: user.profileImg,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMe(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { 
          society: {
            include: { billingPlan: true }
          }, 
          assignedVendor: true 
        },
      });
      if (user) {
        user.role = user.role.toLowerCase();
        user.avatar = user.profileImg; // Alias for frontend compatibility
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateProfile(req, res) {
    try {
      const { name, phone, profileImg, password, pinCode } = req.body;

      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });
      const isIndividual =
        currentUser && currentUser.role === "INDIVIDUAL";

      // Individual/customer: PIN Code mandatory on every save; re-assign vendor
      if (isIndividual) {
        const trimmed =
          pinCode !== undefined && pinCode !== null
            ? String(pinCode).trim()
            : "";
        if (!trimmed) {
          return res.status(400).json({
            error: "PIN Code is required for customer profile.",
          });
        }
        if (!/^\d+$/.test(trimmed)) {
          return res.status(400).json({
            error: "PIN Code must contain only digits.",
          });
        }
        if (trimmed.length !== PIN_CODE_LENGTH) {
          return res.status(400).json({
            error: `PIN Code must be exactly ${PIN_CODE_LENGTH} digits.`,
          });
        }
        const vendor = await findVendorByPincode(trimmed);
        if (!vendor) {
          return res.status(400).json({ error: NO_VENDOR_MESSAGE });
        }
        req._pinCode = trimmed;
        req._assignedVendorId = vendor.id;
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (profileImg !== undefined) updateData.profileImg = profileImg;
      if (req._pinCode !== undefined) updateData.pinCode = req._pinCode;
      if (req._assignedVendorId !== undefined)
        updateData.assignedVendorId = req._assignedVendorId;

      // If password is provided, hash it and add to update data
      if (password && password.trim() !== "") {
        const hashedPassword = await bcrypt.hash(password, 10);
        updateData.password = hashedPassword;
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        include: { society: true, assignedVendor: true },
      });

      // Notify admins/superadmins so user lists show updated name/photo
      try {
        const io = getIO();
        const payload = {
          userId: user.id,
          name: user.name,
          profileImg: user.profileImg,
          societyId: user.societyId,
        };
        io.to("platform_admin").emit("user-profile-updated", payload);
        if (user.societyId)
          io.to(`society_${user.societyId}`).emit(
            "user-profile-updated",
            payload,
          );
      } catch (_) {}

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update Profile Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getAllUsers(req, res) {
    try {
      // SUPER_ADMIN sees all. ADMIN/COMMITTEE see same-society users + SUPER_ADMIN (so they can chat with platform)
      const isSocietyScope =
        ["ADMIN", "COMMITTEE"].includes(req.user.role) && req.user.societyId;
      const where = isSocietyScope
        ? { OR: [{ societyId: req.user.societyId }, { role: "SUPER_ADMIN" }] }
        : {};
      const users = await prisma.user.findMany({
        where,
        include: { society: true },
        orderBy: { createdAt: "desc" },
      });

      const formattedUsers = await Promise.all(
        users.map(async (u) => {
          let activeBarcodes = 0;
          let serviceRequests = 0;

          if (u.phone) {
            activeBarcodes = await prisma.emergencyBarcode.count({
              where: { phone: u.phone, status: "active" },
            });
            // Fixed: Query by residentId instead of removed residentName/source fields
            serviceRequests = await prisma.serviceInquiry.count({
              where: {
                residentId: u.id,
              },
            });
          }

          return {
            ...u,
            role: u.role.toLowerCase(),
            societyName: u.society?.name || "N/A",
            activeBarcodes,
            serviceRequests,
            registeredAt: u.createdAt.toISOString().split("T")[0],
          };
        }),
      );

      res.json(formattedUsers);
    } catch (error) {
      console.error("Get All Users Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getB2CStats(req, res) {
    try {
      // 1. Total B2C Users
      const totalUsers = await prisma.user.count({
        where: { role: "INDIVIDUAL" },
      });

      // 2. Active Scans (Daily) - EmergencyLogs for B2C users today
      // First get all B2C phones
      const b2cUsers = await prisma.user.findMany({
        where: { role: "INDIVIDUAL" },
        select: { phone: true },
      });
      const phones = b2cUsers.map((u) => u.phone).filter((p) => p);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeScans = await prisma.emergencyLog.count({
        where: {
          timestamp: { gte: today },
          visitorPhone: { in: phones },
        },
      });

      // 3. Total Bookings (Service Inquiries from Individuals)
      // Fixed: source field removed, query via resident relation
      const totalBookings = await prisma.serviceInquiry.count({
        where: {
          resident: {
            role: "INDIVIDUAL",
          },
        },
      });

      res.json({
        totalUsers,
        activeScans,
        totalBookings,
      });
    } catch (error) {
      console.error("Get B2C Stats Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { status: status.toUpperCase() },
      });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserStats(req, res) {
    try {
      const totalAdmins = await prisma.user.count({
        where: { role: "ADMIN" },
      });

      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });

      const pendingAdmins = await prisma.user.count({
        where: { role: "ADMIN", status: "PENDING" },
      });

      const suspendedAdmins = await prisma.user.count({
        where: { role: "ADMIN", status: "SUSPENDED" },
      });

      res.json({
        totalAdmins,
        activeAdmins,
        pendingAdmins,
        suspendedAdmins,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async listAdmins(req, res) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        include: { society: true },
      });

      const formattedAdmins = admins.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        profileImg: u.profileImg,
        society: u.society?.name || "N/A",
        societyId: u.societyId,
        isPaid: u.society?.isPaid || false,
        subscriptionPlan: u.society?.subscriptionPlan || "BASIC",
        status: u.status.toLowerCase(),
        joinedDate: u.createdAt.toISOString().split("T")[0],
        lastLogin: "2 hours ago", // Mock for now as we don't track'
        role: u.role,
      }));

      res.json(formattedAdmins);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createAdmin(req, res) {
    try {
      const { name, email, phone, password, societyId, designation } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create User
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone,
          role: "ADMIN",
          status: "ACTIVE",
          societyId: parseInt(societyId),
          addedByUserId: req.user.id,
        },
        include: { society: true },
      });

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateAdmin(req, res) {
    try {
      const { id } = req.params;
      const { name, email, phone, societyId, status } = req.body;

      const data = { name, email, phone };
      if (societyId) data.societyId = parseInt(societyId);
      if (status) data.status = status.toUpperCase();

      const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data,
        include: { society: true },
      });

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteAdmin(req, res) {
    try {
      const { id } = req.params;
      await prisma.user.delete({
        where: { id: parseInt(id) },
      });
      res.json({ message: "Admin deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const userId = parseInt(id);

      // Clean up sessions
      await prisma.userSession.deleteMany({
        where: { userId },
      });

      // Delete the user
      await prisma.user.delete({
        where: { id: userId },
      });

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete User Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  static async getUserActivity(req, res) {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({
        where: { id: parseInt(id) },
      });

      if (!user) return res.status(404).json({ error: "User not found" });
      if (
        req.user.role !== "SUPER_ADMIN" &&
        user.societyId !== req.user.societyId &&
        user.id !== req.user.id
      ) {
        return res.status(403).json({
          error:
            "Access denied: can only view activity for same society or self",
        });
      }

      const activityData = {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          role: user.role,
          createdAt: user.createdAt,
        },
        logs: [],
        barcodes: [],
      };

      if (user.phone) {
        // Fetch emergency logs where visitorPhone matches user phone
        const logs = await prisma.emergencyLog.findMany({
          where: { visitorPhone: user.phone },
          orderBy: { timestamp: "desc" },
        });
        activityData.logs = logs;

        // Fetch barcodes
        const barcodes = await prisma.emergencyBarcode.findMany({
          where: { phone: user.phone },
          orderBy: { createdAt: "desc" },
        });
        activityData.barcodes = barcodes;
      }

      res.json(activityData);
    } catch (error) {
      console.error("Get Activity Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = UserController;
