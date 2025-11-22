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
  claudeApiRequest: (params: { apiKey: string; prompt: string }) => ipcRenderer.invoke('claude-api-request', params),
  openaiApiRequest: (params: { apiKey: string; prompt: string }) => ipcRenderer.invoke('openai-api-request', params)
})

console.log('=== PRELOAD SCRIPT COMPLETED ===')
