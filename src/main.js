/**
 * @fileoverview アプリケーションのエントリーポイント
 */

import { Application } from './Application.js';

/**
 * アプリケーションを起動
 */
async function main() {
    const canvas = document.getElementById('c');
    
    // キャンバスサイズを設定
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    
    try {
        const app = new Application(canvas);
        await app.initialize();
        app.start();
        
        console.log('Application started successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert(error.message);
    }
}

// DOM読み込み完了後に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
