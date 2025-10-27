<script lang="ts">
  import { onMount } from 'svelte'
  import { Renderer } from './engine/Renderer'
  import { ToolManager, type ToolType } from './engine/Tool'
  import type { HandleType } from './engine/TransformControls'
  import { saveSVGFile } from './utils/electron'

  let canvas: HTMLCanvasElement
  let renderer: Renderer
  let toolManager: ToolManager
  let currentTool: ToolType = 'rect'
  let isDragging = false
  let isResizing = false
  let draggedShapeId: string | null = null
  let resizeHandle: HandleType | null = null
  let dragStart = { x: 0, y: 0 }

  onMount(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderer = new Renderer(canvas, ctx)
    toolManager = new ToolManager()
    toolManager.setTool(currentTool)
    renderer.render()
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
  <div class="toolbar">
    <h2>Grapher - Phase 1 Prototype</h2>

    <div class="tools">
      <button
        class:active={currentTool === 'select'}
        onclick={() => setTool('select')}
        title="Select Tool (V)"
      >
        ✋ Select
      </button>
      <button
        class:active={currentTool === 'rect'}
        onclick={() => setTool('rect')}
        title="Rectangle Tool (R)"
      >
        ⬜ Rect
      </button>
      <button
        class:active={currentTool === 'circle'}
        onclick={() => setTool('circle')}
        title="Circle Tool (C)"
      >
        ⭕ Circle
      </button>
      <button
        class:active={currentTool === 'line'}
        onclick={() => setTool('line')}
        title="Line Tool (L)"
      >
        📏 Line
      </button>
      <button
        class:active={currentTool === 'path'}
        onclick={() => setTool('path')}
        title="Path Tool (P)"
      >
        🖊️ Path
      </button>
    </div>

    <div class="buttons">
      <button onclick={saveSVG} title="Save SVG to file">💾 Save SVG</button>
      <button onclick={exportSVG} title="Copy SVG to clipboard">📋 Copy SVG</button>
      <button onclick={clearCanvas} title="Clear all shapes">🗑️ Clear All</button>
    </div>
  </div>

  <div class="canvas-container">
    <canvas
      bind:this={canvas}
      width="800"
      height="600"
      onmousedown={handleMouseDown}
      onmousemove={handleMouseMove}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseUp}
    ></canvas>
  </div>

  <div class="instructions">
    <h3>Instructions:</h3>
    <ul>
      <li><strong>Select Tool (✋)</strong>: Click to select, drag to move shapes</li>
      <li><strong>Shape Tools (⬜⭕📏🖊️)</strong>: Click and drag to create shapes</li>
      <li><strong>Save SVG (💾)</strong>: Save as .svg file to disk</li>
      <li><strong>Copy SVG (📋)</strong>: Copy to clipboard & console output</li>
      <li><strong>Clear All (🗑️)</strong>: Remove all shapes from canvas</li>
    </ul>
    <p><em>Current Tool: {currentTool.toUpperCase()}</em></p>
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 20px;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 15px;
    background: #f5f5f5;
    border-radius: 8px;
    gap: 20px;
  }

  .toolbar h2 {
    margin: 0;
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .tools {
    display: flex;
    gap: 5px;
    flex: 1;
    justify-content: center;
  }

  .tools button {
    padding: 8px 16px;
    font-size: 14px;
    background: white;
    color: #333;
    border: 2px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tools button:hover {
    border-color: #2196F3;
    background: #E3F2FD;
  }

  .tools button.active {
    background: #2196F3;
    color: white;
    border-color: #1976D2;
  }

  .buttons {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .buttons button {
    padding: 10px 20px;
    font-size: 14px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .buttons button:hover {
    background: #45a049;
  }

  .canvas-container {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #fafafa;
    border-radius: 8px;
    overflow: hidden;
  }

  canvas {
    border: 2px solid #ddd;
    background: white;
    cursor: crosshair;
  }

  .instructions {
    margin-top: 20px;
    padding: 15px;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .instructions h3 {
    margin-top: 0;
  }

  .instructions ul {
    margin: 10px 0;
    padding-left: 20px;
  }

  .instructions li {
    margin: 5px 0;
  }

  .instructions p {
    margin: 10px 0 0 0;
    font-weight: 600;
    color: #2196F3;
  }
</style>
