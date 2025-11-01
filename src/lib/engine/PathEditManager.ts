import { Path, type PathPoint } from './Shape'

export type PathHandleType =
  | 'point' // Main anchor point
  | 'cp1' // Control point 1 (cubic bezier)
  | 'cp2' // Control point 2 (cubic bezier)
  | 'cp' // Control point (quadratic bezier)

export interface PathHandle {
  pointIndex: number
  type: PathHandleType
  x: number
  y: number
}

export class PathEditManager {
  private selectedPath: Path | null = null
  private handles: PathHandle[] = []
  private handleSize = 6

  /**
   * Start editing a path
   */
  startEditing(path: Path) {
    this.selectedPath = path
    this.updateHandles()
  }

  /**
   * Stop editing
   */
  stopEditing() {
    this.selectedPath = null
    this.handles = []
  }

  /**
   * Get current editing path
   */
  getEditingPath(): Path | null {
    return this.selectedPath
  }

  /**
   * Update handles from path points
   */
  private updateHandles() {
    if (!this.selectedPath || !this.selectedPath.props.points) {
      this.handles = []
      return
    }

    this.handles = []
    const points = this.selectedPath.props.points

    for (let i = 0; i < points.length; i++) {
      const point = points[i]

      // Main anchor point
      this.handles.push({
        pointIndex: i,
        type: 'point',
        x: point.x,
        y: point.y,
      })

      // Control points for cubic bezier
      if (point.type === 'C' && point.cp1x !== undefined && point.cp1y !== undefined) {
        this.handles.push({
          pointIndex: i,
          type: 'cp1',
          x: point.cp1x,
          y: point.cp1y,
        })
        if (point.cp2x !== undefined && point.cp2y !== undefined) {
          this.handles.push({
            pointIndex: i,
            type: 'cp2',
            x: point.cp2x,
            y: point.cp2y,
          })
        }
      }

      // Control point for quadratic bezier
      if (point.type === 'Q' && point.cpx !== undefined && point.cpy !== undefined) {
        this.handles.push({
          pointIndex: i,
          type: 'cp',
          x: point.cpx,
          y: point.cpy,
        })
      }
    }
  }

