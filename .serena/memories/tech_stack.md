# 技術スタック詳細

## フロントエンド
- **Svelte**: 5.39.6 - リアクティブUIフレームワーク
- **TypeScript**: 5.9.3 - 型安全性
- **Vite**: 7.1.7 - 高速開発サーバー・ビルド

## デスクトップアプリ
- **Electron**: 38.4.0 - クロスプラットフォームデスクトップアプリ
- **electron-builder**: 26.0.12 - アプリパッケージング

## Vite プラグイン
- `@sveltejs/vite-plugin-svelte`: 6.2.1 - Svelte統合
- `vite-plugin-electron`: 0.29.0 - Electronメインプロセス統合
- `vite-plugin-electron-renderer`: 0.14.6 - Electronレンダラープロセス統合

## 開発ツール
- `svelte-check`: 4.3.2 - Svelte型チェック
- `@tsconfig/svelte`: 5.0.5 - TypeScript設定プリセット

## ESM対応
- `"type": "module"` - ESM形式を採用
- Electronメインプロセスも ESM で記述
