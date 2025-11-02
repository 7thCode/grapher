import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox, Group } from './Shape'
import { TransformControls, type HandleType } from './TransformControls'
import {
  CommandHistory,
  AddShapeCommand,
  RemoveShapeCommand,
  MoveShapeCommand,
  ResizeShapeCommand,
  UpdatePropertiesCommand,
  GroupCommand,
  UngroupCommand,
} from './Command'
import { SnapManager, type SnapGuide } from './SnapManager'
import { AlignManager, type AlignType, type DistributeType } from './AlignManager'
import { PathEditManager, type PathHandle } from './PathEditManager'

export class Renderer {
  private shapes: Shape[] = []
  private selectedIds: string[] = []
  private previewShape: Shape | null = null
  private transformControls: TransformControls | null = null
  private commandHistory: CommandHistory = new CommandHistory()
  private onChangeCallback: (() => void) | null = null
  private snapManager: SnapManager = new SnapManager()
  private snapGuides: SnapGuide[] = []
  private alignManager: AlignManager = new AlignManager()
  private pathEditManager: PathEditManager = new PathEditManager()
  private selectionRect: { x: number; y: number; width: number; height: number } | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D
  ) {}

  /**
   * Set callback to be called when any change occurs
   */
  setOnChangeCallback(callback: () => void) {
    this.onChangeCallback = callback
  }

  /**
   * Notify that a change has occurred
   */
  private notifyChange() {
    if (this.onChangeCallback) {
      this.onChangeCallback()
    }
  }

  addShape(shape: Shape, useCommand = true) {
    if (useCommand) {
      const command = new AddShapeCommand(shape, this.shapes)
      this.commandHistory.execute(command)
      this.notifyChange()
    } else {
      this.shapes.push(shape)
    }
    this.render()
  }

  removeShape(id: string, useCommand = true) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    if (useCommand) {
      const command = new RemoveShapeCommand(shape, this.shapes)
      this.commandHistory.execute(command)
      this.notifyChange()
    } else {
      this.shapes = this.shapes.filter((s) => s.props.id !== id)
    }
    this.render()
  }

  moveShape(id: string, dx: number, dy: number) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    if (shape instanceof Rect) {
      shape.props.x += dx
      shape.props.y += dy
    } else if (shape instanceof Circle) {
      shape.props.cx += dx
      shape.props.cy += dy
    } else if (shape instanceof Line) {
      shape.props.x1 += dx
      shape.props.y1 += dy
      shape.props.x2 += dx
      shape.props.y2 += dy
    } else if (shape instanceof Path) {
      shape.props.x += dx
      shape.props.y += dy
      // TODO: update path data
    } else if (shape instanceof TextBox) {
      shape.props.x += dx
      shape.props.y += dy
    } else if (shape instanceof Group) {
      // Move all children recursively
      this.moveGroupChildren(shape, dx, dy)
    }

    this.render()
  }

  private moveGroupChildren(group: Group, dx: number, dy: number) {
    for (const child of group.props.children) {
      if (child instanceof Rect) {
        child.props.x += dx
        child.props.y += dy
      } else if (child instanceof Circle) {
        child.props.cx += dx
        child.props.cy += dy
      } else if (child instanceof Line) {
        child.props.x1 += dx
        child.props.y1 += dy
        child.props.x2 += dx
        child.props.y2 += dy
      } else if (child instanceof Path) {
        child.props.x += dx
        child.props.y += dy
      } else if (child instanceof TextBox) {
        child.props.x += dx
        child.props.y += dy
      } else if (child instanceof Group) {
        // Recursively move nested groups
        this.moveGroupChildren(child, dx, dy)
      }
    }
  }

  selectShape(id: string | null, addToSelection = false) {
    if (id === null) {
      // Clear all selection
      this.selectedIds = []
      this.transformControls = null
    } else if (addToSelection) {
      // Toggle selection
      const index = this.selectedIds.indexOf(id)
      if (index >= 0) {
        this.selectedIds.splice(index, 1)
      } else {
        this.selectedIds.push(id)
      }
    } else {
      // Single selection (replace)
      this.selectedIds = [id]
    }

    // Update transform controls for single selection only
    if (this.selectedIds.length === 1) {
      const shape = this.shapes.find((s) => s.props.id === this.selectedIds[0])
      if (shape) {
        this.transformControls = new TransformControls(shape)
      }
    } else {
      this.transformControls = null
    }

    this.render()
  }

  getHandleAt(x: number, y: number): HandleType | null {
    if (!this.transformControls) return null
    return this.transformControls.getHandleAt(x, y)
  }

  resizeShape(handleType: HandleType, dx: number, dy: number) {
    if (!this.transformControls) return
    this.transformControls.resize(handleType, dx, dy)
    this.render()
  }

  rotateShape(mouseX: number, mouseY: number) {
    if (!this.transformControls) return
    this.transformControls.rotate(mouseX, mouseY)
    this.render()
  }

  getSelectedShape(): Shape | null {
    if (this.selectedIds.length === 0) return null
    return this.shapes.find((s) => s.props.id === this.selectedIds[0]) || null
  }

  getSelectedShapes(): Shape[] {
    return this.shapes.filter((s) => this.selectedIds.includes(s.props.id))
  }

  getSelectedIds(): string[] {
    return [...this.selectedIds]
  }

  updateShapeProperties(id: string, props: Partial<{
    stroke: string
    strokeWidth: number
    fill: string
  }>) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    if (props.stroke !== undefined) shape.props.stroke = props.stroke
    if (props.strokeWidth !== undefined) shape.props.strokeWidth = props.strokeWidth
    if (props.fill !== undefined) shape.props.fill = props.fill

    this.render()
  }

  getShapeAt(x: number, y: number): Shape | null {
    // Reverse iteration to prioritize top shapes
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      if (this.shapes[i].containsPoint(x, y)) {
        return this.shapes[i]
      }
    }
    return null
  }

  setPreview(shape: Shape | null) {
    this.previewShape = shape
    this.render()
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw grid
    this.snapManager.drawGrid(this.ctx, this.canvas.width, this.canvas.height)

    // Draw all shapes
    for (const shape of this.shapes) {
      shape.render(this.ctx)
    }

    // Draw preview shape
    if (this.previewShape) {
      this.ctx.save()
      this.ctx.globalAlpha = 0.5
      this.previewShape.render(this.ctx)
      this.ctx.restore()
    }

    // Draw snap guides
    if (this.snapGuides.length > 0) {
      this.snapManager.drawGuides(this.ctx, this.snapGuides, this.canvas.width, this.canvas.height)
    }

    // Draw selection boxes for all selected shapes
    for (const id of this.selectedIds) {
      const selected = this.shapes.find((s) => s.props.id === id)
      if (selected) {
        this.drawSelectionBox(selected)
      }
    }

    // Draw transform controls (resize handles) only for single selection
    if (this.selectedIds.length === 1 && this.transformControls) {
      this.transformControls.render(this.ctx)
    }

    // Draw path edit handles if editing a path
    const editingPath = this.pathEditManager.getEditingPath()
    if (editingPath) {
      this.pathEditManager.render(this.ctx)
    }

    // Draw selection rectangle for drag selection
    if (this.selectionRect) {
      this.ctx.save()
      this.ctx.strokeStyle = '#2196F3'
      this.ctx.lineWidth = 2
      this.ctx.fillStyle = 'rgba(33, 150, 243, 0.15)'
      this.ctx.fillRect(
        this.selectionRect.x,
        this.selectionRect.y,
        this.selectionRect.width,
        this.selectionRect.height
      )
      this.ctx.strokeRect(
        this.selectionRect.x,
        this.selectionRect.y,
        this.selectionRect.width,
        this.selectionRect.height
      )
      this.ctx.restore()
    }
  }

  private drawSelectionBox(shape: Shape) {
    const bounds = shape.getBounds()
    const rotation = shape.props.rotation || 0

    this.ctx.save()

    // Apply rotation around shape center
    if (rotation !== 0) {
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      this.ctx.translate(centerX, centerY)
      this.ctx.rotate((rotation * Math.PI) / 180)
      this.ctx.translate(-centerX, -centerY)
    }

    this.ctx.strokeStyle = '#2196F3'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4)
    this.ctx.setLineDash([])

    this.ctx.restore()
  }

  exportSVG(): string {
    const svgShapes = this.shapes.map((s) => s.toSVG()).join('\n  ')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvas.width}" height="${this.canvas.height}">
  ${svgShapes}