  /**
   * Get handle at position
   */
  getHandleAt(x: number, y: number): PathHandle | null {
    for (const handle of this.handles) {
      const dx = x - handle.x
      const dy = y - handle.y
      if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
        return handle
      }
    }
    return null
  }

  /**
   * Move handle
   */
  moveHandle(handle: PathHandle, dx: number, dy: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const point = this.selectedPath.props.points[handle.pointIndex]

    switch (handle.type) {
      case 'point':
        point.x += dx
        point.y += dy
        // Also move control points if they exist
        if (point.cp1x !== undefined) point.cp1x += dx
        if (point.cp1y !== undefined) point.cp1y += dy
        if (point.cp2x !== undefined) point.cp2x += dx
        if (point.cp2y !== undefined) point.cp2y += dy
        if (point.cpx !== undefined) point.cpx += dx
        if (point.cpy !== undefined) point.cpy += dy
        break

      case 'cp1':
        if (point.cp1x !== undefined) point.cp1x += dx
        if (point.cp1y !== undefined) point.cp1y += dy
        break

      case 'cp2':
        if (point.cp2x !== undefined) point.cp2x += dx
        if (point.cp2y !== undefined) point.cp2y += dy
        break

      case 'cp':
        if (point.cpx !== undefined) point.cpx += dx
        if (point.cpy !== undefined) point.cpy += dy
        break
    }

    // Update path data
    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Add point to path
   */
  addPoint(x: number, y: number, insertAfterIndex?: number) {
    if (!this.selectedPath) return

    if (!this.selectedPath.props.points) {
      this.selectedPath.props.points = []
    }

    const newPoint: PathPoint = {
      x,
      y,
      type: 'L', // Default to line
    }

    if (insertAfterIndex !== undefined && insertAfterIndex >= 0) {
      this.selectedPath.props.points.splice(insertAfterIndex + 1, 0, newPoint)
    } else {
      this.selectedPath.props.points.push(newPoint)
    }

    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Remove point from path
   */
  removePoint(pointIndex: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return
    if (this.selectedPath.props.points.length <= 2) {
      console.warn('Cannot remove point: path must have at least 2 points')
      return
    }

    this.selectedPath.props.points.splice(pointIndex, 1)
    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Convert point to cubic bezier
   */
  convertToCubicBezier(pointIndex: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const point = this.selectedPath.props.points[pointIndex]
    if (point.type === 'C') return // Already cubic bezier

    // Create control points at 1/3 and 2/3 of the way to the next point
    const nextPoint = this.selectedPath.props.points[pointIndex + 1]
    if (nextPoint) {
      const dx = nextPoint.x - point.x
      const dy = nextPoint.y - point.y
      point.cp1x = point.x + dx / 3
      point.cp1y = point.y + dy / 3
      point.cp2x = point.x + (2 * dx) / 3
      point.cp2y = point.y + (2 * dy) / 3
    } else {
      // Last point, create control points going backward
      point.cp1x = point.x - 30
      point.cp1y = point.y
      point.cp2x = point.x + 30
      point.cp2y = point.y
    }

    point.type = 'C'
    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Convert point to line
   */
  convertToLine(pointIndex: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const point = this.selectedPath.props.points[pointIndex]
    point.type = 'L'
    delete point.cp1x
    delete point.cp1y
    delete point.cp2x
    delete point.cp2y
    delete point.cpx
    delete point.cpy

    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Update SVG path data from points
   */
  private updatePathData() {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const points = this.selectedPath.props.points
    let d = ''

    for (let i = 0; i < points.length; i++) {
      const point = points[i]

      if (point.type === 'M') {
        d += `M ${point.x} ${point.y} `
      } else if (point.type === 'L') {
        d += `L ${point.x} ${point.y} `
      } else if (point.type === 'C' && point.cp1x !== undefined && point.cp2x !== undefined) {
        d += `C ${point.cp1x} ${point.cp1y} ${point.cp2x} ${point.cp2y} ${point.x} ${point.y} `
      } else if (point.type === 'Q' && point.cpx !== undefined) {
        d += `Q ${point.cpx} ${point.cpy} ${point.x} ${point.y} `
      }
    }

    this.selectedPath.props.d = d.trim()
  }

  /**
   * Render handles on canvas
   */
  render(ctx: CanvasRenderingContext2D) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    ctx.save()

    const points = this.selectedPath.props.points

    // Draw control lines
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    for (const point of points) {
      if (point.type === 'C') {
        // Draw line from anchor to cp1
        if (point.cp1x !== undefined) {
          ctx.beginPath()
          ctx.moveTo(point.x, point.y)
          ctx.lineTo(point.cp1x, point.cp1y!)
          ctx.stroke()
        }
        // Draw line from anchor to cp2
        if (point.cp2x !== undefined) {
          ctx.beginPath()
          ctx.moveTo(point.x, point.y)
          ctx.lineTo(point.cp2x, point.cp2y!)
          ctx.stroke()
        }
      } else if (point.type === 'Q' && point.cpx !== undefined) {
        ctx.beginPath()
        ctx.moveTo(point.x, point.y)
        ctx.lineTo(point.cpx, point.cpy!)
        ctx.stroke()
      }
    }

    ctx.setLineDash([])

    // Draw handles
    for (const handle of this.handles) {
      if (handle.type === 'point') {
        // Anchor points - filled square
        ctx.fillStyle = '#2196F3'
        ctx.fillRect(
          handle.x - this.handleSize,
          handle.y - this.handleSize,
          this.handleSize * 2,
          this.handleSize * 2
        )
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.strokeRect(
          handle.x - this.handleSize,
          handle.y - this.handleSize,
          this.handleSize * 2,
          this.handleSize * 2
        )
      } else {
        // Control points - filled circle
        ctx.fillStyle = '#FF9800'
        ctx.beginPath()
        ctx.arc(handle.x, handle.y, this.handleSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  /**
   * Get all handles for testing
   */
  getHandles(): PathHandle[] {
    return this.handles
  }
}
