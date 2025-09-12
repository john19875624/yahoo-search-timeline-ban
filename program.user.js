// ==UserScript==
// @name         Yahoo!リアルタイム検索ツイート非表示
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  特定の条件に一致するYahoo!リアルタイム検索のツイートを非表示にする
// @author       You
// @match        https://search.yahoo.co.jp/realtime/search*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const logger = {
        log: (...args) => console.log('[Yahoo Tweet Hider]', ...args),
        error: (...args) => console.error('[Yahoo Tweet Hider]', ...args)
    };

    /**
     * Unicode 文字列を Base64 に変換する
     */
    function btoaUnicode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    /**
     * ツイートIDを生成する
     * @param {Element} tweet - ツイート要素
     * @returns {string} - ツイートID
     */
    function getTweetId(tweet) {
        try {
            const tweetText = tweet.textContent
                .normalize('NFKC')        // 全角半角を整理
                .replace(/\s+/g, ' ')     // 空白まとめ
                .trim()
                .substring(0, 100);       // 長すぎる文字列はカット

            return btoaUnicode(tweetText)
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 16);
        } catch (error) {
            logger.error('❌ ツイートID生成エラー:', error, tweet);
            return 'unknown_' + Math.random().toString(36).substring(2, 15);
        }
    }

    /**
     * ツイートを処理する
     */
    function processTweet(tweet) {
        try {
            const id = getTweetId(tweet);

            // 👇 ここに非表示ルールを追加できる
            if (tweet.textContent.includes('特定ワード')) {
                tweet.style.display = 'none';
                logger.log(`🛑 非表示: ${id}`);
            }
        } catch (e) {
            logger.error('processTweet エラー:', e, tweet);
        }
    }

    /**
     * ページ内の全ツイートを処理
     */
    function processAllTweets() {
        document.querySelectorAll('li.rtTimeline-Tweet').forEach(processTweet);
    }

    // 初期実行
    processAllTweets();

    // 監視して追加分も処理
    const observer = new MutationObserver(() => {
        processAllTweets();
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
