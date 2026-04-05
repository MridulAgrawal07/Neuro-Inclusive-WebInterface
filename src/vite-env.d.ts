/// <reference types="vite/client" />

// Raw text imports (used for prompt templates in background/message-router.ts)
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Environment variables available in the extension bundle
interface ImportMetaEnv {
  readonly VITE_CLAUDE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
