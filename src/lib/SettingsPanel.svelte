<script lang="ts">
  import { LlamaAPI } from './ai/LlamaAPI'

  interface Props {
    onClose: () => void
  }

  let { onClose }: Props = $props()

  // State
  let openaiKey = $state('')
  let anthropicKey = $state('')
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let successMessage = $state<string | null>(null)
  let showOpenaiKey = $state(false)
  let showAnthropicKey = $state(false)

  // Local LLM State
  let availableModels = $state<string[]>([])
  let selectedModel = $state<string | null>(null)
  let isModelLoaded = $state(false)
  let isLoadingModel = $state(false)
  let modelsDirectory = $state<string>('')
  let gpuLayers = $state(0)
  let contextSize = $state(4096)

  // Load current API keys on mount
  $effect(() => {
    async function loadKeys() {
      try {
        const providers = await (window as any).electron.getAPIKey()
        
        const openaiProvider = providers.find((p: any) => p.provider === 'openai')
        const anthropicProvider = providers.find((p: any) => p.provider === 'anthropic')
        
        if (openaiProvider) {
          openaiKey = openaiProvider.key
        }
        if (anthropicProvider) {
          anthropicKey = anthropicProvider.key
        }
      } catch (err) {
        console.log('No API keys found:', err)
        // It's okay if no keys are found initially
      }
    }
    loadKeys()
  })

  // Load Local LLM info on mount
  $effect(() => {
    async function loadLlamaInfo() {
      try {
        // Load available models
        availableModels = await LlamaAPI.listModels()
        if (availableModels.length > 0 && !selectedModel) {
          selectedModel = availableModels[0]
        }

        // Check if model is loaded
        isModelLoaded = await LlamaAPI.isModelLoaded()

        // Get models directory
        modelsDirectory = await LlamaAPI.getModelsDirectory()

        // Get configuration
        const config = await LlamaAPI.getConfig()
        gpuLayers = config.gpuLayers || 0
        contextSize = config.contextSize || 4096
      } catch (err) {
        console.error('Failed to load Llama info:', err)
      }
    }
    loadLlamaInfo()
  })

  async function handleSave() {
    isLoading = true
    error = null
    successMessage = null

    try {
      // Save OpenAI key if provided
      if (openaiKey.trim()) {
        await (window as any).electron.setApiKey({
          provider: 'openai',
          key: openaiKey.trim()
        })
      } else {
        // Delete if empty
        await (window as any).electron.deleteApiKey('openai')
      }

      // Save Anthropic key if provided
      if (anthropicKey.trim()) {
        await (window as any).electron.setApiKey({
          provider: 'anthropic',
          key: anthropicKey.trim()
        })
      } else {
        // Delete if empty
        await (window as any).electron.deleteApiKey('anthropic')
      }

      // Save Local LLM configuration
      await LlamaAPI.updateConfig({
        gpuLayers,
        contextSize
      })

      successMessage = '設定を保存しました'
      
      // Close after a short delay
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err) {
      if (err instanceof Error) {
        error = err.message
      } else {
        error = '保存に失敗しました'
      }
      console.error('Failed to save API keys:', err)
    } finally {
      isLoading = false
    }
  }

  function handleCancel() {
    onClose()
  }

  async function handleLoadModel() {
    if (!selectedModel) {
      error = 'モデルを選択してください'
      return
    }

    isLoadingModel = true
    error = null

    try {
      await LlamaAPI.loadModel(selectedModel)
      isModelLoaded = true
      successMessage = `モデル "${selectedModel}" を読み込みました`
      setTimeout(() => { successMessage = null }, 3000)
    } catch (err) {
      if (err instanceof Error) {
        error = err.message
      } else {
        error = 'モデルの読み込みに失敗しました'
      }
    } finally {
      isLoadingModel = false
    }
  }

  async function handleUnloadModel() {
    isLoadingModel = true
    error = null

    try {
      await LlamaAPI.unloadModel()
      isModelLoaded = false
      successMessage = 'モデルをアンロードしました'
      setTimeout(() => { successMessage = null }, 3000)
    } catch (err) {
      if (err instanceof Error) {
        error = err.message
      } else {
        error = 'モデルのアンロードに失敗しました'
      }
    } finally {
      isLoadingModel = false
    }
  }

  async function handleRefreshModels() {
    try {
      availableModels = await LlamaAPI.listModels()
      if (availableModels.length > 0 && !selectedModel) {
        selectedModel = availableModels[0]
      }
    } catch (err) {
      console.error('Failed to refresh models:', err)
    }
  }

  async function handleBrowseModelsDir() {
    try {
      const selectedPath = await LlamaAPI.selectModelsDirectory()
      if (selectedPath) {
        // User selected a directory
        await LlamaAPI.setModelsDirectory(selectedPath)
        modelsDirectory = selectedPath
        
        // Refresh the models list
        await handleRefreshModels()
        
        successMessage = 'モデルディレクトリを変更しました'
        setTimeout(() => { successMessage = null }, 3000)
      }
      // If null, user cancelled - do nothing
    } catch (err) {
      if (err instanceof Error) {
        error = err.message
      } else {
        error = 'ディレクトリの設定に失敗しました'
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // ESC to close
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="settings-panel">
  <div class="header">
    <h3>⚙️ 設定</h3>
    <button class="close-button" onclick={onClose} title="閉じる (ESC)">×</button>
  </div>

  <div class="content">
    <div class="section">
      <h4>APIキー設定</h4>
      <p class="description">
        AI画像生成機能を使用するには、OpenAIまたはAnthropicのAPIキーが必要です。
      </p>

      <!-- OpenAI API Key -->
      <div class="input-group">
        <label for="openai-key">
          <span class="label-text">OpenAI API Key</span>
          <span class="optional">(GPT-4o)</span>
        </label>
        <div class="input-wrapper">
          <input
            id="openai-key"
            type={showOpenaiKey ? 'text' : 'password'}
            bind:value={openaiKey}
            placeholder="sk-..."
            disabled={isLoading}
          />
          <button
            class="toggle-visibility"
            onclick={() => showOpenaiKey = !showOpenaiKey}
            title={showOpenaiKey ? '非表示' : '表示'}
            disabled={isLoading}
          >
            {showOpenaiKey ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        <p class="hint">空欄にすると削除されます</p>
      </div>

      <!-- Anthropic API Key -->
      <div class="input-group">
        <label for="anthropic-key">
          <span class="label-text">Anthropic API Key</span>
          <span class="optional">(Claude Sonnet 4.5)</span>
        </label>
        <div class="input-wrapper">
          <input
            id="anthropic-key"
            type={showAnthropicKey ? 'text' : 'password'}
            bind:value={anthropicKey}
            placeholder="sk-ant-..."
            disabled={isLoading}
          />
          <button
            class="toggle-visibility"
            onclick={() => showAnthropicKey = !showAnthropicKey}
            title={showAnthropicKey ? '非表示' : '表示'}
            disabled={isLoading}
          >
            {showAnthropicKey ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        <p class="hint">空欄にすると削除されます</p>
      </div>
    </div>

    <!-- Local LLM Section -->
    <div class="section local-llm-section">
      <h4>ローカルLLM設定</h4>
      <p class="description">
        ローカルでLLMモデルを実行してAI画像生成を行います。APIキー不要、オフライン動作可能です。
      </p>

      <!-- Model Selection -->
      <div class="input-group">
        <label for="model-select">
          <span class="label-text">モデル</span>
          {#if isModelLoaded}
            <span class="status-badge loaded">✓ 読み込み済み</span>
          {:else}
            <span class="status-badge">未読み込み</span>
          {/if}
        </label>
        <div class="model-controls">
          <select id="model-select" bind:value={selectedModel} disabled={isLoadingModel}>
            <option value={null}>-- モデルを選択 --</option>
            {#each availableModels as model}
              <option value={model}>{model}</option>
            {/each}
          </select>
          <button class="refresh-button" onclick={handleRefreshModels} title="更新" disabled={isLoadingModel}>
            🔄
          </button>
        </div>
        {#if availableModels.length === 0}
          <p class="hint warning">モデルが見つかりません。GGUFモデルファイルを以下のディレクトリに配置してください：</p>
        {/if}
      </div>

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

      <!-- Model Actions -->
      {#if selectedModel}
        <div class="button-group">
          {#if isModelLoaded}
            <button
              class="secondary-button"
              onclick={handleUnloadModel}
              disabled={isLoadingModel}
            >
              {isLoadingModel ? '処理中...' : 'モデルをアンロード'}
            </button>
          {:else}
            <button
              class="primary-button"
              onclick={handleLoadModel}
              disabled={isLoadingModel}
            >
              {isLoadingModel ? '読み込み中...' : 'モデルを読み込む'}
            </button>
          {/if}
        </div>
      {/if}

      <!-- Configuration -->
      <div class="input-group">
        <label for="gpu-layers">
          <span class="label-text">GPU Layers</span>
          <span class="optional">(0 = CPU only)</span>
        </label>
        <input
          id="gpu-layers"
          type="number"
          bind:value={gpuLayers}
          min="0"
          max="100"
          disabled={isLoading}
        />
        <p class="hint">GPUを使用するレイヤー数（0 = CPUのみ、数値が大きいほど高速）</p>
      </div>

      <div class="input-group">
        <label for="context-size">
          <span class="label-text">Context Size</span>
        </label>
        <select id="context-size" bind:value={contextSize} disabled={isLoading}>
          <option value={2048}>2048</option>
          <option value={4096}>4096</option>
          <option value={8192}>8192</option>
        </select>
        <p class="hint">コンテキストサイズ（大きいほど長いプロンプトに対応、メモリ使用量も増加）</p>
      </div>
    </div>

    <!-- Success Message -->
    {#if successMessage}
      <div class="success">
        <span class="success-icon">✓</span>
        <span class="success-message">{successMessage}</span>
      </div>
    {/if}

    <!-- Error Message -->
    {#if error}
      <div class="error">
        <span class="error-icon">❌</span>
        <span class="error-message">{error}</span>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="button-row">
      <button
        class="save-button"
        onclick={handleSave}
        disabled={isLoading}
      >
        {isLoading ? '保存中...' : '保存'}
      </button>
      <button
        class="cancel-button"
        onclick={handleCancel}
        disabled={isLoading}
      >
        キャンセル
      </button>
    </div>
  </div>
</div>

<style>
  .settings-panel {
    background: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    width: 500px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #444;
    background: #1e1e1e;
  }

  h3 {
    margin: 0;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
  }

  .close-button {
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    aspect-ratio: 1 / 1;
    background: #d32f2f;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    flex-shrink: 0;
    flex-grow: 0;
    flex-basis: auto;
  }

  .close-button:hover {
    background: #b71c1c;
  }

  .content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .section {
    margin-bottom: 24px;
  }

  h4 {
    margin: 0 0 8px 0;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }

  .description {
    margin: 0 0 20px 0;
    color: #aaa;
    font-size: 13px;
    line-height: 1.5;
  }

  .input-group {
    margin-bottom: 20px;
  }

  label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
    font-weight: 500;
  }

  .label-text {
    flex-shrink: 0;
  }

  .optional {
    font-size: 12px;
    color: #888;
    font-weight: 400;
  }

  .input-wrapper {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  input {
    flex: 1;
    padding: 10px 12px;
    background: #1e1e1e;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #2196F3;
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-visibility {
    width: 36px;
    height: 36px;
    background: #1e1e1e;
    color: #ccc;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .toggle-visibility:hover:not(:disabled) {
    background: #2c2c2c;
    border-color: #666;
  }

  .toggle-visibility:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    margin: 6px 0 0 0;
    color: #888;
    font-size: 12px;
  }

  .success {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid #4CAF50;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .success-icon {
    flex-shrink: 0;
    font-size: 16px;
    color: #4CAF50;
  }

  .success-message {
    color: #81C784;
    font-size: 14px;
    line-height: 1.5;
  }

  .error {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    background: rgba(211, 47, 47, 0.1);
    border: 1px solid #d32f2f;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .error-icon {
    flex-shrink: 0;
    font-size: 16px;
  }

  .error-message {
    color: #f44336;
    font-size: 14px;
    line-height: 1.5;
  }

  .button-row {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  button {
    flex: 1;
    padding: 12px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .save-button {
    background: #4CAF50;
    color: white;
  }

  .save-button:hover:not(:disabled) {
    background: #388E3C;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
  }

  .cancel-button {
    background: #555;
    color: white;
  }

  .cancel-button:hover:not(:disabled) {
    background: #666;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  /* Local LLM Section Styles */
  .local-llm-section {
    border-top: 1px solid #444;
    padding-top: 16px;
    margin-top: 16px;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #555;
    color: #ccc;
    margin-left: 8px;
  }

  .status-badge.loaded {
    background: #4CAF50;
    color: white;
  }

  .model-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .model-controls select {
    flex: 1;
  }

  .refresh-button {
    padding: 8px 12px;
    background: #555;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .refresh-button:hover:not(:disabled) {
    background: #666;
    transform: scale(1.1);
  }

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
    display: flex;
    align-items: center;
  }

  .browse-button {
    padding: 10px 16px;
    background: #555;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .browse-button:hover:not(:disabled) {
    background: #666;
    transform: translateY(-1px);
  }

  .browse-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .path-display {
    font-family: monospace;
    font-size: 12px;
    background: #2c2c2c;
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    word-break: break-all;
    margin-top: 8px;
    color: #aaa;
  }

  .button-group {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .primary-button {
    flex: 1;
    padding: 10px 16px;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .primary-button:hover:not(:disabled) {
    background: #1976D2;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
  }

  .secondary-button {
    flex: 1;
    padding: 10px 16px;
    background: #FF9800;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .secondary-button:hover:not(:disabled) {
    background: #F57C00;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
  }

  .hint.warning {
    color: #FF9800;
    font-weight: 500;
  }
</style>
