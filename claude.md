# Grapher - 開発ログ
# Grapher - 開発ログ

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

---

## 2025-11-22 - AI生成図形の座標系問題の根本修正

### 問題
AI画像生成で図形を生成・適用後、以下のすべての問題が発生：
1. 図形が表示されない
2. 図形をドラッグすると位置がずれる
3. リサイズすると形が崩れる
4. 制御点の位置がおかしい

これは単なるGroupingの問題ではなく、**座標系の二重管理による根本的な構造問題**だった。

### 原因

#### 1. Circleの座標系の二重管理
**Circle.props** は2つの座標系を持つ：
- `x, y` (ShapePropsから継承、左上角の位置)
- `cx, cy, r` (CircleProps、中心座標と半径)

**問題点:**
- **生成時**: `parseSVGToShapes()` で `x: cx - r, y: cy - r` を設定
- **移動時**: `Renderer.moveShape()` で `cx, cy` のみ更新
- **結果**: `x, y` が古い値のまま残る → TransformControlsやbounds計算が狂う

#### 2. Pathの座標系の問題
**Path.props** の座標管理：
- `x, y` (Path全体のオフセット)
- `points[]` (パスデータの実際の座標)

**問題点:**
- **生成時**: `parseSVGToShapes()` で常に `x: 0, y: 0` を設定
- **pathデータ**: 絶対座標を含む（例: `M 100 100 L 200 200`）
- **結果**: 初期位置が(0,0)なので、移動やリサイズ時に座標計算が狂う

### 修正内容

#### 1. Circleの座標同期（複数ファイル）

**Renderer.ts:84-89** - Circle移動時にx, yも更新
```typescript
// 修正前
} else if (shape instanceof Circle) {
  shape.props.cx += dx
  shape.props.cy += dy
}

// 修正後
} else if (shape instanceof Circle) {
  shape.props.cx += dx
  shape.props.cy += dy
  shape.props.x += dx  // ← 追加
  shape.props.y += dy  // ← 追加
}
```

**Command.ts:99-104, 159-164** - Undo/Redo時も同期
```typescript
// executeメソッド
} else if (this.shape instanceof Circle) {
  this.shape.props.cx += dx
  this.shape.props.cy += dy
  this.shape.props.x += dx  // ← 追加
  this.shape.props.y += dy  // ← 追加
}

// undoメソッド（境界ボックスから復元）
} else if (this.shape instanceof Circle) {
  this.shape.props.cx = bounds.x + bounds.width / 2
  this.shape.props.cy = bounds.y + bounds.height / 2
  this.shape.props.x = bounds.x        // ← 追加
  this.shape.props.y = bounds.y        // ← 追加
  this.shape.props.radius = bounds.width / 2
}
```

**AlignManager.ts:173-179** - 整列時も同期
```typescript
// 修正前
} else if (shape instanceof Circle) {
  if (x !== null) shape.props.cx += dx
  if (y !== null) shape.props.cy += dy
}

// 修正後
} else if (shape instanceof Circle) {
  if (x !== null) {
    shape.props.cx += dx
    shape.props.x += dx  // ← 追加
  }
  if (y !== null) {
    shape.props.cy += dy
    shape.props.y += dy  // ← 追加
  }
}
```

**TransformControls.ts:203-217** - リサイズ時も同期
```typescript
// 修正前
private resizeCircle(handleType: HandleType, dx: number, dy: number) {
  const circle = this.shape as Circle
  const { cx, cy, r } = circle.props
  
  const delta = Math.sqrt(dx * dx + dy * dy)
  const direction = handleType.includes('e') || handleType.includes('s') ? 1 : -1
  
  circle.props.r = Math.max(5, r + delta * direction * 0.5)
}

// 修正後
private resizeCircle(handleType: HandleType, dx: number, dy: number) {
  const circle = this.shape as Circle
  const { cx, cy, r } = circle.props
  
  const delta = Math.sqrt(dx * dx + dy * dy)
  const direction = handleType.includes('e') || handleType.includes('s') ? 1 : -1
  
  const newR = Math.max(5, r + delta * direction * 0.5)
  circle.props.r = newR
  // ← x, yを同期
  circle.props.x = cx - newR
  circle.props.y = cy - newR
}
```

**TransformControls.ts:560-571** - Groupリサイズ時も同期
```typescript
} else if (child instanceof Circle) {
  const relX = child.props.cx - originX
  const relY = child.props.cy - originY
  child.props.cx = originX + relX * scaleX
  child.props.cy = originY + relY * scaleY
  const newR = child.props.r * Math.min(scaleX, scaleY)
  child.props.r = newR
  // ← x, yを同期
  child.props.x = child.props.cx - newR
  child.props.y = child.props.cy - newR
}
```

#### 2. Pathの初期座標を正しく計算

**Canvas.svelte** - calculatePathBounds()ヘルパー関数を追加
```typescript
function calculatePathBounds(points: PathPoint[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)

    // 制御点も含めて計算
    if (point.cp1x !== undefined) {
      minX = Math.min(minX, point.cp1x)
      maxX = Math.max(maxX, point.cp1x)
    }
    // ... cp1y, cp2x, cp2y, cpx, cpy も同様
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}
```

**Canvas.svelte:1645-1673** - parseSVGToShapes()でPathの正しいx, yを設定
```typescript
// 修正前（Path, Ellipse, Polygon共通）
const points = parsePathData(d)
shapes.push(new Path({ 
  id: generateId('path'), 
  x: 0, y: 0,  // ❌ 常に(0,0)
  d, points, closed, stroke, strokeWidth, fill, rotation 
}))

// 修正後
const points = parsePathData(d)
const bounds = calculatePathBounds(points)  // ← 境界ボックス計算
shapes.push(new Path({ 
  id: generateId('path'), 
  x: bounds.x, y: bounds.y,  // ✅ 正しい位置
  d, points, closed, stroke, strokeWidth, fill, rotation 
}))
```

### 結果

✅ **AI生成された図形が正しく表示される**
✅ **ドラッグ時に位置がずれない**
✅ **リサイズ時に形が崩れない**
✅ **パス編集時の制御点位置が正しい**
✅ **整列・分配・グループ操作が正常に動作する**
✅ **Undo/Redoが正しく動作する**

### 技術詳細

**座標系の一貫性:**
- すべてのシェイプ操作で、すべての座標プロパティを同期して更新
- Circleの場合: `cx, cy` を更新したら必ず `x = cx - r, y = cy - r` も更新
- Pathの場合: 生成時にpathデータから境界ボックスを計算して正しい `x, y` を設定

**影響範囲:**
- Shape移動: Renderer.ts, Command.ts, AlignManager.ts
- Shapeリサイズ: TransformControls.ts
- Groupリサイズ: TransformControls.ts (子要素の再帰的処理)
- Shape生成: Canvas.svelte (parseSVGToShapes)

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - calculatePathBounds()追加、parseSVGToShapes()修正
- `/Users/oda/project/claude/grapher/src/lib/engine/Renderer.ts` - Circle移動時にx, y同期
- `/Users/oda/project/claude/grapher/src/lib/engine/Command.ts` - Undo/Redo時にx, y同期
- `/Users/oda/project/claude/grapher/src/lib/engine/AlignManager.ts` - 整列時にx, y同期
- `/Users/oda/project/claude/grapher/src/lib/engine/TransformControls.ts` - リサイズ時にx, y同期

---

## 2025-11-22 - AI生成図形の構造問題の修正（Grouping問題）

### 問題
AI画像生成機能で図形を生成すると、すべての図形が1つのGroupとしてまとめられてしまい、個別に選択・編集ができない。ユーザーから「生成される図形の構造がおかしい」との報告。

### 原因

**Canvas.svelte - handleAIGenerate()とloadSVG()の動作の不一致**

1. **handleAIGenerate()** (AI生成時):
   - `parseSVGToShapes()` で図形配列を取得
   - すべての図形を **Group** にまとめる
   - Groupをrendererに追加
   - 結果: すべての図形が1つのGroupとして扱われる

2. **loadSVG()** (ファイル読み込み時):
   - SVGを解析して図形を作成
   - 各図形を **個別に** rendererに追加
   - 結果: 各図形を個別に選択・編集可能

