// services/api.ts
import { DashboardStats, ReviewItem, PaginatedResponse, Vocabulary, Kanji, Grammar, AIBreakdownResult } from '../types';
import { db, auth } from '../firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

const BASE = '/api';

const getAuth = () => {
  if (!auth) throw new Error('Firebase auth not initialized');
  return auth;
};

// -- Auth --
export async function loginUser(data: any): Promise<any> {
  const email = data.email;
  try {
    const cred = await signInWithEmailAndPassword(getAuth(), email, data.password);
    const token = await cred.user.getIdToken();
    
    // 🔥 SAVE KE LOCALSTORAGE
    localStorage.setItem('token', token);
    localStorage.setItem('email', email);
    localStorage.setItem('user_display_name', email.split('@')[0]);
    
    return { token, email: data.email };
  } catch (error: any) {
    if (error.code === 'auth/invalid-credential') throw new Error('Email atau password salah.');
    if (error.code === 'auth/too-many-requests') throw new Error('Terlalu banyak percobaan. Coba lagi nanti.');
    throw new Error(error.message || 'Login gagal.');
  }
}

export async function registerUser(data: any): Promise<any> {
  const email = data.email;
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(), email, data.password);
    const token = await cred.user.getIdToken();
    
    // 🔥 SAVE KE LOCALSTORAGE
    localStorage.setItem('token', token);
    localStorage.setItem('email', email);
    localStorage.setItem('user_display_name', email.split('@')[0]);
    
    return { token, email: data.email };
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') throw new Error('Email ini sudah terdaftar.');
    if (error.code === 'auth/weak-password') throw new Error('Password terlalu pendek (minimal 6 karakter).');
    if (error.code === 'auth/invalid-email') throw new Error('Format email tidak valid.');
    if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') throw new Error('Fitur register belum diaktifkan (Email/Password Auth di Firebase).');
    throw new Error(error.message || 'Pendaftaran gagal.');
  }
}

// services/api.ts - bagian logout
export async function logoutUser() {
  await signOut(getAuth());
  localStorage.removeItem('token');
  localStorage.removeItem('email');
  localStorage.removeItem('user_display_name');
  
  // 🔥 Redirect ke login
  window.location.href = '/login';
}

export async function deleteAllUserData(): Promise<void> {
  const userRef = getUserRef();
  const collectionsToClear = ['vocabulary', 'kanji', 'grammar', 'study_log', 'quiz_history'];

  for (const colName of collectionsToClear) {
    const snap = await getDocs(collection(userRef, colName));
    await Promise.all(snap.docs.map(docSnap => deleteDoc(doc(userRef, colName, docSnap.id))));
  }

  localStorage.removeItem('streak');
  localStorage.removeItem('last_login_date');
  const aiKeys = Object.keys(localStorage).filter(k => k.startsWith('ai_count_'));
  aiKeys.forEach(k => localStorage.removeItem(k));
}

export async function deleteUserAccount(password?: string): Promise<void> {
  const currentUser = getAuth().currentUser;
  if (!currentUser || !currentUser.email) throw new Error('Tidak ada user yang aktif');

  if (password) {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
  }

  await deleteAllUserData();
  await deleteUser(currentUser);

  localStorage.removeItem('token');
  localStorage.removeItem('email');
  localStorage.removeItem('user_display_name');
  window.location.href = '/login';
}

