import { fetchVocabulary, fetchKanji, fetchGrammar, fetchAllVocabulary, fetchAllKanji, fetchAllGrammar, createVocabulary, createKanji, createGrammar, deleteVocabulary, deleteKanji, deleteGrammar, archiveVocabulary, archiveKanji, archiveGrammar, unarchiveVocabulary, unarchiveKanji, unarchiveGrammar, bulkArchiveItems, bulkDeleteItems, bulkUnarchiveItems, updateVocabulary, updateKanji, updateGrammar } from '../services/api';
import { showToast } from '../components/Toast';
import { openModal, closeModal } from '../components/Modal';

let currentTab = 'Semua';
let currentPage = 1;
let currentSearch = '';
let currentJlpt = '';
let searchTimeout: any;
let multiSelectMode = false;
let selectedItems: { type: string; id: string }[] = [];
let currentLibraryItems: any[] = [];
let currentLibraryTotal = 0;
let currentArchivedView = false;

export async function renderLibrary(container: HTMLElement, archived = false) {
  currentArchivedView = archived;
  container.innerHTML = `
    <header class="mb-stack_lg">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 class="text-3xl font-display font-bold text-on-surface">${archived ? 'Arsip' : 'Library'}</h1>
        <a href="${archived ? '/library' : '/library/archive'}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
          <span class="material-symbols-outlined text-[20px]">${archived ? 'library_books' : 'archive'}</span>
          ${archived ? 'Kembali ke Library' : 'Lihat Arsip'}
        </a>
      </div>
      ${archived ? '<p class="text-on-surface-variant font-body-md mb-4">Item di sini tidak akan muncul dalam sesi review.</p>' : ''}
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex border-b border-outline-variant gap-6 overflow-x-auto" id="lib-tabs">
          ${['Semua', 'Kosakata', 'Kanji', 'Tata Bahasa'].map(tab => `
            <button class="lib-tab pb-3 px-2 font-body-md ${tab === currentTab ? 'font-semibold text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary transition-colors'}" data-tab="${tab}">${tab}</button>
          `).join('')}
        </div>
        <div class="flex items-center gap-2">
          <button id="toggle-multi-select" type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
            <span class="material-symbols-outlined text-[20px]">check_box_outline_blank</span>
            Multi-select
          </button>
          ${archived ? '' : `<button id="toggle-archive-all-grammar" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">Arsipkan semua</button>`}
        </div>
      </div>
    </header>

    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <div class="flex flex-1 gap-4 w-full md:w-auto">
        <div class="relative flex-1 max-w-md">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input id="search-input" value="${currentSearch}" class="w-full pl-10 pr-4 py-2 bg-surface border border-outline-variant rounded-[20px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-body-md text-on-background" placeholder="Cari..." type="text"/>
        </div>
        <div class="relative">
          <select id="jlpt-filter" class="appearance-none bg-surface border border-outline-variant rounded-lg px-4 py-2 pr-10 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-body-md text-on-background cursor-pointer">
            <option value="">Semua JLPT</option>
            ${['N5','N4','N3','N2','N1'].map(n => `<option value="${n}" ${n === currentJlpt ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">arrow_drop_down</span>
        </div>
      </div>
      <button id="btn-add" class="${archived ? 'hidden' : ''} w-full md:w-auto bg-primary text-on-primary px-6 py-2 rounded-lg font-body-md font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[20px]">add</span>
        Tambah Manual
      </button>
    </div>

    <div class="bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden" id="table-container">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container border-b border-outline-variant">
              <th class="p-4"><div class="h-4 w-24 skeleton-box"></div></th>
              <th class="p-4"><div class="h-4 w-24 skeleton-box"></div></th>
              <th class="p-4 w-24"><div class="h-4 w-12 skeleton-box"></div></th>
              <th class="p-4 w-32"><div class="h-4 w-20 skeleton-box"></div></th>
              <th class="p-4 w-24"><div class="h-4 w-12 skeleton-box mx-auto"></div></th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: 5 }).map((_, idx) => `
              <tr class="${idx % 2 === 0 ? '' : 'bg-surface-container-low'} border-b border-outline-variant/50">
                <td class="p-4"><div class="h-6 w-32 skeleton-box"></div></td>
                <td class="p-4">
                  <div class="h-4 w-24 skeleton-box mb-2"></div>
                  <div class="h-4 w-48 skeleton-box"></div>
                </td>
                <td class="p-4"><div class="h-6 w-12 skeleton-box"></div></td>
                <td class="p-4"><div class="h-4 w-20 skeleton-box"></div></td>
                <td class="p-4"><div class="h-8 w-8 skeleton-box rounded-full mx-auto"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-outline-variant flex justify-between items-center bg-surface-container-low">
        <div class="h-4 w-32 skeleton-box"></div>
        <div class="flex gap-2">
          <div class="h-8 w-16 skeleton-box rounded"></div>
          <div class="h-8 w-8 skeleton-box rounded"></div>
          <div class="h-8 w-16 skeleton-box rounded"></div>
        </div>
      </div>
    </div>
  `;

  attachEvents(container);
  updateMultiSelectButton();
  await loadData(archived);
}

function attachEvents(container: HTMLElement) {
  container.querySelectorAll('.lib-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      currentTab = (e.target as HTMLElement).getAttribute('data-tab') || 'Semua';
      currentPage = 1;
      renderLibrary(container, window.location.pathname === '/library/archive');
    });
  });

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = (e.target as HTMLInputElement).value;
      currentPage = 1;
      loadData();
    }, 300);
  });

  document.getElementById('jlpt-filter')?.addEventListener('change', (e) => {
    currentJlpt = (e.target as HTMLSelectElement).value;
    currentPage = 1;
    loadData();
  });

  document.getElementById('btn-add')?.addEventListener('click', () => {
    openAddModal();
  });

  document.getElementById('toggle-multi-select')?.addEventListener('click', () => {
    toggleMultiSelect();
  });

  document.getElementById('toggle-archive-all-grammar')?.addEventListener('click', () => {
    (window as any).toggleArchiveAll();
  });
}

async function loadData(archived = window.location.pathname === '/library/archive') {
  const tableCont = document.getElementById('table-container');
  if (!tableCont) return;

  // Show skeleton loading state
  tableCont.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-container border-b border-outline-variant">
            <th class="p-4"><div class="h-4 w-24 skeleton-box"></div></th>
            <th class="p-4"><div class="h-4 w-24 skeleton-box"></div></th>
            <th class="p-4 w-24"><div class="h-4 w-12 skeleton-box"></div></th>
            <th class="p-4 w-32"><div class="h-4 w-20 skeleton-box"></div></th>
            <th class="p-4 w-24"><div class="h-4 w-12 skeleton-box mx-auto"></div></th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: 5 }).map((_, idx) => `
            <tr class="${idx % 2 === 0 ? '' : 'bg-surface-container-low'} border-b border-outline-variant/50">
              <td class="p-4"><div class="h-6 w-32 skeleton-box"></div></td>
              <td class="p-4">
                <div class="h-4 w-24 skeleton-box mb-2"></div>
                <div class="h-4 w-48 skeleton-box"></div>
              </td>
              <td class="p-4"><div class="h-6 w-12 skeleton-box"></div></td>
              <td class="p-4"><div class="h-4 w-20 skeleton-box"></div></td>
              <td class="p-4"><div class="h-8 w-8 skeleton-box rounded-full mx-auto"></div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="p-4 border-t border-outline-variant flex justify-between items-center bg-surface-container-low">
      <div class="h-4 w-32 skeleton-box"></div>
      <div class="flex gap-2">
        <div class="h-8 w-16 skeleton-box rounded"></div>
        <div class="h-8 w-8 skeleton-box rounded"></div>
        <div class="h-8 w-16 skeleton-box rounded"></div>
      </div>
    </div>
  `;

  try {
    let items: any[] = [];
    let total = 0;
    
    if (currentTab === 'Kosakata' || currentTab === 'Semua') {
      const res = await fetchVocabulary(currentPage, currentSearch, currentJlpt, archived);
      items = items.concat(res.data.map((d: any) => ({...d, type: 'vocabulary'})));
      total += res.total;
    }
    if (currentTab === 'Kanji' || currentTab === 'Semua') {
      const res = await fetchKanji(currentPage, currentSearch, currentJlpt, archived);
      items = items.concat(res.data.map((d: any) => ({...d, type: 'kanji'})));
      total += res.total;
    }
    if (currentTab === 'Tata Bahasa' || currentTab === 'Semua') {
      const res = await fetchGrammar(currentPage, currentSearch, currentJlpt, archived);
      items = items.concat(res.data.map((d: any) => ({...d, type: 'grammar'})));
      total += res.total;
    }

    if (currentTab === 'Semua') {
      // Sort mixed by date
      items.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
      items = items.slice(0, 10); // simple limit for mixed
    }

    currentLibraryItems = items;
    currentLibraryTotal = total;
    currentArchivedView = archived;
    renderTable(items, total, archived);
    updateMultiSelectButton();
    await updateArchiveAllButton(archived);
  } catch (err) {
    tableCont.innerHTML = `<div class="p-4 text-error">Failed to load data</div>`;
  }
}

async function updateArchiveAllButton(archived = window.location.pathname === '/library/archive') {
  const button = document.getElementById('toggle-archive-all-grammar') as HTMLButtonElement | null;
  if (!button) return;
  if (archived) {
    button.classList.add('hidden');
    return;
  }

  try {
    const [unarchivedVocabulary, archivedVocabulary] = await Promise.all([fetchAllVocabulary(false), fetchAllVocabulary(true)]);
    const [unarchivedKanji, archivedKanji] = await Promise.all([fetchAllKanji(false), fetchAllKanji(true)]);
    const [unarchivedGrammar, archivedGrammar] = await Promise.all([fetchAllGrammar(false), fetchAllGrammar(true)]);

    const totalItems = unarchivedVocabulary.length + archivedVocabulary.length + unarchivedKanji.length + archivedKanji.length + unarchivedGrammar.length + archivedGrammar.length;
    const allArchived = totalItems > 0 && unarchivedVocabulary.length === 0 && unarchivedKanji.length === 0 && unarchivedGrammar.length === 0;

    if (!totalItems) {
      button.classList.add('hidden');
      return;
    }

    button.classList.remove('hidden');
    button.textContent = allArchived ? 'Unarsip semua' : 'Arsipkan semua';
    button.title = allArchived ? 'Keluarkan semua item dari arsip' : 'Arsipkan semua item';
    button.dataset.action = allArchived ? 'unarchive' : 'archive';
  } catch (err) {
    button.classList.add('hidden');
  }
}

function updateMultiSelectButton() {
  const button = document.getElementById('toggle-multi-select') as HTMLButtonElement | null;
  if (!button) return;

  button.classList.remove('hidden');
  button.innerHTML = `
    <span class="material-symbols-outlined text-[20px]">${multiSelectMode ? 'close' : 'check_box_outline_blank'}</span>
    ${multiSelectMode ? 'Keluar multi-select' : 'Multi-select'}
  `;
}

function getSelectionKey(type: string, id: string) {
  return `${type}:${id}`;
}

function isItemSelected(type: string, id: string) {
  return selectedItems.some(item => item.type === type && item.id === id);
}

function toggleMultiSelect() {
  multiSelectMode = !multiSelectMode;
  if (!multiSelectMode) {
    selectedItems = [];
  }
  updateMultiSelectButton();
  renderTable(currentLibraryItems, currentLibraryTotal, currentArchivedView);
}

function toggleItemSelection(type: string, id: string) {
  const key = getSelectionKey(type, id);
  const existing = selectedItems.some(item => getSelectionKey(item.type, item.id) === key);
  if (existing) {
    selectedItems = selectedItems.filter(item => getSelectionKey(item.type, item.id) !== key);
  } else {
    selectedItems = [...selectedItems, { type, id }];
  }
  renderTable(currentLibraryItems, currentLibraryTotal, currentArchivedView);
}

function selectAllVisible() {
  if (!currentLibraryItems.length) return;

  const allVisibleSelected = currentLibraryItems.every(item => isItemSelected(item.type, item.id));
  if (allVisibleSelected) {
    selectedItems = selectedItems.filter(selected => !currentLibraryItems.some(item => item.type === selected.type && item.id === selected.id));
  } else {
    const newlySelected = currentLibraryItems
      .filter(item => !isItemSelected(item.type, item.id))
      .map(item => ({ type: item.type, id: item.id }));
    selectedItems = [...selectedItems, ...newlySelected];
  }

  renderTable(currentLibraryItems, currentLibraryTotal, currentArchivedView);
}

function cancelMultiSelect() {
  multiSelectMode = false;
  selectedItems = [];
  updateMultiSelectButton();
  renderTable(currentLibraryItems, currentLibraryTotal, currentArchivedView);
}

function bindBulkSelectionHandlers(container: HTMLElement) {
  const selectAllCheckbox = container.querySelector('#bulk-select-all') as HTMLInputElement | null;
  selectAllCheckbox?.addEventListener('change', () => {
    selectAllVisible();
  });

  container.querySelectorAll('.bulk-item-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      toggleItemSelection(target.dataset.type || '', target.dataset.id || '');
    });
  });
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function enterEditMode(type: string, id: string) {
  const item = currentLibraryItems.find(item => item.id === id && item.type === type);
  if (!item) return;

  const frontKey = type === 'vocabulary' ? 'word' : type === 'kanji' ? 'character' : 'pattern';
  const frontLabel = type === 'vocabulary' ? 'Kata' : type === 'kanji' ? 'Kanji' : 'Pola';
  const readingLabel = type === 'vocabulary' ? 'Cara Baca' : type === 'kanji' ? 'Onyomi / Kunyomi' : 'Struktur';
  const frontValue = item[frontKey] || '';
  const readingValue = item.reading || (item.onyomi ? `${item.onyomi} / ${item.kunyomi}` : item.structure) || '';
  const meaningValue = item.meaning || '';
  const exampleValue = item.example_sentence || item.example_words || item.example || '';
  const levelValue = item.jlpt_level || 'N5';

  const content = `
    <div class="space-y-4">
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">${frontLabel}</label>
        <input id="edit-front" type="text" value="${escapeHtml(frontValue)}" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all"/>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block font-label-sm text-on-surface-variant mb-1">${readingLabel}</label>
          <input id="edit-reading" type="text" value="${escapeHtml(readingValue)}" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all"/>
        </div>
        <div>
          <label class="block font-label-sm text-on-surface-variant mb-1">Level JLPT</label>
          <select id="edit-level" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-body-md text-on-background transition-all cursor-pointer">
            ${['N5','N4','N3','N2','N1'].map(n => `<option value="${n}" ${levelValue === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Arti</label>
        <input id="edit-meaning" type="text" value="${escapeHtml(meaningValue)}" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-body-md text-on-background transition-all"/>
      </div>
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Contoh Kalimat / Kosakata Terkait (Opsional)</label>
        <textarea id="edit-example" rows="2" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all">${escapeHtml(exampleValue)}</textarea>
      </div>
      <div class="flex justify-end gap-3 pt-4 border-t border-outline-variant">
        <button onclick="window.cancelEdit()" class="px-5 py-2 rounded-lg font-body-md font-semibold text-primary hover:bg-primary/10 transition-colors">Batal</button>
        <button onclick="window.saveEdit('${type}', '${id}')" class="bg-primary text-on-primary px-5 py-2 rounded-lg font-body-md font-semibold hover:bg-primary/90 transition-colors shadow-sm">Simpan</button>
      </div>
    </div>
  `;

  openModal('Edit Item', content);
}

function exitEditMode() {
}

async function saveEdit(type: string, id: string) {
  const frontInput = document.getElementById('edit-front') as HTMLInputElement | null;
  const readingInput = document.getElementById('edit-reading') as HTMLInputElement | null;
  const meaningInput = document.getElementById('edit-meaning') as HTMLInputElement | null;
  const exampleInput = document.getElementById('edit-example') as HTMLTextAreaElement | null;
  const levelInput = document.getElementById('edit-level') as HTMLSelectElement | null;

  const front = frontInput?.value.trim() || '';
  const reading = readingInput?.value.trim() || '';
  const meaning = meaningInput?.value.trim() || '';
  const example = exampleInput?.value.trim() || '';
  const level = levelInput?.value || '';

  if (!front) {
    showToast('Front tidak boleh kosong', 'error');
    return;
  }

  if (!meaning) {
    showToast('Meaning tidak boleh kosong', 'error');
    return;
  }

  if (!['N5', 'N4', 'N3', 'N2', 'N1'].includes(level)) {
    showToast('Level harus dipilih', 'error');
    return;
  }

  try {
    const payload = {
      ...(type === 'vocabulary' ? { word: front, reading, meaning, jlpt_level: level, example_sentence: example } : {}),
      ...(type === 'kanji' ? { character: front, onyomi: reading, meaning, jlpt_level: level, example_words: example } : {}),
      ...(type === 'grammar' ? { pattern: front, structure: reading, meaning, jlpt_level: level, example_sentence: example } : {})
    };

    if (type === 'vocabulary') await updateVocabulary(id, payload);
    if (type === 'kanji') await updateKanji(id, payload);
    if (type === 'grammar') await updateGrammar(id, payload);

    closeModal();
    exitEditMode();
    showToast('Item berhasil diperbarui', 'success');
    await loadData(currentArchivedView);
  } catch (err) {
    showToast('Gagal memperbarui item', 'error');
  }
}

function cancelEdit() {
  closeModal();
  exitEditMode();
}

function renderTable(items: any[], total: number, archived = window.location.pathname === '/library/archive') {
  const tableCont = document.getElementById('table-container');
  if (!tableCont) return;

  if (items.length === 0) {
    tableCont.innerHTML = `<div class="p-8 text-center text-on-surface-variant font-body-md">Tidak ada data.</div>`;
    return;
  }

  const showCheckboxes = multiSelectMode;
  const allVisibleSelected = items.length > 0 && items.every(item => isItemSelected(item.type, item.id));

  const rowsHtml = items.map((item, idx) => {
    const isEven = idx % 2 === 0;
    const bgClass = isEven ? '' : 'bg-surface-container-low';
    const isSelected = isItemSelected(item.type, item.id);

    let front = item.word || item.character || item.pattern || '-';
    let reading = item.reading || (item.onyomi ? `${item.onyomi} / ${item.kunyomi}` : item.structure) || '-';
    let jlptClass = 'bg-primary/10 text-primary border-primary/20'; // default N5
    if(item.jlpt_level === 'N4') jlptClass = 'bg-secondary-container text-on-secondary-container border-secondary/20';
    if(item.jlpt_level === 'N3') jlptClass = 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20';

    return `
      <tr class="${bgClass} ${isSelected ? 'bg-primary/5' : ''} border-b border-outline-variant/50 hover:bg-primary/5 transition-colors group">
        ${showCheckboxes ? `<td class="p-4 w-12"><input type="checkbox" class="bulk-item-checkbox h-5 w-5 rounded border-outline-variant text-primary focus:ring-primary" data-type="${item.type}" data-id="${item.id}" ${isSelected ? 'checked' : ''}></td>` : ''}
        <td class="p-4"><span class="font-japanese-text text-xl font-bold">${front}</span></td>
        <td class="p-4">
          <div class="text-sm text-on-surface-variant mb-1">${reading}</div>
          <div>${item.meaning}</div>
        </td>
        <td class="p-4"><span class="px-2 py-1 rounded-md text-xs font-semibold ${jlptClass} border">${item.jlpt_level || '-'}</span></td>
        <td class="p-4 text-on-surface-variant text-sm">${new Date(item.created_at).toLocaleDateString('id-ID')}</td>
        <td class="p-4 text-center">
          <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="p-1 text-on-surface-variant hover:text-primary transition-colors" title="Edit item" onclick="window.enterEditMode('${item.type}', '${item.id}')">
              <span class="material-symbols-outlined text-[20px]">edit</span>
            </button>
            <button class="p-1 text-on-surface-variant hover:text-primary transition-colors" title="${archived ? 'Keluarkan dari arsip' : 'Arsipkan item'}" onclick="window.toggleArchiveItem('${item.type}', '${item.id}', ${archived})">
              <span class="material-symbols-outlined text-[20px]">${archived ? 'unarchive' : 'archive'}</span>
            </button>
            <button class="p-1 text-on-surface-variant hover:text-error transition-colors" title="Hapus item" onclick="window.deleteItem('${item.type}', '${item.id}')">
              <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableCont.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-surface-container border-b border-outline-variant">
            ${showCheckboxes ? `<th class="p-4 w-12"><input id="bulk-select-all" type="checkbox" class="h-5 w-5 rounded border-outline-variant text-primary focus:ring-primary" ${allVisibleSelected ? 'checked' : ''}></th>` : ''}
            <th class="p-4 font-label-sm text-on-surface-variant uppercase">Kata/Kanji/Pola</th>
            <th class="p-4 font-label-sm text-on-surface-variant uppercase">Cara Baca/Arti</th>
            <th class="p-4 font-label-sm text-on-surface-variant uppercase w-24">Level</th>
            <th class="p-4 font-label-sm text-on-surface-variant uppercase w-32">Tanggal</th>
            <th class="p-4 font-label-sm text-on-surface-variant uppercase w-24 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="font-body-md">${rowsHtml}</tbody>
      </table>
    </div>
    <div class="p-4 border-t border-outline-variant flex justify-between items-center text-sm text-on-surface-variant bg-surface-container-low">
      <span>Total: ${total} data</span>
      <div class="flex gap-2">
        <button class="px-3 py-1 border border-outline-variant rounded hover:bg-surface-container-high transition-colors disabled:opacity-50" ${currentPage === 1 ? 'disabled' : ''} onclick="window.changePage(-1)">Prev</button>
        <span class="px-3 py-1 border border-outline-variant rounded bg-primary text-on-primary">${currentPage}</span>
        <button class="px-3 py-1 border border-outline-variant rounded hover:bg-surface-container-high transition-colors" onclick="window.changePage(1)">Next</button>
      </div>
    </div>
    ${multiSelectMode && selectedItems.length > 0 ? `
      <div class="fixed bottom-24 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md px-2">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface shadow-lg px-4 py-3">
          <div class="font-body-md font-semibold text-on-surface">${selectedItems.length} item dipilih</div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold" onclick="window.${archived ? 'bulkUnarchiveSelected' : 'bulkArchiveSelected'}()">${archived ? 'Keluarkan dari arsip' : 'Arsipkan'} (${selectedItems.length})</button>
            <button class="px-3 py-2 rounded-lg border border-outline-variant text-on-surface text-sm font-semibold" onclick="window.bulkDeleteSelected()">Hapus (${selectedItems.length})</button>
            <button class="px-3 py-2 rounded-lg text-on-surface-variant text-sm font-semibold" onclick="window.cancelMultiSelect()">Batal</button>
          </div>
        </div>
      </div>
    ` : ''}
  `;

  bindBulkSelectionHandlers(tableCont);
}

function openAddModal() {
  const content = `
    <div class="space-y-4">
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Tipe</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="add-type" value="vocabulary" checked class="text-primary focus:ring-primary"/> Kosakata</label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="add-type" value="kanji" class="text-primary focus:ring-primary"/> Kanji</label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="add-type" value="grammar" class="text-primary focus:ring-primary"/> Tata Bahasa</label>
        </div>
      </div>
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Kata / Kanji / Pola</label>
        <input id="add-front" type="text" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all"/>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block font-label-sm text-on-surface-variant mb-1">Cara Baca</label>
          <input id="add-reading" type="text" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all"/>
        </div>
        <div>
          <label class="block font-label-sm text-on-surface-variant mb-1">Level JLPT</label>
          <select id="add-jlpt" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-body-md text-on-background transition-all cursor-pointer">
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3">N3</option>
            <option value="N2">N2</option>
            <option value="N1">N1</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Arti</label>
        <input id="add-meaning" type="text" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-body-md text-on-background transition-all"/>
      </div>
      <div>
        <label class="block font-label-sm text-on-surface-variant mb-1">Contoh Kalimat / Kosakata Terkait (Opsional)</label>
        <textarea id="add-example" rows="2" class="w-full bg-surface border border-outline-variant rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-japanese-text text-on-background transition-all"></textarea>
      </div>
      <div class="flex justify-end gap-3 pt-4 border-t border-outline-variant">
        <button onclick="closeModal()" class="px-5 py-2 rounded-lg font-body-md font-semibold text-primary hover:bg-primary/10 transition-colors">Batal</button>
        <button onclick="window.submitAdd()" class="bg-primary text-on-primary px-5 py-2 rounded-lg font-body-md font-semibold hover:bg-primary/90 transition-colors shadow-sm">Simpan</button>
      </div>
    </div>
  `;
  openModal('Tambah Item', content);
}

// Global handlers for inline HTML
(window as any).changePage = (delta: number) => {
  currentPage += delta;
  loadData();
};

(window as any).enterEditMode = (type: string, id: string) => {
  enterEditMode(type, id);
};

(window as any).saveEdit = async (type: string, id: string) => {
  await saveEdit(type, id);
};

(window as any).cancelEdit = () => {
  cancelEdit();
};

(window as any).deleteItem = async (type: string, id: string) => {
  try {
    if(type === 'vocabulary') await deleteVocabulary(id);
    if(type === 'kanji') await deleteKanji(id);
    if(type === 'grammar') await deleteGrammar(id);
    showToast('Item berhasil dihapus', 'success');
    loadData();
  } catch (err) {
    showToast('Gagal menghapus', 'error');
  }
};

(window as any).toggleArchiveItem = async (type: string, id: string, currentlyArchived: boolean) => {
  try {
    if (type === 'vocabulary') currentlyArchived ? await unarchiveVocabulary(id) : await archiveVocabulary(id);
    if (type === 'kanji') currentlyArchived ? await unarchiveKanji(id) : await archiveKanji(id);
    if (type === 'grammar') currentlyArchived ? await unarchiveGrammar(id) : await archiveGrammar(id);
    showToast(currentlyArchived ? 'Item dikembalikan ke Library' : 'Item berhasil diarsipkan', 'success');
    loadData(currentlyArchived);
  } catch (err) {
    showToast('Gagal mengubah arsip item', 'error');
  }
};

(window as any).bulkArchiveSelected = async () => {
  if (!selectedItems.length) return;

  try {
    await bulkArchiveItems(selectedItems);
    showToast(`${selectedItems.length} item berhasil diarsipkan`, 'success');
    multiSelectMode = false;
    selectedItems = [];
    updateMultiSelectButton();
    await loadData(currentArchivedView);
  } catch (err) {
    showToast('Gagal mengarsipkan item terpilih', 'error');
  }
};

(window as any).bulkUnarchiveSelected = async () => {
  if (!selectedItems.length) return;

  try {
    await bulkUnarchiveItems(selectedItems);
    showToast(`${selectedItems.length} item berhasil dikembalikan ke Library`, 'success');
    multiSelectMode = false;
    selectedItems = [];
    updateMultiSelectButton();
    await loadData(currentArchivedView);
  } catch (err) {
    showToast('Gagal mengembalikan item terpilih', 'error');
  }
};

(window as any).bulkDeleteSelected = async () => {
  if (!selectedItems.length) return;
  const confirmed = window.confirm(`Hapus ${selectedItems.length} item terpilih?`);
  if (!confirmed) return;

  try {
    await bulkDeleteItems(selectedItems);
    showToast(`${selectedItems.length} item berhasil dihapus`, 'success');
    multiSelectMode = false;
    selectedItems = [];
    updateMultiSelectButton();
    await loadData(currentArchivedView);
  } catch (err) {
    showToast('Gagal menghapus item terpilih', 'error');
  }
};

(window as any).cancelMultiSelect = () => {
  cancelMultiSelect();
};

(window as any).toggleArchiveAll = async () => {
  try {
    const [unarchivedVocabulary, archivedVocabulary] = await Promise.all([fetchAllVocabulary(false), fetchAllVocabulary(true)]);
    const [unarchivedKanji, archivedKanji] = await Promise.all([fetchAllKanji(false), fetchAllKanji(true)]);
    const [unarchivedGrammar, archivedGrammar] = await Promise.all([fetchAllGrammar(false), fetchAllGrammar(true)]);
    const allArchived = unarchivedVocabulary.length === 0 && unarchivedKanji.length === 0 && unarchivedGrammar.length === 0 && (archivedVocabulary.length + archivedKanji.length + archivedGrammar.length > 0);
    const actionLabel = allArchived ? 'Unarsip Semua Item' : 'Arsipkan Semua Item';
    const actionText = allArchived
      ? 'Semua item akan dikembalikan ke Library.'
      : 'Semua item akan dipindahkan ke arsip.';
    const confirmId = allArchived ? 'confirm-unarchive-all-items-btn' : 'confirm-archive-all-items-btn';

    openModal(actionLabel, `
      <div class="text-on-surface-variant mb-4">${actionText}</div>
      <div class="flex justify-end gap-3 pt-4">
        <button class="px-4 py-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-highest" onclick="closeModal()">Batal</button>
        <button id="${confirmId}" class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">${allArchived ? 'Unarsip Semua' : 'Arsipkan Semua'}</button>
      </div>
    `);

    document.getElementById(confirmId)?.addEventListener('click', async () => {
      closeModal();
      try {
        if (allArchived) {
          for (const item of archivedVocabulary) {
            await unarchiveVocabulary(item.id);
          }
          for (const item of archivedKanji) {
            await unarchiveKanji(item.id);
          }
          for (const item of archivedGrammar) {
            await unarchiveGrammar(item.id);
          }
        } else {
          for (const item of unarchivedVocabulary) {
            await archiveVocabulary(item.id);
          }
          for (const item of unarchivedKanji) {
            await archiveKanji(item.id);
          }
          for (const item of unarchivedGrammar) {
            await archiveGrammar(item.id);
          }
        }
        showToast(allArchived ? 'Semua item dikembalikan ke Library' : 'Semua item berhasil diarsipkan', 'success');
        loadData(false);
      } catch (err) {
        showToast('Gagal mengubah arsip semua item', 'error');
      }
    });
  } catch (err) {
    showToast('Gagal memuat status arsip semua item', 'error');
  }
};

(window as any).submitAdd = async () => {
  const type = (document.querySelector('input[name="add-type"]:checked') as HTMLInputElement).value;
  const front = (document.getElementById('add-front') as HTMLInputElement).value;
  const reading = (document.getElementById('add-reading') as HTMLInputElement).value;
  const jlpt = (document.getElementById('add-jlpt') as HTMLSelectElement).value;
  const meaning = (document.getElementById('add-meaning') as HTMLInputElement).value;
  const example = (document.getElementById('add-example') as HTMLTextAreaElement).value;

  try {
    if(type === 'vocabulary') {
      await createVocabulary({word: front, reading, jlpt_level: jlpt, meaning, example_sentence: example});
    } else if(type === 'kanji') {
      await createKanji({character: front, onyomi: reading, jlpt_level: jlpt, meaning, example_words: example});
    } else if(type === 'grammar') {
      await createGrammar({pattern: front, structure: reading, jlpt_level: jlpt, meaning, example_sentence: example});
    }
    showToast('Berhasil disimpan!', 'success');
    closeModal();
    loadData();
  } catch (err) {
    showToast('Gagal menyimpan', 'error');
  }
};