この不一致により、AI生成時のみ図形が1つのGroupにまとまってしまい、個別編集ができなかった。

### 修正内容

#### Canvas.svelte:1677-1713 - handleAIGenerate()の修正

**修正前: すべての図形をGroupにまとめる**
```typescript
// Group all AI-generated shapes together
const groupId = `ai-group-${Date.now()}`
const group = new Group({
  id: groupId,
  x: 0,
  y: 0,
  children: shapes
})

renderer.addShape(group)
renderer.selectShape(groupId)
```

**修正後: 各図形を個別に追加**
```typescript
// Add all shapes individually (matching loadSVG behavior)
const shapeIds: string[] = []
for (const shape of shapes) {
  renderer.addShape(shape)
  shapeIds.push(shape.props.id)
}

// Select the first shape if any were added
if (shapeIds.length > 0) {
  renderer.selectShape(shapeIds[0])
}
hasSelection = true
updateSelectionState()
```

### 結果

✅ **AI生成された図形を個別に選択できるようになった**
✅ **AI生成とファイル読み込みの動作が一貫した**
✅ **各図形を個別に移動・編集・削除できる**
✅ **必要に応じて複数の図形を選択してグループ化できる**

### 使い方

1. AI画像生成パネルを開く（🤖ボタン）
2. プロンプトを入力して生成
3. 「適用」をクリック
4. 生成された各図形を個別に選択・編集可能
5. 必要に応じてShift+クリックで複数選択し、Cmd+Gでグループ化

### 技術詳細

**handleAICopy()は変更なし:**
- コピー機能では、複数の図形をまとめてクリップボードにコピーするため、Groupを使用するのは適切
- ペースト時に一度に複数の図形を配置できる

**一貫性の重要性:**
- AI生成とファイル読み込みで同じ動作にすることで、ユーザーの混乱を防ぐ
- すべての図形が同じ方法で管理される

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - handleAIGenerate()関数の修正

---

## 2025-11-09 - ポイントタイプ切り替え機能の修正

### 問題
ポイントタイプ切り替えボタン（スムーズ/対称/コーナー）を押しても、制御点の位置が変わらない。

### 原因

**PathEditManager.ts:561-651 - setPointType()メソッドの不完全な実装**

1. **IN-handleとOUT-handleの両方が必要**
   ```typescript
   if (!inHandle && !outHandle) return  // 早期リターン
   
   if (pointType === 'smooth') {
     if (outHandle && inHandle && nextPoint) {  // 両方が必要
       // 処理
     }
   }
   ```
   - 片方の制御点しかない場合（パスの最初/最後のポイント）は何も起きない

2. **制御点の長さが0の場合の処理がない**
   - 新しく作成したベジェ曲線など、制御点が存在しても長さが0の場合は処理されない

3. **参照方向の決定ロジックが不足**
   - symmetricalモードでOUT-handleがない場合の処理がない

### 修正内容

#### PathEditManager.ts:561-651 - setPointType()の完全書き直し

**1. cornerタイプの早期リターン**
```typescript
// For 'corner', just set the type and return (no adjustment needed)
if (pointType === 'corner') {
  this.updatePathData()
  this.updateHandles()
  return
}
```

**2. 制御点ベクトルと長さの計算**
```typescript
let cp1VecX = 0, cp1VecY = 0, cp1Length = 0
let cp2VecX = 0, cp2VecY = 0, cp2Length = 0

if (hasOutHandle && nextPoint) {
  cp1VecX = nextPoint.cp1x! - point.x
  cp1VecY = nextPoint.cp1y! - point.y
  cp1Length = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)
}

if (hasInHandle) {
  cp2VecX = point.cp2x! - point.x
  cp2VecY = point.cp2y! - point.y
  cp2Length = Math.sqrt(cp2VecX * cp2VecX + cp2VecY * cp2VecY)
}

const defaultLength = 50  // デフォルト長さ
```

**3. symmetrical（対称）モードの実装**
```typescript
if (pointType === 'symmetrical') {
  // 平均長さを計算（両方が0ならdefaultLengthを使用）
  let avgLength = (cp1Length + cp2Length) / 2
  if (avgLength === 0) avgLength = defaultLength

  // 参照方向を決定（優先順位: OUT-handle → IN-handle → デフォルト）
  let refVecX = 0, refVecY = 0, refLength = 0

  if (cp1Length > 0) {
    refVecX = cp1VecX
    refVecY = cp1VecY
    refLength = cp1Length
  } else if (cp2Length > 0) {
    refVecX = -cp2VecX  // 逆方向
    refVecY = -cp2VecY
    refLength = cp2Length
  } else if (hasOutHandle && nextPoint) {
    refVecX = 1  // 水平方向
    refVecY = 0
    refLength = 1
  } else if (hasInHandle) {
    refVecX = -1
    refVecY = 0
    refLength = 1
  }

  // 両方の制御点を同じ長さ、反対方向に配置
  if (refLength > 0) {
    const normX = refVecX / refLength
    const normY = refVecY / refLength

    if (hasOutHandle && nextPoint) {
      nextPoint.cp1x = point.x + normX * avgLength
      nextPoint.cp1y = point.y + normY * avgLength
    }

    if (hasInHandle) {
      point.cp2x = point.x - normX * avgLength
      point.cp2y = point.y - normY * avgLength
    }
  }
}
```

**4. smooth（スムーズ）モードの実装**
```typescript
else if (pointType === 'smooth') {
  // 参照方向を決定（symmetricalと同じロジック）
  let refVecX = 0, refVecY = 0, refLength = 0
  // ... （省略）

  // 両方の制御点を一直線上に配置、個別の長さを保持
  if (refLength > 0) {
    const normX = refVecX / refLength
    const normY = refVecY / refLength

    if (hasOutHandle && nextPoint) {
      const outLength = cp1Length > 0 ? cp1Length : defaultLength
      nextPoint.cp1x = point.x + normX * outLength
      nextPoint.cp1y = point.y + normY * outLength
    }

    if (hasInHandle) {
      const inLength = cp2Length > 0 ? cp2Length : defaultLength
      point.cp2x = point.x - normX * inLength
      point.cp2y = point.y - normY * inLength
    }
  }
}
```

### 結果

✅ **片方の制御点のみでも動作** - パスの最初/最後のポイントでも正常に動作
✅ **制御点の長さが0でも動作** - デフォルト長さ（50px）が適用される
✅ **参照方向の自動決定** - OUT-handle → IN-handle → デフォルト方向の優先順位
✅ **symmetricalモード** - 両方の制御点を平均長さ、反対方向に配置
✅ **smoothモード** - 両方の制御点を一直線上、個別の長さを保持
✅ **cornerモード** - 制御点を調整せず、独立して動作

### 使い方

1. Pathツールで曲線を描画
2. Selectツールでダブルクリック → 編集モード
3. アンカーポイントを選択
4. ツールバーのボタン（**〜**/⚖️/⌐）またはキーボード（1/2/3）で切り替え
5. 制御点の位置が即座に変わる

### 技術詳細

**参照方向の優先順位:**
1. OUT-handleの方向（cp1Length > 0）
2. IN-handleの逆方向（cp2Length > 0）
3. 水平方向のデフォルト（どちらも0の場合）

**デフォルト長さ:**
- `defaultLength = 50` - 制御点の長さが0の場合に使用

**symmetrical vs smooth:**
- **symmetrical**: 両方の制御点が同じ長さ、反対方向
- **smooth**: 両方の制御点が一直線上、個別の長さを保持

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - setPointType()の完全書き直し

---

## 2025-11-09 - Load前のキャンバス完全初期化

### 問題
ファイルをLoadする前に、キャンバスの状態を完全に初期化する必要がある。以前の実装では、シェイプを削除するだけで、編集モードや選択状態がリセットされていなかった。

### 原因

**問題1: clearCanvas()の不完全な初期化**
`clearCanvas()`関数が以下の処理のみを行っていた：
- シェイプの削除

しかし、以下の状態がリセットされていなかった：
- パス編集モード (`isEditingPath`, `editingPath`, `selectedPathPointIndex`)
- テキスト編集モード (`isEditingText`, `editingTextBox`, `textEditorDiv`)
- 選択状態 (`hasSelection`, Rendererの選択)
- クリップボード (`clipboardShape`)
- ファイルパス (`currentFilePath`)
- ダーティフラグ (`isDirty`)

