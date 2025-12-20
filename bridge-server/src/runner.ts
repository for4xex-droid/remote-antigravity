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

// Auto-navigate to Project Root if running from inside bridge-server
const projectRoot = path.resolve(__dirname, '../../');
if (currentDir.includes('bridge-server')) {
    console.log(`📂 Detected execution inside bridge-server. Switching context to Project Root: ${projectRoot}`);
    currentDir = projectRoot;
    try {
        process.chdir(currentDir);
    } catch (e) {
        console.error(`⚠️ Failed to change directory to ${currentDir}:`, e);
    }
}

let pendingCommand: string | null = null;
type PendingAction = {
    type: 'write_file';
    path: string;
    content: string;
};
let pendingActions: PendingAction[] = [];

const DANGEROUS_COMMANDS = [
    'del', 'rm', 'erase', 'rimraf',         // File Deletion
    'rmdir', 'rd',                          // Directory Deletion
    'format', 'mkfs', 'diskpart', 'fdisk',  // Disk / System
    'shutdown', 'reboot', 'logoff',         // System State
    'taskkill', 'tskill',                   // Process
    'reg', 'sc', 'net', 'netsh',            // Registry / Service / Network
    'attrib', 'icacls', 'takeown'           // Permissions
];

if (!API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY is not set.');
}

// Initialize GenAI
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
let activeModelName: string | null = null;
let chatSession: any;

// Function to verify and select the best available model
async function selectBestModel() {
    if (!API_KEY) return;
    try {
        console.log('🔍 Discovering available models...');
        // Simplified selection strategy: Prefer Experimental V2, then Flash
        activeModelName = 'gemini-2.0-flash-exp'; // Default to fast & smart
        console.log(`✅ Selected Model: ${activeModelName}`);
    } catch (e) {
        console.error('⚠️ Model selection failed, defaulting.', e);
        activeModelName = 'gemini-1.5-flash';
    }
}

const MAX_TREE_DEPTH = 2;

function getFileTree(dir: string, depth: number = 0): string {
    if (depth > MAX_TREE_DEPTH) return "";
    let output = "";
    try {
        const files = fs.readdirSync(dir);
        const ignoreList = ['.git', 'node_modules', '.next', 'dist', 'coverage', 'build', '.vscode', 'uploads', 'logs'];

        files.forEach(file => {
            if (ignoreList.includes(file)) return;
            if (depth > 0 && file.startsWith('.')) return;

            const fullPath = path.join(dir, file);
            let isDir = false;
            try { isDir = fs.statSync(fullPath).isDirectory(); } catch (e) { }

            const indent = "  ".repeat(depth);
            const icon = isDir ? "📁" : "📄";
            output += `${indent}${icon} ${file}\n`;

            if (isDir) {
                output += getFileTree(fullPath, depth + 1);
            }
        });
    } catch (e) { return ""; }
    return output;
}

// Helper to read rules and context
function getSystemContext(): string {
    let context = "【SYSTEM CONTEXT】\n";
    try {
        const rulePath = path.resolve(__dirname, '../../rule.md');
        if (fs.existsSync(rulePath)) {
            context += fs.readFileSync(rulePath, 'utf-8') + "\n";
        }
    } catch (e) {
        console.error("⚠️ rule.md load failed:", e);
    }

    // Inject File Tree (The Map)
    context += `
【CURRENT PROJECT STRUCTURE (Map)】
Current Directory: ${currentDir}
File Tree (Depth: ${MAX_TREE_DEPTH}):
${getFileTree(currentDir)}
`;
    return context;
}

async function initGeminiChatSession() {
    if (!genAI || !activeModelName) {
        return;
    }

    const systemContext = getSystemContext();
    const model = genAI.getGenerativeModel({ model: activeModelName });

    chatSession = model.startChat({
        history: [
            {
                role: "user",
                parts: [{
                    text: `You are Antigravity, the Single Super Agent.
You have full control over the user's development environment.
Your goal is to be helpful, precise, and fast.

${systemContext}

You have access to the following capabilities:
1. **Execute Commands**: Output lines starting with "/run " to execute commands.
   - Example: "/run dir" or "/run npm install"

2. **Create/Update Files**: To create or edit a file, output the content wrapped in a <write_file> tag.
   - Format:
     <write_file path="src/index.ts">
     console.log("Hello");
     </write_file>
   - You can write multiple files in one response.
   - Always use relative paths from project root.

3. **Voice Input**: The user may speak to you. "run [command]" triggers commands.` }],
            },
            {
                role: "model",
                parts: [{ text: "Understood. I am Antigravity. I am ready to Execute." }],
            },
        ],
    });
    console.log(`✅ Gemini initialized with model: ${activeModelName}`);
}

