import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10kb' }));

// ============================================================
// 1. SYSTEM PROMPT YANG SUDAH DIPERBAIKI
// ============================================================
const SYSTEM_PROMPT = `Kamu adalah guru bahasa Jepang ahli yang SANGAT KETAT dan FAKTUAL. 
Untuk teks Jepang yang diberikan, ekstrak detail berikut dengan akurasi 100%.

SANGAT PENTING (ATURAN KETAT): 
- DILARANG KERAS berhalusinasi atau mengarang arti kata/kanji. 
- Terjemahan utuh, arti kosakata (meaning), arti kanji, dan arti tata bahasa HARUS SELALU dalam Bahasa Indonesia.
- Terjemahan, cara baca (romaji/hiragana), dan arti HARUS valid sesuai kamus bahasa Jepang asli. 
- Jika input teks tidak masuk akal, abaikan saja. JANGAN mencoba menebak arti yang salah. Lebih baik kembalikan array kosong jika tidak ada arti yang valid.

**PERHATIAN KHUSUS UNTUK PEMECAHAN KATA (TOKENISASI):**
- JANGAN PERNAH memecah kata kerja (verbs) atau kata sifat (adjectives) menjadi suku kata/partikel terpisah.
- Contoh: "入れます" adalah SATU KATA UTUH (bentuk masu dari kata kerja "入れる"). JANGAN memecahnya menjadi "入" + "れ" + "ます".
- Contoh: "食べます" adalah SATU KATA UTUH (tabemasu). JANGAN memecahnya menjadi "食" + "べ" + "ます".
- Jika sebuah kata kerja berubah bentuk, kembalikan ke bentuk kamusnya (dictionary form) untuk field "word", tapi tuliskan bentuk aslinya di "reading".

1. Semua kosakata (kecuali partikel dan kata level N5 paling dasar). Field "meaning" wajib dalam Bahasa Indonesia.
2. Semua kanji yang muncul. Untuk kanji sertakan contoh kalimat singkat yang menggunakannya, dan juga contoh gabungan kata (elemen pendukung) yang menggunakan kanji tersebut beserta artinya (misal: "銀行 (ginkou) - bank"). Field "meaning" wajib dalam Bahasa Indonesia.
3. Semua pola tata bahasa. Field "meaning" wajib dalam Bahasa Indonesia.
4. Terjemahan utuh ke Bahasa Indonesia.

Pastikan field "word", "character", "pattern" dan lainnya TIDAK BOLEH KOSONG. Jika tidak ada data yang relevan, hapus dari array (kembalikan array kosong []).

Balas HANYA dalam format JSON (tanpa markdown, tanpa penjelasan):
{
  "vocabulary": [{"word": "kata", "reading": "cara baca", "meaning": "arti", "part_of_speech": "jenis kata", "jlpt_level": "N5"}],
  "kanji": [{"character": "kanji", "onyomi": "onyomi", "kunyomi": "kunyomi", "meaning": "arti", "stroke_count": 0, "jlpt_level": "N5", "example_words": "contoh kata", "example_sentence": "contoh kalimat"}],
  "grammar": [{"pattern": "pola", "meaning": "arti", "structure": "struktur", "example_sentence": "contoh kalimat"}],
  "translation": "terjemahan"
}`;

// ============================================================
// 2. KONFIGURASI MODEL (Diurutkan dari Ringan ke Berat)
// ============================================================
interface ModelConfig {
  name: string;
  apiKey: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
}

class AIService {
  private models: ModelConfig[];

