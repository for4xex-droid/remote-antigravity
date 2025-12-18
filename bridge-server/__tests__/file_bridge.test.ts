import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// テスト用の一時ファイルパス
const TEST_FILE_PATH = path.join(__dirname, 'test-mobile-chat.md');

// モック用のFileBridgeクラス（実際の実装イメージに合わせて簡易定義）
// ※実際の実装時は別ファイルからimportしますが、ここではテスト内で定義して動作検証します
class FileBridge extends EventEmitter {
    private filePath: string;
    private watcher: fs.FSWatcher | null = null;

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
    }

    // スマホからのメッセージをファイルに追記/上書き
    async writeMessage(message: string): Promise<void> {
        // タイムスタンプ付きで追記するイメージ
        const content = `\n[User]: ${message}\n`;
        await fs.promises.appendFile(this.filePath, content, 'utf8');
    }

    // ファイル監視を開始
    startWatching(): void {
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, '', 'utf8');
        }

        // fs.watchで変更を検知
        this.watcher = fs.watch(this.filePath, (eventType, filename) => {
            if (eventType === 'change') {
                // 変更を検知したらイベント発行
                // ※実際にはファイルの中身を読み取って差分を送る等の処理が入る
                this.emit('fileChanged', filename);
            }
        });
    }

    stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}

describe('FileBridge Integration', () => {
    let bridge: FileBridge;

    // テスト前の準備: 空のファイルを作成
    beforeEach(() => {
        fs.writeFileSync(TEST_FILE_PATH, '', 'utf8');
        bridge = new FileBridge(TEST_FILE_PATH);
    });

    // テスト後の後始末: ファイル削除と監視停止
    afterEach(() => {
        bridge.stopWatching();
        if (fs.existsSync(TEST_FILE_PATH)) {
            fs.unlinkSync(TEST_FILE_PATH);
        }
    });

    test('should write message to the file', async () => {
        const message = 'Hello from Mobile';
        await bridge.writeMessage(message);

        const content = fs.readFileSync(TEST_FILE_PATH, 'utf8');
        expect(content).toContain(message);
    });

    test('should emit event when file is modified', (done) => {
        // 監視開始
        bridge.startWatching();

        // イベントリスナーを設定
        bridge.on('fileChanged', () => {
            // イベントが発火すれば成功
            try {
                const content = fs.readFileSync(TEST_FILE_PATH, 'utf8');
                expect(content).toContain('Update from Agent');
                done(); // Jestにテスト完了を通知
            } catch (error) {
                done(error);
            }
        });

        // 少し待ってからファイルを外部から変更（非同期的な書き込みをシミュレート）
        setTimeout(() => {
            fs.appendFileSync(TEST_FILE_PATH, 'Update from Agent', 'utf8');
        }, 100);
    });
});