// Call discovery on start
selectBestModel().then(() => {
    initGeminiChatSession();
});

// Initialize FileBridge for easy reading/writing
const fileBridge = new FileBridge({ filePath: CHAT_FILE_PATH });

console.log('🤖 Antigravity Runner started (Simplified Mode).');
console.log(`📂 Watching: ${CHAT_FILE_PATH}`);

let isThinking = false;

// Helper: Execute command with safety checks
async function executeCommand(command: string): Promise<string> {
    // Check for dangerous commands
    const lowerCmd = command.toLowerCase();
    const isDangerous = DANGEROUS_COMMANDS.some(danger => {
        const regex = new RegExp(`\\b${danger}\\b`, 'i');
        return regex.test(lowerCmd);
    });

    if (isDangerous) {
        return `⚠️ **警告**: 危険なコマンドが含まれている可能性があります。\n\n\`${command}\`\n\n実行は保留されました。ユーザーが承認する場合のみ 'y' または 'yes' と入力してください。`;
    }

    // Special handling: cd command
    if (command.startsWith('cd ')) {
        const targetPath = command.slice(3).trim();
        try {
            const newPath = path.resolve(currentDir, targetPath);
            if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                process.chdir(newPath);
                currentDir = newPath;
                return `📂 Directory changed to:\n${currentDir}`;
            } else {
                throw new Error('Directory does not exist');
            }
        } catch (err: any) {
            return `❌ cd failed: ${err.message}`;
        }
    }

    // Windows encoding fix
    const fullCommand = process.platform === 'win32' ? `chcp 65001 > nul && ${command}` : command;

    return new Promise((resolve) => {
        exec(fullCommand, { cwd: currentDir, encoding: 'utf-8' }, (error, stdout, stderr) => {
            let output = "";
            if (error) output += `💀 Error:\n${error.message}\n\n`;
            if (stderr) output += `⚠️ Stderr:\n${stderr}\n\n`;
            if (stdout) output += `✅ Stdout:\n${stdout}`;
            if (!output) output = "✅ Executed (No output)";

            // Truncate output
            if (output.length > 2000) {
                output = output.substring(0, 2000) + "\n...(truncated to 2000 chars)";
            }
            resolve(output);
        });
    });
}

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
        if (!genAI || !chatSession) return;

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
                const imgFullPath = path.resolve(__dirname, '../', imgPathRelative);
                try {
                    const imgBuffer = fs.readFileSync(imgFullPath);
                    const base64Image = imgBuffer.toString('base64');
                    // Simple mime type detection
                    const ext = path.extname(imgPathRelative).toLowerCase();
                    let mimeType = "image/jpeg";
                    if (ext === '.png') mimeType = "image/png";
                    if (ext === '.webp') mimeType = "image/webp";
                    parts.push({
                        inlineData: {
                            data: base64Image,
                            mimeType: mimeType
                        }
                    });
                } catch (e) {
                    console.error(`Error reading image: ${imgFullPath}`);
                }
            } else if (line.trim()) {
                messageText += '\n' + line;
            }
        }

        if (messageText) {
            // Feature: Voice Transcription logic (simplified)
            const voiceMatch = messageText.match(/<Voice-Data:(.+?)>/);
            if (voiceMatch) {
                // ... (Voice transcription logic skipped for brevity in simplified view, 
                //      but in real implementation we should keep it if User wants Voice)
                //      For now, let's assume text input mainly.
                //      Actually, keeping voice is good UX.
                try {
                    const relativePath = voiceMatch[1];
                    const audioPath = path.resolve(__dirname, '../', relativePath);
                    if (fs.existsSync(audioPath)) {
                        const audioData = fs.readFileSync(audioPath);
                        const base64Audio = audioData.toString('base64');
                        const audioModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
                        const result = await audioModel.generateContent([
                            `Transcribe this audio to text. If it sounds like a command, format it.`,
                            { inlineData: { mimeType: 'audio/webm', data: base64Audio } }
                        ]);
                        messageText = result.response.text().trim();
                        await fileBridge.writeMessage(`👂 Hears: "${messageText}"`, 'agent');
                    }
                } catch (e) {
                    console.error("Voice error", e);
                }
            }

            parts.push(messageText);
        }

        // --- Execute Single Agent Logic ---
        try {
            // Feature: Command Execution (/run) and Confirmation (/yes)
            if (messageText.startsWith('/run ') || (pendingCommand && /^(y|yes|ok|はい)$/i.test(messageText.trim())) || (pendingActions.length > 0 && messageText.trim() === '/yes')) {
                let command = "";

                // Case 0: Confirming Pending Actions (File Writes)
                if (pendingActions.length > 0 && messageText.trim() === '/yes') {
                    console.log(`🔓 Approving ${pendingActions.length} file operations...`);
                    await fileBridge.writeMessage(`🔓 承認されました。ファイル操作を実行します...`, 'agent');

                    let successCount = 0;
                    for (const action of pendingActions) {
                        if (action.type === 'write_file') {
                            try {
                                const fullPath = path.resolve(currentDir, action.path);
                                // Final Safety Check
                                if (!fullPath.startsWith(currentDir)) throw new Error("Path traversal.");
                                const dirPath = path.dirname(fullPath);
                                if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
                                fs.writeFileSync(fullPath, action.content, 'utf8');
                                console.log(`💾 Wrote to: ${action.path}`);
                                successCount++;
                            } catch (err: any) {
                                console.error(`❌ Write failed: ${action.path}`, err);
                                await fileBridge.writeMessage(`❌ Write failed: ${action.path}\n${err.message}`, 'agent');
                            }
                        }
                    }
                    await fileBridge.writeMessage(`✅ ${successCount} files written successfully.`, 'agent');
                    pendingActions = []; // Clear
                    isThinking = false;
                    return;
                }

                // Case 1: Confirming Pending Command
                if (pendingCommand && /^(y|yes|ok|はい)$/i.test(messageText.trim())) {
                    command = pendingCommand;
                    pendingCommand = null;
                } else if (messageText.startsWith('/run ')) {
                    command = messageText.slice(5).trim();
                }

                // Execute
                if (command) {
                    console.log(`💻 Executing: ${command}`);
                    const output = await executeCommand(command);
                    await fileBridge.writeMessage(output, 'agent');
                    isThinking = false;
                    return;
                }
            }

            // Normal Chat / Generation
            const responseText = await chatSession.sendMessage(parts);
            let response = responseText.response.text();

            // Parse <write_file> tags
            const writeRegex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g;
            let match;
            const newActions: PendingAction[] = [];

            while ((match = writeRegex.exec(response)) !== null) {
                const relativePath = match[1];
                const fileContent = match[2].trim();

                if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
                    console.warn(`🛑 Blocked unsafe path: ${relativePath}`);
                    continue;
                }
                newActions.push({
                    type: 'write_file',
                    path: relativePath,
                    content: fileContent
                });
            }

            if (newActions.length > 0) {
                pendingActions = [...pendingActions, ...newActions];
                response += `\n\n⚠️ **FILE WRITE REQUEST**: I want to create/modify ${newActions.length} files.\n`;
                newActions.forEach(a => response += `- \`${a.path}\`\n`);
                response += `\nType \`/yes\` to approve.`;
            }

            await fileBridge.writeMessage(response, 'agent');

        } catch (err: any) {
            console.error(`💥 Error:`, err);
            await fileBridge.writeMessage(`⚠️ System Error: ${err.message}`, 'agent');
        }

        isThinking = false;
    }
}

// Watch file for changes
fileBridge.on('fileChanged', async () => {
    const content = await fileBridge.readContent();
    await processFileContext(content);
});

fileBridge.startWatching();
