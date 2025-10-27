# タスク完了時のチェックリスト

## コード変更後の確認項目

### 1. 型チェック
```bash
npm run check
```
- Svelte コンポーネントの型エラーをチェック
- TypeScript ファイルの型整合性を確認

### 2. ビルド確認
```bash
npm run build:dir
```
- ビルドエラーがないことを確認
- `dist/` と `dist-electron/` の出力を確認

### 3. 動作確認
```bash
npm run dev
```
以下を手動テスト:
- 各描画ツール（Select, Rect, Circle, Line, Path）が正常動作
- 図形の選択・移動・リサイズが機能
- SVGエクスポート（保存・クリップボード）が正常
- Clear All が正常動作

### 4. コンソールエラーチェック
- Electron DevTools でエラーがないか確認
- 既知の無害なエラー（Autofill警告）は無視可

## コードレビュー観点

### エンジンコード変更時
- `Renderer.ts`: render() メソッドの描画順序を確認
- `Shape.ts`: 各図形クラスの draw() と hitTest() の実装確認
- `Tool.ts`: ツール切り替え時の状態リセットを確認

### UIコンポーネント変更時
- `Canvas.svelte`: イベントハンドラーの処理フロー確認
- マウスイベントの座標計算が正確か確認

### Electron統合変更時
- `electron/main.ts`: IPC通信の正常動作確認
- セキュリティ設定（contextIsolation等）の確認

## パフォーマンスチェック
- 50個以上の図形を配置しても 60fps を維持
- 選択・移動操作がスムーズか確認
- メモリリークがないか確認

## リリース前チェック（Phase 2以降）
- [ ] 全プラットフォームでビルド成功
- [ ] SVG出力の標準準拠性確認
- [ ] エラーハンドリングの実装
- [ ] Undo/Redo機能のテスト
