// ==UserScript==
// @name        Yahoo!リアルタイム検索ツイート非表示
// @namespace   http://tampermonkey.net/
// @version     2.6
// @description 指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。
// @author      Refactored & Gemini
// @match       https://search.yahoo.co.jp/realtime*
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

(function() {
    'use strict';

    // -------------------
    // I. 設定と定数
    // -------------------

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
            manageButton: '.custom-manage-btn',
            fullTweet: '.Tweet_Tweet__sna2i',
            fullTweetContainer: '.Tweet_TweetContainer__aezGm'
        },

        // ボタンのラベル
        buttonLabels: {
            hide: '非表示',
            manage: '非表示管理'
        },

        // 管理パネルのメッセージ
        messages: {
            confirmHideUser: (userName, userId) =>
                `このユーザーのツイートを非表示にしますか？\n\n` +
                `ユーザー: ${userName} (@${userId})\n\n` +
                `「OK」: このユーザーの全ツイートを非表示\n` +
                `「キャンセル」: このツイートのみ非表示`,
            confirmUnblock: (user) =>
                `@${user} を表示に戻しますか？\n` +
                `ページを再読み込みすると変更が反映されます。`,
            noHiddenUsers: '非表示ユーザーはいません。'
        },

        // 統計情報の定期出力間隔（ミリ秒）
        statsInterval: 5 * 60 * 1000,
    };

    // スクリプトのUIに適用するスタイル
    GM_addStyle(`
        .custom-delete-btn {
            margin-left: 8px;
            padding: 2px 6px;
            background-color: #ff4444;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
            line-height: 1;
        }

        .custom-delete-btn:hover {
            background-color: #cc3333;
            transform: scale(1.05);
        }

        .custom-manage-btn {
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
            line-height: 1;
        }
    `);

    // -------------------
    // II. ユーティリティクラス
    // -------------------

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

