// ==UserScript==
// @name        Yahoo!リアルタイム検索ツイート非表示 (リファクタ版)
// @namespace   http://tampermonkey.net/
// @version     3.0
// @description 指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。（リファクタ版）
// @author      Refactored Version
// @match       https://search.yahoo.co.jp/realtime*
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

/**
 * Yahoo!リアルタイム検索ツイート非表示スクリプト
 * パフォーマンスと保守性を向上させたリファクタ版
 */
(() => {
    'use strict';

    // ===========================
    // 設定と定数
    // ===========================
    const CONFIG = Object.freeze({
        // 事前ブロックユーザー設定
        predefinedBlockedUsers: [],
        
        // ストレージキー
        STORAGE_KEYS: {
            HIDDEN_USERS: 'yahooTweetHider_hiddenUsers_v3',
            HIDDEN_TWEETS: 'yahooTweetHider_hiddenTweets_v3'
        },
        
        // セレクター定義
        SELECTORS: {
            TWEET_CONTAINER: '.Tweet_bodyContainer__ud_57',
            AUTHOR_ID: '.Tweet_authorID__JKhEb',
            AUTHOR_NAME: '.Tweet_authorName__wer3j',
            INFO_CONTAINER: '.Tweet_info__bBT3t',
            TWEET_LIST: '.TweetList_list__Xf9wM',
            FULL_TWEET: '.Tweet_Tweet__sna2i',
            FULL_TWEET_CONTAINER: '.Tweet_TweetContainer__aezGm',
            DELETE_BUTTON: '.tweet-hider-delete-btn',
            MANAGE_BUTTON: '.tweet-hider-manage-btn'
        },
        
        // UI設定
        UI: {
            DEBOUNCE_DELAY: 150,
            STATS_INTERVAL: 5 * 60 * 1000,
            BUTTON_TEXT: {
                HIDE: '非表示',
                MANAGE: '非表示管理'
            }
        }
    });

    // ===========================
    // ユーティリティ関数
    // ===========================
    
    /**
     * デバウンス関数
     * @param {Function} func - 実行する関数
     * @param {number} delay - 遅延時間（ミリ秒）
     * @returns {Function} デバウンスされた関数
     */
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    /**
     * 安全なDOM要素取得
     * @param {Element} parent - 親要素
     * @param {string} selector - セレクター
     * @returns {Element|null} 見つかった要素またはnull
     */
    const safeQuerySelector = (parent, selector) => {
        try {
            return parent?.querySelector(selector) || null;
        } catch (error) {
            console.warn(`セレクター "${selector}" でエラー:`, error);
            return null;
        }
    };

    /**
     * 安全なローカルストレージ操作
     */
    const SafeStorage = {
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.warn(`ストレージ読み込みエラー [${key}]:`, error);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn(`ストレージ保存エラー [${key}]:`, error);
                return false;
            }
        }
    };

    // ===========================
    // ロガークラス
    // ===========================
    class Logger {
        constructor(prefix = '[Yahoo Tweet Hider v3]') {
            this.prefix = prefix;
            this.debugMode = false;
        }

        setDebugMode(enabled) {
            this.debugMode = enabled;
            this.info(`デバッグモード: ${enabled ? '有効' : '無効'}`);
        }

        _log(level, emoji, message, data) {
            const logMethod = level === 'error' ? console.error : console.log;
            const logMessage = `${this.prefix} ${emoji} ${message}`;
            
            if (data !== undefined) {
                logMethod(logMessage, data);
            } else {
                logMethod(logMessage);
            }
        }

        info(message, data) { this._log('info', 'ℹ️', message, data); }
        success(message, data) { this._log('success', '✅', message, data); }
        warn(message, data) { this._log('warn', '⚠️', message, data); }
        error(message, data) { this._log('error', '❌', message, data); }
        
        debug(message, data) {
            if (this.debugMode) {
                this._log('debug', '🐛', message, data);
            }
        }

        stats(message, data) { this._log('stats', '📊', message, data); }
    }

    // ===========================
    // データ管理クラス
    // ===========================
    class HiddenDataManager {
        constructor() {
            this.hiddenUsers = new Set(this._loadHiddenUsers());
            this.hiddenTweets = new Set(this._loadHiddenTweets());
        }

        _loadHiddenUsers() {
            const stored = SafeStorage.get(CONFIG.STORAGE_KEYS.HIDDEN_USERS, []);
            return [...CONFIG.predefinedBlockedUsers, ...stored];
        }

        _loadHiddenTweets() {
            return SafeStorage.get(CONFIG.STORAGE_KEYS.HIDDEN_TWEETS, []);
        }

        _saveHiddenUsers() {
            const usersToSave = [...this.hiddenUsers].filter(
                user => !CONFIG.predefinedBlockedUsers.includes(user)
            );
            return SafeStorage.set(CONFIG.STORAGE_KEYS.HIDDEN_USERS, usersToSave);
        }

        _saveHiddenTweets() {
            return SafeStorage.set(CONFIG.STORAGE_KEYS.HIDDEN_TWEETS, [...this.hiddenTweets]);
        }

        addUser(userId) {
            this.hiddenUsers.add(userId);
            return this._saveHiddenUsers();
        }

        removeUser(userId) {
            const wasDeleted = this.hiddenUsers.delete(userId);
            if (wasDeleted) {
                this._saveHiddenUsers();
            }
            return wasDeleted;
        }

        addTweet(tweetId) {
            this.hiddenTweets.add(tweetId);
            return this._saveHiddenTweets();
        }

        isUserHidden(userId) {
            return this.hiddenUsers.has(userId);
        }

        isTweetHidden(tweetId) {
            return this.hiddenTweets.has(tweetId);
        }

        getHiddenUsersList() {
            return [...this.hiddenUsers];
        }

        getStats() {
            return {
                hiddenUsers: this.hiddenUsers.size,
                hiddenTweets: this.hiddenTweets.size
            };
        }
    }

    // ===========================
    // ツイート処理クラス
    // ===========================
    class TweetProcessor {
        constructor(dataManager, logger) {
            this.dataManager = dataManager;
            this.logger = logger;
            this.processedTweets = new WeakSet();
        }

        /**
         * ツイートからユーザーIDを抽出
         * @param {Element} tweetElement - ツイート要素
         * @returns {string|null} ユーザーID
         */
        extractUserId(tweetElement) {
            const authorElement = safeQuerySelector(tweetElement, CONFIG.SELECTORS.AUTHOR_ID);
            return authorElement?.textContent?.replace('@', '').trim() || null;
        }

        /**
         * ツイートからユーザー名を抽出
         * @param {Element} tweetElement - ツイート要素
         * @returns {string} ユーザー名
         */
        extractUserName(tweetElement) {
            const nameElement = safeQuerySelector(tweetElement, CONFIG.SELECTORS.AUTHOR_NAME);
            return nameElement?.textContent?.trim() || 'Unknown User';
        }

        /**
         * ツイート要素からユニークIDを生成
         * @param {Element} tweetElement - ツイート要素
         * @returns {string} ツイートID
         */
        generateTweetId(tweetElement) {
            try {
                const textContent = tweetElement.textContent?.trim().substring(0, 100) || '';
                const timestamp = Date.now().toString();
                return btoa(textContent + timestamp).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            } catch (error) {
                this.logger.warn('ツイートID生成エラー:', error);
                return `tweet_${Math.random().toString(36).substring(2, 15)}`;
            }
        }

        /**
         * ツイート要素を非表示にする
         * @param {Element} tweetElement - ツイート要素
         */
        hideTweetElement(tweetElement) {
            try {
                const container = tweetElement.closest(CONFIG.SELECTORS.FULL_TWEET_CONTAINER) ||
                                tweetElement.closest(CONFIG.SELECTORS.FULL_TWEET);
                
                if (container) {
                    container.style.display = 'none';
                    this.logger.debug('ツイートコンテナを非表示にしました');
                } else {
                    tweetElement.style.display = 'none';
                    this.logger.debug('ツイート要素を非表示にしました');
                }
            } catch (error) {
                this.logger.error('ツイート非表示エラー:', error);
            }
        }

        /**
         * 特定ユーザーの全ツイートを非表示
         * @param {string} userId - ユーザーID
         */
        hideAllUserTweets(userId) {
            let hiddenCount = 0;
            const tweets = document.querySelectorAll(CONFIG.SELECTORS.TWEET_CONTAINER);
            
            tweets.forEach(tweet => {
                const tweetUserId = this.extractUserId(tweet);
                if (tweetUserId === userId) {
                    this.hideTweetElement(tweet);
                    hiddenCount++;
                }
            });

            this.logger.success(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示`);
            return hiddenCount;
        }

        /**
         * 削除ボタンを作成
         * @param {Element} tweetElement - ツイート要素
         * @param {string} userId - ユーザーID
         * @returns {HTMLButtonElement} 削除ボタン
         */
        createHideButton(tweetElement, userId) {
            const button = document.createElement('button');
            button.textContent = CONFIG.UI.BUTTON_TEXT.HIDE;
            button.className = 'tweet-hider-delete-btn';
            button.title = 'このツイートまたはユーザーを非表示にします';
            
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.handleHideButtonClick(tweetElement, userId);
            });

            return button;
        }

        /**
         * 削除ボタンクリック時の処理
         * @param {Element} tweetElement - ツイート要素
         * @param {string} userId - ユーザーID
         */
        handleHideButtonClick(tweetElement, userId) {
            try {
                const userName = this.extractUserName(tweetElement);
                const tweetId = this.generateTweetId(tweetElement);

                const confirmMessage = 
                    `このユーザーのツイートを非表示にしますか？\n\n` +
                    `ユーザー: ${userName} (@${userId})\n\n` +
                    `「OK」: このユーザーの全ツイートを非表示\n` +
                    `「キャンセル」: このツイートのみ非表示`;

                const hideAllTweets = confirm(confirmMessage);

                if (hideAllTweets) {
                    this.dataManager.addUser(userId);
                    this.hideAllUserTweets(userId);
                    this.logger.success(`ユーザー @${userId} を非表示リストに追加`);
                } else {
                    this.dataManager.addTweet(tweetId);
                    this.hideTweetElement(tweetElement);
                    this.logger.info(`ツイートを非表示: ${userName}`);
                }
            } catch (error) {
                this.logger.error('削除ボタン処理エラー:', error);
            }
        }

        /**
         * 単一ツイートを処理
         * @param {Element} tweetElement - ツイート要素
         */
        processSingleTweet(tweetElement) {
            // 既に処理済みかチェック
            if (this.processedTweets.has(tweetElement)) {
                return;
            }

            try {
                const userId = this.extractUserId(tweetElement);
                if (!userId) {
                    this.logger.debug('ユーザーIDが取得できないツイートをスキップ');
                    return;
                }

                const tweetId = this.generateTweetId(tweetElement);

                // 非表示対象かチェック
                if (this.dataManager.isUserHidden(userId) || this.dataManager.isTweetHidden(tweetId)) {
                    this.hideTweetElement(tweetElement);
                    this.processedTweets.add(tweetElement);
                    return;
                }

                // 既に削除ボタンが存在するかチェック
                if (safeQuerySelector(tweetElement, CONFIG.SELECTORS.DELETE_BUTTON)) {
                    this.processedTweets.add(tweetElement);
                    return;
                }

                // 削除ボタンを追加
                const infoContainer = safeQuerySelector(tweetElement, CONFIG.SELECTORS.INFO_CONTAINER);
                if (infoContainer) {
                    const hideButton = this.createHideButton(tweetElement, userId);
                    infoContainer.appendChild(hideButton);
                    this.logger.debug(`削除ボタン追加: @${userId}`);
                }

                this.processedTweets.add(tweetElement);
            } catch (error) {
                this.logger.error('ツイート処理エラー:', error);
            }
        }

        /**
         * 全ツイートを処理
         */
        processAllTweets() {
            try {
                const tweets = document.querySelectorAll(CONFIG.SELECTORS.TWEET_CONTAINER);
                this.logger.debug(`${tweets.length} 件のツイートを処理中...`);
                
                tweets.forEach(tweet => this.processSingleTweet(tweet));
                
                this.logger.debug('全ツイート処理完了');
            } catch (error) {
                this.logger.error('全ツイート処理エラー:', error);
            }
        }
    }

    // ===========================
    // UI管理クラス
    // ===========================
    class UIManager {
        constructor(dataManager, logger) {
            this.dataManager = dataManager;
            this.logger = logger;
            this.addStyles();
        }

        addStyles() {
            const styles = `
                .tweet-hider-delete-btn {
                    margin-left: 8px;
                    padding: 2px 6px;
                    background-color: #ff4444;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    line-height: 1.2;
                }
                
                .tweet-hider-delete-btn:hover {
                    background-color: #cc3333;
                    transform: scale(1.05);
                }
                
                .tweet-hider-manage-btn {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 10000;
                    padding: 8px 12px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    transition: background-color 0.2s ease;
                }
                
                .tweet-hider-manage-btn:hover {
                    background-color: #0056b3;
                }
            `;
            
            GM_addStyle(styles);
        }

        createManageButton() {
            // 既存のボタンをチェック
            if (document.querySelector(CONFIG.SELECTORS.MANAGE_BUTTON)) {
                return;
            }

            const button = document.createElement('button');
            button.textContent = CONFIG.UI.BUTTON_TEXT.MANAGE;
            button.className = 'tweet-hider-manage-btn';
            button.title = '非表示にしたユーザーを管理します';
            
            button.addEventListener('click', () => this.showManagementPanel());
            
            document.body.appendChild(button);
            this.logger.success('管理ボタンを作成');
        }

        showManagementPanel() {
            try {
                const hiddenUsers = this.dataManager.getHiddenUsersList();
                
                if (hiddenUsers.length === 0) {
                    alert('非表示ユーザーはいません。');
                    return;
                }

                let message = '=== 非表示ユーザー管理 ===\n\n';
                hiddenUsers.forEach((user, index) => {
                    message += `${index + 1}. @${user}\n`;
                });
                message += '\n表示に戻すユーザー番号を入力してください\n（キャンセルで閉じる）:';

                const input = prompt(message);
                if (!input) return;

                const userIndex = parseInt(input) - 1;
                if (userIndex >= 0 && userIndex < hiddenUsers.length) {
                    const userToShow = hiddenUsers[userIndex];
                    const confirmMessage = `@${userToShow} を表示に戻しますか？\nページを再読み込みすると変更が反映されます。`;
                    
                    if (confirm(confirmMessage)) {
                        if (this.dataManager.removeUser(userToShow)) {
                            alert(`@${userToShow} を表示に戻しました。\nページを再読み込みしてください。`);
                            this.logger.success(`ユーザー @${userToShow} を非表示リストから削除`);
                        } else {
                            alert('削除に失敗しました。');
                        }
                    }
                } else {
                    alert('無効な番号です。');
                }
            } catch (error) {
                this.logger.error('管理パネルエラー:', error);
                alert('管理パネルの表示中にエラーが発生しました。');
            }
        }
    }

    // ===========================
    // メインアプリケーションクラス
    // ===========================
    class YahooTweetHider {
        constructor() {
            this.logger = new Logger();
            this.dataManager = new HiddenDataManager();
            this.tweetProcessor = new TweetProcessor(this.dataManager, this.logger);
            this.uiManager = new UIManager(this.dataManager, this.logger);
            this.observer = null;
            this.isInitialized = false;
        }

        /**
         * DOM監視を開始
         */
        startObservation() {
            try {
                const targetNode = document.querySelector(CONFIG.SELECTORS.TWEET_LIST) || document.body;
                
                if (targetNode === document.body) {
                    this.logger.warn('ツイートリストが見つからないため、body要素を監視します');
                } else {
                    this.logger.success('ツイートリストの監視を開始');
                }

                const debouncedProcessor = debounce(() => {
                    this.logger.debug('DOM変更を検出、処理実行');
                    this.tweetProcessor.processAllTweets();
                }, CONFIG.UI.DEBOUNCE_DELAY);

                this.observer = new MutationObserver(debouncedProcessor);
                this.observer.observe(targetNode, {
                    childList: true,
                    subtree: true
                });

            } catch (error) {
                this.logger.error('DOM監視開始エラー:', error);
            }
        }

        /**
         * 定期統計出力を開始
         */
        startStatsReporting() {
            setInterval(() => {
                const stats = this.dataManager.getStats();
                const processedElements = document.querySelectorAll(CONFIG.SELECTORS.DELETE_BUTTON).length;
                
                this.logger.stats('現在の統計', {
                    '非表示ユーザー数': stats.hiddenUsers,
                    '非表示ツイート数': stats.hiddenTweets,
                    '処理済み要素数': processedElements
                });
            }, CONFIG.UI.STATS_INTERVAL);
        }

        /**
         * 初期化処理
         */
        async initialize() {
            if (this.isInitialized) {
                this.logger.warn('既に初期化済みです');
                return;
            }

            try {
                this.logger.info('Yahoo!リアルタイム検索ツイート非表示スクリプト v3.0 開始');
                
                // 初回処理
                this.tweetProcessor.processAllTweets();
                
                // UI作成
                this.uiManager.createManageButton();
                
                // 監視開始
                this.startObservation();
                
                // 統計出力開始
                this.startStatsReporting();

                // グローバル公開（デバッグ用）
                window.tweetHider = {
                    logger: this.logger,
                    stats: () => this.dataManager.getStats(),
                    enableDebug: () => this.logger.setDebugMode(true),
                    disableDebug: () => this.logger.setDebugMode(false)
                };

                this.isInitialized = true;
                this.logger.success('初期化完了');
                
                // 使用方法を表示
                console.log(`
${this.logger.prefix} ✨ スクリプト起動完了！

📋 使用方法:
• 各ツイートに「非表示」ボタンが追加されます
• ボタンをクリックしてユーザー全体またはツイート単体を非表示
• 右上の「非表示管理」ボタンで設定を管理

🔧 デバッグコマンド:
• window.tweetHider.enableDebug()  - デバッグモード有効
• window.tweetHider.disableDebug() - デバッグモード無効
• window.tweetHider.stats()        - 現在の統計を表示
                `);
                
            } catch (error) {
                this.logger.error('初期化エラー:', error);
            }
        }

        /**
         * 破棄処理
         */
        destroy() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            
            // 管理ボタン削除
            const manageButton = document.querySelector(CONFIG.SELECTORS.MANAGE_BUTTON);
            if (manageButton) {
                manageButton.remove();
            }
            
            this.isInitialized = false;
            this.logger.info('スクリプトを破棄しました');
        }
    }

    // ===========================
    // アプリケーション開始
    // ===========================
    
    // DOM読み込み完了を待機
    const startApp = () => {
        const app = new YahooTweetHider();
        app.initialize();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }

})();
