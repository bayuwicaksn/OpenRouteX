const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { route, MODELS } = require('./router');

const app = express();
const PORT = process.env.PORT || 8403;

app.use(bodyParser.json());

// Paths
const HOME_DIR = process.env.HOME || '/home/bayuwicaksn';
const WORKSPACE_DIR = path.join(HOME_DIR, '.openclaw/workspace');
const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

// Auth Paths
const CLIENT_SECRET_PATH = path.join(WORKSPACE_DIR, 'client_secret.json'); 
const AUTH_PROFILES_PATH = path.join(OPENCLAW_DIR, 'agents/main/agent/auth-profiles.json');
const MODELS_JSON_PATH = path.join(OPENCLAW_DIR, 'agents/main/agent/models.json');

// Cache
let googleToken = null;
let googleTokenExpiry = 0;

// Helper: Read JSON safely
function readJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// 1. Auth: Google
async function getGoogleToken() {
    const now = Date.now();
    if (googleToken && now < googleTokenExpiry) {
        return googleToken;
    }

    console.log("Refreshing Google Token...");
    
    const clientSecretData = readJson(CLIENT_SECRET_PATH);
    if (!clientSecretData || !clientSecretData.installed) {
        throw new Error("Missing client_secret.json in workspace root");
    }
    const { client_id, client_secret } = clientSecretData.installed;

    const authProfiles = readJson(AUTH_PROFILES_PATH);
    const profile = authProfiles?.profiles?.['google-antigravity:bayuwicaksnhere@gmail.com'];
    if (!profile) {
        throw new Error("Missing Google profile in auth-profiles.json");
    }

    if (profile.access && profile.expires > now + 30000) {
        googleToken = profile.access;
        googleTokenExpiry = profile.expires;
        return googleToken;
    }

    if (!profile.refresh) {
        throw new Error("Missing Google refresh token");
    }

    const oAuth2Client = new OAuth2Client(client_id, client_secret);
    oAuth2Client.setCredentials({ refresh_token: profile.refresh });

    try {
        const { credentials } = await oAuth2Client.refreshAccessToken();
        googleToken = credentials.access_token;
        googleTokenExpiry = credentials.expiry_date || (now + 3500 * 1000);
        return googleToken;
    } catch (error) {
        console.error("Failed to refresh Google token:", error.message);
        throw error;
    }
}

// 2. Auth: DeepSeek
function getDeepSeekKey() {
    const modelsData = readJson(MODELS_JSON_PATH);
    const key = modelsData?.providers?.deepseek?.apiKey;
    if (key) return key;
    return process.env.DEEPSEEK_API_KEY;
}

// 3. API Clients

// Google Opus (via Vertex AI rawPredict)
async function callGoogleOpus(messages, systemPrompt) {
    const token = await getGoogleToken();
    const projectId = "perfect-transit-486608-d4";
    const location = "us-central1";
    const modelId = "claude-3-opus@20240229"; 
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/anthropic/models/${modelId}:rawPredict`;

    const anthropicMessages = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
    }));

    const data = {
        anthropic_version: "vertex-2023-10-16",
        messages: anthropicMessages,
        max_tokens: 4096,
        system: systemPrompt 
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const content = response.data.content[0].text;
        
        return {
            id: "chatcmpl-" + Date.now(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "claude-3-opus",
            choices: [{
                index: 0,
                message: {
                    role: "assistant",
                    content: content
                },
                finish_reason: "stop"
            }],
            usage: {
                prompt_tokens: response.data.usage?.input_tokens || 0,
                completion_tokens: response.data.usage?.output_tokens || 0,
                total_tokens: (response.data.usage?.input_tokens || 0) + (response.data.usage?.output_tokens || 0)
            }
        };
    } catch (error) {
        console.error("Google API Error:", error.response?.data || error.message);
        throw new Error("Google API Failed");
    }
}

// DeepSeek (OpenAI Compatible)
async function callDeepSeek(messages, model = "deepseek-chat", tools = null, tool_choice = null) {
    const apiKey = getDeepSeekKey();
    const url = "https://api.deepseek.com/v1/chat/completions";
    
    const body = {
        model: model,
        messages: messages
    };

    if (tools) {
        body.tools = tools;
        if (tool_choice) body.tool_choice = tool_choice;
    }

    try {
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error("DeepSeek API Error:", error.response?.data || error.message);
        throw new Error("DeepSeek API Failed");
    }
}

// 4. Server Endpoints

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/v1/chat/completions', async (req, res) => {
    const { messages, tools, tool_choice } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array required" });
    }

    let systemPrompt = "";
    let userPrompt = "";
    const filteredMessages = [];
    
    messages.forEach(msg => {
        if (msg.role === 'system') {
            systemPrompt += msg.content + "\n";
        } else {
            filteredMessages.push(msg);
            if (msg.role === 'user') {
                if (typeof msg.content === 'string') {
                    userPrompt = msg.content;
                } else if (Array.isArray(msg.content)) {
                    msg.content.forEach(part => {
                        if (part.type === 'text') userPrompt += part.text + " ";
                    });
                }
            }
        }
    });

    let decision;
    if (tools && tools.length > 0) {
        decision = {
            tier: "TOOLS",
            model: { id: "deepseek/deepseek-chat" },
            reason: "Tools present in request"
        };
    } else {
        decision = route(userPrompt);
    }

    try {
        let responseJson;
        if (decision.tier === 'COMPLEX' || decision.tier === 'REASONING') {
            responseJson = await callGoogleOpus(filteredMessages, systemPrompt);
        } else {
            const modelToUse = (decision.model.id.includes('reasoner')) ? 'deepseek-reasoner' : 'deepseek-chat';
            responseJson = await callDeepSeek(messages, modelToUse, tools, tool_choice);
        }
        res.json(responseJson);
    } catch (error) {
        console.error("Handler Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/responses', (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
    console.log(`ClawRouter Proxy running on http://localhost:${PORT}`);
});
