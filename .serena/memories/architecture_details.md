# アーキテクチャ詳細

## レンダリングエンジン構造

### Renderer (src/lib/engine/Renderer.ts)
**責務**: Canvas描画とSVGエクスポートの中核エンジン

**主要メソッド**:
- `render()`: 全図形 + プレビュー + 選択ボックスを描画
- `addShape(shape)`: 図形をシーンに追加
- `removeShape(id)`: 図形を削除
- `moveShape(id, dx, dy)`: 図形を移動
- `resizeShape(handle, dx, dy)`: 図形をリサイズ
- `selectShape(id)`: 図形を選択
- `getShapeAt(x, y)`: 座標から図形を検索（逆順ヒットテスト）
- `getHandleAt(x, y)`: 座標からハンドルを検索
- `exportSVG()`: SVG文字列を生成

**状態管理**:
- `shapes: Shape[]`: 描画済み図形リスト
- `selectedId: string | null`: 選択中の図形ID
- `previewShape: Shape | null`: 描画中のプレビュー
- `transformControls: TransformControls`: 変形ハンドル管理

### Shape型システム (src/lib/engine/Shape.ts)
**図形クラス階層**:
```
Shape (type union)
├─ Circle
├─ Rect
├─ Line
└─ Path
```

**各図形の実装**:
- `draw(ctx)`: Canvas描画処理
- `hitTest(x, y)`: 座標判定（クリック検出用）
- `toSVG()`: SVG要素文字列生成
- `props`: 図形固有のプロパティ（位置、サイズ、色等）

### ToolManager (src/lib/engine/Tool.ts)
**責務**: 描画ツールの状態管理とプレビュー生成

**ツールタイプ**:
- `select`: 選択・移動ツール
- `rect`: 矩形描画ツール
- `circle`: 円描画ツール
- `line`: 直線描画ツール
- `path`: パス描画ツール（クリックで点追加）

**描画フロー**:
1. `startDrawing(x, y)`: 描画開始点を記録
2. `updateDrawing(x, y)`: プレビュー図形を更新
3. `finishDrawing()`: 完成した図形を返す

### TransformControls (src/lib/engine/TransformControls.ts)
**責務**: 選択ボックスとリサイズハンドルの管理

**ハンドルタイプ**:
- `nw`, `ne`, `sw`, `se`: コーナーハンドル（四隅）
- `n`, `s`, `e`, `w`: 辺ハンドル（上下左右）

**機能**:
- `draw(ctx, bounds)`: 選択ボックスとハンドルを描画
- `getHandleAt(x, y, bounds)`: クリック位置からハンドルを特定
- `calculateResize(handle, dx, dy, bounds)`: リサイズ計算

## イベントフロー

### 描画モード（Rect, Circle, Line, Path）
```
MouseDown → startDrawing()
   ↓
MouseMove → updateDrawing() → setPreview() → render()
   ↓
MouseUp → finishDrawing() → addShape() → render()
```

### 選択モード（Select）
```
MouseDown → getHandleAt() / getShapeAt() → selectShape()
   ↓
MouseMove → resizeShape() / moveShape() → render()
   ↓
MouseUp → 状態リセット
```

## データフロー

### Svelte ⇄ Engine連携
```
Canvas.svelte
  ├─ onMount(): Renderer + ToolManager 初期化
  ├─ マウスイベント → Engine呼び出し
  ├─ Engine状態変更 → render() → Canvas更新
  └─ exportSVG() → Electron IPC → ファイル保存
```

### Electron IPC通信
```
Renderer Process (Canvas.svelte)
  ↓ ipcRenderer.invoke('save-svg', svgString)
Main Process (electron/main.ts)
  ↓ dialog.showSaveDialog()
  ↓ fs.writeFileSync()
  ↓ return { success, filePath }
Renderer Process
  ↓ alert(result)
```

## 設計上の特徴

### 分離された責務
- **Renderer**: 描画とシーン管理のみ
- **ToolManager**: ツール固有のロジック
- **TransformControls**: 変形UI専用
- **Canvas.svelte**: ユーザーインタラクション管理

### 拡張性
- 新しい図形: Shape インターフェースを実装
- 新しいツール: ToolType に追加、ToolManager拡張
- 新しい変形: TransformControls にハンドル追加

### パフォーマンス考慮
- 全再描画方式（シンプル、50図形程度まで最適）
- 将来の最適化: Dirty Region, Spatial Indexing
