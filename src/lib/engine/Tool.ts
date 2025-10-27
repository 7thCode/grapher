import type { Shape } from './Shape'
import { Rect, Circle, Line, Path } from './Shape'

export type ToolType = 'select' | 'rect' | 'circle' | 'line' | 'path'

export interface ToolState {
  isDrawing: boolean
  startX: number
  startY: number
  preview?: Shape
}

export class ToolManager {
  private currentTool: ToolType = 'select'
  private state: ToolState = { isDrawing: false, startX: 0, startY: 0 }
  private shapeCounter = 0

  setTool(tool: ToolType) {
    this.currentTool = tool
    this.state = { isDrawing: false, startX: 0, startY: 0 }
  }

  getTool(): ToolType {
    return this.currentTool
  }

  getState(): ToolState {
    return this.state
  }

  startDrawing(x: number, y: number) {
    if (this.currentTool === 'select') return

    this.state.isDrawing = true
    this.state.startX = x
    this.state.startY = y

    // Create preview shape
    const id = `${this.currentTool}-${this.shapeCounter++}`

    switch (this.currentTool) {
      case 'rect':
        this.state.preview = new Rect({
          id,
          x,
          y,
          width: 0,
          height: 0,
          fill: this.getRandomColor(),
          stroke: '#333',
          strokeWidth: 2
        })
        break

      case 'circle':
        this.state.preview = new Circle({
          id,
          x,
          y,
          cx: x,
          cy: y,
          r: 0,
          fill: this.getRandomColor(),
          stroke: '#333',
          strokeWidth: 2
        })
        break

      case 'line':
        this.state.preview = new Line({
          id,
          x,
          y,
          x1: x,
          y1: y,
          x2: x,
          y2: y,
          stroke: this.getRandomColor(),
          strokeWidth: 3
        })
        break

      case 'path':
        this.state.preview = new Path({
          id,
          x,
          y,
          d: `M ${x} ${y}`,
          stroke: this.getRandomColor(),
          strokeWidth: 3
        })
        break
    }
  }

  updateDrawing(x: number, y: number) {
    if (!this.state.isDrawing || !this.state.preview) return

    const { startX, startY } = this.state

    switch (this.currentTool) {
      case 'rect': {
        const rect = this.state.preview as Rect
        const width = x - startX
        const height = y - startY
        rect.props.x = width < 0 ? x : startX
        rect.props.y = height < 0 ? y : startY
        rect.props.width = Math.abs(width)
        rect.props.height = Math.abs(height)
        break
      }

      case 'circle': {
        const circle = this.state.preview as Circle
        const dx = x - startX
        const dy = y - startY
        const r = Math.sqrt(dx * dx + dy * dy)
        circle.props.r = r
        break
      }

      case 'line': {
        const line = this.state.preview as Line
        line.props.x2 = x
        line.props.y2 = y
        break
      }

      case 'path': {
        const path = this.state.preview as Path
        path.props.d = `M ${startX} ${startY} L ${x} ${y}`
        break
      }
    }
  }

  finishDrawing(): Shape | null {
    if (!this.state.isDrawing || !this.state.preview) return null

    const shape = this.state.preview

    // Reset state
    this.state = { isDrawing: false, startX: 0, startY: 0 }

    // Validate shape (minimum size)
    if (shape instanceof Rect) {
      if (shape.props.width < 5 || shape.props.height < 5) return null
    } else if (shape instanceof Circle) {
      if (shape.props.r < 5) return null
    } else if (shape instanceof Line) {
      const dx = shape.props.x2 - shape.props.x1
      const dy = shape.props.y2 - shape.props.y1
      const length = Math.sqrt(dx * dx + dy * dy)
      if (length < 5) return null
    }

    return shape
  }

  cancelDrawing() {
    this.state = { isDrawing: false, startX: 0, startY: 0 }
  }

  private getRandomColor(): string {
    const hue = Math.floor(Math.random() * 360)
    return `hsl(${hue}, 70%, 60%)`
  }
}
