// ==UserScript==
// @name         Yahoo!リアルタイム検索 DOM構造解析
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Yahoo!リアルタイム検索の現在のDOM構造を解析して適切なセレクターを見つけます
// @author       Debug
// @match        https://search.yahoo.co.jp/realtime/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('🔍 Yahoo!リアルタイム検索 DOM構造解析開始');
    console.log('現在のURL:', location.href);
    
    // DOM が読み込まれてから実行
    function analyzePage() {
        console.log('📊 ページ解析開始...');
        
        // 基本情報
        console.log('=== 基本情報 ===');
        console.log('title:', document.title);
        console.log('readyState:', document.readyState);
        console.log('全要素数:', document.querySelectorAll('*').length);
        
        // ツイート関連の要素を探す
        console.log('\n=== ツイート関連要素の検索 ===');
        
        // 可能性のあるクラス名パターン
        const patterns = [
            // 既存のセレクター
            '.Tweet_bodyContainer__ud_57',
            '.Tweet_authorID__JKhEb', 
            '.Tweet_authorName__wer3j',
            '.Tweet_info__bBT3t',
            '.TweetList_list__Xf9wM',
            
            // 一般的なパターン
            '[class*="Tweet"]',
            '[class*="tweet"]',
            '[class*="post"]',
            '[class*="Post"]',
            '[class*="item"]',
            '[class*="Item"]',
            '[class*="container"]',
            '[class*="Container"]',
            '[class*="list"]',
            '[class*="List"]',
            '[class*="author"]',
            '[class*="Author"]',
            '[class*="user"]',
            '[class*="User"]',
            '[class*="name"]',
            '[class*="Name"]',
            '[class*="id"]',
            '[class*="ID"]',
            
            // 構造的な要素
            'article',
            'section',
            '.timeline',
            '.feed',
            '.stream'
        ];
        
        patterns.forEach(pattern => {
            const elements = document.querySelectorAll(pattern);
            if (elements.length > 0) {
                console.log(`✅ ${pattern}: ${elements.length}件`);
                
                // 最初の数個の要素の詳細を表示
                for (let i = 0; i < Math.min(3, elements.length); i++) {
                    const el = elements[i];
                    console.log(`  [${i}] タグ: ${el.tagName}, クラス: "${el.className}", テキスト長: ${el.textContent?.length || 0}`);
                }
            }
        });
        
        // 特定の文字列を含む要素を検索
        console.log('\n=== 特定文字列を含む要素 ===');
        const searchStrings = ['@', 'RT', 'いいね', 'リツイート', '返信'];
        
        searchStrings.forEach(str => {
            const elements = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.includes(str) && 
                el.children.length < 10 // 親要素を除外
            );
            
            if (elements.length > 0) {
                console.log(`🔍 "${str}" を含む要素: ${elements.length}件`);
                elements.slice(0, 3).forEach((el, i) => {
                    console.log(`  [${i}] ${el.tagName}.${el.className}: "${el.textContent.substring(0, 50)}..."`);
                });
            }
        });
        
        // クラス名の統計
        console.log('\n=== クラス名統計（TOP 20） ===');
        const classNames = new Map();
        
        document.querySelectorAll('*[class]').forEach(el => {
            el.className.split(' ').forEach(cls => {
                if (cls.trim()) {
                    classNames.set(cls, (classNames.get(cls) || 0) + 1);
                }
            });
        });
        
        [...classNames.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .forEach(([cls, count]) => {
                console.log(`  ${cls}: ${count}回`);
            });
        
        // ページの主要構造を表示
        console.log('\n=== ページ主要構造 ===');
        function analyzeElement(el, depth = 0) {
            if (depth > 4) return; // 深度制限
            
            const indent = '  '.repeat(depth);
            const children = el.children.length;
            const text = el.textContent?.substring(0, 30).replace(/\s+/g, ' ') || '';
            
            if (children > 0 || text.length > 5) {
                console.log(`${indent}${el.tagName}${el.className ? '.' + el.className.split(' ')[0] : ''} (子:${children}) "${text}"`);
                
                if (children < 20 && depth < 3) { // 子要素が多すぎる場合は省略
                    Array.from(el.children).slice(0, 10).forEach(child => 
                        analyzeElement(child, depth + 1)
                    );
                }
            }
        }
        
        const main = document.querySelector('main') || document.querySelector('#main') || document.body;
        if (main) {
            console.log('メイン要素から解析:');
            analyzeElement(main);
        }
        
        console.log('\n🔍 解析完了！上記の情報を基にセレクターを更新してください。');
    }
    
    // ページ読み込み完了後に解析実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(analyzePage, 1000); // 1秒待ってから解析
        });
    } else {
        setTimeout(analyzePage, 1000); // 既に読み込み済みの場合も1秒待つ
    }
    
    // 10秒後に再解析（動的コンテンツ対応）
    setTimeout(() => {
        console.log('\n🔄 10秒後の再解析:');
        analyzePage();
    }, 10000);
    
    // 手動解析用の関数をグローバルに公開
    window.analyzeYahooPage = analyzePage;
    
    console.log('💡 手動で解析したい場合は analyzeYahooPage() を実行してください');
    
})();
