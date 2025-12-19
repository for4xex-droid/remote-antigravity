const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
// Load .env from project root (parent directory of bridge-server)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;

    console.log("Checking API Key setup...");
    if (!apiKey) {
        console.error("❌ API Key not found! Check your .env file path and variable name.");
        return;
    }
    console.log(`🔑 API Key found (ends with ...${apiKey.slice(-4)})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // Test most likely candidates
    const modelsToTest = ["gemini-1.5-flash", "gemini-pro"];

    for (const modelName of modelsToTest) {
        console.log(`\n📡 Testing model: "${modelName}"...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello! Are you working?");
            console.log(`✅ SUCCESS! Response: ${result.response.text()}`);
            console.log(`🎯 CONCLUSION: Please use model name "${modelName}" in your code.`);
            return;
        } catch (error) {
            console.error(`❌ Error with ${modelName}:`);
            console.error(error.message);
        }
    }
    console.log("\n💀 All tests failed. This usually indicates an account/billing issue or invalid API key.");
}

test();
