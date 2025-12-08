import { buildSchema, BuildSpec } from './schema';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'linux-builder';

export async function generateBuildSpec(userPrompt: string): Promise<BuildSpec> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: userPrompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.response;

  // Extract JSON from response (handle potential thinking tags or extra text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No valid JSON found in response: ${text.substring(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const validated = buildSchema.parse(parsed);

  return validated;
}
