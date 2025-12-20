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
// Canonical root based on script location (assuming standard structure of bridge-server/src or bridge-server/dist)
const projectRoot = path.resolve(__dirname, '../../');

// If current cwd is inside bridge-server, switch to projectRoot
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
    if (!process.env.GEMINI_API_KEY) {
        console.error('   Running in manual mode (watching only).');
    }
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

const MAX_TREE_DEPTH = 2;
// MAX_OUTPUT_LENGTH is used in executeCommand

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
    // Use currentDir (which is auto-corrected to project root)
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
        console.warn('⚠️ Gemini or active model not initialized, skipping chat session setup.');
        return;
    }

    const systemContext = getSystemContext();
    const model = genAI.getGenerativeModel({ model: activeModelName });

    chatSession = model.startChat({
        history: [
            {
                role: "user",
                parts: [{
                    text: `You are the Antigravity Agent. You live in the user's computer. 
You can see the screen when requested. 
Be helpful and concise.

${systemContext}

You have access to the following capabilities:
1. **Execute Commands**: Output lines starting with "/run " to execute commands.
   - Example: "/run dir" or "/run npm install"

2. **Create/Update Files**: To create or edit a file, output the content wrapped in a <write> tag.
   - Format:
     <write file="path/to/filename.ext">
     file content here
     </write>
   - You can write multiple files in one response.
   - Always use forward slashes "/" for paths, or standard commands.
   - If the file exists, it will be overwritten.

3. **Voice Input**: The user may speak to you. "run [command]" triggers commands.` }],
            },
            {
                role: "model",
                parts: [{ text: "Understood. I am ready to act as your autonomous engineer. I have read the rules and I can run commands and write files directly to your system." }],
            },
        ],
    });
    console.log(`✅ Gemini initialized with model: ${activeModelName}`);
}

// Call discovery on start
selectBestModel().then(() => {
    initGeminiChatSession();
});

// --- RAG Integration ---
const RAG_SERVER_URL = "http://localhost:8001";

