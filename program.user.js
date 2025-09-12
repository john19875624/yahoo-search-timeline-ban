// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。
// @author       Refactored
// @match        https://search.yahoo.co.jp/realtime/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // 名前空間でラップして競合回避
    const YahooTweetHider = {
        // ロガークラス
        Logger: class {
            constructor() {
                this.debugMode = true; // デフォルトでデバッグモードを有効
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
                const timestamp = new Date().toLocaleTimeString();
                console.log(`${this.prefix} [${timestamp}] ℹ️ ${message}`, data || '');
            }
            
            success(message, data = null) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`${this.prefix} [${timestamp}] ✅ ${message}`, data || '');
            }
            
            error(message, data = null) {
                const timestamp = new Date().toLocaleTimeString();
                console.error(`${this.prefix} [${timestamp}] ❌ ${message}`, data || '');
            }
            
            debug(message, data = null) {
                if (this.debugMode) {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`${this.prefix} [${timestamp}] 🐛 ${message}`, data || '');
                }
            }
            
            stats(message, data = null) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`${this.prefix} [${timestamp}] 📊 ${message}`, data || '');
            }
            
            clearAndShowInstructions() {
                console.clear();
                console.log(`
${this.prefix} スクリプト起動完了！

📋 使用方法:
• 各ツイートに「非表示」ボタンが追加されます
• ボタンをクリックしてユーザー全体またはツイート単体を非表示
• 右上の「非表示管理」ボタンで設定を管理

🔧 デバッグ有効化: YahooTweetHider.logger.enableDebug()
🔇 デバッグ無効化: YahooTweetHider.logger.disableDebug()
                `);
            }
        },
        
        // 設定オブジェクト
        CONFIG: {
            // 事前に非表示にしたいユーザーID（@マークなし）をここに追加してください。
            predefinedBlockedUsers: [],
            
            // ローカルストレージのキー
            storageKeys: {
                hiddenUsers: 'yahooTweetHider_hiddenUsers',
                hiddenTweets: 'yahooTweetHider_hiddenTweets'
            },
            
            // CSS セレクター（2025年版に対応）
            selectors: {
                // 新しいセレクター候補
                tweetContainer: '.Tweet_bodyContainer__ud_57, [class*="Tweet"], [class*="tweet"], article, section',
                authorId: '.Tweet_authorID__JKhEb, [class*="authorID"], [class*="userId"], [class*="screenName"]',
                authorName: '.Tweet_authorName__wer3j, [class*="authorName"], [class*="userName"], [class*="displayName"]',
                infoContainer: '.Tweet_info__bBT3t, [class*="info"], [class*="meta"], [class*="footer"]',
                tweetList: '.TweetList_list__Xf9wM, [class*="list"], [class*="timeline"], [class*="feed"]',
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
        },

        // ユーザー管理クラス
        UserManager: class {
            constructor(config, logger) {
                this.config = config;
                this.logger = logger;
                this.hiddenUsers = this.loadHiddenUsers();
                this.hiddenTweetIds = this.loadHiddenTweets();
            }

            loadHiddenUsers() {
                try {
                    const saved = localStorage.getItem(this.config.storageKeys.hiddenUsers);
                    const users = saved ? JSON.parse(saved) : [];
                    return new Set([...this.config.predefinedBlockedUsers, ...users]);
                } catch (error) {
                    this.logger.error('非表示ユーザーの読み込みに失敗しました:', error);
                    return new Set(this.config.predefinedBlockedUsers);
                }
            }

            loadHiddenTweets() {
                try {
                    const saved = localStorage.getItem(this.config.storageKeys.hiddenTweets);
                    const tweetIds = saved ? JSON.parse(saved) : [];
                    return new Set(tweetIds);
                } catch (error) {
                    this.logger.error('非表示ツイートの読み込みに失敗しました:', error);
                    return new Set();
                }
            }

            saveHiddenUsers() {
                try {
                    const usersArray = Array.from(this.hiddenUsers).filter(
                        user => !this.config.predefinedBlockedUsers.includes(user)
                    );
                    localStorage.setItem(this.config.storageKeys.hiddenUsers, JSON.stringify(usersArray));
                } catch (error) {
                    this.logger.error('非表示ユーザーの保存に失敗しました:', error);
                }
            }

            saveHiddenTweets() {
                try {
                    localStorage.setItem(this.config.storageKeys.hiddenTweets, JSON.stringify(Array.from(this.hiddenTweetIds)));
                } catch (error) {
                    this.logger.error('非表示ツイートの保存に失敗しました:', error);
                }
            }

            addHiddenUser(userId) {
                this.hiddenUsers.add(userId);
                this.saveHiddenUsers();
                this.logger.success(`ユーザー @${userId} を非表示リストに追加しました`);
            }

            removeHiddenUser(userId) {
                this.hiddenUsers.delete(userId);
                this.saveHiddenUsers();
                this.logger.success(`ユーザー @${userId} を非表示リストから削除しました`);
            }

            addHiddenTweet(tweetId) {
                this.hiddenTweetIds.add(tweetId);
                this.saveHiddenTweets();
            }

            isUserHidden(userId) {
                return this.hiddenUsers.has(userId);
            }

            isTweetHidden(tweetId) {
                return this.hiddenTweetIds.has(tweetId);
            }

            getHiddenUsers() {
                return Array.from(this.hiddenUsers);
            }

            getStats() {
                return {
                    hiddenUsers: this.hiddenUsers.size,
                    hiddenTweets: this.hiddenTweetIds.size
                };
            }
            
            printStats() {
                const stats = this.getStats();
                this.logger.stats('現在の統計', {
                    '非表示ユーザー数': stats.hiddenUsers,
                    '非表示ツイート数': stats.hiddenTweets,
                    '処理済みツイート数': document.querySelectorAll(YahooTweetHider.CONFIG.selectors.deleteButton).length
                });
            }
        },
        
        // 初期化
        init() {
            this.logger = new this.Logger();
            this.userManager = new this.UserManager(this.CONFIG, this.logger);
            
            // グローバルに公開（デバッグ用）
            window.YahooTweetHider = this;
            
            this.logger.info('==================================================');
            this.logger.info('Yahoo!リアルタイム検索ツイート非表示スクリプト開始');
            this.logger.info('==================================================');
            
            this.startApp();
        },
        
        startApp() {
            try {
                const initialStats = this.userManager.getStats();
                this.logger.stats('初期統計情報', initialStats);
                
                // DOM 状態をチェック
                this.logger.info('DOM読み込み状態チェック', {
                    'readyState': document.readyState,
                    'URL': location.href,
                    'ツイートコンテナ数': document.querySelectorAll(this.CONFIG.selectors.tweetContainer).length,
                    'ツイートリスト存在': !!document.querySelector(this.CONFIG.selectors.tweetList)
                });
                
                // DOM が完全に読み込まれてから実行
                if (document.readyState === 'loading') {
                    this.logger.info('DOM読み込み待機中...');
                    document.addEventListener('DOMContentLoaded', () => {
                        this.logger.success('DOMContentLoaded イベント発火');
                        this.executeStartup();
                    });
                } else {
                    this.logger.info('DOM既に読み込み済み、即座に実行');
                    this.executeStartup();
                }
                
                // 定期統計出力（1分毎）
                setInterval(() => {
                    const currentStats = this.userManager.getStats();
                    const tweetContainers = document.querySelectorAll(this.CONFIG.selectors.tweetContainer);
                    const visibleTweets = Array.from(tweetContainers).filter(t => t.style.display !== 'none');
                    const buttonsCount = document.querySelectorAll(this.CONFIG.selectors.deleteButton).length;
                    
                    this.logger.stats('定期レポート', {
                        '非表示ユーザー数': currentStats.hiddenUsers,
                        '非表示ツイート数': currentStats.hiddenTweets,
                        '総ツイート数': tweetContainers.length,
                        '表示中ツイート数': visibleTweets.length,
                        '削除ボタン数': buttonsCount,
                        'メモリ使用量': `${(performance.memory?.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB` || 'N/A'
                    });
                }, 60 * 1000);
                
            } catch (error) {
                this.logger.error('初期化処理エラー:', error);
            }
        },
        
        executeStartup() {
            try {
                this.logger.info('スタートアップ処理開始');
                
                // ページ構造を分析
                this.analyzePageStructure();
                
                // 初回処理
                this.processAllTweets();
                
                // 監視開始
                this.initializeObserver();
                
                // 管理ボタン作成
                this.createManageButton();
                
                this.logger.success('スタートアップ処理完了');
                this.logger.info('==================================================');
                this.logger.clearAndShowInstructions();
                
                // 詳細な初期統計を出力
                setTimeout(() => {
                    const detailedStats = {
                        ...this.userManager.getStats(),
                        'ページURL': location.href,
                        '読み込み完了時刻': new Date().toLocaleString(),
                        '初期ツイート数': document.querySelectorAll(this.CONFIG.selectors.tweetContainer).length,
                        '追加ボタン数': document.querySelectorAll(this.CONFIG.selectors.deleteButton).length
                    };
                    this.logger.stats('初期統計レポート', detailedStats);
                    this.userManager.printStats();
                }, 3000);
            } catch (error) {
                this.logger.error('スタートアップ処理エラー:', error);
            }
        },
        
        analyzePageStructure() {
            this.logger.debug('ページ構造分析開始');
            
            const analysis = {
                'ツイートコンテナ': document.querySelectorAll(this.CONFIG.selectors.tweetContainer).length,
                'ツイートリスト': !!document.querySelector(this.CONFIG.selectors.tweetList),
                'URL': location.href,
                'タイトル': document.title
            };
            
            this.logger.debug('ページ構造分析結果', analysis);
            
            // 代替セレクターの検索
            if (analysis['ツイートコンテナ'] === 0) {
                this.logger.error('標準のツイートコンテナが見つかりません。代替セレクターを検索中...');
                
                const possibleContainers = [
                    '[class*="Tweet"]',
                    '[class*="tweet"]',
                    '[class*="bodyContainer"]',
                    '[class*="container"]',
                    'article',
                    'section'
                ];
                
                possibleContainers.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        this.logger.debug(`代替候補発見: ${selector}`, `要素数: ${elements.length}`);
                    }
                });
            }
        },
        
        getTweetId(tweet) {
            try {
                const userId = this.getUserId(tweet);
                const tweetText = tweet.textContent.trim().substring(0, 100);
                return btoa(`${userId}_${tweetText}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
            } catch (error) {
                this.logger.error('ツイートID生成エラー:', error);
                return 'unknown_' + Math.random().toString(36).substring(2, 15);
            }
        },
        
        getUserId(tweet) {
            try {
                const authorElement = tweet.querySelector(this.CONFIG.selectors.authorId);
                if (!authorElement) {
                    this.logger.debug('ユーザーID要素が見つかりません', tweet);
                    return null;
                }
                
                return authorElement.innerText.replace('@', '').trim();
            } catch (error) {
                this.logger.error('ユーザーID取得エラー:', error);
                return null;
            }
        },
        
        getUserName(tweet) {
            try {
                const nameElement = tweet.querySelector(this.CONFIG.selectors.authorName);
                return nameElement ? nameElement.innerText.trim() : 'Unknown User';
            } catch (error) {
                this.logger.error('ユーザー名取得エラー:', error);
                return 'Unknown User';
            }
        },
        
        processAllTweets() {
            try {
                const tweets = document.querySelectorAll(this.CONFIG.selectors.tweetContainer);
                const startTime = performance.now();
                
                this.logger.debug(`ツイート処理開始: ${tweets.length} 件のツイートを処理中...`);
                
                let processedCount = 0;
                let hiddenCount = 0;
                let buttonAddedCount = 0;
                
                tweets.forEach(tweet => {
                    const result = this.processTweetWithResult(tweet);
                    processedCount++;
                    
                    if (result.hidden) hiddenCount++;
                    if (result.buttonAdded) buttonAddedCount++;
                });
                
                const endTime = performance.now();
                const duration = (endTime - startTime).toFixed(2);
                
                this.logger.stats('ツイート処理完了', {
                    '処理件数': processedCount,
                    '非表示件数': hiddenCount,
                    'ボタン追加件数': buttonAddedCount,
                    '処理時間': `${duration}ms`
                });
                
            } catch (error) {
                this.logger.error('全ツイート処理エラー:', error);
            }
        },
        
        processTweetWithResult(tweet) {
            const result = { hidden: false, buttonAdded: false, error: null };
            
            try {
                const userId = this.getUserId(tweet);
                const tweetId = this.getTweetId(tweet);
                
                if (!userId) {
                    this.logger.debug('ユーザーIDが取得できないツイートをスキップ');
                    return result;
                }
                
                // ユーザーまたはツイートが非表示対象の場合は非表示
                if (this.userManager.isUserHidden(userId) || this.userManager.isTweetHidden(tweetId)) {
                    this.hideTweet(tweet);
                    result.hidden = true;
                    this.logger.debug(`ツイートを非表示: @${userId}`);
                    return result;
                }
                
                // 削除ボタンが既に存在する場合はスキップ
                if (this.hasDeleteButton(tweet)) {
                    return result;
                }
                
                // 削除ボタンを追加
                const deleteButton = this.createDeleteButton(tweet, userId);
                const infoContainer = tweet.querySelector(this.CONFIG.selectors.infoContainer);
                
                if (infoContainer) {
                    infoContainer.appendChild(deleteButton);
                    result.buttonAdded = true;
                    this.logger.debug(`削除ボタンを追加: @${userId}`);
                } else {
                    this.logger.debug('info container が見つかりません', tweet);
                }
            } catch (error) {
                result.error = error;
                this.logger.error('ツイート処理エラー:', error);
            }
            
            return result;
        },
        
        createDeleteButton(tweet, userId) {
            const button = document.createElement('button');
            button.innerText = '非表示';
            button.classList.add('custom-delete-btn');
            button.title = 'このツイートを非表示にします';
            
            // スタイルを適用
            Object.entries(this.CONFIG.buttonStyles).forEach(([property, value]) => {
                button.style.setProperty(property, value);
            });
            
            // ホバーエフェクト
            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = '#cc3333';
                button.style.transform = 'scale(1.05)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = this.CONFIG.buttonStyles['background-color'];
                button.style.transform = 'scale(1)';
            });
            
            // クリックイベント
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                try {
                    const tweetId = this.getTweetId(tweet);
                    const userName = this.getUserName(tweet);
                    
                    // 確認ダイアログ
                    const shouldHideUser = confirm(
                        `このユーザーのツイートを非表示にしますか？\n\n` +
                        `ユーザー: ${userName} (@${userId})\n\n` +
                        `「OK」: このユーザーの全ツイートを非表示\n` +
                        `「キャンセル」: このツイートのみ非表示`
                    );
                    
                    if (shouldHideUser) {
                        this.userManager.addHiddenUser(userId);
                        this.hideAllTweetsFromUser(userId);
                    } else {
                        this.userManager.addHiddenTweet(tweetId);
                        this.hideTweet(tweet);
                        this.logger.info(`ツイートを非表示にしました: ${userName}`);
                    }
                } catch (error) {
                    this.logger.error('ボタンクリック処理エラー:', error);
                }
            });
            
            return button;
        },
        
        hideTweet(tweet) {
            try {
                tweet.style.display = 'none';
                tweet.setAttribute('data-hidden', 'true');
            } catch (error) {
                this.logger.error('ツイート非表示エラー:', error);
            }
        },
        
        hideAllTweetsFromUser(userId) {
            try {
                const tweets = document.querySelectorAll(this.CONFIG.selectors.tweetContainer);
                let hiddenCount = 0;
                
                tweets.forEach(tweet => {
                    const tweetUserId = this.getUserId(tweet);
                    if (tweetUserId === userId) {
                        this.hideTweet(tweet);
                        hiddenCount++;
                    }
                });
                
                this.logger.success(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示にしました`);
            } catch (error) {
                this.logger.error('ユーザーツイート一括非表示エラー:', error);
            }
        },
        
        hasDeleteButton(tweet) {
            return tweet.querySelector(this.CONFIG.selectors.deleteButton) !== null;
        },
        
        createManageButton() {
            try {
                if (document.querySelector(this.CONFIG.selectors.manageButton)) return;
                
                const button = document.createElement('button');
                button.innerText = '非表示管理';
                button.classList.add('custom-manage-btn');
                button.title = '非表示にしたユーザーを管理します';
                
                // スタイルを適用
                Object.entries(this.CONFIG.manageButtonStyles).forEach(([property, value]) => {
                    button.style.setProperty(property, value);
                });
                
                button.addEventListener('click', () => this.showManagementPanel());
                
                document.body.appendChild(button);
                this.logger.success('管理ボタンを作成しました');
            } catch (error) {
                this.logger.error('管理ボタン作成エラー:', error);
            }
        },
        
        showManagementPanel() {
            try {
                const stats = this.userManager.getStats();
                const hiddenUsers = this.userManager.getHiddenUsers();
                
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
                            this.userManager.removeHiddenUser(userToShow);
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
                this.logger.error('管理パネル表示エラー:', error);
                alert('管理パネルの表示中にエラーが発生しました。');
            }
        },
        
        initializeObserver() {
            try {
                this.logger.info('MutationObserver 初期化開始...');
                
                const targetNode = document.querySelector(this.CONFIG.selectors.tweetList);
                if (!targetNode) {
                    this.logger.error('ツイートリストが見つかりませんでした');
                    this.logger.info('代替手段として body を監視します');
                    this.observeTarget(document.body);
                    return;
                }
                
                this.logger.success('ツイートリストを発見', {
                    'タグ名': targetNode.tagName,
                    'クラス名': targetNode.className,
                    '子要素数': targetNode.children.length
                });
                
                this.observeTarget(targetNode);
            } catch (error) {
                this.logger.error('MutationObserver初期化エラー:', error);
            }
        },
        
        observeTarget(targetNode) {
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
                        this.logger.debug(`DOM変更を検出`, {
                            '変更回数': mutationCount,
                            '追加ノード数': addedNodesCount,
                            '現在のツイート数': document.querySelectorAll(this.CONFIG.selectors.tweetContainer).length
                        });
                        
                        // デバウンス処理
                        clearTimeout(window.tweetProcessingTimeout);
                        window.tweetProcessingTimeout = setTimeout(() => {
                            this.logger.debug('デバウンス処理後、ツイート処理を実行');
                            const beforeCount = document.querySelectorAll(this.CONFIG.selectors.deleteButton).length;
                            this.processAllTweets();
                            const afterCount = document.querySelectorAll(this.CONFIG.selectors.deleteButton).length;
                            
                            if (afterCount > beforeCount) {
                                this.logger.success(`新しいボタンを ${afterCount - beforeCount} 個追加しました`);
                            }
                        }, 100);
                    }
                } catch (error) {
                    this.logger.error('MutationObserver処理エラー:', error);
                }
            });
            
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
            
            this.logger.success('MutationObserver が初期化されました', {
                '監視対象': targetNode.tagName
            });
        }
    };
    
    // スクリプト開始
    YahooTweetHider.init();
    
})();
