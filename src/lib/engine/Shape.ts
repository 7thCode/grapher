// Base shape class
export interface ShapeProps {
  id: string
  x: number
  y: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  rotation?: number // Rotation angle in degrees
}

export interface RectProps extends ShapeProps {
  width: number
  height: number
}

export class Rect {
  constructor(public props: RectProps) {}

  render(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height, fill = '#4CAF50', stroke, strokeWidth = 1, rotation = 0 } = this.props

    ctx.save()

    // Apply rotation around center
    if (rotation !== 0) {
      const centerX = x + width / 2
      const centerY = y + height / 2
      ctx.translate(centerX, centerY)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    ctx.fillStyle = fill
    ctx.fillRect(x, y, width, height)

    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeWidth
      ctx.strokeRect(x, y, width, height)
    }

    ctx.restore()
  }

  containsPoint(px: number, py: number): boolean {
    const { x, y, width, height } = this.props
    return px >= x && px <= x + width && py >= y && py <= y + height
  }

  toSVG(): string {
    const { x, y, width, height, fill = '#4CAF50', stroke, strokeWidth = 1, rotation = 0 } = this.props
    const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''
    const transformAttr = rotation !== 0 ? `transform="rotate(${rotation} ${x + width/2} ${y + height/2})"` : ''
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${strokeAttr} ${transformAttr} />`
  }

  getBounds() {
    const { x, y, width, height } = this.props
    return { x, y, width, height }
  }
}

// Circle shape
export interface CircleProps extends ShapeProps {
  cx: number
  cy: number
  r: number
}

export class Circle {
  constructor(public props: CircleProps) {}

  render(ctx: CanvasRenderingContext2D) {
    const { cx, cy, r, fill = '#FF5722', stroke, strokeWidth = 1, rotation = 0 } = this.props

    ctx.save()

    // Apply rotation around center (circles don't visually change, but we keep for consistency)
    if (rotation !== 0) {
      ctx.translate(cx, cy)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)

    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }

    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeWidth
      ctx.stroke()
    }

    ctx.restore()
  }

  containsPoint(px: number, py: number): boolean {
    const { cx, cy, r } = this.props
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= r * r
  }

  toSVG(): string {
    const { cx, cy, r, fill = '#FF5722', stroke, strokeWidth = 1, rotation = 0 } = this.props
    const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''
    const transformAttr = rotation !== 0 ? `transform="rotate(${rotation} ${cx} ${cy})"` : ''
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${strokeAttr} ${transformAttr} />`
  }

  getBounds() {
    const { cx, cy, r } = this.props
    return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }
  }
}

// Line shape
export interface LineProps extends ShapeProps {
  x1: number
  y1: number
  x2: number
  y2: number
}

export class Line {
  constructor(public props: LineProps) {}

  render(ctx: CanvasRenderingContext2D) {
    const { x1, y1, x2, y2, stroke = '#2196F3', strokeWidth = 2, rotation = 0 } = this.props

    ctx.save()

    // Apply rotation around center
    if (rotation !== 0) {
      const centerX = (x1 + x2) / 2
      const centerY = (y1 + y2) / 2
      ctx.translate(centerX, centerY)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.stroke()

    ctx.restore()
  }

  containsPoint(px: number, py: number): boolean {
    const { x1, y1, x2, y2, strokeWidth = 2 } = this.props

    // Distance from point to line segment
    const A = px - x1
    const B = py - y1
    const C = x2 - x1
    const D = y2 - y1

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1
    if (lenSq !== 0) param = dot / lenSq

    let xx, yy

    if (param < 0) {
      xx = x1
      yy = y1
    } else if (param > 1) {
      xx = x2
      yy = y2
    } else {
      xx = x1 + param * C
      yy = y1 + param * D
    }

    const dx = px - xx
    const dy = py - yy
    const distance = Math.sqrt(dx * dx + dy * dy)

    return distance <= strokeWidth + 5 // 5px tolerance
  }

  toSVG(): string {
    const { x1, y1, x2, y2, stroke = '#2196F3', strokeWidth = 2, rotation = 0 } = this.props
    const transformAttr = rotation !== 0 ? `transform="rotate(${rotation} ${(x1+x2)/2} ${(y1+y2)/2})"` : ''
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" ${transformAttr} />`
  }

  getBounds() {
    const { x1, y1, x2, y2 } = this.props
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    }
  }
}

// Path shape (for bezier curves)
export interface PathProps extends ShapeProps {
  d: string // SVG path data
  points?: { x: number; y: number; type: 'M' | 'L' | 'C' | 'Q' }[]
}

export class Path {
  constructor(public props: PathProps) {}

  render(ctx: CanvasRenderingContext2D) {
    const { d, fill, stroke = '#9C27B0', strokeWidth = 2, rotation = 0 } = this.props

    ctx.save()

    // Apply rotation around center
    if (rotation !== 0) {
      const bounds = this.getBounds()
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      ctx.translate(centerX, centerY)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    const path = new Path2D(d)

    if (fill) {
      ctx.fillStyle = fill
      ctx.fill(path)
    }

    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeWidth
      ctx.stroke(path)
    }

    ctx.restore()
  }

  containsPoint(px: number, py: number): boolean {
    const { d, fill, stroke, strokeWidth = 2 } = this.props
    const path = new Path2D(d)
    const ctx = document.createElement('canvas').getContext('2d')!

    if (fill && ctx.isPointInPath(path, px, py)) {
      return true
    }

    if (stroke) {
      ctx.lineWidth = strokeWidth + 5 // Add tolerance
      if (ctx.isPointInStroke(path, px, py)) {
        return true
      }
    }

    return false
  }

  toSVG(): string {
    const { d, fill, stroke = '#9C27B0', strokeWidth = 2, rotation = 0 } = this.props
    const fillAttr = fill ? `fill="${fill}"` : 'fill="none"'
    const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''
    const bounds = this.getBounds()
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const transformAttr = rotation !== 0 ? `transform="rotate(${rotation} ${centerX} ${centerY})"` : ''
    return `<path d="${d}" ${fillAttr} ${strokeAttr} ${transformAttr} />`
  }

  getBounds() {
    // Parse path to extract coordinates
    const { d } = this.props
    const coords = d.match(/-?\d+\.?\d*/g)?.map(Number) || []

    if (coords.length < 2) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = coords[0]
    let minY = coords[1]
    let maxX = coords[0]
    let maxY = coords[1]

    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i]
      const y = coords[i + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}

export type Shape = Rect | Circle | Line | Path
