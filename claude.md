# Grapher - 開発ログ

## 2025-11-25 - AI生成画像の構造崩れ問題の修正

### 問題
AI画像生成で複数のシェイプを含むSVGを適用すると、図形の構造が崩れたり変形したりする現象が発生。

### 根本原因の調査

**調査結果:**
1. **viewBox座標変換は完全に実装済み** ✅
   - `createViewBoxTransform()` がCanvas.svelteに実装されている
   - 負のオフセット補正、スケール変換、アスペクト比維持がすべて動作
   - すべてのシェイプタイプ（Rect, Circle, Ellipse, Path, Polygon）に適用済み

2. **Grouping時のデータ構造に深刻な不整合** ❌
   - 複数シェイプをGroup化する際、座標の二重変換が発生
   - Circle: `x,y` と `cx,cy` の二重管理による座標ズレ
   - Path: `x,y` と `points[]` の関係が破綻
   - Group: 子要素の相対座標化が不完全（`ctx.translate()` 未実装）

**具体的な問題:**
```typescript
// 1. parseSVGToShapes()で既にviewBox変換済み（800x600にスケール）
const shapes = parseSVGToShapes(svgCode)

// 2. Grouping時に座標を相対化（minX, minY を引く）
shape.props.x -= minX
shape.props.cx -= minX  // Circle
shape.props.points[i].x -= minX  // Path

// 3. ❌ 結果: 二重に変換されて座標がズレる
```

### 修正内容

#### Canvas.svelte:2085-2090 - handleAIGenerate() の簡素化

**修正前: Groupを作成して座標を相対化**
```typescript
if (shapes.length === 1) {
  renderer.addShape(shapes[0])
} else {
  // 複雑な座標変換処理...
  const group = new Group({ x: minX, y: minY, children: shapes })
  renderer.addShape(group)
}
```

**修正後: すべて個別に追加（Group化しない）**
```typescript
// Add all shapes individually (matching loadSVG behavior)
// This avoids coordinate transformation issues with grouping
const shapeIds: string[] = []
for (const shape of shapes) {
  renderer.addShape(shape)
  shapeIds.push(shape.props.id)
}

// Select the first shape if any were added
if (shapeIds.length > 0) {
  renderer.selectShape(shapeIds[0])
}
```

**変更点:**
- 単一/複数シェイプの分岐を削除
- Groupの作成処理を削除
- 座標の相対化処理を削除
- デバッグ用console.logを削除

### 結果

✅ **viewBox変換済みの座標をそのまま使用** - 二重変換を回避
✅ **各シェイプを個別に追加** - Grouping時の座標ズレを回避
✅ **ファイル読み込み（loadSVG）と同じ動作** - 一貫性が向上
✅ **シンプルで理解しやすいコード** - デバッグが容易

### 使い方

1. AI画像生成パネルを開く（🤖ボタン）
2. プロンプトを入力して生成
3. 「適用」をクリック
4. 生成された各図形が正しい位置・サイズで表示される
5. 各図形を個別に選択・編集可能
6. 必要に応じてShift+クリックで複数選択し、Cmd+Gでグループ化

### トレードオフ

**メリット:**
- ✅ 即座に問題解決
- ✅ 座標変換の複雑さを回避
- ✅ 既存機能への影響なし
- ✅ リスクが低い

**デメリット:**
- ❌ 複数シェイプを一度に移動できない（手動グループ化が必要）

### 今後の課題（オプション）

**長期的な修正（Proper Fix）:**
Group相対座標システムを正しく実装する場合：
1. Circle座標系の統一（`x,y`削除、`cx,cy`のみ）
2. Path座標系の明確化（`x,y`と`points`の関係定義）
3. Group.render()に`ctx.translate()`を追加
4. 包括的なテストスイート作成

### 技術詳細

**parseSVGToShapes()の動作:**
- SVG文字列を解析
- viewBox座標変換を適用（`createViewBoxTransform()`）
- 各シェイプを適切な座標・サイズでShape[]に変換
- 変換後の座標は800x600キャンバスベースの絶対座標

