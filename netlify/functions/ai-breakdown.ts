import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

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
- Contoh: "待って" adalah SATU KATA UTUH (bentuk te dari kata kerja "待つ"). JANGAN memecahnya menjadi "待" + "って".
- Jika sebuah kata kerja berubah bentuk, kembalikan ke bentuk kamusnya (dictionary form) untuk field "word", tapi tuliskan bentuk aslinya di "reading".

**ATURAN ANGKA DAN HITUNGAN:**
- JANGAN memisahkan angka (seperti 2, 3, 10) dari kata hitungannya. Contoh: "2人" adalah SATU KOSAKATA (futari / dua orang). JANGAN memecahnya menjadi "2" + "人".
- Kata benda yang mengandung angka (seperti 二人, 三人, 一人) harus dianggap SATU KOSAKATA UTUH.

**ATURAN ROMAJI (CARA BACA):**
- Hati-hati dengan bacaan khusus (Jukujikun). Misalnya, "大人" dibaca "otona", BUKAN "odaikata". "時" dibaca "toki", BUKAN "ji".
- Gunakan sistem romaji standar (Hepburn). Pastikan tulisan romaji tidak mengandung typo atau karakter aneh.

**ATURAN STRUKTUR TERJEMAHAN UTUH (SANGAT PENTING):**
- Analisis dulu struktur kalimatnya. JANGAN sampai "keterangan waktu" (seperti 〜になって, 〜の時) diterjemahkan sebagai "subjek kalimat".
- Tentukan mana Subjek, Predikat, Objek, dan Keterangan. Terjemahkan ke dalam Bahasa Indonesia yang wajar dan mengalir.
- Contoh JANGAN SALAH: "大人になって思い出すのは" JANGAN diterjemahkan menjadi "Yang membuatku mengingat adalah orang dewasa". 
- Contoh BENAR: "Hal yang aku ingat setelah menjadi dewasa adalah..." (karena 大人になって adalah keterangan waktu, bukan subjek).

**ATURAN PENGISIAN PART OF SPEECH & LEVEL:**
- Saat mengisi "part_of_speech", gunakan istilah baku bahasa Indonesia: "kata benda", "kata kerja", "kata sifat", "kata keterangan", "partikel", atau "konjungsi".
- Saat mengisi "jlpt_level", isi dengan "N5", "N4", "N3", "N2", "N1", atau "N/A" jika tidak yakin. Jangan mengarang level selain itu.

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
      {
        name: 'meta/llama-3.1-8b-instruct',
        apiKey: process.env.NVIDIA_API_KEY || '',
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
      {
        name: 'meta/llama-3.3-70b-instruct',
        apiKey: process.env.NVIDIA_API_KEY_LLAMA || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
      {
        name: 'deepseek-ai/deepseek-v4-flash',
        apiKey: process.env.NVIDIA_API_KEY_DEEPSEEK || '',
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      },
    ].filter((m): m is ModelConfig => !!m.apiKey);
  }

  async generateBreakdown(text: string): Promise<any> {
    let lastError: any = null;

    for (const modelConfig of this.models) {
      try {
        console.log(`🤖 Mencoba model: ${modelConfig.name}`);

        const openai = new OpenAI({
          baseURL: 'https://integrate.api.nvidia.com/v1',
          apiKey: modelConfig.apiKey,
          timeout: 20000,
        });

        const response: any = await openai.chat.completions.create({
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

        if (resultText.startsWith('```')) {
          resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
        }

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
      }
    }

    console.error('❌ SEMUA MODEL GAGAL');
    throw lastError || new Error('All models failed');
  }
}

const aiService = new AIService();

export const handler = async (event: any, context: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid input type.' }),
      };
    }

    const sanitizedText = text.trim();
    if (sanitizedText.length === 0 || sanitizedText.length > 500) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Text must be between 1 and 500 characters.' }),
      };
    }

    const parsed = await aiService.generateBreakdown(sanitizedText);

    if (parsed.kanji && Array.isArray(parsed.kanji)) {
      parsed.kanji = parsed.kanji.map((k: any) => {
        if (k.example_sentence && k.example_sentence.length > 50) {
          k.example_sentence = k.example_sentence.substring(0, 50) + '...';
        }
        return k;
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed),
    };

  } catch (err: any) {
    console.error('AI Function Error:', err.message || err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'An error occurred while processing the request.', detail: err.message }),
    };
  }
};
