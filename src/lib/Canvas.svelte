<script lang="ts">
  import { onMount } from 'svelte'
  import { Renderer } from './engine/Renderer'
  import { ToolManager, type ToolType } from './engine/Tool'
  import type { HandleType } from './engine/TransformControls'
  import { saveSVGFile } from './utils/electron'
  import type { Shape } from './engine/Shape'
  import { Rect, Circle, Line, Path } from './engine/Shape'

  let canvas: HTMLCanvasElement
  let canvasContainer: HTMLElement
  let fileInput: HTMLInputElement
  let renderer: Renderer
  let toolManager: ToolManager
  let currentTool: ToolType = 'rect'
  let isDragging = false
  let isResizing = false
  let isRotating = false
  let draggedShapeId: string | null = null
  let resizeHandle: HandleType | null = null
  let dragStart = { x: 0, y: 0 }

  // Property editing state
  let selectedStroke = '#333333'
  let selectedStrokeWidth = 2
  let selectedFill = '#ff6b6b'
  let hasSelection = false

  // Clipboard for copy/paste
  let clipboardShape: Shape | null = null

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

    // Listen for menu events from Electron
    try {
      console.log('Checking for Electron environment...')

      // Access ipcRenderer exposed via preload script
      const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null

      if (ipcRenderer) {
        console.log('Setting up IPC listeners...')

        ipcRenderer.on('menu-load', () => {
          console.log('Received menu-load event')
          openLoadDialog()
        })
        ipcRenderer.on('menu-save', () => {
          console.log('Received menu-save event')
          saveSVG()
        })
        ipcRenderer.on('menu-copy', () => {
          console.log('Received menu-copy event')
          copyShape()
        })
        ipcRenderer.on('menu-paste', () => {
          console.log('Received menu-paste event')
          pasteShape()
        })

        console.log('IPC listeners registered successfully')

        return () => {
          window.removeEventListener('resize', resizeCanvas)
          ipcRenderer.removeAllListeners('menu-load')
          ipcRenderer.removeAllListeners('menu-save')
          ipcRenderer.removeAllListeners('menu-copy')
          ipcRenderer.removeAllListeners('menu-paste')
        }
      } else {
        console.log('ipcRenderer not available - not running in Electron')
      }
    } catch (err) {
      console.log('Error setting up IPC:', err)
    }

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
      // Check if clicking on a resize/rotate handle first
      const handle = renderer.getHandleAt(x, y)
      if (handle) {
        if (handle === 'rotate') {
          isRotating = true
        } else {
          isResizing = true
        }
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
      if (isRotating) {
        // Rotating shape
        renderer.rotateShape(x, y)
      } else if (isResizing && resizeHandle) {
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
      isRotating = false
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
    // Copy: Cmd+C / Ctrl+C
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      e.preventDefault()
      copyShape()
      return
    }

    // Paste: Cmd+V / Ctrl+V
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault()
      pasteShape()
      return
    }

    // ESC to cancel path drawing
    if (e.key === 'Escape' && currentTool === 'path') {
      toolManager.cancelDrawing()
      renderer.setPreview(null)
    }
  }

  function copyShape() {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      clipboardShape = selected
      console.log('Shape copied to clipboard')
    }
  }

  function pasteShape() {
    if (!renderer || !clipboardShape) return

    // Clone the shape with a new ID and offset position
    let newShape: Shape
    const offset = 20

    if (clipboardShape instanceof Rect) {
      newShape = new Rect({
        ...clipboardShape.props,
        id: `rect-${Date.now()}`,
        x: clipboardShape.props.x + offset,
        y: clipboardShape.props.y + offset
      })
    } else if (clipboardShape instanceof Circle) {
      newShape = new Circle({
        ...clipboardShape.props,
        id: `circle-${Date.now()}`,
        cx: clipboardShape.props.cx + offset,
        cy: clipboardShape.props.cy + offset,
        x: clipboardShape.props.x + offset,
        y: clipboardShape.props.y + offset
      })
    } else if (clipboardShape instanceof Line) {
      newShape = new Line({
        ...clipboardShape.props,
        id: `line-${Date.now()}`,
        x: clipboardShape.props.x + offset,
        y: clipboardShape.props.y + offset,
        x1: clipboardShape.props.x1 + offset,
        y1: clipboardShape.props.y1 + offset,
        x2: clipboardShape.props.x2 + offset,
        y2: clipboardShape.props.y2 + offset
      })
    } else if (clipboardShape instanceof Path) {
      newShape = new Path({
        ...clipboardShape.props,
        id: `path-${Date.now()}`,
        x: clipboardShape.props.x + offset,
        y: clipboardShape.props.y + offset,
        d: clipboardShape.props.d
      })
    } else {
      return
    }

    renderer.addShape(newShape)
    renderer.selectShape(newShape.props.id)
    hasSelection = true
    console.log('Shape pasted')
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

  function openLoadDialog() {
    console.log('openLoadDialog called, fileInput:', fileInput)
    fileInput?.click()
  }

  async function handleFileLoad(e: Event) {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      loadSVG(text)
      target.value = '' // Reset input
    } catch (err) {
      console.error('Failed to load SVG:', err)
      alert('Failed to load SVG file')
    }
  }

  function loadSVG(svgString: string) {
    if (!renderer) return

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) {
      alert('Invalid SVG file')
      return
    }

    // Parse rect elements
    const rects = svg.querySelectorAll('rect')
    rects.forEach((rect) => {
      const x = parseFloat(rect.getAttribute('x') || '0')
      const y = parseFloat(rect.getAttribute('y') || '0')
      const width = parseFloat(rect.getAttribute('width') || '0')
      const height = parseFloat(rect.getAttribute('height') || '0')
      const fill = rect.getAttribute('fill') || '#4CAF50'
      const stroke = rect.getAttribute('stroke') || undefined
      const strokeWidth = parseFloat(rect.getAttribute('stroke-width') || '1')

      const shape = new Rect({
        id: `rect-${Date.now()}-${Math.random()}`,
        x,
        y,
        width,
        height,
        fill,
        stroke,
        strokeWidth
      })
      renderer.addShape(shape)
    })

    // Parse circle elements
    const circles = svg.querySelectorAll('circle')
    circles.forEach((circle) => {
      const cx = parseFloat(circle.getAttribute('cx') || '0')
      const cy = parseFloat(circle.getAttribute('cy') || '0')
      const r = parseFloat(circle.getAttribute('r') || '0')
      const fill = circle.getAttribute('fill') || '#4CAF50'
      const stroke = circle.getAttribute('stroke') || undefined
      const strokeWidth = parseFloat(circle.getAttribute('stroke-width') || '1')

      const shape = new Circle({
        id: `circle-${Date.now()}-${Math.random()}`,
        x: cx - r,
        y: cy - r,
        cx,
        cy,
        r,
        fill,
        stroke,
        strokeWidth
      })
      renderer.addShape(shape)
    })

    // Parse line elements
    const lines = svg.querySelectorAll('line')
    lines.forEach((line) => {
      const x1 = parseFloat(line.getAttribute('x1') || '0')
      const y1 = parseFloat(line.getAttribute('y1') || '0')
      const x2 = parseFloat(line.getAttribute('x2') || '0')
      const y2 = parseFloat(line.getAttribute('y2') || '0')
      const stroke = line.getAttribute('stroke') || '#333'
      const strokeWidth = parseFloat(line.getAttribute('stroke-width') || '2')

      const shape = new Line({
        id: `line-${Date.now()}-${Math.random()}`,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        x1,
        y1,
        x2,
        y2,
        stroke,
        strokeWidth
      })
      renderer.addShape(shape)
    })

    // Parse path elements
    const paths = svg.querySelectorAll('path')
    paths.forEach((path) => {
      const d = path.getAttribute('d') || ''
      const stroke = path.getAttribute('stroke') || '#333'
      const strokeWidth = parseFloat(path.getAttribute('stroke-width') || '2')
      const fill = path.getAttribute('fill') || 'none'

      const shape = new Path({
        id: `path-${Date.now()}-${Math.random()}`,
        x: 0,
        y: 0,
        d,
        stroke,
        strokeWidth,
        fill: fill === 'none' ? undefined : fill
      })
      renderer.addShape(shape)
    })

    console.log('SVG loaded successfully')
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
      <button onclick={openLoadDialog} title="Load SVG from file">📂 Load</button>
      <button onclick={saveSVG} title="Save SVG to file">💾 Save</button>
      <button onclick={exportSVG} title="Copy SVG to clipboard">📋 Copy</button>
      <button onclick={clearCanvas} title="Clear all shapes">🗑️ Clear</button>
    </div>
  </header>

  <!-- Hidden file input for loading SVG -->
  <input
    type="file"
    accept=".svg"
    bind:this={fileInput}
    onchange={handleFileLoad}
    style="display: none"
  />

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
