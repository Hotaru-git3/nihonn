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

  const prompt = `Kamu adalah konverter teks Jepang ke romaji. Tugasmu HANYA mengubah teks Jepang menjadi romaji Latin.

ATURAN MUTLAK:
1. JANGAN membuat kalimat baru. Ubah field "target" menjadi romaji.
2. JANGAN menggabungkan item. 1 item = 1 soal.
3. JANGAN mengubah, menambah, atau mengurangi teks Jepang.
4. "romaji" HARUS huruf Latin semua. DILARANG ada kanji/hiragana/katakana.
5. "romaji" harus transliterasi LENGKAP dari "sentence".

Daftar item:
${items.map((i: any, idx: number) => `${idx + 1}. id=${i.id} | target=${i.target} | reading=${i.reading || ''}`).join('\n')}

Balas HANYA JSON array:
[
  {"itemId":"id_item", "romaji":"romaji_latin"}
]

Contoh romaji yang benar:
"私は学生です" → "watashi wa gakusei desu"
"本を読みます" → "hon o yomimasu"
"駅で降ります" → "eki de orimasu"
"毎日電車に乗ります" → "mainichi densha ni norimasu"`;

  try {
    const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY_LLAMA || '';
    
    if (!apiKey) {
      throw new Error('No API key configured');
    }

    const openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey,
    });

    const response = await openai.chat.completions.create({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
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

    const parsed = JSON.parse(resultText);
    
    if (!Array.isArray(parsed) || parsed.length !== items.length) {
      throw new Error('AI mengembalikan jumlah soal yang tidak sesuai');
    }

    const sentences = parsed.map((question: any, index: number) => {
      const item = items[index];
      
      // Validasi ketat
      if (question?.itemId !== item.id) {
        throw new Error(`ID mismatch at index ${index}`);
      }
      if (typeof question.romaji !== 'string' || !question.romaji.trim()) {
        throw new Error(`Empty romaji at index ${index}`);
      }
      if (/[ぁ-んァ-ン一-龯々]/u.test(question.romaji)) {
        throw new Error(`Romaji contains Japanese characters at index ${index}: "${question.romaji}"`);
      }

      return {
        itemId: item.id,
        sentence: item.target.trim(),
        romaji: question.romaji.trim(),
      };
    });
    
    return res.json({ sentences });

  } catch (err: any) {
    console.error('Quiz generate error:', err.message);
    return res.status(502).json({ error: 'Soal quiz gagal dibuat. Silakan coba lagi.' });
  }
}