import { Server, Socket } from 'socket.io';
import path from 'path';
import { FileBridge } from './services/FileBridge';

// Default chat file path (can be overridden via environment variable)
const CHAT_FILE_PATH = process.env.CHAT_FILE_PATH ||
    path.resolve(__dirname, '../../mobile-chat.md');

let fileBridge: FileBridge | null = null;

export function setupSocket(io: Server): void {
    // Initialize FileBridge
    fileBridge = new FileBridge({ filePath: CHAT_FILE_PATH });
    fileBridge.startWatching();

    // When file changes (agent responded), broadcast to all clients
    fileBridge.on('fileChanged', (newContent: string) => {
        console.log('📄 File changed, broadcasting to clients');

        // Parse the new content to extract agent messages
        const agentMessageMatch = newContent.match(/\[Agent\].*?:\s*(.+)/);
        if (agentMessageMatch) {
            io.emit('chat:receive', {
                id: Date.now().toString(),
                role: 'agent',
                content: agentMessageMatch[1].trim(),
                timestamp: Date.now()
            });
            io.emit('agent:status', { status: 'idle' });
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Send welcome message
        socket.emit('welcome', {
            message: 'Connected to Antigravity Bridge Server'
        });

        // Send current chat history on connect
        if (fileBridge) {
            fileBridge.readContent().then((content) => {
                socket.emit('chat:history', { content });
            });
        }

        // Handle chat messages from client
        socket.on('chat:send', async (data: { content: string }) => {
            console.log(`📱 Received from mobile: ${data.content}`);

            // Write to file for Antigravity to read
            if (fileBridge) {
                await fileBridge.writeMessage(data.content, 'user');
                console.log('📝 Written to file: mobile-chat.md');
            }

            // Notify client that message was received and waiting for agent
            socket.emit('agent:status', { status: 'thinking' });

            // Note: The actual response will come when the file changes
            // (when Antigravity writes back to the file)
        });

        // Handle stop request
        socket.on('agent:stop', () => {
            console.log('Stop request received');
            socket.emit('agent:status', { status: 'idle' });
        });

        // Handle clear conversation request
        socket.on('chat:clear', async () => {
            if (fileBridge) {
                await fileBridge.clearConversation();
                socket.emit('chat:cleared');
            }
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    console.log(`📁 FileBridge initialized: ${CHAT_FILE_PATH}`);
}

// Cleanup function
export function cleanupSocket(): void {
    if (fileBridge) {
        fileBridge.stopWatching();
        fileBridge = null;
    }
}
