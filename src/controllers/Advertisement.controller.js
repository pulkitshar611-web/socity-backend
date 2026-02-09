const prisma = require("../lib/prisma");
const cloudinary = require("../config/cloudinary");

class AdvertisementController {
  static async create(req, res) {
    try {
      const { title, content, linkUrl, type, targetAudience, startDate, endDate, isActive, displayOrder } = req.body;
      let finalImageUrl = req.body.imageUrl;

      // Parse isActive from string (FormData sends everything as strings)
      const isActiveBoolean = isActive === 'true' || isActive === true;

      // Handle image upload if file exists
      if (req.file) {
        try {
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'advertisements',
                resource_type: 'image'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(req.file.buffer);
          });
          finalImageUrl = result.secure_url;
        } catch (uploadError) {
          console.error('Cloudinary upload error:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }
      }

      const advertisement = await prisma.advertisement.create({
        data: {
          title,
          content,
          imageUrl: finalImageUrl,
          linkUrl,
          type: type || "BANNER",
          targetAudience: targetAudience || "ALL",
          isActive: isActiveBoolean,
          displayOrder: parseInt(displayOrder) || 0,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });
      res.status(201).json(advertisement);
    } catch (error) {
      console.error("Create Advertisement Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      const advertisements = await prisma.advertisement.findMany({
        orderBy: {
          displayOrder: 'asc'
        }
      });
      res.json(advertisements);
    } catch (error) {
      console.error("Get Advertisements Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getActive(req, res) {
    try {
      const now = new Date();
      const advertisements = await prisma.advertisement.findMany({
        where: {
          isActive: true,
          OR: [
            { startDate: null },
            { startDate: { lte: now } }
          ],
          AND: [
            {
              OR: [
                { endDate: null },
                { endDate: { gte: now } }
              ]
            }
          ]
        },
        orderBy: {
          displayOrder: 'asc'
        }
      });
      res.json(advertisements);
    } catch (error) {
      console.error("Get Active Advertisements Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { title, content, linkUrl, type, targetAudience, startDate, endDate, isActive, displayOrder } = req.body;
      let finalImageUrl = req.body.imageUrl;

      // Parse isActive from string (FormData sends everything as strings)
      const isActiveBoolean = isActive === 'true' || isActive === true;

      // Handle image upload if file exists
      if (req.file) {
        try {
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'advertisements',
                resource_type: 'image'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(req.file.buffer);
          });
          finalImageUrl = result.secure_url;
        } catch (uploadError) {
          console.error('Cloudinary upload error:', uploadError);
          return res.status(500).json({ error: 'Failed to upload image' });
        }
      }

      const advertisement = await prisma.advertisement.update({
        where: { id: parseInt(id) },
        data: {
          title,
          content,
          imageUrl: finalImageUrl,
          linkUrl,
          type,
          targetAudience,
          isActive: isActiveBoolean,
          displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : undefined,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });
      res.json(advertisement);
    } catch (error) {
      console.error("Update Advertisement Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await prisma.advertisement.delete({
        where: { id: parseInt(id) },
      });
      res.json({ message: "Advertisement deleted successfully" });
    } catch (error) {
      console.error("Delete Advertisement Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AdvertisementController;
