const prisma = require('../lib/prisma');

class ServiceVariantController {
  static async create(req, res) {
    try {
      const { name, price, description, categoryId } = req.body;
      const variant = await prisma.serviceVariant.create({
        data: {
          name,
          price,
          description,
          categoryId
        }
      });
      res.status(201).json(variant);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
   
  // Usually variants are managed via Category updates, but standalone CRUD is good practice.
  static async update(req, res) {
      try {
          const { id } = req.params;
          const variant = await prisma.serviceVariant.update({
              where: { id },
              data: req.body
          });
          res.json(variant);
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }

  static async delete(req, res) {
      try {
          const { id } = req.params;
          await prisma.serviceVariant.delete({ where: { id } });
          res.json({ message: 'Variant deleted' });
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }
}

module.exports = ServiceVariantController;
