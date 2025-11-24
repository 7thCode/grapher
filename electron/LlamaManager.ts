import { getLlama, LlamaChatSession } from 'node-llama-cpp'
import type { Llama, LlamaModel, LlamaContext } from 'node-llama-cpp'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface LlamaConfig {
  modelPath?: string
  contextSize?: number
  gpuLayers?: number
}

export class LlamaManager {
  private llama: Llama | null = null
  private model: LlamaModel | null = null
  private context: LlamaContext | null = null
  private session: LlamaChatSession | null = null
  private config: LlamaConfig
  private isLoading = false
  private customModelsDir: string | null = null
  private loadedModelName: string | null = null

  constructor(config: LlamaConfig = {}) {
    this.config = {
      contextSize: 4096,
      gpuLayers: 0, // 0 = CPU only, increase for GPU acceleration
      ...config
    }
  }

  /**
   * Get the models directory path
   */
  private getModelsDir(): string {
    // Use custom directory if set, otherwise use default
    if (this.customModelsDir && fs.existsSync(this.customModelsDir)) {
      return this.customModelsDir
    }

    const userDataPath = app.getPath('userData')
    const modelsDir = path.join(userDataPath, 'models')

    // Create models directory if it doesn't exist
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
    }

    return modelsDir
  }

  /**
   * Set custom models directory
   */
  public setModelsDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`)
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`)
    }

    this.customModelsDir = dirPath
  }

  /**
   * List available models in the models directory
   */
  public listModels(): string[] {
    const modelsDir = this.getModelsDir()

    if (!fs.existsSync(modelsDir)) {
      return []
    }

    const files = fs.readdirSync(modelsDir)
    return files.filter(file => file.endsWith('.gguf'))
  }

  /**
   * Load a model
   */
  public async loadModel(modelName?: string): Promise<void> {
    if (this.isLoading) {
      throw new Error('Model is already loading')
    }

    this.isLoading = true

    try {
      // Determine model path
      let modelPath: string

      if (modelName) {
        const modelsDir = this.getModelsDir()
        modelPath = path.join(modelsDir, modelName)
      } else if (this.config.modelPath) {
        modelPath = this.config.modelPath
      } else {
        // Try to find the first available model
        const models = this.listModels()
        if (models.length === 0) {
          throw new Error('No models found. Please download a model first.')
        }
        const modelsDir = this.getModelsDir()
        modelPath = path.join(modelsDir, models[0])
      }

      // Check if model file exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`)
      }

      console.log('Loading model:', modelPath)

      // Initialize Llama instance (v3 API)
      if (!this.llama) {
        this.llama = await getLlama()
      }

      // Load the model
      this.model = await this.llama.loadModel({
        modelPath,
        gpuLayers: this.config.gpuLayers
      })

      // Create context
      this.context = await this.model.createContext({
        contextSize: this.config.contextSize
      })

      // Create chat session
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence()
      })

      // Store the loaded model name
      this.loadedModelName = path.basename(modelPath)

      console.log('Model loaded successfully')
    } catch (error) {
      console.error('Error loading model:', error)
      this.model = null
      this.context = null
      this.session = null
      this.loadedModelName = null
      throw error
    } finally {
      this.isLoading = false
    }
  }

  /**
   * Unload the current model
   */
  public async unloadModel(): Promise<void> {
    // Clear session reference
    if (this.session) {
      this.session = null
    }

    // Dispose context
    if (this.context) {
      await this.context.dispose()
      this.context = null
    }

    // Dispose model
    if (this.model) {
      await this.model.dispose()
      this.model = null
    }

    // Clear loaded model name
    this.loadedModelName = null

    console.log('Model unloaded')
  }

  /**
   * Check if a model is loaded
   */
  public isModelLoaded(): boolean {
    return this.model !== null && this.context !== null && this.session !== null
  }

  /**
   * Generate SVG from a text prompt
   */
  public async generateSVG(prompt: string): Promise<string> {
    if (!this.session) {
      throw new Error('No model loaded. Please load a model first.')
    }

    const systemPrompt = `You are an SVG graphics expert. Generate valid SVG code based on user descriptions.

IMPORTANT RULES:
1. Output ONLY valid SVG code wrapped in <svg> tags
2. Include viewBox="0 0 800 600" attribute
3. Use semantic shapes: <rect>, <circle>, <ellipse>, <path>, <line>, <polygon>
4. Add colors using fill and stroke attributes
5. Keep coordinates positive (0 or greater)
6. Do NOT include any explanatory text outside the <svg> tags
7. Do NOT use markdown code blocks

Example output format:
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <circle cx="400" cy="300" r="100" fill="#FF6B6B" />
  <rect x="200" y="150" width="400" height="300" fill="none" stroke="#4ECDC4" stroke-width="2" />
</svg>`

    const fullPrompt = `${systemPrompt}

User request: ${prompt}

SVG code:`

    console.log('Generating SVG for prompt:', prompt)

    const response = await this.session.prompt(fullPrompt, {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    })

    console.log('Raw response:', response)

    // Extract SVG from response
    const svgMatch = response.match(/<svg[\s\S]*?<\/svg>/i)
    if (!svgMatch) {
      throw new Error('Failed to generate valid SVG. Response did not contain SVG tags.')
    }

    const svg = svgMatch[0]
    console.log('Extracted SVG:', svg)

    return svg
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<LlamaConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  public getConfig(): LlamaConfig {
    return { ...this.config }
  }

  /**
   * Get models directory path (public accessor)
   */
  public getModelsDirectory(): string {
    return this.getModelsDir()
  }

  /**
   * Get the name of the currently loaded model
   */
  public getLoadedModelName(): string | null {
    return this.loadedModelName
  }
}

// Singleton instance
let llamaManager: LlamaManager | null = null

export function getLlamaManager(): LlamaManager {
  if (!llamaManager) {
    llamaManager = new LlamaManager()
  }
  return llamaManager
}
