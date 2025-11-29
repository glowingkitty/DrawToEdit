// Type definitions for the application
export interface GeneratedImage {
  url: string; // Base64 data URL
  base64: string; // Raw base64 data without prefix
  mimeType: string;
}

export interface DrawingState {
  isDrawing: boolean;
  color: string;
  brushSize: number;
}

// Session interface for managing multiple image editing sessions
export interface Session {
  id: string;
  image: GeneratedImage | null;
  basePrompt: string;
  globalPrompt: string;
  modPrompts: Record<string, string>;
  drawingDataUrl: string | null;
  isLoading: boolean; // Track loading state per session for parallel processing
  error: string | null; // Track errors per session
}

// Global type declaration for AI Studio API
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

