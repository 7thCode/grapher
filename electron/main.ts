import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// ESM compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Electron main process
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Load SVG...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('Load SVG menu clicked, sending menu-load event')
            win?.webContents.send('menu-load')
          }
        },
        {
          label: 'Save SVG...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win?.webContents.send('menu-save')
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

    // Wait for page to load before opening DevTools
    win.webContents.on('did-finish-load', () => {
      console.log('Page loaded, opening DevTools...')
      win?.webContents.openDevTools()
    })
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

app.whenReady().then(() => {
  createMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
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

// IPC handler for saving SVG files
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
