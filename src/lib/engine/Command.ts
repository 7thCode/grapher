import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox } from './Shape'

/**
 * Command Interface - Undo/Redo システムの基底インターフェース
 * すべてのコマンドは execute() と undo() を実装する必要がある
 */
export interface Command {
  execute(): void
  undo(): void
  getDescription(): string
}

/**
 * AddShapeCommand - 図形追加コマンド
 */
export class AddShapeCommand implements Command {
  private shape: Shape
  private shapes: Shape[]

  constructor(shape: Shape, shapes: Shape[]) {
    this.shape = shape
    this.shapes = shapes
  }

  execute(): void {
    this.shapes.push(this.shape)
  }

  undo(): void {
    const index = this.shapes.indexOf(this.shape)
    if (index !== -1) {
      this.shapes.splice(index, 1)
    }
  }

  getDescription(): string {
    return `Add ${this.shape.type}`
  }
}

/**
 * RemoveShapeCommand - 図形削除コマンド
 */
export class RemoveShapeCommand implements Command {
  private shape: Shape
  private shapes: Shape[]
  private originalIndex: number

  constructor(shape: Shape, shapes: Shape[]) {
    this.shape = shape
    this.shapes = shapes
    this.originalIndex = shapes.indexOf(shape)
  }

  execute(): void {
    const index = this.shapes.indexOf(this.shape)
    if (index !== -1) {
      this.shapes.splice(index, 1)
    }
  }

  undo(): void {
    // 元の位置に復元
    this.shapes.splice(this.originalIndex, 0, this.shape)
  }

  getDescription(): string {
    return `Remove ${this.shape.type}`
  }
}

/**
 * MoveShapeCommand - 図形移動コマンド
 */
export class MoveShapeCommand implements Command {
  private shape: Shape
  private dx: number
  private dy: number

  constructor(shape: Shape, dx: number, dy: number) {
    this.shape = shape
    this.dx = dx
    this.dy = dy
  }

  execute(): void {
    this.applyMove(this.dx, this.dy)
  }

  undo(): void {
    this.applyMove(-this.dx, -this.dy)
  }

  private applyMove(dx: number, dy: number): void {
    if (this.shape instanceof Rect || this.shape instanceof Path || this.shape instanceof TextBox) {
      this.shape.props.x += dx
      this.shape.props.y += dy
    } else if (this.shape instanceof Circle) {
      this.shape.props.cx += dx
      this.shape.props.cy += dy
    } else if (this.shape instanceof Line) {
      this.shape.props.x1 += dx
      this.shape.props.y1 += dy
      this.shape.props.x2 += dx
      this.shape.props.y2 += dy
    }
  }

  getDescription(): string {
    return `Move ${this.shape.type}`
  }
}

/**
 * ResizeShapeCommand - 図形リサイズコマンド
 */
export class ResizeShapeCommand implements Command {
  private shape: Shape
  private oldBounds: { x: number; y: number; width: number; height: number }
  private newBounds: { x: number; y: number; width: number; height: number }

  constructor(
    shape: Shape,
    oldBounds: { x: number; y: number; width: number; height: number },
    newBounds: { x: number; y: number; width: number; height: number }
  ) {
    this.shape = shape
    this.oldBounds = oldBounds
    this.newBounds = newBounds
  }

  execute(): void {
    this.applyBounds(this.newBounds)
  }

  undo(): void {
    this.applyBounds(this.oldBounds)
  }

  private applyBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    if (this.shape instanceof Rect || this.shape instanceof Path || this.shape instanceof TextBox) {
      this.shape.props.x = bounds.x
      this.shape.props.y = bounds.y
      if ('width' in this.shape.props) {
        this.shape.props.width = bounds.width
      }
      if ('height' in this.shape.props) {
        this.shape.props.height = bounds.height
      }
    } else if (this.shape instanceof Circle) {
      this.shape.props.cx = bounds.x + bounds.width / 2
      this.shape.props.cy = bounds.y + bounds.height / 2
      this.shape.props.radius = bounds.width / 2
    } else if (this.shape instanceof Line) {
      // Line は getBounds() の x, y, width, height から x1, y1, x2, y2 を復元
      this.shape.props.x1 = bounds.x
      this.shape.props.y1 = bounds.y
      this.shape.props.x2 = bounds.x + bounds.width
      this.shape.props.y2 = bounds.y + bounds.height
    }
  }

  getDescription(): string {
    return `Resize ${this.shape.type}`
  }
}

/**
 * UpdatePropertiesCommand - 図形プロパティ更新コマンド（色、線幅など）
 */
export class UpdatePropertiesCommand implements Command {
  private shape: Shape
  private oldProps: Partial<Shape['props']>
  private newProps: Partial<Shape['props']>

  constructor(shape: Shape, oldProps: Partial<Shape['props']>, newProps: Partial<Shape['props']>) {
    this.shape = shape
    this.oldProps = oldProps
    this.newProps = newProps
  }

  execute(): void {
    Object.assign(this.shape.props, this.newProps)
  }

  undo(): void {
    Object.assign(this.shape.props, this.oldProps)
  }

  getDescription(): string {
    return `Update ${this.shape.type} properties`
  }
}

/**
 * CommandHistory - コマンド履歴管理クラス
 */
export class CommandHistory {
  private history: Command[] = []
  private currentIndex = -1
  private maxHistorySize = 100

  /**
   * コマンドを実行して履歴に追加
   */
  execute(command: Command): void {
    // 現在の位置より後の履歴を削除（分岐履歴を防ぐ）
    this.history.splice(this.currentIndex + 1)

    // コマンド実行
    command.execute()

    // 履歴に追加
    this.history.push(command)
    this.currentIndex++

    // 履歴サイズの制限
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
      this.currentIndex--
    }
  }

  /**
   * コマンドを実行せずに履歴に追加（既に実行済みの操作を記録する場合）
   */
  recordExecuted(command: Command): void {
    // 現在の位置より後の履歴を削除（分岐履歴を防ぐ）
    this.history.splice(this.currentIndex + 1)

    // 履歴に追加（execute は呼ばない）
    this.history.push(command)
    this.currentIndex++

    // 履歴サイズの制限
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
      this.currentIndex--
    }
  }

  /**
   * Undo - 1つ前の状態に戻す
   */
  undo(): boolean {
    if (!this.canUndo()) {
      return false
    }

    const command = this.history[this.currentIndex]
    command.undo()
    this.currentIndex--
    return true
  }

  /**
   * Redo - Undo を取り消す
   */
  redo(): boolean {
    if (!this.canRedo()) {
      return false
    }

    this.currentIndex++
    const command = this.history[this.currentIndex]
    command.execute()
    return true
  }

  /**
   * Undo 可能かチェック
   */
  canUndo(): boolean {
    return this.currentIndex >= 0
  }

  /**
   * Redo 可能かチェック
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  /**
   * 履歴をクリア
   */
  clear(): void {
    this.history = []
    this.currentIndex = -1
  }

  /**
   * 現在の履歴情報を取得（デバッグ用）
   */
  getInfo(): { total: number; current: number; canUndo: boolean; canRedo: boolean } {
    return {
      total: this.history.length,
      current: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    }
  }
}