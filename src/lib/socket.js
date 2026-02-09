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
