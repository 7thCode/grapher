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
let pendingClose = false

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Load...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('Load menu clicked, sending menu-load event')
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

    // Wait for page to load before opening DevTools
    win.webContents.on('did-finish-load', () => {
      console.log('Page loaded, opening DevTools...')
      win?.webContents.openDevTools()
    })
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  // Handle window close event - check for unsaved changes
  win.on('close', async (e) => {
    if (!win || pendingClose) return

    // Prevent default close
    e.preventDefault()

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
      // Cancel: do nothing
    } else {
      // No unsaved changes - close immediately
      win.destroy()
    }
  })

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

// Handle save-completed event from renderer
ipcMain.on('save-completed', () => {
  if (win) {
    win.destroy()
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
