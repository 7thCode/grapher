/**
 * GGUF モデルファイル管理
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

const MODELS_DIR = path.join(app.getPath('userData'), 'models')

export interface ModelInfo {
  id: string
  name: string
  path: string
  size: number
}

export class ModelManager {
  private modelsDir: string

  constructor(customModelsDir?: string) {
    this.modelsDir = customModelsDir || MODELS_DIR
  }

  /**
   * 初期化（モデルディレクトリを作成）
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true })
      console.log('Models directory initialized:', this.modelsDir)
    } catch (error) {
      console.error('Failed to initialize models directory:', error)
      throw error
    }
  }

  /**
   * モデルディレクトリを変更
   */
  setModelsDirectory(newDir: string): void {
    this.modelsDir = newDir
  }

  /**
   * 現在のモデルディレクトリを取得
   */
  getModelsDirectory(): string {
    return this.modelsDir
  }

  /**
   * インストール済みモデルのリストを取得
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const files = await fs.readdir(this.modelsDir)
      const ggufFiles = files.filter(file => file.endsWith('.gguf'))

      const models: ModelInfo[] = []
      for (const file of ggufFiles) {
        const filePath = path.join(this.modelsDir, file)
        const stats = await fs.stat(filePath)

        models.push({
          id: file,
          name: file.replace('.gguf', ''),
          path: filePath,
          size: stats.size
        })
      }

      return models
    } catch (error) {
      console.error('Failed to list models:', error)
      return []
    }
  }

  /**
   * モデルファイルを追加（ファイル選択ダイアログから）
   */
  async addModel(sourcePath: string): Promise<{ success: boolean; modelId?: string; error?: string }> {
    try {
      const fileName = path.basename(sourcePath)
      
      if (!fileName.endsWith('.gguf')) {
        return { success: false, error: 'Invalid file type. Only .gguf files are supported.' }
      }

      const targetPath = path.join(this.modelsDir, fileName)

      // ファイルが既に存在するかチェック
      try {
        await fs.access(targetPath)
        return { success: false, error: 'Model already exists' }
      } catch {
        // ファイルが存在しない場合は続行
      }

      // ファイルをコピー
      await fs.copyFile(sourcePath, targetPath)

      return { success: true, modelId: fileName }
    } catch (error: any) {
      console.error('Failed to add model:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * モデルを削除
   */
  async deleteModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const modelPath = path.join(this.modelsDir, modelId)
      await fs.unlink(modelPath)
      return { success: true }
    } catch (error: any) {
      console.error('Failed to delete model:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * モデルの存在確認
   */
  async modelExists(modelId: string): Promise<boolean> {
    try {
      const modelPath = path.join(this.modelsDir, modelId)
      await fs.access(modelPath)
      return true
    } catch {
      return false
    }
  }
}
