/**
 * Gemini API client wrapper.
 *
 * Uses the @google/generative-ai SDK for typed requests.
 * Model: gemini-1.5-flash
 *
 * Two call types:
 *   1. classifyElement  — ~200 token input, ~50 token output, JSON response
 *   2. simplifyText     — ~1000 token input, ~800 token output, plain text response
 *
 * The API key is resolved in priority order:
 *   1. User-provided key in chrome.storage.sync (settings.apiKey)
 *   2. VITE_GEMINI_API_KEY env var baked in at build time (dev fallback)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ElementMetadata, ElementAction, Profile } from '@/shared/types';

const MODEL = 'gemini-2.5-flash';
const DEV_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// Re-use the same client instance as long as the key doesn't change
let _client: GoogleGenerativeAI | null = null;
let _clientKey = '';

/**
 * Return a cached GoogleGenerativeAI instance for the given API key.
 * A new instance is only created when the key changes between calls.
 */
function getClient(apiKey: string): GoogleGenerativeAI {
  if (!_client || _clientKey !== apiKey) {
    _client = new GoogleGenerativeAI(apiKey);
    _clientKey = apiKey;
  }
  return _client;
}

/** Resolve the API key to use, throwing if none is available. */
export function resolveApiKey(settingsKey: string): string {
  const key = settingsKey || DEV_API_KEY || '';
  if (!key) throw new Error('[NI] No Gemini API key configured. Please enter a valid key in .env file.');
  return key;
}

// ---------------------------------------------------------------------------
// Element classification (borderline elements)
// ---------------------------------------------------------------------------

export interface ClassificationResponse {
  action: ElementAction['action'];
  confidence: number;
  reason: string;
}

/**
 * Ask Gemini to classify a single borderline element.
 * Returns the parsed JSON response, or 'keep' on parse failure.
 */
export async function classifyElement(
  element: ElementMetadata,
  systemPrompt: string,
  apiKey: string,
): Promise<ClassificationResponse> {
  const client = getClient(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const userContent = [
    `Tag: ${element.tag}`,
    `Role: ${element.role ?? 'none'}`,
    `Classes: ${element.classes.join(', ') || 'none'}`,
    `Z-index: ${element.zIndex}`,
    `Dimensions: ${element.rect.width}×${element.rect.height}px`,
    `Text preview: "${element.textContent.slice(0, 100)}"`,
  ].join('\n');

  try {
    const response = await model.generateContent(userContent);
    const raw = response.response.text();
    const parsed = JSON.parse(raw) as ClassificationResponse;
    if (!['hide', 'collapse', 'keep'].includes(parsed.action)) parsed.action = 'keep';
    return parsed;
  } catch {
    return { action: 'keep', confidence: 0, reason: 'parse error' };
  }
}

// ---------------------------------------------------------------------------
// ADHD TL;DR summarization (streaming)
// ---------------------------------------------------------------------------

const TLDR_SYSTEM_PROMPT =
  'You are an accessibility assistant for users with ADHD. Read the following webpage text and identify the primary topic or core value of the article/page. Extract the most important information and output exactly 3 to 4 short, highly scannable bullet points that summarize the main takeaways. Do not include introductory or concluding sentences. Keep the language simple and direct.';

/**
 * Fetch a TL;DR summary from Gemini using a single blocking request.
 * Calls `onChunk` once with the full response so the caller's pipeline
 * remains unchanged. Returns the full text.
 */
export async function streamTLDRSummary(
  text: string,
  title: string,
  apiKey: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const client = getClient(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: TLDR_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.0 },
  });

  const userContent = `Page title: "${title}"\n\n${text}`;
  const response = await model.generateContent(userContent);
  const fullText = response.response.text().trim();
  if (fullText) onChunk(fullText);
  return fullText;
}


// ---------------------------------------------------------------------------
// Autism Literal Translation (streaming)
// ---------------------------------------------------------------------------

const LITERAL_SYSTEM_PROMPT =
  'You are an accessibility assistant for users with autism. Rewrite the following text into plain, literal, easy-to-understand English. Remove all idioms, metaphors, sarcasm, implied meanings, and figurative language. State exactly what the author means using simple, direct words. Format your response EXCLUSIVELY as standard paragraphs separated by blank lines. Do NOT use bullet points, numbered lists, dashes, asterisks, markdown headings, bold, italics, or any other list or markdown formatting. Do not add any headers or section titles. Every sentence must be clear and literal. Do not include any introductory or concluding sentences.';

/**
 * Fetch a literal translation from Gemini using a single blocking request.
 * Calls `onChunk` once with the full response so the caller's pipeline
 * remains unchanged. Returns the full text.
 */
export async function streamLiteralTranslation(
  text: string,
  title: string,
  apiKey: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const client = getClient(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: LITERAL_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.0 },
  });

  const userContent = `Page title: "${title}"\n\n${text}`;
  const response = await model.generateContent(userContent);
  const fullText = response.response.text().trim();
  if (fullText) onChunk(fullText);
  return fullText;
}

// ---------------------------------------------------------------------------
// Text simplification
// ---------------------------------------------------------------------------

/**
 * Simplify a single text chunk using the profile-specific system prompt.
 * Returns the simplified text, or the original on API error.
 */
export async function simplifyText(
  text: string,
  _profile: Profile,
  systemPrompt: string,
  apiKey: string,
): Promise<string> {
  const client = getClient(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
  });

  try {
    const response = await model.generateContent(text);
    const simplified = response.response.text().trim();
    return simplified || text;
  } catch {
    return text;
  }
}
