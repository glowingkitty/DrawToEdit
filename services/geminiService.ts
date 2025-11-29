import { GoogleGenAI, Type } from "@google/genai";
import type { GeneratedImage } from "../types";

// Model constants for image generation and vision tasks
const IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VISION_MODEL = 'gemini-2.5-flash';

/**
 * Gets the API key from sessionStorage or environment variable.
 * Simple and straightforward - user enters key, it's stored in sessionStorage.
 */
const getApiKey = (): string => {
  // Check sessionStorage first (user-entered key)
  if (typeof window !== 'undefined') {
    const sessionKey = sessionStorage.getItem('gemini_api_key');
    if (sessionKey) {
      return sessionKey;
    }
  }

  // Fallback to env var
  try {
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) {
      return envKey;
    }
  } catch (e) {
    // ignore
  }

  throw new Error('No API key found. Please enter your API key.');
};

/**
 * Creates a fresh AI instance.
 * Crucial to call this immediately before API use to pick up the latest
 * user-selected API key from window.aistudio or environment/localStorage.
 * This ensures we always use the most recent API key selection.
 */
const getAiInstance = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set GEMINI_API_KEY in .env.local or enter it in the app.');
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Generates a new image from a text prompt using Gemini 3 Pro Image model.
 * @param prompt - Text description of the image to generate
 * @returns Promise resolving to the generated image data
 */
export const generateImage = async (prompt: string): Promise<GeneratedImage> => {
  console.log('[geminiService] Starting image generation with prompt:', prompt.substring(0, 50) + '...');
  const ai = getAiInstance();
  
  // Using generateContent for nano banana series models (gemini-3-pro-image-preview)
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        imageSize: "1K",
        aspectRatio: "1:1"
      }
    }
  });

  const result = extractImageFromResponse(response);
  console.log('[geminiService] Image generation completed successfully');
  return result;
};

/**
 * Interface for mask-specific editing instructions.
 * Each mask color can have its own instruction.
 */
export interface MaskInstruction {
  colorName: string;
  instruction: string;
}

/**
 * Detects if the generated image still contains the neon UI marker lines.
 * Uses a fast vision model (gemini-2.5-flash) for quick artifact detection.
 * @param base64Image - Base64 encoded image to check
 * @returns Promise resolving to true if artifacts are detected
 */