**問題2: loadSVG()でのダーティフラグ管理**
`loadSVG()`内で`renderer.addShape()`を呼ぶ度に`onChangeCallback`が発火し、`setDirty(true)`が呼ばれていた。そのため、Load完了後も`isDirty`が`true`のままになっていた。

### 修正内容

#### 1. Canvas.svelte:1276-1310 - clearCanvas()関数の拡張

```typescript
function clearCanvas() {
  if (!renderer) return

  // Stop path editing mode if active
  if (isEditingPath) {
    stopPathEditing()
  }

  // Stop text editing mode if active
  if (isEditingText && textEditorDiv) {
    textEditorDiv.remove()
    textEditorDiv = null
    editingTextBox = null
    isEditingText = false
  }

  // Clear selection
  renderer.selectShape(null)
  hasSelection = false

  // Remove all shapes
  const shapes = renderer.getShapes()
  shapes.forEach((s) => renderer.removeShape(s.props.id))

  // Reset other state variables
  selectedPathPointIndex = null
  clipboardShape = null
  currentFilePath = null  // ← 追加: ファイルパスをリセット

  // Reset dirty flag
  setDirty(false)

  // Render to update display
  renderer.render()
}
```

#### 2. Canvas.svelte:1677-1678 - loadSVG()の最後でダーティフラグをリセット

```typescript
function loadSVG(svgString: string) {
  // ... シェイプの読み込み処理

  // Force re-render after loading all shapes
  renderer.render()

  // Reset dirty flag after loading (shapes were added via addShape which triggers onChange)
  setDirty(false)  // ← 追加
}
```

これにより、Load中に`renderer.addShape()`が`onChangeCallback`を発火して`isDirty`が`true`になっても、最後に確実に`false`にリセットされる。

### 結果

✅ **ファイルLoad前にパス編集モードが終了する**
✅ **ファイルLoad前にテキスト編集モードが終了する**
✅ **ファイルLoad前に選択状態がクリアされる**
✅ **ファイルLoad前にファイルパスがリセットされる（新規ドキュメント状態）**
✅ **ファイルLoad前にすべての編集関連状態がリセットされる**
✅ **Load完了後にダーティフラグが確実にfalseになる**
✅ **クリーンな状態で新しいファイルが読み込まれる**

### 技術詳細

**clearCanvas()の初期化順序:**
1. パス編集モード終了（`stopPathEditing()`）
2. テキスト編集モード終了（DOM要素削除とフラグリセット）
3. 選択状態クリア（`renderer.selectShape(null)`）
4. すべてのシェイプ削除
5. その他の状態変数リセット（クリップボード、選択ポイント、ファイルパス等）
6. ダーティフラグリセット
7. 再描画

**onChangeCallbackの問題と解決:**
- **問題**: `renderer.setOnChangeCallback(() => { setDirty(true); ... })`が設定されているため、`addShape()`の度に`isDirty`が`true`になる
- **解決**: `loadSVG()`の最後で`setDirty(false)`を呼び、Load完了後に確実にリセット

