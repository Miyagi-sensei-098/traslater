require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS設定
const allowedOrigins = [
    'https://miyagi-sensei-098.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 204
};

// プリフライトリクエストの処理
app.options('*', cors(corsOptions));

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
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const log = (message, data = {}) => {
        console.log(`[${new Date().toISOString()}] [${requestId}] ${message}`, JSON.stringify(data));
    };

    log('翻訳リクエスト受信', {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body
    });

    // CORSプリフライトリクエストの処理
    if (req.method === 'OPTIONS') {
        log('CORSプリフライトリクエストを処理');
        return res.status(200).end();
    }

    try {
        const { text, targetLang, sourceLang = 'auto' } = req.body;
        
        // 必須パラメータの検証
        if (!text || !targetLang) {
            const error = {
                error: 'テキストとターゲット言語を指定してください',
                received: { 
                    text: !!text, 
                    targetLang: !!targetLang,
                    sourceLang: sourceLang
                }
            };
            log('パラメータ検証エラー', error);
            return res.status(400).json(error);
        }

        // APIキーの検証
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            const error = { error: 'サーバー設定エラー: APIキーが設定されていません' };
            log('APIキーエラー', error);
            return res.status(500).json(error);
        }

        // プロンプトの作成
        const prompt = `Translate the following text from ${sourceLang === 'auto' ? 'auto-detected language' : sourceLang} to ${targetLang}: ${text}`;
        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        
        log('Gemini APIリクエスト作成', {
            url: apiUrl,
            promptLength: prompt.length,
            sourceLang,
            targetLang
        });

        // Gemini APIへのリクエスト
        const startTime = Date.now();
        let response;
        try {
            response = await fetch(`${apiUrl}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        topP: 0.8,
                        topK: 40
                    }
                }),
                timeout: 30000 // 30秒のタイムアウト
            });
        } catch (fetchError) {
            log('Gemini APIリクエストエラー', {
                error: fetchError.message,
                stack: fetchError.stack,
                name: fetchError.name
            });
            return res.status(500).json({
                error: '翻訳サービスに接続できませんでした',
                details: fetchError.message
            });
        }

        const responseTime = Date.now() - startTime;
        const responseText = await response.text();
        
        log('Gemini APIレスポンス受信', {
            status: response.status,
            statusText: response.statusText,
            responseTime: `${responseTime}ms`,
            responseLength: responseText.length
        });

        // エラーレスポンスの処理
        if (!response.ok) {
            let errorData;
            try {
                errorData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                errorData = { 
                    error: '無効なJSONレスポンス',
                    details: responseText.substring(0, 500)
                };
            }
            
            log('Gemini APIエラー', {
                status: response.status,
                error: errorData,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            return res.status(response.status).json({
                error: '翻訳サービスでエラーが発生しました',
                status: response.status,
                details: errorData
            });
        }

        // レスポンスのパース
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
            log('JSONパースエラー', {
                error: parseError.message,
                response: responseText.substring(0, 500)
            });
            return res.status(500).json({
                error: '翻訳結果の解析に失敗しました',
                details: parseError.message
            });
        }

        // 翻訳結果の抽出
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || text;
        
        log('翻訳成功', {
            originalLength: text.length,
            translatedLength: translatedText.length,
            responseTime: `${responseTime}ms`
        });
        
        // 成功レスポンス
        res.json({
            translatedText: translatedText.trim(),
            detectedSourceLanguage: sourceLang === 'auto' ? 'auto-detected' : sourceLang,
            requestId: requestId
        });
        
    } catch (error) {
        log('予期せぬエラー', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        res.status(500).json({
            error: '翻訳処理中に予期せぬエラーが発生しました',
            requestId: requestId,
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
