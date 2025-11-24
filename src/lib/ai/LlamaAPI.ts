/**
 * LlamaAPI - Renderer process wrapper for local LLM operations
 *
 * This class provides a clean interface for the renderer process to interact
 * with the local LLM (node-llama-cpp) running in the main process.
 */

export interface LlamaConfig {
  contextSize?: number
  gpuLayers?: number
}

export interface LlamaResponse {
  success: boolean
  error?: string
}

export interface LlamaListModelsResponse extends LlamaResponse {
  models: string[]
}

export interface LlamaIsLoadedResponse extends LlamaResponse {
  isLoaded: boolean
}

export interface LlamaGenerateSVGResponse extends LlamaResponse {
  svg?: string
}

export interface LlamaGetModelsDirResponse extends LlamaResponse {
  path?: string
}

export interface LlamaGetConfigResponse extends LlamaResponse {
  config?: LlamaConfig
}

export interface LlamaGetLoadedModelNameResponse extends LlamaResponse {
  modelName?: string | null
}

export class LlamaAPI {
  private static getElectron() {
    if (typeof window === 'undefined' || !(window as any).electron) {
      throw new Error('Electron API is not available')
    }
    return (window as any).electron
  }

  /**
   * List available local models in the models directory
   */
  static async listModels(): Promise<string[]> {
    const electron = this.getElectron()
    const result: LlamaListModelsResponse = await electron.llamaListModels()

    if (!result.success) {
      throw new Error(result.error || 'Failed to list models')
    }

    return result.models
  }

  /**
   * Load a specific model or the first available model
   * @param modelName - Optional model filename (e.g., "llama-3.2-3b.gguf")
   */
  static async loadModel(modelName?: string): Promise<void> {
    const electron = this.getElectron()
    const result: LlamaResponse = await electron.llamaLoadModel(modelName)

    if (!result.success) {
      throw new Error(result.error || 'Failed to load model')
    }
  }

  /**
   * Unload the currently loaded model
   */
  static async unloadModel(): Promise<void> {
    const electron = this.getElectron()
    const result: LlamaResponse = await electron.llamaUnloadModel()

    if (!result.success) {
      throw new Error(result.error || 'Failed to unload model')
    }
  }

  /**
   * Check if a model is currently loaded
   */
  static async isModelLoaded(): Promise<boolean> {
    const electron = this.getElectron()
    const result: LlamaIsLoadedResponse = await electron.llamaIsModelLoaded()

    if (!result.success) {
      throw new Error(result.error || 'Failed to check model status')
    }

    return result.isLoaded
  }

  /**
   * Generate SVG code from a text prompt using the local LLM
   * @param prompt - User's text description of the desired SVG image
   * @returns SVG code as a string
   */
  static async generateSVG(prompt: string): Promise<string> {
    const electron = this.getElectron()
    const result: LlamaGenerateSVGResponse = await electron.llamaGenerateSVG(prompt)

    if (!result.success || !result.svg) {
      throw new Error(result.error || 'Failed to generate SVG')
    }

    return result.svg
  }

  /**
   * Get the path to the models directory
   */
  static async getModelsDirectory(): Promise<string> {
    const electron = this.getElectron()
    const result: LlamaGetModelsDirResponse = await electron.llamaGetModelsDir()

    if (!result.success || !result.path) {
      throw new Error(result.error || 'Failed to get models directory')
    }

    return result.path
  }

  /**
   * Update Llama configuration
   * @param config - Configuration options (contextSize, gpuLayers)
   */
  static async updateConfig(config: LlamaConfig): Promise<void> {
    const electron = this.getElectron()
    const result: LlamaResponse = await electron.llamaUpdateConfig(config)

    if (!result.success) {
      throw new Error(result.error || 'Failed to update config')
    }
  }

  /**
   * Get current Llama configuration
   */
  static async getConfig(): Promise<LlamaConfig> {
    const electron = this.getElectron()
    const result: LlamaGetConfigResponse = await electron.llamaGetConfig()

    if (!result.success || !result.config) {
      throw new Error(result.error || 'Failed to get config')
    }

    return result.config
  }

  /**
   * Get the name of the currently loaded model
   */
  static async getLoadedModelName(): Promise<string | null> {
    const electron = this.getElectron()
    const result: LlamaGetLoadedModelNameResponse = await electron.llamaGetLoadedModelName()

    if (!result.success) {
      throw new Error(result.error || 'Failed to get loaded model name')
    }

    return result.modelName ?? null
  }

  /**
   * Auto-load the first available model if none is loaded
   */
  static async autoLoadModel(): Promise<boolean> {
    try {
      // Check if already loaded
      const isLoaded = await this.isModelLoaded()
      if (isLoaded) {
        console.log('Model already loaded')
        return true
      }

      // List available models
      const models = await this.listModels()
      if (models.length === 0) {
        console.warn('No models found in models directory')
        return false
      }

      // Load the first model
      console.log(`Loading model: ${models[0]}`)
      await this.loadModel(models[0])
      console.log('Model loaded successfully')
      return true
    } catch (error) {
      console.error('Error in autoLoadModel:', error)
      return false
    }
  }

  /**
   * Open directory picker to select models directory
   */
  static async selectModelsDirectory(): Promise<string | null> {
    const electron = this.getElectron()
    const result = await electron.llamaSelectModelsDir()

    if (!result.success || result.canceled) {
      return null
    }

    return result.path || null
  }

  /**
   * Set custom models directory
   */
  static async setModelsDirectory(dirPath: string): Promise<void> {
    const electron = this.getElectron()
    const result: LlamaResponse = await electron.llamaSetModelsDir(dirPath)

    if (!result.success) {
      throw new Error(result.error || 'Failed to set models directory')
    }
  }
}
