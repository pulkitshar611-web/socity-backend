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
      const room = `society_${societyId}`;
      socket.join(room);
      console.log(`[Socket] Client ${socket.id} joined room: ${room}`);
    });

    socket.on('join-platform-admin', () => {
      socket.join('platform_admin');
      console.log(`[Socket] Client ${socket.id} joined room: platform_admin`);
    });

    socket.on('join-user', (userId) => {
      if (userId) {
        const room = `user_${userId}`;
        socket.join(room);
        console.log(`[Socket] Client ${socket.id} joined room: ${room}`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] User disconnected: ${socket.id} (Reason: ${reason})`);
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
