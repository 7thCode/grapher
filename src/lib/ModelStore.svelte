<script lang="ts">
/**
 * モデルストアコンポーネント
 */
import { onMount } from 'svelte'

interface PresetModel {
  id: string
  name: string
  author: string
  size: number
  memoryRequired: number
  quantization: string
  license: string
  licenseUrl: string
  commercial: boolean
  downloadUrl: string
  tags: string[]
  description: string
}

interface DownloadProgress {
  downloadId: string
  modelId: string
  percentage: number
  speed: number
  eta: number
}

let { visible = $bindable(false), onClose }: { visible?: boolean; onClose: () => void } = $props()

let presetModels = $state<PresetModel[]>([])
let installedModelIds = $state<Set<string>>(new Set())
let downloads = $state<Map<string, DownloadProgress>>(new Map())
let licenseFilter = $state('all')
let memoryFilter = $state('all')
let currentModelsDir = $state('')

onMount(async () => {
  await loadPresetModels()
  await checkInstalledModels()
  await loadModelsDirectory()
  
  // Set up download event listeners
  window.electron.onDownloadProgress((data: any) => {
    downloads.set(data.downloadId, {
      downloadId: data.downloadId,
      modelId: data.modelId,
      percentage: data.percentage,
      speed: data.speed,
      eta: data.eta
    })
  })
  
  window.electron.onDownloadComplete((data: any) => {
    downloads.delete(data.downloadId)
    installedModelIds.add(data.modelId)
    checkInstalledModels()
    alert('モデルのダウンロードが完了しました！')
  })
  
  window.electron.onDownloadError((data: any) => {
    downloads.delete(data.downloadId)
    alert(`ダウンロードエラー: ${data.error}`)
  })
})

async function loadPresetModels() {
  try {
    const result = await window.electron.modelStoreGetPresetModels()
    if (result.success) {
      presetModels = result.models
    }
  } catch (error) {
    console.error('Failed to load preset models:', error)
  }
}

async function checkInstalledModels() {
  try {
    const result = await window.electron.modelStoreListModels()
    if (result.success) {
      installedModelIds.clear()
      for (const model of result.models) {
        const presetId = model.id.replace('.gguf', '')
        installedModelIds.add(presetId)
      }
    }
  } catch (error) {
    console.error('Failed to check installed models:', error)
  }
}

async function loadModelsDirectory() {
  try {
    const result = await window.electron.modelStoreGetModelsDir()
    if (result.success) {
      currentModelsDir = result.path
    }
  } catch (error) {
    console.error('Failed to get models directory:', error)
  }
}

async function startDownload(modelId: string) {
  try {
    await window.electron.modelStoreStartDownload(modelId)
  } catch (error) {
    console.error('Failed to start download:', error)
    alert(`ダウンロード開始に失敗しました: ${error}`)
  }
}

async function cancelDownload(downloadId: string) {
  try {
    await window.electron.modelStoreCancelDownload(downloadId)
    downloads.delete(downloadId)
  } catch (error) {
    console.error('Failed to cancel download:', error)
  }
}