**座標系の設計思想:**
- すべてのシェイプは**キャンバス絶対座標**で管理
- Groupを使わない限り、座標変換の複雑さがない
- ユーザーが必要に応じてグループ化可能（Cmd+G）

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - handleAIGenerate()の簡素化、デバッグログ削除

---

## 2025-11-24 - ローカルLLM: モデル名の表示機能

### 実装内容
AI画像生成ダイアログで、ロード中のローカルLLMモデル名を表示する機能を追加。

### 修正内容

#### 1. electron/LlamaManager.ts - モデル名の保存
```typescript
private loadedModelName: string | null = null

public async loadModel(modelName?: string): Promise<void> {
  // ... モデル読み込み処理
  this.loadedModelName = path.basename(modelPath)
}

public async unloadModel(): Promise<void> {
  // ... アンロード処理
  this.loadedModelName = null
}

public getLoadedModelName(): string | null {
  return this.loadedModelName
}
```

#### 2. electron/main.ts - IPC handlerの追加
```typescript
ipcMain.handle('llama-get-loaded-model-name', async () => {
  try {
    const llamaManager = getLlamaManager()
    const modelName = llamaManager.getLoadedModelName()
    return { success: true, modelName }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
```

#### 3. electron/preload.ts - API公開
```typescript
llamaGetLoadedModelName: () => ipcRenderer.invoke('llama-get-loaded-model-name')
```

#### 4. src/lib/ai/LlamaAPI.ts - レンダラープロセスAPI
```typescript
export interface LlamaGetLoadedModelNameResponse extends LlamaResponse {
  modelName?: string | null
}

static async getLoadedModelName(): Promise<string | null> {
  const electron = this.getElectron()
  const result: LlamaGetLoadedModelNameResponse = await electron.llamaGetLoadedModelName()

  if (!result.success) {
    throw new Error(result.error || 'Failed to get loaded model name')
  }

  return result.modelName ?? null
}
```

#### 5. src/lib/AIPanel.svelte - UIへの表示
```typescript
let loadedModelName = $state<string | null>(null)

// Load available providers on mount
$effect(() => {
  async function loadProviders() {
    // ...
    // Load the currently loaded model name
    try {
      loadedModelName = await LlamaAPI.getLoadedModelName()
    } catch (err) {
      console.error('Failed to get loaded model name:', err)
      loadedModelName = null
    }
  }
  loadProviders()
})

// Provider selection dropdown
<select id="provider-select" bind:value={selectedProvider}>
  {#each availableProviders as provider}
    <option value={provider.provider}>
      {provider.provider === 'openai' ? 'OpenAI GPT-4o' :
       provider.provider === 'anthropic' ? 'Claude Sonnet 4.5' :
       loadedModelName ? `Local LLM (${loadedModelName})` : 'Local LLM (未ロード)'}
    </option>
  {/each}
</select>
```

### 結果

✅ **モデルロード前**: 「Local LLM (未ロード)」と表示
✅ **モデルロード後**: 「Local LLM (openai_gpt-oss-20b.gguf)」のように実際のモデル名を表示
✅ **モデルアンロード後**: 再び「Local LLM (未ロード)」と表示

### 使い方

1. 設定画面でモデルを読み込む
2. AI画像生成パネルを開く
3. LLMプロバイダーのドロップダウンでモデル名を確認

### 変更ファイル

- `/Users/oda/project/claude/grapher/electron/LlamaManager.ts` - loadedModelName管理
- `/Users/oda/project/claude/grapher/electron/main.ts` - IPC handler追加
- `/Users/oda/project/claude/grapher/electron/preload.ts` - API公開
- `/Users/oda/project/claude/grapher/src/lib/ai/LlamaAPI.ts` - getLoadedModelName()追加
- `/Users/oda/project/claude/grapher/src/lib/AIPanel.svelte` - モデル名表示

---

## 2025-11-24 - ローカルLLM: カスタムモデルディレクトリの設定機能

### 実装内容
ユーザーがローカルLLMモデルを保存するディレクトリを選択できる機能を追加。electron-storeで設定を永続化し、アプリ再起動後も復元される。

