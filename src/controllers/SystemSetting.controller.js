const prisma = require('../lib/prisma');

class SettingController {
  static async getSettings(req, res) {
    try {
      const settings = await prisma.systemSetting.findMany();
      // Format as an object
      const formattedSettings = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(formattedSettings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateSettings(req, res) {
    try {
      const settingsData = req.body; // { key: value, ... }
      const updates = Object.entries(settingsData).map(([key, value]) => 
        prisma.systemSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) }
        })
      );
      await Promise.all(updates);
      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SettingController;
