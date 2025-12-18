export type Role = 'user' | 'agent' | 'system';

export interface Message {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
    type?: 'text' | 'tool_use' | 'error';
}