### 修正内容

#### 1. electron/LlamaManager.ts - カスタムディレクトリのサポート
```typescript
private customModelsDir: string | null = null

private getModelsDir(): string {
  // Use custom directory if set, otherwise use default
  if (this.customModelsDir && fs.existsSync(this.customModelsDir)) {
    return this.customModelsDir
  }

  const userDataPath = app.getPath('userData')
  const modelsDir = path.join(userDataPath, 'models')
  // ...
}

public setModelsDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`)
  }
  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`)
  }
  this.customModelsDir = dirPath
}
```

#### 2. electron/main.ts - 設定の復元とIPC handlers
```typescript
function initializeLlamaManager() {
  const customDir = store.get('llamaModelsDirectory') as string | undefined
  if (customDir) {
    try {
      const llamaManager = getLlamaManager()
      llamaManager.setModelsDirectory(customDir)
      console.log('Restored custom models directory:', customDir)
    } catch (error) {
      console.warn('Failed to restore custom models directory:', error)
      store.delete('llamaModelsDirectory')
    }
  }
}

app.whenReady().then(() => {
  initializeAPIKeys()
  initializeLlamaManager() // ← 追加
  createMenu()
  createWindow()
})

// Directory selection with dialog
ipcMain.handle('llama-select-models-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Models Directory',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, path: result.filePaths[0] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Set custom directory and persist
ipcMain.handle('llama-set-models-dir', async (_event, dirPath: string) => {
  try {
    const llamaManager = getLlamaManager()
    llamaManager.setModelsDirectory(dirPath)
    store.set('llamaModelsDirectory', dirPath) // ← 永続化
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
```

#### 3. electron/preload.ts - API公開
```typescript
llamaSelectModelsDir: () => ipcRenderer.invoke('llama-select-models-dir'),
llamaSetModelsDir: (dirPath: string) => ipcRenderer.invoke('llama-set-models-dir', dirPath)
```

#### 4. src/lib/ai/LlamaAPI.ts - レンダラープロセスAPI
```typescript
static async selectModelsDirectory(): Promise<string | null> {
  const electron = this.getElectron()
  const result = await electron.llamaSelectModelsDir()
  if (!result.success || result.canceled) {
    return null
  }
  return result.path || null
}

static async setModelsDirectory(dirPath: string): Promise<void> {
  const electron = this.getElectron()
  const result: LlamaResponse = await electron.llamaSetModelsDir(dirPath)
  if (!result.success) {
    throw new Error(result.error || 'Failed to set models directory')
  }
}
```

#### 5. src/lib/SettingsPanel.svelte - UIの追加
```svelte
<!-- Models Directory -->
<div class="input-group">
  <label for="models-directory">
    <span class="label-text">モデルディレクトリ</span>
  </label>
  <div class="directory-controls">
    <div class="path-display-box">{modelsDirectory || '読み込み中...'}</div>
    <button
      class="browse-button"
      onclick={handleBrowseModelsDir}
      disabled={isLoadingModel}
      title="ディレクトリを選択"
    >
      📁 参照
    </button>
  </div>
  <p class="hint">GGUFモデルファイルを配置するディレクトリ。変更後はモデル一覧を更新してください。</p>
</div>
```

```typescript
async function handleBrowseModelsDir() {
  try {
    const selectedPath = await LlamaAPI.selectModelsDirectory()
    if (selectedPath) {
      await LlamaAPI.setModelsDirectory(selectedPath)
      modelsDirectory = selectedPath

      // Refresh the models list
      await handleRefreshModels()

      successMessage = 'モデルディレクトリを変更しました'
      setTimeout(() => { successMessage = null }, 3000)
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message
    } else {
      error = 'ディレクトリの設定に失敗しました'
    }
  }
}
```

