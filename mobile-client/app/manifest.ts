import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Antigravity Link',
        short_name: 'Antigravity',
        description: 'AI Agent Command Center',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
            {
                src: 'https://api.iconify.design/lucide:zap.svg?color=%2322c55e', // Temporary Zap icon
                sizes: 'any',
                type: 'image/svg+xml',
            },
        ],
    }
}
