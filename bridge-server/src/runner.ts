import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { FileBridge } from './services/FileBridge';
import { exec } from 'child_process';
const screenshot = require('screenshot-desktop');

// Load environment variables from parent .env if exists
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const CHAT_FILE_PATH = path.resolve(__dirname, '../../mobile-chat.md');

// Global state for command execution
let currentDir = process.cwd();
let pendingCommand: string | null = null;

const DANGEROUS_COMMANDS = ['del', 'rm', 'rmdir', 'rd', 'format', 'shutdown', 'reboot', 'taskkill', 'mkfs'];

if (!API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY is not set.');
    if (!process.env.GEMINI_API_KEY) {
        console.error('   Running in manual mode (watching only).');
    }
}

// Initialize GenAI
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
let activeModelName: string | null = null;

// Function to verify and select the best available model
async function selectBestModel() {
    if (!API_KEY) return;
    try {
        console.log('🔍 Discovering available models...');
        // Use fetch with direct API call to workaround SDK strictness or version issues if needed,
        // but let's try a generative test first, OR list models if the SDK supports it.
        // Actually, the simplest way is to fetch the list directly like the debug script.

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        const response = await fetch(url);
        const data: any = await response.json();

        if (data.models) {
            const modelNames = data.models.map((m: any) => m.name.replace('models/', ''));
            console.log('📋 Available models:', modelNames.join(', '));

            // Priority list
            const priorities = [
                'gemini-1.5-flash',
                'gemini-1.5-flash-002',
                'gemini-1.5-flash-001',
                'gemini-1.5-pro',
                'gemini-1.5-pro-002',
                'gemini-pro',
                'gemini-1.0-pro'
            ];

            for (const p of priorities) {
                if (modelNames.includes(p)) {
                    activeModelName = p;
                    console.log(`✅ Selected Model: ${activeModelName}`);
                    return;
                }
            }
            // If no exact match from priority, pick first gemini model
            const fallback = modelNames.find((m: string) => m.includes('gemini'));
            if (fallback) {
                activeModelName = fallback;
                console.log(`⚠️ Using fallback model: ${activeModelName}`);
                return;
            }
        }
    } catch (e) {
        console.error('⚠️ Model discovery failed, using default list strategy.', e);
    }
}

// Call discovery on start
selectBestModel();