**CSSスタイル:**
```css
.directory-controls {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.path-display-box {
  flex: 1;
  padding: 10px 12px;
  background: #1e1e1e;
  color: #aaa;
  border: 1px solid #555;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  overflow-x: auto;
  white-space: nowrap;
}

.browse-button {
  padding: 10px 16px;
  background: #555;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.browse-button:hover:not(:disabled) {
  background: #666;
  transform: translateY(-1px);
}
```

### 結果

✅ **ディレクトリ選択**: Finderでディレクトリを選択可能
✅ **永続化**: electron-storeに保存され、アプリ再起動後も復元
✅ **自動更新**: ディレクトリ変更後にモデル一覧を自動更新
✅ **バリデーション**: 存在しないディレクトリやファイルを指定した場合はエラー

### 使い方

1. 設定画面を開く（⚙️ボタン）
2. 「ローカルLLM設定」セクションまでスクロール
3. 「モデルディレクトリ」の横に現在のパスが表示される
4. 「📁 参照」ボタンをクリック
5. Finderでディレクトリを選択
6. 自動的にモデル一覧が更新される

### 変更ファイル

- `/Users/oda/project/claude/grapher/electron/LlamaManager.ts` - カスタムディレクトリのサポート
- `/Users/oda/project/claude/grapher/electron/main.ts` - 設定の復元とIPC handlers
- `/Users/oda/project/claude/grapher/electron/preload.ts` - API公開
- `/Users/oda/project/claude/grapher/src/lib/ai/LlamaAPI.ts` - selectModelsDirectory(), setModelsDirectory()
- `/Users/oda/project/claude/grapher/src/lib/SettingsPanel.svelte` - UIとイベントハンドラー

---

## 2025-11-24 - ローカルLLM統合の実装計画

### 目的
- **コスト削減**: OpenAI/Claude APIの使用料を削減
- **実験機能**: ローカル環境でのLLM実験を可能に

### アーキテクチャ決定

**選択した方式: llamaApp方式（node-llama-cpp完全ローカル実行）**

**理由:**
- モデル選択の自由度が高い（任意のGGUFモデルを使用可能）
- 完全オフライン動作が可能
- ElectronアプリでのネイティブモジュールビルドのノウハウがllamaAppで確立済み
- モデルダウンロード機能により初回セットアップが容易

**スコープ:**
- AI画像生成機能のみローカルLLM対応
- 既存のOpenAI/Claude APIオプションは維持
- ユーザーがプロバイダーを選択可能（OpenAI/Claude/Local LLM）

### 実装ステップ

#### 1. node-llama-cppのインストールとビルド設定
```json
// package.json
{
  "dependencies": {
    "node-llama-cpp": "^3.x.x"
  },
  "scripts": {
    "rebuild": "electron-rebuild -f -w node-llama-cpp"
  },
  "build": {
    "asarUnpack": [
      "node_modules/node-llama-cpp/**/*"
    ]
  }
}
```

#### 2. LlamaManagerクラスの実装（Main Process）
`electron/LlamaManager.ts`を作成:
- モデルの読み込み・管理
- 推論リクエストの処理
- モデルダウンロード機能
- GPUアクセラレーション設定

#### 3. LlamaAPI.tsの実装（Renderer Process）
`src/lib/ai/LlamaAPI.ts`を作成:
- LlamaManagerへのIPCブリッジ
- SVG生成プロンプト処理
- エラーハンドリング

#### 4. AIPanelでの統合
`src/lib/AIPanel.svelte`:
- LLMプロバイダー選択UI追加
- Local LLMオプション実装
- モデル未ロード時のエラーハンドリング

#### 5. 設定画面の追加
`src/lib/SettingsPanel.svelte`:
- モデル選択
- モデルのロード/アンロード
- GPUレイヤー設定
- コンテキストサイズ設定

### 技術的詳細

**node-llama-cpp v3 API:**
```typescript
import { getLlama, LlamaChatSession } from 'node-llama-cpp'

// Initialize
const llama = await getLlama()

// Load model
const model = await llama.loadModel({
  modelPath: '/path/to/model.gguf',
  gpuLayers: 0 // CPU only
})

// Create context
const context = await model.createContext({
  contextSize: 4096
})

// Create chat session
const session = new LlamaChatSession({
  contextSequence: context.getSequence()
})

// Generate
const response = await session.prompt(prompt)
```

