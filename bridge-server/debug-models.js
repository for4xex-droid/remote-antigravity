// bridge-server/debug-models.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function listModels() {
    // Check both possible variable names to be safe
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        console.error("❌ API Key not found in .env (checked GEMINI_API_KEY and GOOGLE_API_KEY)");
        return;
    }

    console.log(`🔑 Using API Key: ...${apiKey.slice(-4)}`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ API Error:", JSON.stringify(data.error, null, 2));
            return;
        }

        if (!data.models) {
            console.log("⚠️ No models found. The API might be active but has no models assigned yet.");
            return;
        }

        console.log("\n✅ あなたのアカウントで現在使用可能なモデル一覧:");
        console.log("--------------------------------------------------");
        data.models.forEach(model => {
            // geminiが含まれるモデルのみ表示
            if (model.name.includes("gemini")) {
                console.log(`Model Name: ${model.name}`);
                console.log(` -> Code:   "${model.name.replace("models/", "")}"`);
                console.log("--------------------------------------------------");
            }
        });

    } catch (err) {
        console.error("❌ Network Error:", err);
    }
}

listModels();
