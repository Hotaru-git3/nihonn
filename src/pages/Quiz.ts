import { fetchQuizItems, updateQuizCount, saveQuizResult } from '../services/api';

interface QuizQuestion {
  itemId: string;
  type: string;
  target: string;
  context: string;
  prompt: string;
  correctAnswer: string;
  choices: string[];
}

let questions: QuizQuestion[] = [];
let currentQuestion = 0;
let score = 0;
let userAnswers: { sentence: string; userAnswer: string; correctAnswer: string }[] = [];
let itemsUsed: { type: string; id: string; target: string; reading: string; word: string; meaning: string; example_sentence: string }[] = [];
let sessionId: string = "";

function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,。、！？!?\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] || character));
}

function shuffle<T>(values: T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

function buildQuestions(items: typeof itemsUsed): QuizQuestion[] {
  return items
    .filter((item) => item.meaning.trim())
    .map((item) => {
      const sameTypeMeanings = items
        .filter((candidate) => candidate.type === item.type && candidate.id !== item.id && candidate.meaning.trim())
        .map((candidate) => candidate.meaning.trim())
        .filter((meaning, index, meanings) => meanings.indexOf(meaning) === index);
      const otherMeanings = items
        .filter((candidate) => candidate.id !== item.id && candidate.meaning.trim())
        .map((candidate) => candidate.meaning.trim())
        .filter((meaning, index, meanings) => meanings.indexOf(meaning) === index);
      const distractors = sameTypeMeanings.length >= 2 ? sameTypeMeanings : [...sameTypeMeanings, ...otherMeanings];
      const choices = shuffle([item.meaning.trim(), ...shuffle(distractors).slice(0, 3)]);
      const typeLabel = item.type === 'kanji' ? 'kanji' : item.type === 'grammar' ? 'pola tata bahasa' : 'kosakata';

      return {
        itemId: item.id,
        type: item.type,
        target: item.target,
        context: item.example_sentence?.trim() || '',
        prompt: `Apa arti ${typeLabel} ini?`,
        correctAnswer: item.meaning.trim(),
        choices,
      };
    });
}

export async function renderQuiz(container: HTMLElement) {
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full space-y-4">
      <div class="animate-spin text-primary">
        <span class="material-symbols-outlined text-5xl">hourglass_empty</span>
      </div>
      <p class="text-on-surface-variant font-body-md">Menyiapkan soal...</p>
    </div>
  `;

  try {
    const items = await fetchQuizItems();

    if (items.length < 3) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center space-y-4">
          <span class="text-6xl">📚</span>
          <h2 class="font-headline-lg text-on-surface">Item belum cukup!</h2>
          <p class="font-body-md text-on-surface-variant">Minimal 3 item di Library untuk quiz. Yuk tambah dulu!</p>
          <a href="/library" class="px-6 py-2 bg-primary text-on-primary rounded-lg">Tambah Item</a>
        </div>
      `;
      return;
    }

    itemsUsed = items.map((i) => ({
      type: i.type,
      id: i.id,
      target: i.word || i.character || i.pattern,
      reading: i.reading || i.onyomi || i.kunyomi || i.structure || '',
      word: i.word || i.character || i.pattern,
      meaning: i.meaning || '',
      example_sentence: i.example_sentence || '',
    }));

    questions = buildQuestions(itemsUsed);
    if (questions.length < 3) {
      throw new Error("Minimal 3 item harus memiliki arti untuk quiz.");
    }
    
    currentQuestion = 0;
    score = 0;
    userAnswers = [];
    sessionId = `quiz_${Date.now()}`;

    renderQuestion(container);
    
  } catch (error) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center space-y-4">
        <span class="text-6xl">❌</span>
        <h2 class="font-headline-lg text-on-surface">Gagal memuat quiz</h2>
        <p class="font-body-md text-on-surface-variant">${(error as Error).message}</p>
        <button id="btn-retry-quiz" class="px-6 py-2 bg-primary text-on-primary rounded-lg">Coba Lagi</button>
      </div>
    `;
    document.getElementById("btn-retry-quiz")?.addEventListener("click", () => renderQuiz(container));
  }
}

function renderQuestion(container: HTMLElement) {
  if (currentQuestion >= questions.length) {
    renderResult(container);
    return;
  }

  const q = questions[currentQuestion];
  const progress = Math.round((currentQuestion / questions.length) * 100);
  const qNumber = currentQuestion + 1;
  const total = questions.length;
  const choices = q.choices.map((choice, index) => `
    <button class="quiz-choice w-full text-left bg-surface-container-low border border-outline-variant rounded-xl px-5 py-4 text-base hover:border-primary hover:bg-primary/5 transition-all" data-choice-index="${index}">
      <span class="inline-flex items-center justify-center w-7 h-7 rounded-full border border-outline-variant mr-3 text-sm">${String.fromCharCode(65 + index)}</span>
      ${escapeHtml(choice)}
    </button>
  `).join('');

  container.innerHTML = `
    <div class="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div class="space-y-2">
        <div class="flex justify-between items-end">
          <h2 class="font-headline-md text-on-surface">Soal ${qNumber} dari ${total}</h2>
          <span class="font-label-sm text-brand-c7756b font-semibold">${progress}%</span>
        </div>
        <div class="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div class="h-full bg-brand-c7756b rounded-full transition-all duration-500" style="width: ${progress}%"></div>
        </div>
      </div>

      <div class="bg-surface rounded-2xl border border-outline-variant p-8 shadow-lg text-center space-y-6">
        <span class="text-sm text-on-surface-variant uppercase tracking-widest">Pahami konteksnya</span>
        <h1 class="font-japanese-text text-3xl sm:text-4xl font-bold text-on-surface leading-relaxed">${escapeHtml(q.target)}</h1>
        ${q.context ? `<div class="bg-surface-container-low rounded-xl p-4"><p class="text-xs text-on-surface-variant uppercase tracking-wide mb-2">Contoh penggunaan</p><p class="font-japanese-text text-lg text-on-surface">${escapeHtml(q.context)}</p></div>` : ''}
        <p class="text-base font-semibold text-on-surface">${q.prompt}</p>
        <div class="space-y-3 text-left">${choices}</div>
      </div>
    </div>
  `;

  document.querySelectorAll<HTMLButtonElement>('.quiz-choice').forEach((choice) => {
    choice.addEventListener('click', () => {
      const choiceIndex = Number(choice.dataset.choiceIndex);
      checkAnswer(q, q.choices[choiceIndex] || '', container);
    });
  });
}

function checkAnswer(q: QuizQuestion, userAnswer: string, container: HTMLElement) {
  const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(q.correctAnswer);

  if (isCorrect) score += 10;

  userAnswers.push({
    sentence: q.target,
    userAnswer: userAnswer || "(tidak dijawab)",
    correctAnswer: q.correctAnswer,
  });

  container.innerHTML = `
    <div class="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div class="bg-surface rounded-2xl border border-outline-variant p-8 shadow-lg text-center space-y-6">
        <span class="text-5xl">${isCorrect ? "✅" : "❌"}</span>
        <h2 class="font-headline-md ${isCorrect ? "text-green-600" : "text-error"}">${isCorrect ? "BENAR!" : "SALAH"}</h2>
        
        <div class="space-y-3">
          <div class="bg-surface-container-low rounded-xl p-4">
            <p class="font-japanese-text text-xl mb-2">${escapeHtml(q.target)}</p>
            <p class="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Jawaban benar</p>
            <p class="text-on-surface-variant text-sm">${escapeHtml(q.correctAnswer)}</p>
          </div>
          
          ${!isCorrect ? `
            <div class="bg-error/10 rounded-xl p-4 border border-error/20">
              <p class="text-sm text-error mb-1">Jawaban kamu:</p>
              <p class="text-on-surface">${userAnswer || "(tidak dijawab)"}</p>
            </div>
          ` : ""}
          
          <p class="text-sm text-on-surface-variant">+${isCorrect ? "10" : "0"} poin | Score: ${score}</p>
        </div>

        <button id="btn-next" class="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-md">
          LANJUT →
        </button>
      </div>
    </div>
  `;

  document.getElementById("btn-next")?.addEventListener("click", () => {
    currentQuestion++;
    renderQuestion(container);
  });
}

async function renderResult(container: HTMLElement) {
  const total = questions.length;
  const percentage = Math.round((score / (total * 10)) * 100);

  try {
    await updateQuizCount(itemsUsed);
    await saveQuizResult({
      session_id: sessionId,
      score,
      total: total * 10,
      percentage,
      items_used: itemsUsed,
      answers: userAnswers,
    });
  } catch (err) {
    console.error("Failed to save quiz result:", err);
  }

  const emoji = percentage >= 80 ? "🎉" : percentage >= 50 ? "📚" : "💪";
  const message = percentage >= 80 ? "Kamu hebat!" : percentage >= 50 ? "Lumayan!" : "Terus berlatih!";

  container.innerHTML = `
    <div class="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div class="bg-surface rounded-2xl border border-outline-variant p-8 shadow-lg text-center space-y-6">
        <span class="text-6xl">${emoji}</span>
        <h2 class="font-headline-lg text-on-surface">Quiz Selesai!</h2>
        <p class="text-on-surface-variant text-lg">${message}</p>
        
        <div class="bg-surface-container-low rounded-xl p-6">
          <span class="block text-5xl font-bold text-primary">${score}/${total * 10}</span>
          <span class="text-on-surface-variant text-sm mt-1">${percentage}%</span>
        </div>

        ${userAnswers.filter(a => normalizeAnswer(a.userAnswer) !== normalizeAnswer(a.correctAnswer)).length > 0 ? `
          <div class="space-y-3 text-left">
            <h3 class="font-headline-md text-on-surface">Review Jawaban Salah:</h3>
            ${userAnswers.filter(a => normalizeAnswer(a.userAnswer) !== normalizeAnswer(a.correctAnswer)).map((a) => `
              <div class="bg-error/5 rounded-xl p-4 border border-error/10">
                <p class="font-japanese-text font-bold">${a.sentence}</p>
                <p class="text-sm text-error mt-1">Kamu: ${a.userAnswer}</p>
                <p class="text-sm text-green-600">Benar: ${a.correctAnswer}</p>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="flex gap-3">
          <button id="btn-retake" class="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all">Ulang Quiz</button>
          <a href="/dashboard" class="flex-1 bg-surface-container-high text-on-surface py-3 rounded-xl font-bold text-center hover:bg-surface-container-highest transition-all">Dashboard</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-retake")?.addEventListener("click", () => renderQuiz(container));
}