**SVG生成プロンプト:**
```typescript
const systemPrompt = `You are an SVG graphics expert. Generate valid SVG code based on user descriptions.

IMPORTANT RULES:
1. Output ONLY valid SVG code wrapped in <svg> tags
2. Include viewBox="0 0 800 600" attribute
3. Use semantic shapes: <rect>, <circle>, <ellipse>, <path>, <line>, <polygon>
4. Add colors using fill and stroke attributes
5. Keep coordinates positive (0 or greater)
6. Do NOT include any explanatory text outside the <svg> tags
7. Do NOT use markdown code blocks

Example output format:
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <circle cx="400" cy="300" r="100" fill="#FF6B6B" />
  <rect x="200" y="150" width="400" height="300" fill="none" stroke="#4ECDC4" stroke-width="2" />
</svg>`

const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}\n\nSVG code:`
```

### ビルド設定の修正

**問題: node-llama-cppのネイティブモジュールがasar内で動作しない**

**解決策:**
```json
// package.json
{
  "build": {
    "asar": false // ← asarを無効化
  }
}
```

これにより、ファイルが `app.asar` ではなく `app/` ディレクトリに展開され、ES modulesが正常にロードされる。

### トラブルシューティング

**v2 → v3 API移行:**
- v2: `new LlamaModel()`, `new LlamaContext()`, `new LlamaChatSession({ context })`
- v3: `await getLlama()`, `llama.loadModel()`, `model.createContext()`, `new LlamaChatSession({ contextSequence: context.getSequence() })`

**エラー: "_llama is undefined"**
- 原因: v2 APIを使用していた
- 解決: v3 APIに移行（`getLlama()` を先に呼ぶ）

### 実装完了

✅ node-llama-cppのインストールとビルド設定
✅ LlamaManagerクラスの実装（main process）
✅ LlamaAPI.tsの実装（renderer process）
✅ AIPanelでLlamaを選択可能に
✅ 設定画面にローカルLLM設定を追加
✅ ビルドエラーの解決（Vite + electron-builder）
✅ node-llama-cpp v3 APIに対応（getLlama使用）
✅ カスタムモデルディレクトリの設定機能
✅ ロード中のモデル名を表示

### 変更ファイル

- `/Users/oda/project/claude/grapher/package.json` - node-llama-cpp依存関係、asar無効化
- `/Users/oda/project/claude/grapher/electron/LlamaManager.ts` - NEW
- `/Users/oda/project/claude/grapher/electron/main.ts` - IPC handlers追加
- `/Users/oda/project/claude/grapher/electron/preload.ts` - Llama API公開
- `/Users/oda/project/claude/grapher/src/lib/ai/LlamaAPI.ts` - NEW
- `/Users/oda/project/claude/grapher/src/lib/AIPanel.svelte` - LLMプロバイダー選択
- `/Users/oda/project/claude/grapher/src/lib/SettingsPanel.svelte` - ローカルLLM設定UI

---

## 2025-11-22 - AI生成SVGのviewBox座標変換の実装

### 問題
「猫を描いて」等のプロンプトでAI生成した図形を適用すると、以下の問題が発生：
- 位置を移動させると図形が消える
- 座標にマイナス値が含まれる（画面外にハンドルがある）
- サイズが異常
- 一部の図形のみ表示される

### 原因

**viewBox座標系の変換が欠落**

AI生成のSVGは、独自の座標系（viewBox）を定義している：
- `viewBox="0 0 500 500"` - 標準的な正の座標
- `viewBox="-100 -100 400 400"` - **負のオフセット**（AI生成でよくある）
- `viewBox="0 0 24 24"` - アイコンサイズの座標（スケールアップが必要）

以前の実装では、viewBox属性を無視してSVG要素の生座標をそのまま使用していたため、負の座標やスケールの不一致が発生していた。

### 修正内容

#### 1. Canvas.svelte - createViewBoxTransform()関数の追加

viewBox座標系からキャンバスピクセル座標への変換関数を作成：

```typescript
function createViewBoxTransform(svg: Element) {
  const viewBoxAttr = svg.getAttribute('viewBox')
  if (!viewBoxAttr) {
    // viewBoxがない場合は恒等変換
    return {
      transformX: (x: number) => x,
      transformY: (y: number) => y,
      transformLength: (length: number) => length
    }
  }

  const viewBox = viewBoxAttr.split(/\s+/).map(parseFloat)
  if (viewBox.length !== 4) {
    return {
      transformX: (x: number) => x,
      transformY: (y: number) => y,
      transformLength: (length: number) => length
    }
  }

  const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBox

  // viewBoxを適切なキャンバスサイズにマッピング
  const targetWidth = 800
  const targetHeight = 600

  const scaleX = targetWidth / vbWidth
  const scaleY = targetHeight / vbHeight
  const scale = Math.min(scaleX, scaleY) // アスペクト比を維持

  const offsetX = -vbMinX
  const offsetY = -vbMinY

  return {
    transformX: (x: number) => (x + offsetX) * scale,
    transformY: (y: number) => (y + offsetY) * scale,
    transformLength: (length: number) => length * scale
  }
}
```

**変換の仕組み:**
1. **オフセット**: viewBoxの最小座標（vbMinX, vbMinY）を補正
2. **スケール**: viewBoxのサイズをターゲットサイズ（800x600）にマッピング
3. **アスペクト比**: 縦横比を維持するため、小さい方のスケールを使用

#### 2. Canvas.svelte - transformPathPoints()とreconstructPathData()の追加

パス座標の変換と再構築のためのヘルパー関数：

```typescript
function transformPathPoints(
  points: PathPoint[],
  transformX: (x: number) => number,
  transformY: (y: number) => number
): PathPoint[] {
  return points.map(point => {
    const transformed: PathPoint = {
      x: transformX(point.x),
      y: transformY(point.y),
      type: point.type
    }

    // ベジェ曲線の制御点も変換
    if (point.cp1x !== undefined) transformed.cp1x = transformX(point.cp1x)
    if (point.cp1y !== undefined) transformed.cp1y = transformY(point.cp1y)
    if (point.cp2x !== undefined) transformed.cp2x = transformX(point.cp2x)
    if (point.cp2y !== undefined) transformed.cp2y = transformY(point.cp2y)
    if (point.cpx !== undefined) transformed.cpx = transformX(point.cpx)
    if (point.cpy !== undefined) transformed.cpy = transformY(point.cpy)

    if (point.pointType) transformed.pointType = point.pointType

    return transformed
  })
}

