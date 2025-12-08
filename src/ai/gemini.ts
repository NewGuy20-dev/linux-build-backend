import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildSchema, BuildSpec } from './schema';
import { systemPrompt } from './systemPrompt';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function generateBuildSpec(userPrompt: string): Promise<BuildSpec> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: `User request: ${userPrompt}` },
  ]);

  const response = result.response;
  const text = response.text();

  const parsed = JSON.parse(text);
  const validated = buildSchema.parse(parsed);

  return validated;
}
