<script lang="ts">
  import CanvasLayer from './components/CanvasLayer.svelte';
  import { generateImage, editImageWithDrawing, type MaskInstruction } from '../services/geminiService';
  import type { GeneratedImage, DrawingState, Session } from '../types';
  import { Loader2, Send, Eraser, Download, Image as ImageIcon, RotateCcw, Sparkles, Trash2, Palette, Plus, Layout, Key } from 'lucide-svelte';

  const CANVAS_SIZE = 2048;
  const MASK_COLORS = [
    { hex: '#00FFFF', name: 'Cyan', tailwind: 'bg-[#00FFFF]' },
    { hex: '#FF00FF', name: 'Magenta', tailwind: 'bg-[#FF00FF]' },
    { hex: '#FFFF00', name: 'Yellow', tailwind: 'bg-[#FFFF00]' },
    { hex: '#00FF00', name: 'Lime', tailwind: 'bg-[#00FF00]' },
  ];

  // Simple API key check
  function hasApiKey(): boolean {
    try {
      return !!sessionStorage.getItem('gemini_api_key') || !!((import.meta as any).env?.VITE_GEMINI_API_KEY);
    } catch {
      return false;
    }
  }

  let apiKeyInput = $state('');
  // Check if key exists in sessionStorage (user entered it before)
  // Only check sessionStorage - ignore env vars for UI display
  let apiKey = $state(false);
  
  // Check sessionStorage on mount
  try {
    if (sessionStorage.getItem('gemini_api_key')) {
      apiKey = true;
    }
  } catch {
    // ignore
  }

  function saveApiKey() {
    if (apiKeyInput.trim()) {
      sessionStorage.setItem('gemini_api_key', apiKeyInput.trim());
      apiKey = true;
    }
  }

  // Session management
  const createSession = (): Session => ({
    id: crypto.randomUUID(),
    image: null,
    basePrompt: '',
    globalPrompt: '',
    modPrompts: {},
    drawingDataUrl: null,
    isLoading: false,
    error: null
  });

  // State
  const initialSession = createSession();
  let sessions = $state<Session[]>([initialSession]);
  let activeSessionId = $state<string>(initialSession.id);
  let promptText = $state('');
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);
  let drawingState = $state<DrawingState>({ isDrawing: false, color: MASK_COLORS[0].hex, brushSize: 20 });
  let hasDrawing = $state(false);
  let canvasLayer: CanvasLayer | null = $state(null);
  
  let currentImage: GeneratedImage | null = $derived.by(() => {
    return sessions.find(s => s.id === activeSessionId)?.image ?? null;
  });

  // Helpers
  function getActiveSession(): Session | undefined {
    return sessions.find(s => s.id === activeSessionId);
  }

  function updateActiveSession(updates: Partial<Session>) {
    sessions = sessions.map(s => s.id === activeSessionId ? { ...s, ...updates } : s);
  }

  /**
   * Creates a composite image by overlaying the drawing canvas on top of the original image.
   * Both images are processed at full 2K resolution (2048x2048) to maintain quality.
   * 
   * @param drawingDataUrl - Data URL of the drawing canvas overlay (from CanvasLayer)
   * @param originalBase64 - Base64 encoded original image (without data URL prefix)
   * @param originalMimeType - MIME type of the original image (e.g., 'image/png')
   * @returns Promise resolving to base64 encoded composite image (JPEG format, without data URL prefix)
   */
  const getCompositeImage = async (drawingDataUrl: string, originalBase64: string, originalMimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const imgOriginal = new Image();
      imgOriginal.crossOrigin = "anonymous";
      const imgDrawing = new Image();
      imgDrawing.crossOrigin = "anonymous";
      
      // Create canvas at 2K resolution to match image generation size
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE; // 2048
      canvas.height = CANVAS_SIZE; // 2048
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No context');
      
      // Construct data URL from base64 to ensure we're using the full resolution image
      const originalDataUrl = `data:${originalMimeType};base64,${originalBase64}`;
      
      imgOriginal.onload = () => {
        imgDrawing.onload = () => {
          console.log('[getCompositeImage] Original image dimensions:', imgOriginal.width, 'x', imgOriginal.height);
          console.log('[getCompositeImage] Drawing canvas dimensions:', imgDrawing.width, 'x', imgDrawing.height);
          console.log('[getCompositeImage] Composite canvas dimensions:', canvas.width, 'x', canvas.height);
          
          // Clear canvas to ensure clean composite
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw original image at its native resolution (should be 2048x2048 for 2K images)
          // Using native dimensions ensures no quality loss from scaling
          ctx.drawImage(imgOriginal, 0, 0, imgOriginal.width, imgOriginal.height);
          
          // Draw drawing overlay at its native resolution (should be 2048x2048)
          // This ensures the drawing marks align perfectly with the original image
          ctx.drawImage(imgDrawing, 0, 0, imgDrawing.width, imgDrawing.height);
          
          // Export as JPEG at high quality (0.95) to maintain detail
          // Split to get just the base64 data without the data URL prefix
          const compositeBase64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
          console.log('[getCompositeImage] Composite image created successfully at 2K resolution');
          resolve(compositeBase64);
        };
        imgDrawing.onerror = (err) => {
          console.error('[getCompositeImage] Error loading drawing image:', err);
          reject(new Error('Failed to load drawing canvas'));
        };
        imgDrawing.src = drawingDataUrl;
      };
      imgOriginal.onerror = (err) => {
        console.error('[getCompositeImage] Error loading original image:', err);
        reject(new Error('Failed to load original image'));
      };
      imgOriginal.src = originalDataUrl;
    });
  };

  // Event handlers
  function handlePromptInput(event: Event) {
    promptText = (event.target as HTMLInputElement).value;
  }

  async function handleGenerate() {
    if (!promptText.trim() || isLoading) return;
    isLoading = true;
    errorMessage = null;
    try {
      const newImage = await generateImage(promptText);
      updateActiveSession({ image: newImage, basePrompt: promptText });
      promptText = '';
      drawingState.isDrawing = true;
    } catch (err: any) {
      errorMessage = err.message || 'Something went wrong.';
    } finally {
      isLoading = false;
    }
  }

  async function handleEdit() {
    const session = getActiveSession();
    if (!session?.image) return;
    const globalPrompt = session.globalPrompt || '';
    const modPrompts = session.modPrompts || {};
    const hasInstructions = globalPrompt.trim() || Object.values(modPrompts).some(v => v?.trim());
    if (!hasInstructions) {
      errorMessage = "Please provide an instruction.";
      return;
    }
    isLoading = true;
    errorMessage = null;
    try {
      // Start with the original base64 image
      let compositeBase64 = session.image.base64;
      
      // If there's a drawing overlay, create a composite image at full 2K resolution
      if (hasDrawing && canvasLayer) {
        const drawingDataUrl = canvasLayer.getDataUrl();
        if (drawingDataUrl) {
          console.log('[handleEdit] Creating composite image with drawing overlay at 2K resolution');
          // Pass base64 directly to ensure we're using the full resolution image
          compositeBase64 = await getCompositeImage(drawingDataUrl, session.image.base64, session.image.mimeType);
        }
      }
      const activeInstructions: MaskInstruction[] = [];
      MASK_COLORS.forEach(colorObj => {
        const pt = modPrompts[colorObj.hex];
        if (pt?.trim()) {
          activeInstructions.push({ colorName: colorObj.name, instruction: pt });
        }
      });
      const newImage = await editImageWithDrawing(
        session.image.base64, session.image.mimeType, compositeBase64,
        activeInstructions, globalPrompt
      );
      updateActiveSession({ image: newImage, drawingDataUrl: null, modPrompts: {}, globalPrompt: '' });
      canvasLayer?.clear();
      hasDrawing = false;
    } catch (err: any) {
      errorMessage = err.message || 'Something went wrong.';
    } finally {
      isLoading = false;
    }
  }

  function handleCreateNewSession() {
    const newSession = createSession();
    sessions = [...sessions, newSession];
    activeSessionId = newSession.id;
    promptText = '';
    hasDrawing = false;
    canvasLayer?.clear();
  }

  function handleSwitchSession(id: string) {
    activeSessionId = id;
    const session = sessions.find(s => s.id === id);
    promptText = session?.basePrompt || '';
    canvasLayer?.clear();
    hasDrawing = false;
    if (session?.image) {
      drawingState.isDrawing = true;
      if (session.drawingDataUrl && canvasLayer) {
        canvasLayer.restoreImage(session.drawingDataUrl);
        hasDrawing = true;
      }
    } else {
      drawingState.isDrawing = false;
    }
  }

  function handleDeleteSession(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (sessions.length <= 1) {
      const resetSession = createSession();
      sessions = [resetSession];
      activeSessionId = resetSession.id;
      promptText = '';
      hasDrawing = false;
      canvasLayer?.clear();
      return;
    }
    sessions = sessions.filter(s => s.id !== id);
    if (activeSessionId === id) {
      activeSessionId = sessions[sessions.length - 1].id;
    }
  }

  function selectColor(hex: string) { drawingState.color = hex; }
  function clearDrawing() { canvasLayer?.clear(); hasDrawing = false; }
  
  function handleDownload() {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage.url;
    link.download = `gemini-gen-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleResetCurrent() {
    const fresh = createSession();
    sessions = sessions.map(s => s.id === activeSessionId ? fresh : s);
    activeSessionId = fresh.id;
    promptText = '';
    canvasLayer?.clear();
    hasDrawing = false;
  }

  function handleGlobalPromptChange(event: Event) {
    updateActiveSession({ globalPrompt: (event.target as HTMLInputElement).value });
  }

  function handleMaskPromptChange(colorHex: string, event: Event) {
    const session = getActiveSession();
    if (!session) return;
    updateActiveSession({ modPrompts: { ...session.modPrompts, [colorHex]: (event.target as HTMLInputElement).value } });
  }
</script>

<!-- API Key Entry -->
{#if !apiKey}
  <div class="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
    <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
      <div class="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Key class="w-8 h-8 text-blue-500" />
      </div>
      <h1 class="text-2xl font-bold text-white mb-3 text-center">Enter API Key</h1>
      <p class="text-zinc-400 mb-6 text-center text-sm">Enter your Gemini API key to get started.</p>
      <input
        type="password"
        bind:value={apiKeyInput}
        placeholder="AIza..."
        class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 mb-4"
        onkeydown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
      />
      <button
        onclick={saveApiKey}
        disabled={!apiKeyInput.trim()}
        class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold"
      >
        Continue
      </button>
    </div>
  </div>
{:else}
  <!-- Main App -->
  <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
    <header class="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 sticky top-0 z-50">
      <div class="flex items-center gap-2">
        <Sparkles class="w-5 h-5 text-blue-400" />
        <span class="font-bold text-lg">Gemini Artist</span>
      </div>
      <button onclick={handleCreateNewSession} class="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
        <Plus class="w-4 h-4" />
        <span class="hidden sm:inline">New</span>
      </button>
    </header>

    <div class="w-full border-b border-zinc-800 bg-zinc-900/30 overflow-x-auto">
      <div class="max-w-5xl mx-auto flex items-center gap-3 p-3 min-w-max">
        {#each sessions as session, idx (session.id)}
          <div
            role="button"
            onclick={() => handleSwitchSession(session.id)}
            class="relative w-16 h-16 rounded-lg cursor-pointer overflow-hidden border-2 {activeSessionId === session.id ? 'border-blue-500' : 'border-zinc-800 opacity-60 hover:opacity-100'}"
          >
            {#if session.image}
              <img src={session.image.url} alt="Session {idx + 1}" class="w-full h-full object-cover" />
            {:else}
              <div class="w-full h-full bg-zinc-800 flex items-center justify-center">
                <Layout class="w-5 h-5 text-zinc-600" />
              </div>
            {/if}
            <button onclick={(e) => handleDeleteSession(session.id, e)} class="absolute top-0.5 right-0.5 p-1 bg-black/50 text-white opacity-0 hover:opacity-100 rounded-full">
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        {/each}
      </div>
    </div>

    <main class="flex-1 flex flex-col items-center p-4 md:p-8 w-full max-w-5xl mx-auto gap-6">
      {#if errorMessage}
        <div class="w-full bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
          {errorMessage}
        </div>
      {/if}

      <div class="relative w-full aspect-square max-w-[1000px] bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        {#if !currentImage && !isLoading}
          <div class="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-3">
            <ImageIcon class="w-12 h-12 opacity-50" />
            <p class="text-sm">Describe an image to generate</p>
          </div>
        {/if}
        {#if isLoading}
          <div class="absolute inset-0 z-30 bg-black/60 flex items-center justify-center">
            <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
          </div>
        {/if}
        {#if currentImage}
          <img src={currentImage.url} alt="Generated" class="absolute inset-0 w-full h-full object-contain bg-zinc-950" />
        {/if}
        <CanvasLayer
          bind:this={canvasLayer}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 w-full h-full {!currentImage ? 'pointer-events-none opacity-0' : ''}"
          {drawingState}
          onStroke={() => { hasDrawing = true; }}
        />
        {#if currentImage && !isLoading}
          <div class="absolute top-3 right-3 flex gap-2 z-20">
            <button onclick={handleDownload} class="p-2 bg-zinc-900/80 text-zinc-300 hover:text-white rounded-lg">
              <Download class="w-4 h-4" />
            </button>
            <button onclick={handleResetCurrent} class="p-2 bg-zinc-900/80 text-red-400 hover:text-red-300 rounded-lg">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        {/if}
      </div>

      <div class="w-full max-w-[1000px] flex flex-col gap-4 pb-8">
        {#if currentImage}
          <div class="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div class="flex items-center gap-2">
              <Palette class="w-4 h-4 text-zinc-500" />
              {#each MASK_COLORS as color}
                <button
                  onclick={() => selectColor(color.hex)}
                  class="w-6 h-6 rounded-full border-2 {color.tailwind} {drawingState.color === color.hex ? 'border-white scale-110' : 'border-transparent opacity-70'}"
                ></button>
              {/each}
            </div>
            {#if hasDrawing}
              <button onclick={clearDrawing} class="text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1">
                <Eraser class="w-3 h-3" /> Clear
              </button>
            {/if}
          </div>
        {/if}

        {#if !currentImage}
          <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl">
            <input
              type="text"
              value={promptText}
              oninput={handlePromptInput}
              onkeydown={(e) => { if (e.key === 'Enter' && promptText.trim()) handleGenerate(); }}
              placeholder="Describe the image..."
              class="flex-1 bg-transparent border-none outline-none text-white placeholder-zinc-500 px-3 py-2"
              disabled={isLoading}
            />
            <button
              onclick={handleGenerate}
              disabled={!promptText.trim() || isLoading}
              class="p-2.5 rounded-lg transition-all {promptText.trim() && !isLoading ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}"
            >
              {#if isLoading}<Loader2 class="w-5 h-5 animate-spin" />{:else}<Send class="w-5 h-5" />{/if}
            </button>
          </div>
        {:else}
          <div class="flex flex-col gap-3">
            <input 
              type="text"
              value={getActiveSession()?.globalPrompt || ''}
              oninput={handleGlobalPromptChange}
              placeholder="Global instruction..."
              class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              disabled={isLoading}
            />
            <div class="space-y-2 pl-3 border-l-2 border-zinc-800">
              {#each MASK_COLORS as color}
                <div class="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-lg {drawingState.color === color.hex ? 'ring-1 ring-zinc-600' : ''}">
                  <div class="w-2 h-6 rounded {color.tailwind}"></div>
                  <input
                    type="text"
                    value={getActiveSession()?.modPrompts?.[color.hex] || ''}
                    oninput={(e) => handleMaskPromptChange(color.hex, e)}
                    onfocus={() => selectColor(color.hex)}
                    placeholder="{color.name} area..."
                    class="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
                    disabled={isLoading}
                  />
                </div>
              {/each}
            </div>
            <button
              onclick={handleEdit}
              disabled={isLoading || !(getActiveSession()?.globalPrompt?.trim() || Object.values(getActiveSession()?.modPrompts || {}).some(v => v?.trim()))}
              class="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all {
                (getActiveSession()?.globalPrompt?.trim() || Object.values(getActiveSession()?.modPrompts || {}).some(v => v?.trim())) && !isLoading
                  ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }"
            >
              {#if isLoading}<Loader2 class="w-4 h-4 animate-spin" />{:else}<RotateCcw class="w-4 h-4" />{/if}
              Apply Edits
            </button>
          </div>
        {/if}
      </div>
    </main>
  </div>
{/if}