// -- Firestore Helpers --
const getUserRef = () => {
  if (!db) throw new Error('Firebase db not initialized');
  if (!auth?.currentUser) throw new Error('Not authenticated');
  return doc(db, 'users', auth.currentUser.uid);
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const userRef = getUserRef();
  
  // Fetch all collections
  const [vocabSnap, kanjiSnap, grammarSnap, logsSnap] = await Promise.all([
    getDocs(collection(userRef, 'vocabulary')),
    getDocs(collection(userRef, 'kanji')),
    getDocs(collection(userRef, 'grammar')),
    getDocs(collection(userRef, 'study_log'))
  ]);
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  let totalVocab = vocabSnap.size;
  let totalKanji = kanjiSnap.size;
  let totalGrammar = grammarSnap.size;
  let dueToday = 0;
  let reviewedToday = 0;
  let addedToday = 0;
  let masteredVocab = 0, masteredKanji = 0, masteredGrammar = 0;
  let aiBreakdownsToday = 0;
  
  // Process study logs
  const recentItems: any[] = [];
  
  logsSnap.forEach(d => {
    const data = d.data();
    
    // Count due today
    if (data.next_review && data.next_review <= todayStr) {
      dueToday++;
    }
    
    // Count reviewed today
    if (data.last_reviewed === todayStr) {
      reviewedToday++;
    }
    
    // Mastered items
    if (data.ease_factor >= 2.5 && data.interval_days > 21) {
      if (data.item_type === 'vocabulary') masteredVocab++;
      if (data.item_type === 'kanji') masteredKanji++;
      if (data.item_type === 'grammar') masteredGrammar++;
    }
    
    // AI breakdowns
    if (data.activity_type === 'ai_breakdown' && data.date === todayStr) {
      aiBreakdownsToday++;
    }
  });
  
  // Count added today
  const countToday = (snap: any) => {
    snap.forEach((d: any) => {
      const created = d.data().created_at;
      if (created && created.startsWith(todayStr)) {
        addedToday++;
      }
      
      // Collect recent items
      if (created) {
        recentItems.push({
          type: d.data().word ? 'vocabulary' : d.data().character ? 'kanji' : 'grammar',
          text: d.data().word || d.data().character || d.data().pattern || '',
          subtext: d.data().meaning || '',
          created_at: created
        });
      }
    });
  };
  
  countToday(vocabSnap);
  countToday(kanjiSnap);
  countToday(grammarSnap);

  const weeklyActivity: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    let count = 0;
    logsSnap.forEach(log => {
      if (log.data().last_reviewed === dateStr) count++;
    });
    weeklyActivity.push({ date: dateStr, count });
  }
  
  // Sort & limit recent
  recentItems.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recentlyAdded = recentItems.slice(0, 5).map(i => ({
    type: i.type,
    text: i.text,
    subtext: i.subtext,
    created_at: i.created_at
  }));
  
  // Update localStorage untuk streak
  const lastLoginDate = localStorage.getItem('last_login_date');
  const streak = parseInt(localStorage.getItem('streak') || '0');
  let newStreak = streak;
  if (lastLoginDate) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (lastLoginDate === yesterdayStr) {
      newStreak = streak + 1;
    } else if (lastLoginDate !== todayStr) {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }
  localStorage.setItem('streak', newStreak.toString());
  localStorage.setItem('last_login_date', todayStr);
  
  return {
    streak: newStreak,
    total_vocab: totalVocab,
    total_kanji: totalKanji,
    total_grammar: totalGrammar,
    due_today: dueToday,
    reviewed_today: reviewedToday,
    added_today: addedToday,
    weekly_activity: weeklyActivity,
    recently_added: recentlyAdded,
    progress: {
      mastered_vocab: masteredVocab,
      mastered_kanji: masteredKanji,
      mastered_grammar: masteredGrammar,
    },
    achievements: {
      early_bird: now.getHours() < 7,
      night_owl: now.getHours() >= 22 || now.getHours() < 3,
      vocab_master: masteredVocab >= 100,
      kanji_master: masteredKanji >= 50,
      grammar_master: masteredGrammar >= 50,
      streak_7: newStreak >= 7,
      streak_30: newStreak >= 30,
      ai_enthusiast: (parseInt(localStorage.getItem(`ai_count_${todayStr}`) || '0')) >= 5,
      n1_hero: masteredVocab >= 500 && masteredKanji >= 200 && masteredGrammar >= 100
    },
    ai_breakdowns_today: parseInt(localStorage.getItem(`ai_count_${todayStr}`) || '0')
  };
}

