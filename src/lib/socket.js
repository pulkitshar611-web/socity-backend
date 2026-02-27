const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['https://socity.kiaantechnology.com', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room based on societyId to scope alerts
    socket.on('join-society', (societyId) => {
      socket.join(`society_${societyId}`);
      console.log(`Socket ${socket.id} joined society_${societyId}`);
    });

    socket.on('join-platform-admin', () => {
      socket.join('platform_admin');
      console.log(`Socket ${socket.id} joined platform_admin`);
    });

    socket.on('join-conversation', (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      console.log(`Socket ${socket.id} joined conversation_${conversationId}`);
    });

    socket.on('join-user', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`Socket ${socket.id} joined user_${userId}`);
      }
    });

    // --- WebRTC Signaling ---
    
    // Visitor starts a call to a resident (userId)
    socket.on('call-start', ({ toUserId, visitorName, visitorPhone, offer }) => {
      console.log(`[Socket] Call start from ${visitorName} to user_${toUserId}`);
      io.to(`user_${toUserId}`).emit('incoming-call', {
        fromSocketId: socket.id,
        visitorName,
        visitorPhone,
        offer
      });
    });

    // Resident answers the call
    socket.on('call-answer', ({ toSocketId, answer }) => {
      console.log(`[Socket] Call answer to ${toSocketId}`);
      io.to(toSocketId).emit('call-answered', { answer });
    });

    // Resident rejects or ends the call
    socket.on('call-rejected', ({ toSocketId }) => {
      io.to(toSocketId).emit('call-rejected');
    });

    // Signaling ICE Candidates
    socket.on('ice-candidate', ({ toUserId, toSocketId, candidate }) => {
      if (toUserId) {
        io.to(`user_${toUserId}`).emit('ice-candidate', { candidate });
      } else if (toSocketId) {
        io.to(toSocketId).emit('ice-candidate', { candidate });
      }
    });

    // Peer ends the call
    socket.on('call-end', ({ toUserId, toSocketId }) => {
      if (toUserId) {
        io.to(`user_${toUserId}`).emit('call-ended');
      } else if (toSocketId) {
        io.to(toSocketId).emit('call-ended');
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIO };
