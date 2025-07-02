require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS設定
const corsOptions = {
    origin: '*', // 本番環境では特定のオリジンに制限することを推奨
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

// ミドルウェアの設定
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ルートURLでindex.htmlを提供
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 翻訳APIのエンドポイント
app.post('/api/translate', async (req, res) => {
    console.log('翻訳リクエスト受信:', {
        body: req.body,
        headers: req.headers
    });

    try {
        const { text, targetLang, sourceLang = 'auto' } = req.body;
        
        if (!text || !targetLang) {
            console.error('パラメータ不足:', { text, targetLang });
            return res.status(400).json({ 
                error: 'テキストとターゲット言語を指定してください',
                received: { text: !!text, targetLang: !!targetLang }
            });
        }

        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        const prompt = `Translate the following text from ${sourceLang === 'auto' ? 'auto-detected language' : sourceLang} to ${targetLang}: ${text}`;
        
        console.log('Gemini APIリクエスト:', {
            url: apiUrl,
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
        });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('APIキーが設定されていません');
            return res.status(500).json({ 
                error: 'サーバー設定エラー: APIキーが設定されていません' 
            });
        }
        
        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const responseText = await response.text();
        console.log('Gemini APIレスポンス:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: '無効なJSONレスポンス', details: responseText };
            }
            console.error('Gemini APIエラー:', errorData);
            return res.status(response.status).json({ 
                error: '翻訳APIでエラーが発生しました',
                details: errorData
            });
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSONパースエラー:', e);
            return res.status(500).json({ 
                error: 'APIレスポンスの解析に失敗しました',
                details: e.message
            });
        }

        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || text;
        
        console.log('翻訳成功:', {
            originalLength: text.length,
            translatedLength: translatedText.length
        });
        
        res.json({
            translatedText: translatedText.trim(),
            detectedSourceLanguage: sourceLang === 'auto' ? 'auto-detected' : sourceLang
        });
    } catch (error) {
        console.error('翻訳処理エラー:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        res.status(500).json({ 
            error: '翻訳処理中にエラーが発生しました',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`サーバーがポート${PORT}で起動しました`);
});

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);n});
