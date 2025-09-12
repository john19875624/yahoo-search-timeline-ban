// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  指定したユーザーのツイートを非表示にし、削除ボタンを追加します。削除したユーザーを記憶します。
// @author       Refactored
// @match        https://search.yahoo.co.jp/realtime/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
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
                console.error('非表示ユーザーの読み込みに失敗しました:', error);
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
                console.error('非表示ツイートの読み込みに失敗しました:', error);
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
                console.error('非表示ユーザーの保存に失敗しました:', error);
            }
        }

        /**
         * 非表示ツイートIDを保存する
         */
        saveHiddenTweets() {
            try {
                localStorage.setItem(CONFIG.storageKeys.hiddenTweets, JSON.stringify(Array.from(this.hiddenTweetIds)));
            } catch (error) {
                console.error('非表示ツイートの保存に失敗しました:', error);
            }
        }

        /**
         * ユーザーを非表示リストに追加
         * @param {string} userId - ユーザーID
         */
        addHiddenUser(userId) {
            this.hiddenUsers.add(userId);
            this.saveHiddenUsers();
            console.log(`ユーザー @${userId} を非表示リストに追加しました`);
        }

        /**
         * ユーザーを非表示リストから削除
         * @param {string} userId - ユーザーID
         */
        removeHiddenUser(userId) {
            this.hiddenUsers.delete(userId);
            this.saveHiddenUsers();
            console.log(`ユーザー @${userId} を非表示リストから削除しました`);
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
    }

    // グローバルインスタンス
    const userManager = new UserManager();

    /**
     * ツイートIDを生成する（疑似的）
     * @param {Element} tweet - ツイート要素
     * @returns {string} - ツイートID
     */
    function getTweetId(tweet) {
        // ツイートのテキスト内容とユーザーIDからハッシュを生成
        const userId = getUserId(tweet);
        const tweetText = tweet.textContent.trim().substring(0, 100);
        return btoa(`${userId}_${tweetText}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }

    /**
     * ユーザーIDを取得する
     * @param {Element} tweet - ツイート要素
     * @returns {string|null} - ユーザーID（@マークなし）
     */
    function getUserId(tweet) {
        const authorElement = tweet.querySelector(CONFIG.selectors.authorId);
        if (!authorElement) return null;
        
        return authorElement.innerText.replace('@', '').trim();
    }

    /**
     * ユーザー名を取得する
     * @param {Element} tweet - ツイート要素
     * @returns {string|null} - ユーザー名
     */
    function getUserName(tweet) {
        const nameElement = tweet.querySelector(CONFIG.selectors.authorName);
        return nameElement ? nameElement.innerText.trim() : null;
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
            }
        });
        
        return button;
    }

    /**
     * ツイートを非表示にする
     * @param {Element} tweet - ツイート要素
     */
    function hideTweet(tweet) {
        tweet.style.display = 'none';
    }

    /**
     * 特定ユーザーの全ツイートを非表示にする
     * @param {string} userId - ユーザーID
     */
    function hideAllTweetsFromUser(userId) {
        const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
        let hiddenCount = 0;
        
        tweets.forEach(tweet => {
            const tweetUserId = getUserId(tweet);
            if (tweetUserId === userId) {
                hideTweet(tweet);
                hiddenCount++;
            }
        });
        
        console.log(`ユーザー @${userId} の ${hiddenCount} 件のツイートを非表示にしました`);
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
        const userId = getUserId(tweet);
        const tweetId = getTweetId(tweet);
        
        if (!userId) return;
        
        // ユーザーまたはツイートが非表示対象の場合は非表示
        if (userManager.isUserHidden(userId) || userManager.isTweetHidden(tweetId)) {
            hideTweet(tweet);
            return;
        }
        
        // 削除ボタンが既に存在する場合はスキップ
        if (hasDeleteButton(tweet)) return;
        
        // 削除ボタンを追加
        const deleteButton = createDeleteButton(tweet, userId);
        const infoContainer = tweet.querySelector(CONFIG.selectors.infoContainer);
        
        if (infoContainer) {
            infoContainer.appendChild(deleteButton);
        }
    }

    /**
     * 全てのツイートを処理する
     */
    function processAllTweets() {
        const tweets = document.querySelectorAll(CONFIG.selectors.tweetContainer);
        tweets.forEach(processTweet);
    }

    /**
     * 管理パネルを表示する
     */
    function showManagementPanel() {
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
    }

    /**
     * 管理ボタンを作成する
     */
    function createManageButton() {
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
    }

    /**
     * MutationObserverを初期化する
     */
    function initializeObserver() {
        const targetNode = document.querySelector(CONFIG.selectors.tweetList);
        if (!targetNode) {
            console.warn('ツイートリストが見つかりませんでした');
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                }
            });
            
            if (shouldProcess) {
                // デバウンス処理
                clearTimeout(window.tweetProcessingTimeout);
                window.tweetProcessingTimeout = setTimeout(processAllTweets, 100);
            }
        });
        
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
        
        console.log('MutationObserver が初期化されました');
    }

    /**
     * 初期化処理
     */
    function initialize() {
        console.log('Yahoo!リアルタイム検索ツイート非表示スクリプトを開始しました');
        console.log(`非表示ユーザー数: ${userManager.getStats().hiddenUsers}`);
        console.log(`非表示ツイート数: ${userManager.getStats().hiddenTweets}`);
        
        // DOM が完全に読み込まれてから実行
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                processAllTweets();
                initializeObserver();
                createManageButton();
            });
        } else {
            processAllTweets();
            initializeObserver();
            createManageButton();
        }
    }

    // スクリプト開始
    initialize();

})();