**状態管理の完全性:**
- 編集モード、選択状態、シェイプデータ、ファイルパス、UI状態のすべてを一括でリセット
- 新しいファイル読み込み時に予期しない動作を防止
- Load完了後は常に「保存済み」状態（`isDirty = false`）

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte`
  - clearCanvas()関数の拡張（行1276-1310）: currentFilePathのリセット追加
  - loadSVG()関数の修正（行1677-1678）: ダーティフラグのリセット追加

---

## 2025-11-09 - SVGファイル読み込み時のグラデーションとPath編集の修正

### 問題
1. ファイルをLoadすると編集中の画像に混ざってしまう
2. Loadした画像の編集ができない（Path要素）
3. 塗り色が常に黒になっている（グラデーションが失われる）

### 原因

#### 問題1: 編集中の画像に混ざる
`loadSVG` 関数が既存のシェイプをクリアせずに新しいシェイプを追加していた。

#### 問題2: Path編集不可
Path要素をロードする際、`d`属性（SVG pathデータ文字列）のみを保存し、編集に必要な`points`配列を生成していなかった。Pathの編集機能は`points`配列に依存しているため、ロードしたPathは編集できなかった。

#### 問題3: グラデーションが失われる
SVGファイルには`<defs>`セクションにグラデーション定義が保存されているが、`loadSVG`関数でこれを解析していなかった。`fill`属性が`url(#gradient-xxx)`の形式でもそのまま文字列として扱われていた。

### 修正内容

#### 1. Canvas.svelte - ヘルパー関数の追加

**parsePathData(d: string): PathPoint[]**
- SVG pathデータ（`d`属性）を解析して`PathPoint`配列を生成
- 'M', 'L', 'C', 'Q'コマンドをパースしてアンカーポイントと制御点を抽出

```typescript
function parsePathData(d: string): PathPoint[] {
  const points: PathPoint[] = []
  const commands = d.match(/[MLCQZ][^MLCQZ]*/gi)

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase()
    const coords = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat)

    if (type === 'M' && coords.length >= 2) {
      points.push({ x: coords[0], y: coords[1], type: 'M' })
    } else if (type === 'C' && coords.length >= 6) {
      points.push({
        x: coords[4],
        y: coords[5],
        type: 'C',
        cp1x: coords[0], cp1y: coords[1],
        cp2x: coords[2], cp2y: coords[3]
      })
    }
    // ...
  }

  return points
}
```

**parseGradients(svg: Element): Map<string, LinearGradient>**
- SVGの`<defs>`セクションから`<linearGradient>`要素を解析
- グラデーションIDをキーとしたMapを返す

```typescript
function parseGradients(svg: Element): Map<string, LinearGradient> {
  const gradients = new Map<string, LinearGradient>()
  const defs = svg.querySelector('defs')
  if (!defs) return gradients

  const linearGradients = defs.querySelectorAll('linearGradient')
  linearGradients.forEach((lg) => {
    const id = lg.getAttribute('id')
    const stops: GradientStop[] = []

    lg.querySelectorAll('stop').forEach((stop) => {
      const offset = parseFloat(stop.getAttribute('offset') || '0')
      const color = stop.getAttribute('stop-color') || '#000000'
      stops.push({ offset, color })
    })

    if (stops.length > 0) {
      gradients.set(id, { type: 'linear', stops, angle: 0 })
    }
  })

  return gradients
}
```

**parseFill(fillAttr: string, gradients: Map): string | LinearGradient | undefined**
- `fill`属性を解析してグラデーントオブジェクトまたは色文字列を返す
- `url(#gradient-xxx)`形式の場合はグラデーションオブジェクトを返す

```typescript
function parseFill(fillAttr: string | null, gradients: Map<string, LinearGradient>) {
  if (!fillAttr || fillAttr === 'none') return undefined

  const urlMatch = fillAttr.match(/url\(#([^)]+)\)/)
  if (urlMatch) {
    const gradientId = urlMatch[1]
    return gradients.get(gradientId)
  }

  return fillAttr
}
```

#### 2. Canvas.svelte:1456-1461 - loadSVG関数の修正

```typescript
function loadSVG(svgString: string) {
  if (!renderer) return

  // Clear existing shapes before loading new file
  clearCanvas()

  // ...

  // Parse gradient definitions first
  const gradients = parseGradients(svg)

  // ...
}
```

#### 3. Canvas.svelte - 各シェイプのfill処理を修正

Rect、Circle要素:
```typescript
const fill = parseFill(rect.getAttribute('fill'), gradients) || '#4CAF50'
```

Path要素:
```typescript
const fillAttr = path.getAttribute('fill')
const fill = parseFill(fillAttr, gradients) || (fillAttr === 'none' ? undefined : undefined)

// Parse path data into points array for editing
const points = parsePathData(d)
const closed = d.trim().toUpperCase().endsWith('Z')

const shape = new Path({
  // ...
  d,
  points,  // ← 追加
  closed,  // ← 追加
  fill,
  // ...
})
```

#### 4. Canvas.svelte:7 - 型定義のインポート追加

```typescript
import type { Shape, LinearGradient, GradientStop, PathPoint } from './engine/Shape'
```

#### 5. Canvas.svelte - 未保存確認の追加

`openLoadDialog`と`handleFileLoad`に未保存確認を追加:
```typescript
if (isDirty) {
  const shouldContinue = confirm('You have unsaved changes. Loading a new file will discard them. Continue?')
  if (!shouldContinue) return
}
```

#### 6. Canvas.svelte:1414-1427 - グラデーントoffsetの正規化（重要なバグ修正）

**問題:** ロード後に何も表示されない問題が発生。コンソールに以下のエラー:
```
IndexSizeError: Failed to execute 'addColorStop' on 'CanvasGradient': 
The provided value (100) is outside the range (0.0, 1.0).
```

**原因:** SVGの`offset`属性は0-100の範囲（例: `offset="0"`, `offset="100"`）だが、Canvas APIの`addColorStop()`は0.0-1.0の範囲を要求する。

**修正:**
```typescript
function parseGradients(svg: Element): Map<string, LinearGradient> {
  // ...
  stopElements.forEach((stop) => {
    let offsetStr = stop.getAttribute('offset') || '0'
    // Remove % if present
    offsetStr = offsetStr.replace('%', '')
    let offset = parseFloat(offsetStr)
    // Convert from 0-100 range to 0.0-1.0 range if needed
    if (offset > 1) {
      offset = offset / 100
    }
    const stopColor = stop.getAttribute('stop-color') || '#000000'
    stops.push({ offset, color: stopColor })
  })
  // ...
}
```

#### 7. デバッグログのクリーンアップ

問題解決後、以下のデバッグ用console.logステートメントを削除:
- `console.log('TextBoxes parsed:', foreignObjects.length)`
- `console.log('Rendering loaded shapes, total shapes:', renderer.getShapes().length)`
- `console.log('loadSVG completed successfully')`
- `console.log('Paths parsed:', paths.length)`
- `console.log('Loading path:', { d, pointsCount, closed, fill })`

### 結果

✅ **ファイルロード時に既存のシェイプがクリアされる**
✅ **グラデーション塗りが正しく復元される**
✅ **Pathの`points`配列が生成され、編集可能になる**
✅ **閉じたPathの`closed`フラグが正しく設定される**
✅ **すべてのファイル読み込み方法で未保存確認が表示される**

### 使い方

1. ファイルメニューから「開く」または Cmd+O
2. 未保存の変更がある場合は確認ダイアログが表示される
3. SVGファイルを選択
4. グラデーション付きのシェイプが正しく表示される
5. Loadしたパスをダブルクリックして編集モードに入れる

### 技術詳細

**SVGのグラデーント構造:**
```xml
<defs>
  <linearGradient id="gradient-rect-123">
    <stop offset="0" stop-color="#ff0000"/>
    <stop offset="1" stop-color="#0000ff"/>
  </linearGradient>
</defs>
<rect fill="url(#gradient-rect-123)" .../>
```

**Pathのデータ構造:**
- `d`: SVG pathデータ文字列（描画用）
- `points`: PathPoint配列（編集用）
- `closed`: パスが閉じているかどうか

**グラデーントの保存形式:**
```typescript
{
  type: 'linear',
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' }
  ],
  angle: 0
}
```

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - ヘルパー関数追加、loadSVG修正、型インポート、未保存確認

---

## 2025-11-03 - 閉じたPath表示問題の修正

### 問題
閉じたPathを選択すると、表示が消える問題がありました。

### 原因

Tool.tsで閉じたPathを生成する際、最初のポイント（point[0]）のtypeを'M'から'C'に変更していました（317行）：
```typescript
points[0].type = 'C'  // ❌ 間違い
```

これにより、以下の問題が発生：
1. pathデータ生成時に不正なSVG pathが生成される
2. PathEditManagerが閉じたパスの制御点を正しく処理できない

さらに、PathEditManagerの各メソッドが閉じたパスを考慮していませんでした：
- 最後のポイントのOUT-handleは `point[0].cp1` に保存されているが、処理されていない
- 最初のポイント（type='M'）が制御点を持つ場合の処理がない

### 修正内容

#### 1. Tool.ts - 最初のポイントのtypeを'M'のまま保持

```typescript
// 修正前
points[0].type = 'C'  // ❌

// 修正後  
// Don't change type - keep it as 'M'
points[0].cp1x = cp1x
points[0].cp1y = cp1y
points[0].cp2x = cp2x
points[0].cp2y = cp2y
points[0].pointType = 'smooth'
// type は 'M' のまま ✅
```

#### 2. PathEditManager.ts - 複数のメソッドを修正

**updateHandles():**
- 閉じたパスの最後のポイントのOUT-handleを追加（`point[0].cp1`）
- すべてのポイントでcp2がある場合にIN-handleを追加（type='C'の条件を削除）

**render():**
- IN-handleの描画条件を `point.type === 'C'` から `point.cp2x !== undefined` に変更
- 閉じたパスの最後のポイントのOUT-handleを描画

**moveHandle():**
- case 'point': 最後のポイントを移動する際、`point[0].cp1` も移動
- case 'cp1': 閉じたパスの最後のポイントのOUT-handleに対応
- case 'cp2': 閉じたパスの最後のポイントのOUT-handleと連動

**updatePathData():**
- 閉じたパスの場合、最後のCコマンド（閉じるセグメント）を追加してからZコマンドを追加

**getPointType():**
- type='M'でも制御点がある場合（閉じたパス）はpointTypeを返す

**setPointType():**
- 閉じたパスの最後のポイントのOUT-handle（`point[0].cp1`）を処理

### 結果

✅ 閉じたPathを選択しても表示が消えない
✅ 閉じたPathの編集が正常に動作
✅ 最後のポイントのOUT-handleが表示・編集可能
✅ 最初のポイントのIN-handle/OUT-handleが表示・編集可能
✅ smooth/symmetricalモードが閉じたPathでも正常動作

### 使い方

1. Pathツールで閉じた図形を作成（最初のポイント近くをクリック）
2. Selectツールで選択
3. ダブルクリックで編集モード
4. すべてのアンカーポイントと制御点が正しく表示される
5. 制御点をドラッグして形状を調整可能

### 技術詳細

**閉じたPathのデータ構造:**
- `point[0]`: type='M', 制御点 cp1/cp2 を持つ（最後→最初のセグメント用）
- `point[1..n-1]`: type='C', 各セグメントの制御点
- `props.closed`: true
- pathデータ: `M x0 y0 C ... C cpnx cpny cp0x cp0y x0 y0 Z`

**制御点の対応:**
- point[i]のIN-handle = point[i].cp2
- point[i]のOUT-handle = point[i+1].cp1（最後は point[0].cp1）

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/Tool.ts` - 最初のポイントのtype保持、pathデータ生成
- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - updateHandles(), render(), moveHandle(), updatePathData(), getPointType(), setPointType()の修正

---

## 2025-11-03 - Pathの閉じた図形（Closed Path）サポート

### 実装内容
Pathの先頭と終端を接続して閉じた図形を作成できる機能を追加。最初のポイントの近くをクリックすると、自動的にパスが閉じる。

### 修正内容

#### 1. Canvas.svelte:445-472 - 最初のポイント近接検出

```typescript
if (pathPoints.length >= 3) {
  const firstPoint = pathPoints[0]
  const distance = Math.sqrt(
    (x - firstPoint.x) ** 2 + (y - firstPoint.y) ** 2
  )

  // If clicking within 10px of first point, close the path
  if (distance < 10) {
    const shape = toolManager.finishPath(true) // close=true
    if (shape) {
      renderer.addShape(shape)
      renderer.selectShape(shape.props.id)
      hasSelection = true
      updateSelectionState()
    }
    renderer.setPreview(null)
    return
  }
}
```

#### 2. Tool.ts:213 - finishPath()にcloseパラメータを追加

**閉じたパスの処理:**
- 接線の計算を循環的に実行（最後→最初→2番目の点を考慮）
- 最後のポイントから最初のポイントへの曲線セグメントを追加
- 最初のポイント（Mコマンド）に制御点データ（cp1, cp2）を追加
- `path.props.closed = true` を設定
- SVG pathデータに `Z` コマンドを追加

**重要なコード:**
```typescript
// For closed paths, extend the points array cyclically
const extendedPoints = close 
  ? [pathPoints[pathPoints.length - 1], ...pathPoints, pathPoints[0]]
  : pathPoints

// For closed paths, create segment back to first point
if (close && currentIdx === 0) {
  points[0].cp1x = cp1x
  points[0].cp1y = cp1y
  points[0].cp2x = cp2x
  points[0].cp2y = cp2y
  points[0].type = 'C'
}

// Add Z command for closed paths
if (close) {
  d += ' Z'
}
```

### 結果

✅ 最初のポイントの10px以内をクリックするとパスが自動的に閉じる
✅ 閉じたパスは滑らかな曲線で接続される
✅ 最初のポイントの接線も前後の点を考慮して計算される
✅ SVGの`Z`コマンドで正しく閉じられる
✅ ダブルクリックで開いたパスとして完成
✅ `path.props.closed`で開閉状態を管理

### 使い方

**閉じたパスの作成:**
1. Pathツールを選択
2. 3つ以上のポイントをクリック
3. 最初のポイントの近く（10px以内）をクリック
4. 自動的に閉じた図形が完成

**開いたパスの作成:**
1. Pathツールを選択
2. 複数のポイントをクリック
3. ダブルクリックまたはEnterキーで完成
4. 開いた曲線として作成される

### 技術詳細

- **循環的接線計算**: 閉じたパスでは、最初と最後のポイントも中間ポイントと同じように前後の点を考慮
- **制御点の保存**: 閉じたパスの場合、最初のポイント（Mコマンド）にも制御点を保存
- **Zコマンド**: SVG pathの標準的な閉じるコマンド
- **距離閾値**: 10pxの閾値で最初のポイントとの近接を判定

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - 近接検出とパスを閉じる処理
- `/Users/oda/project/claude/grapher/src/lib/engine/Tool.ts` - finishPath()にcloseパラメータ、循環的接線計算、Zコマンド追加

---

## 2025-11-03 - スムーズ曲線生成の修正

### 問題
Pathツールで曲線を作成しても、すべて角になってしまう。制御点が正しく配置されず、滑らかな曲線にならない。

### 原因

Tool.tsでのパス生成時、制御点の計算が不適切でした：

**以前の実装:**
```typescript
// prevPoint から currentPoint への直線上に制御点を配置
const dx = currentPoint.x - prevPoint.x
const dy = currentPoint.y - prevPoint.y
const cp1x = prevPoint.x + dx / 3  // 1/3の位置
const cp2x = prevPoint.x + (2 * dx) / 3  // 2/3の位置
```

この方法では、cp1とcp2が同じ直線上（prevPoint → currentPoint）にあるため、曲線ではなく直線になってしまいます。

### 修正内容

#### Tool.ts:238-291 - スムーズ曲線生成アルゴリムの改善

**Catmull-Romスプライン風のアプローチ:**

1. **各ポイントでの接線を事前計算:**
   - 最初のポイント: `tangent = point[1] - point[0]`
   - 中間ポイント: `tangent = (point[i+1] - point[i-1]) / 2`（平均方向）
   - 最後のポイント: `tangent = point[last] - point[last-1]`

2. **接線を正規化:**
   ```typescript
   const length = Math.sqrt(tangentX * tangentX + tangentY * tangentY)
   tangentX /= length
   tangentY /= length
   ```

3. **制御点を配置:**
   ```typescript
   const handleLength = distance / 3
   
   // OUT-handle: ポイントから接線方向に
   cp1x = prevPoint.x + prevTangent.x * handleLength
   cp1y = prevPoint.y + prevTangent.y * handleLength
   
   // IN-handle: ポイントから接線の逆方向に
   cp2x = currentPoint.x - currentTangent.x * handleLength
   cp2y = currentPoint.y - currentTangent.y * handleLength
   ```

**重要なポイント:**
- 各ポイントでの接線方向が、前後のポイントを考慮して計算される
- 制御点がそれぞれのポイントの接線方向に配置される
- ハンドルの長さはセグメントの長さの1/3（標準的な値）

### 結果

✅ Pathツールで作成した曲線が滑らかになる
✅ 各アンカーポイントの制御点が正しい方向を向く
✅ 中間ポイントで自然な曲線が形成される
✅ デフォルトで`pointType: 'smooth'`が設定される

### 使い方

1. Pathツールを選択
2. キャンバス上で複数のポイントをクリック
3. Enterキーまたはダブルクリックでパスを確定
4. 自動的にスムーズな曲線が生成される
5. ダブルクリックで編集モードに入り、制御点を調整可能

### 技術詳細

- **Catmull-Romスプライン**: 与えられた点を通る滑らかな曲線を生成する標準的な手法
- **接線計算**: 各ポイントでの曲線の方向を決定
- **ハンドル長**: セグメント長の1/3が、視覚的にバランスの取れた曲線を生成

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/Tool.ts` - finishDrawing()メソッドのパス生成ロジック

---

## 2025-11-03 - 制御点の方向修正（Illustratorスタイル）

### 問題
制御点の曲率が逆になっていた。Illustratorでは、アンカーポイントを選択すると、そのポイントのIN-handleとOUT-handleが表示されるべきだが、間違った制御点が表示されていた。

### 原因

**SVGのCコマンドの構造:**
```
C cp1x cp1y cp2x cp2y x y
```
このコマンドは「前のポイントからpoint(x,y)への曲線」を定義し：
- `cp1` = 前のポイントからのOUT-handle
- `cp2` = 現在のポイントへのIN-handle

**データ構造:**
各ポイント `point[i]` には、`point[i-1]` から `point[i]` への曲線セグメントの情報が保存される：
- `point[i].cp1` = `point[i-1]` のOUT-handle
- `point[i].cp2` = `point[i]` のIN-handle

**Illustratorスタイルでは:**
`point[i]` を選択したとき、`point[i]` のIN-handleとOUT-handleを表示する必要がある：
- IN-handle = `point[i].cp2` ✓
- OUT-handle = `point[i+1].cp1` ← これが欠けていた！

以前の実装では、`point[i]` を選択したときに `point[i].cp1` と `point[i].cp2` を表示していたが、これは間違い。

### 修正内容

#### 1. PathEditManager.ts:render() - 制御線の描画

```typescript
// 修正前: point[i]のcp1とcp2を表示
if (isSelected && point.cp1x !== undefined) {
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.cp1x, point.cp1y!)
}

// 修正後: point[i]のIN-handleとOUT-handleを表示
// IN-handle: point[i].cp2
if (isSelected && point.cp2x !== undefined) {
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.cp2x, point.cp2y!)
}

// OUT-handle: point[i+1].cp1
if (isSelected && i + 1 < points.length) {
  const nextPoint = points[i + 1]
  if (nextPoint.cp1x !== undefined) {
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(nextPoint.cp1x, nextPoint.cp1y!)
  }
}
```

#### 2. PathEditManager.ts:updateHandles() - ハンドル配列の更新

```typescript
// point[i] IN-handle = point[i].cp2
if (point.cp2x !== undefined) {
  this.handles.push({
    pointIndex: i,
    type: 'cp2',
    x: point.cp2x,
    y: point.cp2y,
  })
}

// point[i] OUT-handle = point[i+1].cp1
if (i + 1 < points.length) {
  const nextPoint = points[i + 1]
  if (nextPoint.cp1x !== undefined) {
    this.handles.push({
      pointIndex: i,  // This OUT-handle belongs to point[i]
      type: 'cp1',
      x: nextPoint.cp1x,
      y: nextPoint.cp1y,
    })
  }
}
```

#### 3. PathEditManager.ts:moveHandle() - 制御点のドラッグ処理

- `cp1` をドラッグ: `point[i+1].cp1` を更新（point[i]のOUT-handle）
- `cp2` をドラッグ: `point[i].cp2` を更新（point[i]のIN-handle）
- smooth/symmetricalの調整も正しいハンドルを参照するように修正

#### 4. PathEditManager.ts:setPointType() - ポイントタイプの変更

- `point[i].cp2`（IN-handle）と `point[i+1].cp1`（OUT-handle）を正しく調整

### 結果

✅ アンカーポイントを選択すると、正しいIN-handleとOUT-handleが表示される
✅ 制御点をドラッグすると、曲線が期待通りの方向に曲がる
✅ smooth/symmetricalモードで反対側の制御点が正しく連動する
✅ Illustratorと同じ動作になった

### 使い方

1. Pathをダブルクリックして編集モードに入る
2. アンカーポイント（白い正方形）をクリック
3. IN-handle（前の曲線から入ってくる）とOUT-handle（次の曲線へ出ていく）が表示される
4. 制御点（青い円）をドラッグして曲線を調整
5. ポイントタイプ（スムーズ/対称/コーナー）を変更して制御点の連動を調整

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - render(), updateHandles(), moveHandle(), setPointType()の修正

---

## 2025-11-03 - パス編集UIのIllustratorスタイル化

### 問題
パス編集時のアンカーポイントと制御点の表示がIllustratorと異なっていた：
- アンカーポイントが青い正方形
- 制御点がオレンジ色の円

### 修正内容

#### PathEditManager.ts:613-734 - render() メソッドの改善

**Illustratorスタイルに合わせた変更:**

1. **アンカーポイント（正方形）**:
   - 白い塗りつぶし + 青いアウトライン（統一）
   - 選択時: サイズ1.2倍、アウトライン2.5px
   - 非選択時: 通常サイズ、アウトライン2px

2. **制御点（円）**:
   - 色をオレンジ(#FF9800) → 青(#2196F3)に変更
   - サイズを`handleSize * 0.8`に縮小（アンカーポイントより小さく）
   - 青い塗りつぶし + 白いアウトライン（1.5px）

```typescript
// アンカーポイント
ctx.fillStyle = '#fff'
ctx.strokeStyle = '#2196F3'
ctx.lineWidth = isSelected ? 2.5 : 2

// 制御点
const handleRadius = this.handleSize * 0.8
ctx.fillStyle = '#2196F3'
ctx.strokeStyle = '#fff'
ctx.lineWidth = 1.5
```

### 結果

✅ アンカーポイントと制御点の色が統一され、Illustratorスタイルに近づいた
✅ アンカーポイント = 白い正方形（青アウトライン）
✅ 制御点 = 青い円（白アウトライン、少し小さめ）
✅ 視覚的な階層が明確（アンカーポイントがより目立つ）

### 使い方
1. Pathをダブルクリックして編集モードに入る
2. アンカーポイント（白い正方形）をクリックして選択
3. 制御点（青い円）をドラッグして曲線を調整

### 変更ファイル
- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - render()メソッドの改善

---

## 2025-11-03 - Pathのリサイズ機能の実装

### 実装内容
Pathシェイプに対するリサイズ機能を追加。TransformControlsのハンドルを使ってPathを拡大・縮小できるようになった。

### 修正内容

#### TransformControls.ts - resizePath() メソッドの追加

**TransformControls.ts:280行目以降に追加**

PathのリサイズはGroupのリサイズと同じロジックを使用：

1. **現在の境界を取得** - `path.getBounds()` でPathの現在のサイズと位置を取得
2. **新しい境界を計算** - ハンドルタイプ（nw/n/ne/e/se/s/sw/w）に応じて新しいサイズを計算
3. **スケール係数を計算** - `scaleX = newWidth / oldWidth`, `scaleY = newHeight / oldHeight`
4. **原点を決定** - リサイズ時に固定される点（反対側のハンドル位置）
5. **すべてのポイントをスケール**:
   - アンカーポイント (`point.x`, `point.y`)
   - ベジェ曲線の制御点 (`cp1x`, `cp1y`, `cp2x`, `cp2y`)
   - 2次ベジェ曲線の制御点 (`cpx`, `cpy`)
6. **SVG pathデータを再生成** - 更新されたポイント配列から `d` 属性を再構築

**主要なコード:**
```typescript
private resizePath(handleType: HandleType, dx: number, dy: number) {
  const path = this.shape as Path
  const bounds = path.getBounds()
  const { x: oldX, y: oldY, width: oldWidth, height: oldHeight } = bounds

  // Calculate scale factors
  const scaleX = newWidth / oldWidth
  const scaleY = newHeight / oldHeight

  // Scale all path points
  for (const point of path.props.points) {
    const relX = point.x - originX
    const relY = point.y - originY
    point.x = originX + relX * scaleX
    point.y = originY + relY * scaleY

    // Scale control points...
  }

  // Regenerate path data string
  let d = ''
  for (const point of path.props.points) {
    if (point.type === 'M') d += `M ${point.x} ${point.y} `
    else if (point.type === 'L') d += `L ${point.x} ${point.y} `
    else if (point.type === 'C') d += `C ${point.cp1x} ${point.cp1y} ${point.cp2x} ${point.cp2y} ${point.x} ${point.y} `
    // ...
  }
  path.props.d = d.trim()
}
```

### 結果

✅ Selectツールでパスを選択し、変形ハンドルをドラッグしてリサイズ可能
✅ すべてのアンカーポイントと制御点が正しくスケールされる
✅ リサイズ後もベジェ曲線の形状が維持される
✅ SVG pathデータが自動的に更新される
✅ 最小サイズ制限（20x20px）が適用される

### 使い方

1. **Selectツール**を選択
2. Pathシェイプをクリックして選択
3. 周囲の8つのハンドル（nw/n/ne/e/se/s/sw/w）をドラッグしてリサイズ
4. 原点（反対側のハンドル）を中心にPath全体がスケールされる

### 技術詳細

- **相対座標計算**: 各ポイントを原点からの相対位置として計算し、スケール係数を適用
- **制御点の保持**: ベジェ曲線の制御点も同じスケール係数でスケールすることで、曲線の形状が維持される
- **pathデータの再構築**: ポイント配列から `M`, `L`, `C`, `Q` コマンドを使ってSVG path文字列を再生成
- **Rendererとの統合**: Renderer.ts:92-129で既に実装されているPath移動機能と統合

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/TransformControls.ts` - resizePath() メソッドの追加

---


## 2025-11-03 - 制御点の表示ロジック修正

### 問題
アンカーポイントを選択したとき、そのアンカーポイントの2つの制御点が表示されるべきだが、1つは選択したアンカーポイント、もう1つは隣のアンカーポイントを対象としていた。

### 原因
従来のロジックでは、制御点を「どの曲線セグメントに属するか」で管理していた：
- `point[i].cp1` → `point[i-1]`が選択されているときに表示
- `point[i].cp2` → `point[i]`が選択されているときに表示

しかし、各ポイントは自分のデータとして`cp1`と`cp2`の両方を持っているため、`point[i]`を選択したときは**両方**を表示すべき。

### 修正内容

#### 1. 制御線の描画ロジック

**PathEditManager.ts:648-681**
```typescript
// 修正前: cp1は前のポイントが選択されているときに描画
const shouldShowAsOutHandle = this.showAllControlPoints || (i > 0 && this.selectedPointIndex === i - 1)
if (shouldShowAsOutHandle && point.cp1x !== undefined && i > 0) {
  const prevPoint = points[i - 1]
  ctx.beginPath()
  ctx.moveTo(prevPoint.x, prevPoint.y)
  ctx.lineTo(point.cp1x, point.cp1y!)
  ctx.stroke()
}

// 修正後: point[i]を選択したとき、cp1とcp2の両方を描画
const isSelected = this.showAllControlPoints || this.selectedPointIndex === i

// cp1の制御線
if (isSelected && point.cp1x !== undefined) {
  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.cp1x, point.cp1y!)
  ctx.stroke()
}

// cp2の制御線
if (isSelected && point.cp2x !== undefined) {
  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.cp2x, point.cp2y!)
  ctx.stroke()
}
```

#### 2. 制御点（円）の可視性ロジック

**PathEditManager.ts:728-741**
```typescript
// 修正前: cp1は前のポイントが選択されているときのみ表示
if (handle.type === 'cp1') {
  shouldShowControlPoint = handle.pointIndex > 0 && this.selectedPointIndex === handle.pointIndex - 1
}