async function generateWithFallback(parts: any[]): Promise<string> {
    if (!genAI) throw new Error('GenAI not initialized');

    // Explicit list if discovery failed, otherwise just user the discovered one
    let candidates = activeModelName ? [activeModelName] : [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro',
        'gemini-1.0-pro'
    ];

    let lastError;
    for (const modelName of candidates) {
        try {
            console.log(`🤖 Using model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(parts);
            return result.response.text();
        } catch (e: any) {
            console.warn(`⚠️ Failed with ${modelName}: ${e.message?.split('\n')[0]}`);
            lastError = e;
        }
    }
    throw lastError || new Error('All models failed');
}

// Initialize FileBridge for easy reading/writing
const fileBridge = new FileBridge({ filePath: CHAT_FILE_PATH });

console.log('🤖 Antigravity Runner started.');
console.log(`📂 Watching: ${CHAT_FILE_PATH}`);

let isThinking = false;

async function processFileContext(content: string) {
    if (isThinking) return;

    // Extract last message
    const lines = content.trim().split('\n');
    let lastUserLineIndex = -1;
    let lastAgentLineIndex = -1;

    // Find last [User] and [Agent] lines
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith('[User]') && lastUserLineIndex === -1) {
            lastUserLineIndex = i;
        }
        if (lines[i].startsWith('[Agent]') && lastAgentLineIndex === -1) {
            lastAgentLineIndex = i;
        }
        if (lastUserLineIndex !== -1 && lastAgentLineIndex !== -1) break;
    }

    // Check if the conversation ends with a User message
    if (lastUserLineIndex > lastAgentLineIndex) {
        if (!genAI) {
            console.log('⚠️ API Key missing, cannot respond automatically.');
            return;
        }

        isThinking = true;
        console.log('📨 New message detected from User');

        let messageText = lines[lastUserLineIndex].replace(/\[User\] \(.*?\): /, '').trim();
        const parts: any[] = [];

        // Multi-line and Image handling
        for (let i = lastUserLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('[User]') || line.startsWith('[Agent]')) break;

            // Image detection: ![IMAGE](path)
            const imgMatch = line.match(/!\[IMAGE\]\((.*?)\)/);
            if (imgMatch) {
                const imgPathRelative = imgMatch[1];
                const imgFullPath = path.resolve(__dirname, '../../', imgPathRelative);

                try {
                    const imgBuffer = fs.readFileSync(imgFullPath);
                    const base64Image = imgBuffer.toString('base64');
                    // Simple mime type detection
                    const ext = path.extname(imgPathRelative).toLowerCase();
                    let mimeType = "image/jpeg";
                    if (ext === '.png') mimeType = "image/png";
                    if (ext === '.webp') mimeType = "image/webp";
                    if (ext === '.heic') mimeType = "image/heic";

                    parts.push({
                        inlineData: {
                            data: base64Image,
                            mimeType: mimeType
                        }
                    });
                    console.log(`📎 Image attached: ${imgPathRelative}`);
                } catch (e) {
                    console.error(`Error reading image: ${imgFullPath}`);
                }
            } else if (line.trim()) {
                messageText += '\n' + line;
            }
        }

        if (messageText) {
            // Feature: Voice Transcription
            const voiceMatch = messageText.match(/<Voice-Data:(.+?)>/);
            if (voiceMatch) {
                console.log(`🎤 Voice Input Detected: ${voiceMatch[1]}`);
                try {
                    const relativePath = voiceMatch[1];
                    // Fix path resolution: runner.ts is in src/, uploads is in bridge-server/uploads
                    // uploads/filename is passed in relativePath
                    // So we need path.resolve(__dirname, '../', relativePath) -> bridge-server/uploads/filename
                    // relativePath includes 'uploads/' prefix, so we need to be careful.

                    // If relativePath is "uploads/foo.webm", and we are in "src",
                    // path.resolve(__dirname, '../', relativePath) would be "bridge-server/uploads/foo.webm"
                    // which matches where socket.ts saved it.

                    // Wait, socket.ts saved to path.join(__dirname, '../uploads') -> bridge-server/uploads
                    // And passed "uploads/filename" as relativePath.

                    // If we use path.resolve(__dirname, '../../', relativePath):
                    // src -> bridge-server -> root -> root/uploads/filename
                    // This was wrong because uploads is inside bridge-server.

                    // So we want: src -> bridge-server -> bridge-server/uploads/filename
                    // Using '../' goes to bridge-server. Then appending "uploads/filename" works.
                    const audioPath = path.resolve(__dirname, '../', relativePath);
                    console.log(`📂 Resolved audio path: ${audioPath}`);

                    if (fs.existsSync(audioPath)) {
                        const audioData = fs.readFileSync(audioPath);
                        const base64Audio = audioData.toString('base64');

                        // Determine mime type from extension
                        let mimeType = 'audio/webm'; // default
                        if (audioPath.endsWith('.mp4')) mimeType = 'audio/mp4';
                        if (audioPath.endsWith('.aac')) mimeType = 'audio/aac';
                        if (audioPath.endsWith('.wav')) mimeType = 'audio/wav';

                        console.log(`🔄 Transcribing audio (${mimeType})...`);

                        // Transcribe using Gemini
                        // Use a specific model instance for transcription
                        const audioModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

                        const result = await audioModel.generateContent([
                            `この音声は日本語のシステム操作コマンド、または会話です。
                            音声をテキストに変換し、以下のルールに従って出力してください：

                            1. 「ラン」や「Run」といった発話は、コマンド実行指示として解釈し、"/run " プレフィックスを付けてください。
                            2. Windows環境で動作するコマンドに可能な限り変換してください：
                               - 「エルエス」「リスト」 → "dir"
                               - 「ラン エルエス」 → "/run dir"
                            3. 出力は変換後のテキストのみ。説明や挨拶は不要です。
                            
                            例：
                            音声：「ラン　エルエス」 → 出力：/run dir
                            音声：「スクショ撮って」 → 出力：スクショ撮って`,
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64Audio
                                }
                            }
                        ]);

                        const transcribedText = result.response.text().trim();
                        console.log(`📝 Transcribed: "${transcribedText}"`);

                        // Notify user what was heard
                        await fileBridge.writeMessage(`👂 Hears: "${transcribedText}"`, 'agent');

                        // OVERWRITE messageText with the transcribed text!!
                        // This effectively pipes the voice input into the rest of the logic (/run or chat)
                        messageText = transcribedText;

                    } else {
                        console.error(`❌ Audio file not found: ${audioPath}`);
                        await fileBridge.writeMessage(`❌ Error: Audio file missing`, 'agent');
                        isThinking = false;
                        return;
                    }
                } catch (err: any) {
                    console.error(`❌ Transcription failed:`, err);
                    await fileBridge.writeMessage(`⚠️ Voice Error: ${err.message}`, 'agent');
                    isThinking = false;
                    return;
                }
            }

            // If it's pure text (or became text after transcription), just pass string
            if (parts.length === 0) {
                parts.push(messageText);
            } else {
                parts.push({ text: messageText });
            }
        }

        // Feature: Command Execution (/run)
        if (messageText.startsWith('/run ') || (pendingCommand && /^(y|yes|ok|はい)$/i.test(messageText.trim()))) {
            let command = "";

            // Case 1: Confirming a pending command
            if (pendingCommand && /^(y|yes|ok|はい)$/i.test(messageText.trim())) {
                command = pendingCommand;
                pendingCommand = null;
                console.log(`🔓 Confirmation received. Executing: ${command}`);
                await fileBridge.writeMessage(`🔓 承認されました。実行します...`, 'agent'); // Feedback
            }
            // Case 2: Rejecting a pending command (New input that is NOT yes)
            else if (pendingCommand) {
                pendingCommand = null;
                await fileBridge.writeMessage(`🛑 コマンド実行をキャンセルしました。`, 'agent');
                // Don't return, let it process as a new command or chat if it starts with /run
                if (!messageText.startsWith('/run ')) {
                    // Just a chat message/cancellation
                    isThinking = false;
                    return;
                }
                command = messageText.slice(5).trim();
            }
            // Case 3: New /run command
            else {
                command = messageText.slice(5).trim();
            }

            // Check for dangerous commands (Only for new commands, not already confirmed ones)
            // Simple check: splitting by space and checking first token + checking presence of dangerous words
            // This is a basic filter.
            const lowerCmd = command.toLowerCase();
            const isDangerous = DANGEROUS_COMMANDS.some(danger => {
                // Check exact command match (e.g. "del") or as a word boundary (e.g. "del file", but not "model")
                const regex = new RegExp(`\\b${danger}\\b`, 'i');
                return regex.test(lowerCmd);
            });

            if (isDangerous && !messageText.match(/^(y|yes|ok|はい)$/i)) { // Double check we aren't confirming
                pendingCommand = command;
                console.log(`⚠️ Dangerous command detected: ${command}`);
                await fileBridge.writeMessage(`⚠️ **警告**: 危険なコマンドが含まれている可能性があります。\n\n\`${command}\`\n\n本当に実行しますか？ (y/n)`, 'agent');
                isThinking = false;
                return;
            }

            console.log(`💻 Executing: ${command} in ${currentDir}`);

            // Special handling: cd command
            if (command.startsWith('cd ')) {
                const targetPath = command.slice(3).trim();
                try {
                    const newPath = path.resolve(currentDir, targetPath);
                    // Check if directory exists
                    if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                        process.chdir(newPath); // Change process cwd as well
                        currentDir = newPath;   // Remember it
                        const responseMsg = `📂 Directory changed to:\n${currentDir}`;
                        console.log(responseMsg);
                        await fileBridge.writeMessage(responseMsg, 'agent');
                    } else {
                        throw new Error('Directory does not exist');
                    }
                } catch (err: any) {
                    const errorMsg = `❌ cd failed: ${err.message}`;
                    console.error(errorMsg);
                    await fileBridge.writeMessage(errorMsg, 'agent');
                }
                isThinking = false;
                return;
            }

            // Normal command execution using exec
            // Windows encoding fix: chcp 65001
            const fullCommand = process.platform === 'win32' ? `chcp 65001 > nul && ${command}` : command;

            // Execute asynchronously but wait for callback
            exec(fullCommand, { cwd: currentDir, encoding: 'utf-8' }, async (error: any, stdout: any, stderr: any) => {
                let output = "";
                if (error) {
                    output += `💀 Error:\n${error.message}\n\n`;
                }
                if (stderr) {
                    output += `⚠️ Stderr:\n${stderr}\n\n`;
                }
                if (stdout) {
                    output += `✅ Stdout:\n${stdout}`;
                }

                if (!output) output = "✅ Executed (No output)";

                console.log("Command Output length:", output.length);

                // Truncate if too long (Discord/Markdown limits)
                if (output.length > 4000) {
                    output = output.substring(0, 4000) + "\n...(truncated)";
                }

                // Send back to chat
                await fileBridge.writeMessage(output, 'agent');

                // IMPORTANT: Reset thinking state here since this is async callback
                // But wait, the main function will finish and set isThinking=false immediately?
                // No, processFileContext is async but exec callback is separate.
                // Actually, since we are returning from the main function, we need to handle isThinking carefully.
                // However, the original code sets isThinking=false in finally block. 
                // We should probably wrap this in a Promise to await it if we were strictly following async flow,
                // but here we can just let the callback handle the write.
                // The main function will exit, setting isThinking=false in finally block.
                // This might cause a race condition where a new file change triggers before this writes back?
                // No, fileBridge listens for file changes.
                // Let's rely on the fact that fileBridge.writeMessage writes to the file, which triggers fileChanged.
            });

            // We return here so we don't call Gemini
            isThinking = false;
            return;
        }

        // Feature: Screenshot Trigger
        // Feature: Screenshot Trigger
        if (messageText.includes('画面') || messageText.includes('スクショ') || messageText.includes('キャプチャ')) {
            console.log('📸 Screenshot requested');
            try {
                // Use .jpg extension to force JPEG format (screenshot-desktop behavior)
                // JPEG is crucial for reducing payload size for Socket.IO
                const timestamp = Date.now();
                const filename = `screenshot-${timestamp}.jpg`;
                const filepath = path.resolve(__dirname, '../../uploads', filename);

                if (!fs.existsSync(path.dirname(filepath))) {
                    fs.mkdirSync(path.dirname(filepath), { recursive: true });
                }

                await screenshot({ filename: filepath, format: 'jpg' });

                // Read and Convert to Base64
                const imgBuffer = fs.readFileSync(filepath);
                const base64Image = imgBuffer.toString('base64');
                const dataUri = `data:image/jpeg;base64,${base64Image}`;

                // Embed Base64 directly into markdown
                // This bypasses any network/tunnel issues for image loading
                await fileBridge.addImageMessage("PCの現在の画面です 📸", dataUri, "agent");

                console.log('✅ Screenshot sent (Base64).');
                isThinking = false;
                return;
            } catch (err) {
                console.error('Screenshot failed:', err);
                await fileBridge.writeMessage(`スクショの撮影に失敗しました: ${err}`, 'agent');
                isThinking = false;
                return;
            }
        }

        try {
            console.log('🧠 Thinking...');
            const response = await generateWithFallback(parts);

            console.log('🗣️ Responding...');
            await fileBridge.writeMessage(response, 'agent');
        } catch (error) {
            console.error('💥 AI Error:', error);
            await fileBridge.writeMessage(`エラーが発生しました: 全てのモデルで生成に失敗しました。\n詳細: ${error}`, 'agent');
        } finally {
            isThinking = false;
        }
    }
}

fileBridge.on('fileChanged', () => {
    // Read full content to analyze context properly
    setTimeout(() => {
        fs.readFile(CHAT_FILE_PATH, 'utf8', (err, data) => {
            if (!err) {
                processFileContext(data);
            }
        });
    }, 500); // Wait a bit for file write to complete
});

fileBridge.startWatching();
