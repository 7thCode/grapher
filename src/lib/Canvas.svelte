<script lang="ts">
  import { onMount } from 'svelte'
  import { Renderer } from './engine/Renderer'
  import { ToolManager, type ToolType } from './engine/Tool'
  import type { HandleType } from './engine/TransformControls'
  import { saveSVGFile } from './utils/electron'
  import type { Shape, LinearGradient, GradientStop, PathPoint } from './engine/Shape'
  import { Rect, Circle, Line, Path, TextBox, isGradient } from './engine/Shape'
  import AIPanel from './AIPanel.svelte'

  let canvas: HTMLCanvasElement
  let canvasContainer: HTMLElement
  let fileInput: HTMLInputElement
  let renderer = $state<Renderer>()
  let toolManager = $state<ToolManager>()
  let currentTool = $state<ToolType>('rect')
  let isDragging = false
  let isResizing = false
  let isRotating = false
  let draggedShapeId: string | null = null
  let resizeHandle: HandleType | null = null
  let dragStart = { x: 0, y: 0 }

  // Drag selection (rubber band selection)
  let isSelectingArea = false
  let selectionRect = { x: 0, y: 0, width: 0, height: 0 }

  // Track cumulative move/resize for Undo/Redo
  let totalMoveOffset = { dx: 0, dy: 0 }
  let resizeStartBounds: { x: number; y: number; width: number; height: number } | null = null

  // Property editing state
  let selectedStroke = $state('#333333')
  let selectedStrokeWidth = $state(2)
  let selectedFill = $state('#ff6b6b')
  let fillType = $state<'solid' | 'gradient'>('solid')
  let gradientColor1 = $state('#ff6b6b')
  let gradientColor2 = $state('#4ecdc4')
  let gradientAngle = $state(0)  // 0=top-bottom, 90=left-right, 180=bottom-top, 270=right-left
  let hasSelection = $state(false)

  // Text properties
  let selectedFontFamily = $state('Arial')
  let selectedFontSize = $state(24)
  let selectedFontWeight = $state('normal')
  let selectedFontStyle = $state('normal')
  let selectedTextDecoration = $state('none')
  let selectedFontColor = $state('#000000')
  let isTextBoxSelected = $state(false)

  // Clipboard for copy/paste
  let clipboardShape: Shape | null = null

  // AI Panel state
  let showAIPanel = $state(false)

  // Text editing state
  let isEditingText = false
  let editingTextBox: TextBox | null = null
  let textEditorDiv: HTMLDivElement | null = null

  // Path editing state
  let isEditingPath = $state(false)
  let editingPath = $state<Path | null>(null)
  let selectedPathPointIndex = $state<number | null>(null)
  let pathSmoothMode = $state(true) // Smooth control point adjustment
  let pathShowAllControlPoints = $state(true) // Show all control points or only selected

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
  let snapEnabled = $state(true)
  let gridEnabled = $state(true)

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

        // Update fill properties (gradient or solid)
        const fill = selected.props.fill
        if (fill && isGradient(fill)) {
          fillType = 'gradient'
          gradientColor1 = fill.stops[0].color
          gradientColor2 = fill.stops[1].color
          gradientAngle = fill.angle
          selectedFill = fill.stops[0].color  // For backward compatibility
        } else {
          fillType = 'solid'
          selectedFill = (fill as string) || '#ff6b6b'
          gradientColor1 = selectedFill
          gradientColor2 = '#4ecdc4'
          gradientAngle = 0
        }

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
      selectedFill = color
      if (fillType === 'solid') {
        renderer.updateShapeProperties(selected.props.id, { fill: color })
      } else {
        // Update gradient color1
        gradientColor1 = color
        applyGradient()
      }
    }
  }

  function updateFillType(type: 'solid' | 'gradient') {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      fillType = type
      if (type === 'solid') {
        renderer.updateShapeProperties(selected.props.id, { fill: selectedFill })
      } else {
        applyGradient()
      }
    }
  }

  function updateGradientColor1(color: string) {
    if (!renderer) return
    gradientColor1 = color
    applyGradient()
  }

  function updateGradientColor2(color: string) {
    if (!renderer) return
    gradientColor2 = color
    applyGradient()
  }

  function updateGradientAngle(angle: number) {
    if (!renderer) return
    gradientAngle = angle
    applyGradient()
  }

  function applyGradient() {
    if (!renderer) return
    const selected = renderer.getSelectedShape()
    if (selected) {
      const gradient: LinearGradient = {
        type: 'linear',
        stops: [
          { offset: 0, color: gradientColor1 },
          { offset: 1, color: gradientColor2 }
        ],
        angle: gradientAngle
      }
      renderer.updateShapeProperties(selected.props.id, { fill: gradient })
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

    // Set up change callback for isDirty tracking and re-rendering
    renderer.setOnChangeCallback(() => {
      setDirty(true)
      renderer.render()
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
      updateSelectionState()
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
      console.log('Path editing mode - clicked at:', x, y, 'handle:', pathHandle)

      if (pathHandle) {
        // Start dragging a path handle
        isDragging = true
        dragStart = { x, y }
        // Store handle reference for later use
        ;(window as any)._draggedPathHandle = pathHandle

        // Update selected point index for reactivity
        if (pathHandle.type === 'point') {
          selectedPathPointIndex = pathHandle.pointIndex
        } else if (pathHandle.type === 'cp1' || pathHandle.type === 'cp2' || pathHandle.type === 'cp') {
          // Both cp1 and cp2 belong to this point, so select the point itself
          selectedPathPointIndex = pathHandle.pointIndex
        }

        // Update PathEditManager's selected point
        const pathEditManager = renderer.getPathEditManager()
        pathEditManager.selectPoint(selectedPathPointIndex)

        // Render to update control point visibility
        renderer.render()
        
        return
      } else {
        // Click outside - stop editing
        console.log('Clicked outside handles - stopping path editing')
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
        updateSelectionState()
      } else {
        // Clicking on empty area starts drag selection
        isSelectingArea = true
        dragStart = { x, y }
        selectionRect = { x, y, width: 0, height: 0 }

        // Clear selection unless Shift is held (for additive selection)
        if (!e.shiftKey) {
          renderer.selectShape(null)
          hasSelection = false
          updateSelectionState()
        }
      }
    } else if (currentTool === 'path') {
      // Path tool: add point on click
      // Check if clicking near the first point to close the path
      const state = toolManager.getState()
      const pathPoints = state.pathPoints || []

      if (pathPoints.length >= 3) {
        const firstPoint = pathPoints[0]
        const distance = Math.sqrt(
          (x - firstPoint.x) ** 2 + (y - firstPoint.y) ** 2
        )

        // If clicking within 10px of first point, close the path
        if (distance < 10) {
          const shape = toolManager.finishPath(true) // close=true
          if (shape) {
            renderer.addShape(shape)
            renderer.selectShape(shape.props.id)
            hasSelection = true
            updateSelectionState()
          }
          renderer.setPreview(null)
          return
        }
      }

      toolManager.addPathPoint(x, y)
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
        console.log('Moving handle:', pathHandle.type, 'dx:', dx, 'dy:', dy)
        // Pass Alt key state to enable independent control point movement
        renderer.getPathEditManager().moveHandle(pathHandle, dx, dy, e.altKey)
        dragStart = { x, y }
        renderer.render()
      }
      return
    }

    if (currentTool === 'select') {
      if (isSelectingArea) {
        // Update selection rectangle
        const minX = Math.min(dragStart.x, x)
        const minY = Math.min(dragStart.y, y)
        const maxX = Math.max(dragStart.x, x)
        const maxY = Math.max(dragStart.y, y)
        selectionRect = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        }
        // Update renderer's selection rectangle
        renderer.setSelectionRect(selectionRect)
      } else if (isRotating) {
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
      // Handle drag selection completion
      if (isSelectingArea) {
        // Find shapes within selection rectangle
        const shapes = renderer.getShapes()
        const selectedShapes: string[] = []

        for (const shape of shapes) {
          const bounds = shape.getBounds()
          // Check if shape's bounds intersect with selection rectangle
          if (
            bounds.x < selectionRect.x + selectionRect.width &&
            bounds.x + bounds.width > selectionRect.x &&
            bounds.y < selectionRect.y + selectionRect.height &&
            bounds.y + bounds.height > selectionRect.y
          ) {
            selectedShapes.push(shape.props.id)
          }
        }

        // Select the shapes (additive if already had selection)
        if (selectedShapes.length > 0) {
          // Select first shape
          renderer.selectShape(selectedShapes[0], hasSelection)
          // Add remaining shapes to selection
          for (let i = 1; i < selectedShapes.length; i++) {
            renderer.selectShape(selectedShapes[i], true)
          }
          hasSelection = true
          updateSelectionState()
        }

        // Reset selection rectangle state
        isSelectingArea = false
        selectionRect = { x: 0, y: 0, width: 0, height: 0 }
        renderer.setSelectionRect(null)
      }

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
        updateSelectionState()
      }
      renderer.setPreview(null)
    }
  }

  function handleDblClick(e: MouseEvent) {
    if (!renderer || !toolManager) return

    // Double click to finish path
    if (currentTool === 'path') {
      const shape = toolManager.finishPath(false) // close=false (open path)
      if (shape) {
        renderer.addShape(shape)
        renderer.selectShape(shape.props.id)
        hasSelection = true
        updateSelectionState()
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
    editorDiv.style.textDecoration = textBox.props.textDecoration || 'none'
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

    console.log('Starting path editing, path points:', path.props.points)
    isEditingPath = true
    editingPath = path
    selectedPathPointIndex = null // Reset selection
    renderer.startPathEditing(path)

    // Configure path edit manager
    const pathEditManager = renderer.getPathEditManager()
    pathEditManager.setSnapManager(renderer.getSnapManager())
    pathEditManager.setSmoothMode(pathSmoothMode)
    pathEditManager.setShowAllControlPoints(pathShowAllControlPoints)
    console.log('Path editing mode activated')
  }

  function stopPathEditing() {
    if (!renderer) return

    isEditingPath = false
    editingPath = null
    selectedPathPointIndex = null // Clear selection
    renderer.stopPathEditing()
  }

  function handleKeyDown(e: KeyboardEvent) {
    // If AI Panel is open, only allow Escape key to close it
    // All other keyboard events should be ignored to allow text editing
    if (showAIPanel && e.key !== 'Escape') {
      return
    }

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

    // Toggle AI Panel: G (without modifiers, and only when panel is closed)
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !isEditingText && !isEditingPath && !showAIPanel) {
      e.preventDefault()
      showAIPanel = !showAIPanel
      return
    }

    // ESC to cancel path drawing, exit path editing, or close AI panel
    if (e.key === 'Escape') {
      if (showAIPanel) {
        e.preventDefault()
        showAIPanel = false
      } else if (currentTool === 'path') {
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

      // Q: Convert to quadratic bezier
      if (e.key === 'q' && editingPath && editingPath.props.points) {
        e.preventDefault()
        const lastIdx = editingPath.props.points.length - 1
        pathEditManager.convertToQuadraticBezier(lastIdx)
        return
      }

      // Z: Close/open path
      if (e.key === 'z' && editingPath) {
        e.preventDefault()
        if (pathEditManager.isPathClosed()) {
          pathEditManager.openPath()
        } else {
          pathEditManager.closePath()
        }
        renderer.render()
        return
      }

      // S: Toggle smooth mode
      if (e.key === 's' && editingPath) {
        e.preventDefault()
        pathSmoothMode = !pathSmoothMode
        pathEditManager.setSmoothMode(pathSmoothMode)
        return
      }

      // H: Toggle show all control points
      if (e.key === 'h' && editingPath) {
        e.preventDefault()
        pathShowAllControlPoints = !pathShowAllControlPoints
        pathEditManager.setShowAllControlPoints(pathShowAllControlPoints)
        renderer.render()
        return
      }

      // 1: Set point type to smooth
      if (e.key === '1' && editingPath) {
        e.preventDefault()
        if (selectedPathPointIndex !== null) {
          pathEditManager.setPointType(selectedPathPointIndex, 'smooth')
          renderer.render()
        }
        return
      }

      // 2: Set point type to symmetrical
      if (e.key === '2' && editingPath) {
        e.preventDefault()
        if (selectedPathPointIndex !== null) {
          pathEditManager.setPointType(selectedPathPointIndex, 'symmetrical')
          renderer.render()
        }
        return
      }

      // 3: Set point type to corner
      if (e.key === '3' && editingPath) {
        e.preventDefault()
        if (selectedPathPointIndex !== null) {
          pathEditManager.setPointType(selectedPathPointIndex, 'corner')
          renderer.render()
        }
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
    hasSelection = false
    updateSelectionState()
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
    updateSelectionState()
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

    // Stop path editing mode if active
    if (isEditingPath) {
      stopPathEditing()
    }

    // Stop text editing mode if active
    if (isEditingText && textEditorDiv) {
      textEditorDiv.remove()
      textEditorDiv = null
      editingTextBox = null
      isEditingText = false
    }

    // Clear selection
    renderer.selectShape(null)
    hasSelection = false

    // Remove all shapes
    const shapes = renderer.getShapes()
    shapes.forEach((s) => renderer.removeShape(s.props.id))

    // Reset other state variables
    selectedPathPointIndex = null
    clipboardShape = null
    currentFilePath = null  // Reset file path (new document state)

    // Reset dirty flag
    setDirty(false)

    // Render to update display
    renderer.render()
  }

  async function openLoadDialog() {
    // Check for unsaved changes
    if (isDirty) {
      const shouldContinue = confirm('You have unsaved changes. Loading a new file will discard them. Continue?')
      if (!shouldContinue) return
    }

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

    // Check for unsaved changes
    if (isDirty) {
      const shouldContinue = confirm('You have unsaved changes. Loading a new file will discard them. Continue?')
      if (!shouldContinue) {
        target.value = '' // Reset input
        return
      }
    }

    try {
      const text = await file.text()
      loadSVG(text)
      currentFilePath = null // File selected from browser, no disk path
      setDirty(false)
      target.value = '' // Reset input
    } catch (err) {
      console.error('Failed to load SVG:', err)
      alert('Failed to load SVG file')
    }
  }

  /**
   * Parse SVG path data (d attribute) into PathPoint array
   */
  function parsePathData(d: string): PathPoint[] {
    const points: PathPoint[] = []
    const commands = d.match(/[MLCQZ][^MLCQZ]*/gi)
    if (!commands) return points

    for (const cmd of commands) {
      const type = cmd[0].toUpperCase()
      const coords = cmd
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter(n => !isNaN(n))

      if (type === 'M' && coords.length >= 2) {
        points.push({
          x: coords[0],
          y: coords[1],
          type: 'M'
        })
      } else if (type === 'L' && coords.length >= 2) {
        points.push({
          x: coords[0],
          y: coords[1],
          type: 'L'
        })
      } else if (type === 'C' && coords.length >= 6) {
        points.push({
          x: coords[4],
          y: coords[5],
          type: 'C',
          cp1x: coords[0],
          cp1y: coords[1],
          cp2x: coords[2],
          cp2y: coords[3]
        })
      } else if (type === 'Q' && coords.length >= 4) {
        points.push({
          x: coords[2],
          y: coords[3],
          type: 'Q',
          cpx: coords[0],
          cpy: coords[1]
        })
      }
    }

    return points
  }

  /**
   * Parse gradient definitions from SVG
   */
  function parseGradients(svg: Element): Map<string, LinearGradient> {
    const gradients = new Map<string, LinearGradient>()
    const defs = svg.querySelector('defs')
    if (!defs) return gradients

    const linearGradients = defs.querySelectorAll('linearGradient')
    linearGradients.forEach((lg) => {
      const id = lg.getAttribute('id')
      if (!id) return

      const x1 = parseFloat(lg.getAttribute('x1') || '0')
      const y1 = parseFloat(lg.getAttribute('y1') || '0')
      const x2 = parseFloat(lg.getAttribute('x2') || '0')
      const y2 = parseFloat(lg.getAttribute('y2') || '100')

      let angle = 0
      if (x2 > x1) angle = 90
      else if (y2 > y1) angle = 0

      const stops: GradientStop[] = []
      const stopElements = lg.querySelectorAll('stop')
      stopElements.forEach((stop) => {
        let offsetStr = stop.getAttribute('offset') || '0'
        // Remove % if present
        offsetStr = offsetStr.replace('%', '')
        let offset = parseFloat(offsetStr)
        // Convert from 0-100 range to 0.0-1.0 range if needed
        if (offset > 1) {
          offset = offset / 100
        }
        const stopColor = stop.getAttribute('stop-color') || '#000000'
        stops.push({ offset, color: stopColor })
      })

      if (stops.length > 0) {
        gradients.set(id, { type: 'linear', stops, angle })
      }
    })

    return gradients
  }

  /**
   * Parse fill attribute - returns either a color string or a LinearGradient object
   */
  function parseFill(fillAttr: string | null, gradients: Map<string, LinearGradient>): string | LinearGradient | undefined {
    if (!fillAttr || fillAttr === 'none') return undefined

    const urlMatch = fillAttr.match(/url\(#([^)]+)\)/)
    if (urlMatch) {
      const gradientId = urlMatch[1]
      return gradients.get(gradientId)
    }

    return fillAttr
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

  // Handle AI-generated SVG
  function handleAIGenerate(svgCode: string) {
    if (!svgCode) return

    try {
      loadSVG(svgCode, false) // Don't clear existing shapes - add AI-generated content
      showAIPanel = false
      setDirty(true) // Mark as dirty since we added new content
    } catch (error) {
      console.error('Failed to load AI-generated SVG:', error)
      alert('AI生成されたSVGの読み込みに失敗しました')
    }
  }

  function loadSVG(svgString: string, clearFirst: boolean = true) {
    if (!renderer) return

    // Clear existing shapes before loading new file (optional)
    if (clearFirst) {
      clearCanvas()
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) {
      alert('Invalid SVG file')
      return
    }

    // Parse gradient definitions first
    const gradients = parseGradients(svg)

    // Parse rect elements
    const rects = svg.querySelectorAll('rect')
    rects.forEach((rect) => {
      const x = parseFloat(rect.getAttribute('x') || '0')
      const y = parseFloat(rect.getAttribute('y') || '0')
      const width = parseFloat(rect.getAttribute('width') || '0')
      const height = parseFloat(rect.getAttribute('height') || '0')
      const fill = parseFill(rect.getAttribute('fill'), gradients) || '#4CAF50'
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
      const fill = parseFill(circle.getAttribute('fill'), gradients) || '#4CAF50'
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
      try {
        const d = path.getAttribute('d') || ''
        const stroke = path.getAttribute('stroke') || '#333'
        const strokeWidth = parseFloat(path.getAttribute('stroke-width') || '2')
        const fillAttr = path.getAttribute('fill')
        const fill = fillAttr === 'none' ? undefined : (parseFill(fillAttr, gradients))
        const rotation = parseRotation(path)

        // Parse path data into points array for editing
        const points = parsePathData(d)
        const closed = d.trim().toUpperCase().endsWith('Z')

        const shape = new Path({
          id: `path-${Date.now()}-${Math.random()}`,
          x: 0,
          y: 0,
          d,
          points,
          closed,
          stroke,
          strokeWidth,
          fill,
          rotation
        })
        renderer.addShape(shape)
      } catch (err) {
        console.error('Error parsing path element:', err, path)
      }
    })

    // Parse polygon elements (convert to Path)
    const polygons = svg.querySelectorAll('polygon')
    polygons.forEach((polygon) => {
      try {
        const pointsAttr = polygon.getAttribute('points') || ''
        if (!pointsAttr.trim()) return

        // Convert points to path data
        const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
        if (coords.length < 6) return // Need at least 3 points (6 numbers)

        let d = `M ${coords[0]} ${coords[1]}`
        for (let i = 2; i < coords.length; i += 2) {
          d += ` L ${coords[i]} ${coords[i + 1]}`
        }
        d += ' Z' // Close the polygon

        const stroke = polygon.getAttribute('stroke') || '#333'
        const strokeWidth = parseFloat(polygon.getAttribute('stroke-width') || '2')
        const fillAttr = polygon.getAttribute('fill')
        const fill = fillAttr === 'none' ? undefined : (parseFill(fillAttr, gradients) || '#4CAF50')
        const rotation = parseRotation(polygon)

        const points = parsePathData(d)

        const shape = new Path({
          id: `polygon-${Date.now()}-${Math.random()}`,
          x: 0,
          y: 0,
          d,
          points,
          closed: true,
          stroke,
          strokeWidth,
          fill,
          rotation
        })
        renderer.addShape(shape)
      } catch (err) {
        console.error('Error parsing polygon element:', err, polygon)
      }
    })

    // Parse polyline elements (convert to Path)
    const polylines = svg.querySelectorAll('polyline')
    polylines.forEach((polyline) => {
      try {
        const pointsAttr = polyline.getAttribute('points') || ''
        if (!pointsAttr.trim()) return

        // Convert points to path data
        const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
        if (coords.length < 4) return // Need at least 2 points (4 numbers)

        let d = `M ${coords[0]} ${coords[1]}`
        for (let i = 2; i < coords.length; i += 2) {
          d += ` L ${coords[i]} ${coords[i + 1]}`
        }
        // Don't close polyline (no Z command)

        const stroke = polyline.getAttribute('stroke') || '#333'
        const strokeWidth = parseFloat(polyline.getAttribute('stroke-width') || '2')
        const fillAttr = polyline.getAttribute('fill')
        const fill = fillAttr === 'none' ? undefined : parseFill(fillAttr, gradients)
        const rotation = parseRotation(polyline)

        const points = parsePathData(d)

        const shape = new Path({
          id: `polyline-${Date.now()}-${Math.random()}`,
          x: 0,
          y: 0,
          d,
          points,
          closed: false,
          stroke,
          strokeWidth,
          fill,
          rotation
        })
        renderer.addShape(shape)
      } catch (err) {
        console.error('Error parsing polyline element:', err, polyline)
      }
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

    // Force re-render after loading all shapes
    renderer.render()

    // Reset dirty flag after loading (shapes were added via addShape which triggers onChange)
    setDirty(false)
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
        <select
          value={fillType}
          oninput={(e) => updateFillType(e.currentTarget.value as 'solid' | 'gradient')}
          disabled={!hasSelection}
        >
          <option value="solid">単色</option>
          <option value="gradient">グラデーション</option>
        </select>
      </label>

      {#if fillType === 'solid'}
        <label class="toolbar-label">
          <span>色</span>
          <input
            type="color"
            value={selectedFill}
            oninput={(e) => updateFill(e.currentTarget.value)}
            disabled={!hasSelection}
          />
        </label>
      {:else}
        <label class="toolbar-label">
          <span>開始色</span>
          <input
            type="color"
            value={gradientColor1}
            oninput={(e) => updateGradientColor1(e.currentTarget.value)}
            disabled={!hasSelection}
          />
        </label>

        <label class="toolbar-label">
          <span>終了色</span>
          <input
            type="color"
            value={gradientColor2}
            oninput={(e) => updateGradientColor2(e.currentTarget.value)}
            disabled={!hasSelection}
          />
        </label>

        <label class="toolbar-label">
          <span>方向</span>
          <select
            value={gradientAngle}
            oninput={(e) => updateGradientAngle(Number(e.currentTarget.value))}
            disabled={!hasSelection}
          >
            <option value="0">↓ 上→下</option>
            <option value="90">→ 左→右</option>
            <option value="180">↑ 下→上</option>
            <option value="270">← 右→左</option>
          </select>
        </label>
      {/if}
    </div>

    {#if isTextBoxSelected}
      <div class="toolbar-section text-properties">
        <label class="toolbar-label">
          <span>フォント</span>
          <select
            value={selectedFontFamily}
            oninput={(e) => updateFontFamily(e.currentTarget.value)}
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
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            const editingPath = pathEditManager.getEditingPath()
            if (editingPath && editingPath.props.points) {
              const lastIdx = editingPath.props.points.length - 1
              pathEditManager.convertToQuadraticBezier(lastIdx)
            }
          }}
          title="2次ベジェ曲線に変換 (Q)"
        >
          〰️
        </button>

        <span class="separator">|</span>

        <!-- Point Type Controls (Illustrator style) -->
        {#if renderer && selectedPathPointIndex !== null}
          {@const pathEditManager = renderer.getPathEditManager()}
          {@const editingPath = pathEditManager.getEditingPath()}
          {@const selectedPoint = editingPath?.props.points?.[selectedPathPointIndex]}
          {@const isBezierPoint = selectedPoint?.type === 'C' ||
                                  (selectedPoint?.cp1x !== undefined && selectedPoint?.cp2x !== undefined)}
          
          <!-- Show point type indicator -->
          <span class="point-type-indicator" title="選択中のポイントタイプ">
            {#if selectedPoint}
              {@const pointTypeName = selectedPoint.type === 'M' ? '始点' :
                                      selectedPoint.type === 'L' ? '直線' :
                                      selectedPoint.type === 'C' ? 'ベジェ' : '2次ベジェ'}
              {@const pointAttr = isBezierPoint ? pathEditManager.getPointType(selectedPathPointIndex) : null}
              {@const attrName = pointAttr === 'smooth' ? 'スムーズ' :
                                 pointAttr === 'symmetrical' ? '対称' :
                                 pointAttr === 'corner' ? 'コーナー' : ''}
              {pointTypeName}{attrName ? ` (${attrName})` : ''}
            {/if}
          </span>

          <!-- Point type buttons (only for cubic bezier points) -->
          <button
            class="tool-button"
            class:active={isBezierPoint && pathEditManager.getPointType(selectedPathPointIndex) === 'smooth'}
            disabled={!isBezierPoint}
            onclick={() => {
              if (isBezierPoint) {
                pathEditManager.setPointType(selectedPathPointIndex!, 'smooth')
                renderer.render()
              }
            }}
            title={isBezierPoint ? "スムーズポイント (1)" : "ベジェ曲線ポイントのみ"}
          >
            〜
          </button>
          <button
            class="tool-button"
            class:active={isBezierPoint && pathEditManager.getPointType(selectedPathPointIndex) === 'symmetrical'}
            disabled={!isBezierPoint}
            onclick={() => {
              if (isBezierPoint) {
                pathEditManager.setPointType(selectedPathPointIndex!, 'symmetrical')
                renderer.render()
              }
            }}
            title={isBezierPoint ? "対称ポイント (2)" : "ベジェ曲線ポイントのみ"}
          >
            ⚖️
          </button>
          <button
            class="tool-button"
            class:active={isBezierPoint && pathEditManager.getPointType(selectedPathPointIndex) === 'corner'}
            disabled={!isBezierPoint}
            onclick={() => {
              if (isBezierPoint) {
                pathEditManager.setPointType(selectedPathPointIndex!, 'corner')
                renderer.render()
              }
            }}
            title={isBezierPoint ? "コーナーポイント (3)" : "ベジェ曲線ポイントのみ"}
          >
            ⌐
          </button>
        {/if}

        <span class="separator">|</span>
        
        <button
          class="tool-button"
          onclick={() => {
            const pathEditManager = renderer.getPathEditManager()
            if (pathEditManager.isPathClosed()) {
              pathEditManager.openPath()
              renderer.render()
            } else {
              pathEditManager.closePath()
              renderer.render()
            }
          }}
          title="パスを閉じる/開く (Z)"
        >
          {#if renderer && renderer.getPathEditManager().isPathClosed()}
            🔓
          {:else}
            🔒
          {/if}
        </button>
        
        <span class="separator">|</span>
        
        <label class="toolbar-label">
          <input
            type="checkbox"
            bind:checked={pathSmoothMode}
            onchange={() => {
              const pathEditManager = renderer.getPathEditManager()
              pathEditManager.setSmoothMode(pathSmoothMode)
            }}
          />
          <span>スムーズ</span>
        </label>
        
        <label class="toolbar-label">
          <input
            type="checkbox"
            bind:checked={pathShowAllControlPoints}
            onchange={() => {
              const pathEditManager = renderer.getPathEditManager()
              pathEditManager.setShowAllControlPoints(pathShowAllControlPoints)
              renderer.render()
            }}
          />
          <span>全制御点</span>
        </label>
        
        <span class="separator">|</span>
        
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
        <button
          class:active={showAIPanel}
          onclick={() => showAIPanel = !showAIPanel}
          title="AI生成 (G)"
        >
          <span class="icon">🤖</span>
          <span class="label">AI生成</span>
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

    <!-- AI Panel Overlay -->
    {#if showAIPanel}
      <div class="ai-panel-overlay">
        <AIPanel
          onApply={handleAIGenerate}
          onClose={() => showAIPanel = false}
        />
      </div>
    {/if}
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

  .tool-button.active {
    background: #2196F3;
    border-color: #1976D2;
    color: #fff;
  }

  .tool-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: #2c2c2c;
  }

  .tool-button:disabled:hover {
    background: #2c2c2c;
    border-color: #555;
  }

  .point-type-indicator {
    font-size: 12px;
    color: #aaa;
    padding: 4px 8px;
    background: #2c2c2c;
    border-radius: 3px;
    border: 1px solid #444;
    margin-right: 8px;
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
    position: relative;
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

  .ai-panel-overlay {
    position: absolute;
    top: 80px;
    right: 20px;
    z-index: 1000;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
