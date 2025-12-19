import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getFileBridge } from './socket';

const app: Express = express();

// Configure storage for Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Save to ../../uploads relative to src/app.ts
        const uploadDir = path.resolve(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
}));
app.use(express.json());

// Serve static files
app.use('/uploads', express.static(path.resolve(__dirname, '../../uploads'), {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

// Upload endpoint
app.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }

    try {
        const fileBridge = getFileBridge();
        if (fileBridge) {
            // Path relative to the project root (for mobile-chat.md)
            const relativePath = `uploads/${req.file.filename}`;

            await fileBridge.addImageMessage('画像を送信しました', relativePath, 'user');

            res.status(200).json({
                success: true,
                path: relativePath
            });
        } else {
            console.error('FileBridge unavailable');
            res.status(500).json({ error: 'Service unavailable' });
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default app;