// 修正後: cp1とcp2の両方をこのポイントが選択されているときに表示
if (handle.type === 'cp1' || handle.type === 'cp2') {
  shouldShowControlPoint = this.selectedPointIndex === handle.pointIndex
}
```

#### 3. クリック時の選択ロジック

**Canvas.svelte:377-381** & **PathEditManager.ts:192-195**
```typescript
// 修正前: cp1をクリックすると前のポイントを選択
else if (pathHandle.type === 'cp1') {
  selectedPathPointIndex = pathHandle.pointIndex > 0 ? pathHandle.pointIndex - 1 : null
}

// 修正後: cp1もcp2もこのポイントを選択
else if (pathHandle.type === 'cp1' || pathHandle.type === 'cp2' || pathHandle.type === 'cp') {
  selectedPathPointIndex = pathHandle.pointIndex
}
```

### 結果

✅ **アンカーポイントを選択すると、そのポイントのcp1とcp2の両方が表示される**
✅ **制御線が選択したアンカーポイントから両方の制御点へ伸びる**
✅ **制御点をクリックすると、その制御点が属するアンカーポイントが選択される**
✅ **隣のアンカーポイントの制御点は表示されない**

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - 制御線と制御点の表示ロジック、選択ロジック
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - 制御点クリック時の選択ロジック

---

## 2025-11-03 - ポイントタイプの表示と編集機能の修正

### 問題
- Pathツールで描画したパスのポイントがすべて**直線ポイント**になる
- ポイントタイプが「直線」と表示され、ポイント属性ボタン（〜/⚖️/⌐）が無効になる
- ポイント属性（スムーズ/対称/コーナー）が表示されない
- ベジェ曲線に変換したポイントの属性が編集できない

### 原因
1. **Tool.ts:230-236** - Pathツールでパスを保存するとき、すべてのポイントを `type: 'L'`（直線）として保存していた
2. **Canvas.svelte:1642-1646** - ポイントタイプインジケーターがポイント属性（smooth/symmetrical/corner）を表示していなかった
3. **PathEditManager.ts:376** - `convertToCubicBezier()` でベジェ曲線に変換するときに `pointType` を設定していなかった
4. **PathEditManager.ts:515-551** - `setPointType()` で 'smooth' を設定しても制御点が調整されなかった

### 修正内容

#### 1. Pathツールで滑らかなベジェ曲線を作成

**Tool.ts:230-291**
```typescript
// 修正前: すべてのポイントを直線として保存
for (let i = 1; i < pathPoints.length; i++) {
  points.push({
    x: pathPoints[i].x,
    y: pathPoints[i].y,
    type: 'L'  // 直線
  })
}

