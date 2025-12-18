import request from 'supertest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import app from '../src/app';
import { setupSocket } from '../src/socket';

describe('Bridge Server Integration', () => {
    let io: Server;
    let clientSocket: ClientSocket;
    let httpServer: ReturnType<typeof createServer>;
    let port: number;

    beforeAll((done) => {
        // 1. ExpressアプリをラップしたHTTPサーバーを作成
        httpServer = createServer(app);

        // 2. Socket.ioをアタッチ
        io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        setupSocket(io);

        // 3. テスト用ポートで起動
        httpServer.listen(() => {
            const address = httpServer.address() as AddressInfo;
            port = address.port;
            done();
        });
    });

    afterAll((done) => {
        // クリーンアップ
        io.close();
        clientSocket?.close();
        httpServer.close(done);
    });

    test('GET /health returns 200 OK', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
    });

    test('Socket client connects successfully', (done) => {
        clientSocket = Client(`http://localhost:${port}`);

        clientSocket.on('connect', () => {
            expect(clientSocket.connected).toBe(true);
            done();
        });

        clientSocket.on('connect_error', (err) => {
            done(err);
        });
    });

    test('Socket emits welcome message on connection', (done) => {
        const testClient = Client(`http://localhost:${port}`);

        testClient.on('welcome', (data: { message: string }) => {
            expect(data.message).toBe('Connected to Antigravity Bridge Server');
            testClient.close();
            done();
        });

        testClient.on('connect_error', (err) => {
            testClient.close();
            done(err);
        });
    });
});
