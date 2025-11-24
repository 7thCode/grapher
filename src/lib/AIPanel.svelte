<script lang="ts">
  import { ClaudeAPI, type SVGGenerationResult as ClaudeSVGResult } from './ai/ClaudeAPI'
  import { OpenAIAPI, type SVGGenerationResult as OpenAISVGResult } from './ai/OpenAIAPI'
  import { LlamaAPI } from './ai/LlamaAPI'

  type SVGGenerationResult = ClaudeSVGResult | OpenAISVGResult

  interface Props {
    onApply: (svg: string) => void
    onCopy: (svg: string) => void
    onClose: () => void
    normalizeSVG: (svg: string) => string
  }

  let { onApply, onCopy, onClose, normalizeSVG }: Props = $props()

  // State
  let prompt = $state('')
  let generatedResult = $state<SVGGenerationResult | null>(null)
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let lastGenerateTime = $state(0)
  let availableProviders = $state<{ provider: 'openai' | 'anthropic' | 'llama'; key?: string }[]>([])
  let selectedProvider = $state<'openai' | 'anthropic' | 'llama' | null>(null)
  let loadedModelName = $state<string | null>(null)

  // Rate limiting: max 5 requests per minute
  const RATE_LIMIT_MS = 12000 // 12 seconds between requests
  const MAX_PROMPT_LENGTH = 1000

  // Character count
  const promptLength = $derived(prompt.length)
  const isPromptValid = $derived(prompt.trim().length > 0 && promptLength <= MAX_PROMPT_LENGTH)

  // Normalized SVG for preview (applies viewBox transformations)
  const normalizedSvg = $derived.by(() => {
    if (!generatedResult || !generatedResult.svg) return null
    try {
      return normalizeSVG(generatedResult.svg)
    } catch (err) {
      console.error('Failed to normalize SVG for preview:', err)
      return generatedResult.svg // Fallback to original
    }
  })

  // Rate limit check
  const canGenerate = $derived(() => {
    const now = Date.now()
    return now - lastGenerateTime >= RATE_LIMIT_MS
  })

  // Load available providers on mount
  $effect(() => {
    async function loadProviders() {
      try {
        const providers = await (window as any).electron.getAPIKey()
        availableProviders = providers

        // Always add Local LLM option (no API key required)
        availableProviders.push({ provider: 'llama' })

        // Load the currently loaded model name
        try {
          loadedModelName = await LlamaAPI.getLoadedModelName()
        } catch (err) {
          console.error('Failed to get loaded model name:', err)
          loadedModelName = null
        }

        // Select first available provider by default
        if (availableProviders.length > 0 && !selectedProvider) {
          selectedProvider = availableProviders[0].provider
        }
      } catch (err) {
        console.error('Failed to load providers:', err)
        // Even if API key loading fails, offer Local LLM
        availableProviders = [{ provider: 'llama' }]
        selectedProvider = 'llama'
      }
    }
    loadProviders()
  })

  async function handleGenerate() {
    if (!isPromptValid) return

    // Rate limiting
    if (!canGenerate()) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastGenerateTime)) / 1000)
      error = `レート制限: あと${waitTime}秒お待ちください`
      return
    }

    if (!selectedProvider) {
      error = 'LLMプロバイダーを選択してください'
      return
    }

    isLoading = true
    error = null
    generatedResult = null
    lastGenerateTime = Date.now()

    try {
      // Find the selected provider's API key
      const providerConfig = availableProviders.find(p => p.provider === selectedProvider)

      if (!providerConfig) {
        throw new Error('選択されたプロバイダーのAPIキーが見つかりません')
      }

      // Use the appropriate API based on the selected provider
      if (selectedProvider === 'openai') {
        const api = new OpenAIAPI(providerConfig.key!)
        generatedResult = await api.generateSVG(prompt)
      } else if (selectedProvider === 'anthropic') {
        const api = new ClaudeAPI(providerConfig.key!)
        generatedResult = await api.generateSVG(prompt)
      } else if (selectedProvider === 'llama') {
        // Local LLM - no API key required
        // Auto-load model if not already loaded
        const isLoaded = await LlamaAPI.isModelLoaded()
        if (!isLoaded) {
          const loaded = await LlamaAPI.autoLoadModel()
          if (!loaded) {
            throw new Error('ローカルLLMモデルが見つかりません。設定画面からモデルをダウンロードしてください。')
          }
        }

        const svg = await LlamaAPI.generateSVG(prompt)
        generatedResult = { svg, model: 'local-llm' }
      }
    } catch (err) {
      if (err instanceof Error) {
        error = err.message
      } else {
        error = '不明なエラーが発生しました'
      }
      console.error('SVG generation error:', err)
    } finally {
      isLoading = false
    }
  }

  function handleApply() {
    if (generatedResult && generatedResult.svg) {
      onApply(generatedResult.svg)
      handleClear()
    }
  }

  function handleCopy() {
    if (generatedResult && generatedResult.svg) {
      onCopy(generatedResult.svg)
      // Don't clear - allow multiple copies
      // Close the panel after copying
      onClose()
    }
  }

  function handleClear() {
    prompt = ''
    generatedResult = null
    error = null
  }

  function handleKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl + Enter to generate
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (isPromptValid && canGenerate()) {
        handleGenerate()
      }
    }
  }
