import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('API Key not found!');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
    try {
        console.log('Fetching available models...');
        // Note: SDK does not expose listModels directly on the main class easily in some versions,
        // but let's try to infer or just test a few standard ones.
        // Actually, newer SDKs might not have a direct listModels helper exposed for simple API keys easily 
        // without manager access, but let's try standard model generation to see specific error detail or success.

        const modelsToTest = [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-1.0-pro'
        ];

        for (const modelName of modelsToTest) {
            console.log(`Testing model: ${modelName}...`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                await model.generateContent('Hello');
                console.log(`✅ SUCCESS: ${modelName} is working!`);
            } catch (e: any) {
                console.log(`❌ FAILED: ${modelName} - ${e.message.slice(0, 100)}...`);
            }
        }

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
