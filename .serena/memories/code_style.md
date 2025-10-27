# コードスタイル・規約

## 命名規則
- **ファイル名**: PascalCase for components (Canvas.svelte, Renderer.ts), camelCase for utilities (electron.ts)
- **クラス名**: PascalCase (Renderer, ToolManager, Circle, Rect)
- **関数/メソッド**: camelCase (addShape, getShapeAt, handleMouseDown)
- **変数**: camelCase (currentTool, isDragging, draggedShapeId)
- **型/インターフェース**: PascalCase with descriptive suffixes (ShapeProps, ToolType, HandleType)

## TypeScript規約
- **型定義**: インターフェース優先、必要に応じて type エイリアス使用
- **型アノテーション**: 関数パラメータと戻り値に明示的な型指定
- **null/undefined**: `| null` での明示的な null 許容型使用
- **Import**: `import type` での型専用インポート（ToolType, HandleType など）

## Svelteスタイル
- **スクリプトタグ**: `<script lang="ts">` でTypeScript使用
- **リアクティブ宣言**: `let` 変数での状態管理
- **イベントハンドラー**: `onclick={handler}` 形式（Svelte 5）
- **バインディング**: `bind:this={element}` での要素参照

## ファイル構成
- **コンポーネント**: `src/lib/` 配下に配置
- **エンジンコード**: `src/lib/engine/` で分離
- **ユーティリティ**: `src/lib/utils/` で分離
- **Electronメイン**: `electron/` ディレクトリ

## コードフォーマット
- インデント: 2スペース
- セミコロン: なし（省略スタイル）
- 引用符: シングルクォート優先
- 行末カンマ: 複数行の場合あり

## 設計パターン
- **クラスベース**: エンジンコンポーネント（Renderer, ToolManager）
- **コンポジション**: Svelteコンポーネント内でエンジンを使用
- **状態管理**: ローカル state + props パッシング
- **イベント駆動**: マウスイベントハンドラでの操作処理
