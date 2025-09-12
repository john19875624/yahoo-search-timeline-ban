// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。
// @author       Refactored
// @match        https://search.yahoo.co.jp/realtime/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // ロガークラス
    class Logger {
        constructor() {
            this.debugMode = false;
            this.prefix = '[Yahoo Tweet Hider]';
        }
        
        enableDebug() {
            this.debugMode = true;
            console.log(`${this.prefix} デバッグモードが有効になりました`);
        }
        
        disableDebug() {
            this.debugMode = false;
        }
        
        info(message, data = null) {
            console.log(`${this.prefix} ℹ️ ${message}`, data || '');
        }
        
        success(message, data = null) {
            console.log(`${this.prefix} ✅ ${message}`, data || '');
        }
        
        error(message, data = null) {
            console.error(`${this.prefix} ❌ ${message}`, data || '');
        }
        
        debug(message, data = null) {
            if (this.debugMode) {
                console.log(`${this.prefix} 🐛 ${message}`, data || '');
            }
        }
        
        stats(message, data = null) {
            console.log(`${this.prefix} 📊 ${message}`, data || '');
        }
        
        clearAndShowInstructions() {
            console.clear();
            console.log(`
${this.prefix} スクリプト起動完了！

📋 使用方法:
• 各ツイートに「非表示」ボタンが追加されます
• ボタンをクリックしてユーザー全体またはツイート単体を非表示
• 右上の「非表示管理」ボタンで設定を管理

🔧 デバッグ有効化: Logger.enableDebug()
🔇 デバッグ無効化: Logger.disableDebug()
            `);
        }
    }
    
    // グローバルLoggerインスタンス
    const Logger = new Logger();
    window.Logger = Logger; // デバッグ用にグローバルに公開
    
    // 設定オブジェクト
    const CONFIG = {
        // 事前に非表示にしたいユーザーID（@マークなし）をここに追加してください。
        // 例：predefinedBlockedUsers: ['user_id_1', 'user_id_2']
        predefinedBlockedUsers: [],
        
        // ローカルストレージのキー
        storageKeys: {
            hiddenUsers: 'yahooTweetHider_hiddenUsers',
            hiddenTweets: 'yahooTweetHider_hiddenTweets'
        },
        
        // CSS セレクター
        selectors: {
            tweetContainer: '.Tweet_bodyContainer__ud_57',
            authorId: '.Tweet_authorID__JKhEb',
            authorName: '.Tweet_authorName__wer3j',
            infoContainer: '.Tweet_info__bBT3t',
            tweetList: '.TweetList_list__Xf9wM',
            deleteButton: '.custom-delete-btn',
            manageButton: '.custom-manage-btn'
        },
        
        // 削除ボタンのスタイル
        buttonStyles: {
            'margin-left': '8px',
            'padding': '2px 6px',
            'background-color': '#ff4444',
            'color': 'white',
            'border': 'none',
            'border-radius': '4px',
            'font-size': '11px',
            'cursor': 'pointer',
            'transition': 'all 0.2s'
        },
        
        // 管理ボタンのスタイル
        manageButtonStyles: {
            'position': 'fixed',
            'top': '10px',
            'right': '10px',
            'z-index': '10000',
            'padding': '8px 12px',
            'background-color': '#007bff',
            'color': 'white',
            'border': 'none',
            'border-radius': '6px',
            'font-size': '12px',
            'cursor': 'pointer',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.2)'
        }
    };

    // ユーザー管理クラス
    class UserManager {
        constructor() {
            this.hiddenUsers = this.loadHiddenUsers();
            this.hiddenTweetIds = this.loadHiddenTweets();
        }

        /**
         * 保存されている非表示ユーザーを読み込む
         * @returns {Set<string>} - 非表示ユーザーのSet
         */
        loadHiddenUsers() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKeys.hiddenUsers);
                const users = saved ? JSON.parse(saved) : [];
                return new Set([...CONFIG.predefinedBlockedUsers, ...users]);
            } catch (error) {
                Logger.error('非表示ユーザーの読み込みに失敗しました:', error);
                return new Set(CONFIG.predefinedBlockedUsers);
            }
        }

        /**
         * 保存されている非表示ツイートIDを読み込む
         * @returns {Set<string>} - 非表示ツイートIDのSet
         */
        loadHiddenTweets() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKeys.hiddenTweets);
                const tweetIds = saved ? JSON.parse(saved) : [];
                return new Set(tweetIds);
            } catch (error) {
                Logger.error('非表示ツイートの読み込みに失敗しました:', error);
                return new Set();
            }
        }

        /**
         * 非表示ユーザーを保存する
         */
        saveHiddenUsers() {
            try {
                const usersArray = Array.from(this.hiddenUsers).filter(
                    user => !CONFIG.predefinedBlockedUsers.includes(user)
                );
                localStorage.setItem(CONFIG.storageKeys.hiddenUsers, JSON.stringify(usersArray));
            } catch (error) {
                Logger.error('非表示ユーザーの保存に失敗しました:', error);
            }
        }

        /**
         * 非表示ツイートIDを保存する
         */
        saveHiddenTweets() {
            try {
                localStorage.setItem(CONFIG.storageKeys.hiddenTweets, JSON.stringify(Array.from(this.hiddenTweetIds)));
            } catch (error) {
                Logger.error('非表示ツイートの保存に失敗しました:', error);
            }
        }

        /**
         * ユーザーを非表示リストに追加
         * @param {string} userId - ユーザーID
         */
        addHiddenUser(userId) {
            this.hiddenUsers.add(userId);
            this.saveHiddenUsers();
            Logger.success(`ユーザー @${userId} を非表示リストに追加しました`);
        }

        /**
         * ユーザーを非表示リストから削除
         * @param {string} userId - ユーザーID
         */
        removeHiddenUser(userId) {
            this.hiddenUsers.delete(userId);
            this.saveHiddenUsers();
            Logger.success(`ユーザー @${userId} を非表示リストから削除しました`);
        }

        /**
         * ツイートを非表示リストに追加
         * @param {string} tweetId - ツイートID
         */
        addHiddenTweet(tweetId) {
            this.hiddenTweetIds.add(tweetId);
            this.saveHiddenTweets();
        }

        /**
         * ユーザーが非表示対象かチェック
         * @param {string} userId - ユーザーID
         * @returns {boolean}
         */
        isUserHidden(userId) {
            return this.hiddenUsers.has(userId);
        }

        /**
         * ツイートが非表示対象かチェック
         * @param {string} tweetId - ツイートID
         * @returns {boolean}
         */
        isTweetHidden(tweetId) {
            return this.hiddenTweetIds.has(tweetId);
        }

        /**
         * 非表示ユーザー一覧を取得
         * @returns {Array<string>}
         */
        getHiddenUsers() {
            return Array.from(this.hiddenUsers);
        }

        /**
         * 統計情報を取得
         * @returns {Object}
         */
        getStats() {
            return {
                hiddenUsers: this.hiddenUsers.size,
                hiddenTweets: this.hiddenTweetIds.size
            };
        }
        
        /**
         * 統計情報を出力
         */
        printStats() {
            const stats = this.getStats();
            Logger.stats('現在の統計', {
                '非表示ユーザー数': stats.hiddenUsers,
                '非表示ツイート数': stats.hiddenTweets,
                '処理済みツイート数': document.querySelectorAll(CONFIG.selectors.deleteButton).length
            });
        }
    }

    // グローバルインスタンス
    const userManager = new UserManager();

    /**
     * ページ構造を分析する
     */
    function analyzePageStructure() {
        Logger.debug('ページ構造分析開始');
        
        const analysis = {
            'ツイートコンテナ': document.querySelectorAll(CONFIG.selectors.tweetContainer).length,
            'ツイートリスト': !!document.querySelector(CONFIG.selectors.tweetList),
            'URL': location.href,
            'タイトル': document.title
        };
        
        Logger.debug('ページ構造分析結果', analysis);
        
        // 代替セレクターの検索
        if (analysis['ツイートコンテナ'] === 0) {
            Logger.error('標準のツイートコンテナが見つかりません。代替セレクターを検索中...');
            
            const possibleContainers = [
                '[class*="Tweet"]',
                '[class*="tweet"]',
                '[class*="bodyContainer"]',
                '[class*="container"]'
            ];
            
            possibleContainers.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    Logger.debug(`代替候補発見: ${selector}`, `要素数: ${elements.length}`);
                }
            });
        }
    }

    /**
     * ツイートIDを生成する（疑似的）
     * @param {Element} tweet - ツイート要素
     * @returns {string} - ツイートID
     */
    function getTweetId(tweet) {
        try {
            // ツイートのテキスト内容とユーザーIDからハッシュを生成
            const userId = getUserId(tweet);
            const tweetText = tweet.textContent.trim().substring(0, 100);
            return btoa(`${userId}_${tweetText}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
        } catch (error) {
            Logger.error('ツイートID生成エラー:', error);
            return 'unknown_' + Math.random().toString(36).substring(2, 15);
        }
    }

    /**
     * ユーザーIDを取得する
     * @param {Element} tweet - ツイート要素
     * @returns {string|null} - ユーザーID（@マークなし）
     */
    function getUserId(tweet) {
        try {
            const authorElement = tweet.querySelector(CONFIG.selectors.authorId);
            if (!authorElement) {
                Logger.debug('ユーザーID要素が見つかりません', tweet);
                return null;
            }
            
            return authorElement.innerText.replace('@', '').trim();
        } catch (error) {
            Logger.error('ユーザーID取得エラー:', error);
            return null;
        }
    }

    /**
     * ユーザー名を取得する
     * @param {Element} tweet - ツイート要素
     * @returns {string|null} - ユーザー名
     */
    function getUserName(tweet) {
        try {
            const nameElement = tweet.querySelector(CONFIG.selectors.authorName);
            return nameElement ? nameElement.innerText.trim() : 'Unknown User';
        } catch (error) {
            Logger.error('ユーザー名取得エラー:', error);
            return 'Unknown User';
        }
    }

    /**
     * 削除ボタンを作成する
     * @param {Element} tweet - ツイート要素
     * @param {string} userId - ユーザーID
     * @returns {HTMLButtonElement} - 削除ボタン要素
     */
    function createDeleteButton(tweet, userId) {
        const button = document.createElement('button');
        button.innerText = '非表示';
        button.classList.add('custom-delete-btn');
        button.title = 'このツイートを非表示にします';
        
        // スタイルを適用
        Object.entries(CONFIG.buttonStyles).forEach(([property, value]) => {
            button.style.setProperty(property, value);
        });
        
        // ホバーエフェクト
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#cc3333';
            button.style.transform = 'scale(1.05)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = CONFIG.buttonStyles['background-color'];
            button.style.transform = 'scale(1)';
        });
        
        // クリックイベント
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                const tweetId = getTweetId(tweet);
                const userName = getUserName(tweet);
                
                // 確認ダイアログ
                const shouldHideUser = confirm(
                    `このユーザーのツイートを非表示にしますか？\n\n` +
                    `ユーザー: ${userName} (@${userId})\n\n` +
                    `「OK」: このユーザーの全ツイートを非表示\n` +
                    `「キャンセル」: このツイートのみ非表示`
                );
                
                if (shouldHideUser) {
                    userManager.addHiddenUser(userId);
                    hideAllTweetsFromUser(userId);
                } else {
                    userManager.addHiddenTweet(tweetId);
                    hideTweet(tweet);
                    Logger.info(`ツイートを非表示にしました: ${userName}`);
                }
            } catch (error) {
                Logger.error('ボタンクリック処理エラー:', error);
            }
        });
        
        return button;
    }

    /**
     * ツイートを非表示にする
     * @param {Element} tweet - ツイート要素
     */
    function hideTweet(tweet) {
        try {
            tweet.style.display = 'none';
            tweet.setAttribute('data-hidden', 'true');
        } catch (error) {
            Logger.error('ツイート非表示エラー:', error);
        }
    }

    /**
     * 特定ユーザーの全ツイートを非表示にする
     * @param {string} userId - ユーザーID
     */
    function hideAllTweetsFromUser(userId) {
        try {
            const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
            let hiddenCount = 0;
            
            tweets.forEach(tweet => {
                const tweetUserId = getUserId(tweet);
                if (tweetUserId === userId) {
                    hideTweet(tweet);
                    hiddenCount++;
                }
            });
            
            Logger.success(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示にしました`);
        } catch (error) {
            Logger.error('ユーザーツイート一括非表示エラー:', error);
        }
    }

    /**
     * 削除ボタンが既に追加されているかチェックする
     * @param {Element} tweet - ツイート要素
     * @returns {boolean} - 削除ボタンが存在するかどうか
     */
    function hasDeleteButton(tweet) {
        return tweet.querySelector(CONFIG.selectors.deleteButton) !== null;
    }

    /**
     * 単一のツイートを処理する
     * @param {Element} tweet - ツイート要素
     */
    function processTweet(tweet) {
        try {
            const userId = getUserId(tweet);
            const tweetId = getTweetId(tweet);
            
            if (!userId) {
                Logger.debug('ユーザーIDが取得できないツイートをスキップ');
                return;
            }
            
            // ユーザーまたはツイートが非表示対象の場合は非表示
            if (userManager.isUserHidden(userId) || userManager.isTweetHidden(tweetId)) {
                hideTweet(tweet);
                Logger.debug(`ツイートを非表示: @${userId}`);
                return;
            }
            
            // 削除ボタンが既に存在する場合はスキップ
            if (hasDeleteButton(tweet)) {
                return;
            }
            
            // 削除ボタンを追加
            const deleteButton = createDeleteButton(tweet, userId);
            const infoContainer = tweet.querySelector(CONFIG.selectors.infoContainer);
            
            if (infoContainer) {
                infoContainer.appendChild(deleteButton);
                Logger.debug(`削除ボタンを追加: @${userId}`);
            } else {
                Logger.debug('info container が見つかりません', tweet);
            }
        } catch (error) {
            Logger.error('ツイート処理エラー:', error);
        }
    }

    /**
     * 全てのツイートを処理する
     */
    function processAllTweets() {
        try {
            const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
            Logger.debug(`${tweets.length} 件のツイートを処理中...`);
            
            tweets.forEach(processTweet);
            
            Logger.debug('全ツイート処理完了');
        } catch (error) {
            Logger.error('全ツイート処理エラー:', error);
        }
    }

    /**
     * 管理パネルを表示する
     */
    function showManagementPanel() {
        try {
            const stats = userManager.getStats();
            const hiddenUsers = userManager.getHiddenUsers();
            
            let message = `=== 非表示管理 ===\n\n`;
            message += `非表示ユーザー数: ${stats.hiddenUsers}\n`;
            message += `非表示ツイート数: ${stats.hiddenTweets}\n\n`;
            
            if (hiddenUsers.length > 0) {
                message += `非表示ユーザー一覧:\n`;
                hiddenUsers.forEach((user, index) => {
                    message += `${index + 1}. @${user}\n`;
                });
                message += `\n特定のユーザーを表示に戻したい場合は、\nユーザー番号を入力してください（キャンセルで閉じる）:`;
                
                const input = prompt(message);
                if (input) {
                    const userIndex = parseInt(input) - 1;
                    if (userIndex >= 0 && userIndex < hiddenUsers.length) {
                        const userToShow = hiddenUsers[userIndex];
                        userManager.removeHiddenUser(userToShow);
                        alert(`@${userToShow} を表示に戻しました。ページを再読み込みしてください。`);
                    } else {
                        alert('無効な番号です。');
                    }
                }
            } else {
                message += `非表示ユーザーはいません。`;
                alert(message);
            }
        } catch (error) {
            Logger.error('管理パネル表示エラー:', error);
            alert('管理パネルの表示中にエラーが発生しました。');
        }
    }

    /**
     * 管理ボタンを作成する
     */
    function createManageButton() {
        try {
            if (document.querySelector(CONFIG.selectors.manageButton)) return;
            
            const button = document.createElement('button');
            button.innerText = '非表示管理';
            button.classList.add('custom-manage-btn');
            button.title = '非表示にしたユーザーを管理します';
            
            // スタイルを適用
            Object.entries(CONFIG.manageButtonStyles).forEach(([property, value]) => {
                button.style.setProperty(property, value);
            });
            
            button.addEventListener('click', showManagementPanel);
            
            document.body.appendChild(button);
            Logger.success('管理ボタンを作成しました');
        } catch (error) {
            Logger.error('管理ボタン作成エラー:', error);
        }
    }

    /**
     * MutationObserverを初期化する
     */
    function initializeObserver() {
        try {
            Logger.info('MutationObserver 初期化開始...');
            
            const targetNode = document.querySelector(CONFIG.selectors.tweetList);
            if (!targetNode) {
                Logger.error('ツイートリストが見つかりませんでした', {
                    '検索セレクター': CONFIG.selectors.tweetList,
                    '利用可能な要素': Array.from(document.querySelectorAll('*[class*="list"], *[class*="List"]')).map(el => el.className).slice(0, 10)
                });
                
                // 代替手段として body を監視
                Logger.info('代替手段として body を監視します');
                observeTarget(document.body);
                return;
            }
            
            Logger.success('ツイートリストを発見', {
                'タグ名': targetNode.tagName,
                'クラス名': targetNode.className,
                '子要素数': targetNode.children.length
            });
            
            observeTarget(targetNode);
        } catch (error) {
            Logger.error('MutationObserver初期化エラー:', error);
        }
    }
    
    /**
     * 指定された要素を監視する
     * @param {Element} targetNode - 監視対象の要素
     */
    function observeTarget(targetNode) {
        let mutationCount = 0;
        
        const observer = new MutationObserver((mutations) => {
            try {
                mutationCount++;
                let addedNodesCount = 0;
                let shouldProcess = false;
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        addedNodesCount += mutation.addedNodes.length;
                        shouldProcess = true;
                    }
                });
                
                if (shouldProcess) {
                    Logger.debug(`DOM変更を検出`, {
                        '変更回数': mutationCount,
                        '追加ノード数': addedNodesCount,
                        '変更タイプ': mutations.map(m => m.type).join(', ')
                    });
                    
                    // デバウンス処理
                    clearTimeout(window.tweetProcessingTimeout);
                    window.tweetProcessingTimeout = setTimeout(() => {
                        Logger.debug('デバウンス処理後、ツイート処理を実行');
                        processAllTweets();
                    }, 100);
                }
            } catch (error) {
                Logger.error('MutationObserver処理エラー:', error);
            }
        });
        
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
        
        Logger.success('MutationObserver が初期化されました', {
            '監視対象': targetNode.tagName,
            '監視オプション': 'childList: true, subtree: true'
        });
    }

    /**
     * 初期化処理
     */
    function initialize() {
        Logger.info('==================================================');
        Logger.info('Yahoo!リアルタイム検索ツイート非表示スクリプト開始');
        Logger.info('==================================================');
        
        try {
            const initialStats = userManager.getStats();
            Logger.stats('初期統計情報', initialStats);
            
            // DOM 状態をチェック
            Logger.info('DOM読み込み状態チェック', {
                'readyState': document.readyState,
                'URL': location.href,
                'ツイートコンテナ数': document.querySelectorAll(CONFIG.selectors.tweetContainer).length,
                'ツイートリスト存在': !!document.querySelector(CONFIG.selectors.tweetList)
            });
            
            // DOM が完全に読み込まれてから実行
            if (document.readyState === 'loading') {
                Logger.info('DOM読み込み待機中...');
                document.addEventListener('DOMContentLoaded', () => {
                    Logger.success('DOMContentLoaded イベント発火');
                    executeStartup();
                });
            } else {
                Logger.info('DOM既に読み込み済み、即座に実行');
                executeStartup();
            }
            
            // 定期統計出力（5分毎）
            setInterval(() => {
                userManager.printStats();
            }, 5 * 60 * 1000);
            
        } catch (error) {
            Logger.error('初期化処理エラー:', error);
        }
    }

    /**
     * スタートアップ処理を実行
     */
    function executeStartup() {
        try {
            Logger.info('スタートアップ処理開始');
            
            // ページ構造を分析
            analyzePageStructure();
            
            // 初回処理
            processAllTweets();
            
            // 監視開始
            initializeObserver();
            
            // 管理ボタン作成
            createManageButton();
            
            // デバッグモード無効化（初期状態）
            Logger.disableDebug();
            
            Logger.success('スタートアップ処理完了');
            Logger.info('==================================================');
            Logger.clearAndShowInstructions();
            
            // 詳細な初期統計を出力
            setTimeout(() => {
                const detailedStats = {
                    ...userManager.getStats(),
                    'ページURL': location.href,
                    '読み込み完了時刻': new Date().toLocaleString(),
                    '初期ツイート数': document.querySelectorAll(CONFIG.selectors.tweetContainer).length,
                    '追加ボタン数': document.querySelectorAll(CONFIG.selectors.deleteButton).length
                };
                Logger.stats('初期統計レポート', detailedStats);
                userManager.printStats();
            }, 3000); // 3秒後に統計出力
        } catch (error) {
            Logger.error('スタートアップ処理エラー:', error);
        }
    }

    // スクリプト開始
    initialize();

})();
