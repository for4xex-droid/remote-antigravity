'use client';

import React from 'react';
import { Bot, Loader2, Play, AlertCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export type AgentStatusType = 'idle' | 'thinking' | 'acting' | 'error';

interface AgentStatusProps {
    status: AgentStatusType;
}

export default function AgentStatus({ status }: AgentStatusProps) {
    const config = {
        idle: {
            text: 'Ready',
            icon: Bot,
            color: 'text-gray-400',
            bg: 'bg-gray-500/10',
            border: 'border-white/10',
            iconClass: '',
            containerClass: '',
            ariaLabel: 'Standby icon'
        },
        thinking: {
            text: 'Thinking...',
            icon: Loader2,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20',
            iconClass: 'animate-spin',
            containerClass: '',
            ariaLabel: 'Processing icon'
        },
        acting: {
            text: 'Executing...',
            icon: Play,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
            iconClass: '',
            containerClass: 'animate-pulse',
            ariaLabel: 'Tool icon'
        },
        error: {
            text: 'Error',
            icon: AlertCircle,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            border: 'border-red-500/20',
            iconClass: '',
            containerClass: '',
            ariaLabel: 'Alert icon'
        }
    };

    const current = config[status];
    const Icon = current.icon;

    return (
        <div
            role="status"
            className={twMerge(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all duration-300",
                current.color,
                current.bg,
                current.border,
                current.containerClass
            )}
        >
            <Icon
                size={16}
                className={current.iconClass}
                aria-label={current.ariaLabel}
            />
            <span className="text-sm font-medium tracking-wide">
                {current.text}
            </span>
        </div>
    );
}
