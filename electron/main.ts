import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import Store from 'electron-store'
import { getLlamaManager } from './LlamaManager.js'
import { ModelManager } from './ModelManager.js'
import { ModelDownloader } from './ModelDownloader.js'
import presetModels from './preset-models.json'

// ESM compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Electron main process
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

// API Key storage schema
interface StoreSchema {
  openaiApiKey?: string
  anthropicApiKey?: string
}

// Initialize electron-store for persisting API keys
const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    openaiApiKey: undefined,
    anthropicApiKey: undefined
  }
})

// Initialize API keys from environment variables if not set
function initializeAPIKeys() {
  // Load from environment variables on first run or if not set
  if (!store.get('openaiApiKey') && process.env.OPENAI_API_KEY) {
    store.set('openaiApiKey', process.env.OPENAI_API_KEY)
    console.log('Initialized OpenAI API key from environment variable')
  }
  if (!store.get('anthropicApiKey') && process.env.ANTHROPIC_API_KEY) {
    store.set('anthropicApiKey', process.env.ANTHROPIC_API_KEY)
    console.log('Initialized Anthropic API key from environment variable')
  }
}

let win: BrowserWindow | null
let pendingClose = false

// Model Store instances
let modelManager: ModelManager | null = null
let modelDownloader: ModelDownloader | null = null

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Load...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            win?.webContents.send('menu-load')
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win?.webContents.send('menu-save')
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            win?.webContents.send('menu-save-as')
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            win?.webContents.send('menu-undo')
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            win?.webContents.send('menu-redo')
          }
        },
        { type: 'separator' },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            win?.webContents.send('menu-copy')
          }
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            win?.webContents.send('menu-paste')
          }
        },
        { type: 'separator' },
        {
          label: 'Bring to Front',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => {
            win?.webContents.send('menu-bring-to-front')
          }
        },
        {
          label: 'Bring Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => {
            win?.webContents.send('menu-bring-forward')
          }
        },
        {
          label: 'Send Backward',
          accelerator: 'CmdOrCtrl+[',
          click: () => {
            win?.webContents.send('menu-send-backward')
          }
        },
        {
          label: 'Send to Back',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => {
            win?.webContents.send('menu-send-to-back')
          }
        },
        { type: 'separator' },
        {
          label: 'Group',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            win?.webContents.send('menu-group')
          }
        },
        {
          label: 'Ungroup',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            win?.webContents.send('menu-ungroup')
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Option+I',
          click: () => {
            win?.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Open DevTools in development
    win.webContents.openDevTools()
  } else {
    // Use file:// protocol with proper path resolution
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  // Handle window close event - check for unsaved changes
  win.on('close', async (e) => {
    if (!win || pendingClose) return

    // Always prevent default first, then check if we should close
    e.preventDefault()

    try {
      // Ask renderer process if there are unsaved changes
      const response = await win.webContents.executeJavaScript(
        'window.isDirty !== undefined ? window.isDirty : false'
      )

      if (response === true) {
        // There are unsaved changes - show dialog
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
          // Save - wait for save-completed event
          pendingClose = true
          win.webContents.send('menu-save')
        } else if (choice.response === 1) {
          // Don't Save
          win.destroy()
        }
        // Cancel: do nothing (window stays open)
      } else {
        // No unsaved changes - close immediately
        win.destroy()
      }
    } catch (err) {
      console.error('Error checking isDirty:', err)
      // On error, close immediately
      win.destroy()
    }
  })

  win.on('closed', () => {
    win = null
  })
}

// Initialize Llama Manager with custom directory
function initializeLlamaManager() {
  const customDir = store.get('llamaModelsDirectory') as string | undefined
  if (customDir) {
    try {
      const llamaManager = getLlamaManager()
      llamaManager.setModelsDirectory(customDir)
      console.log('Restored custom models directory:', customDir)
    } catch (error) {
      console.warn('Failed to restore custom models directory:', error)
      // Remove invalid directory from store
      store.delete('llamaModelsDirectory')
    }
  }
}

