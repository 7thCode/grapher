// Electron IPC utilities
// Safe wrapper for accessing electron APIs in renderer process

interface SaveSVGResult {
  success: boolean
  filePath?: string
  canceled?: boolean
  error?: string
}

export async function saveSVGFile(svgContent: string): Promise<SaveSVGResult> {
  // Check if running in Electron environment
  try {
    // vite-plugin-electron-renderer enables direct require
    if (typeof window !== 'undefined' && typeof (window as any).require === 'function') {
      const { ipcRenderer } = (window as any).require('electron')
      console.log('Electron IPC available, invoking save-svg')
      const result = await ipcRenderer.invoke('save-svg', svgContent)
      return result
    }
  } catch (error) {
    console.error('Error accessing Electron IPC:', error)
  }

  // Fallback for browser environment
  console.warn('Not running in Electron - falling back to clipboard')
  try {
    await navigator.clipboard.writeText(svgContent)
    return { success: true, filePath: 'clipboard' }
  } catch (error) {
    return { success: false, error: 'Clipboard access denied' }
  }
}

// Type declarations for window.electron
declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>
      }
    }
  }
}
