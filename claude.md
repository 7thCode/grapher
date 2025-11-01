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