export async function fetchTodayReview(): Promise<ReviewItem[]> {
  const userRef = getUserRef();
  const logsSnap = await getDocs(collection(userRef, 'study_log'));
  const now = new Date().toISOString().split('T')[0];
  
  const items: ReviewItem[] = [];
  
  for (const logDoc of logsSnap.docs) {
    const logData = logDoc.data();
    // Fix: next_review HARUS <= sekarang
    if (logData.next_review && logData.next_review <= now) {
      const itemSnap = await getDoc(doc(userRef, logData.item_type, logData.item_id));
      if (itemSnap.exists()) {
        const itemData = itemSnap.data();
        if (itemData.archived) continue;
        let front = '', back = '', reading = '', example = '', example_words = '', example_sentence = '';
        
        if (logData.item_type === 'vocabulary') {
          front = itemData.word || '';
          back = itemData.meaning || '';
          reading = itemData.reading || '';
          example_sentence = itemData.example_sentence || '';
        } else if (logData.item_type === 'kanji') {
          front = itemData.character || '';
          back = itemData.meaning || '';
          reading = `${itemData.onyomi || ''} / ${itemData.kunyomi || ''}`;
          example = itemData.mnemonic || '';
          example_words = itemData.example_words || '';
          example_sentence = itemData.example_sentence || '';
        } else if (logData.item_type === 'grammar') {
          front = itemData.pattern || '';
          back = itemData.meaning || '';
          reading = itemData.structure || '';
          example_sentence = itemData.example_sentence || '';
        }
        
        if (front && back) {
          items.push({
            log_id: logDoc.id,
            item_type: logData.item_type as any,
            item_id: logData.item_id,
            ease_factor: logData.ease_factor || 2.5,
            interval_days: logData.interval_days || 0,
            repetitions: logData.repetitions || 0,
            front,
            back,
            reading,
            example,
            example_words,
            example_sentence,
            extra: logData.item_type
          });
        }
      }
    }
  }
  
  return items;
}

export async function fetchRandomReview(): Promise<ReviewItem[]> {
  const userRef = getUserRef();
  const logsSnap = await getDocs(collection(userRef, 'study_log'));
  
  const items: ReviewItem[] = [];
  
  // AMBIL SEMUA KARTU, abaikan next_review
  for (const logDoc of logsSnap.docs) {
    const logData = logDoc.data();
    const itemSnap = await getDoc(doc(userRef, logData.item_type, logData.item_id));
    
    if (itemSnap.exists()) {
      const itemData = itemSnap.data();
      if (itemData.archived) continue;
      let front = '', back = '', reading = '', example = '', example_words = '', example_sentence = '';
      
      if (logData.item_type === 'vocabulary') {
        front = itemData.word || '';
        back = itemData.meaning || '';
        reading = itemData.reading || '';
        example_sentence = itemData.example_sentence || '';
      } else if (logData.item_type === 'kanji') {
        front = itemData.character || '';
        back = itemData.meaning || '';
        reading = `${itemData.onyomi || ''} / ${itemData.kunyomi || ''}`;
        example = itemData.mnemonic || '';
        example_words = itemData.example_words || '';
        example_sentence = itemData.example_sentence || '';
      } else if (logData.item_type === 'grammar') {
        front = itemData.pattern || '';
        back = itemData.meaning || '';
        reading = itemData.structure || '';
        example_sentence = itemData.example_sentence || '';
      }
      
      if (front && back) {
        items.push({
          log_id: logDoc.id,
          item_type: logData.item_type as any,
          item_id: logData.item_id,
          ease_factor: logData.ease_factor || 2.5,
          interval_days: logData.interval_days || 0,
          repetitions: logData.repetitions || 0,
          front,
          back,
          reading,
          example,
          example_words,
          example_sentence,
          extra: logData.item_type
        });
      }
    }
  }
  
  // Acak kartu
  return items.sort(() => Math.random() - 0.5);
}

