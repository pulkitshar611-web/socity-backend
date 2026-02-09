const prisma = require("../lib/prisma");
const { getIO } = require("../lib/socket");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const path = require("path");

// Use Artifact Directory for guaranteed access
const DEBUG_LOG_PATH =
  "C:/Users/asus/.gemini/antigravity/brain/3e4b1eee-c599-4e39-8db8-c1189d4781a8/backend_debug.log";

const logToFile = (msg) => {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(DEBUG_LOG_PATH, `[${timestamp}] [CHAT] ${msg}\n`);
  } catch (e) {
    // Fallback to console if file write fails
    console.error("LOG_TO_FILE_FAILED", e);
  }
};

class ChatController {
  /** Users the current user can start a chat with. Super Admin: only admins of societies they created. */
  static async getAvailableUsersForChat(req, res) {
    try {
      const { id, societyId, role } = req.user;
      const roleUpper = (role || "").toUpperCase().replace(/\s+/g, "_");
      const isSuperAdmin = roleUpper === "SUPER_ADMIN";

      if (isSuperAdmin) {
        // Society admins (of societies created by this Super Admin) + all Individual users
        const mySocieties = await prisma.society.findMany({
          where: { createdByUserId: id },
          select: { id: true },
        });
        const societyIds = mySocieties.map((s) => s.id);
        const adminWhere =
          societyIds.length > 0
            ? { id: { not: id }, role: "ADMIN", societyId: { in: societyIds } }
            : { id: { not: id }, role: "ADMIN", societyId: { not: null } };
        const [adminUsers, individualUsers] = await Promise.all([
          prisma.user.findMany({
            where: adminWhere,
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profileImg: true,
              phone: true,
              societyId: true,
              society: { select: { name: true } },
            },
            orderBy: { name: "asc" },
          }),
          prisma.user.findMany({
            where: { id: { not: id }, role: "INDIVIDUAL" },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profileImg: true,
              phone: true,
              societyId: true,
              society: { select: { name: true } },
            },
            orderBy: { name: "asc" },
          }),
        ]);
        const seen = new Set();
        const combined = [];
        for (const u of adminUsers) {
          if (!seen.has(u.id)) {
            seen.add(u.id);
            combined.push(u);
          }
        }
        for (const u of individualUsers) {
          if (!seen.has(u.id)) {
            seen.add(u.id);
            combined.push(u);
          }
        }
        combined.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        const list = combined.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.toLowerCase(),
          profileImg: u.profileImg,
          phone: u.phone,
          societyId: u.societyId,
          societyName: u.society?.name || null,
        }));
        return res.json(list);
      }

      // INDIVIDUAL: can chat only with Super Admin and the user who added them (addedByUserId)
      const roleNorm = (role || "").toUpperCase().replace(/\s+/g, "_");
      if (roleNorm === "INDIVIDUAL") {
        const allowedIds = [];
        // Fetch Super Admins first (so Individual always sees them even if addedByUserId column is missing)
        const superAdmins = await prisma.user.findMany({
          where: { role: "SUPER_ADMIN" },
          select: { id: true },
        });
        superAdmins.forEach((u) => allowedIds.push(u.id));
        let addedBy = null;
        try {
          const me = await prisma.user.findUnique({
            where: { id },
            select: { addedByUserId: true },
          });
          if (me?.addedByUserId) addedBy = me.addedByUserId;
        } catch (_) {
          // addedByUserId column may not exist in DB yet
        }
        if (addedBy) allowedIds.push(addedBy);
        const userIds = [...new Set(allowedIds)].filter((uid) => uid !== id);
        if (userIds.length === 0) return res.json([]);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profileImg: true,
            phone: true,
            societyId: true,
            society: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        });
        const list = users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.toLowerCase(),
          profileImg: u.profileImg,
          phone: u.phone,
          societyId: u.societyId,
          societyName: u.society?.name || null,
        }));
        return res.json(list);
      }

      // GUARD: (1) society admin who added the guard – only in header chat; (2) residents – in both header and "Chat with Residents" page.
      // Query scope=residents_only: used by Guard "Chat with Residents" page – return only residents. Header uses no scope – creator + residents.
      if (roleNorm === "GUARD" && societyId) {
        const residentsOnly = req.query.scope === "residents_only";
        let creatorId = null;
        try {
          const me = await prisma.user.findUnique({
            where: { id },
            select: { addedByUserId: true },
          });
          creatorId = me?.addedByUserId ?? null;
        } catch (_) {}
        const allowedIds = [];
        if (creatorId && !residentsOnly) {
          allowedIds.push(creatorId); // Society admin – only in header chat, not on Chat with Residents page
        }
        if (creatorId) {
          const residentsByCreator = await prisma.user.findMany({
            where: {
              id: { not: id },
              societyId,
              role: "RESIDENT",
              addedByUserId: creatorId,
            },
            select: { id: true },
          });
          residentsByCreator.forEach((u) => allowedIds.push(u.id));
        }
        let userIds = [...new Set(allowedIds)].filter((uid) => uid !== id);
        if (userIds.length === 0 && !creatorId) {
          // Fallback: Guard with no addedByUserId (old data)
          if (residentsOnly) {
            const fallbackResidents = await prisma.user.findMany({
              where: { id: { not: id }, societyId, role: "RESIDENT" },
              select: { id: true },
            });
            userIds = fallbackResidents.map((u) => u.id);
          } else {
            const societyAdmins = await prisma.user.findMany({
              where: { id: { not: id }, societyId, role: "ADMIN" },
              select: { id: true },
            });
            const fallbackResidents = await prisma.user.findMany({
              where: { id: { not: id }, societyId, role: "RESIDENT" },
              select: { id: true },
            });
            userIds = [...societyAdmins.map((u) => u.id), ...fallbackResidents.map((u) => u.id)];
            userIds = [...new Set(userIds)];
          }
        }
        if (userIds.length === 0) {
          return res.json([]);
        }
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profileImg: true,
            phone: true,
            societyId: true,
            society: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        });
        const list = users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.toLowerCase(),
          profileImg: u.profileImg,
          phone: u.phone,
          societyId: u.societyId,
          societyName: u.society?.name || null,
        }));
        if (creatorId && !residentsOnly && list.length > 1) {
          const creatorIndex = list.findIndex((u) => u.id === creatorId);
          if (creatorIndex > 0) {
            const [creatorItem] = list.splice(creatorIndex, 1);
            list.unshift(creatorItem);
          }
        }
        return res.json(list);
      }
      // Resident: can chat with Guards of same society AND with Admins/Super Admin (Helpdesk). Return Guards + Admins + Super Admin only.
      if (roleNorm === "RESIDENT" && societyId) {
        const users = await prisma.user.findMany({
          where: {
            id: { not: id },
            OR: [
              { societyId, role: "GUARD" },
              { societyId, role: "ADMIN" },
              { role: "SUPER_ADMIN" },
            ],
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profileImg: true,
            phone: true,
            societyId: true,
            society: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        });
        const list = users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.toLowerCase(),
          profileImg: u.profileImg,
          phone: u.phone,
          societyId: u.societyId,
          societyName: u.society?.name || null,
        }));
        return res.json(list);
      }

      // ADMIN / COMMITTEE: same society users + Super Admin (for platform support). Others: return empty.
      if (!societyId || !["ADMIN", "COMMITTEE"].includes(roleNorm)) {
        return res.json([]);
      }
      
      // RESTRICTION: Admin can only chat with Super Admin and users they created (addedByUserId = me)
      const users = await prisma.user.findMany({
        where: {
          id: { not: id },
          OR: [
            { addedByUserId: id }, // Only users created by this Admin
            { role: "SUPER_ADMIN" } // And Platform Super Admin
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profileImg: true,
          phone: true,
          societyId: true,
          society: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      const list = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role.toLowerCase(),
        profileImg: u.profileImg,
        phone: u.phone,
        societyId: u.societyId,
        societyName: u.society?.name || null,
      }));
      return res.json(list);
    } catch (error) {
      console.error("Get available users for chat:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Individual ↔ Super Admin: Get or create the single support conversation.
   * Individual can only have one conversation (with platform Super Admin). Super Admin not applicable.
   */
  static async getOrCreateSupportConversation(req, res) {
    try {
      const { id: myId, societyId, role } = req.user;
      const roleNorm = (role || "").toUpperCase().replace(/\s+/g, "_");
      if (roleNorm !== "INDIVIDUAL") {
        return res.status(403).json({
          error: "Only Individual users can use support conversation.",
        });
      }
      // Ensure PLATFORM society exists (for Individual ↔ Super Admin chat); create if missing
      let platformSociety = await prisma.society.findUnique({
        where: { code: "PLATFORM" },
        select: { id: true },
      });
      if (!platformSociety) {
        platformSociety = await prisma.society.create({
          data: {
            name: "Platform",
            address: "Platform (chat only)",
            code: "PLATFORM",
            status: "ACTIVE",
            expectedUnits: 0,
          },
          select: { id: true },
        });
      }
      const superAdmin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        select: { id: true, name: true, profileImg: true, role: true, phone: true },
      });
      if (!superAdmin) {
        return res.status(503).json({
          error: "Support chat is not available. No Super Admin found.",
        });
      }
      const uidA = Math.min(myId, superAdmin.id);
      const uidB = Math.max(myId, superAdmin.id);
      let conversation = await prisma.conversation.findFirst({
        where: {
          societyId: platformSociety.id,
          type: "DIRECT",
          participantId: uidA,
          directParticipantId: uidB,
        },
        include: {
          participant: {
            select: { id: true, name: true, profileImg: true, role: true, phone: true },
          },
          directParticipant: {
            select: { id: true, name: true, profileImg: true, role: true, phone: true },
          },
        },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            societyId: platformSociety.id,
            type: "DIRECT",
            participantId: uidA,
            directParticipantId: uidB,
          },
          include: {
            participant: {
              select: { id: true, name: true, profileImg: true, role: true, phone: true },
            },
            directParticipant: {
              select: { id: true, name: true, profileImg: true, role: true, phone: true },
            },
          },
        });
      }
      const otherUser =
        conversation.participantId === myId
          ? conversation.directParticipant
          : conversation.participant;
      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: myId },
          status: { not: "read" },
        },
      });
      res.json({
        id: conversation.id,
        type: conversation.type,
        otherUser,
        lastMessage: null,
        updatedAt: conversation.updatedAt,
        unreadCount,
      });
    } catch (error) {
      console.error("Get or create support conversation:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /** Mark all messages in conversation (received by me) as read. */
  static async markConversationAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const conversationId = parseInt(id);
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { participantId: true, directParticipantId: true, societyId: true },
      });
      if (!conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const isParticipant =
        conv.participantId === userId ||
        (conv.directParticipantId && conv.directParticipantId === userId);
      if (!isParticipant) {
        return res.status(403).json({ error: "You do not have access to this conversation" });
      }
      await prisma.chatMessage.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: { not: "read" },
        },
        data: { status: "read" },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Mark conversation as read:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async listConversations(req, res) {
    try {
      logToFile("listConversations called");
      const { id, societyId, role } = req.user;

      // Only conversations where I am participant
      const baseWhere = {
        OR: [{ participantId: id }, { directParticipantId: id }],
      };
      const roleUpper = (role || "").toUpperCase();
      // Society users (ADMIN, RESIDENT, COMMITTEE, etc.) see only convos in their society
      // Super Admin sees only convos with admins of societies they created
      let where;
      if (societyId) {
        where = { ...baseWhere, societyId };
      } else if (roleUpper === "SUPER_ADMIN") {
        where = {
          ...baseWhere,
          OR: [
            { society: { createdByUserId: id } },
            { society: { createdByUserId: null } },
          ],
        };
      } else {
        where = baseWhere;
      }

      const conversations = await prisma.conversation.findMany({
        where,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { sender: { select: { name: true } } },
          },
          participant: {
            select: {
              id: true,
              name: true,
              profileImg: true,
              role: true,
              phone: true,
            },
          },
          directParticipant: {
            select: {
              id: true,
              name: true,
              profileImg: true,
              role: true,
              phone: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Format for frontend and add unread count per conversation
      let formatted = await Promise.all(
        conversations.map(async (c) => {
          const otherUser =
            c.participantId === id ? c.directParticipant : c.participant;
          const unreadCount = await prisma.chatMessage.count({
            where: {
              conversationId: c.id,
              senderId: { not: id },
              status: { not: "read" },
            },
          });
          return {
            id: c.id,
            type: c.type,
            otherUser: c.type === "DIRECT" ? otherUser : null,
            lastMessage: c.messages[0],
            updatedAt: c.updatedAt,
            unreadCount,
          };
        })
      );

      // Super Admin: show DIRECT conversations where the other user is society ADMIN or INDIVIDUAL (support chats)
      if (roleUpper === "SUPER_ADMIN") {
        formatted = formatted.filter((c) => {
          if (c.type !== "DIRECT" || !c.otherUser) return false;
          const otherRole = (c.otherUser.role || "").toUpperCase();
          return otherRole === "ADMIN" || otherRole === "INDIVIDUAL";
        });
      }

      // Individual: show only conversations with Super Admin or the user who added them
      if (roleUpper === "INDIVIDUAL") {
        let allowedOtherId = null;
        try {
          const myUser = await prisma.user.findUnique({
            where: { id },
            select: { addedByUserId: true },
          });
          allowedOtherId = myUser?.addedByUserId ?? null;
        } catch (_) {
          // addedByUserId column may not exist in DB yet
        }
        formatted = formatted.filter((c) => {
          if (c.type !== "DIRECT" || !c.otherUser) return false;
          const otherRole = (c.otherUser.role || "").toUpperCase();
          const isSuperAdmin = otherRole === "SUPER_ADMIN";
          const isAddedBy = allowedOtherId != null && c.otherUser.id === allowedOtherId;
          return isSuperAdmin || isAddedBy;
        });
      }

      // Guard: show only DIRECT with (1) creator (addedByUserId), (2) residents added by same creator.
      if (roleUpper === "GUARD") {
        let guardCreatorId = null;
        try {
          const myUser = await prisma.user.findUnique({
            where: { id },
            select: { addedByUserId: true },
          });
          guardCreatorId = myUser?.addedByUserId ?? null;
        } catch (_) {}
        formatted = formatted.filter((c) => {
          if (c.type !== "DIRECT" || !c.otherUser) return false;
          const otherRole = (c.otherUser.role || "").toUpperCase();
          const isResident = otherRole === "RESIDENT";
          const isCreator = guardCreatorId != null && c.otherUser.id === guardCreatorId;
          return isResident || isCreator;
        });
      }
      // Resident: keep all society conversations (support channels + direct with Admin + direct with Guard). No filter.

      res.json(formatted);
    } catch (error) {
      console.error("List Conversations Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getMessages(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const conversationId = parseInt(id);

      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          participantId: true,
          directParticipantId: true,
          societyId: true,
          type: true,
          society: { select: { createdByUserId: true } },
        },
      });
      if (!conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      // Support channels: participantId must match, or direct chats: either participant matches
      const isParticipant =
        conv.participantId === userId ||
        (conv.directParticipantId && conv.directParticipantId === userId);
      if (!isParticipant) {
        return res
          .status(403)
          .json({ error: "You do not have access to this conversation" });
      }
      // Society users can only access conversations in their society (Individual can access conversations they participate in, e.g. PLATFORM support chat)
      const isIndividualUser =
        (req.user.role || "").toUpperCase().replace(/\s+/g, "_") === "INDIVIDUAL";
      if (
        !isIndividualUser &&
        req.user.societyId != null &&
        conv.societyId !== req.user.societyId
      ) {
        return res
          .status(403)
          .json({ error: "You do not have access to this conversation" });
      }
      // Super Admin: only access conversations in societies they created or societies with no createdByUserId (old data)
      const roleUpper = (req.user.role || "").toUpperCase();
      if (roleUpper === "SUPER_ADMIN" && req.user.societyId == null) {
        const createdBy = conv.society?.createdByUserId;
        if (createdBy != null && createdBy !== userId) {
          return res
            .status(403)
            .json({ error: "You do not have access to this conversation" });
        }
      }

      // Pagination: limit (default 50), offset (default 0)
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = parseInt(req.query.offset, 10) || 0;
      const messages = await prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        include: {
          sender: {
            select: { id: true, name: true, role: true, profileImg: true },
          },
        },
      });
      const total = await prisma.chatMessage.count({
        where: { conversationId },
      });
      res.json({ data: messages, total, limit, offset });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async uploadAttachment(req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "chat_attachments",
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        uploadStream.end(req.file.buffer);
      });
      res.json({
        url: result.secure_url,
        type: result.resource_type || "image",
        name: result.original_filename || "file",
      });
    } catch (error) {
      console.error("Chat upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload file" });
    }
  }

  static async sendMessage(req, res) {
    try {
      const { conversationId, content, attachments } = req.body;
      const { id: senderId, societyId } = req.user;
      const cid = parseInt(conversationId);

      const conv = await prisma.conversation.findUnique({
        where: { id: cid },
        select: {
          participantId: true,
          directParticipantId: true,
          societyId: true,
          type: true,
          society: { select: { createdByUserId: true } },
        },
      });
      if (!conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      // Support channels: participantId must match (directParticipantId is null)
      // Direct chats: either participantId or directParticipantId must match
      const isParticipant =
        conv.participantId === senderId ||
        (conv.directParticipantId && conv.directParticipantId === senderId);
      if (!isParticipant) {
        return res
          .status(403)
          .json({ error: "You cannot send messages in this conversation" });
      }
      // Society users can only send in conversations of their society (Individual can always send in conversations they participate in, e.g. PLATFORM support chat)
      const isIndividual =
        (req.user.role || "").toUpperCase().replace(/\s+/g, "_") === "INDIVIDUAL";
      if (
        !isIndividual &&
        req.user.societyId != null &&
        conv.societyId !== req.user.societyId
      ) {
        return res
          .status(403)
          .json({ error: "You cannot send messages in this conversation" });
      }
      // Super Admin: only send in societies they created or societies with no createdByUserId (old data)
      const roleUpper = (req.user.role || "").toUpperCase();
      if (roleUpper === "SUPER_ADMIN" && req.user.societyId == null) {
        const createdBy = conv.society?.createdByUserId;
        if (createdBy != null && createdBy !== senderId) {
          return res
            .status(403)
            .json({ error: "You cannot send messages in this conversation" });
        }
      }

      const message = await prisma.chatMessage.create({
        data: {
          conversationId: cid,
          senderId,
          content,
          attachments: attachments || [],
        },
        include: {
          sender: {
            select: { id: true, name: true, role: true, profileImg: true },
          },
          conversation: true,
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: cid },
        data: { updatedAt: new Date() },
      });

      // Emit via socket
      const io = getIO();
      io.to(`conversation_${cid}`).emit("new-message", message);
      io.to(`conversation_${cid}`).emit("conversation-updated", {
        conversationId: cid,
        senderName: message.sender.name,
      });

      // Notify the other participant(s) – create notification and emit to user room for real-time bell + toast
      const recipientId =
        conv.participantId === senderId
          ? conv.directParticipantId
          : conv.participantId;
      if (recipientId) {
        const preview =
          typeof content === "string" && content.length > 80
            ? content.slice(0, 80) + "…"
            : content || "(attachment)";
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: recipientId,
              title: `New message from ${message.sender.name}`,
              description: preview,
              type: "chat_message",
              read: false,
            },
          });
          io.to(`user_${recipientId}`).emit("new-chat-message", {
            notificationId: notification.id,
            title: notification.title,
            description: notification.description,
            conversationId: cid,
            senderName: message.sender.name,
          });
        } catch (notifErr) {
          console.error("Chat notification create failed:", notifErr.message);
        }
      }

      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async startConversation(req, res) {
    try {
      logToFile(
        `Start Conversation Request. Body: ${JSON.stringify(req.body)}`,
      );
      const { targetUserId, type, listingItem } = req.body;
      const { id: myId, societyId } = req.user;
      logToFile(`User: ${JSON.stringify(req.user)}`);

      // Support channel types (SUPPORT_ADMIN, SUPPORT_MAINTENANCE, etc.) don't need targetUserId
      const isSupportChannel =
        type &&
        [
          "SUPPORT_ADMIN",
          "SUPPORT_MAINTENANCE",
          "SUPPORT_SECURITY",
          "SUPPORT_COMMITTEE",
          "SUPPORT_ACCOUNTS",
        ].includes(type);

      if (isSupportChannel) {
        // Support channel: create conversation with type = SUPPORT_ADMIN, etc.
        if (!societyId) {
          return res
            .status(400)
            .json({ error: "Society context required for support channels" });
        }

        // Check if support channel conversation already exists
        let conversation = await prisma.conversation.findFirst({
          where: {
            type: type,
            participantId: myId,
            societyId: societyId,
            directParticipantId: null, // Support channels don't have direct participants
          },
        });

        if (!conversation) {
          try {
            conversation = await prisma.conversation.create({
              data: {
                societyId: societyId,
                type: type,
                participantId: myId,
                directParticipantId: null,
              },
            });
            console.log("Support channel conversation created:", conversation);
          } catch (createErr) {
            // Race: another request created same support channel; fetch and return it
            if (
              createErr.code === "P2002" ||
              (createErr.meta && createErr.meta.code === "P2002")
            ) {
              conversation = await prisma.conversation.findFirst({
                where: {
                  type: type,
                  participantId: myId,
                  societyId: societyId,
                  directParticipantId: null,
                },
              });
              if (conversation) {
                return res.json(conversation);
              }
            }
            throw createErr;
          }
        }

        return res.json(conversation);
      }

      // Direct chat: requires targetUserId
      if (!targetUserId) {
        return res.status(400).json({ error: "Target user ID is required" });
      }

      const tid = parseInt(targetUserId, 10);
      const targetUser = await prisma.user.findUnique({
        where: { id: tid },
        select: { societyId: true, role: true },
      });
      if (!targetUser) {
        return res.status(403).json({ error: "User not found." });
      }

      // Resolve finalSocietyId (needed for findFirst + create to match unique constraint)
      let finalSocietyId = societyId || targetUser.societyId;
      // Super Admin ↔ Individual (or other platform users with no society): use Platform society
      if (!finalSocietyId) {
        const platformSociety = await prisma.society.findUnique({
          where: { code: "PLATFORM" },
          select: { id: true },
        });
        if (platformSociety) {
          finalSocietyId = platformSociety.id;
        }
      }
      if (!finalSocietyId) {
        return res
          .status(400)
          .json({
            error:
              "Cannot create conversation: No linked society found. Super Admin ↔ Individual chat requires a Platform society (code PLATFORM) to be created.",
          });
      }

      // Society users: can start chat with same-society users OR with Super Admin (platform support)
      // Guard: only with Residents of same society. Resident/Admin: same society or Super Admin.
      const myRole = (req.user.role || "").toUpperCase();
      const targetRole = (targetUser.role || "").toUpperCase();
      const isCallerSuperAdmin = myRole === "SUPER_ADMIN";
      if (societyId && !isCallerSuperAdmin) {
        const sameSociety = targetUser.societyId === societyId;
        const isSuperAdmin = targetRole === "SUPER_ADMIN";
        if (!sameSociety && !isSuperAdmin) {
          return res
            .status(403)
            .json({
              error:
                "You can only start conversations with users in your society or with platform support.",
            });
        }
        // Guard can only chat with (1) who created the guard (addedByUserId), (2) residents added by that same creator.
        if (myRole === "GUARD") {
          if (targetRole === "RESIDENT") {
            let creatorId = null;
            try {
              const myUser = await prisma.user.findUnique({
                where: { id: myId },
                select: { addedByUserId: true },
              });
              creatorId = myUser?.addedByUserId ?? null;
            } catch (_) {}
            if (creatorId != null) {
              const targetUserAddedBy = await prisma.user.findUnique({
                where: { id: tid },
                select: { addedByUserId: true },
              });
              if (targetUserAddedBy?.addedByUserId !== creatorId) {
                return res.status(403).json({
                  error: "You can only chat with residents added by the same admin who added you.",
                });
              }
            }
          } else {
            let creatorId = null;
            try {
              const myUser = await prisma.user.findUnique({
                where: { id: myId },
                select: { addedByUserId: true },
              });
              creatorId = myUser?.addedByUserId ?? null;
            } catch (_) {}
            if (creatorId != null && tid !== creatorId) {
              return res.status(403).json({
                error: "Guards can only start conversations with the admin who added you or residents added by that admin.",
              });
            }
            // Guard with no addedByUserId (old data): allow same-society Admin (society admin) and Residents
            if (creatorId == null && targetRole !== "RESIDENT" && targetRole !== "ADMIN") {
              return res.status(403).json({
                error: "Guards can only start conversations with residents or society admin of their society.",
              });
            }
          }
        }
      } else if (isCallerSuperAdmin || !societyId) {
        // Caller has no society (Super Admin or Individual). Super Admin: society Admin + all Individual users. Individual: only Super Admin + user who added them
        let allowed =
          (myRole === "SUPER_ADMIN" && (targetRole === "ADMIN" || targetRole === "INDIVIDUAL")) ||
          (myRole === "INDIVIDUAL" && targetRole === "SUPER_ADMIN");
        if (myRole === "INDIVIDUAL" && !allowed) {
          const myUser = await prisma.user.findUnique({
            where: { id: myId },
            select: { addedByUserId: true },
          });
          if (myUser?.addedByUserId === tid) allowed = true;
        }
        if (!allowed) {
          return res.status(403).json({
            error:
              myRole === "SUPER_ADMIN"
                ? "You can only start conversations with society admins or individual users."
                : "You can only start conversations with Super Admin or the user who added you.",
          });
        }
        // Super Admin ↔ Admin: admin must be linked to a society. (Super Admin ↔ Individual: no society check.)
        if (myRole === "SUPER_ADMIN" && targetRole === "ADMIN") {
          if (!targetUser.societyId) {
            return res.status(400).json({
              error: "Target admin must be linked to a society.",
            });
          }
          const targetSociety = await prisma.society.findUnique({
            where: { id: targetUser.societyId },
            select: { createdByUserId: true },
          });
          if (!targetSociety) {
            return res.status(403).json({
              error: "Society not found.",
            });
          }
          const createdBy = targetSociety.createdByUserId;
          if (createdBy != null && createdBy !== myId) {
            return res.status(403).json({
              error: "You can only chat with admins of societies you created.",
            });
          }
        }
      }

      logToFile("Checking existing conversation...");
      const uidA = Math.min(myId, tid);
      const uidB = Math.max(myId, tid);
      // Find by same fields as unique constraint: societyId, type, participantId, directParticipantId
      let conversation = await prisma.conversation.findFirst({
        where: {
          societyId: finalSocietyId,
          type: "DIRECT",
          participantId: uidA,
          directParticipantId: uidB,
        },
      });

      if (!conversation) {
        console.log("No existing conversation found. Creating new one...");
        try {
          conversation = await prisma.conversation.create({
            data: {
              societyId: finalSocietyId,
              type: "DIRECT",
              participantId: uidA,
              directParticipantId: uidB,
            },
          });
          console.log("Conversation created:", conversation);
        } catch (createErr) {
          // Race: another request created same conversation; fetch and return it
          if (
            createErr.code === "P2002" ||
            (createErr.meta && createErr.meta.code === "P2002")
          ) {
            conversation = await prisma.conversation.findFirst({
              where: {
                societyId: finalSocietyId,
                type: "DIRECT",
                participantId: uidA,
                directParticipantId: uidB,
              },
            });
            if (conversation) {
              return res.json(conversation);
            }
          }
          throw createErr;
        }
      } else {
        console.log("Found existing conversation:", conversation);
      }

      // If opened from marketplace, add one "listing" message so both buyer and seller see the product in chat (only if not already present)
      if (listingItem && listingItem.itemTitle) {
        const existingListing = await prisma.chatMessage.findFirst({
          where: {
            conversationId: conversation.id,
            content: { startsWith: "📎 Listing:" },
          },
        });
        if (!existingListing) {
          const priceStr =
            listingItem.itemPrice != null
              ? `₹${Number(listingItem.itemPrice).toLocaleString()}`
              : "";
          const content = `📎 Listing: ${listingItem.itemTitle}${priceStr ? ` - ${priceStr}` : ""}`;
          const attachments =
            listingItem.itemImage && listingItem.itemImage.trim()
              ? [
                  {
                    url: listingItem.itemImage,
                    type: "image",
                    name: listingItem.itemTitle,
                  },
                ]
              : [];
          await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              senderId: myId,
              content,
              attachments: attachments.length ? attachments : [],
            },
          });
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });
        }
      }

      res.json(conversation);
    } catch (error) {
      console.error("Start Conversation Error Stack:", error.stack);
      console.error("Start Conversation Error Message:", error.message);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  }
}

module.exports = ChatController;