// 修正後: 3点以上の場合はベジェ曲線として保存
if (pathPoints.length === 2) {
  // 2点のみ: 直線
  points.push({ x: pathPoints[1].x, y: pathPoints[1].y, type: 'L' })
} else {
  // 3点以上: 滑らかな3次ベジェ曲線
  for (let i = 1; i < pathPoints.length; i++) {
    const prevPoint = pathPoints[i - 1]
    const currentPoint = pathPoints[i]
    const dx = currentPoint.x - prevPoint.x
    const dy = currentPoint.y - prevPoint.y

    // 制御点を1/3と2/3の位置に配置
    const cp1x = prevPoint.x + dx / 3
    const cp1y = prevPoint.y + dy / 3
    const cp2x = prevPoint.x + (2 * dx) / 3
    const cp2y = prevPoint.y + (2 * dy) / 3

    points.push({
      x: currentPoint.x,
      y: currentPoint.y,
      type: 'C',  // 3次ベジェ曲線
      cp1x, cp1y, cp2x, cp2y,
      pointType: 'smooth'  // デフォルトでスムーズ
    })
  }
}
```

#### 2. ポイント属性の表示

**Canvas.svelte:1642-1653**
```typescript
<!-- 修正前: ポイントの種類のみ表示 -->
<span class="point-type-indicator">
  {selectedPoint.type === 'M' ? '始点' :
   selectedPoint.type === 'L' ? '直線' : 'ベジェ'}
