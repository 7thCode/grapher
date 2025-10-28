<script lang="ts">
  import { onMount } from 'svelte'
  import { Renderer } from './engine/Renderer'
  import { ToolManager, type ToolType } from './engine/Tool'
  import type { HandleType } from './engine/TransformControls'
  import { saveSVGFile } from './utils/electron'

  let canvas: HTMLCanvasElement
  let canvasContainer: HTMLElement
  let renderer: Renderer
  let toolManager: ToolManager
  let currentTool: ToolType = 'rect'
  let isDragging = false
  let isResizing = false
  let draggedShapeId: string | null = null
  let resizeHandle: HandleType | null = null
  let dragStart = { x: 0, y: 0 }

  function resizeCanvas() {
    if (!canvas || !canvasContainer) return

    const rect = canvasContainer.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    if (renderer) {
      renderer.render()
    }
  }

  onMount(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderer = new Renderer(canvas, ctx)
    toolManager = new ToolManager()
    toolManager.setTool(currentTool)

    // Initial resize
    resizeCanvas()

    // Resize on window resize
    window.addEventListener('resize', resizeCanvas)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  })

  function setTool(tool: ToolType) {
    currentTool = tool
    if (toolManager) {
      toolManager.setTool(tool)
      renderer.selectShape(null)
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (!renderer || !toolManager) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (currentTool === 'select') {
      // Check if clicking on a resize handle first
      const handle = renderer.getHandleAt(x, y)
      if (handle) {
        isResizing = true
        resizeHandle = handle
        dragStart = { x, y }
        return
      }

      // Selection/drag mode
      const clickedShape = renderer.getShapeAt(x, y)
      if (clickedShape) {
        isDragging = true
        draggedShapeId = clickedShape.props.id
        dragStart = { x, y }
        renderer.selectShape(clickedShape.props.id)
      } else {
        renderer.selectShape(null)
      }
    } else {
      // Drawing mode
      toolManager.startDrawing(x, y)
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!renderer || !toolManager) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (currentTool === 'select') {
      if (isResizing && resizeHandle) {
        // Resizing shape
        const dx = x - dragStart.x
        const dy = y - dragStart.y
        renderer.resizeShape(resizeHandle, dx, dy)
        dragStart = { x, y }
      } else if (isDragging && draggedShapeId) {
        // Dragging shape
        const dx = x - dragStart.x
        const dy = y - dragStart.y
        renderer.moveShape(draggedShapeId, dx, dy)
        dragStart = { x, y }
      }
    } else {
      // Drawing preview (when not in select mode)
      const state = toolManager.getState()
      if (state.isDrawing) {
        toolManager.updateDrawing(x, y)
        renderer.setPreview(state.preview ?? null)
      }
    }
  }

  function handleMouseUp() {
    if (!renderer || !toolManager) return

    if (currentTool === 'select') {
      isDragging = false
      isResizing = false
      draggedShapeId = null
      resizeHandle = null
    } else {
      const shape = toolManager.finishDrawing()
      if (shape) {
        renderer.addShape(shape)
        renderer.selectShape(shape.props.id)
      }
      renderer.setPreview(null)
    }
  }

  async function exportSVG() {
    if (!renderer) return

    const svgString = renderer.exportSVG()
    console.log('=== Exported SVG ===')
    console.log(svgString)
    console.log('===================')

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(svgString)
      alert('SVG copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  async function saveSVG() {
    if (!renderer) return

    const svgString = renderer.exportSVG()
    const result = await saveSVGFile(svgString)

    if (result.success && !result.canceled) {
      alert(`SVG saved successfully!${result.filePath !== 'clipboard' ? `\nLocation: ${result.filePath}` : '\n(Copied to clipboard in browser mode)'}`)
    } else if (result.error) {
      alert(`Failed to save SVG: ${result.error}`)
    }
  }

  function clearCanvas() {
    if (!renderer) return
    const shapes = renderer.getShapes()
    shapes.forEach((s) => renderer.removeShape(s.props.id))
  }
</script>

<div class="container">
  <aside class="tool-palette">
    <h2>Tools</h2>

    <div class="tool-buttons">
      <button
        class:active={currentTool === 'select'}
        onclick={() => setTool('select')}
        title="Select Tool (V)"
      >
        <span class="icon">✋</span>
        <span class="label">Select</span>
      </button>
      <button
        class:active={currentTool === 'rect'}
        onclick={() => setTool('rect')}
        title="Rectangle Tool (R)"
      >
        <span class="icon">⬜</span>
        <span class="label">Rect</span>
      </button>
      <button
        class:active={currentTool === 'circle'}
        onclick={() => setTool('circle')}
        title="Circle Tool (C)"
      >
        <span class="icon">⭕</span>
        <span class="label">Circle</span>
      </button>
      <button
        class:active={currentTool === 'line'}
        onclick={() => setTool('line')}
        title="Line Tool (L)"
      >
        <span class="icon">📏</span>
        <span class="label">Line</span>
      </button>
      <button
        class:active={currentTool === 'path'}
        onclick={() => setTool('path')}
        title="Path Tool (P)"
      >
        <span class="icon">🖊️</span>
        <span class="label">Path</span>
      </button>
    </div>

    <div class="divider"></div>

    <div class="action-buttons">
      <button onclick={saveSVG} title="Save SVG to file">
        <span class="icon">💾</span>
        <span class="label">Save</span>
      </button>
      <button onclick={exportSVG} title="Copy SVG to clipboard">
        <span class="icon">📋</span>
        <span class="label">Copy</span>
      </button>
      <button onclick={clearCanvas} title="Clear all shapes">
        <span class="icon">🗑️</span>
        <span class="label">Clear</span>
      </button>
    </div>
  </aside>

  <main class="canvas-area" bind:this={canvasContainer}>
    <canvas
      bind:this={canvas}
      onmousedown={handleMouseDown}
      onmousemove={handleMouseMove}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseUp}
    ></canvas>
  </main>
</div>

<style>
  .container {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
  }

  .tool-palette {
    width: 80px;
    background: #2c2c2c;
    color: #fff;
    display: flex;
    flex-direction: column;
    padding: 8px 4px;
    gap: 6px;
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.15);
  }

  .tool-palette h2 {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tool-buttons,
  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-palette button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 4px;
    background: #3a3a3a;
    color: #ccc;
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 10px;
    margin: 0;
  }

  .tool-palette button .icon {
    font-size: 20px;
    line-height: 1;
  }

  .tool-palette button .label {
    font-size: 9px;
    font-weight: 500;
  }

  .tool-palette button:hover {
    background: #4a4a4a;
    border-color: #2196F3;
    color: #fff;
  }

  .tool-palette button.active {
    background: #2196F3;
    color: #fff;
    border-color: #1976D2;
  }

  .divider {
    height: 1px;
    background: #4a4a4a;
    margin: 4px 0;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #f0f0f0;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
    cursor: crosshair;
    margin: 0;
    display: block;
  }
</style>
