'use client';

import React, { useRef, useState, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ChatInputProps {
    onSend: (message: string) => void;
    isLoading: boolean;
    onStop?: () => void;
    placeholder?: string;
}

export default function ChatInput({
    onSend,
    isLoading,
    onStop,
    placeholder = 'Type a message...',
}: ChatInputProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = async () => {
        if (!input.trim() || isLoading) return;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
        }

        onSend(input);
        setInput('');
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="w-full bg-white/10 backdrop-blur-md border-t border-white/10 p-4 pb-safe-area-bottom">
            <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
                <div className="relative flex-1 bg-black/20 rounded-2xl overflow-hidden border border-white/5 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                    <TextareaAutosize
                        ref={textareaRef}
                        minRows={1}
                        maxRows={5}
                        placeholder={placeholder}
                        className="w-full bg-transparent text-white px-4 py-3 outline-none resize-none text-[16px] leading-6 placeholder:text-white/30"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                    />
                </div>

                {isLoading ? (
                    <button
                        onClick={onStop}
                        disabled={!onStop}
                        className="p-3 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 disabled:opacity-50 transform hover:scale-105 active:scale-95"
                        aria-label="Stop generating"
                    >
                        <Square size={20} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={!input.trim()}
                        className={twMerge(
                            "p-3 rounded-full transition-all duration-200 transform",
                            input.trim()
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 hover:bg-blue-500"
                                : "bg-white/5 text-white/20 cursor-not-allowed"
                        )}
                        aria-label="Send message"
                    >
                        <Send size={20} />
                    </button>
                )}
            </div>
        </div>
    );
}
