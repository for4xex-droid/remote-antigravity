'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '@/types/agent';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://emerald-zope-branches-netscape.trycloudflare.com';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'error';

interface UseAgentSocketReturn {
    messages: Message[];
    status: AgentStatus;
    isConnected: boolean;
    sendMessage: (content: string) => void;
    stopAgent: () => void;
}

export function useAgentSocket(): UseAgentSocketReturn {
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Create socket connection
        const socket = io(BRIDGE_URL, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
            setIsConnected(true);
            console.log('Connected to Bridge Server');
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('Disconnected from Bridge Server');
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setStatus('error');
        });

        // Chat events
        socket.on('chat:receive', (message: Message) => {
            setMessages((prev) => [...prev, message]);
        });

        // Status events
        socket.on('agent:status', (data: { status: AgentStatus }) => {
            setStatus(data.status);
        });

        // Welcome message
        socket.on('welcome', (data: { message: string }) => {
            console.log('Server:', data.message);
        });

        // Cleanup on unmount (important for React Strict Mode)
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const sendMessage = useCallback((content: string) => {
        if (!content.trim()) return;

        // Add user message to local state immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: content.trim(),
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Send to server
        socketRef.current?.emit('chat:send', {
            content: content.trim(),
        });

        // Update status locally as well
        setStatus('thinking');
    }, []);

    const stopAgent = useCallback(() => {
        socketRef.current?.emit('agent:stop');
        setStatus('idle');
    }, []);

    return {
        messages,
        status,
        isConnected,
        sendMessage,
        stopAgent,
    };
}
