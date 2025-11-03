import { Path, type PathPoint } from './Shape'
import type { SnapManager } from './SnapManager'

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
  private smoothMode = true // Smooth control point adjustment (Illustrator style)
  private selectedPointIndex: number | null = null // Selected point for control point visibility
  private showAllControlPoints = true // Show all control points or only selected
  private snapManager: SnapManager | null = null // Snap manager for grid/point snapping

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
   * Set snap manager for snapping functionality
   */
  setSnapManager(snapManager: SnapManager | null) {
    this.snapManager = snapManager
  }

  /**
   * Toggle smooth mode
   */
  setSmoothMode(enabled: boolean) {
    this.smoothMode = enabled
  }

  /**
   * Get smooth mode state
   */
  getSmoothMode(): boolean {
    return this.smoothMode
  }

  /**
   * Set control point visibility mode
   */
  setShowAllControlPoints(show: boolean) {
    this.showAllControlPoints = show
  }

  /**
   * Select a point (for control point visibility)
   */
  selectPoint(index: number | null) {
    this.selectedPointIndex = index
  }

  /**
   * Get current editing path
   */
  getEditingPath(): Path | null {
    return this.selectedPath
  }

  /**
   * Get selected point index
   */
  getSelectedPointIndex(): number | null {
    return this.selectedPointIndex
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

      // For Illustrator-style control points:
      // point[i] IN-handle = point[i].cp2
      if (point.type === 'C' && point.cp2x !== undefined && point.cp2y !== undefined) {
        this.handles.push({
          pointIndex: i,
          type: 'cp2',
          x: point.cp2x,
          y: point.cp2y,
        })
      }

      // point[i] OUT-handle = point[i+1].cp1
      if (i + 1 < points.length) {
        const nextPoint = points[i + 1]
        if (nextPoint.type === 'C' && nextPoint.cp1x !== undefined && nextPoint.cp1y !== undefined) {
          this.handles.push({
            pointIndex: i,  // This OUT-handle belongs to point[i]
            type: 'cp1',
            x: nextPoint.cp1x,
            y: nextPoint.cp1y,
          })
        }
      }

      // Quadratic bezier control point
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
      // Check if control point should be clickable
      if (handle.type !== 'point') {
        let shouldShowControlPoint = this.showAllControlPoints

        if (!shouldShowControlPoint) {
          // Both cp1 and cp2: clickable when this point is selected
          if (handle.type === 'cp1' || handle.type === 'cp2') {
            shouldShowControlPoint = this.selectedPointIndex === handle.pointIndex
          } else if (handle.type === 'cp') {
            // Quadratic: clickable when this point is selected
            shouldShowControlPoint = this.selectedPointIndex === handle.pointIndex
          }
        }

        if (!shouldShowControlPoint) continue
      }

      const dx = x - handle.x
      const dy = y - handle.y
      if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
        // Update selected point when clicking on any handle
        if (handle.type === 'point') {
          this.selectedPointIndex = handle.pointIndex
        } else if (handle.type === 'cp1' || handle.type === 'cp2' || handle.type === 'cp') {
          // Both cp1 and cp2 belong to this point, so select the point itself
          this.selectedPointIndex = handle.pointIndex
        }
        return handle
      }
    }
    return null
  }

  /**
   * Move handle
   */
  moveHandle(handle: PathHandle, dx: number, dy: number, altKey = false) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const points = this.selectedPath.props.points
    const point = points[handle.pointIndex]

    switch (handle.type) {
      case 'point':
        // No snapping in path edit mode for precise control
        point.x += dx
        point.y += dy

        // Also move control points if they exist
        // IN-handle: point[i].cp2
        if (point.cp2x !== undefined) point.cp2x += dx
        if (point.cp2y !== undefined) point.cp2y += dy
        
        // OUT-handle: point[i+1].cp1
        if (handle.pointIndex + 1 < points.length) {
          const nextPoint = points[handle.pointIndex + 1]
          if (nextPoint.cp1x !== undefined) nextPoint.cp1x += dx
          if (nextPoint.cp1y !== undefined) nextPoint.cp1y += dy
        }
        
        // Quadratic bezier
        if (point.cpx !== undefined) point.cpx += dx
        if (point.cpy !== undefined) point.cpy += dy
        break

      case 'cp1':
        // cp1 is the OUT-handle of point[i], stored in point[i+1].cp1
        if (handle.pointIndex + 1 < points.length) {
          const nextPoint = points[handle.pointIndex + 1]
          if (nextPoint.cp1x !== undefined) nextPoint.cp1x += dx
          if (nextPoint.cp1y !== undefined) nextPoint.cp1y += dy
          
          // Adjust IN-handle (cp2) based on point type (unless Alt key is pressed)
          if (!altKey && point.cp2x !== undefined && point.cp2y !== undefined) {
            const pointType = point.pointType || 'smooth'
            
            if (pointType === 'symmetrical') {
              // Symmetrical: mirror IN-handle with same length
              const cp1VecX = nextPoint.cp1x - point.x
              const cp1VecY = nextPoint.cp1y - point.y
              const length = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)
              
              if (length > 0) {
                const normX = cp1VecX / length
                const normY = cp1VecY / length
                point.cp2x = point.x - normX * length
                point.cp2y = point.y - normY * length
              }
            } else if (pointType === 'smooth') {
              // Smooth: mirror IN-handle direction but keep its length
              const cp1VecX = nextPoint.cp1x - point.x
              const cp1VecY = nextPoint.cp1y - point.y
              const cp1Length = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)
              const cp2Length = Math.sqrt(
                (point.cp2x - point.x) ** 2 + (point.cp2y - point.y) ** 2
              )
              
              if (cp1Length > 0) {
                const normX = cp1VecX / cp1Length
                const normY = cp1VecY / cp1Length
                point.cp2x = point.x - normX * cp2Length
                point.cp2y = point.y - normY * cp2Length
              }
            }
            // Corner: do nothing (cp2 stays independent)
          }
        }
        break

      case 'cp2':
        // cp2 is the IN-handle of point[i]
        if (point.cp2x !== undefined) point.cp2x += dx
        if (point.cp2y !== undefined) point.cp2y += dy
        
        // Adjust OUT-handle (cp1) based on point type (unless Alt key is pressed)
        if (!altKey && handle.pointIndex + 1 < points.length) {
          const nextPoint = points[handle.pointIndex + 1]
          if (nextPoint.cp1x !== undefined && nextPoint.cp1y !== undefined) {
            const pointType = point.pointType || 'smooth'
            
            if (pointType === 'symmetrical') {
              // Symmetrical: mirror OUT-handle with same length
              const cp2VecX = point.cp2x - point.x
              const cp2VecY = point.cp2y - point.y
              const length = Math.sqrt(cp2VecX * cp2VecX + cp2VecY * cp2VecY)
              
              if (length > 0) {
                const normX = cp2VecX / length
                const normY = cp2VecY / length
                nextPoint.cp1x = point.x - normX * length
                nextPoint.cp1y = point.y - normY * length
              }
            } else if (pointType === 'smooth') {
              // Smooth: mirror OUT-handle direction but keep its length
              const cp2VecX = point.cp2x - point.x
              const cp2VecY = point.cp2y - point.y
              const cp2Length = Math.sqrt(cp2VecX * cp2VecX + cp2VecY * cp2VecY)
              const cp1Length = Math.sqrt(
                (nextPoint.cp1x - point.x) ** 2 + (nextPoint.cp1y - point.y) ** 2
              )
              
              if (cp2Length > 0) {
                const normX = cp2VecX / cp2Length
                const normY = cp2VecY / cp2Length
                nextPoint.cp1x = point.x - normX * cp1Length
                nextPoint.cp1y = point.y - normY * cp1Length
              }
            }
            // Corner: do nothing (cp1 stays independent)
          }
        }
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
    point.pointType = 'smooth' // Default to smooth point
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
   * Convert a point to quadratic bezier curve
   */
  convertToQuadraticBezier(pointIndex: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const point = this.selectedPath.props.points[pointIndex]
    if (!point) return

    // If already quadratic, do nothing
    if (point.type === 'Q') return

    // If cubic bezier, convert to quadratic by averaging control points
    if (point.type === 'C' && point.cp1x !== undefined && point.cp2x !== undefined) {
      const cpx = (point.cp1x + point.cp2x) / 2
      const cpy = (point.cp1y! + point.cp2y!) / 2
      
      point.type = 'Q'
      point.cpx = cpx
      point.cpy = cpy
      delete point.cp1x
      delete point.cp1y
      delete point.cp2x
      delete point.cp2y
    } else if (point.type === 'L' || point.type === 'M') {
      // Convert line to quadratic bezier
      const prevIndex = pointIndex - 1
      if (prevIndex >= 0) {
        const prevPoint = this.selectedPath.props.points[prevIndex]
        const cpx = (prevPoint.x + point.x) / 2
        const cpy = (prevPoint.y + point.y) / 2
        
        point.type = 'Q'
        point.cpx = cpx
        point.cpy = cpy
      }
    }

    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Convert a quadratic bezier to cubic bezier
   */
  convertQuadraticToCubic(pointIndex: number) {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const point = this.selectedPath.props.points[pointIndex]
    if (!point || point.type !== 'Q') return
    if (point.cpx === undefined) return

    const prevIndex = pointIndex - 1
    if (prevIndex < 0) return

    const prevPoint = this.selectedPath.props.points[prevIndex]

    // Convert quadratic to cubic bezier
    // Q(t) = (1-t)^2 * P0 + 2(1-t)t * Q + t^2 * P1
    // C(t) = (1-t)^3 * P0 + 3(1-t)^2*t * C1 + 3(1-t)*t^2 * C2 + t^3 * P1
    // C1 = P0 + 2/3 * (Q - P0)
    // C2 = P1 + 2/3 * (Q - P1)
    
    const cp1x = prevPoint.x + (2/3) * (point.cpx - prevPoint.x)
    const cp1y = prevPoint.y + (2/3) * (point.cpy! - prevPoint.y)
    const cp2x = point.x + (2/3) * (point.cpx - point.x)
    const cp2y = point.y + (2/3) * (point.cpy! - point.y)

    point.type = 'C'
    point.cp1x = cp1x
    point.cp1y = cp1y
    point.cp2x = cp2x
    point.cp2y = cp2y
    delete point.cpx
    delete point.cpy

    this.updatePathData()
    this.updateHandles()
  }


  /**
   * Close the path (connect last point to first point)
   */
  closePath() {
    if (!this.selectedPath || !this.selectedPath.props.points) return
    if (this.selectedPath.props.points.length < 2) return

    this.selectedPath.props.closed = true
    this.updatePathData()
  }

  /**
   * Open the path (disconnect last point from first point)
   */
  openPath() {
    if (!this.selectedPath) return

    this.selectedPath.props.closed = false
    this.updatePathData()
  }

  /**
   * Check if path is closed
   */
  isPathClosed(): boolean {
    return this.selectedPath?.props.closed ?? false
  }


  /**
   * Set point type for a specific point
   */
  setPointType(pointIndex: number, pointType: 'smooth' | 'symmetrical' | 'corner') {
    if (!this.selectedPath || !this.selectedPath.props.points) return

    const points = this.selectedPath.props.points
    const point = points[pointIndex]
    if (!point) return

    point.pointType = pointType

    // Get IN-handle and OUT-handle
    const inHandle = point.cp2x !== undefined && point.cp2y !== undefined
    const outHandle = pointIndex + 1 < points.length && 
                      points[pointIndex + 1].cp1x !== undefined && 
                      points[pointIndex + 1].cp1y !== undefined

    if (!inHandle && !outHandle) return

    // Adjust control points based on the new point type
    if (pointType === 'symmetrical') {
      // Symmetrical: mirror control points with same length
      let cp1Length = 0
      let cp2Length = 0
      
      if (outHandle) {
        const nextPoint = points[pointIndex + 1]
        cp1Length = Math.sqrt(
          (nextPoint.cp1x! - point.x) ** 2 + (nextPoint.cp1y! - point.y) ** 2
        )
      }
      
      if (inHandle) {
        cp2Length = Math.sqrt(
          (point.cp2x! - point.x) ** 2 + (point.cp2y! - point.y) ** 2
        )
      }
      
      const avgLength = (cp1Length + cp2Length) / 2

      // Use OUT-handle direction as reference
      if (outHandle) {
        const nextPoint = points[pointIndex + 1]
        const cp1VecX = nextPoint.cp1x! - point.x
        const cp1VecY = nextPoint.cp1y! - point.y
        const cp1Len = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)

        if (cp1Len > 0) {
          const normX = cp1VecX / cp1Len
          const normY = cp1VecY / cp1Len

          nextPoint.cp1x = point.x + normX * avgLength
          nextPoint.cp1y = point.y + normY * avgLength
          
          if (inHandle) {
            point.cp2x = point.x - normX * avgLength
            point.cp2y = point.y - normY * avgLength
          }
        }
      }
    } else if (pointType === 'smooth') {
      // Smooth: align control points on a line but keep their individual lengths
      if (outHandle && inHandle) {
        const nextPoint = points[pointIndex + 1]
        const cp1VecX = nextPoint.cp1x! - point.x
        const cp1VecY = nextPoint.cp1y! - point.y
        const cp1Length = Math.sqrt(cp1VecX * cp1VecX + cp1VecY * cp1VecY)
        const cp2Length = Math.sqrt(
          (point.cp2x! - point.x) ** 2 + (point.cp2y! - point.y) ** 2
        )

        if (cp1Length > 0) {
          const normX = cp1VecX / cp1Length
          const normY = cp1VecY / cp1Length

          // Align IN-handle in opposite direction
          point.cp2x = point.x - normX * cp2Length
          point.cp2y = point.y - normY * cp2Length
        }
      }
    }
    // Corner: do nothing (control points stay independent)

    this.updatePathData()
    this.updateHandles()
  }

  /**
   * Get point type for a specific point
   */
  getPointType(pointIndex: number): 'smooth' | 'symmetrical' | 'corner' | null {
    if (!this.selectedPath || !this.selectedPath.props.points) return null
    
    const point = this.selectedPath.props.points[pointIndex]
    if (!point || point.type !== 'C') return null
    
    return point.pointType || 'smooth'
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

    // Add close path command if closed
    if (this.selectedPath.props.closed) {
      d += 'Z '
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

    for (let i = 0; i < points.length; i++) {
      const point = points[i]

      // SVG C command structure: point[i] stores the segment FROM point[i-1] TO point[i]
      // - point[i].cp1 = OUT-handle of point[i-1]
      // - point[i].cp2 = IN-handle of point[i]
      // 
      // For Illustrator-style editing, when point[i] is selected, show:
      // - IN-handle: point[i].cp2
      // - OUT-handle: point[i+1].cp1

      const isSelected = this.showAllControlPoints || this.selectedPointIndex === i

      if (point.type === 'C') {
        // Draw IN-handle (cp2) when this point is selected
        if (isSelected && point.cp2x !== undefined) {
          ctx.beginPath()
          ctx.moveTo(point.x, point.y)
          ctx.lineTo(point.cp2x, point.cp2y!)
          ctx.stroke()
        }
      }

      // Draw OUT-handle from this point (stored in next point's cp1)
      if (isSelected && i + 1 < points.length) {
        const nextPoint = points[i + 1]
        if (nextPoint.type === 'C' && nextPoint.cp1x !== undefined) {
          ctx.beginPath()
          ctx.moveTo(point.x, point.y)
          ctx.lineTo(nextPoint.cp1x, nextPoint.cp1y!)
          ctx.stroke()
        }
      }

      // Quadratic bezier
      if (point.type === 'Q' && point.cpx !== undefined) {
        if (isSelected) {
          ctx.beginPath()
          ctx.moveTo(point.x, point.y)
          ctx.lineTo(point.cpx, point.cpy!)
          ctx.stroke()
        }
      }
    }

    ctx.setLineDash([])

    // Draw handles
    for (const handle of this.handles) {
      if (handle.type === 'point') {
        // Anchor points - Illustrator style: square
        const isSelected = this.selectedPointIndex === handle.pointIndex
        const size = isSelected ? this.handleSize * 1.2 : this.handleSize

        // Draw filled square
        ctx.fillStyle = '#fff'
        ctx.fillRect(
          handle.x - size,
          handle.y - size,
          size * 2,
          size * 2
        )
        
        // Draw outline
        ctx.strokeStyle = '#2196F3'
        ctx.lineWidth = isSelected ? 2.5 : 2
        ctx.strokeRect(
          handle.x - size,
          handle.y - size,
          size * 2,
          size * 2
        )
      } else {
        // Control points visibility:
        // For anchor point i, show both point[i].cp1 and point[i].cp2

        let shouldShowControlPoint = this.showAllControlPoints

        if (!shouldShowControlPoint) {
          // Both cp1 and cp2: show when this point is selected
          if (handle.type === 'cp1' || handle.type === 'cp2') {
            shouldShowControlPoint = this.selectedPointIndex === handle.pointIndex
          } else if (handle.type === 'cp') {
            // Quadratic: show when this point is selected
            shouldShowControlPoint = this.selectedPointIndex === handle.pointIndex
          }
        }

        if (!shouldShowControlPoint) continue

        // Control points (handles) - Illustrator style: filled circle
        const handleRadius = this.handleSize * 0.8
        
        ctx.fillStyle = '#2196F3'
        ctx.beginPath()
        ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
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
