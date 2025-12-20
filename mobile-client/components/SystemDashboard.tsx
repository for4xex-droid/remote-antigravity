'use client';

import React, { useEffect, useState } from 'react';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Cpu, Zap, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import MemoryUsagePie from './MemoryUsagePie';

// Type for stats
interface SystemStats {
    cpu: {
        load: number;
        cores: number[];
    };
    memory: {
        total: number;
        used: number;
        percent: number;
    };
    timestamp: number;
}

export default function SystemDashboard() {
    const { socket } = useAgentSocket();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [history, setHistory] = useState<{ time: string; load: number }[]>([]);
    const [isLearning, setIsLearning] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.on('system_stats', (data: SystemStats) => {
            setStats(data);

            // Update graph history (keep last 20 points)
            setHistory(prev => {
                const newPoint = {
                    time: new Date(data.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
                    load: data.cpu.load
                };
                const newHistory = [...prev, newPoint];
                if (newHistory.length > 20) newHistory.shift();
                return newHistory;
            });
        });

        // Listen for RAG learning events if we implement them later in socket.ts broadcast
        // For now we simulate "learning" if load spikes > 80%? Or maybe just keep it simple.

        return () => {
            socket.off('system_stats');
        };
    }, [socket]);

    // Initial loading state
    if (!stats) {
        return (
            <div className="w-full bg-black/80 backdrop-blur-md p-4 text-green-500/50 font-mono text-xs border-b border-green-500/30">
                <div className="flex items-center gap-2 animate-pulse">
                    <Activity size={14} />
                    <span>INITIALIZING HUD... WAITING FOR DATA LINK...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full bg-black/80 backdrop-blur-md border-b border-green-500/30 p-4 text-green-400 font-mono text-xs shadow-[0_0_20px_rgba(34,197,94,0.1)] mb-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="animate-pulse" />
                    <span className="uppercase tracking-widest font-bold">System Status</span>
                </div>
                <div className="flex gap-4">
                    <span className={clsx("flex items-center gap-1", stats.cpu.load > 80 ? "text-red-500 animate-pulse" : "text-green-400")}>
                        <Cpu size={12} />
                        CPU: {stats.cpu.load}%
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                        <Zap size={12} />
                        MEM: {stats.memory.percent}%
                    </span>
                </div>
            </div>

            {/* Graph Area */}
            <div className="h-24 w-full relative bg-green-900/10 rounded border border-green-500/20 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                        <defs>
                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#000', borderColor: '#22c55e', color: '#22c55e' }}
                            itemStyle={{ color: '#22c55e' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="load"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorCpu)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>

                {/* Tech Deco Lines */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-green-500/10"></div>
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-green-500/10"></div>
                <div className="absolute top-0 left-0 h-full w-[1px] bg-green-500/10"></div>
                <div className="absolute top-0 right-0 h-full w-[1px] bg-green-500/10"></div>
            </div>

            {/* Command Shortcuts (Mission I: UX Polish) */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('insert-command', { detail: '/dev ' }))}
                    className="bg-green-900/20 border border-green-500/30 text-green-400 text-[10px] py-1 px-2 rounded hover:bg-green-500/20 transition-colors uppercase"
                >
                    🚀 /dev [Task]
                </button>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('insert-command', { detail: '/mode vision' }))}
                    className="bg-blue-900/20 border border-blue-500/30 text-blue-400 text-[10px] py-1 px-2 rounded hover:bg-blue-500/20 transition-colors uppercase"
                >
                    👁️ /mode vision
                </button>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('insert-command', { detail: '/run ' }))}
                    className="bg-red-900/20 border border-red-500/30 text-red-400 text-[10px] py-1 px-2 rounded hover:bg-red-500/20 transition-colors uppercase"
                >
                    ⚡ /run [Cmd]
                </button>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('insert-command', { detail: '/yes' }))}
                    className="bg-yellow-900/20 border border-yellow-500/30 text-yellow-400 text-[10px] py-1 px-2 rounded hover:bg-yellow-500/20 transition-colors uppercase"
                >
                    👍 /yes
                </button>
            </div>

            {/* RAG Status (Simulated or Real) */}
            <div className="mt-2 flex justify-between text-[10px] text-green-500/50">
                <span>RAG ENGINE: ONLINE</span>
                <span>PORT: 8001</span>
            </div>
        </div>
    );
}
