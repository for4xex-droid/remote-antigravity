'use client';

import React, { useRef, useState, KeyboardEvent, useEffect } from 'react';
import { Send, Square, Paperclip, Mic } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ChatInputProps {
    onSend: (message: string, image?: string | null) => void;
    onUploadImage?: (file: File) => Promise<void>;
    onSendAudio?: (blob: Blob, mimeType: string) => void;
    isLoading: boolean;
    onStop?: () => void;
    placeholder?: string;
    isConnected?: boolean;
}

export default function ChatInput({
    onSend,
    onUploadImage,
    onSendAudio,
    isLoading,
    onStop,
    placeholder = 'Type a message...',
    isConnected = true,
}: ChatInputProps) {
    const [input, setInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Short-cut command listener
    useEffect(() => {
        const handleCommand = (e: any) => {
            const cmd = e.detail;
            if (cmd === '/yes') {
                // Immediate send for /yes
                onSend(cmd, null);
            } else {
                // Append or set for others
                setInput(prev => prev + cmd);
                textareaRef.current?.focus();
            }
        };
        window.addEventListener('insert-command', handleCommand);
        return () => window.removeEventListener('insert-command', handleCommand);
    }, [onSend]);

    const handleSubmit = async () => {
        if (!input.trim() && !selectedImage) return;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
        }

        onSend(input, selectedImage);
        setInput('');
        setSelectedImage(null);
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Voice Recording Logic
    const startRecording = async (e: React.MouseEvent | React.TouchEvent) => {
        // e.preventDefault(); // Prevent text selection etc - but might block click on mobile?
        // Let's rely on event types.

        if (isRecording) return; // Already recording

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Auto-detect supported MIME type (for iOS compatibility)
            // Safari prefers audio/mp4 or audio/aac, Chrome prefers audio/webm
            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                    mimeType = 'audio/aac';
                } else {
                    console.warn('No standard audio MIME type supported, trying default');
                    mimeType = ''; // Let browser choose default
                }
            }

            const options = mimeType ? { mimeType } : undefined;
            const mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log(`Recording started (${mediaRecorder.mimeType})...`);

            if (navigator.vibrate) navigator.vibrate(50); // Feedback

        } catch (err) {
            console.error("Mic Error:", err);
            alert("マイクの使用を許可してください（iOSの場合はSafariの設定を確認）");
        }
    };

    const stopRecording = (e: React.MouseEvent | React.TouchEvent) => {
        // e.preventDefault();

        if (!isRecording || !mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

        const mediaRecorder = mediaRecorderRef.current;
        mediaRecorder.stop();
        setIsRecording(false);

        mediaRecorder.onstop = () => {
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

            console.log(`Sending audio: ${audioBlob.size} bytes, Type: ${mimeType}`);

            if (onSendAudio) {
                onSendAudio(audioBlob, mimeType);
            }

            // Stop all tracks
            mediaRecorder.stream.getTracks().forEach(track => track.stop());

            if (navigator.vibrate) navigator.vibrate([50, 50]); // Success feedback
        };
    };

    return (
        <div className="w-full bg-white/10 backdrop-blur-md border-t border-white/10 p-4 pb-safe-area-bottom">
            <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                />

                {/* Image Preview */}
                {selectedImage && (
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/80 backdrop-blur rounded-lg border border-white/10">
                        <div className="relative">
                            <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded object-cover" />
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white hover:bg-red-600"
                            >
                                <Square size={12} fill="currentColor" />
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all duration-200 active:scale-95"
                    aria-label="Upload image"
                >
                    <Paperclip size={20} />
                </button>

                <div className="relative flex-1 bg-black/20 rounded-2xl overflow-hidden border border-white/5 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                    <TextareaAutosize
                        ref={textareaRef}
                        minRows={1}
                        maxRows={5}
                        placeholder={isRecording ? "Recording..." : placeholder}
                        className="w-full bg-transparent text-white px-4 py-3 outline-none resize-none text-[16px] leading-6 placeholder:text-white/30"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isRecording}
                    />
                </div>

                {/* Mic Button - Visible when input is empty and no image selected */}
                {!input.trim() && !selectedImage && !isLoading && (
                    <button
                        onMouseDown={startRecording}
                        onTouchStart={startRecording}
                        onMouseUp={stopRecording}
                        onTouchEnd={stopRecording}
                        onMouseLeave={stopRecording} // If mouse drags out
                        className={clsx(
                            "p-3 rounded-full transition-all duration-200 transform shadow-lg active:scale-95 select-none",
                            isRecording
                                ? "bg-red-500 text-white animate-pulse shadow-red-500/30 scale-110"
                                : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                        )}
                        aria-label="Voice input"
                        title="Hold to speak"
                    >
                        <Mic size={20} className={isRecording ? "animate-bounce" : ""} />
                    </button>
                )}

                {input.trim() || selectedImage ? (
                    <button
                        onClick={handleSubmit}
                        className="p-3 rounded-full transition-all duration-200 transform bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 hover:bg-blue-500"
                        aria-label="Send message"
                    >
                        <Send size={20} />
                    </button>
                ) : isLoading && !isRecording ? (
                    <button
                        onClick={onStop}
                        disabled={!onStop}
                        className="p-3 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 disabled:opacity-50 transform hover:scale-105 active:scale-95"
                        aria-label="Stop generating"
                    >
                        <Square size={20} fill="currentColor" />
                    </button>
                ) : null}
            </div>
        </div>
    );
}
