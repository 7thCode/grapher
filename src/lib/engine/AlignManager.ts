import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox, Group } from './Shape'

export type AlignType =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

export type DistributeType = 'horizontal' | 'vertical'

export class AlignManager {
  /**
   * Align multiple shapes
   */
  alignShapes(shapes: Shape[], type: AlignType): void {
    if (shapes.length < 2) {
      console.warn('Need at least 2 shapes to align')
      return
    }

    // Calculate reference position based on all shapes
    const bounds = shapes.map((s) => s.getBounds())

    let reference = 0

    switch (type) {
      case 'left':
        reference = Math.min(...bounds.map((b) => b.x))
        for (const shape of shapes) {
          this.moveShapeTo(shape, reference, null)
        }
        break

      case 'center':
        {
          const minX = Math.min(...bounds.map((b) => b.x))
          const maxX = Math.max(...bounds.map((b) => b.x + b.width))
          reference = (minX + maxX) / 2
          for (const shape of shapes) {
            const shapeBounds = shape.getBounds()
            const targetX = reference - shapeBounds.width / 2
            this.moveShapeTo(shape, targetX, null)
          }
        }
        break

      case 'right':
        reference = Math.max(...bounds.map((b) => b.x + b.width))
        for (const shape of shapes) {
          const shapeBounds = shape.getBounds()
          const targetX = reference - shapeBounds.width
          this.moveShapeTo(shape, targetX, null)
        }
        break

      case 'top':
        reference = Math.min(...bounds.map((b) => b.y))
        for (const shape of shapes) {
          this.moveShapeTo(shape, null, reference)
        }
        break

      case 'middle':
        {
          const minY = Math.min(...bounds.map((b) => b.y))
          const maxY = Math.max(...bounds.map((b) => b.y + b.height))
          reference = (minY + maxY) / 2
          for (const shape of shapes) {
            const shapeBounds = shape.getBounds()
            const targetY = reference - shapeBounds.height / 2
            this.moveShapeTo(shape, null, targetY)
          }
        }
        break

      case 'bottom':
        reference = Math.max(...bounds.map((b) => b.y + b.height))
        for (const shape of shapes) {
          const shapeBounds = shape.getBounds()
          const targetY = reference - shapeBounds.height
          this.moveShapeTo(shape, null, targetY)
        }
        break
    }
  }

  /**
   * Distribute shapes evenly
   */
  distributeShapes(shapes: Shape[], type: DistributeType): void {
    if (shapes.length < 3) {
      console.warn('Need at least 3 shapes to distribute')
      return
    }

    const bounds = shapes.map((s, index) => ({
      shape: shapes[index],
      bounds: s.getBounds(),
    }))

    if (type === 'horizontal') {
      // Sort by x position
      bounds.sort((a, b) => a.bounds.x - b.bounds.x)

      const first = bounds[0].bounds
      const last = bounds[bounds.length - 1].bounds
      const totalSpace = last.x - (first.x + first.width)
      const gap = totalSpace / (bounds.length - 1)

      let currentX = first.x + first.width + gap

      for (let i = 1; i < bounds.length - 1; i++) {
        this.moveShapeTo(bounds[i].shape, currentX, null)
        currentX += bounds[i].bounds.width + gap
      }
    } else {
      // Sort by y position
      bounds.sort((a, b) => a.bounds.y - b.bounds.y)

      const first = bounds[0].bounds
      const last = bounds[bounds.length - 1].bounds
      const totalSpace = last.y - (first.y + first.height)
      const gap = totalSpace / (bounds.length - 1)

      let currentY = first.y + first.height + gap

      for (let i = 1; i < bounds.length - 1; i++) {
        this.moveShapeTo(bounds[i].shape, null, currentY)
        currentY += bounds[i].bounds.height + gap
      }
    }
  }

  /**
   * Make shapes same size
   */
  makeSameSize(shapes: Shape[], dimension: 'width' | 'height' | 'both'): void {
    if (shapes.length < 2) {
      console.warn('Need at least 2 shapes to resize')
      return
    }

    // Use first shape as reference
    const referenceBounds = shapes[0].getBounds()

    for (let i = 1; i < shapes.length; i++) {
      const shape = shapes[i]
      const bounds = shape.getBounds()

      if (dimension === 'width' || dimension === 'both') {
        this.resizeShape(shape, referenceBounds.width, null)
      }
      if (dimension === 'height' || dimension === 'both') {
        this.resizeShape(shape, null, referenceBounds.height)
      }
    }
  }

  /**
   * Move shape to absolute position
   */
  private moveShapeTo(shape: Shape, x: number | null, y: number | null): void {
    const currentBounds = shape.getBounds()
    const dx = x !== null ? x - currentBounds.x : 0
    const dy = y !== null ? y - currentBounds.y : 0

    if (shape instanceof Rect || shape instanceof Path || shape instanceof TextBox) {
      if (x !== null) shape.props.x += dx
      if (y !== null) shape.props.y += dy
    } else if (shape instanceof Circle) {
      if (x !== null) {
        shape.props.cx += dx
        shape.props.x += dx
      }
      if (y !== null) {
        shape.props.cy += dy
        shape.props.y += dy
      }
    } else if (shape instanceof Line) {
      if (x !== null) {
        shape.props.x1 += dx
        shape.props.x2 += dx
      }
      if (y !== null) {
        shape.props.y1 += dy
        shape.props.y2 += dy
      }
    } else if (shape instanceof Group) {
      // Move all children
      for (const child of shape.props.children) {
        this.moveShapeTo(child, x !== null ? child.getBounds().x + dx : null, y !== null ? child.getBounds().y + dy : null)
      }
      if (x !== null) shape.props.x += dx
      if (y !== null) shape.props.y += dy
    }
  }

  /**
   * Resize shape to specific size
   */
  private resizeShape(shape: Shape, width: number | null, height: number | null): void {
    if (shape instanceof Rect || shape instanceof TextBox) {
      if (width !== null && 'width' in shape.props) {
        shape.props.width = width
      }
      if (height !== null && 'height' in shape.props) {
        shape.props.height = height
      }
    } else if (shape instanceof Circle) {
      if (width !== null) {
        shape.props.radius = width / 2
      }
    } else if (shape instanceof Line) {
      const currentBounds = shape.getBounds()
      if (width !== null) {
        shape.props.x2 = shape.props.x1 + width
      }
      if (height !== null) {
        shape.props.y2 = shape.props.y1 + height
      }
    }
    // Path and Group resizing is more complex, skip for now
  }
}
