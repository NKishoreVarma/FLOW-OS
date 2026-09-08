import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.GEMINI_BASE_URL;
  console.log('Testing with top-level baseUrl option...');
  console.log('Key:', apiKey);
  console.log('Base URL:', baseUrl);

  const ai = new GoogleGenAI({ 
    apiKey, 
    baseUrl 
  });

  try {
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: 'hello world'
    });
    console.log('Success! Values:', response?.embedding?.values?.slice(0, 5));
  } catch (err) {
    console.error('Error with top-level baseUrl:', err.message);
  }
}

run();
