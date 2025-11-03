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

  finishPath(close = false): Shape | null {
    if (this.currentTool !== 'path' || !this.state.preview) return null

    const path = this.state.preview as Path
    const pathPoints = this.state.pathPoints || []

    // Convert pathPoints to PathPoint array for editing
    if (pathPoints.length >= 2) {
      const points: import('./Shape').PathPoint[] = []

      // First point is always 'M' (moveto)
      points.push({
        x: pathPoints[0].x,
        y: pathPoints[0].y,
        type: 'M'
      })

      // If only 2 points, use a line
      if (pathPoints.length === 2) {
        points.push({
          x: pathPoints[1].x,
          y: pathPoints[1].y,
          type: 'L'
        })
      } else {
        // For 3+ points, create smooth cubic bezier curves
        // Calculate tangents at each point first
        const tangents: { x: number; y: number }[] = []
        
        // For closed paths, extend the points array cyclically for tangent calculation
        const extendedPoints = close 
          ? [pathPoints[pathPoints.length - 1], ...pathPoints, pathPoints[0]]
          : pathPoints
        
        for (let i = 0; i < pathPoints.length; i++) {
          let tangentX: number
          let tangentY: number
          
          if (close) {
            // Closed path: always use average tangent
            const idx = i + 1 // offset for extended array
            tangentX = extendedPoints[idx + 1].x - extendedPoints[idx - 1].x
            tangentY = extendedPoints[idx + 1].y - extendedPoints[idx - 1].y
          } else {
            // Open path
            if (i === 0) {
              // First point: tangent toward next point
              tangentX = pathPoints[1].x - pathPoints[0].x
              tangentY = pathPoints[1].y - pathPoints[0].y
            } else if (i === pathPoints.length - 1) {
              // Last point: tangent from previous point
              tangentX = pathPoints[i].x - pathPoints[i - 1].x
              tangentY = pathPoints[i].y - pathPoints[i - 1].y
            } else {
              // Middle points: average tangent
              tangentX = pathPoints[i + 1].x - pathPoints[i - 1].x
              tangentY = pathPoints[i + 1].y - pathPoints[i - 1].y
            }
          }
          
          // Normalize
          const length = Math.sqrt(tangentX * tangentX + tangentY * tangentY)
          if (length > 0) {
            tangentX /= length
            tangentY /= length
          }
          
          tangents.push({ x: tangentX, y: tangentY })
        }
        
        // Create bezier segments
        const segmentCount = close ? pathPoints.length : pathPoints.length - 1
        for (let i = 0; i < segmentCount; i++) {
          const prevIdx = i
          const currentIdx = (i + 1) % pathPoints.length
          
          const prevPoint = pathPoints[prevIdx]
          const currentPoint = pathPoints[currentIdx]
          const prevTangent = tangents[prevIdx]
          const currentTangent = tangents[currentIdx]
          
          // Distance between points
          const dist = Math.sqrt(
            (currentPoint.x - prevPoint.x) ** 2 + (currentPoint.y - prevPoint.y) ** 2
          )
          const handleLength = dist / 3
          
          // OUT-handle from prevPoint (stored as cp1)
          const cp1x = prevPoint.x + prevTangent.x * handleLength
          const cp1y = prevPoint.y + prevTangent.y * handleLength
          
          // IN-handle to currentPoint (stored as cp2)
          const cp2x = currentPoint.x - currentTangent.x * handleLength
          const cp2y = currentPoint.y - currentTangent.y * handleLength
          
          // For closed paths, the last segment goes back to first point
          if (close && currentIdx === 0) {
            // Store closing segment control points in the first point
            // Keep type as 'M' but add control points for editing
            points[0].cp1x = cp1x
            points[0].cp1y = cp1y
            points[0].cp2x = cp2x
            points[0].cp2y = cp2y
            points[0].pointType = 'smooth'
            // Don't change type - keep it as 'M'
          } else {
            points.push({
              x: currentPoint.x,
              y: currentPoint.y,
              type: 'C',
              cp1x,
              cp1y,
              cp2x,
              cp2y,
              pointType: 'smooth'
            })
          }
        }
      }

      path.props.points = points
      path.props.closed = close

      // Generate d attribute from points
      let d = `M ${points[0].x} ${points[0].y}`
      for (let i = 1; i < points.length; i++) {
        const point = points[i]
        if (point.type === 'L') {
          d += ` L ${point.x} ${point.y}`
        } else if (point.type === 'C' && point.cp1x !== undefined && point.cp2x !== undefined) {
          d += ` C ${point.cp1x} ${point.cp1y} ${point.cp2x} ${point.cp2y} ${point.x} ${point.y}`
        }
      }
      
      // For closed paths, add closing segment and Z command
      if (close && points[0].cp1x !== undefined && points[0].cp2x !== undefined) {
        // Add the curve back to the start point
        d += ` C ${points[0].cp1x} ${points[0].cp1y} ${points[0].cp2x} ${points[0].cp2y} ${points[0].x} ${points[0].y}`
      }
      if (close) {
        d += ' Z'
      }
      
      path.props.d = d
    }

    this.state = { isDrawing: false, startX: 0, startY: 0, pathPoints: [] }

    return path
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
