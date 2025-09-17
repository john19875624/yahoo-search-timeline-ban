// ==UserScript==
// @name        Yahoo!リアルタイム検索ツイート非表示 (リファクタ版)
// @namespace   http://tampermonkey.net/
// @version     4.0
// @description 指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。（高度リファクタ版）
// @author      Advanced Refactored Version
// @match       https://search.yahoo.co.jp/realtime*
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

/**
 * Yahoo!リアルタイム検索ツイート非表示スクリプト
 * 高度なリファクタリングによる保守性・拡張性・パフォーマンスの向上
 * 
 * 主な改善点:
 * - エラーハンドリングの強化
 * - 型安全性の向上
 * - モジュール化の改善
 * - パフォーマンス最適化
 * - テスタビリティの向上
 */
(() => {
    'use strict';

    // ===========================
    // 型定義とインターフェース
    // ===========================
    
    /**
     * @typedef {Object} TweetData
     * @property {string} id - ツイートID
     * @property {string} userId - ユーザーID
     * @property {string} userName - ユーザー名
     * @property {Element} element - DOM要素
     */

    /**
     * @typedef {Object} HiddenDataStats
     * @property {number} hiddenUsers - 非表示ユーザー数
     * @property {number} hiddenTweets - 非表示ツイート数
     * @property {number} totalHidden - 合計非表示数
     */

    // ===========================
    // 設定と定数
    // ===========================
    const CONFIG = Object.freeze({
        // バージョン情報
        VERSION: '4.0',
        SCRIPT_NAME: 'Yahoo Tweet Hider',
        
        // 事前ブロックユーザー設定
        PREDEFINED_BLOCKED_USERS: Object.freeze([]),
        
        // ストレージキー
        STORAGE_KEYS: Object.freeze({
            HIDDEN_USERS: 'yahooTweetHider_hiddenUsers_v4',
            HIDDEN_TWEETS: 'yahooTweetHider_hiddenTweets_v4',
            SETTINGS: 'yahooTweetHider_settings_v4'
        }),
        
        // セレクター定義
        SELECTORS: Object.freeze({
            TWEET_CONTAINER: '.Tweet_bodyContainer__ud_57',
            AUTHOR_ID: '.Tweet_authorID__JKhEb',
            AUTHOR_NAME: '.Tweet_authorName__wer3j',
            INFO_CONTAINER: '.Tweet_info__bBT3t',
            TWEET_LIST: '.TweetList_list__Xf9wM',
            FULL_TWEET: '.Tweet_Tweet__sna2i',
            FULL_TWEET_CONTAINER: '.Tweet_TweetContainer__aezGm',
            DELETE_BUTTON: '.tweet-hider-delete-btn',
            MANAGE_BUTTON: '.tweet-hider-manage-btn'
        }),
        
        // UI設定
        UI: Object.freeze({
            DEBOUNCE_DELAY: 150,
            STATS_INTERVAL: 5 * 60 * 1000,
            ANIMATION_DURATION: 300,
            BUTTON_TEXT: Object.freeze({
                HIDE: '非表示',
                MANAGE: '非表示管理',
                RESTORE: '復元'
            }),
            COLORS: Object.freeze({
                DANGER: '#ff4444',
                DANGER_HOVER: '#cc3333',
                PRIMARY: '#007bff',
                PRIMARY_HOVER: '#0056b3',
                SUCCESS: '#28a745',
                WARNING: '#ffc107'
            })
        }),

        // パフォーマンス設定
        PERFORMANCE: Object.freeze({
            MAX_PROCESSED_CACHE: 1000,
            BATCH_SIZE: 50,
            THROTTLE_DELAY: 100
        })
    });

    // ===========================
    // ユーティリティ関数群
    // ===========================
    
    const Utils = Object.freeze({
        /**
         * デバウンス関数
         */
        debounce(func, delay) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
        },

        /**
         * スロットル関数
         */
        throttle(func, delay) {
            let lastCall = 0;
            return function(...args) {
                const now = Date.now();
                if (now - lastCall >= delay) {
                    lastCall = now;
                    return func.apply(this, args);
                }
            };
        },

        /**
         * 安全なDOM要素取得
         */
        safeQuerySelector(parent, selector) {
            try {
                return parent?.querySelector?.(selector) || null;
            } catch (error) {
                console.warn(`セレクターエラー "${selector}":`, error);
                return null;
            }
        },

        /**
         * 複数要素の安全な取得
         */
        safeQuerySelectorAll(parent, selector) {
            try {
                return Array.from(parent?.querySelectorAll?.(selector) || []);
            } catch (error) {
                console.warn(`セレクターエラー "${selector}":`, error);
                return [];
            }
        },

        /**
         * 要素の表示/非表示を切り替え
         */
        toggleElementVisibility(element, visible, animated = true) {
            if (!element) return false;
            
            try {
                if (animated && typeof element.animate === 'function') {
                    const keyframes = visible 
                        ? [{ opacity: 0, transform: 'scale(0.95)' }, { opacity: 1, transform: 'scale(1)' }]
                        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.95)' }];
                    
                    const animation = element.animate(keyframes, {
                        duration: CONFIG.UI.ANIMATION_DURATION,
                        easing: 'ease-out'
                    });
                    
                    animation.onfinish = () => {
                        element.style.display = visible ? '' : 'none';
                    };
                } else {
                    element.style.display = visible ? '' : 'none';
                }
                return true;
            } catch (error) {
                console.warn('要素表示切り替えエラー:', error);
                element.style.display = visible ? '' : 'none';
                return false;
            }
        },

        /**
         * ハッシュ生成
         */
        generateHash(str) {
            if (!str) return Math.random().toString(36).substring(2, 15);
            
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // 32bit整数に変換
            }
            return Math.abs(hash).toString(36);
        },

        /**
         * 配列をバッチ処理
         */
        processBatch(array, batchSize, processor) {
            const results = [];
            for (let i = 0; i < array.length; i += batchSize) {
                const batch = array.slice(i, i + batchSize);
                results.push(...processor(batch));
            }
            return results;
        }
    });

    // ===========================
    // エラーハンドリングクラス
    // ===========================
    class ErrorHandler {
        constructor(logger) {
            this.logger = logger;
            this.errorCount = 0;
            this.maxErrors = 100;
        }

        handle(error, context = 'Unknown', shouldThrow = false) {
            this.errorCount++;
            
            const errorInfo = {
                message: error.message || '不明なエラー',
                stack: error.stack,
                context,
                timestamp: new Date().toISOString(),
                count: this.errorCount
            };

            this.logger.error(`[${context}] エラー発生:`, errorInfo);

            if (this.errorCount > this.maxErrors) {
                this.logger.error('エラー数が上限に達しました。スクリプトを停止します。');
                throw new Error('Too many errors occurred');
            }

            if (shouldThrow) {
                throw error;
            }

            return errorInfo;
        }

        reset() {
            this.errorCount = 0;
            this.logger.info('エラーカウントをリセットしました');
        }

        getStats() {
            return {
                errorCount: this.errorCount,
                maxErrors: this.maxErrors
            };
        }
    }

    // ===========================
    // ロガークラス（改良版）
    // ===========================
    class Logger {
        constructor(prefix = `[${CONFIG.SCRIPT_NAME} v${CONFIG.VERSION}]`) {
            this.prefix = prefix;
            this.debugMode = false;
            this.logHistory = [];
            this.maxHistorySize = 1000;
        }

        setDebugMode(enabled) {
            this.debugMode = Boolean(enabled);
            this.info(`デバッグモード: ${enabled ? '有効' : '無効'}`);
        }

        _log(level, emoji, message, data) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level,
                message,
                data
            };

            // 履歴に追加
            this.logHistory.push(logEntry);
            if (this.logHistory.length > this.maxHistorySize) {
                this.logHistory.shift();
            }

            // コンソール出力
            const logMethod = level === 'error' ? console.error : 
                             level === 'warn' ? console.warn : console.log;
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

        getHistory(level = null) {
            return level 
                ? this.logHistory.filter(entry => entry.level === level)
                : [...this.logHistory];
        }

        clearHistory() {
            this.logHistory.length = 0;
            this.info('ログ履歴をクリアしました');
        }
    }

    // ===========================
    // 安全なストレージクラス
    // ===========================
    class SafeStorage {
        constructor(logger) {
            this.logger = logger;
            this.available = this._checkAvailability();
        }

        _checkAvailability() {
            try {
                const test = '__storage_test__';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return true;
            } catch (error) {
                this.logger.warn('LocalStorageが利用できません:', error);
                return false;
            }
        }

        get(key, defaultValue = null) {
            if (!this.available) return defaultValue;

            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                this.logger.warn(`ストレージ読み込みエラー [${key}]:`, error);
                return defaultValue;
            }
        }

        set(key, value) {
            if (!this.available) return false;

            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                this.logger.warn(`ストレージ保存エラー [${key}]:`, error);
                return false;
            }
        }

        remove(key) {
            if (!this.available) return false;

            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                this.logger.warn(`ストレージ削除エラー [${key}]:`, error);
                return false;
            }
        }

        clear() {
            if (!this.available) return false;

            try {
                Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });
                return true;
            } catch (error) {
                this.logger.warn('ストレージクリアエラー:', error);
                return false;
            }
        }

        isAvailable() {
            return this.available;
        }
    }

    // ===========================
    // データ管理クラス（改良版）
    // ===========================
    class HiddenDataManager {
        constructor(storage, logger) {
            this.storage = storage;
            this.logger = logger;
            this.hiddenUsers = new Set();
            this.hiddenTweets = new Set();
            this.settings = {};
            this._loadData();
        }

        _loadData() {
            try {
                const users = this.storage.get(CONFIG.STORAGE_KEYS.HIDDEN_USERS, []);
                const tweets = this.storage.get(CONFIG.STORAGE_KEYS.HIDDEN_TWEETS, []);
                const settings = this.storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});

                this.hiddenUsers = new Set([...CONFIG.PREDEFINED_BLOCKED_USERS, ...users]);
                this.hiddenTweets = new Set(tweets);
                this.settings = { ...this._getDefaultSettings(), ...settings };

                this.logger.debug('データ読み込み完了', {
                    users: this.hiddenUsers.size,
                    tweets: this.hiddenTweets.size
                });
            } catch (error) {
                this.logger.error('データ読み込みエラー:', error);
                this._resetData();
            }
        }

        _getDefaultSettings() {
            return {
                animationsEnabled: true,
                autoHideEnabled: true,
                debugMode: false
            };
        }

        _resetData() {
            this.hiddenUsers = new Set(CONFIG.PREDEFINED_BLOCKED_USERS);
            this.hiddenTweets = new Set();
            this.settings = this._getDefaultSettings();
            this.logger.warn('データをリセットしました');
        }

        _saveUsers() {
            const usersToSave = [...this.hiddenUsers].filter(
                user => !CONFIG.PREDEFINED_BLOCKED_USERS.includes(user)
            );
            return this.storage.set(CONFIG.STORAGE_KEYS.HIDDEN_USERS, usersToSave);
        }

        _saveTweets() {
            return this.storage.set(CONFIG.STORAGE_KEYS.HIDDEN_TWEETS, [...this.hiddenTweets]);
        }

        _saveSettings() {
            return this.storage.set(CONFIG.STORAGE_KEYS.SETTINGS, this.settings);
        }

        // ユーザー管理
        addUser(userId) {
            if (!userId || typeof userId !== 'string') return false;
            
            this.hiddenUsers.add(userId);
            const success = this._saveUsers();
            if (success) {
                this.logger.success(`ユーザー追加: @${userId}`);
            }
            return success;
        }

        removeUser(userId) {
            const wasDeleted = this.hiddenUsers.delete(userId);
            if (wasDeleted) {
                this._saveUsers();
                this.logger.success(`ユーザー削除: @${userId}`);
            }
            return wasDeleted;
        }

        // ツイート管理
        addTweet(tweetId) {
            if (!tweetId || typeof tweetId !== 'string') return false;
            
            this.hiddenTweets.add(tweetId);
            const success = this._saveTweets();
            if (success) {
                this.logger.success(`ツイート追加: ${tweetId}`);
            }
            return success;
        }

        removeTweet(tweetId) {
            const wasDeleted = this.hiddenTweets.delete(tweetId);
            if (wasDeleted) {
                this._saveTweets();
                this.logger.success(`ツイート削除: ${tweetId}`);
            }
            return wasDeleted;
        }

        // 設定管理
        getSetting(key, defaultValue = null) {
            return this.settings[key] ?? defaultValue;
        }

        setSetting(key, value) {
            this.settings[key] = value;
            const success = this._saveSettings();
            if (success) {
                this.logger.debug(`設定更新: ${key} = ${value}`);
            }
            return success;
        }

        // データクリア
        clearAllData() {
            this.storage.clear();
            this._resetData();
            this.logger.success('すべてのデータをクリア');
        }

        // 判定メソッド
        isUserHidden(userId) {
            return this.hiddenUsers.has(userId);
        }

        isTweetHidden(tweetId) {
            return this.hiddenTweets.has(tweetId);
        }

        // データ取得
        getHiddenUsersList() {
            return [...this.hiddenUsers];
        }

        getHiddenTweetsList() {
            return [...this.hiddenTweets];
        }

        /**
         * @returns {HiddenDataStats}
         */
        getStats() {
            const users = this.hiddenUsers.size;
            const tweets = this.hiddenTweets.size;
            return {
                hiddenUsers: users,
                hiddenTweets: tweets,
                totalHidden: users + tweets
            };
        }

        // データエクスポート/インポート
        exportData() {
            return {
                version: CONFIG.VERSION,
                timestamp: new Date().toISOString(),
                hiddenUsers: this.getHiddenUsersList(),
                hiddenTweets: this.getHiddenTweetsList(),
                settings: { ...this.settings }
            };
        }

        importData(data) {
            try {
                if (!data || typeof data !== 'object') {
                    throw new Error('無効なデータ形式');
                }

                this.hiddenUsers = new Set([...CONFIG.PREDEFINED_BLOCKED_USERS, ...(data.hiddenUsers || [])]);
                this.hiddenTweets = new Set(data.hiddenTweets || []);
                this.settings = { ...this._getDefaultSettings(), ...(data.settings || {}) };

                this._saveUsers();
                this._saveTweets();
                this._saveSettings();

                this.logger.success('データインポート完了');
                return true;
            } catch (error) {
                this.logger.error('データインポートエラー:', error);
                return false;
            }
        }
    }

    // ===========================
    // ツイート処理クラス（改良版）
    // ===========================
    class TweetProcessor {
        constructor(dataManager, logger, errorHandler) {
            this.dataManager = dataManager;
            this.logger = logger;
            this.errorHandler = errorHandler;
            this.processedTweets = new Map(); // WeakSetからMapに変更してIDベースで管理
            this.batchProcessor = Utils.throttle(
                this.processBatch.bind(this), 
                CONFIG.PERFORMANCE.THROTTLE_DELAY
            );
        }

        /**
         * ツイートデータを抽出
         * @param {Element} tweetElement 
         * @returns {TweetData|null}
         */
        extractTweetData(tweetElement) {
            try {
                const userId = this._extractUserId(tweetElement);
                if (!userId) return null;

                const userName = this._extractUserName(tweetElement);
                const tweetId = this._generateTweetId(tweetElement);

                return {
                    id: tweetId,
                    userId,
                    userName,
                    element: tweetElement
                };
            } catch (error) {
                this.errorHandler.handle(error, 'extractTweetData');
                return null;
            }
        }

        _extractUserId(tweetElement) {
            const authorElement = Utils.safeQuerySelector(tweetElement, CONFIG.SELECTORS.AUTHOR_ID);
            return authorElement?.textContent?.replace('@', '').trim() || null;
        }

        _extractUserName(tweetElement) {
            const nameElement = Utils.safeQuerySelector(tweetElement, CONFIG.SELECTORS.AUTHOR_NAME);
            return nameElement?.textContent?.trim() || 'Unknown User';
        }

        _generateTweetId(tweetElement) {
            try {
                const url = tweetElement.querySelector('a')?.href || '';
                const textContent = tweetElement.textContent?.trim().substring(0, 100) || '';
                const combinedString = url + textContent;
                return Utils.generateHash(combinedString);
            } catch (error) {
                this.errorHandler.handle(error, '_generateTweetId');
                return `tweet_${Math.random().toString(36).substring(2, 15)}`;
            }
        }

        /**
         * ツイート要素を非表示
         * @param {Element} tweetElement 
         * @param {boolean} animated 
         */
        hideTweetElement(tweetElement, animated = true) {
            try {
                const container = tweetElement.closest(CONFIG.SELECTORS.FULL_TWEET_CONTAINER) ||
                                 tweetElement.closest(CONFIG.SELECTORS.FULL_TWEET);
                
                const targetElement = container || tweetElement;
                const success = Utils.toggleElementVisibility(targetElement, false, animated);
                
                this.logger.debug(`ツイート非表示: ${success ? '成功' : '失敗'}`);
                return success;
            } catch (error) {
                this.errorHandler.handle(error, 'hideTweetElement');
                return false;
            }
        }

        /**
         * 特定ユーザーの全ツイートを非表示
         * @param {string} userId 
         */
        hideAllUserTweets(userId) {
            let hiddenCount = 0;
            const tweets = Utils.safeQuerySelectorAll(document, CONFIG.SELECTORS.TWEET_CONTAINER);
            
            tweets.forEach(tweet => {
                const tweetData = this.extractTweetData(tweet);
                if (tweetData?.userId === userId) {
                    if (this.hideTweetElement(tweet)) {
                        hiddenCount++;
                    }
                }
            });

            this.logger.success(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示`);
            return hiddenCount;
        }

        /**
         * 削除ボタンを作成
         * @param {TweetData} tweetData 
         */
        createHideButton(tweetData) {
            const button = document.createElement('button');
            button.textContent = CONFIG.UI.BUTTON_TEXT.HIDE;
            button.className = 'tweet-hider-delete-btn';
            button.title = 'このツイートまたはユーザーを非表示にします';
            button.setAttribute('data-tweet-id', tweetData.id);
            button.setAttribute('data-user-id', tweetData.userId);
            
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleHideButtonClick(tweetData);
            });

            return button;
        }

        _handleHideButtonClick(tweetData) {
            try {
                const confirmMessage = 
                    `このユーザーのツイートを非表示にしますか？\n\n` +
                    `ユーザー: ${tweetData.userName} (@${tweetData.userId})\n\n` +
                    `「OK」: このユーザーの全ツイートを非表示\n` +
                    `「キャンセル」: このツイートのみ非表示`;

                const hideAllTweets = confirm(confirmMessage);

                if (hideAllTweets) {
                    this.dataManager.addUser(tweetData.userId);
                    this.hideAllUserTweets(tweetData.userId);
                } else {
                    this.dataManager.addTweet(tweetData.id);
                    this.hideTweetElement(tweetData.element);
                }
            } catch (error) {
                this.errorHandler.handle(error, '_handleHideButtonClick');
            }
        }

        /**
         * 単一ツイートを処理
         * @param {Element} tweetElement 
         */
        processSingleTweet(tweetElement) {
            try {
                const tweetData = this.extractTweetData(tweetElement);
                if (!tweetData) return false;

                // 既に処理済みかチェック
                if (this.processedTweets.has(tweetData.id)) {
                    return false;
                }

                // 非表示対象かチェック
                if (this.dataManager.isUserHidden(tweetData.userId) || 
                    this.dataManager.isTweetHidden(tweetData.id)) {
                    this.hideTweetElement(tweetData.element);
                    this.processedTweets.set(tweetData.id, tweetData);
                    return true;
                }

                // 既に削除ボタンが存在するかチェック
                if (Utils.safeQuerySelector(tweetElement, CONFIG.SELECTORS.DELETE_BUTTON)) {
                    this.processedTweets.set(tweetData.id, tweetData);
                    return false;
                }

                // 削除ボタンを追加
                const infoContainer = Utils.safeQuerySelector(tweetElement, CONFIG.SELECTORS.INFO_CONTAINER);
                if (infoContainer) {
                    const hideButton = this.createHideButton(tweetData);
                    infoContainer.appendChild(hideButton);
                    this.logger.debug(`削除ボタン追加: @${tweetData.userId}`);
                }

                this.processedTweets.set(tweetData.id, tweetData);
                
                // キャッシュサイズ制限
                if (this.processedTweets.size > CONFIG.PERFORMANCE.MAX_PROCESSED_CACHE) {
                    const keys = [...this.processedTweets.keys()];
                    const keysToDelete = keys.slice(0, keys.length - CONFIG.PERFORMANCE.MAX_PROCESSED_CACHE);
                    keysToDelete.forEach(key => this.processedTweets.delete(key));
                    this.logger.debug('処理済みキャッシュをクリーンアップ');
                }

                return true;
            } catch (error) {
                this.errorHandler.handle(error, 'processSingleTweet');
                return false;
            }
        }

        /**
         * バッチ処理
         * @param {Element[]} tweets 
         */
        processBatch(tweets) {
            let processedCount = 0;
            
            Utils.processBatch(tweets, CONFIG.PERFORMANCE.BATCH_SIZE, (batch) => {
                return batch.map(tweet => {
                    if (this.processSingleTweet(tweet)) {
                        processedCount++;
                    }
                    return tweet;
                });
            });

            if (processedCount > 0) {
                this.logger.debug(`バッチ処理完了: ${processedCount}件`);
            }
            
            return processedCount;
        }

        /**
         * 全ツイートを処理
         */
        processAllTweets() {
            try {
                const tweets = Utils.safeQuerySelectorAll(document, CONFIG.SELECTORS.TWEET_CONTAINER);
                this.logger.debug(`${tweets.length} 件のツイートを処理中...`);
                
                const processed = this.processBatch(tweets);
                this.logger.debug(`全ツイート処理完了: ${processed}件処理`);
                
                return processed;
            } catch (error) {
                this.errorHandler.handle(error, 'processAllTweets');
                return 0;
            }
        }

        /**
         * 処理統計を取得
         */
        getProcessStats() {
            return {
                processedCount: this.processedTweets.size,
                cacheSize: this.processedTweets.size,
                maxCacheSize: CONFIG.PERFORMANCE.MAX_PROCESSED_CACHE
            };
        }
    }

    // ===========================
    // UI管理クラス（改良版）
    // ===========================
    class UIManager {
        constructor(dataManager, logger) {
            this.dataManager = dataManager;
            this.logger = logger;
            this.styleSheet = null;
            this.managementPanel = null;
            this.init();
        }

        init() {
            this.addStyles();
            this.createManageButton();
        }

        addStyles() {
            const styles = `
                .tweet-hider-delete-btn {
                    margin-left: 8px;
                    padding: 2px 6px;
                    background-color: ${CONFIG.UI.COLORS.DANGER};
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    line-height: 1.2;
                    opacity: 0.8;
                }
                
                .tweet-hider-delete-btn:hover {
                    background-color: ${CONFIG.UI.COLORS.DANGER_HOVER};
                    opacity: 1;
                    transform: scale(1.05);
                }
                
                .tweet-hider-delete-btn:active {
                    transform: scale(0.95);
                }
                
                .tweet-hider-manage-btn {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 10000;
                    padding: 8px 12px;
                    background-color: ${CONFIG.UI.COLORS.PRIMARY};
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    transition: all 0.2s ease;
                }
                
                .tweet-hider-manage-btn:hover {
                    background-color: ${CONFIG.UI.COLORS.PRIMARY_HOVER};
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                
                .tweet-hider-management-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    z-index: 10001;
                    max-width: 600px;
                    max-height: 80vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                .tweet-hider-management-header {
                    background: ${CONFIG.UI.COLORS.PRIMARY};
                    color: white;
                    padding: 16px 20px;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .tweet-hider-management-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s;
                }
                
                .tweet-hider-management-close:hover {
                    background-color: rgba(255,255,255,0.2);
                }
                
                .tweet-hider-management-content {
                    padding: 20px;
                    overflow-y: auto;
                    flex-grow: 1;
                }
                
                .tweet-hider-stats {
                    background: #f8f9fa;
                    padding: 12px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 12px;
                }
                
                .tweet-hider-stat-item {
                    text-align: center;
                }
                
                .tweet-hider-stat-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: ${CONFIG.UI.COLORS.PRIMARY};
                    display: block;
                }
                
                .tweet-hider-stat-label {
                    font-size: 12px;
                    color: #666;
                    margin-top: 4px;
                }
                
                .tweet-hider-list {
                    margin-bottom: 16px;
                }
                
                .tweet-hider-list-title {
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: #333;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 4px;
                }
                
                .tweet-hider-list-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #f0f0f0;
                }
                
                .tweet-hider-list-item:last-child {
                    border-bottom: none;
                }
                
                .tweet-hider-restore-btn {
                    background: ${CONFIG.UI.COLORS.SUCCESS};
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                
                .tweet-hider-restore-btn:hover {
                    background: #218838;
                }
                
                .tweet-hider-actions {
                    display: flex;
                    gap: 8px;
                    padding: 16px 20px;
                    border-top: 1px solid #eee;
                    background: #f8f9fa;
                }
                
                .tweet-hider-action-btn {
                    flex: 1;
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background-color 0.2s;
                }
                
                .tweet-hider-action-export {
                    background: ${CONFIG.UI.COLORS.PRIMARY};
                    color: white;
                }
                
                .tweet-hider-action-import {
                    background: ${CONFIG.UI.COLORS.SUCCESS};
                    color: white;
                }
                
                .tweet-hider-action-clear {
                    background: ${CONFIG.UI.COLORS.DANGER};
                    color: white;
                }
                
                .tweet-hider-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .tweet-hider-overlay.show {
                    opacity: 1;
                }
                
                @keyframes fadeInScale {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }
                
                .tweet-hider-management-panel.show {
                    animation: fadeInScale 0.3s ease-out;
                }
                
                .tweet-hider-empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    color: #666;
                }
                
                .tweet-hider-empty-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                    opacity: 0.3;
                }
            `;
            
            this.styleSheet = GM_addStyle(styles);
        }

        createManageButton() {
            // 既存のボタンをチェック
            const existingButton = document.querySelector(CONFIG.SELECTORS.MANAGE_BUTTON);
            if (existingButton) {
                existingButton.remove();
            }

            const button = document.createElement('button');
            button.textContent = CONFIG.UI.BUTTON_TEXT.MANAGE;
            button.className = 'tweet-hider-manage-btn';
            button.title = '非表示にしたユーザーとツイートを管理します';
            
            button.addEventListener('click', () => this.showManagementPanel());
            
            document.body.appendChild(button);
            this.logger.success('管理ボタンを作成');
        }

        showManagementPanel() {
            if (this.managementPanel) {
                this.hideManagementPanel();
                return;
            }

            try {
                this.managementPanel = this.createManagementPanelElement();
                document.body.appendChild(this.managementPanel);
                
                // アニメーション用にタイムアウトを使用
                setTimeout(() => {
                    if (this.managementPanel) {
                        this.managementPanel.classList.add('show');
                        this.managementPanel.querySelector('.tweet-hider-overlay').classList.add('show');
                    }
                }, 10);
                
                this.logger.debug('管理パネルを表示');
            } catch (error) {
                this.logger.error('管理パネル表示エラー:', error);
            }
        }

        hideManagementPanel() {
            if (!this.managementPanel) return;

            const overlay = this.managementPanel.querySelector('.tweet-hider-overlay');
            const panel = this.managementPanel.querySelector('.tweet-hider-management-panel');
            
            if (overlay) overlay.classList.remove('show');
            if (panel) panel.classList.remove('show');
            
            setTimeout(() => {
                if (this.managementPanel) {
                    this.managementPanel.remove();
                    this.managementPanel = null;
                }
            }, 300);
            
            this.logger.debug('管理パネルを非表示');
        }

        createManagementPanelElement() {
            const hiddenUsers = this.dataManager.getHiddenUsersList();
            const hiddenTweets = this.dataManager.getHiddenTweetsList();
            const stats = this.dataManager.getStats();

            const container = document.createElement('div');
            container.innerHTML = `
                <div class="tweet-hider-overlay"></div>
                <div class="tweet-hider-management-panel">
                    <div class="tweet-hider-management-header">
                        <span>非表示データ管理</span>
                        <button class="tweet-hider-management-close" title="閉じる">×</button>
                    </div>
                    <div class="tweet-hider-management-content">
                        <div class="tweet-hider-stats">
                            <div class="tweet-hider-stat-item">
                                <span class="tweet-hider-stat-number">${stats.hiddenUsers}</span>
                                <div class="tweet-hider-stat-label">非表示ユーザー</div>
                            </div>
                            <div class="tweet-hider-stat-item">
                                <span class="tweet-hider-stat-number">${stats.hiddenTweets}</span>
                                <div class="tweet-hider-stat-label">非表示ツイート</div>
                            </div>
                            <div class="tweet-hider-stat-item">
                                <span class="tweet-hider-stat-number">${stats.totalHidden}</span>
                                <div class="tweet-hider-stat-label">合計</div>
                            </div>
                        </div>
                        ${this.renderDataLists(hiddenUsers, hiddenTweets)}
                    </div>
                    <div class="tweet-hider-actions">
                        <button class="tweet-hider-action-btn tweet-hider-action-export">エクスポート</button>
                        <button class="tweet-hider-action-btn tweet-hider-action-import">インポート</button>
                        <button class="tweet-hider-action-btn tweet-hider-action-clear">全削除</button>
                    </div>
                </div>
            `;

            this.attachPanelEventListeners(container);
            return container;
        }

        renderDataLists(hiddenUsers, hiddenTweets) {
            if (hiddenUsers.length === 0 && hiddenTweets.length === 0) {
                return `
                    <div class="tweet-hider-empty-state">
                        <div class="tweet-hider-empty-icon">📭</div>
                        <p>非表示にしたユーザーやツイートはありません</p>
                    </div>
                `;
            }

            let html = '';

            if (hiddenUsers.length > 0) {
                html += `
                    <div class="tweet-hider-list">
                        <div class="tweet-hider-list-title">非表示ユーザー (${hiddenUsers.length})</div>
                        ${hiddenUsers.map(user => `
                            <div class="tweet-hider-list-item">
                                <span>@${user}</span>
                                <button class="tweet-hider-restore-btn" data-type="user" data-id="${user}">
                                    ${CONFIG.UI.BUTTON_TEXT.RESTORE}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            if (hiddenTweets.length > 0) {
                html += `
                    <div class="tweet-hider-list">
                        <div class="tweet-hider-list-title">非表示ツイート (${hiddenTweets.length})</div>
                        ${hiddenTweets.map((tweet, index) => `
                            <div class="tweet-hider-list-item">
                                <span>ツイート #${index + 1}</span>
                                <button class="tweet-hider-restore-btn" data-type="tweet" data-id="${tweet}">
                                    ${CONFIG.UI.BUTTON_TEXT.RESTORE}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            return html;
        }

        attachPanelEventListeners(container) {
            // 閉じるボタン
            const closeBtn = container.querySelector('.tweet-hider-management-close');
            const overlay = container.querySelector('.tweet-hider-overlay');
            
            const closeHandler = () => this.hideManagementPanel();
            if (closeBtn) closeBtn.addEventListener('click', closeHandler);
            if (overlay) overlay.addEventListener('click', closeHandler);

            // 復元ボタン
            container.querySelectorAll('.tweet-hider-restore-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const type = e.target.dataset.type;
                    const id = e.target.dataset.id;
                    this.handleRestore(type, id);
                });
            });

            // アクションボタン
            const exportBtn = container.querySelector('.tweet-hider-action-export');
            const importBtn = container.querySelector('.tweet-hider-action-import');
            const clearBtn = container.querySelector('.tweet-hider-action-clear');

            if (exportBtn) exportBtn.addEventListener('click', () => this.handleExport());
            if (importBtn) importBtn.addEventListener('click', () => this.handleImport());
            if (clearBtn) clearBtn.addEventListener('click', () => this.handleClearAll());
        }

        handleRestore(type, id) {
            try {
                const success = type === 'user' 
                    ? this.dataManager.removeUser(id)
                    : this.dataManager.removeTweet(id);

                if (success) {
                    const message = type === 'user' 
                        ? `ユーザー @${id} を復元しました`
                        : 'ツイートを復元しました';
                    
                    alert(`${message}\nページを再読み込みすると変更が反映されます。`);
                    this.hideManagementPanel();
                } else {
                    alert('復元に失敗しました。');
                }
            } catch (error) {
                this.logger.error('復元処理エラー:', error);
                alert('復元中にエラーが発生しました。');
            }
        }

        handleExport() {
            try {
                const data = this.dataManager.exportData();
                const jsonString = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `yahoo-tweet-hider-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.logger.success('データをエクスポートしました');
                alert('データをエクスポートしました。');
            } catch (error) {
                this.logger.error('エクスポートエラー:', error);
                alert('エクスポート中にエラーが発生しました。');
            }
        }

        handleImport() {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = JSON.parse(e.target.result);
                            if (this.dataManager.importData(data)) {
                                alert('データをインポートしました。\nページを再読み込みしてください。');
                                this.hideManagementPanel();
                            } else {
                                alert('インポートに失敗しました。');
                            }
                        } catch (error) {
                            this.logger.error('インポートデータ解析エラー:', error);
                            alert('ファイル形式が正しくありません。');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            } catch (error) {
                this.logger.error('インポートエラー:', error);
                alert('インポート中にエラーが発生しました。');
            }
        }

        handleClearAll() {
            try {
                const confirmMessage = '非表示にしたすべてのユーザーとツイートを削除しますか？\n\nこの操作は元に戻せません。';
                if (confirm(confirmMessage)) {
                    this.dataManager.clearAllData();
                    alert('すべてのデータを削除しました。\nページを再読み込みしてください。');
                    this.hideManagementPanel();
                }
            } catch (error) {
                this.logger.error('全削除エラー:', error);
                alert('削除中にエラーが発生しました。');
            }
        }

        destroy() {
            if (this.managementPanel) {
                this.hideManagementPanel();
            }

            const manageButton = document.querySelector(CONFIG.SELECTORS.MANAGE_BUTTON);
            if (manageButton) {
                manageButton.remove();
            }

            if (this.styleSheet) {
                this.styleSheet.remove();
            }

            this.logger.debug('UI要素を破棄しました');
        }
    }

    // ===========================
    // メインアプリケーションクラス（改良版）
    // ===========================
    class YahooTweetHider {
        constructor() {
            this.logger = new Logger();
            this.errorHandler = new ErrorHandler(this.logger);
            this.storage = new SafeStorage(this.logger);
            this.dataManager = new HiddenDataManager(this.storage, this.logger);
            this.tweetProcessor = new TweetProcessor(this.dataManager, this.logger, this.errorHandler);
            this.uiManager = new UIManager(this.dataManager, this.logger);
            
            this.observer = null;
            this.statsInterval = null;
            this.isInitialized = false;
            this.isDestroyed = false;

            // デバッグモードの初期化
            if (this.dataManager.getSetting('debugMode', false)) {
                this.logger.setDebugMode(true);
            }
        }

        /**
         * DOM監視を開始
         */
        startObservation() {
            if (this.observer) {
                this.observer.disconnect();
            }

            try {
                const targetNode = document.querySelector(CONFIG.SELECTORS.TWEET_LIST) || document.body;
                
                if (targetNode === document.body) {
                    this.logger.warn('ツイートリストが見つからないため、body要素を監視します');
                } else {
                    this.logger.success('ツイートリストの監視を開始');
                }

                const debouncedProcessor = Utils.debounce(() => {
                    if (!this.isDestroyed) {
                        this.logger.debug('DOM変更を検出、処理実行');
                        this.tweetProcessor.processAllTweets();
                    }
                }, CONFIG.UI.DEBOUNCE_DELAY);

                this.observer = new MutationObserver((mutations) => {
                    // 大量の変更がある場合はスロットルを適用
                    if (mutations.length > 10) {
                        this.tweetProcessor.batchProcessor();
                    } else {
                        debouncedProcessor();
                    }
                });

                this.observer.observe(targetNode, {
                    childList: true,
                    subtree: true,
                    attributes: false, // パフォーマンス向上のため属性変更は監視しない
                    characterData: false
                });

                this.logger.success('DOM監視を開始しました');
            } catch (error) {
                this.errorHandler.handle(error, 'startObservation');
            }
        }

        /**
         * 定期統計出力を開始
         */
        startStatsReporting() {
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
            }

            this.statsInterval = setInterval(() => {
                if (this.isDestroyed) return;

                try {
                    const dataStats = this.dataManager.getStats();
                    const processStats = this.tweetProcessor.getProcessStats();
                    const errorStats = this.errorHandler.getStats();
                    const processedElements = document.querySelectorAll(CONFIG.SELECTORS.DELETE_BUTTON).length;
                    
                    this.logger.stats('定期統計レポート', {
                        '非表示ユーザー数': dataStats.hiddenUsers,
                        '非表示ツイート数': dataStats.hiddenTweets,
                        '処理済み要素数': processedElements,
                        'キャッシュサイズ': processStats.cacheSize,
                        'エラー数': errorStats.errorCount
                    });
                } catch (error) {
                    this.errorHandler.handle(error, 'statsReporting');
                }
            }, CONFIG.UI.STATS_INTERVAL);
        }

        /**
         * パフォーマンス監視を開始
         */
        startPerformanceMonitoring() {
            // メモリ使用量の監視
            if (window.performance && window.performance.memory) {
                setInterval(() => {
                    if (this.isDestroyed) return;

                    const memory = window.performance.memory;
                    const memoryUsage = {
                        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
                        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
                        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
                    };

                    // メモリ使用量が高い場合は警告
                    if (memoryUsage.used > memoryUsage.limit * 0.8) {
                        this.logger.warn('メモリ使用量が高くなっています:', memoryUsage);
                    }
                }, 60000); // 1分間隔
            }
        }

        /**
         * 初期化処理
         */
        async initialize() {
            if (this.isInitialized) {
                this.logger.warn('既に初期化済みです');
                return false;
            }

            if (this.isDestroyed) {
                this.logger.error('破棄されたインスタンスは初期化できません');
                return false;
            }

            try {
                this.logger.info(`${CONFIG.SCRIPT_NAME} v${CONFIG.VERSION} 初期化開始`);
                
                // ストレージ利用可能性チェック
                if (!this.storage.isAvailable()) {
                    this.logger.warn('ローカルストレージが利用できません。一部機能が制限されます。');
                }

                // 初回処理
                const processedCount = this.tweetProcessor.processAllTweets();
                this.logger.success(`初回処理完了: ${processedCount}件のツイートを処理`);
                
                // DOM監視開始
                this.startObservation();
                
                // 統計出力開始
                this.startStatsReporting();
                
                // パフォーマンス監視開始
                this.startPerformanceMonitoring();

                // グローバルAPI公開（デバッグ用）
                this.exposeGlobalAPI();

                // ページ離脱時の処理
                window.addEventListener('beforeunload', () => {
                    this.destroy();
                });

                this.isInitialized = true;
                this.logger.success('初期化完了');
                
                this.showWelcomeMessage();
                return true;
                
            } catch (error) {
                this.errorHandler.handle(error, 'initialization', true);
                return false;
            }
        }

        /**
         * グローバルAPIの公開
         */
        exposeGlobalAPI() {
            window.tweetHider = {
                // 基本情報
                version: CONFIG.VERSION,
                isInitialized: () => this.isInitialized,
                isDestroyed: () => this.isDestroyed,
                
                // 統計情報
                getStats: () => ({
                    data: this.dataManager.getStats(),
                    process: this.tweetProcessor.getProcessStats(),
                    errors: this.errorHandler.getStats()
                }),
                
                // ログ管理
                enableDebug: () => {
                    this.logger.setDebugMode(true);
                    this.dataManager.setSetting('debugMode', true);
                },
                disableDebug: () => {
                    this.logger.setDebugMode(false);
                    this.dataManager.setSetting('debugMode', false);
                },
                getLogs: (level) => this.logger.getHistory(level),
                clearLogs: () => this.logger.clearHistory(),
                
                // データ管理
                exportData: () => this.dataManager.exportData(),
                importData: (data) => this.dataManager.importData(data),
                clearAllData: () => this.dataManager.clearAllData(),
                
                // 手動処理
                processAllTweets: () => this.tweetProcessor.processAllTweets(),
                hideUser: (userId) => {
                    this.dataManager.addUser(userId);
                    return this.tweetProcessor.hideAllUserTweets(userId);
                },
                showUser: (userId) => this.dataManager.removeUser(userId),
                
                // エラー管理
                resetErrors: () => this.errorHandler.reset(),
                
                // アプリケーション制御
                restart: async () => {
                    this.destroy();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return this.initialize();
                },
                destroy: () => this.destroy()
            };

            this.logger.debug('グローバルAPIを公開しました');
        }

        /**
         * ウェルカムメッセージ表示
         */
        showWelcomeMessage() {
            const stats = this.dataManager.getStats();
            
            console.log(`
╔══════════════════════════════════════════════════════════════════════════════════╗
║  🎯 ${CONFIG.SCRIPT_NAME} v${CONFIG.VERSION} - 起動完了！                              ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║  📋 使用方法:                                                                      ║
║    • 各ツイートに「非表示」ボタンが追加されます                                           ║
║    • ボタンをクリックしてユーザー全体またはツイート単体を非表示                              ║
║    • 右上の「非表示管理」ボタンで詳細設定を管理                                           ║
║                                                                                  ║
║  📊 現在の統計:                                                                    ║
║    • 非表示ユーザー: ${String(stats.hiddenUsers).padStart(3)} 人                         ║
║    • 非表示ツイート: ${String(stats.hiddenTweets).padStart(3)} 件                        ║
║                                                                                  ║
║  🔧 デバッグコマンド:                                                                ║
║    • window.tweetHider.enableDebug()   - デバッグモード有効                          ║
║    • window.tweetHider.getStats()      - 詳細統計を表示                             ║
║    • window.tweetHider.exportData()    - データをエクスポート                          ║
║    • window.tweetHider.restart()       - アプリケーション再起動                        ║
║                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝
            `);
        }

        /**
         * 破棄処理
         */
        destroy() {
            if (this.isDestroyed) {
                this.logger.warn('既に破棄済みです');
                return;
            }

            try {
                this.logger.info('アプリケーションを破棄中...');

                // DOM監視停止
                if (this.observer) {
                    this.observer.disconnect();
                    this.observer = null;
                }

                // 統計出力停止
                if (this.statsInterval) {
                    clearInterval(this.statsInterval);
                    this.statsInterval = null;
                }

                // UI要素削除
                if (this.uiManager) {
                    this.uiManager.destroy();
                }

                // グローバルAPI削除
                if (window.tweetHider) {
                    delete window.tweetHider;
                }

                this.isInitialized = false;
                this.isDestroyed = true;
                
                this.logger.success('アプリケーションを破棄しました');
            } catch (error) {
                this.errorHandler.handle(error, 'destroy');
            }
        }

        /**
         * 健全性チェック
         */
        healthCheck() {
            const issues = [];

            // 初期化状態チェック
            if (!this.isInitialized) {
                issues.push('アプリケーションが初期化されていません');
            }

            // 破棄状態チェック
            if (this.isDestroyed) {
                issues.push('アプリケーションが破棄されています');
            }

            // DOM監視チェック
            if (!this.observer) {
                issues.push('DOM監視が停止しています');
            }

            // ストレージチェック
            if (!this.storage.isAvailable()) {
                issues.push('ストレージが利用できません');
            }

            // エラー数チェック
            const errorStats = this.errorHandler.getStats();
            if (errorStats.errorCount > 50) {
                issues.push(`エラー数が多すぎます (${errorStats.errorCount}件)`);
            }

            // メモリチェック
            if (window.performance && window.performance.memory) {
                const memory = window.performance.memory;
                const memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
                if (memoryUsage > 0.9) {
                    issues.push(`メモリ使用量が高すぎます (${Math.round(memoryUsage * 100)}%)`);
                }
            }

            return {
                healthy: issues.length === 0,
                issues,
                stats: {
                    initialized: this.isInitialized,
                    destroyed: this.isDestroyed,
                    observing: !!this.observer,
                    storageAvailable: this.storage.isAvailable(),
                    errorCount: errorStats.errorCount
                }
            };
        }
    }

    // ===========================
    // アプリケーション起動制御
    // ===========================
    
    class AppBootstrap {
        constructor() {
            this.app = null;
            this.retryCount = 0;
            this.maxRetries = 3;
            this.retryDelay = 2000;
        }

        async start() {
            try {
                // 既存のインスタンスがある場合は破棄
                if (this.app) {
                    this.app.destroy();
                    this.app = null;
                }

                // 新しいインスタンスを作成して初期化
                this.app = new YahooTweetHider();
                const success = await this.app.initialize();

                if (success) {
                    this.retryCount = 0;
                    console.log(`${CONFIG.SCRIPT_NAME} v${CONFIG.VERSION} が正常に開始されました`);
                    
                    // 健全性チェックを定期実行
                    this.startHealthCheck();
                    
                    return true;
                } else {
                    throw new Error('初期化に失敗しました');
                }
            } catch (error) {
                console.error(`${CONFIG.SCRIPT_NAME} 起動エラー:`, error);
                
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`${this.retryDelay}ms後に再試行します... (${this.retryCount}/${this.maxRetries})`);
                    setTimeout(() => this.start(), this.retryDelay);
                } else {
                    console.error(`${CONFIG.SCRIPT_NAME} の起動に${this.maxRetries}回失敗しました。手動で再試行してください。`);
                }
                
                return false;
            }
        }

        startHealthCheck() {
            setInterval(() => {
                if (!this.app) return;

                const health = this.app.healthCheck();
                if (!health.healthy) {
                    console.warn(`${CONFIG.SCRIPT_NAME} 健全性チェック失敗:`, health.issues);
                    
                    // 重大な問題がある場合は再起動
                    const criticalIssues = health.issues.filter(issue => 
                        issue.includes('破棄されています') || 
                        issue.includes('メモリ使用量が高すぎます')
                    );
                    
                    if (criticalIssues.length > 0) {
                        console.log(`${CONFIG.SCRIPT_NAME} を再起動します...`);
                        this.start();
                    }
                }
            }, 5 * 60 * 1000); // 5分間隔
        }

        async restart() {
            console.log(`${CONFIG.SCRIPT_NAME} を再起動します...`);
            return this.start();
        }

        stop() {
            if (this.app) {
                this.app.destroy();
                this.app = null;
                console.log(`${CONFIG.SCRIPT_NAME} を停止しました`);
            }
        }
    }

    // ===========================
    // エントリーポイント
    // ===========================
    
    // DOM読み込み完了を待機してアプリケーションを開始
    const bootstrap = new AppBootstrap();
    
    const startApplication = () => {
        // ページURLチェック
        if (!location.href.includes('search.yahoo.co.jp/realtime')) {
            console.warn(`${CONFIG.SCRIPT_NAME}: 対象ページではありません`);
            return;
        }

        // 重複起動防止
        if (window.yahooTweetHiderBootstrap) {
            console.warn(`${CONFIG.SCRIPT_NAME}: 既に起動しています`);
            return;
        }
        
        window.yahooTweetHiderBootstrap = bootstrap;
        bootstrap.start();
    };

    // DOM状態に応じて起動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApplication);
    } else {
        // DOM読み込み済みの場合は少し待ってから開始
        setTimeout(startApplication, 100);
    }

    // ページ遷移時の処理（SPA対応）
    let currentUrl = location.href;
    setInterval(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            if (currentUrl.includes('search.yahoo.co.jp/realtime')) {
                console.log(`${CONFIG.SCRIPT_NAME}: ページ遷移を検出、再起動します`);
                setTimeout(() => bootstrap.restart(), 1000);
            } else {
                bootstrap.stop();
            }
        }
    }, 1000);

    // デバッグ用グローバル関数
    window.yahooTweetHiderDebug = {
        restart: () => bootstrap.restart(),
        stop: () => bootstrap.stop(),
        getApp: () => bootstrap.app,
        version: CONFIG.VERSION
    };

})();
