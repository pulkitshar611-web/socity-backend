const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cloudinary = require('../config/cloudinary');

// List all documents for a society
const getAll = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const { category } = req.query;

    const where = { societyId };
    if (category) where.category = category;

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single document
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    if (req.user.role !== 'SUPER_ADMIN' && document.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: document belongs to another society' });
    }
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create document
const create = async (req, res) => {
  try {
    const { title, category, visibility, file } = req.body;
    const societyId = req.user.societyId;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(file, {
      folder: `society_${societyId}/documents`,
      resource_type: 'auto'
    });

    const document = await prisma.document.create({
      data: {
        title,
        category,
        visibility: visibility || 'all',
        fileUrl: uploadResult.secure_url,
        size: (uploadResult.bytes / 1024 / 1024).toFixed(2) + ' MB',
        type: uploadResult.format,
        societyId
      }
    });
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete document
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Document not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: document belongs to another society' });
    }
    await prisma.document.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, remove };
