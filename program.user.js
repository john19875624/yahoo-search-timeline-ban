// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。
// @author       Refactored & Gemini
// @match        https://search.yahoo.co.jp/realtime*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // -------------------
    // I. 設定と定数
    // -------------------

    const CONFIG = {
        predefinedBlockedUsers: [],

        storageKeys: {
            hiddenUsers: 'yahooTweetHider_hiddenUsers',
            hiddenTweets: 'yahooTweetHider_hiddenTweets'
        },

        selectors: {
            tweetContainer: '.Tweet_bodyContainer__ud_57',
            authorId: '.Tweet_authorID__JKhEb',
            authorName: '.Tweet_authorName__wer3j',
            infoContainer: '.Tweet_info__bBT3t',
            tweetList: '.TweetList_list__Xf9wM',
            deleteButton: '.custom-delete-btn',
            manageButton: '.custom-manage-btn'
        },

        buttonLabels: {
            hide: '非表示',
            manage: '非表示管理'
        },

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

        statsInterval: 5 * 60 * 1000,
    };

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

    class Logger {
        constructor() {
            this.debugMode = false;
            this.prefix = '[Yahoo Tweet Hider]';
        }
        enableDebug() { this.debugMode = true; console.log(`${this.prefix} デバッグモード有効`); }
        disableDebug() { this.debugMode = false; }
        info(msg, data=null) { console.log(`${this.prefix} ℹ️ ${msg}`, data||''); }
        success(msg, data=null) { console.log(`${this.prefix} ✅ ${msg}`, data||''); }
        error(msg, data=null) { console.error(`${this.prefix} ❌ ${msg}`, data||''); }
        debug(msg, data=null) { if (this.debugMode) console.log(`${this.prefix} 🐛 ${msg}`, data||''); }
        stats(msg, data=null) { console.log(`${this.prefix} 📊 ${msg}`, data||''); }
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
            } catch (e) {
                logger.error('非表示ユーザーの読み込み失敗:', e);
                return new Set(CONFIG.predefinedBlockedUsers);
            }
        }
        loadHiddenTweets() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKeys.hiddenTweets);
                const ids = saved ? JSON.parse(saved) : [];
                return new Set(ids);
            } catch (e) {
                logger.error('非表示ツイートの読み込み失敗:', e);
                return new Set();
            }
        }
        saveHiddenUsers() {
            try {
                const arr = Array.from(this.hiddenUsers).filter(u => !CONFIG.predefinedBlockedUsers.includes(u));
                localStorage.setItem(CONFIG.storageKeys.hiddenUsers, JSON.stringify(arr));
            } catch (e) { logger.error('非表示ユーザーの保存失敗:', e); }
        }
        saveHiddenTweets() {
            try {
                localStorage.setItem(CONFIG.storageKeys.hiddenTweets, JSON.stringify(Array.from(this.hiddenTweetIds)));
            } catch (e) { logger.error('非表示ツイートの保存失敗:', e); }
        }
        addHiddenUser(u) { this.hiddenUsers.add(u); this.saveHiddenUsers(); logger.success(`ユーザー @${u} を非表示`); }
        removeHiddenUser(u) { this.hiddenUsers.delete(u); this.saveHiddenUsers(); logger.success(`ユーザー @${u} を解除`); }
        addHiddenTweet(id) { this.hiddenTweetIds.add(id); this.saveHiddenTweets(); }
        isUserHidden(u) { return this.hiddenUsers.has(u); }
        isTweetHidden(id) { return this.hiddenTweetIds.has(id); }
        getHiddenUsers() { return Array.from(this.hiddenUsers); }
        getStats() { return { hiddenUsers: this.hiddenUsers.size, hiddenTweets: this.hiddenTweetIds.size }; }
        printStats() {
            const s = this.getStats();
            logger.stats('現在の統計', {
                '非表示ユーザー数': s.hiddenUsers,
                '非表示ツイート数': s.hiddenTweets,
                '処理済みツイート数': document.querySelectorAll(CONFIG.selectors.deleteButton).length
            });
        }
    }

    // -------------------
    // III. メインロジック
    // -------------------

    const logger = new Logger();
    const userManager = new UserManager();
    window.logger = logger;

    /** Unicode対応のBase64エンコード */
    function btoaUnicode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function getTweetId(tweet) {
        try {
            const tweetText = tweet.textContent.trim().substring(0, 100);
            return btoaUnicode(tweetText)
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 16);
        } catch (e) {
            logger.error('ツイートID生成エラー:', e);
            return 'unknown_' + Math.random().toString(36).substring(2, 15);
        }
    }

    function getUserId(tweet) {
        try {
            const el = tweet.querySelector(CONFIG.selectors.authorId);
            return el ? el.innerText.replace('@','').trim() : null;
        } catch (e) { logger.error('ユーザーID取得失敗:', e); return null; }
    }

    function getUserName(tweet) {
        try {
            const el = tweet.querySelector(CONFIG.selectors.authorName);
            return el ? el.innerText.trim() : 'Unknown User';
        } catch (e) { logger.error('ユーザー名取得失敗:', e); return 'Unknown User'; }
    }

    function hideTweet(tweet) { tweet.style.display = 'none'; }

    function hideAllTweetsFromUser(userId) {
        const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
        let cnt = 0;
        tweets.forEach(t => {
            if (getUserId(t) === userId) { hideTweet(t); cnt++; }
        });
        logger.success(`ユーザー @${userId} の ${cnt} 件を非表示`);
    }

    function createDeleteButton(tweet, userId) {
        const btn = document.createElement('button');
        btn.innerText = CONFIG.buttonLabels.hide;
        btn.classList.add('custom-delete-btn');
        btn.title = 'このツイートを非表示';
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                const tweetId = getTweetId(tweet);
                const userName = getUserName(tweet);
                const hideUser = confirm(CONFIG.messages.confirmHideUser(userName, userId));
                if (hideUser) {
                    userManager.addHiddenUser(userId);
                    hideAllTweetsFromUser(userId);
                } else {
                    userManager.addHiddenTweet(tweetId);
                    hideTweet(tweet);
                    logger.info(`ツイート非表示: ${userName}`);
                }
            } catch (err) { logger.error('ボタンクリック処理エラー:', err); }
        });
        return btn;
    }

    function processTweet(tweet) {
        try {
            const userId = getUserId(tweet);
            const tweetId = getTweetId(tweet);
            if (!userId) return;

            if (userManager.isUserHidden(userId) || userManager.isTweetHidden(tweetId)) {
                hideTweet(tweet);
                return;
            }

            if (tweet.querySelector(CONFIG.selectors.deleteButton)) return;

            const btn = createDeleteButton(tweet, userId);
            const info = tweet.querySelector(CONFIG.selectors.infoContainer);
            if (info) info.appendChild(btn);
        } catch (e) { logger.error('ツイート処理エラー:', e); }
    }

    function processAllTweets() {
        const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
        tweets.forEach(processTweet);
    }

    function showManagementPanel() {
        const users = userManager.getHiddenUsers();
        if (users.length === 0) { alert(CONFIG.messages.noHiddenUsers); return; }
        let msg = `=== 非表示管理 ===\n\n`;
        users.forEach((u,i)=>{ msg += `${i+1}. @${u}\n`; });
        msg += `\n番号を入力してください（キャンセルで閉じる）:`;
        const input = prompt(msg);
        if (input) {
            const idx = parseInt(input)-1;
            if (idx>=0 && idx<users.length) {
                const u = users[idx];
                if (confirm(CONFIG.messages.confirmUnblock(u))) {
                    userManager.removeHiddenUser(u);
                    alert(`@${u} を解除しました。ページを再読み込みしてください。`);
                }
            }
        }
    }

    function createManageButton() {
        if (document.querySelector(CONFIG.selectors.manageButton)) return;
        const btn = document.createElement('button');
        btn.innerText = CONFIG.buttonLabels.manage;
        btn.classList.add('custom-manage-btn');
        btn.title = '非表示ユーザー管理';
        btn.addEventListener('click', showManagementPanel);
        document.body.appendChild(btn);
    }

    function observeTarget(node) {
        let timer;
        const obs = new MutationObserver(()=>{
            clearTimeout(timer);
            timer = setTimeout(()=>{ processAllTweets(); },100);
        });
        obs.observe(node, {childList:true,subtree:true});
    }

    function initializeObserver() {
        const node = document.querySelector(CONFIG.selectors.tweetList);
        if (node) { observeTarget(node); }
        else { observeTarget(document.body); }
    }

    function executeStartup() {
        processAllTweets();
        initializeObserver();
        createManageButton();
        logger.clearAndShowInstructions();
        setInterval(()=>{ userManager.printStats(); }, CONFIG.statsInterval);
    }

    function initialize() {
        if (document.readyState==='loading') {
            document.addEventListener('DOMContentLoaded', executeStartup);
        } else { executeStartup(); }
    }

    initialize();

})();
