<script lang="ts">
  import { Key, Lock } from 'lucide-svelte';

  // Props
  interface Props {
    onReady: () => void;
  }

  let { onReady }: Props = $props();

  // State
  let manualKey = $state('');
  let showManualInput = $state(false);
  let error = $state('');

  /**
   * Check for API key synchronously
   */
  function hasApiKey(): boolean {
    // Check environment variable
    try {
      const envKey = import.meta.env?.VITE_GEMINI_API_KEY;
      if (envKey && envKey.trim()) {
        return true;
      }
    } catch (e) {
      // ignore
    }

    // Check localStorage
    try {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) {
        return true;
      }
    } catch (e) {
      // ignore
    }

    return false;
  }

  // Check immediately and call onReady if key exists
  // Using $effect to run after initial render
  let hasChecked = $state(false);
  let keyFound = $state(false);
  
  $effect(() => {
    if (!hasChecked) {
      hasChecked = true;
      console.log('[ApiKeySelector] Checking for API key...');
      keyFound = hasApiKey();
      console.log('[ApiKeySelector] Key found:', keyFound);
      if (keyFound) {
        console.log('[ApiKeySelector] Calling onReady');
        onReady();
      }
    }
  });

  /**
   * Opens the API key selection dialog.
   */
  function handleSelectKey() {
    if (window.aistudio?.openSelectKey) {
      window.aistudio.openSelectKey().then(() => {
        if (hasApiKey()) {
          keyFound = true;
          onReady();
        }
      });
    } else {
      showManualInput = true;
    }
  }

  /**
   * Handles manual API key entry.
   */
  function handleManualKeySubmit() {
    if (!manualKey.trim()) {
      error = 'Please enter an API key';
      return;
    }
    
    localStorage.setItem('gemini_api_key', manualKey.trim());
    console.log('[ApiKeySelector] API key stored in localStorage');
    
    keyFound = true;
    onReady();
  }
</script>

{#if !hasChecked}
  <!-- Initial loading state before first check -->
  <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 text-zinc-400">
    <div class="animate-pulse">Checking access...</div>
  </div>
{:else if !keyFound}
  <!-- No API key found - show entry form -->
  <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 p-6 text-center overflow-y-auto">
    <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
      <div class="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Key class="w-8 h-8 text-blue-500" />
      </div>
      
      <h1 class="text-2xl font-bold text-white mb-3">Authentication Required</h1>
      <p class="text-zinc-400 mb-8 leading-relaxed">
        To use the <span class="text-blue-400 font-medium">Gemini 3 Pro</span> image generation model, 
        you need a valid API key.
      </p>

      {#if !showManualInput}
        <button
          onclick={handleSelectKey}
          class="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-semibold transition-all transform active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 mb-4"
        >
          <Lock class="w-4 h-4" />
          Enter API Key
        </button>
      {:else}
        <div class="space-y-4">
          <div>
            <label for="api-key-input" class="block text-sm font-medium text-zinc-300 mb-2 text-left">
              Enter your Gemini API Key
            </label>
            <input
              id="api-key-input"
              type="password"
              bind:value={manualKey}
              placeholder="AIza..."
              class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              onkeydown={(e) => { if (e.key === 'Enter') handleManualKeySubmit(); }}
            />
            {#if error}
              <p class="text-red-400 text-sm mt-2">{error}</p>
            {/if}
          </div>
          <button
            onclick={handleManualKeySubmit}
            class="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-semibold transition-all transform active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
          >
            <Lock class="w-4 h-4" />
            Continue
          </button>
          <button
            onclick={() => { showManualInput = false; error = ''; }}
            class="w-full py-2 text-zinc-400 hover:text-zinc-300 text-sm"
          >
            Cancel
          </button>
        </div>
      {/if}

      <p class="mt-6 text-xs text-zinc-500">
        Set <code class="bg-zinc-800 px-1 py-0.5 rounded">VITE_GEMINI_API_KEY</code> in <code class="bg-zinc-800 px-1 py-0.5 rounded">.env.local</code> file.
      </p>
    </div>
  </div>
{/if}
