import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface FileBridgeOptions {
    filePath: string;
    debounceMs?: number;
}

export class FileBridge extends EventEmitter {
    private filePath: string;
    private watcher: fs.FSWatcher | null = null;
    private debounceMs: number;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastContent: string = '';

    constructor(options: FileBridgeOptions) {
        super();
        this.filePath = options.filePath;
        this.debounceMs = options.debounceMs || 100;

        // Ensure file exists
        this.ensureFileExists();
    }

    private ensureFileExists(): void {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, this.getInitialContent(), 'utf8');
        }
        this.lastContent = fs.readFileSync(this.filePath, 'utf8');
    }

    private getInitialContent(): string {
        return `# Mobile Chat Interface

このファイルは、モバイルブリッジとAntigravityエージェント間の通信インターフェースです。

---

## 会話ログ

`;
    }

    /**
     * Write a message from mobile to the file
     */
    async writeMessage(message: string, sender: 'user' | 'agent' = 'user'): Promise<void> {
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const prefix = sender === 'user' ? '[User]' : '[Agent]';
        const content = `\n${prefix} (${timestamp}): ${message}\n`;

        await fs.promises.appendFile(this.filePath, content, 'utf8');
        this.lastContent = await fs.promises.readFile(this.filePath, 'utf8');
    }

    /**
     * Write an image message from mobile to the file
     */
    async addImageMessage(message: string, imagePath: string, sender: 'user' | 'agent' = 'user'): Promise<void> {
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const prefix = sender === 'user' ? '[User]' : '[Agent]';
        // Embedding the image path in markdown format
        // Also keeping the text message if provided
        const content = `\n${prefix} (${timestamp}): ${message}\n![IMAGE](${imagePath})\n`;

        await fs.promises.appendFile(this.filePath, content, 'utf8');
        this.lastContent = await fs.promises.readFile(this.filePath, 'utf8');
    }

    /**
     * Read the current file content
     */
    async readContent(): Promise<string> {
        return fs.promises.readFile(this.filePath, 'utf8');
    }

    /**
     * Get new content since last read (diff)
     */
    async getNewContent(): Promise<string> {
        const currentContent = await this.readContent();
        const newPart = currentContent.slice(this.lastContent.length);
        this.lastContent = currentContent;
        return newPart;
    }

    /**
     * Start watching the file for changes
     */
    startWatching(): void {
        if (this.watcher) {
            return; // Already watching
        }

        console.log(`📁 FileBridge: Watching ${this.filePath}`);

        this.watcher = fs.watch(this.filePath, (eventType) => {
            if (eventType === 'change') {
                // Debounce to avoid multiple rapid events
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = setTimeout(async () => {
                    const newContent = await this.getNewContent();
                    if (newContent.trim()) {
                        this.emit('fileChanged', newContent);
                    }
                }, this.debounceMs);
            }
        });

        this.watcher.on('error', (error) => {
            console.error('FileBridge watch error:', error);
            this.emit('error', error);
        });
    }

    /**
     * Stop watching the file
     */
    stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        console.log('📁 FileBridge: Stopped watching');
    }

    /**
     * Clear the conversation log (keep header)
     */
    async clearConversation(): Promise<void> {
        await fs.promises.writeFile(this.filePath, this.getInitialContent(), 'utf8');
        this.lastContent = this.getInitialContent();
    }
}
