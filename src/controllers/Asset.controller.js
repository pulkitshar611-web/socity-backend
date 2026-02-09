const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// List all assets for a society
const getAll = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const assets = await prisma.asset.findMany({
      where: { societyId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: assets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single asset
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await prisma.asset.findUnique({ where: { id: parseInt(id) } });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    if (req.user.role !== 'SUPER_ADMIN' && asset.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: asset belongs to another society' });
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create asset
const create = async (req, res) => {
  try {
    const { name, category, value, purchaseDate, status } = req.body;
    const societyId = req.user.societyId;
    
    const asset = await prisma.asset.create({
      data: {
        name,
        category,
        value: parseFloat(value),
        purchaseDate: new Date(purchaseDate),
        status: status || 'ACTIVE',
        societyId
      }
    });
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update asset
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, value, purchaseDate, status } = req.body;
    
    const asset = await prisma.asset.update({
      where: { id: parseInt(id) },
      data: {
        name,
        category,
        value: value ? parseFloat(value) : undefined,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        status
      }
    });
    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete asset
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.asset.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: asset belongs to another society' });
    }
    await prisma.asset.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get asset statistics
const getStats = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const [total, totalValue] = await Promise.all([
      prisma.asset.count({ where: { societyId } }),
      prisma.asset.aggregate({
        where: { societyId },
        _sum: { value: true }
      })
    ]);
    res.json({
      success: true,
      data: {
        totalAssets: total,
        totalValue: totalValue._sum.value || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, update, remove, getStats };
