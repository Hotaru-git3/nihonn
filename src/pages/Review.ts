import { fetchRandomReview, fetchReviewNotMastered, submitRating } from '../services/api';
import { ReviewItem } from '../types';

let cards: ReviewItem[] = [];
let currentIndex = 0;
let isFlipped = false;
let reviewMode: 'random' | 'not-mastered' = 'random';

function getSavedSession(): { cards: ReviewItem[]; currentIndex: number; mode: string } | null {
  try {
    const saved = sessionStorage.getItem('review_session');
    if (!saved) return null;
    const session = JSON.parse(saved);
    if (!session.cards || session.currentIndex >= session.cards.length) {
      sessionStorage.removeItem('review_session');
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem('review_session');
    return null;
  }
}

function saveSession() {
  try {
    sessionStorage.setItem('review_session', JSON.stringify({
      cards,
      currentIndex,
      mode: reviewMode
    }));
  } catch {
    // Session storage penuh, abaikan
  }
}

function clearSession() {
  sessionStorage.removeItem('review_session');
}

export async function renderReview(container: HTMLElement, mode?: 'random' | 'not-mastered') {
  if (!mode) {
    const savedSession = getSavedSession();
    const remainingCards = savedSession ? savedSession.cards.length - savedSession.currentIndex : 0;

    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in">
        <div class="text-center">
          <span class="text-6xl mb-4 block">📚</span>
          <h2 class="font-headline-lg text-on-surface mb-2">Pilih Mode Review</h2>
          <p class="font-body-md text-on-surface-variant">Mau review seperti apa hari ini?</p>
        </div>
        
        <div class="flex flex-col gap-4 w-full max-w-sm">
          <button id="btn-random-review" class="w-full bg-primary text-on-primary py-6 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-3xl">shuffle</span>
            <span>Mulai Review Acak Baru</span>
            <span class="text-sm font-normal opacity-80">Semua kartu di-acak dari awal</span>
          </button>

          ${savedSession ? `
            <button id="btn-continue-review" class="w-full bg-surface-container-high text-on-surface py-6 rounded-2xl font-bold text-lg hover:bg-surface-container-highest transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex flex-col items-center gap-2">
              <span class="material-symbols-outlined text-3xl">play_arrow</span>
              <span>Lanjutkan Review</span>
              <span class="text-sm font-normal opacity-80">${remainingCards} dari ${savedSession.cards.length} kartu tersisa</span>
            </button>
          ` : ''}
          
          <button id="btn-not-mastered-review" class="w-full bg-secondary-container text-on-secondary-container py-6 rounded-2xl font-bold text-lg hover:bg-secondary-container/80 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-3xl">school</span>
            <span>Review Belum Hafal</span>
            <span class="text-sm font-normal opacity-80">Kartu yang belum dikuasai</span>
          </button>
        </div>
        
        <a href="/dashboard" class="text-on-surface-variant hover:text-primary transition-colors text-sm">Kembali ke Dashboard</a>
      </div>
    `;

    document.getElementById('btn-random-review')?.addEventListener('click', () => {
      clearSession();
      renderReview(container, 'random');
    });
    document.getElementById('btn-continue-review')?.addEventListener('click', () => {
      const session = getSavedSession();
      if (!session) return;
      cards = session.cards;
      currentIndex = session.currentIndex;
      reviewMode = 'random';
      isFlipped = false;
      renderCurrentCard(container);
    });
    document.getElementById('btn-not-mastered-review')?.addEventListener('click', () => {
      clearSession();
      renderReview(container, 'not-mastered');
    });
    return;
  }

  reviewMode = mode;
  clearSession();

  container.innerHTML = `
    <div class="flex items-center justify-center h-full">
      <div class="animate-pulse text-primary"><span class="material-symbols-outlined text-4xl">hourglass_empty</span></div>
    </div>
  `;

  try {
    if (reviewMode === 'random') {
      cards = await fetchRandomReview();
    } else {
      cards = await fetchReviewNotMastered();
    }
    currentIndex = 0;
    isFlipped = false;
    
    if (cards.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center space-y-4">
          <span class="text-6xl">${reviewMode === 'random' ? '📚' : '🎉'}</span>
          <h2 class="font-headline-lg text-on-surface">${reviewMode === 'random' ? 'Belum ada kartu tersimpan!' : 'Semua kartu sudah dikuasai!'}</h2>
          <p class="font-body-md text-on-surface-variant">${reviewMode === 'random' ? 'Tambahkan item dulu dari Library atau AI Analyzer.' : 'Kamu hebat! Semua kartu sudah di rating Sangat Mudah.'}</p>
          <div class="flex gap-4 mt-4">
            <a href="/dashboard" class="px-6 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors">Dashboard</a>
            <button id="btn-back-mode" class="px-6 py-2 bg-primary text-on-primary rounded-lg shadow hover:bg-primary/90 transition-colors">Pilih Mode Lain</button>
          </div>
        </div>
      `;
      document.getElementById('btn-back-mode')?.addEventListener('click', () => renderReview(container));
      return;
    }
    
    renderCurrentCard(container);
    
  } catch (error) {
    container.innerHTML = `
      <div class="p-4 bg-error-container text-on-error-container rounded-lg">
        Gagal memuat review: ${(error as Error).message}
      </div>
    `;
  }
}

