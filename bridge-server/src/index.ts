import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { setupSocket } from './socket';

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        // "*" for testing via Quick Tunnel. Replace with specific domain in production.
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 2e7 // 20MB for large screenshots
});

setupSocket(io);

httpServer.listen(PORT, () => {
    console.log(`🚀 Bridge Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io ready for connections`);
});

export { httpServer, io };
