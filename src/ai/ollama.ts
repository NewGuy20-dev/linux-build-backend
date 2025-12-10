import { buildSchema, BuildSpec } from './schema';
import { systemPrompt } from './systemPrompt';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'linux-builder';
const MAX_RETRIES = 3;
const MAX_PROMPT_LENGTH = 2000;

/**
 * Produce a trimmed, injection-resistant version of a user prompt.
 *
 * The returned string is truncated to the configured maximum length, trimmed, and cleaned of common prompt-injection markers (for example: phrases like "ignore previous/above/all instructions/prompts", `system:`, `[INST]`, `<s>`/`</s>`, and `<<SYS>>`/`</SYS>>`).
 *
 * @returns The sanitized prompt string ready for inclusion in a model request
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
 * Send a prompt to the configured Ollama model and return the model's textual response.
 *
 * @param prompt - The full prompt text to send to the model
 * @returns The model's response text extracted from the API reply
 * @throws Error when the Ollama HTTP request returns a non-OK status
 */
async function callOllama(prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Extracts and parses the first JSON object found inside a text string.
 *
 * @param text - String that may contain a JSON object
 * @returns The parsed object from the first JSON-like block in `text`
 * @throws Error if no JSON-like block is found in `text`
 */
function extractJson(text: string): object {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No valid JSON found in response`);
  }
  return JSON.parse(jsonMatch[0]);
}

/**
 * Generate a validated BuildSpec from a user's natural-language prompt by calling the Ollama model and parsing its JSON response.
 *
 * The prompt is sanitized and the function will retry the model call up to the configured maximum attempts if parsing or validation fails.
 *
 * @param userPrompt - The user's natural-language description of the desired build; this input will be sanitized and truncated as needed.
 * @returns The `BuildSpec` object parsed and validated against the schema.
 * @throws Error if the model does not return valid JSON that satisfies the schema after the maximum number of retry attempts.
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