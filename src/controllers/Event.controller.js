const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// List all events for a society
const getAll = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const events = await prisma.event.findMany({
      where: { societyId },
      include: {
        _count: {
          select: { rsvps: { where: { status: 'RSVP' } } }
        },
        rsvps: {
          where: { userId: req.user.id },
          select: { status: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    const formattedEvents = events.map(event => ({
      ...event,
      attendees: event._count.rsvps,
      isRsvp: event.rsvps.length > 0 && event.rsvps[0].status === 'RSVP'
    }));

    res.json({ success: true, data: formattedEvents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single event
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: { select: { rsvps: { where: { status: 'RSVP' } } } },
        rsvps: { where: { userId: req.user.id }, select: { status: true } }
      }
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (req.user.role !== 'SUPER_ADMIN' && event.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: event belongs to another society' });
    }

    const formattedEvent = {
      ...event,
      attendees: event._count.rsvps,
      isRsvp: event.rsvps.length > 0 && event.rsvps[0].status === 'RSVP'
    };

    res.json({ success: true, data: formattedEvent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create event
const create = async (req, res) => {
  try {
    const { title, description, date, time, location, category, maxAttendees, organizer } = req.body;
    const societyId = req.user.societyId;

    const event = await prisma.event.create({
      data: {
        title,
        description,
        date: new Date(date),
        time,
        location,
        category,
        maxAttendees: parseInt(maxAttendees || 0),
        organizer,
        societyId
      }
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update event
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, time, location, category, status, maxAttendees, organizer } = req.body;

    const event = await prisma.event.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        date: date ? new Date(date) : undefined,
        time,
        location,
        category,
        status,
        maxAttendees: maxAttendees !== undefined ? parseInt(maxAttendees) : undefined,
        organizer
      }
    });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get attendees for an event (Admin only preferably, or restricted info for residents)
const getAttendees = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await prisma.event.findUnique({ where: { id: parseInt(id) } });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (req.user.role !== 'SUPER_ADMIN' && event.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: event belongs to another society' });
    }
    const attendees = await prisma.eventRsvp.findMany({
      where: {
        eventId: parseInt(id),
        status: 'RSVP'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImg: true,
            phone: true
          }
        }
      }
    });

    res.json({ success: true, data: attendees.map(a => a.user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// RSVP for event
const rsvp = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // RSVP or CANCELLED
    const userId = req.user.id;

    const eventRsvp = await prisma.eventRsvp.upsert({
      where: {
        eventId_userId: {
          eventId: parseInt(id),
          userId: userId
        }
      },
      update: { status: status || 'RSVP' },
      create: {
        eventId: parseInt(id),
        userId: userId,
        status: status || 'RSVP'
      }
    });

    res.json({ success: true, data: eventRsvp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete event
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.event.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Event not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: event belongs to another society' });
    }
    await prisma.event.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, update, remove, rsvp, getAttendees };