async function searchRAG(query: string): Promise<string> {
    try {
        // Only search if query is long enough to be meaningful
        if (query.length < 5) return "";

        const res = await fetch(`${RAG_SERVER_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, n_results: 3 })
        });

        if (!res.ok) return "";

        const data: any = await res.json();
        const docs = data.results?.documents?.[0];
        const metas = data.results?.metadatas?.[0];

        if (!docs || docs.length === 0) return "";

        let context = "【RAG KNOWLEDGE BASE RESULTS】\nThe following relevant code/docs were retrieved from your vector database to assist with the user request:\n\n";

        docs.forEach((doc: string, i: number) => {
            const meta = metas[i];
            const source = meta?.source || "Unknown File";
            // Limit doc length to avoid context overflow if chunk is huge
            const preview = doc.length > 2000 ? doc.substring(0, 2000) + "\n...(truncated)" : doc;
            context += `--- File: ${source} ---\n${preview}\n\n`;
        });

        return context;
    } catch (e) {
        // Silent fail (RAG server might be down, which is expected during setup)
        // console.warn("RAG Search skipped:", e);
        return "";
    }
}

async function generateWithFallback(parts: any[]): Promise<string> {
    if (!chatSession) throw new Error('Chat session not initialized');

    try {
        console.log(`🤖 Sending message to model: ${activeModelName}...`);
        const result = await chatSession.sendMessage(parts);
        return result.response.text();
    } catch (e: any) {
        console.error(`⚠️ Failed to send message: ${e.message?.split('\n')[0]}`);
        throw e;
    }
}

// --- Helper: Load Prompts ---
function loadPrompt(roleName: string): string {
    try {
        const p = path.join(process.cwd(), 'prompts', 'roles', `${roleName}.md`);
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
        return "";
    } catch (e) {
        console.warn(`Role prompt not found: ${roleName}`);
        return "";
    }
}

function loadGoldenRule(lang: string): string {
    try {
        const p = path.join(process.cwd(), 'prompts', 'golden-rules', `${lang}.md`);
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
        return "";
    } catch (e) {
        console.warn(`Golden rule not found: ${lang}`);
        return "";
    }
}

// --- Antigravity Swarm Architecture ---

const ROLES = {
    COMMANDER: "あなたは開発チームの司令塔(Commander)です。\nユーザーの抽象的な要望を分析し、開発者が理解できる明確な「技術仕様書」と「実装ステップ」に分解してください。\n出力は他のエージェントへの指示として使われます。",

    CODER: "あなたは熟練のシニアソフトウェアエンジニア(Coder)です。\n与えられた仕様書に基づいて、TypeScript/Node.js/Next.jsを用いた高品質なコードを実装してください。\nコードは省略せず、実行可能な状態で出力してください。",

    REVIEWER: "あなたはセキュリティと品質保証の専門家(Reviewer)です。\n提示された仕様書に基づいて、潜在的なバグ、セキュリティリスク、エッジケースを指摘してください。\nまた、必要なテストケースも列挙してください。",

    SYNTHESIZER: "あなたはプロジェクトのテックリード(Synthesizer)です。\nCoderが書いたコードと、Reviewerの指摘を統合し、最終的な完成コードを作成してください。\nReviewerの指摘を反映してコードを修正・改善した上で、ユーザーに提示する最終回答を出力してください。"
};

async function askAgent(role: string, prompt: string): Promise<string> {
    if (!genAI || !activeModelName) throw new Error("GenAI not initialized");

    const model = genAI.getGenerativeModel({ model: activeModelName });
    // Inject System Context + Role
    const systemInstruction = `
${getSystemContext()}

【YOUR ROLE】
${role}
`;
    try {
        const result = await model.generateContent([
            systemInstruction,
            prompt
        ]);
        return result.response.text();
    } catch (e: any) {
        console.error(`⚠️ Agent generation failed: ${e.message}`);
        return `Error: ${e.message}`;
    }
}

// Initialize FileBridge for easy reading/writing
const fileBridge = new FileBridge({ filePath: CHAT_FILE_PATH });

console.log('🤖 Antigravity Runner started.');
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

            // Truncate output (Safety: Prevent Context Explosion)
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
        if (!genAI) {
            console.log('⚠️ API Key missing, cannot respond automatically.');
            return;
        }
        if (!chatSession) {
            console.log('⚠️ Chat session not initialized, cannot respond automatically.');
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

        // Feature: Antigravity Swarm (Multi-Agent)
        if (messageText.startsWith('/swarm ')) {
            const userRequest = messageText.slice(7).trim();
            console.log(`🐝 Swarm Task Detected: ${userRequest}`);
            await fileBridge.writeMessage(`🐝 **Antigravity Swarm Activated**\nTask: ${userRequest}\n\n指揮官が作戦を立案中...`, 'agent');

            try {
                // Phase 1: Commander
                console.log('🐝 Commander is planning...');
                const spec = await askAgent(ROLES.COMMANDER, `ユーザーの要望: ${userRequest}`);
                await fileBridge.writeMessage(`👮 **Commander**: 仕様を策定しました。\n\n${spec}`, 'agent');

                // Phase 2: Parallel Workers (Coder & Reviewer)
                console.log('🐝 Workers are executing...');
                await fileBridge.writeMessage(`👷 **Workers**: 実装とレビューを並列実行中...`, 'agent');

                // Promise.allSettled for robustness
                const results = await Promise.allSettled([
                    askAgent(ROLES.CODER, `以下の仕様に基づいてコードを実装せよ:\n${spec}`),
                    askAgent(ROLES.REVIEWER, `以下の仕様に基づいてリスク分析とテスト設計を行え:\n${spec}`)
                ]);

                const coderResult = results[0].status === 'fulfilled' ? results[0].value : `Error: ${results[0].reason}`;
                const reviewerResult = results[1].status === 'fulfilled' ? results[1].value : `Error: ${results[1].reason}`;

                // Phase 3: Synthesizer
                console.log('🐝 Synthesizer is merging...');
                await fileBridge.writeMessage(`👨‍💻 **Synthesizer**: 最終調整中...`, 'agent');

                const finalOutput = await askAgent(ROLES.SYNTHESIZER, `
【Coderの実装】
${coderResult}

【Reviewerの指摘】
${reviewerResult}

これらを統合し、最終的な回答を作成せよ。
`);
                await fileBridge.writeMessage(finalOutput, 'agent');

            } catch (err: any) {
                console.error(`💥 Swarm Error:`, err);
                await fileBridge.writeMessage(`⚠️ Swarm Crashed: ${err.message}`, 'agent');
            }

            isThinking = false;
            return;
        }

        // Feature: FAANG Auto-Dev Cycle (/dev)
        if (messageText.startsWith('/dev ')) {
            const userRequest = messageText.slice(5).trim();
            console.log(`🚀 /dev Task Detected: ${userRequest}`);
            await fileBridge.writeMessage(`🚀 **FAANG Auto-Dev Cycle Started**\nTask: ${userRequest}\n\nArchitect is analyzing requirements...`, 'agent');

            try {
                // Phase 1: Architect
                const architectPrompt = `
${loadPrompt('architect')}

【User Request】
${userRequest}
`;
                // Use askAgent but with a generic role tag
                const designDoc = await askAgent("ARCHITECT", architectPrompt);
                await fileBridge.writeMessage(`📄 **[Architect] Design Doc Created:**\n\n${designDoc}`, 'agent');

                // Phase 2: Reviewer
                await fileBridge.writeMessage(`🕵️ **[Reviewer] Shredding the design...**`, 'agent');
                const reviewerPrompt = `
${loadPrompt('reviewer')}

【Review Target: Design Doc】
${designDoc}
`;
                const reviewResult = await askAgent("REVIEWER", reviewerPrompt);
                await fileBridge.writeMessage(`🔍 **[Review Result]:**\n${reviewResult}`, 'agent');

                // Phase 3: Coder
                await fileBridge.writeMessage(`👨‍💻 **[Coder] Starting TDD implementation...**`, 'agent');
                const goldenRules = loadGoldenRule('typescript');
                const coderPrompt = `
${loadPrompt('coder')}

【Golden Rules】
${goldenRules}

【Approved Design Doc】
${designDoc}

【Reviewer's Comments (Address these)】
${reviewResult}

Implementation Start.
`;
                const codeOutput = await askAgent("CODER", coderPrompt);
                await fileBridge.writeMessage(`✅ **[Coder] Implementation Complete:**\n\n${codeOutput}`, 'agent');

            } catch (err: any) {
                console.error(`💥 Auto-Dev Error:`, err);
                await fileBridge.writeMessage(`⚠️ Auto-Dev Crashed: ${err.message}`, 'agent');
            }

            isThinking = false;
            return;
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

            // RAG Search Integration (v2.0)
            // Skip for commands or very short messages
            if (!messageText.startsWith('/') && messageText.length > 5) {
                console.log('🔍 Consulting RAG Engine...');
                const ragContext = await searchRAG(messageText);
                if (ragContext) {
                    console.log('📚 RAG Context Injected!');
                    // Insert RAG context as a system-like message or implicit context part
                    parts.push({ text: ragContext });
                }
            }

            let response = await generateWithFallback(parts);

            // Feature: Parse <write> tags and create files
            const fileRegex = /<write\s+file="([^"]+)">([\s\S]*?)<\/write>/g;
            let match;
            let filesWritten = [];
            let performedBackup = false;

            while ((match = fileRegex.exec(response)) !== null) {
                const relativePath = match[1];
                const fileContent = match[2].trim();

                // Safety: Backup before writing
                // Note: performedBackup variable needs to be defined outside loop
                if (typeof performedBackup !== 'undefined' && !performedBackup) {
                    try {
                        console.log('🛡️ Creating backup commit...');
                        require('child_process').execSync('git add . && git commit -m "Auto-save: Before AI Edit"', { cwd: currentDir, stdio: 'ignore' });
                        console.log('✅ Backup created.');
                    } catch (bkErr) {
                        // Ignore
                    }
                    performedBackup = true;
                }

                try {
                    const fullPath = path.resolve(currentDir, relativePath);
                    const dirPath = path.dirname(fullPath);

                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    fs.writeFileSync(fullPath, fileContent, 'utf8');
                    console.log(`💾 Created file: ${fullPath}`);
                    filesWritten.push(relativePath);

                } catch (err: any) {
                    console.error(`❌ Failed to write file ${relativePath}:`, err);
                    response += `\n\n❌ Failed to write ${relativePath}: ${err.message}`;
                }
            }

            if (filesWritten.length > 0) {
                const fileList = filesWritten.map(f => `\`${f}\``).join(', ');
                response += `\n\n✅ 以下のファイルを作成/更新しました: ${fileList}`;
            }

            console.log('🗣️ Responding...');
            await fileBridge.writeMessage(response, 'agent');

            // AI-Triggered Command Execution
            const lines = response.split('\n');
            const commandLine = lines.find(line => line.trim().startsWith('/run '));

            if (commandLine) {
                const cmd = commandLine.trim().substring(5).trim();
                console.log(`🤖 AI Agent triggering command: ${cmd}`);

                // Use executeCommand helper
                const output = await executeCommand(cmd);
                // Send Observation back to chat
                await fileBridge.writeMessage(`[Agent System]: Executed '${cmd}'\n${output}`, 'agent');
            }
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
