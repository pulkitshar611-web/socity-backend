const prisma = require('../lib/prisma');

class NotificationController {
  /** List notifications for the logged-in user (own only) */
  static async list(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, unreadOnly } = req.query;

      const where = { userId: parseInt(userId) };
      if (unreadOnly === 'true' || unreadOnly === true) {
        where.read = false;
      }

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit) || 50, 100),
      });

      const unreadCount = await prisma.notification.count({
        where: { userId: parseInt(userId), read: false },
      });

      res.json({
        data: notifications,
        unreadCount,
      });
    } catch (error) {
      console.error('List Notifications Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /** Mark one notification as read (only if it belongs to this user) */
  static async markRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const n = await prisma.notification.findFirst({
        where: { id: parseInt(id), userId: parseInt(userId) },
      });
      if (!n) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      await prisma.notification.update({
        where: { id: parseInt(id) },
        data: { read: true },
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Mark Read Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /** Mark all notifications of the logged-in user as read */
  static async markAllRead(req, res) {
    try {
      const userId = req.user.id;

      await prisma.notification.updateMany({
        where: { userId: parseInt(userId) },
        data: { read: true },
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Mark All Read Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = NotificationController;
