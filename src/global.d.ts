interface Window {
  ipcRenderer?: {
    on: (channel: string, listener: (...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
    removeAllListeners: (channel: string) => void
  }
  electron?: {
    getAPIKey: () => Promise<{ provider: 'openai' | 'anthropic'; key: string }[]>
    claudeApiRequest: (params: { apiKey: string; prompt: string }) => Promise<{ success: boolean; data?: any; error?: string }>
    openaiApiRequest: (params: { apiKey: string; prompt: string }) => Promise<{ success: boolean; data?: any; error?: string }>
  }
}