</script>

<div class="ai-panel">
  <div class="header">
    <h3>🤖 AI画像生成</h3>
    <button class="close-button" onclick={onClose} title="閉じる (ESC)">×</button>
  </div>

  <div class="content">
    <!-- LLM Provider Selection -->
    {#if availableProviders.length > 1}
      <div class="provider-section">
        <label for="provider-select">LLMプロバイダー:</label>
        <select id="provider-select" bind:value={selectedProvider}>
          {#each availableProviders as provider}
            <option value={provider.provider}>
              {provider.provider === 'openai' ? 'OpenAI GPT-4o' :
               provider.provider === 'anthropic' ? 'Claude Sonnet 4.5' :
               loadedModelName ? `Local LLM (${loadedModelName})` : 'Local LLM (未ロード)'}
            </option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Prompt Input -->
    <div class="input-section">
      <label for="prompt-input">
        プロンプト:
        <span class="char-count" class:over-limit={promptLength > MAX_PROMPT_LENGTH}>
          {promptLength}/{MAX_PROMPT_LENGTH}
        </span>
      </label>
      <textarea
        id="prompt-input"
        bind:value={prompt}
        onkeydown={handleKeydown}
        placeholder="例: 青い円と赤い四角形を並べて描いて"
        rows="4"
        maxlength={MAX_PROMPT_LENGTH + 100}
      ></textarea>

      <div class="button-row">
        <button
          class="generate-button"
          onclick={handleGenerate}
          disabled={!isPromptValid || isLoading || !canGenerate()}
          title={canGenerate() ? 'Cmd/Ctrl + Enter' : 'レート制限中'}
        >
          {isLoading ? '生成中...' : '生成'}
        </button>
        <button
          class="clear-button"
          onclick={handleClear}
          disabled={isLoading}
        >
          クリア
        </button>
      </div>
    </div>

    <!-- Error Message -->
    {#if error}
      <div class="error">
        <span class="error-icon">❌</span>
        <span class="error-message">{error}</span>
      </div>
    {/if}

    <!-- Loading State -->
    {#if isLoading}
      <div class="preview loading">
        <div class="spinner"></div>
        <p class="loading-text">AI画像を生成中...</p>
        <p class="loading-subtext">少々お待ちください</p>
      </div>
    {/if}

    <!-- Generated SVG Preview -->
    {#if generatedResult && !isLoading}
      <div class="preview">
        <div class="preview-label">プレビュー:</div>
        <div class="svg-preview">
          {@html normalizedSvg}
        </div>
        <div class="button-row">
          <button class="apply-button" onclick={handleApply}>
            ✓ 適用
          </button>
          <button class="copy-button" onclick={handleCopy} title="クリップボードにコピーして、Cmd+Vで貼り付け">
            📋 コピー
          </button>
          <button class="regenerate-button" onclick={handleGenerate}>
            🔄 再生成
          </button>
        </div>
      </div>
    {/if}

    <!-- Instructions -->
    {#if !generatedResult && !isLoading && !error}
      <div class="instructions">
        <p><strong>使い方:</strong></p>
        <ul>
          <li>描きたい図形や色を日本語で説明</li>
          <li>Cmd/Ctrl + Enter で生成</li>
          <li>プレビューを確認してから適用</li>
        </ul>
        <p class="example"><em>例: 「赤い円と青い四角形を横に並べて」</em></p>
      </div>
    {/if}
  </div>
</div>

<style>
  .ai-panel {
    background: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    width: 420px;
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
    background: #d32f2f;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .close-button:hover {
    background: #b71c1c;
  }

  .content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .provider-section {
    margin-bottom: 16px;
  }

  .provider-section label {
    display: block;
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
    font-weight: 500;
  }

  .provider-section select {
    width: 100%;
    padding: 10px 12px;
    background: #1e1e1e;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .provider-section select:focus {
    outline: none;
    border-color: #2196F3;
  }

  .provider-section select option {
    background: #1e1e1e;
    color: #fff;
  }

  .input-section {
    margin-bottom: 16px;
  }

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
    font-weight: 500;
  }

  .char-count {
    font-size: 12px;
    color: #888;
  }

  .char-count.over-limit {
    color: #f44336;
    font-weight: 600;
  }

  textarea {
    width: 100%;
    padding: 12px;
    background: #1e1e1e;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    resize: vertical;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    box-sizing: border-box;
  }

  textarea:focus {
    outline: none;
    border-color: #2196F3;
  }

  .button-row {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  button {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .generate-button {
    background: #2196F3;
    color: white;
  }

  .generate-button:hover:not(:disabled) {
    background: #1976D2;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
  }

  .clear-button {
    background: #555;
    color: white;
  }

  .clear-button:hover:not(:disabled) {
    background: #666;
  }

  .apply-button {
    background: #4CAF50;
    color: white;
  }

  .apply-button:hover {
    background: #388E3C;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
  }

  .copy-button {
    background: #2196F3;
    color: white;
  }

  .copy-button:hover {
    background: #1976D2;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
  }

  .regenerate-button {
    background: #FF9800;
    color: white;
  }

  .regenerate-button:hover {
    background: #F57C00;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
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

  .preview {
    margin-top: 16px;
  }

  .preview.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 16px;
    background: #1e1e1e;
    border-radius: 4px;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #444;
    border-top-color: #2196F3;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    margin: 0;
    color: #fff;
    font-size: 16px;
    font-weight: 500;
  }

  .loading-subtext {
    margin: 0;
    color: #888;
    font-size: 13px;
  }

  .preview-label {
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
    font-weight: 500;
  }

  .svg-preview {
    min-height: 200px;
    max-height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 4px;
    padding: 16px;
    overflow: auto;
  }

  .svg-preview :global(svg) {
    max-width: 100%;
    max-height: 100%;
  }

  .instructions {
    padding: 16px;
    background: #1e1e1e;
    border-radius: 4px;
    border: 1px dashed #555;
  }

  .instructions p {
    margin: 0 0 12px 0;
    color: #ccc;
    font-size: 14px;
  }

  .instructions ul {
    margin: 0 0 12px 0;
    padding-left: 24px;
    color: #aaa;
    font-size: 13px;
  }

  .instructions li {
    margin-bottom: 6px;
  }

  .example {
    color: #888 !important;
    font-style: italic;
  }
</style>
