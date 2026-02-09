const prisma = require('../lib/prisma');

class SessionController {
  static async listSessions(req, res) {
    try {
      const sessions = await prisma.userSession.findMany({
        include: {
          user: {
            include: {
              society: true
            }
          }
        },
        orderBy: { lastActive: 'desc' }
      });

      const formattedSessions = sessions.map(s => ({
        id: s.id,
        user: s.user.name,
        society: s.user.society?.name || 'N/A',
        device: s.device,
        ip: s.ipAddress,
        lastActive: s.lastActive
      }));

      res.json(formattedSessions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async terminateSession(req, res) {
    try {
      const { id } = req.params;
      await prisma.userSession.delete({
        where: { id: parseInt(id) }
      });
      res.json({ message: 'Session terminated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async terminateAll(req, res) {
    try {
      await prisma.userSession.deleteMany({});
      res.json({ message: 'All sessions terminated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SessionController;
