const prisma = require('../lib/prisma');

class CommunityController {
  // Get all community chat messages for the user's society
  static async getChatMessages(req, res) {
    try {
      const userId = req.user.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { societyId: true }
      });

      if (!user || !user.societyId) {
        return res.status(400).json({ error: 'User not associated with any society' });
      }

      const messages = await prisma.communityChat.findMany({
        where: { societyId: user.societyId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: 100 // Last 100 messages
      });

      const formattedMessages = messages.map(msg => ({
        id: msg.id,
        message: msg.message,
        userId: msg.userId,
        userName: msg.user.name,
        userRole: msg.user.role,
        createdAt: msg.createdAt
      }));

      res.json(formattedMessages);
    } catch (error) {
      console.error('Get chat messages error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Send a chat message
  static async sendChatMessage(req, res) {
    try {
      const userId = req.user.id;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { societyId: true, name: true, role: true }
      });

      if (!user || !user.societyId) {
        return res.status(400).json({ error: 'User not associated with any society' });
      }

      const chatMessage = await prisma.communityChat.create({
        data: {
          message: message.trim(),
          userId,
          societyId: user.societyId
        }
      });

      // Create notifications for all society members except sender
      const societyMembers = await prisma.user.findMany({
        where: {
          societyId: user.societyId,
          id: { not: userId },
          role: { in: ['RESIDENT', 'ADMIN', 'COMMITTEE'] }
        },
        select: { id: true }
      });

      // Create notification for each member
      if (societyMembers.length > 0) {
        await prisma.notification.createMany({
          data: societyMembers.map(member => ({
            userId: member.id,
            title: 'New Society Chat Message',
            description: `${user.name}: ${message.trim().substring(0, 50)}${message.trim().length > 50 ? '...' : ''}`,
            type: 'society_chat',
            metadata: {
              chatMessageId: chatMessage.id,
              senderId: userId,
              senderName: user.name
            }
          }))
        });
      }

      res.status(201).json({
        id: chatMessage.id,
        message: chatMessage.message,
        userId: chatMessage.userId,
        userName: user.name,
        userRole: user.role,
        createdAt: chatMessage.createdAt
      });
    } catch (error) {
      console.error('Send chat message error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete a chat message (only own messages or admin)
  static async deleteChatMessage(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const message = await prisma.communityChat.findUnique({
        where: { id: parseInt(id) }
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user owns the message or is admin
      if (message.userId !== userId && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Not authorized to delete this message' });
      }

      await prisma.communityChat.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error('Delete chat message error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ==================== GROUP CHAT METHODS ====================
  
  // Get all groups user is part of
  static async getUserGroups(req, res) {
    try {
      const userId = req.user.id;
      
      const groups = await prisma.chatGroup.findMany({
        where: {
          members: {
            some: { userId }
          }
        },
        include: {
          createdBy: {
            select: { id: true, name: true }
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, role: true }
              }
            }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              message: true,
              createdAt: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      const formattedGroups = groups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        createdBy: group.createdBy,
        memberCount: group.members.length,
        members: group.members.map(m => ({
          id: m.user.id,
          name: m.user.name,
          role: m.role
        })),
        lastMessage: group.messages[0] || null,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      }));

      res.json(formattedGroups);
    } catch (error) {
      console.error('Get user groups error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create a new group
  static async createGroup(req, res) {
    try {
      const userId = req.user.id;
      const { name, description, memberIds } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      if (!memberIds || memberIds.length === 0) {
        return res.status(400).json({ error: 'At least one member is required' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { societyId: true, role: true }
      });

      if (!user || !user.societyId) {
        return res.status(400).json({ error: 'User not associated with any society' });
      }

      // Only RESIDENT can create groups
      if (user.role !== 'RESIDENT') {
        return res.status(403).json({ error: 'Only residents can create groups' });
      }

      // Verify all selected members are RESIDENTS from the same society
      const selectedMembers = await prisma.user.findMany({
        where: {
          id: { in: memberIds },
        },
        select: { id: true, societyId: true, role: true }
      });

      // Check if all members are from same society and are RESIDENTS
      const invalidMembers = selectedMembers.filter(
        member => member.societyId !== user.societyId || member.role !== 'RESIDENT'
      );

      if (invalidMembers.length > 0) {
        return res.status(400).json({ 
          error: 'All members must be residents from your society' 
        });
      }

      // Create group with creator and selected members
      const allMemberIds = [...new Set([userId, ...memberIds])];

      const group = await prisma.chatGroup.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          createdById: userId,
          societyId: user.societyId,
          members: {
            create: allMemberIds.map(id => ({
              userId: id,
              role: id === userId ? 'ADMIN' : 'MEMBER'
            }))
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      res.status(201).json({
        id: group.id,
        name: group.name,
        description: group.description,
        memberCount: group.members.length,
        members: group.members.map(m => ({
          id: m.user.id,
          name: m.user.name,
          role: m.role
        })),
        createdAt: group.createdAt
      });
    } catch (error) {
      console.error('Create group error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get group messages
  static async getGroupMessages(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.params;

      // Check if user is member of group
      const membership = await prisma.groupMember.findFirst({
        where: {
          groupId: parseInt(groupId),
          userId
        }
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this group' });
      }

      const messages = await prisma.groupMessage.findMany({
        where: { groupId: parseInt(groupId) },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: 100
      });

      const formattedMessages = messages.map(msg => ({
        id: msg.id,
        message: msg.message,
        userId: msg.userId,
        userName: msg.user.name,
        userRole: msg.user.role,
        createdAt: msg.createdAt
      }));

      res.json(formattedMessages);
    } catch (error) {
      console.error('Get group messages error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Send group message
  static async sendGroupMessage(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }

      // Check if user is member of group
      const membership = await prisma.groupMember.findFirst({
        where: {
          groupId: parseInt(groupId),
          userId
        }
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this group' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, role: true }
      });

      // Get group details
      const group = await prisma.chatGroup.findUnique({
        where: { id: parseInt(groupId) },
        select: { 
          name: true,
          members: {
            where: {
              userId: { not: userId }
            },
            select: { userId: true }
          }
        }
      });

      const groupMessage = await prisma.groupMessage.create({
        data: {
          message: message.trim(),
          userId,
          groupId: parseInt(groupId)
        }
      });

      // Update group's updatedAt
      await prisma.chatGroup.update({
        where: { id: parseInt(groupId) },
        data: { updatedAt: new Date() }
      });

      // Create notifications for all group members except sender
      if (group && group.members.length > 0) {
        await prisma.notification.createMany({
          data: group.members.map(member => ({
            userId: member.userId,
            title: `New message in ${group.name}`,
            description: `${user.name}: ${message.trim().substring(0, 50)}${message.trim().length > 50 ? '...' : ''}`,
            type: 'group_chat',
            metadata: {
              groupId: parseInt(groupId),
              groupName: group.name,
              messageId: groupMessage.id,
              senderId: userId,
              senderName: user.name
            }
          }))
        });
      }

      res.status(201).json({
        id: groupMessage.id,
        message: groupMessage.message,
        userId: groupMessage.userId,
        userName: user.name,
        userRole: user.role,
        createdAt: groupMessage.createdAt
      });
    } catch (error) {
      console.error('Send group message error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get society members for group creation
  static async getSocietyMembers(req, res) {
    try {
      const userId = req.user.id;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { societyId: true, role: true }
      });

      if (!user || !user.societyId) {
        return res.status(400).json({ error: 'User not associated with any society' });
      }

      // Only RESIDENT can view members for group creation
      if (user.role !== 'RESIDENT') {
        return res.status(403).json({ error: 'Only residents can create groups' });
      }

      // Get only RESIDENTS from the same society
      const members = await prisma.user.findMany({
        where: {
          societyId: user.societyId,
          id: { not: userId }, // Exclude current user
          role: 'RESIDENT' // Only residents
        },
        select: {
          id: true,
          name: true,
          role: true,
          profileImg: true
        },
        orderBy: { name: 'asc' }
      });

      res.json(members);
    } catch (error) {
      console.error('Get society members error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete group (only group creator/admin)
  static async deleteGroup(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.params;

      const group = await prisma.chatGroup.findUnique({
        where: { id: parseInt(groupId) }
      });

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.createdById !== userId) {
        return res.status(403).json({ error: 'Only group creator can delete the group' });
      }

      await prisma.chatGroup.delete({
        where: { id: parseInt(groupId) }
      });

      res.json({ message: 'Group deleted successfully' });
    } catch (error) {
      console.error('Delete group error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = CommunityController;
