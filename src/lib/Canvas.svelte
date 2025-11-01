<script lang="ts">
  import { onMount } from 'svelte'
  import { Renderer } from './engine/Renderer'
  import { ToolManager, type ToolType } from './engine/Tool'
  import type { HandleType } from './engine/TransformControls'
  import { saveSVGFile } from './utils/electron'
  import type { Shape } from './engine/Shape'
  import { Rect, Circle, Line, Path, TextBox } from './engine/Shape'

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

  // Track cumulative move/resize for Undo/Redo
  let totalMoveOffset = { dx: 0, dy: 0 }
  let resizeStartBounds: { x: number; y: number; width: number; height: number } | null = null

  // Property editing state
  let selectedStroke = '#333333'
  let selectedStrokeWidth = 2
  let selectedFill = '#ff6b6b'
  let hasSelection = false

  // Text properties
  let selectedFontFamily = 'Arial'
  let selectedFontSize = 24
  let selectedFontWeight = 'normal'
  let selectedFontStyle = 'normal'
  let selectedTextDecoration = 'none'
  let selectedFontColor = '#000000'
  let isTextBoxSelected = false

  // Clipboard for copy/paste
  let clipboardShape: Shape | null = null

  // Text editing state
  let isEditingText = false
  let editingTextBox: TextBox | null = null
  let textEditorDiv: HTMLDivElement | null = null

  // Path editing state
  let isEditingPath = false
  let editingPath: Path | null = null

  // File management state
  let currentFilePath: string | null = null
  let isDirty = false

  // Helper function to set isDirty and window.isDirty
  function setDirty(value: boolean) {
    isDirty = value
    if (typeof window !== 'undefined') {
      (window as any).isDirty = value
    }
  }

  // Snap settings
  let snapEnabled = true
  let gridEnabled = true

  // Update snap settings reactively
  $effect(() => {
    if (renderer) {
      const snapManager = renderer.getSnapManager()
      snapManager.setSettings({
        enabled: snapEnabled,
        gridEnabled: gridEnabled,
      })
    }
  })

  // Expose isDirty to window for Electron main process
  $effect(() => {
    if (typeof window !== 'undefined') {
      (window as any).isDirty = isDirty
    }
  })

  // Update selection-related state
  function updateSelectionState() {
    if (renderer) {
      const selected = renderer.getSelectedShape()
      hasSelection = selected !== null
      isTextBoxSelected = selected instanceof TextBox

      if (selected) {
        selectedStroke = selected.props.stroke || '#333333'
        selectedStrokeWidth = selected.props.strokeWidth || 2
        selectedFill = selected.props.fill || '#ff6b6b'

        // Update text properties if TextBox is selected
        if (selected instanceof TextBox) {
          selectedFontFamily = selected.props.fontFamily || 'Arial'
          selectedFontSize = selected.props.fontSize || 24
          selectedFontWeight = selected.props.fontWeight || 'normal'
          selectedFontStyle = selected.props.fontStyle || 'normal'
          selectedTextDecoration = selected.props.textDecoration || 'none'
          selectedFontColor = selected.props.fontColor || '#000000'
        }
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

  function updateFontFamily(fontFamily: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { fontFamily: selected.props.fontFamily }
      const newProps = { fontFamily }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedFontFamily = fontFamily
    }
  }

  function updateFontSize(fontSize: number) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { fontSize: selected.props.fontSize }
      const newProps = { fontSize }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedFontSize = fontSize
    }
  }

  function updateFontWeight(fontWeight: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { fontWeight: selected.props.fontWeight }
      const newProps = { fontWeight }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedFontWeight = fontWeight
    }
  }

  function updateFontStyle(fontStyle: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { fontStyle: selected.props.fontStyle }
      const newProps = { fontStyle }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedFontStyle = fontStyle
    }
  }

  function updateTextDecoration(textDecoration: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { textDecoration: selected.props.textDecoration }
      const newProps = { textDecoration }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedTextDecoration = textDecoration
    }
  }

  function updateFontColor(fontColor: string) {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected instanceof TextBox) {
      const oldProps = { fontColor: selected.props.fontColor }
      const newProps = { fontColor }
      renderer.commitUpdateProperties(selected.props.id, oldProps, newProps)
      selectedFontColor = fontColor
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
    if (!ctx) {
      console.error('Failed to get canvas context')
      return
    }

    renderer = new Renderer(canvas, ctx)
    toolManager = new ToolManager()
    toolManager.setTool(currentTool)

    // Set up change callback for isDirty tracking
    renderer.setOnChangeCallback(() => {
      setDirty(true)
    })

    // Initial resize
    resizeCanvas()

    // Resize on window resize
    window.addEventListener('resize', resizeCanvas)

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!renderer) return

      // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        renderer.undo()
        return
      }

      // Redo: Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        renderer.redo()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Listen for menu events from Electron
    try {
      // Access ipcRenderer exposed via preload script
      const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null

      if (ipcRenderer) {
        ipcRenderer.on('menu-undo', () => {
          if (renderer) renderer.undo()
        })
        ipcRenderer.on('menu-redo', () => {
          if (renderer) renderer.redo()
        })
        ipcRenderer.on('menu-load', () => {
          openLoadDialog()
        })
        ipcRenderer.on('menu-save', () => {
          saveSVG()
        })
        ipcRenderer.on('menu-save-as', () => {
          saveSVGAs()
        })
        ipcRenderer.on('menu-copy', () => {
          copyShape()
        })
        ipcRenderer.on('menu-paste', () => {
          pasteShape()
        })
        ipcRenderer.on('menu-bring-to-front', () => {
          bringToFront()
        })
        ipcRenderer.on('menu-bring-forward', () => {
          bringForward()
        })
        ipcRenderer.on('menu-send-backward', () => {
          sendBackward()
        })
        ipcRenderer.on('menu-send-to-back', () => {
          sendToBack()
        })
        ipcRenderer.on('menu-group', () => {
          groupShapes()
        })
        ipcRenderer.on('menu-ungroup', () => {
          ungroupShapes()
        })

        return () => {
          window.removeEventListener('resize', resizeCanvas)
          window.removeEventListener('keydown', handleKeyDown)
          ipcRenderer.removeAllListeners('menu-undo')
          ipcRenderer.removeAllListeners('menu-redo')
          ipcRenderer.removeAllListeners('menu-load')
          ipcRenderer.removeAllListeners('menu-save')
          ipcRenderer.removeAllListeners('menu-save-as')
          ipcRenderer.removeAllListeners('menu-copy')
          ipcRenderer.removeAllListeners('menu-paste')
          ipcRenderer.removeAllListeners('menu-bring-to-front')
          ipcRenderer.removeAllListeners('menu-bring-forward')
          ipcRenderer.removeAllListeners('menu-send-backward')
          ipcRenderer.removeAllListeners('menu-send-to-back')
          ipcRenderer.removeAllListeners('menu-group')
          ipcRenderer.removeAllListeners('menu-ungroup')
        }
      }
    } catch (err) {
      console.error('Error setting up IPC:', err)
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('keydown', handleKeyDown)
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

    // Path editing mode
    if (isEditingPath) {
      const pathEditManager = renderer.getPathEditManager()
      const pathHandle = pathEditManager.getHandleAt(x, y)

      if (pathHandle) {
        // Start dragging a path handle
        isDragging = true
        dragStart = { x, y }
        // Store handle reference for later use
        ;(window as any)._draggedPathHandle = pathHandle
        return
      } else {
        // Click outside - stop editing
        stopPathEditing()
        return
      }
    }

    if (currentTool === 'select') {
      // Check if clicking on a resize/rotate handle first
      const handle = renderer.getHandleAt(x, y)
      if (handle) {
        if (handle === 'rotate') {
          isRotating = true
        } else {
          isResizing = true
          // Record initial bounds for Undo/Redo
          const selectedShape = renderer.getSelectedShape()
          if (selectedShape) {
            resizeStartBounds = selectedShape.getBounds()
          }
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
        totalMoveOffset = { dx: 0, dy: 0 }  // Reset cumulative move

        // Shift+Click for multiple selection
        if (e.shiftKey) {
          renderer.selectShape(clickedShape.props.id, true) // addToSelection = true
        } else {
          renderer.selectShape(clickedShape.props.id)
        }
        hasSelection = true
      } else {
        // Clicking on empty area clears selection (unless Shift is held)
        if (!e.shiftKey) {
          renderer.selectShape(null)
          hasSelection = false
        }
      }
    } else if (currentTool === 'path') {
      // Path tool: add point on click
      toolManager.addPathPoint(x, y)
      const state = toolManager.getState()
      renderer.setPreview(state.preview ?? null)
    } else if (currentTool === 'text') {
      // Text tool: start drawing text box
      toolManager.startDrawing(x, y)
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

    // Path editing mode
    if (isEditingPath && isDragging) {
      const pathHandle = (window as any)._draggedPathHandle
      if (pathHandle) {
        const dx = x - dragStart.x
        const dy = y - dragStart.y
        renderer.getPathEditManager().moveHandle(pathHandle, dx, dy)
        dragStart = { x, y }
      }
      return
    }

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
      } else if (isDragging) {
        // Dragging shape(s) with snapping
        const selectedIds = renderer.getSelectedIds()

        // Snap to grid/shapes
        const snapResult = renderer.snapPoint(x, y, selectedIds)
        const snappedX = snapResult.x
        const snappedY = snapResult.y

        // Set snap guides
        renderer.setSnapGuides(snapResult.guides)

        const dx = snappedX - dragStart.x
        const dy = snappedY - dragStart.y

        // Move all selected shapes
        for (const id of selectedIds) {
          renderer.moveShape(id, dx, dy)
        }

        totalMoveOffset.dx += dx  // Accumulate total movement
        totalMoveOffset.dy += dy
        dragStart = { x: snappedX, y: snappedY }
      }
    } else if (currentTool === 'path') {
      // Path tool: update preview with current mouse position
      const state = toolManager.getState()
      if (state.isDrawing) {
        toolManager.updateDrawing(x, y)
        renderer.setPreview(state.preview ?? null)
      }
    } else if (currentTool === 'text') {
      // Text tool: update text box preview
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
      // Commit move/resize to Command history
      if (isDragging) {
        // Commit move for all selected shapes
        const selectedIds = renderer.getSelectedIds()
        for (const id of selectedIds) {
          renderer.commitMove(id, totalMoveOffset.dx, totalMoveOffset.dy)
        }
      }
      if (isResizing && resizeStartBounds && renderer.getSelectedShape()) {
        renderer.commitResize(renderer.getSelectedShape()!.props.id, resizeStartBounds)
      }

      // Reset drag/resize state
      isDragging = false
      isResizing = false
      isRotating = false
      draggedShapeId = null
      resizeHandle = null
      resizeStartBounds = null

      // Clear snap guides
      renderer.clearSnapGuides()
    } else if (isEditingPath) {
      // Path editing mode: reset drag state
      if (isDragging) {
        isDragging = false
        ;(window as any)._draggedPathHandle = null
      }
    } else if (currentTool === 'path') {
      // Path tool: do nothing on mouse up (continue drawing)
    } else if (currentTool === 'text') {
      // Text tool: finish drawing text box
      const shape = toolManager.finishDrawing()
      if (shape && shape instanceof TextBox) {
        renderer.addShape(shape)
        renderer.setPreview(null)
        // Immediately start editing the newly created text box
        startTextEditing(shape)
      } else {
        renderer.setPreview(null)
      }
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
    if (!renderer || !toolManager) return

    // Double click to finish path
    if (currentTool === 'path') {
      const shape = toolManager.finishPath()
      if (shape) {
        renderer.addShape(shape)
        renderer.selectShape(shape.props.id)
        hasSelection = true
      }
      renderer.setPreview(null)
      return
    }

    // Double click to edit text box or path
    if (currentTool === 'select') {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const shape = renderer.getShapeAt(x, y)
      if (shape instanceof TextBox) {
        startTextEditing(shape)
      } else if (shape instanceof Path) {
        startPathEditing(shape)
      }
    }
  }

  function startTextEditing(textBox: TextBox) {
    if (!canvas) return

    isEditingText = true
    editingTextBox = textBox

    // Create editing div overlay
    const editorDiv = document.createElement('div')
    editorDiv.contentEditable = 'true'
    editorDiv.innerHTML = textBox.props.text.replace(/\n/g, '<br>')
    editorDiv.style.position = 'absolute'
    editorDiv.style.left = `${textBox.props.x}px`
    editorDiv.style.top = `${textBox.props.y}px`
    editorDiv.style.width = `${textBox.props.width}px`
    editorDiv.style.height = `${textBox.props.height}px`
    editorDiv.style.fontSize = `${textBox.props.fontSize}px`
    editorDiv.style.color = textBox.props.fontColor
    editorDiv.style.fontFamily = textBox.props.fontFamily || 'Arial'
    editorDiv.style.fontWeight = textBox.props.fontWeight || 'normal'
    editorDiv.style.fontStyle = textBox.props.fontStyle || 'normal'
    editorDiv.style.lineHeight = `${textBox.props.lineHeight || 1.2}`
    editorDiv.style.padding = '5px'
    editorDiv.style.border = '2px solid #2196F3'
    editorDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'
    editorDiv.style.outline = 'none'
    editorDiv.style.zIndex = '1000'
    editorDiv.style.wordWrap = 'break-word'
    editorDiv.style.overflow = 'auto'

    // Apply rotation if present
    if (textBox.props.rotation) {
      const centerX = textBox.props.x + textBox.props.width / 2
      const centerY = textBox.props.y + textBox.props.height / 2
      editorDiv.style.transformOrigin = 'center'
      editorDiv.style.transform = `rotate(${textBox.props.rotation}deg)`
    }

    textEditorDiv = editorDiv
    canvas.parentElement?.appendChild(editorDiv)
    editorDiv.focus()

    // Select all text
    const range = document.createRange()
    range.selectNodeContents(editorDiv)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    // Handle blur to finish editing
    const finishEditing = () => {
      if (editingTextBox && textEditorDiv) {
        // Convert HTML back to plain text with newlines
        const htmlContent = textEditorDiv.innerHTML
        const textWithNewlines = htmlContent
          .replace(/<div>/gi, '\n')
          .replace(/<\/div>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .trim()

        editingTextBox.props.text = textWithNewlines || 'Text'

        textEditorDiv.remove()
        textEditorDiv = null
        editingTextBox = null
        isEditingText = false
        renderer?.render()
      }
    }

    editorDiv.addEventListener('blur', finishEditing)
    editorDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finishEditing()
      }
    })
  }

  function startPathEditing(path: Path) {
    if (!renderer) return

    isEditingPath = true
    editingPath = path
    renderer.startPathEditing(path)
  }

  function stopPathEditing() {
    if (!renderer) return

    isEditingPath = false
    editingPath = null
    renderer.stopPathEditing()
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Delete: Delete or Backspace key to delete selected shape
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
      e.preventDefault()
      deleteSelectedShape()
      return
    }

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

    // Bring to Front: Cmd+Shift+]
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ']') {
      e.preventDefault()
      bringToFront()
      return
    }

    // Bring Forward: Cmd+]
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ']') {
      e.preventDefault()
      bringForward()
      return
    }

    // Send Backward: Cmd+[
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === '[') {
      e.preventDefault()
      sendBackward()
      return
    }

    // Send to Back: Cmd+Shift+[
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '[') {
      e.preventDefault()
      sendToBack()
      return
    }

    // Group: Cmd+G
    if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
      e.preventDefault()
      groupShapes()
      return
    }

    // Ungroup: Cmd+Shift+G
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'g') {
      e.preventDefault()
      ungroupShapes()
      return
    }

    // ESC to cancel path drawing or exit path editing
    if (e.key === 'Escape') {
      if (currentTool === 'path') {
        toolManager.cancelDrawing()
        renderer.setPreview(null)
      } else if (isEditingPath) {
        stopPathEditing()
      }
      return
    }

    // Path editing shortcuts
    if (isEditingPath && renderer) {
      const pathEditManager = renderer.getPathEditManager()
      const editingPath = pathEditManager.getEditingPath()

      // A: Add point
      if (e.key === 'a' && editingPath && editingPath.props.points) {
        e.preventDefault()
        const lastPoint = editingPath.props.points[editingPath.props.points.length - 1]
        const x = lastPoint.x + 50
        const y = lastPoint.y
        pathEditManager.addPoint(x, y)
        return
      }

      // D: Delete last point
      if (e.key === 'd' && editingPath && editingPath.props.points && editingPath.props.points.length > 2) {
        e.preventDefault()
        pathEditManager.removePoint(editingPath.props.points.length - 1)
        return
      }

      // C: Convert to cubic bezier
      if (e.key === 'c' && editingPath && editingPath.props.points) {
        e.preventDefault()
        const lastIdx = editingPath.props.points.length - 1
        pathEditManager.convertToCubicBezier(lastIdx)
        return
      }

      // L: Convert to line
      if (e.key === 'l' && editingPath && editingPath.props.points) {
        e.preventDefault()
        const lastIdx = editingPath.props.points.length - 1
        pathEditManager.convertToLine(lastIdx)
        return
      }
    }
  }

  function deleteSelectedShape() {
    if (!renderer) return
    const selectedIds = renderer.getSelectedIds()
    if (selectedIds.length === 0) return

    // Delete all selected shapes
    for (const id of selectedIds) {
      renderer.removeShape(id) // This uses Command pattern for undo/redo
    }
    renderer.selectShape(null)
  }

  function copyShape() {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      clipboardShape = selected
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
  }

  function bringToFront() {
    if (!renderer) return
    const selectedIds = renderer.getSelectedIds()
    for (const id of selectedIds) {
      renderer.bringToFront(id)
    }
  }

  function bringForward() {
    if (!renderer) return
    const selectedIds = renderer.getSelectedIds()
    for (const id of selectedIds) {
      renderer.bringForward(id)
    }
  }

  function sendBackward() {
    if (!renderer) return
    const selectedIds = renderer.getSelectedIds()
    // Reverse order to maintain relative ordering
    for (let i = selectedIds.length - 1; i >= 0; i--) {
      renderer.sendBackward(selectedIds[i])
    }
  }

  function sendToBack() {
    if (!renderer) return
    const selectedIds = renderer.getSelectedIds()
    // Reverse order to maintain relative ordering
    for (let i = selectedIds.length - 1; i >= 0; i--) {
      renderer.sendToBack(selectedIds[i])
    }
  }

  function groupShapes() {
    if (!renderer) return
    renderer.groupShapes()
  }

  function ungroupShapes() {
    if (!renderer) return
    renderer.ungroupShapes()
  }

  async function exportSVG() {
    if (!renderer) return

    const svgString = renderer.exportSVG()

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(svgString)
      alert('SVG copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  /**
   * Save - Save to current file or prompt for new file if no current file
   */
  async function saveSVG() {
    if (!renderer) return

    if (currentFilePath) {
      // Save to existing file
      const success = await saveToFile(currentFilePath)

      // Notify Electron main process that save is complete
      const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null
      if (ipcRenderer && success) {
        ipcRenderer.send('save-completed')
      }
    } else {
      // No current file, act like Save As
      await saveSVGAs()

      // Notify completion if saved successfully
      const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null
      if (ipcRenderer && !isDirty) {
        ipcRenderer.send('save-completed')
      }
    }
  }

  /**
   * Save As - Always prompt for new file location
   */
  async function saveSVGAs() {
    if (!renderer) return

    const svgString = renderer.exportSVG()
    const result = await saveSVGFile(svgString)

    if (result.success && !result.canceled) {
      if (result.filePath && result.filePath !== 'clipboard') {
        currentFilePath = result.filePath
        setDirty(false)
        alert(`SVG saved successfully!\nLocation: ${result.filePath}`)
      } else {
        alert('SVG copied to clipboard')
      }
    } else if (result.error) {
      alert(`Failed to save SVG: ${result.error}`)
    }
  }

  /**
   * Save to specific file path (for Save to existing file)
   * Returns true if save was successful
   */
  async function saveToFile(filePath: string): Promise<boolean> {
    if (!renderer) return false

    const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null

    if (!ipcRenderer) {
      // Browser mode - fall back to Save As
      await saveSVGAs()
      return !isDirty
    }

    try {
      const svgString = renderer.exportSVG()
      // Use IPC to save file directly without dialog
      const result = await ipcRenderer.invoke('save-svg-direct', svgString, filePath)

      if (result.success) {
        setDirty(false)
        return true
      } else {
        throw new Error(result.error || 'Failed to save')
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      alert(`Failed to save file: ${error}`)
      return false
    }
  }

  function clearCanvas() {
    if (!renderer) return
    const shapes = renderer.getShapes()
    shapes.forEach((s) => renderer.removeShape(s.props.id))
  }

  async function openLoadDialog() {
    // Try Electron IPC first
    const ipcRenderer = typeof window !== 'undefined' ? (window as any).ipcRenderer : null

    if (ipcRenderer) {
      try {
        const result = await ipcRenderer.invoke('load-svg')

        if (result.success && result.content) {
          loadSVG(result.content)
          currentFilePath = result.filePath
          setDirty(false)
        } else if (!result.canceled) {
          alert('Failed to load SVG file')
        }
        return
      } catch (err) {
        console.error('Error loading via IPC:', err)
      }
    }

    // Fallback to browser file input
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

  function parseRotation(element: Element): number | undefined {
    const transform = element.getAttribute('transform')
    if (!transform) return undefined

    const rotateMatch = transform.match(/rotate\(([^)]+)\)/)
    if (rotateMatch) {
      const parts = rotateMatch[1].split(/\s+/)
      return parseFloat(parts[0])
    }
    return undefined
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
      const rotation = parseRotation(rect)

      const shape = new Rect({
        id: `rect-${Date.now()}-${Math.random()}`,
        x,
        y,
        width,
        height,
        fill,
        stroke,
        strokeWidth,
        rotation
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
      const rotation = parseRotation(circle)

      const shape = new Circle({
        id: `circle-${Date.now()}-${Math.random()}`,
        x: cx - r,
        y: cy - r,
        cx,
        cy,
        r,
        fill,
        stroke,
        strokeWidth,
        rotation
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
      const rotation = parseRotation(line)

      const shape = new Line({
        id: `line-${Date.now()}-${Math.random()}`,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        x1,
        y1,
        x2,
        y2,
        stroke,
        strokeWidth,
        rotation
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
      const rotation = parseRotation(path)

      const shape = new Path({
        id: `path-${Date.now()}-${Math.random()}`,
        x: 0,
        y: 0,
        d,
        stroke,
        strokeWidth,
        fill: fill === 'none' ? undefined : fill,
        rotation
      })
      renderer.addShape(shape)
    })

    // Parse foreignObject elements (text boxes)
    const foreignObjects = svg.querySelectorAll('foreignObject')
    foreignObjects.forEach((fo) => {
      const x = parseFloat(fo.getAttribute('x') || '0')
      const y = parseFloat(fo.getAttribute('y') || '0')
      const width = parseFloat(fo.getAttribute('width') || '100')
      const height = parseFloat(fo.getAttribute('height') || '50')
      const rotation = parseRotation(fo)

      // Parse div style attributes
      const div = fo.querySelector('div')
      if (!div) return

      const text = div.textContent || 'Text'
      const style = div.getAttribute('style') || ''

      // Parse style attributes
      const fontSizeMatch = style.match(/font-size:\s*(\d+)px/)
      const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 16

      const colorMatch = style.match(/color:\s*([^;]+)/)
      const fontColor = colorMatch ? colorMatch[1].trim() : '#000000'

      const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/)
      const fontFamily = fontFamilyMatch ? fontFamilyMatch[1].trim() : 'Arial'

      const fontWeightMatch = style.match(/font-weight:\s*([^;]+)/)
      const fontWeight = fontWeightMatch && fontWeightMatch[1].trim() === 'bold' ? 'bold' : 'normal'

      const fontStyleMatch = style.match(/font-style:\s*([^;]+)/)
      const fontStyle = fontStyleMatch && fontStyleMatch[1].trim() === 'italic' ? 'italic' : 'normal'

      const lineHeightMatch = style.match(/line-height:\s*([^;]+)/)
      const lineHeight = lineHeightMatch ? parseFloat(lineHeightMatch[1]) : 1.2

      const shape = new TextBox({
        id: `text-${Date.now()}-${Math.random()}`,
        x,
        y,
        width,
        height,
        text,
        fontSize,
        fontColor,
        fontFamily,
        fontWeight: fontWeight as 'normal' | 'bold',
        fontStyle: fontStyle as 'normal' | 'italic',
        lineHeight,
        rotation
      })
      renderer.addShape(shape)
    })
  }

  /**
   * Handle file drop events
   */
  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]

    // Check if it's an SVG file
    if (!file.name.endsWith('.svg') && !file.type.includes('svg')) {
      alert('Please drop an SVG file')
      return
    }

    // Check for unsaved changes
    if (isDirty) {
      const shouldContinue = confirm('You have unsaved changes. Loading a new file will discard them. Continue?')
      if (!shouldContinue) return
    }

    // Read and load the file
    try {
      const text = await file.text()
      loadSVG(text)
      currentFilePath = null // File dropped, not from disk location
      setDirty(false)
    } catch (err) {
      console.error('Failed to load dropped SVG:', err)
      alert('Failed to load SVG file')
    }
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

    {#if isTextBoxSelected}
      <div class="toolbar-section text-properties">
        <label class="toolbar-label">
          <span>フォント</span>
          <select
            value={selectedFontFamily}
            onchange={(e) => updateFontFamily(e.currentTarget.value)}
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
          </select>
        </label>

        <label class="toolbar-label">
          <span>サイズ</span>
          <input
            type="number"
            min="8"
            max="144"
            value={selectedFontSize}
            oninput={(e) => updateFontSize(Number(e.currentTarget.value))}
            style="width: 60px"
          />
        </label>

        <button
          class="style-button"
          class:active={selectedFontWeight === 'bold'}
          onclick={() => updateFontWeight(selectedFontWeight === 'bold' ? 'normal' : 'bold')}
          title="Bold"
        >
          <strong>B</strong>
        </button>

        <button
          class="style-button"
          class:active={selectedFontStyle === 'italic'}
          onclick={() => updateFontStyle(selectedFontStyle === 'italic' ? 'normal' : 'italic')}
          title="Italic"
        >
          <em>I</em>
        </button>

        <button
          class="style-button"
          class:active={selectedTextDecoration === 'underline'}
          onclick={() => updateTextDecoration(selectedTextDecoration === 'underline' ? 'none' : 'underline')}
          title="Underline"
        >
          <u>U</u>
        </button>

        <label class="toolbar-label">
          <span>文字色</span>
          <input
            type="color"
            value={selectedFontColor}
            oninput={(e) => updateFontColor(e.currentTarget.value)}
          />
        </label>
      </div>
    {/if}

    <!-- Path Editing Controls -->
    {#if isEditingPath}
      <div class="toolbar-section path-edit-tools">
        <span class="section-label">パス編集:</span>
        <button
          class="tool-button"
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            const editingPath = pathEditManager.getEditingPath()
            if (editingPath && editingPath.props.points) {
              const lastPoint = editingPath.props.points[editingPath.props.points.length - 1]
              const x = lastPoint.x + 50
              const y = lastPoint.y
              pathEditManager.addPoint(x, y)
            }
          }}
          title="ポイント追加 (A)"
        >
          ➕
        </button>
        <button
          class="tool-button"
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            const editingPath = pathEditManager.getEditingPath()
            if (editingPath && editingPath.props.points && editingPath.props.points.length > 2) {
              pathEditManager.removePoint(editingPath.props.points.length - 1)
            }
          }}
          title="ポイント削除 (D)"
        >
          ➖
        </button>
        <button
          class="tool-button"
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            const editingPath = pathEditManager.getEditingPath()
            if (editingPath && editingPath.props.points) {
              const lastIdx = editingPath.props.points.length - 1
              pathEditManager.convertToCubicBezier(lastIdx)
            }
          }}
          title="ベジェ曲線に変換 (C)"
        >
          🔄
        </button>
        <button
          class="tool-button"
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            const editingPath = pathEditManager.getEditingPath()
            if (editingPath && editingPath.props.points) {
              const lastIdx = editingPath.props.points.length - 1
              pathEditManager.convertToLine(lastIdx)
            }
          }}
          title="直線に変換 (L)"
        >
          📏
        </button>
        <button
          class="tool-button"
          onclick={stopPathEditing}
          title="編集終了 (ESC)"
        >
          ✓
        </button>
      </div>
    {/if}

    <!-- Snap Settings -->
    <div class="toolbar-section snap-settings">
      <label class="toolbar-label">
        <input
          type="checkbox"
          bind:checked={snapEnabled}
        />
        <span>スナップ</span>
      </label>

      <label class="toolbar-label">
        <input
          type="checkbox"
          bind:checked={gridEnabled}
          disabled={!snapEnabled}
        />
        <span>グリッド</span>
      </label>
    </div>

    <!-- Alignment Tools (shown when multiple shapes selected) -->
    {#if hasSelection && renderer && renderer.getSelectedIds().length >= 2}
      <div class="toolbar-section align-tools">
        <span class="section-label">整列:</span>
        <button class="tool-button" onclick={() => renderer.alignShapes('left')} title="左揃え">⬅</button>
        <button class="tool-button" onclick={() => renderer.alignShapes('center')} title="中央揃え(横)">↔</button>
        <button class="tool-button" onclick={() => renderer.alignShapes('right')} title="右揃え">➡</button>
        <button class="tool-button" onclick={() => renderer.alignShapes('top')} title="上揃え">⬆</button>
        <button class="tool-button" onclick={() => renderer.alignShapes('middle')} title="中央揃え(縦)">↕</button>
        <button class="tool-button" onclick={() => renderer.alignShapes('bottom')} title="下揃え">⬇</button>

        {#if renderer.getSelectedIds().length >= 3}
          <span class="separator">|</span>
          <span class="section-label">分配:</span>
          <button class="tool-button" onclick={() => renderer.distributeShapes('horizontal')} title="水平分配">⬌</button>
          <button class="tool-button" onclick={() => renderer.distributeShapes('vertical')} title="垂直分配">⬍</button>
        {/if}
      </div>
    {/if}

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
        <button
          class:active={currentTool === 'text'}
          onclick={() => setTool('text')}
          title="Text Tool (T)"
        >
          <span class="icon">📝</span>
          <span class="label">Text</span>
        </button>
      </div>
    </aside>

    <main
      class="canvas-area"
      bind:this={canvasContainer}
      ondragover={handleDragOver}
      ondrop={handleDrop}
    >
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

  .toolbar-label select {
    padding: 4px 8px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #3c3c3c;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }

  .toolbar-label input[type="number"] {
    padding: 4px 8px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #3c3c3c;
    color: #fff;
    font-size: 13px;
  }

  .style-button {
    width: 32px;
    height: 32px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #3c3c3c;
    color: #ccc;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.2s;
  }

  .style-button:hover {
    background: #4c4c4c;
    border-color: #666;
  }

  .style-button.active {
    background: #2196F3;
    border-color: #2196F3;
    color: #fff;
  }

  .text-properties {
    border-left: 1px solid #444;
    padding-left: 16px;
  }

  .path-edit-tools {
    border-left: 1px solid #444;
    padding-left: 16px;
  }

  .tool-button {
    width: 32px;
    height: 32px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #3c3c3c;
    color: #ccc;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
  }

  .tool-button:hover {
    background: #4c4c4c;
    border-color: #666;
  }

  .snap-settings {
    border-left: 1px solid #444;
    padding-left: 16px;
  }

  .align-tools {
    border-left: 1px solid #444;
    padding-left: 16px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .section-label {
    font-size: 12px;
    color: #999;
    margin-right: 4px;
  }

  .separator {
    color: #666;
    margin: 0 8px;
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