🔧 デバッグ有効化: window.logger.enableDebug()
🔇 デバッグ無効化: window.logger.disableDebug()
            `);
        }
    }

    // ユーザー管理クラス
    class UserManager {
        constructor() {
            this.hiddenUsers = this.loadHiddenUsers();
            this.hiddenTweetIds = this.loadHiddenTweets();
        }

        loadHiddenUsers() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKeys.hiddenUsers);
                const users = saved ? JSON.parse(saved) : [];
                return new Set([...CONFIG.predefinedBlockedUsers, ...users]);
            } catch (error) {
                logger.error('非表示ユーザーの読み込みに失敗しました:', error);
                return new Set(CONFIG.predefinedBlockedUsers);
            }
        }

        loadHiddenTweets() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKeys.hiddenTweets);
                const tweetIds = saved ? JSON.parse(saved) : [];
                return new Set(tweetIds);
            } catch (error) {
                logger.error('非表示ツイートの読み込みに失敗しました:', error);
                return new Set();
            }
        }

        saveHiddenUsers() {
            try {
                const usersArray = Array.from(this.hiddenUsers).filter(
                    user => !CONFIG.predefinedBlockedUsers.includes(user)
                );
                localStorage.setItem(CONFIG.storageKeys.hiddenUsers, JSON.stringify(usersArray));
            } catch (error) {
                logger.error('非表示ユーザーの保存に失敗しました:', error);
            }
        }

        saveHiddenTweets() {
            try {
                localStorage.setItem(CONFIG.storageKeys.hiddenTweets, JSON.stringify(Array.from(this.hiddenTweetIds)));
            } catch (error) {
                logger.error('非表示ツイートの保存に失敗しました:', error);
            }
        }

        addHiddenUser(userId) {
            this.hiddenUsers.add(userId);
            this.saveHiddenUsers();
            logger.success(`ユーザー @${userId} を非表示リストに追加しました`);
        }

        removeHiddenUser(userId) {
            this.hiddenUsers.delete(userId);
            this.saveHiddenUsers();
            logger.success(`ユーザー @${userId} を非表示リストから削除しました`);
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
            logger.stats('現在の統計', {
                '非表示ユーザー数': stats.hiddenUsers,
                '非表示ツイート数': stats.hiddenTweets,
                '処理済みツイート数': document.querySelectorAll(CONFIG.selectors.deleteButton).length
            });
        }
    }

    // -------------------
    // III. メインロジック
    // -------------------

    // グローバルインスタンス
    const logger = new Logger();
    const userManager = new UserManager();
    window.logger = logger; // デバッグ用にグローバルに公開

    /**
     * ツイートIDを生成する
     * @param {Element} tweet - ツイート要素
     * @returns {string} - ツイートID
     */
    function getTweetId(tweet) {
        try {
            const tweetText = tweet.textContent.trim().substring(0, 100);
            return btoa(tweetText).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
        } catch (error) {
            logger.error('ツイートID生成エラー:', error);
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
            return authorElement ? authorElement.innerText.replace('@', '').trim() : null;
        } catch (error) {
            logger.error('ユーザーID取得エラー:', error);
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
            logger.error('ユーザー名取得エラー:', error);
            return 'Unknown User';
        }
    }

    /**
     * ツイートを非表示にする
     * @param {Element} tweet - ツイート要素
     */
    function hideTweet(tweet) {
        try {
            // 最も上位のツイートコンテナを特定
            const tweetContainer = tweet.closest(CONFIG.selectors.fullTweetContainer) || tweet.closest(CONFIG.selectors.fullTweet);

            if (tweetContainer) {
                tweetContainer.style.display = 'none';
            } else {
                tweet.style.display = 'none';
            }
        } catch (error) {
            logger.error('ツイート非表示エラー:', error);
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

            logger.success(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示にしました`);
        } catch (error) {
            logger.error('ユーザーツイート一括非表示エラー:', error);
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
        button.innerText = CONFIG.buttonLabels.hide;
        button.classList.add('custom-delete-btn');
        button.title = 'このツイートを非表示にします';

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                const tweetId = getTweetId(tweet);
                const userName = getUserName(tweet);

                const shouldHideUser = confirm(CONFIG.messages.confirmHideUser(userName, userId));

                if (shouldHideUser) {
                    userManager.addHiddenUser(userId);
                    hideAllTweetsFromUser(userId);
                } else {
                    userManager.addHiddenTweet(tweetId);
                    hideTweet(tweet);
                    logger.info(`ツイートを非表示にしました: ${userName}`);
                }
            } catch (error) {
                logger.error('ボタンクリック処理エラー:', error);
            }
        });

        return button;
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
                logger.debug('ユーザーIDが取得できないツイートをスキップ');
                return;
            }

            // ユーザーまたはツイートが非表示対象の場合は非表示
            if (userManager.isUserHidden(userId) || userManager.isTweetHidden(tweetId)) {
                hideTweet(tweet);
                logger.debug(`ツイートを非表示: @${userId}`);
                return;
            }

            // 削除ボタンが既に存在する場合はスキップ
            if (tweet.querySelector(CONFIG.selectors.deleteButton)) {
                return;
            }

            // 削除ボタンを追加
            const infoContainer = tweet.querySelector(CONFIG.selectors.infoContainer);

            if (infoContainer) {
                const deleteButton = createDeleteButton(tweet, userId);
                infoContainer.appendChild(deleteButton);
                logger.debug(`削除ボタンを追加: @${userId}`);
            } else {
                logger.debug('info container が見つかりません', tweet);
            }
        } catch (error) {
            logger.error('ツイート処理エラー:', error);
        }
    }

    /**
     * 全てのツイートを処理する
     */
    function processAllTweets() {
        try {
            const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
            logger.debug(`${tweets.length} 件のツイートを処理中...`);

            tweets.forEach(processTweet);

            logger.debug('全ツイート処理完了');
        } catch (error) {
            logger.error('全ツイート処理エラー:', error);
        }
    }

    /**
     * 管理パネルを表示する
     */
    function showManagementPanel() {
        try {
            const hiddenUsers = userManager.getHiddenUsers();

            if (hiddenUsers.length === 0) {
                alert(CONFIG.messages.noHiddenUsers);
                return;
            }

            let message = `=== 非表示管理 ===\n\n`;
            hiddenUsers.forEach((user, index) => {
                message += `${index + 1}. @${user}\n`;
            });
            message += `\n特定のユーザーを表示に戻したい場合は、\nユーザー番号を入力してください（キャンセルで閉じる）:`;

            const input = prompt(message);
            if (input) {
                const userIndex = parseInt(input) - 1;
                if (userIndex >= 0 && userIndex < hiddenUsers.length) {
                    const userToShow = hiddenUsers[userIndex];
                    if (confirm(CONFIG.messages.confirmUnblock(userToShow))) {
                        userManager.removeHiddenUser(userToShow);
                        alert(`@${userToShow} を表示に戻しました。ページを再読み込みしてください。`);
                    }
                } else {
                    alert('無効な番号です。');
                }
            }
        } catch (error) {
            logger.error('管理パネル表示エラー:', error);
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
            button.innerText = CONFIG.buttonLabels.manage;
            button.classList.add('custom-manage-btn');
            button.title = '非表示にしたユーザーを管理します';

            button.addEventListener('click', showManagementPanel);

            document.body.appendChild(button);
            logger.success('管理ボタンを作成しました');
        } catch (error) {
            logger.error('管理ボタン作成エラー:', error);
        }
    }

    /**
     * MutationObserverを初期化する
     */
    function initializeObserver() {
        try {
            logger.info('MutationObserver 初期化開始...');

            const targetNode = document.querySelector(CONFIG.selectors.tweetList);
            if (!targetNode) {
                logger.error('ツイートリストが見つかりませんでした。代替としてbodyを監視します。');
                observeTarget(document.body);
                return;
            }

            logger.success('ツイートリストを発見', { 'クラス名': targetNode.className });

            observeTarget(targetNode);
        } catch (error) {
            logger.error('MutationObserver初期化エラー:', error);
        }
    }

    /**
     * 指定された要素を監視する
     * @param {Element} targetNode - 監視対象の要素
     */
    function observeTarget(targetNode) {
        let timer;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                logger.debug('DOM変更を検出、処理を実行');
                processAllTweets();
            }, 100);
        });

        observer.observe(targetNode, { childList: true, subtree: true });

        logger.success('MutationObserver が初期化されました');
    }

    /**
     * 初期化処理
     */
    function initialize() {
        logger.info('==================================================');
        logger.info('Yahoo!リアルタイム検索ツイート非表示スクリプト開始');
        logger.info('==================================================');

        // ページ読み込み完了後に実行
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', executeStartup);
        } else {
            executeStartup();
        }
    }

    /**
     * スタートアップ処理を実行
     */
    function executeStartup() {
        try {
            logger.info('スタートアップ処理開始');

            // 初回処理
            processAllTweets();

            // 監視開始
            initializeObserver();

            // 管理ボタン作成
            createManageButton();

            logger.success('スタートアップ処理完了');
            logger.clearAndShowInstructions();

            // 定期統計出力
            setInterval(() => {
                userManager.printStats();
            }, CONFIG.statsInterval);
        } catch (error) {
            logger.error('スタートアップ処理エラー:', error);
        }
    }

    // スクリプト開始
    initialize();

})();