function renderCurrentCard(container: HTMLElement) {
  if (currentIndex >= cards.length) {
    clearSession();
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center space-y-4 fade-in-slide-up">
        <span class="text-6xl">🎊</span>
        <h2 class="font-headline-lg text-on-surface">Review Selesai!</h2>
        <p class="font-body-md text-on-surface-variant">Kerja bagus menyelesaikan sesi ini.</p>
        <div class="flex gap-4 mt-4">
          <a href="/dashboard" class="px-6 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors">Dashboard</a>
          <button id="btn-back-mode-end" class="px-6 py-2 bg-primary text-on-primary rounded-lg shadow hover:bg-primary/90 transition-colors">Pilih Mode Lain</button>
        </div>
      </div>
    `;
    document.getElementById('btn-back-mode-end')?.addEventListener('click', () => renderReview(container));
    return;
  }

  const card = cards[currentIndex];
  const progress = Math.round((currentIndex / cards.length) * 100);
  
  let itemInfo = '';
  if (card.item_type === 'vocabulary') itemInfo = 'Kosakata';
  if (card.item_type === 'kanji') itemInfo = 'Kanji';
  if (card.item_type === 'grammar') itemInfo = 'Tata Bahasa';

  container.innerHTML = `
    <header class="w-full px-main_padding pt-10 pb-6 flex flex-col items-center justify-center">
      <div class="w-full max-w-2xl text-center">
        <p class="font-label-sm text-label-sm text-on-surface-variant mb-3 tracking-widest uppercase">Sesi Review - ${reviewMode === 'random' ? 'Acak' : 'Belum Hafal'}</p>
        <div class="flex justify-between items-end mb-2">
          <h2 class="font-headline-md text-headline-md text-on-surface font-semibold">Kartu ${currentIndex + 1} dari ${cards.length}</h2>
          <span class="font-label-sm text-label-sm text-brand-c7756b font-semibold">${progress}%</span>
        </div>
        <div class="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
          <div class="h-full bg-brand-c7756b rounded-full transition-all duration-500 ease-out" style="width: ${progress}%;"></div>
        </div>
      </div>
    </header>

    <section class="flex-1 flex flex-col items-center justify-start px-4 sm:px-main_padding pt-4 pb-12 relative w-full">
      <div class="w-full max-w-[420px] aspect-[4/5] sm:aspect-[420/300] perspective-1000 cursor-pointer group" id="flashcard-container">
        <div class="flashcard-inner transform-style-3d shadow-ambient rounded-flashcard bg-white border border-outline-variant/30" id="flashcard-inner">
          
          <div class="flashcard-front backface-hidden flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-flashcard h-full w-full absolute top-0 left-0 overflow-y-auto">
            <div class="text-center space-y-2 w-full flex flex-col items-center justify-center m-auto">
              <h3 class="font-display-jp text-on-surface font-bold leading-tight break-words w-full text-balance ${card.front.length > 8 ? 'text-2xl sm:text-[28px]' : 'text-3xl sm:text-[48px]'}">${card.front}</h3>
            </div>
          </div>
          
          <div class="flashcard-back backface-hidden rotate-y-180 flex flex-col items-center justify-start p-4 sm:p-6 bg-white rounded-flashcard h-full w-full absolute top-0 left-0 border border-outline-variant/30 overflow-y-auto" style="max-height: 60vh; -webkit-overflow-scrolling: touch;">
  <div class="w-full flex flex-col items-center space-y-3 py-2">
    
    <div class="text-center w-full flex flex-col items-center justify-center">
      ${card.reading ? `<span class="block font-japanese-text text-sm sm:text-base text-on-surface-variant tracking-wider opacity-80 break-words w-full text-balance mb-2">${card.reading}</span>` : ''}
      <h3 class="font-headline-lg text-lg sm:text-[24px] text-on-surface font-bold leading-tight break-words text-balance mb-2">${card.back}</h3>
      <div class="inline-block px-3 py-1 rounded-md bg-surface-container-low border border-outline-variant/30 font-label-sm text-xs text-on-surface-variant">
          ${itemInfo}
      </div>
    </div>
              
              ${(card.example_sentence || card.example || card.example_words) ? `
    <div class="w-full pt-3 border-t border-outline-variant/30 text-center space-y-2">
      ${card.example_sentence ? `<div class="w-full"><p class="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Contoh Kalimat</p><p class="font-japanese-text text-xs sm:text-sm text-on-surface leading-snug break-words">${card.example_sentence}</p></div>` : ''}
      ${card.example ? `<div class="w-full"><p class="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">${card.item_type === 'kanji' ? 'Mnemonic / Info' : 'Contoh Tambahan'}</p><p class="font-japanese-text text-xs sm:text-sm text-on-surface leading-snug">${card.example}</p></div>` : ''}
      ${card.example_words ? `<div class="w-full bg-surface-container-low p-2 rounded-lg border border-outline-variant/20"><p class="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Kosakata Terkait</p><p class="font-japanese-text text-xs text-on-surface-variant leading-snug break-words whitespace-pre-wrap">${card.example_words}</p></div>` : ''}
    </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 w-full max-w-[420px]" id="drawing-area">
        <p class="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 text-center">✍️ Latihan Tulis</p>
        <canvas id="kanji-canvas" width="420" height="160" class="w-full bg-surface-container-low rounded-xl border border-outline-variant/30" style="touch-action:none;height:160px;"></canvas>
        <button id="btn-clear-canvas" class="mt-2 text-xs text-on-surface-variant hover:text-error transition-colors w-full py-1">Hapus</button>
      </div>

      <div class="mt-4 sm:mt-6 transition-opacity duration-300 w-full max-w-[420px] flex justify-center px-4 sm:px-0" id="pre-flip-actions">
        <button id="btn-flip" class="px-8 py-3 rounded-xl border-2 border-brand-c7756b text-brand-c7756b font-label-sm text-sm font-semibold tracking-wider hover:bg-brand-c7756b hover:text-white transition-all duration-300 w-full sm:w-auto shadow-sm hover:shadow-md">
            BALIK KARTU
        </button>
      </div>

      <div class="mt-4 sm:mt-6 hidden w-full max-w-2xl flex-col items-center fade-in-slide-up px-2 sm:px-0" id="post-flip-actions">
        <p class="font-body-md text-sm sm:text-base text-on-surface-variant mb-4 sm:mb-6 text-center">Seberapa baik kamu ingat materi ini?</p>
        <div class="flex gap-3 w-full">
          <button class="rating-btn flex-1 flex flex-col items-center py-4 px-2 rounded-xl border-2 border-error/30 bg-error/5 hover:bg-error/10 hover:border-error group transition-all" data-q="1">
            <span class="text-2xl mb-1">❌</span>
            <span class="font-label-sm text-sm font-semibold text-error">Belum Hafal</span>
          </button>
          <button class="rating-btn flex-1 flex flex-col items-center py-4 px-2 rounded-xl border-2 border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500 group transition-all" data-q="4">
            <span class="text-2xl mb-1">✅</span>
            <span class="font-label-sm text-sm font-semibold text-green-600">Hafal</span>
          </button>
        </div>
      </div>
    </section>
  `;

  document.getElementById('flashcard-container')?.addEventListener('click', flip);
  document.getElementById('btn-flip')?.addEventListener('click', flip);
  
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const q = parseInt((e.currentTarget as HTMLElement).getAttribute('data-q') || '4');
      await handleRating(q, container);
    });
  });

  setTimeout(() => setupCanvas(), 100);
}

function setupCanvas() {
  const canvas = document.getElementById('kanji-canvas') as HTMLCanvasElement;
  if (!canvas || canvas.dataset.initialized) return;
  canvas.dataset.initialized = 'true';
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  ctx.strokeStyle = '#382924';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let isDrawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  }

  function onStart(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    if (pos) { lastX = pos.x; lastY = pos.y; }
  }

  function onMove(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    ctx!.beginPath();
    ctx!.moveTo(lastX, lastY);
    ctx!.lineTo(pos.x, pos.y);
    ctx!.stroke();
    lastX = pos.x; lastY = pos.y;
  }

  function onEnd() { isDrawing = false; }

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);

  canvas.addEventListener('mousedown', onStart);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onEnd);
  canvas.addEventListener('mouseleave', onEnd);

  document.getElementById('btn-clear-canvas')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function flip() {
  if (isFlipped) return;
  const inner = document.getElementById('flashcard-inner');
  const pre = document.getElementById('pre-flip-actions');
  const post = document.getElementById('post-flip-actions');
  
  if (inner && pre && post) {
    inner.classList.add('rotate-y-180');
    pre.style.opacity = '0';
    setTimeout(() => {
      pre.classList.add('hidden');
      post.classList.remove('hidden');
    }, 300);
    isFlipped = true;
  }
}

async function handleRating(quality: number, container: HTMLElement) {
  const card = cards[currentIndex];
  
  try {
    await submitRating(card.log_id, quality);
  } catch (err) {
    console.error('Rating failed', err);
  }
  
  currentIndex++;
  isFlipped = false;
  saveSession();
  
  const cardCont = document.getElementById('flashcard-container');
  if (cardCont) {
    cardCont.style.opacity = '0';
    setTimeout(() => renderCurrentCard(container), 300);
  } else {
    renderCurrentCard(container);
  }
}