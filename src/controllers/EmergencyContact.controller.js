const prisma = require('../lib/prisma');

class EmergencyContactController {
  static async listContacts(req, res) {
    try {
      const societyId = req.user.societyId;
      const contacts = await prisma.emergencyContact.findMany({
        where: { societyId },
        orderBy: [
          { category: 'asc' },
          { name: 'asc' }
        ]
      });
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addContact(req, res) {
    try {
      const { name, phone, category } = req.body;
      const societyId = req.user.societyId;

      const contact = await prisma.emergencyContact.create({
        data: {
          name,
          phone,
          category,
          societyId,
          available: true
        }
      });

      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateContact(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, category, available } = req.body;

      const contact = await prisma.emergencyContact.update({
        where: { id: parseInt(id) },
        data: {
          name,
          phone,
          category,
          available,
          updatedAt: new Date()
        }
      });

      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteContact(req, res) {
    try {
      const { id } = req.params;

      await prisma.emergencyContact.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = EmergencyContactController;
