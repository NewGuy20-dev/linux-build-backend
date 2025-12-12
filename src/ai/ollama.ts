import { buildSchema, BuildSpec } from './schema';
import { systemPrompt } from './systemPrompt';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'linux-builder';
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10);
const MAX_RETRIES = 3;
const MAX_PROMPT_LENGTH = 2000;

/**
 * Sanitizes a user-supplied prompt by truncating it and removing common prompt-injection patterns.
 *
 * @param prompt - The raw user prompt that may contain instructions, system markers, or markup
 * @returns The sanitized prompt truncated to MAX_PROMPT_LENGTH with common injection patterns removed and whitespace trimmed
 */
function sanitizePrompt(prompt: string): string {
  // Truncate to max length
  let sanitized = prompt.slice(0, MAX_PROMPT_LENGTH);
  
  // Remove potential injection patterns
  sanitized = sanitized
    .replace(/ignore\s+(previous|above|all)\s+(instructions?|prompts?)/gi, '')
    .replace(/system\s*:/gi, '')
    .replace(/\[INST\]/gi, '')
    .replace(/<\/?s>/gi, '')
    .replace(/<<SYS>>|<\/SYS>>/gi, '');
  
  return sanitized.trim();
}

/**
 * Send a prompt to the configured Ollama API and return the model's response text.
 *
 * @param prompt - The prompt to send to Ollama (should be pre-sanitized and within allowed length)
 * @returns The raw response string returned by the Ollama model
 * @throws If the HTTP request fails or the Ollama response has a non-OK status
 */
async function callOllama(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extracts and parses the first balanced JSON object found within a string.
 *
 * @param text - The input text to search for a JSON object.
 * @returns The parsed object from the first balanced JSON object found in `text`.
 * @throws Error with message "Response too large" if `text` is longer than 100000 characters.
 * @throws Error with message "No valid JSON found in response" if no balanced JSON object is found.
 * @throws SyntaxError if the located JSON slice cannot be parsed by `JSON.parse`.
 */
function extractJson(text: string): object {
  if (text.length > 100000) {
    throw new Error('Response too large');
  }
  
  // Find balanced braces instead of greedy regex
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('No valid JSON found in response');
  }
  
  let depth = 0;
  for (let i = start; i < text.length && i < start + 50000; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) {
      return JSON.parse(text.slice(start, i + 1));
    }
  }
  
  throw new Error('No valid JSON found in response');
}

/**
 * Generate a validated BuildSpec from a user's prompt.
 *
 * Sanitizes the provided prompt, queries the model to produce JSON, extracts the first JSON object from the response, and validates it against the build schema.
 *
 * @param userPrompt - The raw user-provided prompt to convert into a build specification
 * @returns The validated BuildSpec parsed from the model's JSON response
 * @throws Error if a valid JSON BuildSpec cannot be produced or validated after the configured retry attempts
 */
export async function generateBuildSpec(userPrompt: string): Promise<BuildSpec> {
  const sanitizedPrompt = sanitizePrompt(userPrompt);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use delimiters to separate system instructions from user input
      const fullPrompt = attempt === 1
        ? `${systemPrompt}\n\n---USER REQUEST START---\n${sanitizedPrompt}\n---USER REQUEST END---\n\nRespond with JSON only.`
        : `${systemPrompt}\n\n---USER REQUEST START---\n${sanitizedPrompt}\n---USER REQUEST END---\n\nIMPORTANT: Return ONLY valid JSON. Previous attempt failed. Ensure all required fields are present.`;

      const text = await callOllama(fullPrompt);
      const parsed = extractJson(text);
      return buildSchema.parse(parsed);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Ollama attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
      }
    }
  }

  throw lastError || new Error('Unknown error');
}