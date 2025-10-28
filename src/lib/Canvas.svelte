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

  // Property editing state
  let selectedStroke = '#333333'
  let selectedStrokeWidth = 2
  let selectedFill = '#ff6b6b'
  let hasSelection = false

  $: {
    // Update property controls when selection changes
    if (renderer) {
      const selected = renderer.getSelectedShape()
      hasSelection = selected !== null
      if (selected) {
        selectedStroke = selected.props.stroke || '#333333'
        selectedStrokeWidth = selected.props.strokeWidth || 2
        selectedFill = selected.props.fill || '#ff6b6b'
      }
    }
  }

  function updateStroke(color: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      renderer.updateShapeProperties(selected.props.id, { stroke: color })
      selectedStroke = color
    }
  }

  function updateStrokeWidth(width: number) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      renderer.updateShapeProperties(selected.props.id, { strokeWidth: width })
      selectedStrokeWidth = width
    }
  }

  function updateFill(color: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      renderer.updateShapeProperties(selected.props.id, { fill: color })
      selectedFill = color
    }
  }

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
      hasSelection = false
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
        hasSelection = true
      } else {
        renderer.selectShape(null)
        hasSelection = false
      }
    } else if (currentTool === 'path') {
      // Path tool: add point on click
      toolManager.addPathPoint(x, y)
      const state = toolManager.getState()
      renderer.setPreview(state.preview ?? null)
    } else {
      // Drawing mode for other tools
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
    } else if (currentTool === 'path') {
      // Path tool: update preview with current mouse position
      const state = toolManager.getState()
      if (state.isDrawing) {
        toolManager.updateDrawing(x, y)
        renderer.setPreview(state.preview ?? null)
      }
    } else {
      // Drawing preview for other tools
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
    } else if (currentTool === 'path') {
      // Path tool: do nothing on mouse up (continue drawing)
    } else {
      // Other tools: finish drawing on mouse up
      const shape = toolManager.finishDrawing()
      if (shape) {
        renderer.addShape(shape)
        renderer.selectShape(shape.props.id)
        hasSelection = true
      }
      renderer.setPreview(null)
    }
  }

  function handleDblClick(e: MouseEvent) {
    if (!renderer || !toolManager || currentTool !== 'path') return

    // Double click to finish path
    const shape = toolManager.finishPath()
    if (shape) {
      renderer.addShape(shape)
      renderer.selectShape(shape.props.id)
      hasSelection = true
    }
    renderer.setPreview(null)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && currentTool === 'path') {
      // ESC to cancel path drawing
      toolManager.cancelDrawing()
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

<div class="app-container">
  <header class="top-toolbar">
    <div class="toolbar-section">
      <label class="toolbar-label">
        <span>線色</span>
        <input
          type="color"
          value={selectedStroke}
          oninput={(e) => updateStroke(e.currentTarget.value)}
          disabled={!hasSelection}
        />
      </label>

      <label class="toolbar-label">
        <span>線幅</span>
        <input
          type="range"
          min="1"
          max="20"
          value={selectedStrokeWidth}
          oninput={(e) => updateStrokeWidth(Number(e.currentTarget.value))}
          disabled={!hasSelection}
        />
        <span class="value-display">{selectedStrokeWidth}px</span>
      </label>

      <label class="toolbar-label">
        <span>塗色</span>
        <input
          type="color"
          value={selectedFill}
          oninput={(e) => updateFill(e.currentTarget.value)}
          disabled={!hasSelection}
        />
      </label>
    </div>

    <div class="toolbar-section">
      <button onclick={saveSVG} title="Save SVG to file">💾 Save</button>
      <button onclick={exportSVG} title="Copy SVG to clipboard">📋 Copy</button>
      <button onclick={clearCanvas} title="Clear all shapes">🗑️ Clear</button>
    </div>
  </header>

  <div class="main-content">
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
    </aside>

    <main class="canvas-area" bind:this={canvasContainer}>
      <canvas
        bind:this={canvas}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onmouseleave={handleMouseUp}
        ondblclick={handleDblClick}
      ></canvas>
    </main>
  </div>
</div>

<svelte:window onkeydown={handleKeyDown} />

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
  }

  .top-toolbar {
    height: 50px;
    background: #2c2c2c;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    gap: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .toolbar-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #ccc;
  }

  .toolbar-label input[type="color"] {
    width: 40px;
    height: 28px;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  .toolbar-label input[type="color"]:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .toolbar-label input[type="range"] {
    width: 120px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #555;
    outline: none;
    border-radius: 2px;
  }

  .toolbar-label input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: #2196F3;
    cursor: pointer;
    border-radius: 50%;
  }

  .toolbar-label input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #2196F3;
    cursor: pointer;
    border-radius: 50%;
    border: none;
  }

  .toolbar-label input[type="range"]:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .toolbar-label .value-display {
    min-width: 40px;
    font-size: 12px;
    color: #fff;
    font-weight: 600;
  }

  .toolbar-section button {
    padding: 6px 12px;
    font-size: 12px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .toolbar-section button:hover {
    background: #45a049;
  }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
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

  .tool-buttons {
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