async function deleteModel(modelId: string) {
  const modelName = modelId.replace('.gguf', '')
  if (!confirm(`「${modelName}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
    return
  }
  
  try {
    await window.electron.modelStoreDeleteModel(modelId)
    installedModelIds.delete(modelId.replace('.gguf', ''))
    alert('モデルを削除しました')
  } catch (error) {
    console.error('Failed to delete model:', error)
    alert(`モデルの削除に失敗しました: ${error}`)
  }
}

async function changeModelsDirectory() {
  try {
    const result = await window.electron.modelStoreSelectModelsDir()
    if (result.canceled) return
    
    const newDir = result.path
    const confirmed = confirm(
      `モデル保存ディレクトリを変更しますか？\n\n新しい保存先:\n${newDir}\n\n※既存のモデルは移動されません。新しいディレクトリからモデルを読み込みます。`
    )
    
    if (!confirmed) return
    
    await window.electron.modelStoreSetModelsDir(newDir)
    currentModelsDir = newDir
    await checkInstalledModels()
    alert('モデル保存ディレクトリを変更しました')
  } catch (error) {
    console.error('Failed to change models directory:', error)
    alert(`ディレクトリの変更に失敗しました: ${error}`)
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb.toFixed(1)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分`
  return `${Math.round(seconds / 3600)}時間`
}

let filteredModels = $derived.by(() => {
  let filtered = presetModels

  if (licenseFilter === 'commercial') {
    filtered = filtered.filter(m => m.commercial)
  } else if (licenseFilter === 'non-commercial') {
    filtered = filtered.filter(m => !m.commercial)
  }

  if (memoryFilter === 'small') {
    filtered = filtered.filter(m => m.memoryRequired < 4 * 1024 * 1024 * 1024)
  } else if (memoryFilter === 'medium') {
    filtered = filtered.filter(m => m.memoryRequired >= 4 * 1024 * 1024 * 1024 && m.memoryRequired <= 8 * 1024 * 1024 * 1024)
  }

  return filtered
})
</script>

{#if visible}
<div class="model-store-modal visible">
  <div class="model-store-overlay" onclick={onClose}></div>
  <div class="model-store-container">
    <div class="model-store-header">
      <div class="header-left">
        <h2>🏪 モデルストア</h2>
        <button class="models-dir-btn" onclick={changeModelsDirectory} title="モデル保存先を変更">
          📁 保存先設定
        </button>
      </div>
      <button class="close-btn" onclick={onClose}>×</button>
    </div>

    <div class="model-store-filters">
      <select bind:value={licenseFilter}>
        <option value="all">すべてのライセンス</option>
        <option value="commercial">商用利用可</option>
        <option value="non-commercial">非商用のみ</option>
      </select>
      <select bind:value={memoryFilter}>
        <option value="all">すべてのサイズ</option>
        <option value="small">小型 (&lt;4GB)</option>
        <option value="medium">中型 (4-8GB)</option>
      </select>
    </div>

    <div class="model-store-list">
      {#each filteredModels as model (model.id)}
        {@const isInstalled = installedModelIds.has(model.id)}
        {@const downloadInfo = Array.from(downloads.values()).find(d => d.modelId === model.id)}
        {@const isDownloading = downloadInfo !== undefined}
        
        <div class="model-card">
          <div class="model-info">
            <h3>{model.name}</h3>
            <p class="model-author">by {model.author}</p>
            <p class="model-description">{model.description}</p>
            <div class="model-specs">
              <span class="spec">📦 {formatBytes(model.size)}</span>
              <span class="spec">💾 {formatBytes(model.memoryRequired)} RAM</span>
              <span class="spec">⚙️ {model.quantization}</span>
            </div>
            <div class="model-tags">
              {#each model.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
            <div class="model-license">
              <span class="badge {model.commercial ? 'commercial' : 'non-commercial'}">
                {model.commercial ? '✅ 商用可' : '⚠️ 非商用'}
              </span>
              <a href={model.licenseUrl} target="_blank" class="license-link">{model.license}</a>
            </div>
          </div>
          
          <div class="model-actions">
            {#if isInstalled}
              <div class="installed-actions">
                <button class="btn-installed" disabled>✓ インストール済み</button>
                <button class="btn-delete" onclick={() => deleteModel(`${model.id}.gguf`)}>🗑️ 削除</button>
              </div>
            {:else if isDownloading && downloadInfo}
              <div class="download-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: {downloadInfo.percentage}%"></div>
                </div>
                <div class="progress-info">
                  <span>{downloadInfo.percentage.toFixed(1)}% | {formatSpeed(downloadInfo.speed)} | 残り {formatETA(downloadInfo.eta)}</span>
                  <button class="btn-cancel" onclick={() => cancelDownload(downloadInfo.downloadId)}>キャンセル</button>
                </div>
              </div>
            {:else}
              <button class="btn-download" onclick={() => startDownload(model.id)}>ダウンロード</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
{/if}

<style>
/* Modal Container */
.model-store-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.model-store-modal.visible {
  opacity: 1;
  pointer-events: all;
}

.model-store-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.model-store-container {
  position: relative;
  width: 90%;
  max-width: 1000px;
  max-height: 85vh;
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.model-store-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #444;
  background: #1e1e1e;
}

.model-store-header .header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.model-store-header h2 {
  margin: 0;
  font-size: 24px;
  color: #e0e0e0;
}

.models-dir-btn {
  padding: 8px 16px;
  background: #4a9eff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.models-dir-btn:hover {
  background: #3a8eef;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 32px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

/* Filters */
.model-store-filters {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  background: #1e1e1e;
  border-bottom: 1px solid #444;
}

.model-store-filters select {
  padding: 8px 12px;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.model-store-filters select:hover {
  border-color: #007aff;
}

/* Model List */
.model-store-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-card {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  transition: all 0.2s;
}

.model-card:hover {
  border-color: #007aff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.1);
}

.model-info {
  flex: 1;
}

.model-info h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #e0e0e0;
}

.model-author {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #999;
}

.model-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #ccc;
  line-height: 1.5;
}

.model-specs {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.spec {
  font-size: 13px;
  color: #999;
}

.model-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tag {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  font-size: 12px;
  color: #aaa;
}

.model-license {
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.badge.commercial {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.badge.non-commercial {
  background: rgba(255, 159, 10, 0.15);
  color: #ff9f0a;
}

.license-link {
  font-size: 12px;
  color: #007aff;
  text-decoration: none;
}

/* Actions */
.model-actions {
  display: flex;
  align-items: center;
  min-width: 140px;
}

.installed-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.btn-download,
.btn-installed,
.btn-cancel,
.btn-delete {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.btn-download {
  background: #007aff;
  color: white;
}

.btn-download:hover {
  background: #0066d6;
  transform: translateY(-1px);
}

.btn-installed {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
  cursor: default;
}

.btn-cancel {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
  padding: 6px 12px;
  font-size: 12px;
}

.btn-cancel:hover {
  background: rgba(255, 59, 48, 0.25);
}

.btn-delete {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
  font-size: 13px;
}

.btn-delete:hover {
  background: rgba(255, 59, 48, 0.25);
  transform: translateY(-1px);
}

/* Progress */
.download-progress {
  width: 100%;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007aff, #00d4ff);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
}

/* Scrollbar */
.model-store-list::-webkit-scrollbar {
  width: 8px;
}

.model-store-list::-webkit-scrollbar-track {
  background: transparent;
}

.model-store-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.model-store-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
