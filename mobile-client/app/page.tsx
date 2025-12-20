'use client';

import ChatInput from '../components/ChatInput';
import MessageList from '../components/MessageList';
import AgentStatus from '../components/AgentStatus';
import { useAgentSocket } from '../hooks/useAgentSocket';
import SystemDashboard from '../components/SystemDashboard';

export default function Home() {
    const { messages, status, isConnected, sendMessage, sendAudio } = useAgentSocket();

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans supports-[height:100dvh]:h-[100dvh]">
            {/* Header */}
            <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 shadow-sm flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
                    Antigravity
                </h1>
                <AgentStatus status={status} />
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative flex flex-col w-full max-w-3xl mx-auto">
                <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">

                    {/* Widget Area */}
                    <div className="w-full">
                        <SystemDashboard />
                    </div>                    {/* Chat Messages */}
                    <MessageList messages={messages} />
                </div>
            </main>

            {/* Footer / Input Area */}
            <footer className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md w-full max-w-3xl mx-auto pb-[env(safe-area-inset-bottom)] md:pb-4">
                <ChatInput
                    onSend={sendMessage}
                    onSendAudio={sendAudio}
                    isLoading={status === 'thinking'}
                    isConnected={isConnected}
                />
            </footer>
        </div>
    );
}