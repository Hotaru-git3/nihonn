import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items required' });
  }

  const prompt = `Buat ${items.length} kalimat Bahasa Jepang sederhana (JLPT N5-N4) menggunakan kata-kata ini:
${items.map((i: any, idx: number) => `${idx + 1}. ${i.word || i.character || i.pattern}`).join('\n')}

Balas HANYA JSON:
[
  {
    "sentence": "kalimat jepang",
    "romaji": "romaji reading"
  }
]

Contoh romaji yang benar:
"私は学生です" → "watashi wa gakusei desu"
"本を読みます" → "hon o yomimasu"`;

  try {
    const apiKey = process.env.NVIDIA_API_KEY_QWEN || process.env.NVIDIA_API_KEY_LLAMA || process.env.NVIDIA_API_KEY || '';
    
    const openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey,
    });

    const response = await openai.chat.completions.create({
      model: 'qwen/qwen3.5-122b-a10b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });

    let resultText = response.choices[0]?.message?.content || '';
    resultText = resultText.trim();
    
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const firstBracket = resultText.indexOf('[');
    const lastBracket = resultText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      resultText = resultText.substring(firstBracket, lastBracket + 1);
    }

    const sentences = JSON.parse(resultText);
    
    return res.json({ sentences });

  } catch (err: any) {
    console.error('Quiz generate error:', err.message);
    
    // Fallback: generate kalimat simpel dari items
    const fallbackSentences = items.map((i: any, idx: number) => {
      const word = i.word || i.character || i.pattern || 'desu';
      const otherWord = items[(idx + 1) % items.length]?.word || 'desu';
      
      return {
        sentence: `${word}は${otherWord}です`,
        romaji: `${word} wa ${otherWord} desu`
      };
    });

    return res.json({ sentences: fallbackSentences });
  }
}