const detectArtifacts = async (base64Image: string): Promise<boolean> => {
  console.log('[geminiService] Checking for neon artifacts in generated image');
  const ai = getAiInstance();
  try {
    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `
              Analyze this image carefully. 
              Do you see bright neon colored (Cyan, Magenta, Yellow, Lime/Green) circular lines, loops, or scribbles drawn ON TOP of the scene?
              
              These are digital UI artifacts that should not be there.
              
              Respond with valid JSON only: { "hasArtifacts": boolean }
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                hasArtifacts: { type: Type.BOOLEAN }
            }
        }
      }
    });

    const text = response.text;
    if (!text) {
      console.log('[geminiService] No text response from artifact detection, assuming no artifacts');
      return false;
    }
    const json = JSON.parse(text);
    const hasArtifacts = !!json.hasArtifacts;
    console.log('[geminiService] Artifact detection result:', hasArtifacts);
    return hasArtifacts;

  } catch (e) {
    console.warn("[geminiService] Artifact detection failed, skipping cleanup check.", e);
    return false;
  }
};

/**
 * Runs a cleanup pass on the image to remove detected neon lines.
 * This is called automatically if artifacts are detected after the initial edit.
 * @param base64Image - Base64 encoded image to clean
 * @param mimeType - MIME type of the image
 * @returns Promise resolving to the cleaned image
 */
const cleanupImage = async (base64Image: string, mimeType: string): Promise<GeneratedImage> => {
    console.log('[geminiService] Running cleanup pass to remove neon artifacts');
    const ai = getAiInstance();
    const prompt = `
      The input image contains unwanted bright neon digital marker lines (Cyan, Magenta, Yellow, or Green).
      
      TASK:
      1. Remove these neon lines completely.
      2. Inpaint the areas behind the lines to match the surrounding natural scene photorealistically.
      3. Do NOT change the rest of the image content. Preserve the previous edits.
      
      Output the clean, final image.
    `;

    const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                },
                { text: prompt }
            ]
        },
        config: {
            imageConfig: { imageSize: "1K", aspectRatio: "1:1" }
        }
    });

    const result = extractImageFromResponse(response);
    console.log('[geminiService] Cleanup pass completed successfully');
    return result;
};

/**
 * Edits an existing image with drawing-based masks and instructions.
 * Supports both global instructions (applying to entire image) and mask-specific instructions.
 * Automatically detects and removes neon artifact lines if they appear in the output.
 * 
 * @param originalImageBase64 - Base64 encoded original image
 * @param originalMimeType - MIME type of the original image
 * @param compositeImageBase64 - Base64 encoded composite (original + drawing overlay)
 * @param instructions - Array of mask-specific instructions, keyed by color
 * @param globalInstruction - Global instruction applying to the entire image
 * @returns Promise resolving to the edited image
 */
export const editImageWithDrawing = async (
  originalImageBase64: string,
  originalMimeType: string,
  compositeImageBase64: string, 
  instructions: MaskInstruction[],
  globalInstruction: string
): Promise<GeneratedImage> => {
  console.log('[geminiService] Starting image edit with', instructions.length, 'mask instructions');
  const ai = getAiInstance();

  // Construct a structured prompt detailing which color maps to which instruction
  const instructionText = instructions
    .map(i => `[${i.colorName.toUpperCase()} ANNOTATION]: ${i.instruction}`)
    .join('\n');

  const prompt = `
    You are an expert AI photo retoucher and inpainting specialist.
    
    INPUTS:
    1. IMAGE 1: The Clean Source Image.
    2. IMAGE 2: The Annotated Reference Image. This is identical to Image 1 but contains BRIGHT NEON ANNOTATIONS overlaying specific areas.

    TASK:
    Modify IMAGE 1 based on the instructions below.

    GLOBAL INSTRUCTION (Applies to the entire image style/scene):
    "${globalInstruction || 'Keep the overall style and scene consistent, focusing on the specific edits below.'}"

    SPECIFIC REGION EDITS (Apply to areas marked in IMAGE 2):
    ${instructionText || 'No specific region edits provided.'}

    CRITICAL INSTRUCTIONS FOR IMAGE PROCESSING:
    1. **INTERPRETATION**: The neon lines/circles in IMAGE 2 are purely **meta-data annotations** to indicate *where* to edit. They are NOT part of the physical scene.
    2. **REMOVAL**: You must conceptually **ERASE** these neon markings. The final output must NOT contain any bright neon lines, circles, or scribbles.
    3. **EXECUTION**: 
       - Look at the neon annotations in IMAGE 2 to identify the target regions.
       - Apply the user's specific text instructions to those regions in the context of IMAGE 1.
       - Apply the GLOBAL INSTRUCTION to the overall image mood/style if specified.
       - Generate a photorealistic result that blends seamlessly with the original lighting and texture of IMAGE 1.
    
    FINAL CHECK:
    - Does the output image look like a real photograph?
    - Have all neon marker lines been completely removed?
    - Are the requested edits applied correctly?
  `;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: originalMimeType,
            data: originalImageBase64
          }
        },
        {
          inlineData: {
            mimeType: 'image/jpeg', 
            data: compositeImageBase64
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      imageConfig: {
        imageSize: "1K", // Maintain resolution
        aspectRatio: "1:1"
      }
    }
  });

  const firstPassImage = extractImageFromResponse(response);
  console.log('[geminiService] First pass edit completed, checking for artifacts');

  // --- AUTOMATED CLEANUP LOOP ---
  // Sometimes the model still includes the neon lines. We check for them and run a cleanup pass if needed.
  
  // 1. Detect
  const hasArtifacts = await detectArtifacts(firstPassImage.base64);

  if (hasArtifacts) {
      console.log("[geminiService] Neon artifacts detected in output. Initiating automatic cleanup pass...");
      // 2. Cleanup
      try {
          const cleanImage = await cleanupImage(firstPassImage.base64, firstPassImage.mimeType);
          console.log('[geminiService] Image edit completed successfully after cleanup');
          return cleanImage;
      } catch (e) {
          console.error("[geminiService] Cleanup pass failed, returning first pass result.", e);
          return firstPassImage;
      }
  }

  console.log('[geminiService] Image edit completed successfully (no cleanup needed)');
  return firstPassImage;
};

/**
 * Helper function to reliably extract image data from API response.
 * Handles various response formats and extracts base64 image data.
 * @param response - API response object
 * @returns GeneratedImage object with URL, base64, and mimeType
 * @throws Error if no image is found in the response
 */
const extractImageFromResponse = (response: any): GeneratedImage => {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates returned from API");
  }

  const parts = candidates[0].content.parts;
  let imagePart = parts.find((p: any) => p.inlineData);

  if (!imagePart || !imagePart.inlineData) {
    const textPart = parts.find((p: any) => p.text);
    throw new Error(textPart?.text || "No edited image generated");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
    url: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`
  };
};

