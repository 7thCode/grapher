import type { Shape } from './Shape'
import { Rect, Circle, Line } from './Shape'

export type HandleType = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'rotate'

export interface Handle {
  type: HandleType
  x: number
  y: number
  size: number
}

export class TransformControls {
  private handles: Handle[] = []
  private readonly handleSize = 8

  constructor(private shape: Shape) {
    this.updateHandles()
  }

  updateHandles() {
    const bounds = this.shape.getBounds()
    const { x, y, width, height } = bounds
    const hs = this.handleSize

    // Rotation handle offset
    const rotateOffset = 25

    this.handles = [
      { type: 'nw', x: x - hs / 2, y: y - hs / 2, size: hs },
      { type: 'n', x: x + width / 2 - hs / 2, y: y - hs / 2, size: hs },
      { type: 'ne', x: x + width - hs / 2, y: y - hs / 2, size: hs },
      { type: 'e', x: x + width - hs / 2, y: y + height / 2 - hs / 2, size: hs },
      { type: 'se', x: x + width - hs / 2, y: y + height - hs / 2, size: hs },
      { type: 's', x: x + width / 2 - hs / 2, y: y + height - hs / 2, size: hs },
      { type: 'sw', x: x - hs / 2, y: y + height - hs / 2, size: hs },
      { type: 'w', x: x - hs / 2, y: y + height / 2 - hs / 2, size: hs },
      // Rotation handle (above center top)
      { type: 'rotate', x: x + width / 2 - hs / 2, y: y - rotateOffset - hs / 2, size: hs },
    ]
  }

  render(ctx: CanvasRenderingContext2D) {
    this.updateHandles()

    for (const handle of this.handles) {
      if (handle.type === 'rotate') {
        // Render rotation handle as a circle
        ctx.fillStyle = 'white'
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 2

        const centerX = handle.x + handle.size / 2
        const centerY = handle.y + handle.size / 2
        ctx.beginPath()
        ctx.arc(centerX, centerY, handle.size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw rotation icon (arrow curve)
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(centerX, centerY, 3, 0.3 * Math.PI, 1.7 * Math.PI)
        ctx.stroke()
      } else {
        // Regular resize handles
        ctx.fillStyle = 'white'
        ctx.strokeStyle = '#2196F3'
        ctx.lineWidth = 2

        ctx.fillRect(handle.x, handle.y, handle.size, handle.size)
        ctx.strokeRect(handle.x, handle.y, handle.size, handle.size)
      }
    }
  }

  getHandleAt(x: number, y: number): HandleType | null {
    for (const handle of this.handles) {
      if (handle.type === 'rotate') {
        // Circle hit detection for rotation handle
        const centerX = handle.x + handle.size / 2
        const centerY = handle.y + handle.size / 2
        const dx = x - centerX
        const dy = y - centerY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= handle.size / 2 + 2) {
          return handle.type
        }
      } else {
        // Rectangle hit detection for resize handles
        if (
          x >= handle.x &&
          x <= handle.x + handle.size &&
          y >= handle.y &&
          y <= handle.y + handle.size
        ) {
          return handle.type
        }
      }
    }
    return null
  }

  resize(handleType: HandleType, dx: number, dy: number) {
    if (this.shape instanceof Rect) {
      this.resizeRect(handleType, dx, dy)
    } else if (this.shape instanceof Circle) {
      this.resizeCircle(handleType, dx, dy)
    } else if (this.shape instanceof Line) {
      this.resizeLine(handleType, dx, dy)
    }
  }

  private resizeRect(handleType: HandleType, dx: number, dy: number) {
    const rect = this.shape as Rect
    const { x, y, width, height } = rect.props

    switch (handleType) {
      case 'nw':
        rect.props.x = x + dx
        rect.props.y = y + dy
        rect.props.width = width - dx
        rect.props.height = height - dy
        break
      case 'n':
        rect.props.y = y + dy
        rect.props.height = height - dy
        break
      case 'ne':
        rect.props.y = y + dy
        rect.props.width = width + dx
        rect.props.height = height - dy
        break
      case 'e':
        rect.props.width = width + dx
        break
      case 'se':
        rect.props.width = width + dx
        rect.props.height = height + dy
        break
      case 's':
        rect.props.height = height + dy
        break
      case 'sw':
        rect.props.x = x + dx
        rect.props.width = width - dx
        rect.props.height = height + dy
        break
      case 'w':
        rect.props.x = x + dx
        rect.props.width = width - dx
        break
    }

    // Prevent negative dimensions
    if (rect.props.width < 10) {
      rect.props.width = 10
    }
    if (rect.props.height < 10) {
      rect.props.height = 10
    }
  }

  private resizeCircle(handleType: HandleType, dx: number, dy: number) {
    const circle = this.shape as Circle
    const { cx, cy, r } = circle.props

    // Calculate distance change from center
    const delta = Math.sqrt(dx * dx + dy * dy)
    const direction = handleType.includes('e') || handleType.includes('s') ? 1 : -1

    circle.props.r = Math.max(5, r + delta * direction * 0.5)
  }

  private resizeLine(handleType: HandleType, dx: number, dy: number) {
    const line = this.shape as Line
    const { x1, y1, x2, y2 } = line.props

    // For lines, handle types map to start/end points
    if (handleType === 'nw' || handleType === 'w' || handleType === 'sw') {
      // Resize from start point
      line.props.x1 = x1 + dx
      line.props.y1 = y1 + dy
    } else {
      // Resize from end point
      line.props.x2 = x2 + dx
      line.props.y2 = y2 + dy
    }
  }

  rotate(mouseX: number, mouseY: number) {
    const bounds = this.shape.getBounds()
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    // Calculate angle from center to mouse
    const angle = Math.atan2(mouseY - centerY, mouseX - centerX)
    const degrees = (angle * 180) / Math.PI + 90 // Offset by 90 degrees so 0 is pointing up

    // Update shape rotation
    this.shape.props.rotation = Math.round(degrees)
  }

  getCursor(handleType: HandleType): string {
    const cursors: Record<HandleType, string> = {
      n: 'ns-resize',
      ne: 'nesw-resize',
      e: 'ew-resize',
      se: 'nwse-resize',
      s: 'ns-resize',
      sw: 'nesw-resize',
      w: 'ew-resize',
      nw: 'nwse-resize',
      rotate: 'grab',
    }
    return cursors[handleType]
  }
}
