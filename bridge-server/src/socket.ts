import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { FileBridge } from './services/FileBridge';
import path from 'path';
import fs from 'fs';
import si from 'systeminformation';

// Default chat file path (can be overridden via environment variable)
const CHAT_FILE_PATH = process.env.CHAT_FILE_PATH ||
    path.resolve(__dirname, '../../mobile-chat.md');

let fileBridge: FileBridge | null = null;

export function getFileBridge(): FileBridge | null {
    return fileBridge;
}

export function setupSocket(io: Server): void {
    // Initialize FileBridge
    fileBridge = new FileBridge({ filePath: CHAT_FILE_PATH });
    fileBridge.startWatching();

    // Track the timestamp of the last sent agent message to avoid duplicates
    let lastSentAgentTimestamp: string | null = null;

    // When file changes (agent responded), broadcast to all clients
    fileBridge.on('fileChanged', async () => {
        console.log('📄 File changed, reading full content...');

        try {
            // Read the FULL file content to properly parse the last Agent message
            const fullContent = await fileBridge!.readContent();
            console.log('DEBUG: fullContent length:', fullContent.length);

            // Use position-based parsing instead of line-based (more reliable)
            // Find the LAST [Agent] tag
            const lastAgentPos = fullContent.lastIndexOf('[Agent]');

            if (lastAgentPos === -1) {
                console.log('⚠️ No agent message found in file');
                return;
            }

            // Extract timestamp from the [Agent] (HH:MM:SS): pattern
            const timestampMatch = fullContent.substring(lastAgentPos, lastAgentPos + 30).match(/\[Agent\]\s*\((\d{2}:\d{2}:\d{2})\):/);
            if (!timestampMatch) {
                console.log('⚠️ Could not parse Agent timestamp');
                return;
            }
            const lastAgentTimestamp = timestampMatch[1];

            // Find where the content starts (after the timestamp and colon)
            const contentStart = lastAgentPos + timestampMatch[0].length;

            // Find the next [User] or [Agent] tag (whichever comes first after current position)
            let contentEnd = fullContent.length;
            const nextUser = fullContent.indexOf('[User]', contentStart);
            const nextAgent = fullContent.indexOf('[Agent]', contentStart);

            if (nextUser !== -1) contentEnd = Math.min(contentEnd, nextUser);
            if (nextAgent !== -1) contentEnd = Math.min(contentEnd, nextAgent);

            // Extract and trim the content
            const content = fullContent.substring(contentStart, contentEnd).trim();

            console.log('DEBUG: Last Agent timestamp:', lastAgentTimestamp);
            console.log('DEBUG: Matched content length:', content.length);
            console.log('DEBUG: Content contains IMAGE:', content.includes('![IMAGE]'));
            console.log('DEBUG: Content contains data:', content.includes('data:image'));
            console.log('DEBUG: First 100 chars:', content.substring(0, 100));
            console.log('DEBUG: Last 100 chars:', content.substring(Math.max(0, content.length - 100)));

            // Only emit if this is a new message (different timestamp)
            if (lastAgentTimestamp !== lastSentAgentTimestamp) {
                lastSentAgentTimestamp = lastAgentTimestamp;

                io.emit('chat:receive', {
                    id: Date.now().toString(),
                    role: 'agent',
                    content: content,
                    timestamp: Date.now()
                });
                io.emit('agent:status', { status: 'idle' });
                console.log('✅ Message emitted to clients (timestamp:', lastAgentTimestamp + ')');
            } else {
                console.log('⏭️ Skipping duplicate message (same timestamp:', lastAgentTimestamp + ')');
            }
        } catch (error) {
            console.error('❌ Error reading file:', error);
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
        socket.on('chat:send', async (data: { content: string; image?: string }) => {
            console.log(`📨 Received from client: ${data.content.substring(0, 50)}... ${data.image ? '[Has Image]' : ''}`);

            let messageContent = data.content;

            // Handle Base64 Image
            if (data.image) {
                try {
                    // Expecting data:image/png;base64,xxxx...
                    const matches = data.image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                    if (matches) {
                        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                        const base64Data = matches[2];
                        const buffer = Buffer.from(base64Data, 'base64');
                        const filename = `img_${Date.now()}.${ext}`;
                        const filepath = path.join(__dirname, '../uploads', filename);

                        // Ensure uploads directory exists
                        if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
                            fs.mkdirSync(path.join(__dirname, '../uploads'));
                        }

                        fs.writeFileSync(filepath, buffer);
                        console.log(`💾 Saved image to: ${filepath}`);

                        // Append image tag to content
                        // Using relative path for runner to pick up
                        messageContent += `\n\n![IMAGE](uploads/${filename})`;
                    }
                } catch (e) {
                    console.error('❌ Failed to process base64 image:', e);
                    messageContent += '\n\n(Image upload failed)';
                }
            }

            // Write to file for Antigravity to read
            if (fileBridge) {
                await fileBridge.writeMessage(messageContent, 'user');
                console.log('📝 Written to file: mobile-chat.md');
            }

            // Notify client that message was received and waiting for agent
            socket.emit('agent:status', { status: 'thinking' });

            // Note: The actual response will come when the file changes
            // (when Antigravity writes back to the file)
        });

        // Handle voice audio
        socket.on('voice-audio', async (data: { audio: Buffer; mimeType: string; timestamp: number }) => {
            console.log(`🎤 Received voice audio: ${data.mimeType}, ${data.audio ? data.audio.byteLength : 0} bytes`);

            if (!fileBridge) return;

            try {
                // Determine extension
                let ext = 'webm';
                if (data.mimeType && data.mimeType.includes('mp4')) ext = 'mp4';
                else if (data.mimeType && data.mimeType.includes('aac')) ext = 'aac';
                else if (data.mimeType && data.mimeType.includes('wav')) ext = 'wav';

                const filename = `voice_${data.timestamp || Date.now()}.${ext}`;
                const filepath = path.join(__dirname, '../uploads', filename);

                // Ensure uploads directory exists
                if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
                    fs.mkdirSync(path.join(__dirname, '../uploads'));
                }

                fs.writeFileSync(filepath, data.audio);
                console.log(`💾 Saved voice file to: ${filepath}`);

                // Write special tag to chat file for runner.ts to pick up
                // Using a relative path for cleaner logs/markdown
                const relativePath = `uploads/${filename}`;

                // Just write the path tag, runner will pick it up
                await fileBridge.writeMessage(`<Voice-Data:${relativePath}>`, 'user');
                console.log('📝 Written voice tag to file');

                socket.emit('agent:status', { status: 'thinking' });

            } catch (err) {
                console.error('❌ Error handling voice data:', err);
                socket.emit('error', { message: 'Failed to process voice data' });
            }
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

    // --- System Monitoring (HUD) ---
    startSystemMonitoring(io);
}

let statsInterval: NodeJS.Timeout | null = null;

function startSystemMonitoring(io: Server) {
    if (statsInterval) clearInterval(statsInterval);

    console.log('⚡ Starting System HUD Monitoring...');

    statsInterval = setInterval(async () => {
        try {
            const [cpu, mem] = await Promise.all([
                si.currentLoad(),
                si.mem()
            ]);

            const stats = {
                cpu: {
                    load: Math.round(cpu.currentLoad),
                    cores: cpu.cpus.map(c => Math.round(c.load))
                },
                memory: {
                    total: mem.total,
                    used: mem.used,
                    percent: Math.round((mem.used / mem.total) * 100)
                },
                timestamp: Date.now()
            };

            io.emit('system_stats', stats);
        } catch (e) {
            console.error('Failed to fetch system stats:', e);
        }
    }, 2000);
}

// Cleanup function
export function cleanupSocket(): void {
    if (fileBridge) {
        fileBridge.stopWatching();
        fileBridge = null;
    }
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
}
