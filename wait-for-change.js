/**
 * wait-for-change.js
 * 
 * このスクリプトは、mobile-chat.md の変更を待機し、
 * 【ユーザーからの】新しいメッセージがあった場合のみ終了します。
 * 
 * 安全装置: エージェント自身の書き込み ([Agent]) は無視します。
 * これにより「無限自己応答ループ」を防止します。
 * 
 * 使い方:
 *   node wait-for-change.js
 * 
 * Antigravityエージェントがこのスクリプトを実行することで、
 * スマホからの指示を待機できます。
 */

const fs = require('fs');
const path = require('path');

const CHAT_FILE = path.join(__dirname, 'mobile-chat.md');
const TIMEOUT_MS = 30000; // 30秒でタイムアウト
const POLL_INTERVAL_MS = 500; // 0.5秒ごとにチェック

function getFileStats() {
    try {
        const stats = fs.statSync(CHAT_FILE);
        return {
            size: stats.size,
            mtime: stats.mtime.getTime()
        };
    } catch (error) {
        return null;
    }
}

function getFileContent() {
    try {
        return fs.readFileSync(CHAT_FILE, 'utf8');
    } catch (error) {
        return '';
    }
}

/**
 * ファイルの最後のメッセージが [User] か [Agent] かを判定
 * @returns 'user' | 'agent' | null
 */
function getLastMessageSender(content) {
    // 最後の [User] または [Agent] の位置を探す
    const lastUserIndex = content.lastIndexOf('[User]');
    const lastAgentIndex = content.lastIndexOf('[Agent]');

    if (lastUserIndex === -1 && lastAgentIndex === -1) {
        return null;
    }

    if (lastUserIndex > lastAgentIndex) {
        return 'user';
    } else {
        return 'agent';
    }
}

function extractLastUserMessage(content) {
    // [User] (HH:MM:SS): メッセージ の形式を抽出
    const matches = content.match(/\[User\].*?:\s*(.+)/g);
    if (matches && matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const messageMatch = lastMatch.match(/\[User\].*?:\s*(.+)/);
        return messageMatch ? messageMatch[1].trim() : null;
    }
    return null;
}

async function waitForChange() {
    console.log('⏳ Waiting for USER messages in mobile-chat.md...');
    console.log(`📁 Watching: ${CHAT_FILE}`);
    console.log(`⏱️  Timeout: ${TIMEOUT_MS / 1000} seconds`);
    console.log('🛡️  Safety: Agent messages will be ignored');
    console.log('---');

    let lastStats = getFileStats();
    let lastContent = getFileContent();

    if (!lastStats) {
        console.log('❌ File not found. Creating...');
        fs.writeFileSync(CHAT_FILE, '# Mobile Chat Interface\n\n', 'utf8');
        lastStats = getFileStats();
        lastContent = getFileContent();
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            const currentStats = getFileStats();
            const elapsed = Date.now() - startTime;

            // タイムアウトチェック
            if (elapsed >= TIMEOUT_MS) {
                clearInterval(checkInterval);
                console.log('⏰ Timeout: No USER messages detected.');
                console.log('STATUS: TIMEOUT');
                resolve({ status: 'timeout', message: null });
                return;
            }

            // ファイル変更チェック
            if (currentStats && lastStats) {
                if (currentStats.mtime > lastStats.mtime || currentStats.size !== lastStats.size) {
                    const newContent = getFileContent();
                    const newPart = newContent.slice(lastContent.length);

                    // 🛡️ 安全装置: 最後のメッセージの送信者をチェック
                    const lastSender = getLastMessageSender(newContent);

                    if (lastSender === 'agent') {
                        // エージェント自身の書き込み → 無視して監視を継続
                        console.log('🔄 Agent message detected (ignoring self-response)');
                        lastStats = currentStats;
                        lastContent = newContent;
                        return; // ループを継続
                    }

                    if (lastSender === 'user') {
                        // ユーザーからのメッセージ → 検知成功
                        clearInterval(checkInterval);

                        const lastMessage = extractLastUserMessage(newContent);

                        console.log('✅ USER message detected!');
                        console.log('---');
                        console.log('NEW CONTENT:');
                        console.log(newPart);
                        console.log('---');

                        if (lastMessage) {
                            console.log(`📱 LAST USER MESSAGE: ${lastMessage}`);
                        }

                        console.log('STATUS: CHANGED');
                        resolve({ status: 'changed', message: lastMessage, newContent: newPart });
                        return;
                    }

                    // それ以外の変更（ヘッダー編集など）→ 無視
                    lastStats = currentStats;
                    lastContent = newContent;
                }
            }
        }, POLL_INTERVAL_MS);
    });
}

// メイン実行
waitForChange().then((result) => {
    process.exit(result.status === 'changed' ? 0 : 1);
});