</span>

<!-- 修正後: ポイント属性も表示 -->
<span class="point-type-indicator">
  {@const pointTypeName = selectedPoint.type === 'M' ? '始点' :
                          selectedPoint.type === 'L' ? '直線' : 'ベジェ'}
  {@const pointAttr = isBezierPoint ? pathEditManager.getPointType(selectedPathPointIndex) : null}
  {@const attrName = pointAttr === 'smooth' ? 'スムーズ' :
                     pointAttr === 'symmetrical' ? '対称' :
                     pointAttr === 'corner' ? 'コーナー' : ''}
  {pointTypeName}{attrName ? ` (${attrName})` : ''}
</span>
```

「ベジェ (スムーズ)」「ベジェ (対称)」「ベジェ (コーナー)」のように表示される。

#### 3. ベジェ曲線変換時のデフォルト設定

**PathEditManager.ts:376-377**
```typescript
point.type = 'C'
point.pointType = 'smooth' // Default to smooth point
this.updatePathData()
this.updateHandles()
```

ベジェ曲線に変換したとき、デフォルトで`pointType = 'smooth'`を設定。

#### 4. ポイントタイプ変更時の即時適用

**PathEditManager.ts:515-572**
```typescript
setPointType(pointIndex: number, pointType: 'smooth' | 'symmetrical' | 'corner') {
  // ...
  point.pointType = pointType

  // Adjust control points based on the new point type
  if (point.cp1x !== undefined && point.cp2x !== undefined) {
    if (pointType === 'symmetrical') {
      // Symmetrical: mirror control points with same length
      // ... 既存のコード
    } else if (pointType === 'smooth') {
      // Smooth: align control points on a line but keep their individual lengths
      const cp1VecX = point.cp1x - point.x
      const cp1VecY = point.cp1y! - point.y
      const cp1Length = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)
      const cp2Length = Math.sqrt(
        (point.cp2x - point.x) ** 2 + (point.cp2y! - point.y) ** 2
      )

      if (cp1Length > 0) {
        const normX = cp1VecX / cp1Length
        const normY = cp1VecY / cp1Length

        // Keep cp1 as is, align cp2 in opposite direction
        point.cp2x = point.x - normX * cp2Length
        point.cp2y = point.y - normY * cp2Length
      }
    }
    // Corner: do nothing (control points stay independent)
  }

  this.updatePathData()
  this.updateHandles()
}
```

'smooth' を設定したときも、制御点を即座に一直線上に配置（長さは保持）。

### 結果

✅ **Pathツールで3点以上描画すると自動的に滑らかなベジェ曲線になる**
✅ **ポイントタイプインジケーターに「ベジェ (スムーズ)」のように属性が表示される**
✅ **ポイント属性ボタン（〜/⚖️/⌐）が有効になり、クリックで即座に動作が変わる**
✅ **直線ポイントの場合はボタンが無効化され、理由が明確に表示される**

### ポイントタイプの動作

- **スムーズ（〜）**: 制御点が一直線上に配置されるが、長さは独立（滑らかな曲線）
- **対称（⚖️）**: 制御点が一直線上に配置され、長さも等しい（完全に対称な曲線）
- **コーナー（⌐）**: 制御点が完全に独立（尖った角）

---

## 2025-11-03 - パス編集機能の問題修正

### 報告された問題
1. グリッドがONの場合、Pathの選択ポイントの移動がグリッドに制限される
2. Pathのポイントの属性が編集できない
3. Pathのポイントの属性が必ずEdgeになっている
4. 選択ポイントに制御ポイントが表示されず、ほかのポイントに表示される

### 修正内容

#### 問題4：制御点の表示（最重要）

**原因:** Canvas.svelteでパスハンドルをクリックしたときに、`renderer.render()`を呼び出していなかった。そのため、PathEditManagerの選択状態が更新されても画面に反映されなかった。

**修正:** Canvas.svelte:372-390
```typescript
// Update selected point index for reactivity
if (pathHandle.type === 'point') {
  selectedPathPointIndex = pathHandle.pointIndex
} else if (pathHandle.type === 'cp2' || pathHandle.type === 'cp') {
  selectedPathPointIndex = pathHandle.pointIndex
} else if (pathHandle.type === 'cp1') {
  selectedPathPointIndex = pathHandle.pointIndex > 0 ? pathHandle.pointIndex - 1 : null
}