// Initialize Model Manager
async function initializeModelManager() {
  try {
    // Get custom directory from store if exists
    const customDir = store.get('modelStoreDirectory') as string | undefined
    
    // Initialize ModelManager
    modelManager = new ModelManager(customDir)
    await modelManager.initialize()
    
    console.log('ModelManager initialized:', modelManager.getModelsDirectory())
  } catch (error) {
    console.error('Failed to initialize ModelManager:', error)
  }
}

app.whenReady().then(() => {
  // Initialize API keys from environment variables
  initializeAPIKeys()

  // Initialize Llama Manager with saved custom directory
  initializeLlamaManager()

  // Initialize Model Manager
  initializeModelManager()

  createMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  // Always quit when all windows are closed
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Handle save-completed event from renderer
ipcMain.on('save-completed', () => {
  if (pendingClose && win) {
    // Only close window if we were waiting for save before closing
    win.destroy()
  }
  // Reset pending close flag
  pendingClose = false
})

// IPC handler for loading SVG files
ipcMain.handle('load-svg', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load SVG File',
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (canceled || !filePaths || filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  try {
    const svgContent = fs.readFileSync(filePaths[0], 'utf-8')
    return { success: true, content: svgContent, filePath: filePaths[0] }
  } catch (error) {
    console.error('Error loading file:', error)
    return { success: false, error: String(error) }
  }
})

// IPC handler for saving SVG files (with dialog)
ipcMain.handle('save-svg', async (_event, svgContent: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save SVG File',
    defaultPath: 'drawing.svg',
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (canceled || !filePath) {
    return { success: false, canceled: true }
  }

  try {
    fs.writeFileSync(filePath, svgContent, 'utf-8')
    return { success: true, filePath }
  } catch (error) {
    console.error('Error saving file:', error)
    return { success: false, error: String(error) }
  }
})

// IPC handler for saving SVG files directly (without dialog)
ipcMain.handle('save-svg-direct', async (_event, svgContent: string, filePath: string) => {
  try {
    fs.writeFileSync(filePath, svgContent, 'utf-8')
    return { success: true, filePath }
  } catch (error) {
    console.error('Error saving file:', error)
    return { success: false, error: String(error) }
  }
})

// IPC handler for getting API keys from storage
ipcMain.handle('get-api-key', () => {
  // Return all available API keys from storage
  const openaiKey = store.get('openaiApiKey')
  const anthropicKey = store.get('anthropicApiKey')

  const providers: { provider: 'openai' | 'anthropic'; key: string }[] = []

  if (openaiKey) {
    providers.push({ provider: 'openai', key: openaiKey })
  }
  if (anthropicKey) {
    providers.push({ provider: 'anthropic', key: anthropicKey })
  }

  if (providers.length === 0) {
    throw new Error('No API key found. Please set API keys in Settings')
  }

  return providers
})

// IPC handler for setting API keys
ipcMain.handle('set-api-key', (_event, { provider, key }: { provider: 'openai' | 'anthropic'; key: string }) => {
  if (provider === 'openai') {
    store.set('openaiApiKey', key)
  } else if (provider === 'anthropic') {
    store.set('anthropicApiKey', key)
  }
  return { success: true }
})

// IPC handler for deleting API key
ipcMain.handle('delete-api-key', (_event, provider: 'openai' | 'anthropic') => {
  if (provider === 'openai') {
    store.delete('openaiApiKey')
  } else if (provider === 'anthropic') {
    store.delete('anthropicApiKey')
  }
  return { success: true }
})

// IPC handler for Claude API requests (avoid CORS in renderer)
ipcMain.handle('claude-api-request', async (_event, { apiKey, prompt }: { apiKey: string; prompt: string }) => {
  const API_URL = 'https://api.anthropic.com/v1/messages'
  const MODEL = 'claude-sonnet-4-5-20250929'
  const API_VERSION = '2023-06-01'

  const systemPrompt = `あなたはSVGコード生成の専門家です。ユーザーのプロンプトから、完全で有効なSVGコードを生成してください。

重要なルール:
1. 必ず完全なSVGタグ構造を出力 (<svg>...</svg>)
2. viewBox属性を適切に設定 (例: viewBox="0 0 400 300")
3. width="100%" height="100%" を設定して親要素にフィット
4. ユーザーが指定した色や形状を正確に反映
5. シンプルで読みやすいコードを生成
6. コメントや説明文は不要、SVGコードのみ出力
7. マークダウンのコードブロック(\`\`\`svg)で囲まない、生のSVGコードのみ

出力例:
<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="50" fill="blue"/>
  <rect x="200" y="50" width="100" height="100" fill="red"/>
</svg>`

  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          temperature: 1.0,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const status = response.status

        // Retry on 429 (rate limit) or 529 (overloaded)
        if ((status === 429 || status === 529) && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000
          console.warn(`Claude API ${status} error, retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        throw new Error(`API Error (${status}): ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000
        console.warn(`Claude API request failed, retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  return { success: false, error: lastError?.message || 'Unknown error' }
})

// IPC handler for OpenAI API requests (avoid CORS in renderer)
ipcMain.handle('openai-api-request', async (_event, { apiKey, prompt }: { apiKey: string; prompt: string }) => {
  const API_URL = 'https://api.openai.com/v1/chat/completions'
  const MODEL = 'gpt-4o'

  const systemPrompt = `あなたはSVGコード生成の専門家です。ユーザーのプロンプトから、完全で有効なSVGコードを生成してください。

重要なルール:
1. 必ず完全なSVGタグ構造を出力 (<svg>...</svg>)
2. viewBox属性を適切に設定 (例: viewBox="0 0 400 300")
3. width="100%" height="100%" を設定して親要素にフィット
4. ユーザーが指定した色や形状を正確に反映
5. シンプルで読みやすいコードを生成
6. コメントや説明文は不要、SVGコードのみ出力
7. マークダウンのコードブロック(\`\`\`svg)で囲まない、生のSVGコードのみ

出力例:
<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="50" fill="blue"/>
  <rect x="200" y="50" width="100" height="100" fill="red"/>
</svg>`

  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_completion_tokens: 4096,
          temperature: 1.0
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const status = response.status

        // Retry on 429, 500, 503
        if ((status === 429 || status === 500 || status === 503) && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000
          console.warn(`OpenAI API ${status} error, retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        throw new Error(`API Error (${status}): ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000
        console.warn(`OpenAI API request failed, retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  return { success: false, error: lastError?.message || 'Unknown error' }
})

// ============================================================================
// Local LLM (Llama) IPC Handlers
// ============================================================================

// List available local models
ipcMain.handle('llama-list-models', async () => {
  try {
    const llamaManager = getLlamaManager()
    const models = llamaManager.listModels()
    return { success: true, models }
  } catch (error) {
    console.error('Error listing models:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error), models: [] }
  }
})

// Load a local model
ipcMain.handle('llama-load-model', async (_event, modelName?: string) => {
  try {
    const llamaManager = getLlamaManager()
    await llamaManager.loadModel(modelName)
    return { success: true }
  } catch (error) {
    console.error('Error loading model:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Unload the current model
ipcMain.handle('llama-unload-model', async () => {
  try {
    const llamaManager = getLlamaManager()
    await llamaManager.unloadModel()
    return { success: true }
  } catch (error) {
    console.error('Error unloading model:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Check if a model is loaded
ipcMain.handle('llama-is-model-loaded', async () => {
  try {
    const llamaManager = getLlamaManager()
    const isLoaded = llamaManager.isModelLoaded()
    return { success: true, isLoaded }
  } catch (error) {
    console.error('Error checking model status:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error), isLoaded: false }
  }
})

// Generate SVG using local LLM
ipcMain.handle('llama-generate-svg', async (_event, prompt: string) => {
  try {
    const llamaManager = getLlamaManager()
    const svg = await llamaManager.generateSVG(prompt)
    return { success: true, svg }
  } catch (error) {
    console.error('Error generating SVG:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Get models directory path
ipcMain.handle('llama-get-models-dir', async () => {
  try {
    const llamaManager = getLlamaManager()
    const modelsDir = llamaManager.getModelsDirectory()
    return { success: true, path: modelsDir }
  } catch (error) {
    console.error('Error getting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Update Llama configuration
ipcMain.handle('llama-update-config', async (_event, config: { contextSize?: number; gpuLayers?: number }) => {
  try {
    const llamaManager = getLlamaManager()
    llamaManager.updateConfig(config)
    return { success: true }
  } catch (error) {
    console.error('Error updating config:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Get Llama configuration
ipcMain.handle('llama-get-config', async () => {
  try {
    const llamaManager = getLlamaManager()
    const config = llamaManager.getConfig()
    return { success: true, config }
  } catch (error) {
    console.error('Error getting config:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Get loaded model name
ipcMain.handle('llama-get-loaded-model-name', async () => {
  try {
    const llamaManager = getLlamaManager()
    const modelName = llamaManager.getLoadedModelName()
    return { success: true, modelName }
  } catch (error) {
    console.error('Error getting loaded model name:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Select models directory with dialog
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
    console.error('Error selecting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Set models directory
ipcMain.handle('llama-set-models-dir', async (_event, dirPath: string) => {
  try {
    const llamaManager = getLlamaManager()
    llamaManager.setModelsDirectory(dirPath)
    // Save to electron-store for persistence
    store.set('llamaModelsDirectory', dirPath)
    return { success: true }
  } catch (error) {
    console.error('Error setting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// ========================================
// Model Store IPC Handlers
// ========================================

// Get preset models list
ipcMain.handle('model-store:get-preset-models', async () => {
  try {
    return { success: true, models: presetModels.models }
  } catch (error) {
    console.error('Error getting preset models:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// List installed models
ipcMain.handle('model-store:list-models', async () => {
  try {
    if (!modelManager) {
      return { success: false, error: 'ModelManager not initialized' }
    }
    const models = await modelManager.listModels()
    return { success: true, models }
  } catch (error) {
    console.error('Error listing models:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Start model download
ipcMain.handle('model-store:start-download', async (_event, modelId: string) => {
  try {
    if (!win || !modelManager) {
      return { success: false, error: 'ModelManager or Window not initialized' }
    }

    // Find the preset model
    const presetModel = presetModels.models.find(m => m.id === modelId)
    if (!presetModel) {
      return { success: false, error: 'Preset model not found' }
    }

    // Create ModelDownloader instance if needed
    if (!modelDownloader) {
      modelDownloader = new ModelDownloader(win, modelManager.getModelsDirectory())
    }

    const result = await modelDownloader.downloadModel(presetModel as any)
    return result
  } catch (error) {
    console.error('Error starting download:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Cancel download
ipcMain.handle('model-store:cancel-download', async (_event, downloadId: string) => {
  try {
    if (!modelDownloader) {
      return { success: false, error: 'No active downloads' }
    }
    return modelDownloader.cancelDownload(downloadId)
  } catch (error) {
    console.error('Error canceling download:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Delete model
ipcMain.handle('model-store:delete-model', async (_event, modelId: string) => {
  try {
    if (!modelManager) {
      return { success: false, error: 'ModelManager not initialized' }
    }
    return await modelManager.deleteModel(modelId)
  } catch (error) {
    console.error('Error deleting model:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Add model from file
ipcMain.handle('model-store:add-model', async () => {
  try {
    if (!modelManager) {
      return { success: false, error: 'ModelManager not initialized' }
    }

    const result = await dialog.showOpenDialog({
      title: 'Select GGUF Model File',
      properties: ['openFile'],
      filters: [
        { name: 'GGUF Models', extensions: ['gguf'] }
      ]
    })

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    return await modelManager.addModel(result.filePaths[0])
  } catch (error) {
    console.error('Error adding model:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Get models directory
ipcMain.handle('model-store:get-models-dir', async () => {
  try {
    if (!modelManager) {
      return { success: false, error: 'ModelManager not initialized' }
    }
    const path = modelManager.getModelsDirectory()
    return { success: true, path }
  } catch (error) {
    console.error('Error getting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Select models directory
ipcMain.handle('model-store:select-models-dir', async () => {
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
    console.error('Error selecting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Set models directory
ipcMain.handle('model-store:set-models-dir', async (_event, dirPath: string) => {
  try {
    if (!modelManager) {
      return { success: false, error: 'ModelManager not initialized' }
    }

    modelManager.setModelsDirectory(dirPath)
    
    // Update ModelDownloader if it exists
    if (modelDownloader) {
      modelDownloader.setModelsDirectory(dirPath)
    }

    // Save to electron-store for persistence
    store.set('modelStoreDirectory', dirPath)
    
    return { success: true }
  } catch (error) {
    console.error('Error setting models directory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
