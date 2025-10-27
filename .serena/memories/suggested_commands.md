# 推奨コマンド

## 開発コマンド

### 開発サーバー起動
```bash
npm run dev
```
Vite開発サーバー + Electronウィンドウを起動（HMR有効）

### ブラウザプレビュー
```bash
npm run preview
```
ビルド後のプレビュー（Electronなし）

### 型チェック
```bash
npm run check
```
Svelte と TypeScript の型チェックを実行

## ビルド・パッケージング

### 完全ビルド
```bash
npm run build
```
Viteビルド + electron-builder でアプリパッケージング

### ディレクトリビルド（開発用）
```bash
npm run build:dir
```
パッケージングせずディレクトリ出力のみ

### プラットフォーム別ビルド
```bash
npm run package:mac    # macOS用 (dmg, zip)
npm run package:win    # Windows用 (nsis, zip)
npm run package:linux  # Linux用 (AppImage, deb)
```

## ユーティリティコマンド（macOS）

### ファイル操作
```bash
ls -la              # ファイル一覧（隠しファイル含む）
find . -name "*.ts" # TypeScriptファイル検索
grep -r "pattern" . # パターン検索
```

### Git操作（リポジトリ設定後）
```bash
git status
git add .
git commit -m "message"
```

## 開発時の注意
- `npm run dev` で自動的にElectronウィンドウが開く
- DevToolsは自動で開く（開発モード時）
- HMRでコード変更が即座に反映される
- ビルド出力は `dist/` (フロントエンド), `dist-electron/` (メイン), `release/` (パッケージ)
