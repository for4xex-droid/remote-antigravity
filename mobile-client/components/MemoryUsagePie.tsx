import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
// Remove type imports for now to avoid errors if types file wasn't created
// import { MemoryUsage } from '@/types/agent';

// Define interface locally to ensure it works
interface MemoryUsagePieProps {
    memoryUsage: { totalMemory: number; usedMemory: number; percent?: number } | null;
    error: string | null;
}

const MemoryUsagePie: React.FC<MemoryUsagePieProps> = ({ memoryUsage, error }) => {
    const COLORS = ['#0088FE', '#00C49F'];

    if (error) {
        return <div className="text-red-500 text-xs">Error: {error}</div>;
    }

    if (!memoryUsage) {
        // Show spinner or placeholder
        return <div className="text-green-500/50 text-xs text-center p-4">WAITING FOR MEMORY DATA...</div>;
    }

    const data = [
        { name: 'Used', value: memoryUsage.usedMemory },
        { name: 'Free', value: memoryUsage.totalMemory - memoryUsage.usedMemory },
    ];

    return (
        <div className="w-full h-48 bg-black/40 rounded border border-green-500/20 p-2 mt-2">
            <h3 className="text-xs text-green-400 font-mono mb-2 border-b border-green-500/20 pb-1">MEMORY VISUALIZATION</h3>
            <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                    <Pie
                        dataKey="value"
                        isAnimationActive={true}
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={50}
                        fill="#8884d8"
                        paddingAngle={5}
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: '#000', borderColor: '#22c55e', color: '#22c55e', fontSize: '10px' }}
                        itemStyle={{ color: '#22c55e' }}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-green-500/70 px-4">
                <span>USED: {Math.round(memoryUsage.usedMemory / 1024 / 1024 / 1024 * 100) / 100} GB</span>
                <span>FREE: {Math.round((memoryUsage.totalMemory - memoryUsage.usedMemory) / 1024 / 1024 / 1024 * 100) / 100} GB</span>
            </div>
        </div>
    );
};

export default MemoryUsagePie;
