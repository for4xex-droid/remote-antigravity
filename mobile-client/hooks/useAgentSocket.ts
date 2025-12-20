'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '@/types/agent';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://socket.motista.online';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'error';

interface UseAgentSocketReturn {
    messages: Message[];
    status: AgentStatus;
    isConnected: boolean;
    sendMessage: (content: string, image?: string | null) => void;
    uploadImage: (file: File) => Promise<void>;
    sendAudio: (blob: Blob, mimeType: string) => void;
    stopAgent: () => void;
    socket: Socket | null;
}

export function useAgentSocket(): UseAgentSocketReturn {
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Create socket connection
        const newSocket = io(BRIDGE_URL, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        // Connection events
        newSocket.on('connect', () => {
            setIsConnected(true);
            console.log('Connected to Bridge Server');
        });

        newSocket.on('disconnect', () => {
            setIsConnected(false);
            console.log('Disconnected from Bridge Server');
        });

        newSocket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setStatus('error');
        });

        // Chat events
        newSocket.on('chat:receive', (message: Message) => {
            console.log('📩 chat:receive event:', {
                id: message.id,
                role: message.role,
                contentLength: message.content?.length || 0,
                contentPreview: message.content?.substring(0, 100),
                hasImage: message.content?.includes('![IMAGE]'),
                hasDataUri: message.content?.includes('data:image')
            });
            setMessages((prev) => [...prev, message]);
        });

        // Status events
        newSocket.on('agent:status', (data: { status: AgentStatus }) => {
            setStatus(data.status);
        });

        // Welcome message
        newSocket.on('welcome', (data: { message: string }) => {
            console.log('Server:', data.message);
        });

        // Cleanup on unmount (important for React Strict Mode)
        return () => {
            newSocket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const sendMessage = useCallback((content: string, image?: string | null) => {
        if (!content.trim() && !image) return;

        // Add user message to local state immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: image ? content + (content ? '\n\n' : '') + '![IMAGE](Uploading...)' : content.trim(),
            timestamp: Date.now(),
        };
        // Ideally we would show the base64 preview here, but for simplicity just showing text placeholder
        // or we could stick the base64 in the content if the Message type supports it or if it's just markdown

        if (image) {
            // For local preview, we can just append an img tag with base64? 
            // Markdown render might support it. But let's just keep it simple.
            userMessage.content = content + (content ? '\n\n' : '') + `![IMAGE](${image})`;
        }

        setMessages((prev) => [...prev, userMessage]);

        // Send to server
        socketRef.current?.emit('chat:send', {
            content: content.trim(),
            image: image // Send base64
        });

        // Update status locally as well
        setStatus('thinking');
    }, []);

    // ... (rest of functions)

    const stopAgent = useCallback(() => {
        socketRef.current?.emit('agent:stop');
        setStatus('idle');
    }, []);

    const uploadImage = useCallback(async (file: File) => {
        // ... (existing implementation)
        if (!BRIDGE_URL) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${BRIDGE_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const newMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: '画像を送信しました 📷',
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, newMessage]);

            setStatus('idle');
        } catch (error) {
            console.error('Upload error:', error);
        }
    }, []);

    const sendAudio = useCallback((audioBlob: Blob, mimeType: string) => {
        socketRef.current?.emit('voice-audio', {
            audio: audioBlob,
            mimeType: mimeType,
            timestamp: Date.now()
        });

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: '🎤 音声を送信しました...',
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
        setStatus('thinking');
    }, []);

    return {
        messages,
        status,
        isConnected,
        socket, // Export socket
        sendMessage,
        uploadImage,
        sendAudio,
        stopAgent,
    };
}