// Render to update control point visibility
renderer.render()
```

**結果:** 
✅ アンカーポイントをクリックすると、そのポイントの制御点（IN-handleとOUT-handle）が正しく表示される
✅ 制御点をクリックすると、対応するアンカーポイントが選択され、関連する制御点が表示される

#### 問題2&3：ポイント属性の編集

**原因:** ポイントタイプ（smooth/symmetrical/corner）は**ベジェ曲線ポイント（type='C'）のみ**に適用される。線形ポイント（type='L'）には適用されない。UIでは、線形ポイントを選択してもボタンが非アクティブになる理由が分からなかった。

**修正:** Canvas.svelte:1630-1690
- ポイントタイプインジケーターを追加（「始点」「直線」「ベジェ」「2次ベジェ」）
- ベジェ曲線ポイントでない場合、ボタンを無効化
- ツールチップで「ベジェ曲線ポイントのみ」と説明

```svelte
{@const isBezierPoint = selectedPoint?.type === 'C'}

<span class="point-type-indicator" title="選択中のポイントタイプ">
  {selectedPoint.type === 'M' ? '始点' : selectedPoint.type === 'L' ? '直線' : 
   selectedPoint.type === 'C' ? 'ベジェ' : '2次ベジェ'}
</span>

<button
  class="tool-button"
  disabled={!isBezierPoint}
  title={isBezierPoint ? "スムーズポイント (1)" : "ベジェ曲線ポイントのみ"}
>
  〜
</button>
```

**CSS追加:** Canvas.svelte:2051-2065
```css
.tool-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #2c2c2c;
}

.point-type-indicator {
  font-size: 12px;
  color: #aaa;
  padding: 4px 8px;
  background: #2c2c2c;
  border-radius: 3px;
  border: 1px solid #444;
  margin-right: 8px;
}
```

**結果:**
✅ 選択中のポイントのタイプ（始点/直線/ベジェ/2次ベジェ）が表示される
✅ ベジェ曲線ポイント以外ではポイントタイプボタンが無効化され、理由が明確になる
✅ ツールチップで機能の制約が説明される

#### 問題1：グリッドスナップの無効化

**原因:** パス編集モードでアンカーポイントを移動すると、SnapManagerによってグリッドにスナップされていた。精密な制御が必要なパス編集では、グリッドスナップが邪魔になる。

**修正:** PathEditManager.ts:198-210
```typescript
// 修正前: SnapManagerを使用してグリッドにスナップ
let newX = point.x + dx
let newY = point.y + dy

if (this.snapManager) {
  const snapped = this.snapManager.snap(newX, newY, [], [])
  newX = snapped.x
  newY = snapped.y
}

const actualDx = newX - point.x
const actualDy = newY - point.y

point.x = newX
point.y = newY

// Also move control points if they exist
if (point.cp1x !== undefined) point.cp1x += actualDx
if (point.cp1y !== undefined) point.cp1y += actualDy
...

// 修正後: スナップせずにdx/dyをそのまま適用
point.x += dx
point.y += dy

// Also move control points if they exist
if (point.cp1x !== undefined) point.cp1x += dx
if (point.cp1y !== undefined) point.cp1y += dy
...
```

**結果:**
✅ アンカーポイントをドラッグしてもグリッドにスナップしない
✅ 制御点をドラッグしてもグリッドにスナップしない
✅ パス編集モードで精密な制御が可能になった

### 使い方

1. **パス編集モードの開始**
   - Selectツールでパスをダブルクリック
   - アンカーポイント（青い正方形）と制御点（オレンジの円）が表示される

2. **ポイントの選択と制御点の表示**
   - アンカーポイントをクリックすると、そのポイントのIN-handleとOUT-handleが表示される
   - 制御点をクリックすると、対応するアンカーポイントが選択される

3. **ポイントタイプの変更（ベジェ曲線ポイントのみ）**
   - ツールバーでポイントタイプインジケーターを確認
   - ベジェ曲線ポイントを選択している場合のみ、〜/⚖️/⌐ボタンが有効
   - キーボードショートカット: 1（スムーズ）、2（対称）、3（コーナー）

4. **グリッドスナップ**
   - アンカーポイントを移動すると、グリッドにスナップ（制御点も一緒に移動）
   - 制御点を個別にドラッグすると、グリッドスナップは適用されない
   - Altキーを押しながら制御点をドラッグすると、反対側の制御点が独立して動く

### 技術詳細

**Illustratorスタイルの制御点構造:**
- SVGのCコマンド: `C cp1x cp1y cp2x cp2y x y`
- `cp1` = 前のポイントのOUT-handle
- `cp2` = 現在のポイントのIN-handle
- ポイントを選択すると、そのポイントのIN-handleと前のポイントのOUT-handleが表示される

**ポイントタイプ:**
- **smooth（スムーズ）**: 制御点が一直線上に配置されるが、長さは独立
- **symmetrical（対称）**: 制御点が一直線上に配置され、長さも等しい
- **corner（コーナー）**: 制御点が独立して動く

### 変更ファイル

- `/Users/oda/project/claude/grapher/src/lib/engine/Tool.ts` - Pathツールでベジェ曲線を生成
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - ポイント属性の表示、制御点表示の修正、CSSスタイル追加
- `/Users/oda/project/claude/grapher/src/lib/engine/PathEditManager.ts` - デフォルトポイントタイプ、即時適用ロジック

---

## 2025-11-02 - パス編集のリアクティブ状態修正

### 問題
- パス編集モードでアンカーポイントを選択しても、プロパティボタン（スムーズ・対称・コーナー）がハイライトされない
- 選択したポイントの移動後にCanvasが更新されない
- キーボードショートカット（1, 2, 3）でポイントタイプを変更してもUIに反映されない

### 原因
- ポイントタイプボタンが `PathEditManager.getSelectedPointIndex()` を直接呼び出していた
- Svelteのリアクティブシステムは `PathEditManager` の内部状態の変更を追跡できない
- `selectedPathPointIndex` が宣言されていたが、更新・同期されていなかった

### 修正内容

#### Canvas.svelte:372-375 - handleMouseDown でポイント選択時に状態を更新
```typescript
// Update selected point index for reactivity
if (pathHandle.type === 'point') {
  selectedPathPointIndex = pathHandle.pointIndex
}
```

#### Canvas.svelte:1622, 1635, 1648 - ポイントタイプボタンの修正
```svelte
<!-- Before: IIFE function calling getSelectedPointIndex() -->
class:active={(() => {
  const pathEditManager = renderer.getPathEditManager()
  const selectedIdx = pathEditManager.getSelectedPointIndex()
  return selectedIdx !== null && pathEditManager.getPointType(selectedIdx) === 'smooth'
})()}

<!-- After: Use reactive state variable -->
class:active={selectedPathPointIndex !== null && renderer.getPathEditManager().getPointType(selectedPathPointIndex) === 'smooth'}
```

#### Canvas.svelte:921, 931, 941 - キーボードショートカットの修正
```typescript
// Before
const selectedIdx = pathEditManager.getSelectedPointIndex()
if (selectedIdx !== null) {
  pathEditManager.setPointType(selectedIdx, 'smooth')
}

// After
if (selectedPathPointIndex !== null) {
  pathEditManager.setPointType(selectedPathPointIndex, 'smooth')
}
```

#### Canvas.svelte:751, 766 - 状態の初期化とクリア
```typescript
function startPathEditing(path: Path) {
  // ...
  selectedPathPointIndex = null // Reset selection
}

function stopPathEditing() {
  // ...
  selectedPathPointIndex = null // Clear selection
}
```

### 結果
✅ アンカーポイントをクリックすると `selectedPathPointIndex` が更新される
✅ ポイントタイプボタンが選択状態に応じて正しくハイライトされる
✅ ハンドルのドラッグ中にCanvasが正しくレンダリングされる
✅ キーボードショートカット（1, 2, 3）が正常に動作する
✅ パス編集開始・終了時に状態が正しく初期化・クリアされる

### 技術詳細
- **Svelte 5 リアクティビティ**: `$state()` rune でリアクティブな状態変数を宣言
- **イベント駆動更新**: マウスクリック時に状態を更新することでUIが自動的に反応
- **単一の真実の源**: `selectedPathPointIndex` を唯一の状態管理ポイントとして使用
- **ライフサイクル管理**: パス編集の開始・終了時に状態を適切に管理

### 変更ファイル
- `/Users/oda/project/claude/grapher/src/lib/Canvas.svelte` - リアクティブ状態の同期化

---

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
