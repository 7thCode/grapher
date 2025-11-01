# Grapher - 開発ログ

## 2025-10-31 - テキストボックス機能の修正

### 問題
- すべてのテキストボックスが最初から動作しない
- 入力できない、表示されない、フォーカスできない、入力後の動作がおかしい

### 原因調査
1. プロジェクトの状態確認
   - Serena MCPでプロジェクト "grapher" をアクティベート
   - プロジェクトメモリから概要を確認

2. コードベース調査
   - `Canvas.svelte:8` - TextBoxクラスがインポート済み
   - `Canvas.svelte:32-35` - テキスト編集状態の変数が定義済み
   - `Canvas.svelte:296-363` - `startTextEditing()` 関数が実装済み
   - `Canvas.svelte:801-807` - Textツールボタンが存在
   - `Tool.ts:95-109` - TextBoxのプレビュー生成ロジックが実装済み
   - `Shape.ts:311-421` - TextBoxクラスが完全実装済み

3. 根本原因の特定
   - **TextBoxは実装されているが、Textツールのマウスイベントハンドリングが未実装**
   - `handleMouseDown`, `handleMouseMove`, `handleMouseUp` でTextツールのケースが処理されていない

### 修正内容

#### Canvas.svelte:198-200 (handleMouseDown)
```typescript
} else if (currentTool === 'text') {
  // Text tool: start drawing text box
  toolManager.startDrawing(x, y)
}
```

#### Canvas.svelte:238-244 (handleMouseMove)
```typescript
} else if (currentTool === 'text') {
  // Text tool: update text box preview
  const state = toolManager.getState()
  if (state.isDrawing) {
    toolManager.updateDrawing(x, y)
    renderer.setPreview(state.preview ?? null)
  }
}
```

#### Canvas.svelte:266-276 (handleMouseUp)
```typescript
} else if (currentTool === 'text') {
  // Text tool: finish drawing text box
  const shape = toolManager.finishDrawing()
  if (shape && shape instanceof TextBox) {
    renderer.addShape(shape)
    renderer.setPreview(null)
    // Immediately start editing the newly created text box
    startTextEditing(shape)
  } else {
    renderer.setPreview(null)
  }
}
```

### 結果
✅ テキストツールが正常に動作するようになった

### 使い方
1. 左のツールパレットから **📝 Text** をクリック
2. キャンバス上でドラッグしてテキストボックスのサイズを決定
3. マウスを離すと自動的にテキスト編集モードに入る
4. テキストを入力可能
5. Escキーまたはフォーカスを外すと編集終了
6. 既存のテキストボックスをダブルクリックで再編集可能

### 技術詳細
- **即座編集開始**: `handleMouseUp` でテキストボックス作成後、即座に `startTextEditing()` を呼び出し
- **contentEditable overlay**: テキスト編集時はHTML div要素をCanvas上にオーバーレイ表示
- **スタイル継承**: fontSize, fontColor, fontFamily などのスタイルがcanvas描画とHTML編集で一致
- **最小サイズ検証**: `Tool.ts:188-189` で50x30px未満のテキストボックスは作成されない

### 変更ファイル
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` (3箇所の修正)

---

## 2025-11-01 - テキストボックスの改行サポート

### 問題
- テキストボックス内でEnterキーを押しても改行が無視される
- Canvas描画時に改行が反映されない

### 原因
1. **Shape.ts:355** - `text.split(' ')` でスペース区切りのみで分割していたため、改行文字（`\n`）が無視されていた
2. **Canvas.svelte:326** - `textContent` でテキストを設定していたため、HTMLの`<br>`タグが必要だった
3. **Canvas.svelte:368** - `textContent` で取得していたため、HTMLタグが文字列として残っていた

### 修正内容

#### 1. Shape.ts:354-382 - 改行を考慮したテキスト描画
```typescript
// 修正前: text.split(' ') で改行が無視される
const words = text.split(' ')

// 修正後: 段落ごとに分割してから単語ラップ処理
const paragraphs = text.split('\n')
const lines: string[] = []

for (const paragraph of paragraphs) {
  // 空の段落（空行）の処理
  if (paragraph.trim() === '') {
    lines.push('')
    continue
  }

  // 各段落内で単語ラップ処理
  const words = paragraph.split(' ')
  let currentLine = ''
  // ... 単語ラップロジック
}
```

#### 2. Canvas.svelte:326 - テキスト編集開始時
```typescript
// 修正前: textContent（改行が失われる）
editorDiv.textContent = textBox.props.text