export async function submitRating(logId: string, quality: number): Promise<void> {
  const userRef = getUserRef();
  const logRef = doc(userRef, 'study_log', logId);
  const logSnap = await getDoc(logRef);
  if (!logSnap.exists()) return;
  
  const data = logSnap.data() ?? {};
  const easeFactor = Number(data.ease_factor ?? 2.5);
  const intervalDays = Number(data.interval_days ?? 0);
  const repetitions = Number(data.repetitions ?? 0);

  let newEase: number, newInterval: number, newReps: number;

  if (quality < 3) {
    newEase = 2.5;
    newInterval = 1;
    newReps = 0;
  } else {
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 3;
    else newInterval = Math.max(1, Math.round(intervalDays * easeFactor));

    newEase = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEase = Math.max(newEase, 1.3);
    newReps = repetitions + 1;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  
  await updateDoc(logRef, {
    ease_factor: newEase,
    interval_days: newInterval,
    repetitions: newReps,
    next_review: nextDate.toISOString().split('T')[0],
    last_reviewed: new Date().toISOString().split('T')[0],
    response_quality: quality
  });
}

// -- Generic CRUD --
async function fetchPaginated<T>(colName: string, page: number, search: string, jlpt: string, archived = false): Promise<PaginatedResponse<T>> {
  const userRef = getUserRef();
  const snap = await getDocs(collection(userRef, colName));
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  items = items.filter(i => Boolean(i.archived) === archived);
  
  if (jlpt) items = items.filter(i => i.jlpt_level === jlpt);
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(i => 
      (i.word && i.word.toLowerCase().includes(s)) || 
      (i.character && i.character.toLowerCase().includes(s)) ||
      (i.pattern && i.pattern.toLowerCase().includes(s)) ||
      (i.meaning && i.meaning.toLowerCase().includes(s))
    );
  }
  
  const limit = 10;
  const total = items.length;
  const start = (page - 1) * limit;
  const paginated = items.slice(start, start + limit);
  
  return {
    data: paginated,
    total,
    page,
    per_page: limit,
    total_pages: Math.ceil(total / limit)
  };
}

// 🔥 Fetch ALL items tanpa pagination (buat export)
async function fetchAll(colName: string, archived?: boolean): Promise<any[]> {
  const userRef = getUserRef();
  const snap = await getDocs(collection(userRef, colName));
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  if (archived !== undefined) {
    items = items.filter(i => Boolean(i.archived) === archived);
  }

  return items;
}

async function createItem(colName: string, data: any) {
  const userRef = getUserRef();
  const docRef = await addDoc(collection(userRef, colName), { ...data, created_at: new Date().toISOString() });
  
  await addDoc(collection(userRef, 'study_log'), {
    item_type: colName,
    item_id: docRef.id,
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    next_review: new Date().toISOString().split('T')[0]
  });
  return { id: docRef.id, ...data };
}

async function updateItem(colName: string, id: string, data: any) {
  const ref = doc(getUserRef(), colName, id);
  await updateDoc(ref, { ...data, updated_at: new Date().toISOString() });
  return { id, ...data };
}

async function deleteItem(colName: string, id: string) {
  const userRef = getUserRef();
  await deleteDoc(doc(userRef, colName, id));
  
  const logsSnap = await getDocs(query(collection(userRef, 'study_log'), where('item_id', '==', id)));
  for (const d of logsSnap.docs) {
    await deleteDoc(d.ref);
  }
}

async function setItemArchived(colName: string, id: string, archived: boolean): Promise<void> {
  const ref = doc(getUserRef(), colName, id);
  await updateDoc(ref, { archived, updated_at: new Date().toISOString() });
}

