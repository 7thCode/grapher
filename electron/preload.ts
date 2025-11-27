const { ipcRenderer, contextBridge } = require('electron')

console.log('=== PRELOAD SCRIPT STARTING ===')

// Use contextBridge to safely expose ipcRenderer
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel, listener) => {
    console.log('IPC on() called for channel:', channel)
    // Wrap the listener to match Electron's IPC signature
    const wrappedListener = (event, ...args) => {
      console.log('IPC event received for channel:', channel, 'args:', args)
      listener(...args)
    }
    ipcRenderer.on(channel, wrappedListener)
  },
  send: (channel, ...args) => {
    console.log('IPC send() called for channel:', channel)
    ipcRenderer.send(channel, ...args)
  },
  invoke: (channel, ...args) => {
    console.log('IPC invoke() called for channel:', channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  removeAllListeners: (channel) => {
    console.log('IPC removeAllListeners() called for channel:', channel)
    ipcRenderer.removeAllListeners(channel)
  }
})

// Expose AI-related APIs
contextBridge.exposeInMainWorld('electron', {
  getAPIKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (params: { provider: 'openai' | 'anthropic'; key: string }) => ipcRenderer.invoke('set-api-key', params),
  deleteApiKey: (provider: 'openai' | 'anthropic') => ipcRenderer.invoke('delete-api-key', provider),
  claudeApiRequest: (params: { apiKey: string; prompt: string }) => ipcRenderer.invoke('claude-api-request', params),
  openaiApiRequest: (params: { apiKey: string; prompt: string }) => ipcRenderer.invoke('openai-api-request', params),

  // Local LLM (Llama) APIs
  llamaListModels: () => ipcRenderer.invoke('llama-list-models'),
  llamaLoadModel: (modelName?: string) => ipcRenderer.invoke('llama-load-model', modelName),
  llamaUnloadModel: () => ipcRenderer.invoke('llama-unload-model'),
  llamaIsModelLoaded: () => ipcRenderer.invoke('llama-is-model-loaded'),
  llamaGenerateSVG: (prompt: string) => ipcRenderer.invoke('llama-generate-svg', prompt),
  llamaGetModelsDir: () => ipcRenderer.invoke('llama-get-models-dir'),
  llamaUpdateConfig: (config: { contextSize?: number; gpuLayers?: number }) => ipcRenderer.invoke('llama-update-config', config),
  llamaGetConfig: () => ipcRenderer.invoke('llama-get-config'),
  llamaGetLoadedModelName: () => ipcRenderer.invoke('llama-get-loaded-model-name'),
  llamaSelectModelsDir: () => ipcRenderer.invoke('llama-select-models-dir'),
  llamaSetModelsDir: (dirPath: string) => ipcRenderer.invoke('llama-set-models-dir', dirPath),

  // Model Store APIs
  modelStoreGetPresetModels: () => ipcRenderer.invoke('model-store:get-preset-models'),
  modelStoreListModels: () => ipcRenderer.invoke('model-store:list-models'),
  modelStoreStartDownload: (modelId: string) => ipcRenderer.invoke('model-store:start-download', modelId),
  modelStoreCancelDownload: (downloadId: string) => ipcRenderer.invoke('model-store:cancel-download', downloadId),
  modelStoreDeleteModel: (modelId: string) => ipcRenderer.invoke('model-store:delete-model', modelId),
  modelStoreAddModel: () => ipcRenderer.invoke('model-store:add-model'),
  modelStoreGetModelsDir: () => ipcRenderer.invoke('model-store:get-models-dir'),
  modelStoreSelectModelsDir: () => ipcRenderer.invoke('model-store:select-models-dir'),
  modelStoreSetModelsDir: (dirPath: string) => ipcRenderer.invoke('model-store:set-models-dir', dirPath),
  
  // Download events
  onDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('download:progress', (_event, data) => callback(data))
  },
  onDownloadComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('download:complete', (_event, data) => callback(data))
  },
  onDownloadError: (callback: (data: any) => void) => {
    ipcRenderer.on('download:error', (_event, data) => callback(data))
  }
})

console.log('=== PRELOAD SCRIPT COMPLETED ===')