function reconstructPathData(points: PathPoint[], closed: boolean): string {
  let d = ''

  for (const point of points) {
    if (point.type === 'M') {
      d += `M ${point.x} ${point.y} `
    } else if (point.type === 'L') {
      d += `L ${point.x} ${point.y} `
    } else if (point.type === 'C' && point.cp1x !== undefined && point.cp1y !== undefined && point.cp2x !== undefined && point.cp2y !== undefined) {
      d += `C ${point.cp1x} ${point.cp1y} ${point.cp2x} ${point.cp2y} ${point.x} ${point.y} `
    } else if (point.type === 'Q' && point.cpx !== undefined && point.cpy !== undefined) {
      d += `Q ${point.cpx} ${point.cpy} ${point.x} ${point.y} `
    }
  }

  if (closed) {
    d += 'Z'
  }

  return d.trim()
}
```

#### 3. Canvas.svelte - parseSVGToShapes()の全シェイプタイプへの適用

**Rect:**
```typescript
svg.querySelectorAll('rect').forEach((rect) => {
  const x = transformX(parseFloat(rect.getAttribute('x') || '0'))
  const y = transformY(parseFloat(rect.getAttribute('y') || '0'))
  const width = transformLength(parseFloat(rect.getAttribute('width') || '0'))
  const height = transformLength(parseFloat(rect.getAttribute('height') || '0'))
  // ...
})
```

**Circle:**
```typescript
svg.querySelectorAll('circle').forEach((circle) => {
  const cx = transformX(parseFloat(circle.getAttribute('cx') || '0'))
  const cy = transformY(parseFloat(circle.getAttribute('cy') || '0'))
  const r = transformLength(parseFloat(circle.getAttribute('r') || '0'))
  // ...
})
```

**Ellipse:**
```typescript
svg.querySelectorAll('ellipse').forEach((ellipse) => {
  const cx = transformX(parseFloat(ellipse.getAttribute('cx') || '0'))
  const cy = transformY(parseFloat(ellipse.getAttribute('cy') || '0'))
  const rx = transformLength(parseFloat(ellipse.getAttribute('rx') || '0'))
  const ry = transformLength(parseFloat(ellipse.getAttribute('ry') || '0'))
  // ... (その後パスデータに変換)
})
```

**Path:**
```typescript
svg.querySelectorAll('path').forEach((path) => {
  const d = path.getAttribute('d') || ''
  const parsedPoints = parsePathData(d)
  const closed = d.trim().toUpperCase().endsWith('Z')

  // パスポイントを変換
  const points = transformPathPoints(parsedPoints, transformX, transformY)
  const transformedD = reconstructPathData(points, closed)
  const bounds = calculatePathBounds(points)

  shapes.push(new Path({ id: generateId('path'), x: bounds.x, y: bounds.y, d: transformedD, points, closed, stroke, strokeWidth, fill, rotation }))
})
```

**Polygon:**
```typescript
svg.querySelectorAll('polygon').forEach((polygon) => {
  const pointsAttr = polygon.getAttribute('points') || ''
  const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)

  // ポリゴン座標を変換
  let d = `M ${transformX(coords[0])} ${transformY(coords[1])}`
  for (let i = 2; i < coords.length; i += 2) {
    d += ` L ${transformX(coords[i])} ${transformY(coords[i + 1])}`
  }
  d += ' Z'
  // ...
})
```

### 結果

✅ **負の座標が正しく補正される** - viewBoxの負のオフセットが適切に処理される
✅ **スケールが統一される** - 24x24のアイコンサイズも800x600にスケールアップ
✅ **アスペクト比が維持される** - 縦横比を保ったままスケール変換
✅ **すべてのシェイプタイプで動作** - Rect, Circle, Ellipse, Path, Polygon
✅ **制御点も変換される** - ベジェ曲線の制御点も正しく変換
✅ **図形が正しく表示される** - 移動・リサイズ・編集が正常に動作

### 使い方

1. **AI画像生成パネル**を開く（🤖ボタン）
2. プロンプトを入力（例: 「猫を描いて」「家を描いて」）
3. 生成ボタンをクリック
4. プレビューで確認
5. **適用**または**コピー**
6. 図形が正しい位置・サイズで表示される
7. 移動・リサイズ・編集が正常に動作

### 技術詳細

**viewBox変換の計算:**
- **入力**: viewBox座標 `(x, y)`
- **オフセット補正**: `x + offsetX`, `y + offsetY`
- **スケール適用**: `(x + offsetX) * scale`, `(y + offsetY) * scale`
- **出力**: キャンバスピクセル座標

**例:**
- viewBox="**-100 -100** 400 400" の座標 (0, 0)
- オフセット補正: (0 + 100, 0 + 100) = (100, 100)
- スケール (800/400 = 2.0): (100 * 2.0, 100 * 2.0) = **(200, 200)**
- キャンバス上で (200, 200) に表示

**Path変換のフロー:**
1. SVG pathデータを解析 → PathPoint[]
2. 各ポイントの座標を変換（アンカーポイント + 制御点）
3. 変換されたポイント配列からpathデータ文字列を再構築
4. 境界ボックスを計算して初期位置を設定

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte`
  - createViewBoxTransform() - viewBox座標変換関数
  - transformPathPoints() - パスポイント変換ヘルパー
  - reconstructPathData() - パスデータ再構築ヘルパー
  - parseSVGToShapes() - 全シェイプタイプへの変換適用
