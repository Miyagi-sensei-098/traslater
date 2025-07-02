// バックエンドAPIのエンドポイント
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://translater-api.vercel.app';
console.log('API Base URL:', API_BASE_URL);

// 言語コードと表示名のマッピング
const LANGUAGES = {
    'ja': { name: '日本語', flag: '🇯🇵' },
    'en': { name: '英語', flag: '🇺🇸' },
    'es': { name: 'スペイン語', flag: '🇪🇸' },
    'pt': { name: 'ポルトガル語', flag: '🇧🇷' }
};

// DOM要素の取得
const sourceText = document.getElementById('sourceText');
const sourceLanguage = document.getElementById('sourceLanguage');
const translateBtn = document.getElementById('translateBtn');
const translationCards = document.querySelectorAll('.card');

// 翻訳リクエスト用のタイマー
let translateTimer = null;

// 翻訳関数
async function translateText(text, targetLang, sourceLang = 'auto') {
    if (!text.trim()) return '';
    
    console.log(`翻訳リクエスト: ${text} (${sourceLang} -> ${targetLang})`);
    
    // 翻訳先がソース言語と同じ場合は翻訳不要
    if (sourceLang !== 'auto' && targetLang === sourceLang) {
        return text;
    }
    
    // リクエストボディの作成
    const requestBody = {
        text: text,
        targetLang: targetLang,
        sourceLang: sourceLang
    };
    
    console.log('リクエストボディ:', JSON.stringify(requestBody, null, 2));
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log(`レスポンスステータス: ${response.status} ${response.statusText}`);
        
        // レスポンスの内容をテキストとして取得
        const responseText = await response.text();
        console.log('レスポンス本文:', responseText);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                errorData = { error: '無効なJSONレスポンス', details: responseText };
            }
            console.error('APIエラー詳細:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
                headers: Object.fromEntries(response.headers.entries())
            });
            throw new Error(errorData.error || `HTTPエラー: ${response.status} ${response.statusText}`);
        }
        
        // レスポンスをJSONとしてパース
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            console.error('JSONパースエラー:', e, 'レスポンス:', responseText);
            throw new Error('サーバーからの応答を処理できませんでした');
        }
        
        console.log('翻訳結果:', data);
        
        if (!data.translatedText) {
            console.warn('翻訳結果が空です:', data);
            return '翻訳結果が空です';
        }
        
        return data.translatedText;
    } catch (error) {
        console.error('翻訳エラー詳細:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            timestamp: new Date().toISOString()
        });
        
        // エラーメッセージをユーザーフレンドリーに
        let errorMessage = '翻訳中にエラーが発生しました';
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'サーバーに接続できません。インターネット接続を確認してください。';
        } else if (error.message.includes('500')) {
            errorMessage = 'サーバーエラーが発生しました。しばらくしてからお試しください。';
        } else if (error.message.includes('405')) {
            errorMessage = 'リクエストが拒否されました。ページをリロードしてください。';
        }
        
        return `エラー: ${errorMessage}`;
    }
}

// 言語検出関数（簡易版）
function detectLanguage(text) {
    // 実際には言語検出APIを使用することをお勧めします
    // ここでは簡易的な実装をしています
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\uFF65-\uFF9F]/;
    const englishRegex = /[a-zA-Z]/;
    const spanishRegex = /[áéíóúüñÁÉÍÓÚÜÑ]/;
    const portugueseRegex = /[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/;
    
    if (japaneseRegex.test(text)) return 'ja';
    if (spanishRegex.test(text)) return 'es';
    if (portugueseRegex.test(text)) return 'pt';
    if (englishRegex.test(text)) return 'en';
    
    // デフォルトは英語
    return 'en';
}

// 翻訳を実行する関数
async function performTranslation() {
    const text = sourceText.value.trim();
    if (!text) {
        // テキストが空の場合は翻訳をクリア
        clearTranslations();
        return;
    }
    
    const sourceLang = sourceLanguage.value;
    const detectedLang = sourceLang === 'auto' ? detectLanguage(text) : sourceLang;
    
    // 各言語カードに対して翻訳を実行
    translationCards.forEach(async (card) => {
        const targetLang = card.dataset.lang;
        const textElement = card.querySelector('.translated-text');
        
        // ローディング表示
        textElement.textContent = '翻訳中...';
        textElement.classList.add('loading');
        
        try {
            // 翻訳を実行
            const translatedText = await translateText(text, targetLang, detectedLang);
            
            // 結果を表示
            textElement.textContent = translatedText;
        } catch (error) {
            textElement.textContent = '翻訳中にエラーが発生しました。';
            console.error('翻訳エラー:', error);
        } finally {
            textElement.classList.remove('loading');
        }
    });
}

// 翻訳結果をクリアする関数
function clearTranslations() {
    translationCards.forEach(card => {
        const textElement = card.querySelector('.translated-text');
        textElement.textContent = '';
        textElement.classList.remove('loading');
    });
}

// テキストをクリップボードにコピーする関数
async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        
        // ボタンのテキストを一時的に変更
        const originalText = button.textContent;
        button.textContent = 'コピーしました！';
        button.classList.add('copied');
        
        // 2秒後に元に戻す
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('クリップボードへのコピーに失敗しました:', err);
        alert('クリップボードへのコピーに失敗しました');
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // 翻訳ボタンクリック時
    translateBtn.addEventListener('click', performTranslation);
    
    // リアルタイム翻訳（入力から500ms後に実行）
    sourceText.addEventListener('input', () => {
        // タイマーをリセット
        clearTimeout(translateTimer);
        
        // テキストが空の場合は翻訳をクリア
        if (!sourceText.value.trim()) {
            clearTranslations();
            return;
        }
        
        // 500ms後に翻訳を実行
        translateTimer = setTimeout(performTranslation, 500);
    });
    
    // コピーボタンクリック時
    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const lang = e.currentTarget.dataset.lang;
            const card = document.querySelector(`.card[data-lang="${lang}"]`);
            const text = card.querySelector('.translated-text').textContent;
            
            if (text && !text.includes('翻訳中')) {
                copyToClipboard(text, e.currentTarget);
            }
        });
    });
}

// 初期化
function init() {
    setupEventListeners();
    
    // デモ用の初期テキスト（本番環境では削除）
    sourceText.value = 'こんにちは、世界！';
    // 初期翻訳を実行
    performTranslation();
}

// ドキュメント読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', init);