// -- Vocabulary --
export const fetchVocabulary = (p=1, s='', j='', archived=false) => fetchPaginated<Vocabulary>('vocabulary', p, s, j, archived);
export const fetchAllVocabulary = (archived?: boolean) => fetchAll('vocabulary', archived);
export const createVocabulary = (d: any) => createItem('vocabulary', d);
export const updateVocabulary = (id: any, d: any) => updateItem('vocabulary', id, d);
export const deleteVocabulary = (id: any) => deleteItem('vocabulary', id);
export const archiveVocabulary = (id: string) => setItemArchived('vocabulary', id, true);
export const unarchiveVocabulary = (id: string) => setItemArchived('vocabulary', id, false);

// -- Kanji --
export const fetchKanji = (p=1, s='', j='', archived=false) => fetchPaginated<Kanji>('kanji', p, s, j, archived);
export const fetchAllKanji = (archived?: boolean) => fetchAll('kanji', archived);
export const createKanji = (d: any) => createItem('kanji', d);
export const updateKanji = (id: any, d: any) => updateItem('kanji', id, d);
export const deleteKanji = (id: any) => deleteItem('kanji', id);
export const archiveKanji = (id: string) => setItemArchived('kanji', id, true);
export const unarchiveKanji = (id: string) => setItemArchived('kanji', id, false);

// -- Grammar --
export const fetchGrammar = (p=1, s='', j='', archived=false) => fetchPaginated<Grammar>('grammar', p, s, j, archived);
export const fetchAllGrammar = (archived?: boolean) => fetchAll('grammar', archived);
export const createGrammar = (d: any) => createItem('grammar', d);
export const updateGrammar = (id: any, d: any) => updateItem('grammar', id, d);
export const deleteGrammar = (id: any) => deleteItem('grammar', id);
export const archiveGrammar = (id: string) => setItemArchived('grammar', id, true);
export const unarchiveGrammar = (id: string) => setItemArchived('grammar', id, false);

// -- Quiz --
export async function fetchQuizItems(): Promise<any[]> {
  const userRef = getUserRef();
  const [vocabSnap, kanjiSnap, grammarSnap] = await Promise.all([
    getDocs(collection(userRef, 'vocabulary')),
    getDocs(collection(userRef, 'kanji')),
    getDocs(collection(userRef, 'grammar'))
  ]);

  let items: any[] = [];
  
  const addQuizItems = (snap: any, type: string) => {
    snap.forEach((d: any) => {
      const data = d.data();
      const target = data.word || data.character || data.pattern;
      if (!data.archived && typeof target === 'string' && target.trim()) {
        items.push({ ...data, id: d.id, type, quiz_count: data.quiz_count || 0 });
      }
    });
  };

  addQuizItems(vocabSnap, 'vocabulary');
  addQuizItems(kanjiSnap, 'kanji');
  addQuizItems(grammarSnap, 'grammar');

  // Sort: quiz_count rendah dulu (item baru), lalu created_at terbaru
  items.sort((a, b) => {
    if (a.quiz_count !== b.quiz_count) return a.quiz_count - b.quiz_count;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return items.slice(0, 10);
}

export async function updateQuizCount(items: { type: string; id: string }[]): Promise<void> {
  const userRef = getUserRef();
  for (const item of items) {
    const ref = doc(userRef, item.type, item.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const current = snap.data().quiz_count || 0;
      await updateDoc(ref, { quiz_count: current + 1 });
    }
  }
}

export async function saveQuizResult(result: any): Promise<void> {
  const userRef = getUserRef();
  await addDoc(collection(userRef, 'quiz_history'), {
    ...result,
    created_at: new Date().toISOString()
  });
}

// -- AI --
export async function analyzeText(text: string): Promise<AIBreakdownResult> {
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : '';
  const res = await fetch(`${BASE}/ai/breakdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('AI request failed');
  return res.json();
}

export async function saveFromAI(item: any, type: string): Promise<void> {
  await createItem(type, item);
}