</svg>`
  }

  getShapes() {
    return this.shapes
  }

  /**
   * Undo/Redo operations
   */
  undo(): boolean {
    const result = this.commandHistory.undo()
    if (result) {
      this.render()
      this.notifyChange()
    }
    return result
  }

  redo(): boolean {
    const result = this.commandHistory.redo()
    if (result) {
      this.render()
      this.notifyChange()
    }
    return result
  }

  canUndo(): boolean {
    return this.commandHistory.canUndo()
  }

  canRedo(): boolean {
    return this.commandHistory.canRedo()
  }

  /**
   * 移動操作完了時に Command として記録
   */
  commitMove(id: string, totalDx: number, totalDy: number) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape || (totalDx === 0 && totalDy === 0)) return

    const command = new MoveShapeCommand(shape, totalDx, totalDy)
    // 既に移動済みなので、executeせずに履歴に追加
    this.commandHistory.recordExecuted(command)
    this.notifyChange()
  }

  /**
   * リサイズ操作完了時に Command として記録
   */
  commitResize(id: string, oldBounds: { x: number; y: number; width: number; height: number }) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    const newBounds = shape.getBounds()
    // 変更がない場合はスキップ
    if (
      oldBounds.x === newBounds.x &&
      oldBounds.y === newBounds.y &&
      oldBounds.width === newBounds.width &&
      oldBounds.height === newBounds.height
    ) {
      return
    }

    const command = new ResizeShapeCommand(shape, oldBounds, newBounds)
    // 既にリサイズ済みなので、executeせずに履歴に追加
    this.commandHistory.recordExecuted(command)
    this.notifyChange()
  }

  /**
   * プロパティ更新を Command として記録
   */
  commitUpdateProperties(
    id: string,
    oldProps: Partial<Shape['props']>,
    newProps: Partial<Shape['props']>
  ) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    const command = new UpdatePropertiesCommand(shape, oldProps, newProps)
    this.commandHistory.execute(command)
    this.notifyChange()
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    this.commandHistory.clear()
  }

  /**
   * Mark the current state as clean (saved)
   * This is used to reset isDirty flag after saving
   */
  markClean() {
    // CommandHistory に保存時点のインデックスを記録する機能が必要
    // 今回は単純に、外部で isDirty = false を設定する方式にする
    // 特に何もしない（Canvas.svelte で isDirty を直接管理）
  }

  /**
   * Layer ordering operations
   */
  bringToFront(id: string) {
    const index = this.shapes.findIndex((s) => s.props.id === id)
    if (index === -1 || index === this.shapes.length - 1) return

    const shape = this.shapes.splice(index, 1)[0]
    this.shapes.push(shape)
    this.render()
    this.notifyChange()
  }

  sendToBack(id: string) {
    const index = this.shapes.findIndex((s) => s.props.id === id)
    if (index === -1 || index === 0) return

    const shape = this.shapes.splice(index, 1)[0]
    this.shapes.unshift(shape)
    this.render()
    this.notifyChange()
  }

  /**
   * Group selected shapes
   */
  groupShapes(): void {
    const selectedShapes = this.getSelectedShapes()
    
    if (selectedShapes.length < 2) {
      console.warn('Need at least 2 shapes to group')
      return
    }

    const command = new GroupCommand(selectedShapes, this.shapes)
    this.commandHistory.execute(command)
    this.notifyChange()

    // Select the newly created group
    const group = command.getGroup()
    this.selectedIds = [group.props.id]
    
    this.render()
  }

  /**
   * Ungroup selected group
   */
  ungroupShapes(): void {
    const selectedShapes = this.getSelectedShapes()
    
    for (const shape of selectedShapes) {
      if (shape instanceof Group) {
        const command = new UngroupCommand(shape, this.shapes)
        this.commandHistory.execute(command)
        this.notifyChange()
      }
    }

    // Clear selection
    this.selectedIds = []
    this.render()
  }

  /**
   * Check if selection contains a group
   */
  hasGroupSelected(): boolean {
    const selectedShapes = this.getSelectedShapes()
    return selectedShapes.some((shape) => shape instanceof Group)
  }

  /**
   * Get snap manager
   */
  getSnapManager(): SnapManager {
    return this.snapManager
  }

  /**
   * Set snap guides to display
   */
  setSnapGuides(guides: SnapGuide[]) {
    this.snapGuides = guides
  }

  /**
   * Clear snap guides
   */
  clearSnapGuides() {
    this.snapGuides = []
  }

  /**
   * Snap point with current settings
   */
  snapPoint(x: number, y: number, excludeIds: string[] = []) {
    return this.snapManager.snap(x, y, this.shapes, excludeIds)
  }

  /**
   * Align selected shapes
   */
  alignShapes(type: AlignType) {
    const selectedShapes = this.getSelectedShapes()
    if (selectedShapes.length < 2) {
      console.warn('Need at least 2 shapes to align')
      return
    }

    // Store old positions for undo
    const oldBounds = selectedShapes.map((s) => s.getBounds())

    // Align shapes
    this.alignManager.alignShapes(selectedShapes, type)

    // Store new positions for undo
    const newBounds = selectedShapes.map((s) => s.getBounds())

    // Create compound command for all movements
    for (let i = 0; i < selectedShapes.length; i++) {
      const dx = newBounds[i].x - oldBounds[i].x
      const dy = newBounds[i].y - oldBounds[i].y
      if (dx !== 0 || dy !== 0) {
        const command = new MoveShapeCommand(selectedShapes[i], dx, dy)
        this.commandHistory.recordExecuted(command)
      }
    }

    this.notifyChange()
    this.render()
  }

  /**
   * Distribute selected shapes
   */
  distributeShapes(type: DistributeType) {
    const selectedShapes = this.getSelectedShapes()
    if (selectedShapes.length < 3) {
      console.warn('Need at least 3 shapes to distribute')
      return
    }

    // Store old positions
    const oldBounds = selectedShapes.map((s) => s.getBounds())

    // Distribute shapes
    this.alignManager.distributeShapes(selectedShapes, type)

    // Store new positions for undo
    const newBounds = selectedShapes.map((s) => s.getBounds())

    // Create compound command
    for (let i = 0; i < selectedShapes.length; i++) {
      const dx = newBounds[i].x - oldBounds[i].x
      const dy = newBounds[i].y - oldBounds[i].y
      if (dx !== 0 || dy !== 0) {
        const command = new MoveShapeCommand(selectedShapes[i], dx, dy)
        this.commandHistory.recordExecuted(command)
      }
    }

    this.notifyChange()
    this.render()
  }

  /**
   * Get path edit manager
   */
  getPathEditManager(): PathEditManager {
    return this.pathEditManager
  }

  /**
   * Start editing a path
   */
  startPathEditing(path: Path) {
    this.pathEditManager.startEditing(path)
    this.render()
  }

  /**
   * Stop path editing
   */
  stopPathEditing() {
    this.pathEditManager.stopEditing()
    this.render()
  }

  /**
   * Check if path is being edited
   */
  isEditingPath(): boolean {
    return this.pathEditManager.getEditingPath() !== null
  }

  bringForward(id: string) {
    const index = this.shapes.findIndex((s) => s.props.id === id)
    if (index === -1 || index === this.shapes.length - 1) return

    const shape = this.shapes[index]
    this.shapes[index] = this.shapes[index + 1]
    this.shapes[index + 1] = shape
    this.render()
    this.notifyChange()
  }

  sendBackward(id: string) {
    const index = this.shapes.findIndex((s) => s.props.id === id)
    if (index === -1 || index === 0) return

    const shape = this.shapes[index]
    this.shapes[index] = this.shapes[index - 1]
    this.shapes[index - 1] = shape
    this.render()
    this.notifyChange()
  }

  /**
   * Set selection rectangle for drag selection
   */
  setSelectionRect(rect: { x: number; y: number; width: number; height: number } | null) {
    this.selectionRect = rect
    this.render()
  }

  /**
   * Get selection rectangle
   */
  getSelectionRect() {
    return this.selectionRect
  }
}