  constructor() {
    this.models = [
      // Model 1: Paling ringan dan cepat (Digunakan pertama kali agar Vercel tidak timeout)
      {
        name: 'meta/llama-3.1-8b-instruct',
        apiKey: process.env.NVIDIA_API_KEY || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
      // Model 2: Mistral (Lebih pintar dari 8B, dan cukup cepat)
      {
        name: 'mistral-medium-3.5-128b',
        apiKey: process.env.NVIDIA_API_KEY_MISTRAL || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
      // Model 3 & 4: Llama 70B (Paling berat, tapi paling akurat. Dijadikan fallback terakhir)
      {
        name: 'meta/llama-3.3-70b-instruct',
        apiKey: process.env.NVIDIA_API_KEY_LLAMA || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
      {
        name: 'meta/llama-3.1-70b-instruct',
        apiKey: process.env.NVIDIA_API_KEY_LLAMA2 || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
    ].filter((m): m is ModelConfig => !!m.apiKey);
  }

  async generateBreakdown(text: string): Promise<any> {
    let lastError = null;

    for (const modelConfig of this.models) {
      try {
        console.log(`🤖 Mencoba model: ${modelConfig.name}`);
        
        const openai = new OpenAI({
          baseURL: 'https://integrate.api.nvidia.com/v1',
          apiKey: modelConfig.apiKey,
          timeout: 20000, // Timeout 20 detik agar cepat pindah ke model cadangan
        });

        const response = await openai.chat.completions.create({
          model: modelConfig.name,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Teks Jepang: ${text}\n\nPENTING: Semua arti wajib Bahasa Indonesia, dan JANGAN memecah kata kerja!` },
          ],
          temperature: modelConfig.temperature,
          top_p: modelConfig.top_p,
          max_tokens: 1024,
          stream: false,
        });

        let resultText = response.choices[0]?.message?.content || '';
        resultText = resultText.trim();
        
        // Bersihkan Markdown code blocks (```json ... ```)
        if (resultText.startsWith('```')) {
          resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
        }

        // Hanya ambil bagian JSON yang valid (di dalam kurung kurawal)
        const firstBrace = resultText.indexOf('{');
        const lastBrace = resultText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          resultText = resultText.substring(firstBrace, lastBrace + 1);
        } else {
          throw new Error('No valid JSON object found in response');
        }
        
        const parsed = JSON.parse(resultText);
        console.log(`✅ Berhasil dengan model: ${modelConfig.name}`);
        return parsed;

      } catch (err: any) {
        console.log(`❌ Model ${modelConfig.name} gagal:`, err.message || err);
        lastError = err;
        // Jika gagal karena format JSON, lanjut ke model berikutnya
      }
    }

    console.error('❌ SEMUA MODEL GAGAL');
    throw lastError || new Error('All models failed');
  }
}

const aiService = new AIService();

// ============================================================
// 3. ENDPOINT API UTAMA
// ============================================================
app.post('/api/ai/breakdown', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "Invalid input type." });
    }
    
    const sanitizedText = text.trim();
    if (sanitizedText.length === 0 || sanitizedText.length > 500) {
      return res.status(400).json({ error: "Text must be between 1 and 500 characters." });
    }

    console.log(`🤖 Memproses teks: "${sanitizedText.substring(0, 50)}..."`);

    const parsed = await aiService.generateBreakdown(sanitizedText);
    console.log('✅ AI Response berhasil diparsing');
    
    // Opsional: Filter/Truncate contoh kalimat Kanji agar tidak terlalu panjang untuk UI
    if (parsed.kanji && Array.isArray(parsed.kanji)) {
      parsed.kanji = parsed.kanji.map((k: any) => {
        if (k.example_sentence && k.example_sentence.length > 50) {
          k.example_sentence = k.example_sentence.substring(0, 50) + '...';
        }
        return k;
      });
    }

    res.json(parsed);

  } catch (err: any) {
    console.error('❌ AI API Error Global:', err.message);
    res.status(500).json({ 
      error: "An error occurred while processing the request.", 
      detail: err.message 
    });
  }
});

// ============================================================
// 4. HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    models_available: aiService['models'].length,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// 5. TYPE DEFINITIONS (Untuk Frontend / TS Reference)
// ============================================================
export interface QuizSentence {
  sentence: string;
  translation: string;
}

export interface QuizSession {
  id?: string;
  items_used: { type: string; id: string; word: string }[];
  sentences: QuizSentence[];
  score?: number;
  total?: number;
  created_at: string;
  is_active: boolean;
}

export interface QuizResult {
  session_id: string;
  score: number;
  total: number;
  wrong: { sentence: string; userAnswer: string; correctAnswer: string }[];
}

// ============================================================
// 6. EXPORT UNTUK VERCEl
// ============================================================
export default (req: VercelRequest, res: VercelResponse) => {
  return app(req, res);
};