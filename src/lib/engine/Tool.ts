import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox } from './Shape'

export type ToolType = 'select' | 'rect' | 'circle' | 'line' | 'path' | 'text'

export interface ToolState {
  isDrawing: boolean
  startX: number
  startY: number
  preview?: Shape
  pathPoints?: { x: number; y: number }[]
}

export class ToolManager {
  private currentTool: ToolType = 'select'
  private state: ToolState = { isDrawing: false, startX: 0, startY: 0, pathPoints: [] }
  private shapeCounter = 0

  setTool(tool: ToolType) {
    this.currentTool = tool
    this.state = { isDrawing: false, startX: 0, startY: 0, pathPoints: [] }
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

      case 'text':
        this.state.preview = new TextBox({
          id,
          x,
          y,
          width: 0,
          height: 0,
          text: 'Text',
          fontSize: 16,
          fontColor: '#000000',
          fontFamily: 'Arial',
          fontWeight: 'normal',
          fontStyle: 'normal'
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
        const points = this.state.pathPoints || []
        if (points.length === 0) {
          path.props.d = `M ${startX} ${startY} L ${x} ${y}`
        } else {
          path.props.d = this.generateSmoothPath([...points, { x, y }])
        }
        break
      }

      case 'text': {
        const textBox = this.state.preview as TextBox
        const width = x - startX
        const height = y - startY
        textBox.props.x = width < 0 ? x : startX
        textBox.props.y = height < 0 ? y : startY
        textBox.props.width = Math.abs(width)
        textBox.props.height = Math.abs(height)
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
    } else if (shape instanceof TextBox) {
      if (shape.props.width < 50 || shape.props.height < 30) return null
    }

    return shape
  }

  addPathPoint(x: number, y: number) {
    if (this.currentTool !== 'path') return

    if (!this.state.isDrawing) {
      // First point - start drawing
      this.startDrawing(x, y)
      this.state.pathPoints = [{ x, y }]
    } else {
      // Add point to path
      this.state.pathPoints = this.state.pathPoints || []
      this.state.pathPoints.push({ x, y })

      // Update preview with smooth curve
      const path = this.state.preview as Path
      path.props.d = this.generateSmoothPath(this.state.pathPoints)
    }
  }

  finishPath(): Shape | null {
    if (this.currentTool !== 'path' || !this.state.preview) return null

    const shape = this.state.preview
    this.state = { isDrawing: false, startX: 0, startY: 0, pathPoints: [] }

    return shape
  }

  cancelDrawing() {
    this.state = { isDrawing: false, startX: 0, startY: 0, pathPoints: [] }
  }

  private generateSmoothPath(points: { x: number; y: number }[]): string {
    if (points.length < 2) {
      return `M ${points[0].x} ${points[0].y}`
    }

    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
    }

    // Generate smooth curve using quadratic bezier
    let path = `M ${points[0].x} ${points[0].y}`

    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const p2 = points[i + 1]

      // Control point for smooth curve
      const cx = p1.x
      const cy = p1.y

      // End point is midpoint between current and next
      const ex = (p1.x + p2.x) / 2
      const ey = (p1.y + p2.y) / 2

      path += ` Q ${cx} ${cy}, ${ex} ${ey}`
    }

    // Add final point
    const lastPoint = points[points.length - 1]
    const secondLastPoint = points[points.length - 2]
    path += ` Q ${secondLastPoint.x} ${secondLastPoint.y}, ${lastPoint.x} ${lastPoint.y}`

    return path
  }

  private getRandomColor(): string {
    const hue = Math.floor(Math.random() * 360)
    return `hsl(${hue}, 70%, 60%)`
  }
}
