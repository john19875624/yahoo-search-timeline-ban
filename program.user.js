// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。（UIは保持）
// @author       Refactored
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
            tweetList: 'ul.rtTimeline',
            tweetContainer: 'ul.rtTimeline li.rtTimeline-Tweet',  // 🔧 厳密化
            authorId: '.Tweet_authorID__JKhEb',
            authorName: '.Tweet_authorName__wer3j',
            infoContainer: '.Tweet_info__bBT3t',
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
    // II. ユーティリティ & クラス
    // -------------------
    class Logger {
        info(msg, data=null) { console.log('[YahooHider] ℹ️', msg, data||''); }
        success(msg, data=null) { console.log('[YahooHider] ✅', msg, data||''); }
        error(msg, data=null) { console.error('[YahooHider] ❌', msg, data||''); }
        debug(msg, data=null) { /* 必要なら console.log */ }
    }
    const logger = new Logger();

    class UserManager {
        constructor() {
            this.hiddenUsers = this.load(CONFIG.storageKeys.hiddenUsers, CONFIG.predefinedBlockedUsers);
            this.hiddenTweetIds = this.load(CONFIG.storageKeys.hiddenTweets, []);
        }
        load(key, defaults) {
            try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').concat(defaults)); }
            catch { return new Set(defaults); }
        }
        save(key, data) { localStorage.setItem(key, JSON.stringify(Array.from(data))); }
        addUser(u){ this.hiddenUsers.add(u); this.save(CONFIG.storageKeys.hiddenUsers,this.hiddenUsers);}
        removeUser(u){ this.hiddenUsers.delete(u); this.save(CONFIG.storageKeys.hiddenUsers,this.hiddenUsers);}
        addTweet(t){ this.hiddenTweetIds.add(t); this.save(CONFIG.storageKeys.hiddenTweets,this.hiddenTweetIds);}
        isUserHidden(u){ return this.hiddenUsers.has(u);}
        isTweetHidden(t){ return this.hiddenTweetIds.has(t);}
        getUsers(){ return Array.from(this.hiddenUsers);}
    }
    const userManager = new UserManager();

    // -------------------
    // III. 処理関数
    // -------------------
    function getTweetId(tweet) {
        const text = tweet.textContent.trim().substring(0,100);
        return btoa(unescape(encodeURIComponent(text))).replace(/[^a-zA-Z0-9]/g,'').substring(0,16);
    }
    function getUserId(tweet){
        const el = tweet.querySelector(CONFIG.selectors.authorId);
        return el ? el.innerText.replace('@','').trim() : null;
    }
    function getUserName(tweet){
        const el = tweet.querySelector(CONFIG.selectors.authorName);
        return el ? el.innerText.trim() : 'Unknown';
    }
    function hideTweet(tweet){ tweet.style.display = 'none'; }  // 🔧 remove禁止

    function processTweet(tweet){
        const userId = getUserId(tweet);
        const tweetId = getTweetId(tweet);
        if(!userId) return;

        if(userManager.isUserHidden(userId) || userManager.isTweetHidden(tweetId)){
            hideTweet(tweet);
            return;
        }
        if(tweet.querySelector(CONFIG.selectors.deleteButton)) return;

        const btn = document.createElement('button');
        btn.innerText = CONFIG.buttonLabels.hide;
        btn.className = 'custom-delete-btn';
        btn.addEventListener('click',()=>{
            const userName = getUserName(tweet);
            if(confirm(CONFIG.messages.confirmHideUser(userName,userId))){
                userManager.addUser(userId);
                document.querySelectorAll(CONFIG.selectors.tweetContainer)
                    .forEach(t => { if(getUserId(t)===userId) hideTweet(t); });
            }else{
                userManager.addTweet(tweetId);
                hideTweet(tweet);
            }
        });
        const info = tweet.querySelector(CONFIG.selectors.infoContainer);
        if(info) info.appendChild(btn);
    }

    function processAllTweets(){
        document.querySelectorAll(CONFIG.selectors.tweetContainer).forEach(processTweet);
    }

    function createManageButton(){
        if(document.querySelector(CONFIG.selectors.manageButton)) return;
        const btn=document.createElement('button');
        btn.innerText=CONFIG.buttonLabels.manage;
        btn.className='custom-manage-btn';
        btn.onclick=()=>{
            const users=userManager.getUsers();
            if(!users.length){ alert(CONFIG.messages.noHiddenUsers); return; }
            const choice=prompt(users.map((u,i)=>`${i+1}. @${u}`).join('\n')+"\n\n番号入力で解除");
            if(choice){
                const idx=parseInt(choice)-1;
                if(idx>=0 && idx<users.length){
                    if(confirm(CONFIG.messages.confirmUnblock(users[idx]))){
                        userManager.removeUser(users[idx]);
                        alert(`@${users[idx]} を解除しました。再読み込みしてください。`);
                    }
                }
            }
        };
        document.body.appendChild(btn);
    }

    function observeTimeline(){
        const target=document.querySelector(CONFIG.selectors.tweetList)||document.body;
        new MutationObserver(()=>processAllTweets())
            .observe(target,{childList:true,subtree:true});
    }

    // -------------------
    // IV. 初期化
    // -------------------
    function init(){
        processAllTweets();
        observeTimeline();
        createManageButton();
        logger.success('Yahoo!リアルタイム検索 ツイート非表示スクリプト稼働中');
    }
    init();

})();