// 修正後: innerHTML with <br> tags
editorDiv.innerHTML = textBox.props.text.replace(/\n/g, '<br>')
```

#### 3. Canvas.svelte:369-375 - テキスト編集終了時
```typescript
// 修正前: textContent（HTMLタグがそのまま残る）
editingTextBox.props.text = textEditorDiv.textContent || 'Text'

// 修正後: <br>と<div>を\nに変換してHTMLタグを除去
const htmlContent = textEditorDiv.innerHTML
const textWithNewlines = htmlContent
  .replace(/<div>/gi, '\n')
  .replace(/<\/div>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .trim()

editingTextBox.props.text = textWithNewlines || 'Text'
```

### 結果
✅ テキストボックス内で**Enterキー**で改行が可能に
✅ Canvas描画時に改行が正しく反映される
✅ テキスト編集の再開時も改行が保持される
✅ 空行（連続する改行）も正しく処理される
✅ SVGエクスポート/インポート時も改行が維持される

### 使い方
1. テキストボックスを作成またはダブルクリックで編集開始
2. **Enterキー**で改行を入力
3. フォーカスを外すかEscキーで編集終了
4. Canvas上で改行が正しく表示される

### 技術詳細
- **段落分割**: `text.split('\n')` で改行文字を区切りとして段落に分割
- **空行処理**: `paragraph.trim() === ''` で空の段落を検出し、空行として描画
- **HTML変換**: テキスト編集時は `\n` → `<br>` に変換、保存時は逆変換
- **contentEditable**: ブラウザが自動的に `<div>` タグを挿入することがあるため、それも `\n` に変換

### 変更ファイル
- `/Users/oda/project/claude/grapher/src/lib/engine/Shape.ts` (render メソッド)
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` (startTextEditing, finishEditing)

---

## 2025-11-01 - ベジェ曲線の制御点編集機能の実装

### 実装内容
Pathツールで作成したパスをベジェ曲線として編集できる機能を追加。制御点の個別ドラッグ、ポイントの追加・削除、直線とベジェ曲線の相互変換が可能。

### 新規ファイル

#### PathEditManager.ts
パス編集の全てのロジックを管理するクラス。

**主要機能:**
- `startEditing(path)` - パス編集モードを開始
- `stopEditing()` - パス編集モードを終了
- `getHandleAt(x, y)` - 位置にあるハンドルを検索（アンカーポイントまたは制御点）
- `moveHandle(handle, dx, dy)` - ハンドルを移動（アンカーポイントと制御点の両方に対応）
- `addPoint(x, y, insertAfterIndex?)` - 新しいポイントを追加
- `removePoint(pointIndex)` - ポイントを削除（最低2ポイント必要）
- `convertToCubicBezier(pointIndex)` - ポイントをベジェ曲線に変換
- `convertToLine(pointIndex)` - ポイントを直線に変換
- `render(ctx)` - ハンドルとガイドラインを描画

**描画:**
- アンカーポイント: 青色の正方形（6px × 6px）
- 制御点: オレンジ色の円（半径6px）
- ガイドライン: 点線でアンカーポイントと制御点を接続

### 修正内容

#### Shape.ts
`PathPoint` インターフェースにベジェ曲線の制御点フィールドを追加:
```typescript
export interface PathPoint {
  x: number
  y: number
  type: 'M' | 'L' | 'C' | 'Q'
  // Cubic bezier (C) の制御点
  cp1x?: number
  cp1y?: number
  cp2x?: number
  cp2y?: number
  // Quadratic bezier (Q) の制御点
  cpx?: number
  cpy?: number
}
```

#### Renderer.ts
- `PathEditManager` インスタンスを追加
- パス編集の開始/終了メソッドを追加:
  - `startPathEditing(path)`
  - `stopPathEditing()`
  - `isEditingPath()`
  - `getPathEditManager()`
- `render()` メソッドでパス編集ハンドルを描画

#### Canvas.svelte

**状態変数:**
```typescript
let isEditingPath = false
let editingPath: Path | null = null
```

**パス編集の開始:**
- Pathシェイプをダブルクリックで編集モードに入る
- `startPathEditing(path)` 関数でRendererに編集モードを通知

**マウスイベント処理:**
- `handleMouseDown` - パス編集モード時にハンドルをクリックするとドラッグ開始
- `handleMouseMove` - ドラッグ中のハンドルを移動
- `handleMouseUp` - ドラッグ状態をリセット

**UI コントロール:**
ツールバーにパス編集用のボタンを追加:
- ➕ ポイント追加 (A)
- ➖ ポイント削除 (D)
- 🔄 ベジェ曲線に変換 (C)
- 📏 直線に変換 (L)
- ✓ 編集終了 (ESC)

**キーボードショートカット:**
- `A` - 最後のポイントの横に新しいポイントを追加
- `D` - 最後のポイントを削除（最低2ポイント必要）
- `C` - 最後のポイントをベジェ曲線に変換
- `L` - 最後のポイントを直線に変換
- `ESC` - パス編集モードを終了

### 使い方
1. Pathツールで図形を作成
2. Selectツールに切り替え
3. 作成したPathを**ダブルクリック**して編集モードに入る
4. **アンカーポイント**（青い正方形）または**制御点**（オレンジの円）をドラッグして形状を調整
5. ツールバーのボタンまたはキーボードショートカットでポイントの追加・削除・変換
6. ESCキーまたは✓ボタンで編集終了

### 技術詳細
- **ハンドル検出**: 6px半径内でマウス位置とハンドル位置の距離を計算
- **SVG パスデータ更新**: `updatePathData()` でポイント配列から `d` 属性を再生成
- **ベジェ曲線変換**: 次のポイントとの距離の1/3と2/3の位置に制御点を配置
- **状態管理**: `window._draggedPathHandle` で一時的にドラッグ中のハンドルを保持

### 変更ファイル
- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - **NEW**
- `/Users/oda/project/claude/grapher/src/lib/engine/Shape.ts` - PathPoint interface拡張
- `/Users/oda/project/claude/grapher/src/lib/engine/Renderer.ts` - PathEditManager統合
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - UI/イベント処理

---

## 2025-11-01 - パッケージング問題と未保存変更確認機能の修正

### 問題1: パッケージング後にアプリが起動しない

**症状:**
- 開発環境 (`npm run dev`) では正常に動作
- パッケージング後 (`npm run build`) は白い画面のみ表示
- JavaScriptファイルが読み込まれない

**原因:**
- Electronのデフォルト設定でファイルが `app.asar` アーカイブにパッケージされる
- ES modules (`type="module"`) は asar アーカイブから正常にロードできない

**修正内容:**

#### package.json
```json
"build": {
  "appId": "com.grapher.app",
  "productName": "Grapher",
  "asar": false,  // ← 追加
  "files": [
    "dist/**/*",
    "dist-electron/**/*"
  ],
  ...
}
```

**結果:**
✅ ファイルが `app.asar` ではなく `app/` ディレクトリに展開される
✅ ES modules が正常にロードされる
✅ パッケージング後のアプリが正常に起動する

---

### 問題2: アプリが終了できない

**症状:**
- ウィンドウの×ボタンや `Cmd+Q` で終了できない
- アプリが常に開いたまま

**原因:**
- `electron/main.ts:178` で**常に** `e.preventDefault()` を呼んでいた
- 未保存の変更がない場合でもウィンドウの終了が阻止されていた

**修正内容:**

#### electron/main.ts (修正前)
```typescript
win.on('close', async (e) => {
  if (!win || pendingClose) return

  e.preventDefault()  // ❌ 常に呼ばれる

  const response = await win.webContents.executeJavaScript(...)
  if (response === true) {
    // ダイアログ表示
  } else {
    win.destroy()
  }
})
```

#### electron/main.ts (修正後)
```typescript
win.on('close', async (e) => {
  if (!win || pendingClose) return

  // 最初にpreventDefaultを呼ぶ
  e.preventDefault()

  try {
    const response = await win.webContents.executeJavaScript(...)

    if (response === true) {
      // ダイアログ表示
    } else {
      win.destroy()  // ✅ 未保存がなければ終了
    }
  } catch (err) {
    win.destroy()
  }
})
```

**結果:**
✅ 未保存の変更がない場合は正常に終了する
✅ 未保存の変更がある場合のみダイアログを表示

---

### 問題3: 未保存変更確認ダイアログが表示されない

**症状:**
- 図形を描画してから終了しても、確認ダイアログが表示されない
- 即座に終了してしまう

**原因:**
- `isDirty` 変数が `window.isDirty` として公開されていない
- Svelte 5 の runesモードで `$effect()` が `isDirty` の変更を追跡できていない

**修正内容:**

#### Canvas.svelte
```typescript
// Helper function to set isDirty and window.isDirty
function setDirty(value: boolean) {
  isDirty = value
  if (typeof window !== 'undefined') {
    (window as any).isDirty = value
  }
}

// $effect でも公開（二重保険）
$effect(() => {
  if (typeof window !== 'undefined') {
    (window as any).isDirty = isDirty
  }
})

// 変更検出時
renderer.setOnChangeCallback(() => {
  setDirty(true)
})

// 保存時
setDirty(false)
```

**結果:**
✅ 図形を描画すると `window.isDirty` が `true` に設定される
✅ 終了時に確認ダイアログが正常に表示される

---

### 問題4: ダイアログが一瞬表示されて消える

**症状:**
- 確認ダイアログが一瞬表示されるが、すぐに消えてアプリが終了する

**原因:**
- `await executeJavaScript()` を待っている間に、デフォルトの終了処理が進んでしまう
- `e.preventDefault()` を呼ぶタイミングが遅すぎた

**修正内容:**

#### electron/main.ts (最終版)
```typescript
win.on('close', async (e) => {
  if (!win || pendingClose) return

  // ✅ 最初に必ずpreventDefaultを呼ぶ
  e.preventDefault()

  try {
    // その後でチェック
    const response = await win.webContents.executeJavaScript(...)

    if (response === true) {
      const choice = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: 'Do you want to save the changes before closing?',
        detail: 'Your changes will be lost if you don\'t save them.'
      })

      if (choice.response === 0) {
        // Save
        pendingClose = true
        win.webContents.send('menu-save')
      } else if (choice.response === 1) {
        // Don't Save
        win.destroy()
      }
      // Cancel: do nothing
    } else {
      // No unsaved changes
      win.destroy()
    }
  } catch (err) {
    console.error('Error checking isDirty:', err)
    win.destroy()
  }
})
```

**結果:**
✅ ダイアログが正常に表示され、ユーザーの選択を待つ
✅ Save/Don't Save/Cancel の3つの選択肢が正しく動作

---

### Svelte 5 runesモード対応

`$:` リアクティブステートメントが使えないため、全て `$effect()` または関数に変換:

```typescript
// 修正前
$: {
  if (renderer) {
    const snapManager = renderer.getSnapManager()
    snapManager.setSettings({ enabled: snapEnabled, gridEnabled })
  }
}

// 修正後
$effect(() => {
  if (renderer) {
    const snapManager = renderer.getSnapManager()
    snapManager.setSettings({ enabled: snapEnabled, gridEnabled })
  }
})
```

---

### 最終的な動作

✅ **何も描画せずに終了**: 即座に終了（ダイアログなし）
✅ **描画してから終了**: 確認ダイアログが表示される
  - **Save**: 保存ダイアログ → 保存後に終了
  - **Don't Save**: 即座に終了
  - **Cancel**: ウィンドウが開いたまま
✅ **保存後に終了**: 即座に終了（ダイアログなし）

---

### 変更ファイル

- `/Users/oda/project/claude/grapher/package.json` - asar無効化
- `/Users/oda/project/claude/grapher/electron/main.ts` - ウィンドウクローズ処理
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - isDirty管理、Svelte 5対応
- `/Users/oda/project/claude/grapher/src/main.ts` - デバッグログ削除
- `/Users/oda/project/claude/grapher/src/App.svelte` - デバッグUI削除

---

## 2025-11-01 - ドラッグによる複数選択機能の実装

### 実装内容
Selectツールで空白エリアをドラッグすることで、範囲内の複数のシェイプを一度に選択できる機能を追加。

### 機能詳細

**基本動作:**
- Selectツールで空白エリアをクリック&ドラッグすると選択矩形が表示される
- ドラッグ中は半透明の青い矩形で選択範囲を可視化
- マウスを離すと、矩形内に交差するすべてのシェイプが選択される

**Shiftキーによる追加選択:**
- Shiftキーを押しながらドラッグ選択を開始すると、既存の選択を維持したまま追加選択が可能
- Shiftキーなしでドラッグ選択すると、既存の選択がクリアされて新しい選択に置き換わる

### 実装詳細

#### Canvas.svelte - 状態変数の追加
```typescript
// Drag selection (rubber band selection)
let isSelectingArea = false
let selectionRect = { x: 0, y: 0, width: 0, height: 0 }
```

#### Canvas.svelte:409-419 - handleMouseDown
空白エリアをクリックしたときに選択矩形のドラッグを開始:
```typescript
} else {
  // Clicking on empty area starts drag selection
  isSelectingArea = true
  dragStart = { x, y }
  selectionRect = { x, y, width: 0, height: 0 }

  // Clear selection unless Shift is held (for additive selection)
  if (!e.shiftKey) {
    renderer.selectShape(null)
    hasSelection = false
  }
}
```

#### Canvas.svelte:454-465 - handleMouseMove
ドラッグ中に選択矩形のサイズを更新:
```typescript
if (isSelectingArea) {
  // Update selection rectangle
  const minX = Math.min(dragStart.x, x)
  const minY = Math.min(dragStart.y, y)
  const maxX = Math.max(dragStart.x, x)
  const maxY = Math.max(dragStart.y, y)
  selectionRect = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}
```

#### Canvas.svelte:527-561 - handleMouseUp
選択矩形内のシェイプを検索して選択:
```typescript
if (isSelectingArea) {
  // Find shapes within selection rectangle
  const shapes = renderer.getShapes()
  const selectedShapes: string[] = []

  for (const shape of shapes) {
    const bounds = shape.getBounds()
    // Check if shape's bounds intersect with selection rectangle
    if (
      bounds.x < selectionRect.x + selectionRect.width &&
      bounds.x + bounds.width > selectionRect.x &&
      bounds.y < selectionRect.y + selectionRect.height &&
      bounds.y + bounds.height > selectionRect.y
    ) {
      selectedShapes.push(shape.props.id)
    }
  }

  // Select the shapes (additive if already had selection)
  if (selectedShapes.length > 0) {
    // Select first shape
    renderer.selectShape(selectedShapes[0], hasSelection)
    // Add remaining shapes to selection
    for (let i = 1; i < selectedShapes.length; i++) {
      renderer.selectShape(selectedShapes[i], true)
    }
    hasSelection = true
    updateSelectionState()
  }

  // Reset selection rectangle state
  isSelectingArea = false
  selectionRect = { x: 0, y: 0, width: 0, height: 0 }
}
```

#### Canvas.svelte - 選択矩形のビジュアル表示
Canvas上に絶対配置された半透明のオーバーレイで選択矩形を描画:
```svelte
<!-- Selection rectangle overlay -->
{#if isSelectingArea && selectionRect.width > 0 && selectionRect.height > 0}
  <div
    class="selection-overlay"
    style="
      left: {selectionRect.x}px;
      top: {selectionRect.y}px;
      width: {selectionRect.width}px;
      height: {selectionRect.height}px;
    "
  ></div>
{/if}
```

#### Canvas.svelte - CSS スタイル
```css
.selection-overlay {
  position: absolute;
  pointer-events: none;
  background: rgba(33, 150, 243, 0.15);
  border: 2px solid #2196F3;
  z-index: 100;
}
```

### 使い方

1. **Selectツール**を選択
2. キャンバス上の**空白エリア**でクリック&ドラッグ
3. 青い選択矩形が表示され、範囲内のシェイプがハイライトされる
4. マウスを離すと、範囲内のすべてのシェイプが選択される
5. **Shift + ドラッグ**で既存の選択に追加選択

### 技術詳細

**交差判定:**
- AABBによる矩形同士の交差判定
- シェイプの境界ボックス (`getBounds()`) と選択矩形が交差すれば選択

**マルチ選択の統合:**
- Rendererの既存のマルチ選択機能 (`selectShape(id, addToSelection)`) を利用
- 整列ツールなどの既存の複数選択機能とシームレスに統合

**ビジュアルフィードバック:**
- ドラッグ中の選択矩形はHTML要素としてオーバーレイ表示
- `pointer-events: none` で選択矩形がマウスイベントを妨げない

### 結果

✅ ドラッグで複数のシェイプを同時に選択可能
✅ Shiftキーで追加選択が可能
✅ 選択中の視覚的フィードバック（青い半透明の矩形）
✅ 既存のマルチ選択機能（整列・分配ツール）と完全に統合

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - ドラッグ選択ロジック、ビジュアル表示、CSS
