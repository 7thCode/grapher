import type { Shape } from './Shape'
import { Group } from './Shape'

export interface SnapResult {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
  guides: SnapGuide[]
}

export interface SnapGuide {
  type: 'vertical' | 'horizontal'
  position: number
  label?: string
}

export interface SnapSettings {
  enabled: boolean
  gridEnabled: boolean
  gridSize: number
  shapeSnapEnabled: boolean
  snapThreshold: number // pixels
}

export class SnapManager {
  private settings: SnapSettings = {
    enabled: true,
    gridEnabled: true,
    gridSize: 20,
    shapeSnapEnabled: true,
    snapThreshold: 8,
  }

  /**
   * Set snap settings
   */
  setSettings(settings: Partial<SnapSettings>) {
    this.settings = { ...this.settings, ...settings }
  }

  /**
   * Get current settings
   */
  getSettings(): SnapSettings {
    return { ...this.settings }
  }

  /**
   * Snap point to grid and nearby shapes
   */
  snap(
    x: number,
    y: number,
    shapes: Shape[],
    excludeIds: string[] = []
  ): SnapResult {
    if (!this.settings.enabled) {
      return { x, y, snappedX: false, snappedY: false, guides: [] }
    }

    let snappedX = x
    let snappedY = y
    let didSnapX = false
    let didSnapY = false
    const guides: SnapGuide[] = []

    // Grid snapping
    if (this.settings.gridEnabled) {
      const gridX = Math.round(x / this.settings.gridSize) * this.settings.gridSize
      const gridY = Math.round(y / this.settings.gridSize) * this.settings.gridSize

      if (Math.abs(x - gridX) <= this.settings.snapThreshold) {
        snappedX = gridX
        didSnapX = true
      }
      if (Math.abs(y - gridY) <= this.settings.snapThreshold) {
        snappedY = gridY
        didSnapY = true
      }
    }

    // Shape snapping
    if (this.settings.shapeSnapEnabled) {
      const shapeSnap = this.snapToShapes(x, y, shapes, excludeIds)

      if (shapeSnap.snappedX) {
        snappedX = shapeSnap.x
        didSnapX = true
        guides.push(...shapeSnap.guides.filter((g) => g.type === 'vertical'))
      }
      if (shapeSnap.snappedY) {
        snappedY = shapeSnap.y
        didSnapY = true
        guides.push(...shapeSnap.guides.filter((g) => g.type === 'horizontal'))
      }
    }

    return {
      x: snappedX,
      y: snappedY,
      snappedX: didSnapX,
      snappedY: didSnapY,
      guides,
    }
  }

  /**
   * Snap to nearby shapes (edges and centers)
   */
  private snapToShapes(
    x: number,
    y: number,
    shapes: Shape[],
    excludeIds: string[]
  ): SnapResult {
    let snappedX = x
    let snappedY = y
    let didSnapX = false
    let didSnapY = false
    const guides: SnapGuide[] = []

    // Collect snap points from all shapes
    const snapPointsX: { pos: number; label: string }[] = []
    const snapPointsY: { pos: number; label: string }[] = []

    for (const shape of shapes) {
      if (excludeIds.includes(shape.props.id)) continue
      if (shape instanceof Group) {
        // Skip groups for now (could be enhanced later)
        continue
      }

      const bounds = shape.getBounds()
      const left = bounds.x
      const right = bounds.x + bounds.width
      const centerX = bounds.x + bounds.width / 2
      const top = bounds.y
      const bottom = bounds.y + bounds.height
      const centerY = bounds.y + bounds.height / 2

      // Add snap points
      snapPointsX.push(
        { pos: left, label: 'left' },
        { pos: right, label: 'right' },
        { pos: centerX, label: 'center' }
      )
      snapPointsY.push(
        { pos: top, label: 'top' },
        { pos: bottom, label: 'bottom' },
        { pos: centerY, label: 'center' }
      )
    }

    // Find closest snap point for X
    let closestX = null
    let closestXDist = Infinity
    for (const point of snapPointsX) {
      const dist = Math.abs(x - point.pos)
      if (dist <= this.settings.snapThreshold && dist < closestXDist) {
        closestX = point
        closestXDist = dist
      }
    }

    if (closestX) {
      snappedX = closestX.pos
      didSnapX = true
      guides.push({
        type: 'vertical',
        position: closestX.pos,
        label: closestX.label,
      })
    }

    // Find closest snap point for Y
    let closestY = null
    let closestYDist = Infinity
    for (const point of snapPointsY) {
      const dist = Math.abs(y - point.pos)
      if (dist <= this.settings.snapThreshold && dist < closestYDist) {
        closestY = point
        closestYDist = dist
      }
    }

    if (closestY) {
      snappedY = closestY.pos
      didSnapY = true
      guides.push({
        type: 'horizontal',
        position: closestY.pos,
        label: closestY.label,
      })
    }

    return {
      x: snappedX,
      y: snappedY,
      snappedX: didSnapX,
      snappedY: didSnapY,
      guides,
    }
  }

  /**
   * Snap bounds (for resizing)
   */
  snapBounds(
    bounds: { x: number; y: number; width: number; height: number },
    shapes: Shape[],
    excludeIds: string[] = []
  ): {
    bounds: { x: number; y: number; width: number; height: number }
    guides: SnapGuide[]
  } {
    if (!this.settings.enabled) {
      return { bounds, guides: [] }
    }

    const topLeft = this.snap(bounds.x, bounds.y, shapes, excludeIds)
    const bottomRight = this.snap(
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      shapes,
      excludeIds
    )

    const guides: SnapGuide[] = [...topLeft.guides, ...bottomRight.guides]

    // Calculate new bounds
    const newBounds = {
      x: topLeft.snappedX ? topLeft.x : bounds.x,
      y: topLeft.snappedY ? topLeft.y : bounds.y,
      width: bottomRight.snappedX
        ? bottomRight.x - topLeft.x
        : bounds.width,
      height: bottomRight.snappedY
        ? bottomRight.y - topLeft.y
        : bounds.height,
    }

    return { bounds: newBounds, guides }
  }

  /**
   * Draw snap guides on canvas
   */
  drawGuides(ctx: CanvasRenderingContext2D, guides: SnapGuide[], canvasWidth: number, canvasHeight: number) {
    ctx.save()
    ctx.strokeStyle = '#00BCD4'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    for (const guide of guides) {
      ctx.beginPath()
      if (guide.type === 'vertical') {
        ctx.moveTo(guide.position, 0)
        ctx.lineTo(guide.position, canvasHeight)
      } else {
        ctx.moveTo(0, guide.position)
        ctx.lineTo(canvasWidth, guide.position)
      }
      ctx.stroke()
    }

    ctx.restore()
  }

  /**
   * Draw grid on canvas
   */
  drawGrid(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
    if (!this.settings.gridEnabled) return

    ctx.save()
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5

    const gridSize = this.settings.gridSize

    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    // Horizontal lines
    for (let y = 0; y <= canvasHeight; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasWidth, y)
      ctx.stroke()
    }

    ctx.restore()
  }
}
