import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox, Group } from './Shape'

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
      this.shape.props.x += dx
      this.shape.props.y += dy
    } else if (this.shape instanceof Line) {
      this.shape.props.x1 += dx
      this.shape.props.y1 += dy
      this.shape.props.x2 += dx
      this.shape.props.y2 += dy
    } else if (this.shape instanceof Group) {
      // Move all children in the group recursively
      for (const child of this.shape.props.children) {
        const childCommand = new MoveShapeCommand(child, dx, dy)
        childCommand.execute()
      }
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
      this.shape.props.x = bounds.x
      this.shape.props.y = bounds.y
      this.shape.props.radius = bounds.width / 2
    } else if (this.shape instanceof Line) {
      // Line は getBounds() の x, y, width, height から x1, y1, x2, y2 を復元
      this.shape.props.x1 = bounds.x
      this.shape.props.y1 = bounds.y
      this.shape.props.x2 = bounds.x + bounds.width
      this.shape.props.y2 = bounds.y + bounds.height
    } else if (this.shape instanceof Group) {
      // For groups, calculate scale factors and apply recursively to all children
      const currentBounds = this.shape.getBounds()
      
      // Avoid division by zero
      if (currentBounds.width === 0 || currentBounds.height === 0) {
        return
      }
      
      const scaleX = bounds.width / currentBounds.width
      const scaleY = bounds.height / currentBounds.height
      
      // Origin point is the top-left of the current bounds
      const originX = currentBounds.x
      const originY = currentBounds.y
      
      // Target origin is the top-left of the new bounds
      const targetX = bounds.x
      const targetY = bounds.y
      
      // Recursively scale all children
      this.scaleGroupChildren(this.shape, scaleX, scaleY, originX, originY, targetX, targetY)
    }
  }

  private scaleGroupChildren(
    group: Group,
    scaleX: number,
    scaleY: number,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number
  ): void {
    for (const child of group.props.children) {
      if (child instanceof Rect) {
        const relX = child.props.x - originX
        const relY = child.props.y - originY
        child.props.x = targetX + relX * scaleX
        child.props.y = targetY + relY * scaleY
        child.props.width *= scaleX
        child.props.height *= scaleY
      } else if (child instanceof Circle) {
        const relX = child.props.cx - originX
        const relY = child.props.cy - originY
        child.props.cx = targetX + relX * scaleX
        child.props.cy = targetY + relY * scaleY
        child.props.r *= Math.min(scaleX, scaleY)
      } else if (child instanceof Line) {
        const relX1 = child.props.x1 - originX
        const relY1 = child.props.y1 - originY
        const relX2 = child.props.x2 - originX
        const relY2 = child.props.y2 - originY
        child.props.x1 = targetX + relX1 * scaleX
        child.props.y1 = targetY + relY1 * scaleY
        child.props.x2 = targetX + relX2 * scaleX
        child.props.y2 = targetY + relY2 * scaleY
      } else if (child instanceof TextBox) {
        const relX = child.props.x - originX
        const relY = child.props.y - originY
        child.props.x = targetX + relX * scaleX
        child.props.y = targetY + relY * scaleY
        child.props.width *= scaleX
        child.props.height *= scaleY
        child.props.fontSize *= Math.min(scaleX, scaleY)
      } else if (child instanceof Path) {
        for (const point of child.props.points) {
          const relX = point.x - originX
          const relY = point.y - originY
          point.x = targetX + relX * scaleX
          point.y = targetY + relY * scaleY

          // Scale control points if present
          if (point.cp1x !== undefined && point.cp1y !== undefined) {
            const relCp1X = point.cp1x - originX
            const relCp1Y = point.cp1y - originY
            point.cp1x = targetX + relCp1X * scaleX
            point.cp1y = targetY + relCp1Y * scaleY
          }
          if (point.cp2x !== undefined && point.cp2y !== undefined) {
            const relCp2X = point.cp2x - originX
            const relCp2Y = point.cp2y - originY
            point.cp2x = targetX + relCp2X * scaleX
            point.cp2y = targetY + relCp2Y * scaleY
          }
          if (point.cpx !== undefined && point.cpy !== undefined) {
            const relCpX = point.cpx - originX
            const relCpY = point.cpy - originY
            point.cpx = targetX + relCpX * scaleX
            point.cpy = targetY + relCpY * scaleY
          }
        }
        child.updatePathData()
      } else if (child instanceof Group) {
        // Recursively scale nested groups
        this.scaleGroupChildren(child, scaleX, scaleY, originX, originY, targetX, targetY)
      }
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
 * GroupCommand - 図形グループ化コマンド
 */
export class GroupCommand implements Command {
  private group: Group
  private shapes: Shape[]
  private childShapes: Shape[]
  private childIndices: number[]

  constructor(childShapes: Shape[], shapes: Shape[]) {
    this.childShapes = childShapes
    this.shapes = shapes
    this.childIndices = childShapes.map((child) => shapes.indexOf(child))

    // Create new group with unique ID
    const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const bounds = this.calculateBounds(childShapes)

    this.group = new Group({
      id: groupId,
      x: bounds.x,
      y: bounds.y,
      children: [...childShapes],
    })
  }

  execute(): void {
    // Remove child shapes from main shapes array
    for (const child of this.childShapes) {
      const index = this.shapes.indexOf(child)
      if (index !== -1) {
        this.shapes.splice(index, 1)
      }
    }

    // Add group to shapes array
    this.shapes.push(this.group)
  }

  undo(): void {
    // Remove group from shapes array
    const groupIndex = this.shapes.indexOf(this.group)
    if (groupIndex !== -1) {
      this.shapes.splice(groupIndex, 1)
    }

    // Restore child shapes at their original indices
    const sortedIndices = [...this.childIndices].sort((a, b) => a - b)
    for (let i = 0; i < sortedIndices.length; i++) {
      this.shapes.splice(sortedIndices[i], 0, this.childShapes[i])
    }
  }

  private calculateBounds(shapes: Shape[]) {
    if (shapes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const shape of shapes) {
      const bounds = shape.getBounds()
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.width)
      maxY = Math.max(maxY, bounds.y + bounds.height)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  getDescription(): string {
    return `Group ${this.childShapes.length} shapes`
  }

  getGroup(): Group {
    return this.group
  }
}

/**
 * UngroupCommand - グループ解除コマンド
 */
export class UngroupCommand implements Command {
  private group: Group
  private shapes: Shape[]
  private groupIndex: number
  private children: Shape[]

  constructor(group: Group, shapes: Shape[]) {
    this.group = group
    this.shapes = shapes
    this.groupIndex = shapes.indexOf(group)
    this.children = [...group.props.children]
  }

  execute(): void {
    // Remove group from shapes array
    const index = this.shapes.indexOf(this.group)
    if (index !== -1) {
      this.shapes.splice(index, 1)
    }

    // Add all children to shapes array at the same position
    this.shapes.splice(index, 0, ...this.children)
  }

  undo(): void {
    // Remove all children
    for (const child of this.children) {
      const index = this.shapes.indexOf(child)
      if (index !== -1) {
        this.shapes.splice(index, 1)
      }
    }

    // Restore group at original position
    this.shapes.splice(this.groupIndex, 0, this.group)
  }

  getDescription(): string {
    return `Ungroup ${this.children.length} shapes`
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