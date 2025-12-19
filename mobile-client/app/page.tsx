'use client';

import { Bot, Wifi, WifiOff } from 'lucide-react';
import ChatInput from '@/components/ChatInput';
import MessageList from '@/components/MessageList';
import AgentStatus from '@/components/AgentStatus';
import { useAgentSocket } from '@/hooks/useAgentSocket';

export default function Home() {
  const { messages, status, isConnected, sendMessage, uploadImage, sendAudio, stopAgent } = useAgentSocket();

  return (
    <main className="flex flex-col h-[100dvh] w-full max-w-md mx-auto relative bg-black/20 shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white/5 backdrop-blur-xl border-b border-white/5 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Antigravity</h1>
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <>
                  <Wifi size={10} className="text-green-400" />
                  <p className="text-[10px] text-green-400">Connected</p>
                </>
              ) : (
                <>
                  <WifiOff size={10} className="text-yellow-400" />
                  <p className="text-[10px] text-yellow-400">Connecting...</p>
                </>
              )}
            </div>
          </div>
        </div>

        <AgentStatus status={status} />
      </header>

      {/* Messages */}
      <MessageList messages={messages} />

      {/* Input */}
      <div className="z-10">
        <ChatInput
          onSend={sendMessage}
          onUploadImage={uploadImage}
          onSendAudio={sendAudio}
          isLoading={status === 'thinking' || status === 'acting'}
          onStop={stopAgent}
        />
      </div>
    </main>
  );
}
