# Grapher - SVGエディタプロトタイプ

## プロジェクト目的
Electron + Svelte + Canvas による SVG 編集アプリの技術検証プロトタイプ。
現在は Phase 1 段階で、基本的な図形描画・編集・SVGエクスポート機能を実装。

## 技術スタック
- **フレームワーク**: Svelte 5.39.6 + TypeScript 5.9.3
- **デスクトップ**: Electron 38.4.0
- **ビルドツール**: Vite 7.1.7
- **パッケージング**: electron-builder 26.0.12

## 実装済み機能
- ✅ 5種類の図形描画（Rectangle, Circle, Line, Path）
- ✅ Select ツールでの図形移動・リサイズ
- ✅ Transform Controls（ハンドル付き選択ボックス）
- ✅ SVG エクスポート（ファイル保存 + クリップボード）
- ✅ キャンバスクリア機能
- ✅ リアルタイムプレビュー

## アーキテクチャ
```
grapher/
├─ electron/
│  └─ main.ts              # Electronメインプロセス、IPC ハンドラー
├─ src/
│  ├─ lib/
│  │  ├─ engine/
│  │  │  ├─ Shape.ts       # 図形クラス（Circle, Rect, Line, Path）
│  │  │  ├─ Renderer.ts    # Canvas レンダリングエンジン
│  │  │  ├─ Tool.ts        # ツールマネージャー
│  │  │  └─ TransformControls.ts  # 選択・変形ハンドル
│  │  ├─ utils/
│  │  │  └─ electron.ts    # Electron IPC ヘルパー
│  │  └─ Canvas.svelte     # メインキャンバスコンポーネント
│  └─ App.svelte           # エントリーポイント
└─ vite.config.ts          # Electron + Svelte 統合設定
```

## 主要コンポーネント

### Renderer (src/lib/engine/Renderer.ts)
- Canvas 描画エンジン
- 図形管理（追加・削除・移動・リサイズ）
- 選択状態管理
- SVG エクスポート機能

### ToolManager (src/lib/engine/Tool.ts)
- 描画ツール管理（select, rect, circle, line, path）
- 描画状態のトラッキング
- プレビュー生成

### TransformControls (src/lib/engine/TransformControls.ts)
- 選択ボックスとリサイズハンドルの描画
- ハンドルのヒットテスト
- リサイズ計算

## 開発システム
- プラットフォーム: macOS (Darwin)
- Git リポジトリ: なし（ローカル開発）
