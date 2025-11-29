<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DrawingState } from '../../types';

  // Props
  interface Props {
    width: number;
    height: number;
    drawingState: DrawingState;
    onStroke: () => void;
    className?: string;
  }

  let { width, height, drawingState, onStroke, className = '' }: Props = $props();

  // Canvas element reference
  let canvasElement: HTMLCanvasElement | null = $state(null);
  let isDrawingInternal = $state(false);
  let hasContent = $state(false);

  // Expose methods to parent component via bind:this pattern
  // In Svelte 5, methods are automatically exposed when using bind:this
  export function clear() {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    hasContent = false;
    console.log('[CanvasLayer] Canvas cleared');
  }

  export function getDataUrl(): string {
    if (!canvasElement) return '';
    // Returns "data:image/png;base64,..."
    const dataUrl = canvasElement.toDataURL('image/png');
    console.log('[CanvasLayer] Retrieved canvas data URL');
    return dataUrl;
  }

  export function isEmpty(): boolean {
    return !hasContent;
  }

  export function restoreImage(dataUrl: string) {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      hasContent = true;
      console.log('[CanvasLayer] Restored image from data URL');
    };
    img.src = dataUrl;
  }

  /**
   * Initializes canvas context with drawing settings.
   * Called when component mounts or when drawing state changes.
   * 
   * @param color - The stroke color to use
   * @param brushSize - The brush size to use
   */
  const initializeContext = (color: string, brushSize: number) => {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    // Using console.debug for less verbose logging - only visible when debug level is enabled
    console.debug('[CanvasLayer] Context initialized with color:', color, 'brush size:', brushSize);
  };

  /**
   * Converts mouse/touch coordinates to canvas coordinates.
   * Handles scaling for high-DPI displays.
   */
  const getCoordinates = (e: MouseEvent | TouchEvent) => {
    if (!canvasElement) return { x: 0, y: 0 };
    
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = canvasElement.width / rect.width;
    const scaleY = canvasElement.height / rect.height;

    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  /**
   * Starts a new drawing stroke.
   * Called on mouse/touch down events.
   */
  const startDrawing = (e: MouseEvent | TouchEvent) => {
    if (!drawingState.isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch
    
    const { x, y } = getCoordinates(e);
    const ctx = canvasElement?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingInternal = true;
    console.log('[CanvasLayer] Started drawing at', x, y);
  };

  /**
   * Continues drawing stroke.
   * Called on mouse/touch move events while drawing.
   */
  const draw = (e: MouseEvent | TouchEvent) => {
    if (!isDrawingInternal || !drawingState.isDrawing) return;
    e.preventDefault();

    const { x, y } = getCoordinates(e);
    const ctx = canvasElement?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
    
    if (!hasContent) {
      hasContent = true;
      onStroke();
      console.log('[CanvasLayer] First stroke detected');
    }
  };

  /**
   * Stops the current drawing stroke.
   * Called on mouse/touch up or leave events.
   */
  const stopDrawing = () => {
    if (isDrawingInternal) {
      isDrawingInternal = false;
      const ctx = canvasElement?.getContext('2d');
      if (ctx) ctx.closePath();
      console.log('[CanvasLayer] Stopped drawing');
    }
  };

  // Track specific drawing state properties to update canvas context
  // We explicitly track color and brushSize to prevent unnecessary re-runs
  // when other drawingState properties (like isDrawing) change
  $effect(() => {
    // Extract values to track - this makes the dependencies explicit
    const currentColor = drawingState.color;
    const currentBrushSize = drawingState.brushSize;
    
    // Only initialize when these specific values change
    initializeContext(currentColor, currentBrushSize);
  });

  // Initialize on mount with current drawing state values
  onMount(() => {
    initializeContext(drawingState.color, drawingState.brushSize);
  });
</script>

<canvas
  bind:this={canvasElement}
  {width}
  {height}
  class="{className} {drawingState.isDrawing ? 'cursor-crosshair' : 'cursor-default'}"
  onmousedown={startDrawing}
  onmousemove={draw}
  onmouseup={stopDrawing}
  onmouseleave={stopDrawing}
  ontouchstart={startDrawing}
  ontouchmove={draw}
  ontouchend={stopDrawing}
></canvas>

