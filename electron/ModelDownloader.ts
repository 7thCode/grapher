/**
 * HuggingFace モデルダウンロード管理
 */

import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'

interface PresetModel {
  id: string
  name: string
  author: string
  size: number
  memoryRequired: number
  quantization: string
  license: string
  licenseUrl: string
  commercial: boolean
  downloadUrl: string
  tags: string[]
  description: string
}

interface DownloadState {
  id: string
  modelId: string
  status: 'downloading' | 'cancelled'
}

export class ModelDownloader {
  private win: BrowserWindow
  private modelsDir: string
  private activeDownloads: Map<string, DownloadState>

  constructor(win: BrowserWindow, modelsDir: string) {
    this.win = win
    this.modelsDir = modelsDir
    this.activeDownloads = new Map()
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
   * モデルのダウンロードを開始
   */
  async downloadModel(modelConfig: PresetModel): Promise<{ success: boolean; filePath?: string; downloadId?: string; error?: string }> {
    const downloadId = randomUUID()
    const fileName = `${modelConfig.id}.gguf`
    const tempPath = path.join(this.modelsDir, `${fileName}.part`)
    const finalPath = path.join(this.modelsDir, fileName)

    // 既にダウンロード済みかチェック
    if (fs.existsSync(finalPath)) {
      return { success: false, error: 'Model already downloaded' }
    }

    // ダウンロード状態を記録
    const downloadState: DownloadState = {
      id: downloadId,
      modelId: modelConfig.id,
      status: 'downloading'
    }
    this.activeDownloads.set(downloadId, downloadState)

    try {
      await this._performDownload(downloadId, modelConfig, tempPath, finalPath)
      return { success: true, filePath: finalPath, downloadId }
    } catch (error: any) {
      // エラー時は一時ファイルを削除
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
      this.activeDownloads.delete(downloadId)
      return { success: false, error: error.message }
    }
  }

  /**
   * 実際のダウンロード処理
   */
  private _performDownload(downloadId: string, modelConfig: PresetModel, tempPath: string, finalPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath)
      let downloadedBytes = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let totalBytes = 0

      const downloadState = this.activeDownloads.get(downloadId)

      const request = https.get(modelConfig.downloadUrl, { timeout: 30000 }, (response) => {
        // リダイレクトの処理
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close()
          fs.unlinkSync(tempPath)

          const redirectUrl = response.headers.location
          if (redirectUrl) {
            modelConfig.downloadUrl = redirectUrl

            // リダイレクト先で再試行
            this._performDownload(downloadId, modelConfig, tempPath, finalPath)
              .then(resolve)
              .catch(reject)
          } else {
            reject(new Error('Redirect without location header'))
          }
          return
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(tempPath)
          reject(new Error(`Download failed with status code: ${response.statusCode}`))
          return
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10)

        response.on('data', (chunk: Buffer) => {
          // キャンセルチェック
          if (downloadState?.status === 'cancelled') {
            request.destroy()
            response.destroy()
            file.close()
            fs.unlinkSync(tempPath)
            reject(new Error('Download cancelled by user'))
            return
          }

          downloadedBytes += chunk.length
          file.write(chunk)

          // プログレス更新（1秒ごと）
          const now = Date.now()
          if (now - lastTime >= 1000) {
            const timeDelta = (now - lastTime) / 1000
            const bytesDelta = downloadedBytes - lastBytes
            const speed = bytesDelta / timeDelta
            const eta = speed > 0 ? (totalBytes - downloadedBytes) / speed : 0
            const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0

            this.win.webContents.send('download:progress', {
              downloadId,
              modelId: modelConfig.id,
              bytesDownloaded: downloadedBytes,
              totalBytes,
              percentage,
              speed,
              eta
            })

            lastTime = now
            lastBytes = downloadedBytes
          }
        })

        response.on('end', () => {
          file.end(() => {
            // ファイルを最終的な場所に移動
            fs.renameSync(tempPath, finalPath)

            this.win.webContents.send('download:complete', {
              downloadId,
              modelId: modelConfig.id,
              filePath: finalPath
            })

            this.activeDownloads.delete(downloadId)
            resolve()
          })
        })

        response.on('error', (err) => {
          file.close()
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath)
          }

          this.win.webContents.send('download:error', {
            downloadId,
            modelId: modelConfig.id,
            error: err.message
          })

          this.activeDownloads.delete(downloadId)
          reject(err)
        })
      })

      request.on('error', (err) => {
        file.close()
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath)
        }

        this.win.webContents.send('download:error', {
          downloadId,
          modelId: modelConfig.id,
          error: err.message
        })

        this.activeDownloads.delete(downloadId)
        reject(err)
      })

      request.on('timeout', () => {
        request.destroy()
        file.close()
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath)
        }

        const error = new Error('Download timeout')
        this.win.webContents.send('download:error', {
          downloadId,
          modelId: modelConfig.id,
          error: error.message
        })

        this.activeDownloads.delete(downloadId)
        reject(error)
      })
    })
  }

  /**
   * ダウンロードをキャンセル
   */
  cancelDownload(downloadId: string): { success: boolean; error?: string } {
    const downloadState = this.activeDownloads.get(downloadId)
    if (downloadState) {
      downloadState.status = 'cancelled'
      return { success: true }
    }
    return { success: false, error: 'Download not found' }
  }

  /**
   * アクティブなダウンロード一覧を取得
   */
  listActiveDownloads(): Array<{ downloadId: string; modelId: string; status: string }> {
    const downloads: Array<{ downloadId: string; modelId: string; status: string }> = []
    for (const [id, state] of this.activeDownloads.entries()) {
      downloads.push({
        downloadId: id,
        modelId: state.modelId,
        status: state.status
      })
    }
    return downloads
  }
}
