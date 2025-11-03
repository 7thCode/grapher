import type { Shape } from './Shape'
import { Rect, Circle, Line, TextBox, Group, Path } from './Shape'

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

    const bounds = this.shape.getBounds()
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const rotation = this.shape.props.rotation || 0

    ctx.save()

    // Apply rotation around shape center
    if (rotation !== 0) {
      ctx.translate(centerX, centerY)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    for (const handle of this.handles) {
      if (handle.type === 'rotate') {
        // Render rotation handle as a circle
        ctx.fillStyle = 'white'
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 2

        const hCenterX = handle.x + handle.size / 2
        const hCenterY = handle.y + handle.size / 2
        ctx.beginPath()
        ctx.arc(hCenterX, hCenterY, handle.size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw rotation icon (arrow curve)
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(hCenterX, hCenterY, 3, 0.3 * Math.PI, 1.7 * Math.PI)
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

    ctx.restore()
  }

  getHandleAt(x: number, y: number): HandleType | null {
    const bounds = this.shape.getBounds()
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const rotation = this.shape.props.rotation || 0

    // Transform mouse coordinates to unrotated space
    let transformedX = x
    let transformedY = y

    if (rotation !== 0) {
      const angle = (-rotation * Math.PI) / 180 // Negative for inverse rotation
      const dx = x - centerX
      const dy = y - centerY
      transformedX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle)
      transformedY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
    }

    for (const handle of this.handles) {
      if (handle.type === 'rotate') {
        // Circle hit detection for rotation handle
        const hCenterX = handle.x + handle.size / 2
        const hCenterY = handle.y + handle.size / 2
        const dx = transformedX - hCenterX
        const dy = transformedY - hCenterY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= handle.size / 2 + 2) {
          return handle.type
        }
      } else {
        // Rectangle hit detection for resize handles
        if (
          transformedX >= handle.x &&
          transformedX <= handle.x + handle.size &&
          transformedY >= handle.y &&
          transformedY <= handle.y + handle.size
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
    } else if (this.shape instanceof Path) {
      this.resizePath(handleType, dx, dy)
    } else if (this.shape instanceof TextBox) {
      this.resizeTextBox(handleType, dx, dy)
    } else if (this.shape instanceof Group) {
      this.resizeGroup(handleType, dx, dy)
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

  private resizeTextBox(handleType: HandleType, dx: number, dy: number) {
    const textBox = this.shape as TextBox
    const { x, y, width, height } = textBox.props

    switch (handleType) {
      case 'nw':
        textBox.props.x = x + dx
        textBox.props.y = y + dy
        textBox.props.width = width - dx
        textBox.props.height = height - dy
        break
      case 'n':
        textBox.props.y = y + dy
        textBox.props.height = height - dy
        break
      case 'ne':
        textBox.props.y = y + dy
        textBox.props.width = width + dx
        textBox.props.height = height - dy
        break
      case 'e':
        textBox.props.width = width + dx
        break
      case 'se':
        textBox.props.width = width + dx
        textBox.props.height = height + dy
        break
      case 's':
        textBox.props.height = height + dy
        break
      case 'sw':
        textBox.props.x = x + dx
        textBox.props.width = width - dx
        textBox.props.height = height + dy
        break
      case 'w':
        textBox.props.x = x + dx
        textBox.props.width = width - dx
        break
    }

    // Prevent negative or too small dimensions
    if (textBox.props.width < 50) {
      textBox.props.width = 50
    }
    if (textBox.props.height < 30) {
      textBox.props.height = 30
    }
  }

  private resizePath(handleType: HandleType, dx: number, dy: number) {
    const path = this.shape as Path
    const bounds = path.getBounds()
    const { x: oldX, y: oldY, width: oldWidth, height: oldHeight } = bounds

    // Calculate new bounds based on handle type
    let newX = oldX
    let newY = oldY
    let newWidth = oldWidth
    let newHeight = oldHeight

    switch (handleType) {
      case 'nw':
        newX = oldX + dx
        newY = oldY + dy
        newWidth = oldWidth - dx
        newHeight = oldHeight - dy
        break
      case 'n':
        newY = oldY + dy
        newHeight = oldHeight - dy
        break
      case 'ne':
        newY = oldY + dy
        newWidth = oldWidth + dx
        newHeight = oldHeight - dy
        break
      case 'e':
        newWidth = oldWidth + dx
        break
      case 'se':
        newWidth = oldWidth + dx
        newHeight = oldHeight + dy
        break
      case 's':
        newHeight = oldHeight + dy
        break
      case 'sw':
        newX = oldX + dx
        newWidth = oldWidth - dx
        newHeight = oldHeight + dy
        break
      case 'w':
        newX = oldX + dx
        newWidth = oldWidth - dx
        break
    }

    // Prevent negative or too small dimensions
    if (newWidth < 20) {
      newWidth = 20
      newX = oldX
    }
    if (newHeight < 20) {
      newHeight = 20
      newY = oldY
    }

    // Calculate scale factors
    const scaleX = newWidth / oldWidth
    const scaleY = newHeight / oldHeight

    // Determine origin point (the fixed point during resize)
    let originX = oldX
    let originY = oldY

    switch (handleType) {
      case 'nw':
        originX = oldX + oldWidth
        originY = oldY + oldHeight
        break
      case 'n':
        originX = oldX + oldWidth / 2
        originY = oldY + oldHeight
        break
      case 'ne':
        originX = oldX
        originY = oldY + oldHeight
        break
      case 'e':
        originX = oldX
        originY = oldY + oldHeight / 2
        break
      case 'se':
        originX = oldX
        originY = oldY
        break
      case 's':
        originX = oldX + oldWidth / 2
        originY = oldY
        break
      case 'sw':
        originX = oldX + oldWidth
        originY = oldY
        break
      case 'w':
        originX = oldX + oldWidth
        originY = oldY + oldHeight / 2
        break
    }

    // Scale all path points
    if (path.props.points) {
      for (const point of path.props.points) {
        const relX = point.x - originX
        const relY = point.y - originY
        point.x = originX + relX * scaleX
        point.y = originY + relY * scaleY

        // Scale control points if present
        if (point.cp1x !== undefined && point.cp1y !== undefined) {
          const relCp1X = point.cp1x - originX
          const relCp1Y = point.cp1y - originY
          point.cp1x = originX + relCp1X * scaleX
          point.cp1y = originY + relCp1Y * scaleY
        }
        if (point.cp2x !== undefined && point.cp2y !== undefined) {
          const relCp2X = point.cp2x - originX
          const relCp2Y = point.cp2y - originY
          point.cp2x = originX + relCp2X * scaleX
          point.cp2y = originY + relCp2Y * scaleY
        }
        if (point.cpx !== undefined && point.cpy !== undefined) {
          const relCpX = point.cpx - originX
          const relCpY = point.cpy - originY
          point.cpx = originX + relCpX * scaleX
          point.cpy = originY + relCpY * scaleY
        }
      }

      // Regenerate path data string from updated points
      let d = ''
      for (let i = 0; i < path.props.points.length; i++) {
        const point = path.props.points[i]
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
      if (path.props.closed) {
        d += 'Z'
      }
      path.props.d = d.trim()
    }
  }


  private resizeGroup(handleType: HandleType, dx: number, dy: number) {
    const group = this.shape as Group
    const bounds = group.getBounds()
    const { x: oldX, y: oldY, width: oldWidth, height: oldHeight } = bounds

    // Calculate new bounds based on handle type
    let newX = oldX
    let newY = oldY
    let newWidth = oldWidth
    let newHeight = oldHeight

    switch (handleType) {
      case 'nw':
        newX = oldX + dx
        newY = oldY + dy
        newWidth = oldWidth - dx
        newHeight = oldHeight - dy
        break
      case 'n':
        newY = oldY + dy
        newHeight = oldHeight - dy
        break
      case 'ne':
        newY = oldY + dy
        newWidth = oldWidth + dx
        newHeight = oldHeight - dy
        break
      case 'e':
        newWidth = oldWidth + dx
        break
      case 'se':
        newWidth = oldWidth + dx
        newHeight = oldHeight + dy
        break
      case 's':
        newHeight = oldHeight + dy
        break
      case 'sw':
        newX = oldX + dx
        newWidth = oldWidth - dx
        newHeight = oldHeight + dy
        break
      case 'w':
        newX = oldX + dx
        newWidth = oldWidth - dx
        break
    }

    // Prevent negative or too small dimensions
    if (newWidth < 20) {
      newWidth = 20
      newX = oldX
    }
    if (newHeight < 20) {
      newHeight = 20
      newY = oldY
    }

    // Calculate scale factors
    const scaleX = newWidth / oldWidth
    const scaleY = newHeight / oldHeight

    // Determine origin point (the fixed point during resize)
    let originX = oldX
    let originY = oldY

    switch (handleType) {
      case 'nw':
        originX = oldX + oldWidth
        originY = oldY + oldHeight
        break
      case 'n':
        originX = oldX + oldWidth / 2
        originY = oldY + oldHeight
        break
      case 'ne':
        originX = oldX
        originY = oldY + oldHeight
        break
      case 'e':
        originX = oldX
        originY = oldY + oldHeight / 2
        break
      case 'se':
        originX = oldX
        originY = oldY
        break
      case 's':
        originX = oldX + oldWidth / 2
        originY = oldY
        break
      case 'sw':
        originX = oldX + oldWidth
        originY = oldY
        break
      case 'w':
        originX = oldX + oldWidth
        originY = oldY + oldHeight / 2
        break
    }

    // Recursively scale all children
    this.scaleGroupChildren(group, scaleX, scaleY, originX, originY)
  }

  private scaleGroupChildren(
    group: Group,
    scaleX: number,
    scaleY: number,
    originX: number,
    originY: number
  ) {
    for (const child of group.props.children) {
      if (child instanceof Rect) {
        // Scale rectangle
        const relX = child.props.x - originX
        const relY = child.props.y - originY
        child.props.x = originX + relX * scaleX
        child.props.y = originY + relY * scaleY
        child.props.width *= scaleX
        child.props.height *= scaleY
      } else if (child instanceof Circle) {
        // Scale circle
        const relX = child.props.cx - originX
        const relY = child.props.cy - originY
        child.props.cx = originX + relX * scaleX
        child.props.cy = originY + relY * scaleY
        child.props.r *= Math.min(scaleX, scaleY)
      } else if (child instanceof Line) {
        // Scale line
        const relX1 = child.props.x1 - originX
        const relY1 = child.props.y1 - originY
        const relX2 = child.props.x2 - originX
        const relY2 = child.props.y2 - originY
        child.props.x1 = originX + relX1 * scaleX
        child.props.y1 = originY + relY1 * scaleY
        child.props.x2 = originX + relX2 * scaleX
        child.props.y2 = originY + relY2 * scaleY
      } else if (child instanceof TextBox) {
        // Scale text box
        const relX = child.props.x - originX
        const relY = child.props.y - originY
        child.props.x = originX + relX * scaleX
        child.props.y = originY + relY * scaleY
        child.props.width *= scaleX
        child.props.height *= scaleY
        // Optionally scale font size
        child.props.fontSize *= Math.min(scaleX, scaleY)
      } else if (child instanceof Path) {
        // Scale path points
        for (const point of child.props.points) {
          const relX = point.x - originX
          const relY = point.y - originY
          point.x = originX + relX * scaleX
          point.y = originY + relY * scaleY

          // Scale control points if present (for Bezier curves)
          if (point.cp1x !== undefined && point.cp1y !== undefined) {
            const relCp1X = point.cp1x - originX
            const relCp1Y = point.cp1y - originY
            point.cp1x = originX + relCp1X * scaleX
            point.cp1y = originY + relCp1Y * scaleY
          }
          if (point.cp2x !== undefined && point.cp2y !== undefined) {
            const relCp2X = point.cp2x - originX
            const relCp2Y = point.cp2y - originY
            point.cp2x = originX + relCp2X * scaleX
            point.cp2y = originY + relCp2Y * scaleY
          }
          if (point.cpx !== undefined && point.cpy !== undefined) {
            const relCpX = point.cpx - originX
            const relCpY = point.cpy - originY
            point.cpx = originX + relCpX * scaleX
            point.cpy = originY + relCpY * scaleY
          }
        }
        // Update the path data string
        child.updatePathData()
      } else if (child instanceof Group) {
        // Recursively scale nested groups
        this.scaleGroupChildren(child, scaleX, scaleY, originX, originY)
      }
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
