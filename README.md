# Gemini Pro Vision Artist - Svelte Edition

A Svelte-based image generation and editing application using Google's Gemini 3 Pro Image model. This app allows you to generate images from text prompts and edit them using drawing-based masks with parallel processing support.

## Features

- **Image Generation**: Generate images from text descriptions using Gemini 3 Pro Image
- **Image Editing**: Edit images using drawing masks with color-coded regions
- **Parallel Processing**: Process multiple images simultaneously - each session operates independently
- **Multiple Sessions**: Work on multiple images at once with session management
- **Drawing Tools**: Draw masks with different colors to mark regions for editing
- **Global & Local Instructions**: Apply global style changes or specific edits to masked regions

## Prerequisites

- Node.js (v18 or higher recommended)
- A Gemini API key from a paid GCP project

## Installation

1. Install dependencies:
```bash
npm install
```

2. **Enter your API key in the web app**:
   
   When you first open the app, you'll be prompted to enter your Gemini API key. Simply enter your key in the authentication dialog, and it will be stored in your browser's session storage for the duration of your session.
   
   Get your API key from: https://aistudio.google.com/apikey
   
   **Note**: The API key is stored in session storage, which means it will be cleared when you close your browser tab/window. You'll need to re-enter it each time you start a new session.

## Running the App

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Parallel Processing

This app supports true parallel processing - you can:
- Start generating a new image in one session while another session is processing
- Edit multiple images simultaneously
- Switch between sessions while operations are running
- Each session maintains its own loading state and error handling

## Usage

1. **Generate an Image**: 
   - Enter a text description in the input field
   - Click the send button to generate

2. **Edit an Image**:
   - After generating, drawing mode is automatically enabled
   - Select a mask color and draw on the image to mark regions
   - Enter instructions for each colored region or provide a global instruction
   - Click "Apply Edits" to process the changes

3. **Multiple Sessions**:
   - Click "New Image" to create a new session
   - Switch between sessions using the session bar
   - Each session can process independently

## Technology Stack

- **Svelte 5**: Modern reactive framework with runes
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Svelte**: Icon library
- **Google Gemini API**: Image generation and editing

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── ApiKeySelector.svelte    # API key selection UI
│   │   └── CanvasLayer.svelte       # Drawing canvas component
│   ├── App.svelte                   # Main application component
│   ├── main.ts                      # Application entry point
│   └── index.css                    # Global styles
├── services/
│   └── geminiService.ts             # Gemini API integration
├── types.ts                         # TypeScript type definitions
└── package.json                     # Dependencies and scripts
```

## Notes

- The app uses Svelte 5 with the new runes syntax (`$state`, `$derived`, `$effect`)
- Each session tracks its own loading state to enable parallel processing
- The canvas drawing layer uses high-resolution (1024x1024) for quality
- Automatic artifact detection and cleanup removes neon marker lines from outputs

