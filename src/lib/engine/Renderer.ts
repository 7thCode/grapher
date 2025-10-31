import type { Shape } from './Shape'
import { Rect, Circle, Line, Path, TextBox } from './Shape'
import { TransformControls, type HandleType } from './TransformControls'

export class Renderer {
  private shapes: Shape[] = []
  private selectedId: string | null = null
  private previewShape: Shape | null = null
  private transformControls: TransformControls | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D
  ) {}

  addShape(shape: Shape) {
    this.shapes.push(shape)
    this.render()
  }

  removeShape(id: string) {
    this.shapes = this.shapes.filter((s) => s.props.id !== id)
    this.render()
  }

  moveShape(id: string, dx: number, dy: number) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    if (shape instanceof Rect) {
      shape.props.x += dx
      shape.props.y += dy
    } else if (shape instanceof Circle) {
      shape.props.cx += dx
      shape.props.cy += dy
    } else if (shape instanceof Line) {
      shape.props.x1 += dx
      shape.props.y1 += dy
      shape.props.x2 += dx
      shape.props.y2 += dy
    } else if (shape instanceof Path) {
      shape.props.x += dx
      shape.props.y += dy
      // TODO: update path data
    } else if (shape instanceof TextBox) {
      shape.props.x += dx
      shape.props.y += dy
    }

    this.render()
  }

  selectShape(id: string | null) {
    this.selectedId = id

    if (id) {
      const shape = this.shapes.find((s) => s.props.id === id)
      if (shape) {
        this.transformControls = new TransformControls(shape)
      }
    } else {
      this.transformControls = null
    }

    this.render()
  }

  getHandleAt(x: number, y: number): HandleType | null {
    if (!this.transformControls) return null
    return this.transformControls.getHandleAt(x, y)
  }

  resizeShape(handleType: HandleType, dx: number, dy: number) {
    if (!this.transformControls) return
    this.transformControls.resize(handleType, dx, dy)
    this.render()
  }

  rotateShape(mouseX: number, mouseY: number) {
    if (!this.transformControls) return
    this.transformControls.rotate(mouseX, mouseY)
    this.render()
  }

  getSelectedShape(): Shape | null {
    if (!this.selectedId) return null
    return this.shapes.find((s) => s.props.id === this.selectedId) || null
  }

  updateShapeProperties(id: string, props: Partial<{
    stroke: string
    strokeWidth: number
    fill: string
  }>) {
    const shape = this.shapes.find((s) => s.props.id === id)
    if (!shape) return

    if (props.stroke !== undefined) shape.props.stroke = props.stroke
    if (props.strokeWidth !== undefined) shape.props.strokeWidth = props.strokeWidth
    if (props.fill !== undefined) shape.props.fill = props.fill

    this.render()
  }

  getShapeAt(x: number, y: number): Shape | null {
    // Reverse iteration to prioritize top shapes
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      if (this.shapes[i].containsPoint(x, y)) {
        return this.shapes[i]
      }
    }
    return null
  }

  setPreview(shape: Shape | null) {
    this.previewShape = shape
    this.render()
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw all shapes
    for (const shape of this.shapes) {
      shape.render(this.ctx)
    }

    // Draw preview shape
    if (this.previewShape) {
      this.ctx.save()
      this.ctx.globalAlpha = 0.5
      this.previewShape.render(this.ctx)
      this.ctx.restore()
    }

    // Draw selection box and transform controls
    if (this.selectedId) {
      const selected = this.shapes.find((s) => s.props.id === this.selectedId)
      if (selected) {
        this.drawSelectionBox(selected)

        // Draw transform controls (resize handles)
        if (this.transformControls) {
          this.transformControls.render(this.ctx)
        }
      }
    }
  }

  private drawSelectionBox(shape: Shape) {
    const bounds = shape.getBounds()
    const rotation = shape.props.rotation || 0

    this.ctx.save()

    // Apply rotation around shape center
    if (rotation !== 0) {
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      this.ctx.translate(centerX, centerY)
      this.ctx.rotate((rotation * Math.PI) / 180)
      this.ctx.translate(-centerX, -centerY)
    }

    this.ctx.strokeStyle = '#2196F3'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4)
    this.ctx.setLineDash([])

    this.ctx.restore()
  }

  exportSVG(): string {
    const svgShapes = this.shapes.map((s) => s.toSVG()).join('\n  ')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvas.width}" height="${this.canvas.height}">
  ${svgShapes}
</svg>`
  }

  getShapes() {
    return this.shapes
  }
}
