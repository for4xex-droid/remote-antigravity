'use client';

import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Message } from '@/types/agent';
import { Bot, User } from 'lucide-react';

interface MessageListProps {
    messages: Message[];
}

export default function MessageList({ messages }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div role="list" className="flex-1 w-full flex flex-col gap-4 p-4 overflow-y-auto overflow-x-hidden pb-32">
            {messages.map((message, index) => {
                const isUser = message.role === 'user';
                return (
                    <div
                        key={message.id}
                        className={clsx(
                            "flex w-full animate-fade-in",
                            isUser ? "justify-end" : "justify-start"
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <div className={clsx(
                            "flex gap-3 max-w-[85%] md:max-w-[75%]",
                            isUser ? "flex-row-reverse" : "flex-row"
                        )}>
                            {/* Avatar */}
                            <div className={clsx(
                                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border border-white/10",
                                isUser ? "bg-blue-600" : "bg-purple-600"
                            )}>
                                {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                            </div>

                            {/* Message Body */}
                            <div className={twMerge(
                                "relative px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm break-words overflow-hidden",
                                isUser
                                    ? "bg-blue-600 text-white rounded-tr-sm"
                                    : "bg-white/10 text-gray-100 rounded-tl-sm backdrop-blur-md border border-white/5"
                            )}>
                                <div className="whitespace-pre-wrap">
                                    {message.content}
                                </div>

                                {/* Timestamp */}
                                <div className="text-[10px] opacity-40 mt-1 text-right">
                                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
