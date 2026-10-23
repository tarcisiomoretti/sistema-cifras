'use strict';

/* ============================================================
   Sistema de Cifras — protótipo corrigido (etapa 1)
   - Dados locais em IndexedDB (metadados, arquivos e texto separados)
   - PDFs renderizados sob demanda
   - Bibliotecas de PDF/DOCX locais (funciona offline)
   - Download comum, compartilhamento, tema persistente e PWA
   ============================================================ */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const DB_NAME = 'cifras';
const DB_VERSION = 3;
const THEME_KEY = 'cifras-theme';
const OPEN_LIST_KEY = 'cifras-open-list';
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB por arquivo
const MAX_CANVAS_PIXELS = 6_000_000;
const MAX_ZIP_BYTES = 100 * 1024 * 1024; // aviso antes de montar zip muito grande

/* ---------- estado ---------- */
let db = null;
let storageWarningShown = false;
const mem = {
  songs: new Map(),
  lists: new Map(),
  files: new Map(),
  texts: new Map()
};

let songs = [];
let lists = [];
let view = 'lib';
let q = '';
let tag = '';
let openList = null;
let editingList = null;
let dragState = null;
const addQ = {};

let queue = [];
let qi = 0;
let zoom = 1;
let invert = false;
let viewerOpen = false;
let currentDoc = null;
let renderGeneration = 0;
let pageObserver = null;
let pageElements = [];
const renderedPages = new Map(); // número da página -> { canvas, page, task }
const renderingPages = new Set(); // páginas com desenho em andamento
let editingSongId = null;
let deferredInstall = null;
let searchTimer = 0;
let toastTimer = 0;
let resizeTimer = 0;
let importing = false;
let exporting = false;
let currentBlob = null;
let currentBlobSongId = null;
let currentObjectUrl = null; // imagem aberta no visualizador
let pendingExport = null; // { kind, filename, blob } pronto para compartilhar/baixar

/* ---------- utilidades ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[ch]));
}

function norm(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function songById(id) {
  return songs.find((song) => song.id === id);
}

function listById(id) {
  return lists.find((list) => list.id === id);
}

function currentSong() {
  return songById(queue[qi]);
}

function subtitle(song) {
  const onde = song.missing ? 'ausente' : '';
  return [song.artist, song.type ? song.type.toUpperCase() : '', onde, ...(song.tags || [])]
    .filter(Boolean)
    .join(' · ');
}

function buildHay(song) {
  song._hay = norm([
    song.name,
    song.artist,
    song.key,
    (song.tags || []).join(' '),
    song.text || ''
  ].join(' '));
}

function mimeOf(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function fileType(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (/\.(png|jpe?g|webp)$/.test(lower)) return 'image';
  return null;
}

function isSupportedFile(filename) {
  return Boolean(fileType(filename));
}

function extensionOf(song) {
  const match = String(song && song.file || '').match(/\.([a-z0-9]+)$/i);
  if (match) return '.' + match[1].toLowerCase();
  if (song && song.type === 'pdf') return '.pdf';
  if (song && song.type === 'docx') return '.docx';
  if (song && song.type === 'doc') return '.doc';
  if (song && song.type === 'image') return '.png';
  return '.pdf';
}

function baseName(filename) {
  return String(filename || '')
    .replace(/\.(pdf|docx?|png|jpe?g|webp)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

function sanitizeFileName(value, fallback = 'cifra') {
  let name = String(value == null ? '' : value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  if (!name) name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = '_' + name;
  return (name.slice(0, 120).trim() || fallback);
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return size.toFixed(index === 0 || size >= 10 ? 0 : 1) + ' ' + units[index];
}

function toast(message, type = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, type === 'error' ? 5500 : 2800);
}

function setProgress(fraction, message = '') {
  const wrap = $('#progress');
  const bar = $('#progressBar');
  const label = $('#progressText');
  if (fraction == null) {
    wrap.hidden = true;
    bar.style.width = '0%';
    if (label) label.textContent = '';
    return;
  }
  wrap.hidden = false;
  bar.style.width = Math.max(0, Math.min(1, fraction)) * 100 + '%';
  if (label) label.textContent = message;
}

async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return;
  try {
    // Alguns navegadores (e o modo headless) podem deixar essa promessa pendente.
    const work = (async () => {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    })();
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([work, timeout]);
  } catch (err) {
    /* sem problema: alguns navegadores não permitem */
  }
}

/* ============================================================
   IndexedDB (com memória como reserva)
   ============================================================ */
function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha no banco de dados'));
  });
}

function openDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      resolve(null);
      return;
    }

    let settled = false;
    let timer = 0;
    const settle = (value) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      resolve(value);
      return true;
    };
    // Se outra aba estiver segurando uma versão antiga, não deixa a abertura presa.
    timer = setTimeout(() => settle(null), 5000);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const transaction = event.target.transaction;

      if (!database.objectStoreNames.contains('songs')) {
        database.createObjectStore('songs', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('lists')) {
        database.createObjectStore('lists', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('files')) {
        database.createObjectStore('files', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('texts')) {
        database.createObjectStore('texts', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('handles')) {
        database.createObjectStore('handles');
      }

      // Migração da versão 1: separa blobs e texto dos metadados.
      if (event.oldVersion === 1) {
        const songsStore = transaction.objectStore('songs');
        const filesStore = transaction.objectStore('files');
        const textsStore = transaction.objectStore('texts');

        songsStore.openCursor().onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          const song = cursor.value;
          if (song.blob) {
            filesStore.put({ id: song.id, blob: song.blob });
            delete song.blob;
          }
          if (song.text) {
            textsStore.put({ id: song.id, text: song.text });
            delete song.text;
          }
          song.updatedAt = song.updatedAt || song.added || Date.now();
          song.source = song.source || 'local';
          cursor.update(song);
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      if (settled) {
        try { request.result.close(); } catch (err) { /* ignore */ }
        return;
      }
      db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch (err) { /* ignore */ }
        db = null;
        toast('O app foi atualizado em outra aba. Recarregue a página.', 'error');
      };
      settle(db);
    };

    request.onerror = () => settle(null);
    request.onblocked = () => {
      toast('Feche outras abas do app para atualizar o banco de dados.', 'error');
    };
  });
}

function tx(names, mode, fn) {
  names = Array.isArray(names) ? names : [names];
  if (!db) return Promise.resolve(fn(null));

  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(names, mode);
    } catch (err) {
      reject(err);
      return;
    }

    const stores = names.map((name) => transaction.objectStore(name));
    let result;
    try {
      result = fn(stores, transaction);
    } catch (err) {
      try { transaction.abort(); } catch (ignore) { /* ignore */ }
      reject(err);
      return;
    }

    Promise.resolve(result).then(
      (value) => { result = value; },
      (err) => {
        try { transaction.abort(); } catch (ignore) { /* ignore */ }
        reject(err);
      }
    );

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao gravar no banco de dados'));
    transaction.onabort = () => reject(transaction.error || new Error('Gravação cancelada'));
  });
}

async function getAll(store) {
  if (!db) return Array.from(mem[store].values());
  return tx(store, 'readonly', (stores) => req(stores[0].getAll()));
}

async function getOne(store, key) {
  if (!db) return mem[store].get(key);
  return tx(store, 'readonly', (stores) => req(stores[0].get(key)));
}

async function putOne(store, value) {
  if (!db) {
    mem[store].set(value.id, value);
    scheduleBackup();
    return;
  }
  await tx(store, 'readwrite', (stores) => req(stores[0].put(value)));
  scheduleBackup();
}

async function deleteOne(store, key) {
  if (!db) {
    mem[store].delete(key);
    scheduleBackup();
    return;
  }
  await tx(store, 'readwrite', (stores) => req(stores[0].delete(key)));
  scheduleBackup();
}

function metaOf(song) {
  const { _hay, text, ...meta } = song;
  return meta;
}

/* ============================================================
   Pasta das cifras: a pasta escolhida no tablet vira a biblioteca.
   O app só LÊ os arquivos; nada é copiado, movido ou apagado.
   ============================================================ */
const LIBRARY_DIR_KEY = 'cifras-pasta';
const OLD_DIR_KEY = 'cifras-dir';
const HIDDEN_KEY = 'cifras-ocultas';
const MAX_FOLDER_FILES = 5000;
const MAX_FOLDER_DEPTH = 12;

let dirHandle = null;          // FileSystemDirectoryHandle com acesso liberado
let pendingDirHandle = null;   // pasta salva que ainda precisa de permissão
let folderScanning = false;
let folderIndexing = false;
let backupTimer = 0;
let backupRunning = false;
let backupAgain = false;
let restoreInProgress = false;
const indexingIds = new Set();

function scheduleBackup() {
  if (!dirHandle || restoreInProgress) return;
  // Só grava sozinho se a permissão de escrita já estiver liberada.
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = 0;
    runAutoBackup();
  }, 1800);
}

async function runAutoBackup() {
  if (!dirHandle || restoreInProgress) return;
  if (backupRunning) {
    backupAgain = true;
    return;
  }
  try {
    if (typeof dirHandle.queryPermission === 'function') {
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return;
    }
  } catch (err) {
    return;
  }
  backupRunning = true;
  try {
    await exportDbToFolder({ silent: true });
  } catch (err) {
    console.warn('Backup automático não gravado.', err);
  } finally {
    backupRunning = false;
    if (backupAgain) {
      backupAgain = false;
      scheduleBackup();
    }
  }
}

function folderSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function folderEnabled() {
  try {
    return localStorage.getItem(LIBRARY_DIR_KEY) === 'sim' ||
      localStorage.getItem(OLD_DIR_KEY) === 'sim';
  } catch (err) {
    return false;
  }
}

function setFolderEnabled(on) {
  try {
    if (on) localStorage.setItem(LIBRARY_DIR_KEY, 'sim');
    else localStorage.removeItem(LIBRARY_DIR_KEY);
    localStorage.removeItem(OLD_DIR_KEY);
  } catch (err) { /* segue em memória */ }
}

/* O handle não vai para o localStorage; guardamos no IndexedDB. */
async function saveDirHandle(handle) {
  try {
    if (!db) return;
    await tx(['handles'], 'readwrite', (stores) => req(stores[0].put(handle, 'library')));
  } catch (err) { /* alguns navegadores recusam guardar o handle */ }
}

async function restoreDirHandle() {
  if (dirHandle) return dirHandle;
  if (!folderEnabled()) return null;

  try {
    if (!db) return null;
    let handle = await getOne('handles', 'library');
    if (!handle) handle = await getOne('handles', 'dir');
    if (!handle) return null;

    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      dirHandle = handle;
      pendingDirHandle = null;
    } else if (permission === 'prompt') {
      pendingDirHandle = handle;
    } else {
      return null;
    }
    if (!(await getOne('handles', 'library'))) await saveDirHandle(handle);
    setFolderEnabled(true);
    return dirHandle || handle;
  } catch (err) {
    console.warn('Não foi possível revincular a pasta das cifras.', err);
    return null;
  }
}

async function ensureFolderPermission() {
  if (dirHandle) {
    try {
      if (await dirHandle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
    } catch (err) { /* tenta pedir de novo */ }
  }

  const handle = pendingDirHandle || dirHandle;
  if (!handle) return false;

  try {
    const asked = await handle.requestPermission({ mode: 'readwrite' });
    if (asked === 'granted') {
      dirHandle = handle;
      pendingDirHandle = null;
      setFolderEnabled(true);
      await saveDirHandle(handle);
      return true;
    }
  } catch (err) {
    console.warn('Permissão da pasta negada.', err);
  }
  return false;
}

async function pickLibraryFolder() {
  if (!folderSupported()) {
    toast('Este navegador não deixa escolher uma pasta. Use “Importar arquivos”.', 'error');
    return false;
  }
  try {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'cifras', mode: 'readwrite', startIn: 'documents' });
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      // Navegadores mais antigos não aceitam as opções.
      handle = await window.showDirectoryPicker();
    }
    dirHandle = handle;
    pendingDirHandle = null;
    setFolderEnabled(true);
    await saveDirHandle(handle);
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    console.error('Falha ao escolher a pasta', err);
    toast('Não foi possível usar essa pasta.', 'error');
    return false;
  }
}

async function forgetLibraryFolder() {
  dirHandle = null;
  pendingDirHandle = null;
  setFolderEnabled(false);
  try {
    await deleteOne('handles', 'library');
    await deleteOne('handles', 'dir');
  } catch (err) { /* ignore */ }
}

function hiddenPaths() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function setHiddenPaths(list) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(new Set(list))));
    scheduleBackup();
  } catch (err) { /* ignore */ }
}

function hideFolderPath(path) {
  if (!path) return;
  const list = hiddenPaths();
  list.push(path);
  setHiddenPaths(list);
}

async function getFileByPath(path) {
  if (!dirHandle || !path) return null;
  const parts = String(path).split('/').filter(Boolean);
  if (!parts.length) return null;
  try {
    let folder = dirHandle;
    for (let index = 0; index < parts.length - 1; index++) {
      folder = await folder.getDirectoryHandle(parts[index]);
    }
    const handle = await folder.getFileHandle(parts[parts.length - 1]);
    return await handle.getFile();
  } catch (err) {
    return null;
  }
}

/* Lê o arquivo da pasta mapeada; se não houver, usa o armazenamento interno. */
async function loadFile(song) {
  if (!song) return null;
  if (song.folderPath && dirHandle) {
    const file = await getFileByPath(song.folderPath);
    if (file) return file;
  }
  if (song.storage === 'folder' && dirHandle && song.file) {
    // Compatibilidade com arquivos gravados na raiz da pasta por versões antigas.
    try {
      const handle = await dirHandle.getFileHandle(song.file);
      const file = await handle.getFile();
      if (file) return file;
    } catch (err) { /* segue para o IndexedDB */ }
  }
  const record = await getOne('files', song.id);
  return record && record.blob ? record.blob : null;
}

async function resolveBlob(song) {
  return loadFile(song);
}

async function storeFile(song, blob, text) {
  // Importações manuais ficam no IndexedDB; arquivos mapeados não são copiados.
  song.storage = 'internal';
  await saveSongRecord(song, blob, text);
}

async function saveSongRecord(song, blob, text) {
  const meta = metaOf(song);
  if (!db) {
    mem.songs.set(song.id, meta);
    if (blob) mem.files.set(song.id, { id: song.id, blob });
    else mem.files.delete(song.id);
    mem.texts.set(song.id, { id: song.id, text: text || '' });
    scheduleBackup();
    return;
  }
  await tx(['songs', 'files', 'texts'], 'readwrite', (stores) => {
    const jobs = [
      req(stores[0].put(meta)),
      req(stores[2].put({ id: song.id, text: text || '' }))
    ];
    // Só guarda o arquivo no IndexedDB quando ele é uma importação (cópia).
    if (blob) jobs.push(req(stores[1].put({ id: song.id, blob })));
    else jobs.push(req(stores[1].delete(song.id)));
    return Promise.all(jobs);
  });
  scheduleBackup();
}

async function saveMeta(song) {
  await putOne('songs', metaOf(song));
}

async function deleteSongRecord(id) {
  const affected = lists.filter((list) => list.items.includes(id));
  const updatedLists = affected.map((list) => ({
    ...list,
    items: list.items.filter((item) => item !== id),
    updatedAt: Date.now()
  }));

  if (!db) {
    mem.songs.delete(id);
    mem.files.delete(id);
    mem.texts.delete(id);
    for (const list of updatedLists) mem.lists.set(list.id, list);
    scheduleBackup();
    return updatedLists;
  }

  await tx(['songs', 'files', 'texts', 'lists'], 'readwrite', (stores) => {
    const ops = [
      req(stores[0].delete(id)),
      req(stores[1].delete(id)),
      req(stores[2].delete(id))
    ];
    for (const list of updatedLists) ops.push(req(stores[3].put(list)));
    return Promise.all(ops);
  });

  scheduleBackup();
  return updatedLists;
}

async function readFolderEntries(folder) {
  const entries = [];
  try {
    const iterator = typeof folder.values === 'function' ? folder.values() : folder.entries();
    if (!iterator || typeof iterator.next !== 'function') return entries;
    while (true) {
      const step = await iterator.next();
      if (step.done) break;
      const value = step.value;
      if (Array.isArray(value)) entries.push(value);
      else if (value) entries.push([value.name, value]);
    }
  } catch (err) { /* pasta inacessível */ }
  return entries;
}

async function collectFolderFiles(folder, prefix, depth, out) {
  if (depth > MAX_FOLDER_DEPTH || out.length >= MAX_FOLDER_FILES) return out;

  const entries = await readFolderEntries(folder);
  for (const entry of entries) {
    const name = Array.isArray(entry) ? entry[0] : entry.name;
    const handle = Array.isArray(entry) ? entry[1] : entry;
    if (!name || name.startsWith('.') || !handle) continue;

    if (handle.kind === 'directory') {
      await collectFolderFiles(handle, prefix ? prefix + '/' + name : name, depth + 1, out);
    } else if (handle.kind === 'file' && isSupportedFile(name)) {
      out.push({ handle, path: prefix ? prefix + '/' + name : name, name });
    }
    if (out.length >= MAX_FOLDER_FILES) break;
  }
  return out;
}

async function scanLibraryFolder(options = {}) {
  if (folderScanning) {
    if (!options.silent) toast('A pasta já está sendo lida.', 'error');
    return null;
  }
  if (!dirHandle) {
    const restored = await restoreDirHandle();
    if (!restored) {
      if (!options.silent) openFolderModal();
      return null;
    }
  }
  const hasPermission = await ensureFolderPermission();
  if (!hasPermission) {
    if (!options.silent) toast('Libere o acesso à pasta para atualizar a lista.', 'error');
    return null;
  }

  folderScanning = true;
  const seen = new Set();
  const hidden = new Set(hiddenPaths());
  let added = 0;
  let updated = 0;
  let found = 0;
  let hiddenCount = 0;
  let limitReached = false;

  try {
    setProgress(0.05, 'Lendo a pasta ' + dirHandle.name + '…');
    const items = await collectFolderFiles(dirHandle, '', 0, []);
    if (items.length >= MAX_FOLDER_FILES) limitReached = true;

    for (const item of items) {
      found++;
      if (found > MAX_FOLDER_FILES) break;
      const relativePath = item.path;
      seen.add(relativePath);

      if (hidden.has(relativePath)) {
        hiddenCount++;
        continue;
      }

      let file;
      try {
        file = await item.handle.getFile();
      } catch (err) {
        continue;
      }
      const type = fileType(file.name);
      if (!type) continue;

      let song = songs.find((candidate) => candidate.folderPath === relativePath);
      const isNew = !song;
      if (!song) {
        // Aproveita uma importação antiga do mesmo arquivo, sem duplicar.
        song = songs.find((candidate) => !candidate.folderPath && candidate.source !== 'folder' &&
          String(candidate.file || '').toLowerCase() === file.name.toLowerCase() &&
          (!candidate.size || !file.size || Number(candidate.size) === file.size));
      }

      if (!song) {
        song = {
          id: uid(),
          name: baseName(file.name) || file.name,
          file: file.name,
          type,
          artist: '',
          key: '',
          tags: [],
          fav: false,
          added: Date.now(),
          addedAt: Date.now(),
          updatedAt: Date.now(),
          source: 'folder',
          text: ''
        };
        songs.push(song);
      }

      const changed = isNew ||
        song.file !== file.name ||
        song.type !== type ||
        Number(song.size) !== file.size ||
        song.folderPath !== relativePath ||
        song.missing ||
        song.source !== 'folder';

      song.file = file.name;
      song.type = type;
      song.size = file.size;
      song.folderPath = relativePath;
      song.source = 'folder';
      song.storage = 'folder';
      song.missing = false;

      if (isNew) {
        added++;
      } else if (changed) {
        updated++;
      }

      if (changed) {
        buildHay(song);
        await saveMeta(song);
      }

      if (found % 10 === 0) {
        const fraction = Math.min(0.95, 0.15 + found / MAX_FOLDER_FILES);
        setProgress(fraction, 'Encontrados ' + found + ' arquivo(s)…');
      }
    }

    // Marca (sem apagar) as cifras que sumiram da pasta.
    let missing = 0;
    for (const song of songs) {
      if (song.source !== 'folder' || !song.folderPath) continue;
      if (!seen.has(song.folderPath) && !song.missing) {
        song.missing = true;
        await saveMeta(song);
        missing++;
      } else if (seen.has(song.folderPath) && song.missing) {
        song.missing = false;
        await saveMeta(song);
      }
    }

    await loadAll();
    render();
    // Garante que a pasta tenha o backup do banco mesmo sem alterações
    // (por exemplo, na primeira vez que a pasta é escolhida).
    scheduleBackup();
    const mapped = songs.filter((song) => song.folderPath).length;
    if (!options.silent) {
      const parts = [];
      if (added) parts.push(added + ' nova(s)');
      if (updated) parts.push(updated + ' atualizada(s)');
      if (missing) parts.push(missing + ' ausente(s)');
      if (hiddenCount) parts.push(hiddenCount + ' oculta(s)');
      toast(parts.length ? parts.join(' · ') : 'Tudo em dia: ' + mapped + ' arquivo(s) na pasta.');
      if (limitReached) {
        toast('A pasta é muito grande: listamos os primeiros ' + MAX_FOLDER_FILES + ' arquivos.', 'error');
      }
    }
    return { added, updated, missing, mapped, found };
  } catch (err) {
    console.error('Falha ao ler a pasta', err);
    if (!options.silent) toast('Não foi possível ler a pasta das cifras.', 'error');
    return null;
  } finally {
    folderScanning = false;
    setProgress(null);
  }
}

/* Prepara a busca pelo texto de uma cifra, em segundo plano. */
async function indexSongText(song) {
  if (!song || !song.id || song.text || !['pdf', 'docx'].includes(song.type)) return;
  if (indexingIds.has(song.id)) return;
  indexingIds.add(song.id);
  try {
    const file = await loadFile(song);
    if (!file) return;
    const text = await extractText({ name: song.file || song.name }, await file.arrayBuffer());
    if (!text) return;
    const current = songById(song.id) || song;
    current.text = text;
    buildHay(current);
    await saveMeta(current);
    await putOne('texts', { id: current.id, text });
  } catch (err) {
    console.warn('Não foi possível preparar a busca de ' + song.name, err);
  } finally {
    indexingIds.delete(song.id);
  }
}

async function indexFolderTexts() {
  if (folderIndexing) {
    toast('A preparação da busca já está em andamento.', 'error');
    return;
  }
  if (!dirHandle && !(await restoreDirHandle())) {
    toast('Escolha a pasta das cifras primeiro.', 'error');
    return;
  }
  if (!(await ensureFolderPermission())) {
    toast('Libere o acesso à pasta para preparar a busca.', 'error');
    return;
  }

  const pendingIndex = songs.filter((song) => song.folderPath && !song.missing &&
    (song.type === 'pdf' || song.type === 'docx') && !song.text);
  if (!pendingIndex.length) {
    toast('A busca pelo texto já está pronta.');
    return;
  }

  folderIndexing = true;
  let done = 0;
  let failed = 0;
  try {
    for (const song of pendingIndex) {
      setProgress(0.05 + done / pendingIndex.length * 0.9,
        'Lendo ' + (done + 1) + ' de ' + pendingIndex.length + ': ' + song.name);
      try {
        await indexSongText(song);
      } catch (err) {
        failed++;
      }
      done++;
    }
    await loadAll();
    render();
    toast('Busca preparada em ' + (done - failed) + ' cifra(s).', failed ? 'error' : '');
  } finally {
    folderIndexing = false;
    setProgress(null);
  }
}

/* ---------- tela da pasta ---------- */
const BACKUP_FILENAME = 'cifras-backup.json';

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function writeFileToFolder(filename, content) {
  if (!dirHandle) return null;
  try {
    const handle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return handle;
  } catch (err) {
    console.error('Falha ao gravar arquivo na pasta', err);
    throw err;
  }
}

async function readFileFromFolder(filename) {
  if (!dirHandle) return null;
  try {
    const handle = await dirHandle.getFileHandle(filename);
    return await handle.getFile();
  } catch (err) {
    return null;
  }
}

async function exportDbToFolder(options = {}) {
  const silent = Boolean(options.silent);
  if (!dirHandle) {
    if (!silent) toast('Escolha a pasta primeiro.', 'error');
    return false;
  }
  if (!silent) {
    const ok = await ensureFolderPermission();
    if (!ok) {
      toast('Libere o acesso à pasta para salvar o backup.', 'error');
      return false;
    }
  }

  try {
    if (!silent) setProgress(0.05, 'Montando backup do banco...');
    const [songMetas, listRecords, textRecords, fileRecords] = await Promise.all([
      getAll('songs'),
      getAll('lists'),
      getAll('texts'),
      getAll('files')
    ]);

    const files = [];
    for (let i = 0; i < fileRecords.length; i++) {
      const rec = fileRecords[i];
      if (!rec || !rec.blob) continue;
      if (!silent) {
        setProgress(0.05 + (i / Math.max(1, fileRecords.length)) * 0.4, 'Salvando arquivos importados...');
      }
      try {
        const base64 = await blobToBase64(rec.blob);
        files.push({ id: rec.id, type: rec.blob.type || 'application/octet-stream', data: base64 });
      } catch (err) {
        console.warn('Não foi possível incluir arquivo no backup', rec.id, err);
      }
    }

    if (!silent) setProgress(0.6, 'Gravando na pasta...');
    const backup = {
      app: 'sistema-cifras',
      version: DB_VERSION,
      exportedAt: Date.now(),
      songs: songMetas,
      lists: listRecords,
      texts: textRecords,
      hidden: hiddenPaths(),
      files
    };

    const json = JSON.stringify(backup);
    const blob = new Blob([json], { type: 'application/json' });
    await writeFileToFolder(BACKUP_FILENAME, blob);
    if (!silent) {
      setProgress(null);
      toast('Backup salvo na pasta: ' + BACKUP_FILENAME);
    }
    return true;
  } catch (err) {
    console.error('Falha ao salvar backup', err);
    if (!silent) {
      setProgress(null);
      toast('Não foi possível salvar o backup na pasta.', 'error');
    }
    return false;
  }
}

async function importDbFromFolder() {
  if (!dirHandle) {
    toast('Escolha a pasta primeiro.', 'error');
    return false;
  }
  const ok = await ensureFolderPermission();
  if (!ok) {
    toast('Libere o acesso à pasta para restaurar o backup.', 'error');
    return false;
  }

  const file = await readFileFromFolder(BACKUP_FILENAME);
  if (!file) {
    toast('Arquivo cifras-backup.json não encontrado nesta pasta.', 'error');
    return false;
  }

  if (!confirm('Restaurar o banco a partir de cifras-backup.json?\n\nIsso irá sobrescrever metadados, listas, textos e arquivos importados neste aparelho. As cifras mapeadas da pasta permanecem.')) {
    return false;
  }

  restoreInProgress = true;
  clearTimeout(backupTimer);
  backupTimer = 0;
  try {
    setProgress(0.05, 'Lendo backup...');
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup || backup.app !== 'sistema-cifras') {
      toast('Backup inválido ou de outro app.', 'error');
      setProgress(null);
      return false;
    }

    setProgress(0.2, 'Restaurando metadados...');
    if (!db) {
      mem.songs.clear();
      mem.lists.clear();
      mem.texts.clear();
      mem.files.clear();
      (backup.songs || []).forEach((s) => mem.songs.set(s.id, s));
      (backup.lists || []).forEach((l) => mem.lists.set(l.id, l));
      (backup.texts || []).forEach((t) => mem.texts.set(t.id, t));
    } else {
      await tx(['songs', 'lists', 'texts', 'files'], 'readwrite', (stores) => {
        const jobs = [];
        const [songsStore, listsStore, textsStore, filesStore] = stores;
        jobs.push(req(songsStore.clear()));
        jobs.push(req(listsStore.clear()));
        jobs.push(req(textsStore.clear()));
        jobs.push(req(filesStore.clear()));
        for (const s of backup.songs || []) jobs.push(req(songsStore.put(s)));
        for (const l of backup.lists || []) jobs.push(req(listsStore.put(l)));
        for (const t of backup.texts || []) jobs.push(req(textsStore.put(t)));
        return Promise.all(jobs);
      });
    }
    if (Array.isArray(backup.hidden)) setHiddenPaths(backup.hidden);

    setProgress(0.5, 'Restaurando arquivos importados...');
    const files = Array.isArray(backup.files) ? backup.files : [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f || !f.id || !f.data) continue;
      setProgress(0.5 + (i / Math.max(1, files.length)) * 0.4, 'Restaurando arquivo ' + (i + 1) + '/' + files.length);
      try {
        const blob = base64ToBlob(f.data, f.type || 'application/octet-stream');
        if (db) {
          await putOne('files', { id: f.id, blob });
        } else {
          mem.files.set(f.id, { id: f.id, blob });
        }
      } catch (err) {
        console.warn('Falha ao restaurar arquivo', f.id, err);
      }
    }

    setProgress(0.95, 'Recarregando...');
    await loadAll();
    render();
    setProgress(null);
    toast('Backup restaurado com sucesso.');
    closeModal();
    return true;
  } catch (err) {
    console.error('Falha ao restaurar backup', err);
    setProgress(null);
    toast('Não foi possível restaurar o backup.', 'error');
    return false;
  } finally {
    restoreInProgress = false;
  }
}

function openFolderModal() {
  const handle = dirHandle || pendingDirHandle;
  const name = handle ? handle.name : '';
  const needsPermission = !dirHandle && Boolean(pendingDirHandle);
  const mapped = songs.filter((song) => song.folderPath).length;
  const missing = songs.filter((song) => song.missing).length;
  const supported = folderSupported();

  $('#modalBody').innerHTML = `
    <h2 id="modalTitle">Pasta das cifras</h2>
    ${name
      ? `<p class="export-info">Pasta: <strong>${esc(name)}</strong>
          ${needsPermission ? ' · <strong>acesso precisa ser liberado</strong>' : ''}</p>`
      : ''}
    ${mapped
      ? `<p class="export-info">${mapped} arquivo(s) da pasta na biblioteca${missing ? ' · ' + missing + ' ausente(s)' : ''}.</p>`
      : ''}
    ${supported
      ? `<p class="export-info">
          Escolha a pasta do tablet onde já estão as cifras. O app lê PDF, DOCX, DOC e imagens
          (PNG/JPG) sem copiar nada para dentro do aplicativo. Só o arquivo de backup do banco
          é gravado na pasta. Ao adicionar ou remover arquivos, toque em <strong>Atualizar lista</strong>.
        </p>
        <div class="modal-actions">
          <button class="primary grow" data-act="folder-pick">${name ? 'Trocar pasta' : 'Escolher pasta do tablet'}</button>
          ${name ? `<button data-act="folder-permission">${needsPermission ? 'Liberar acesso' : 'Reconectar'}</button>` : ''}
        </div>
        <div class="modal-actions">
          <button data-act="folder-scan" ${dirHandle ? '' : 'disabled'}>Atualizar lista</button>
          <button data-act="folder-index" ${dirHandle ? '' : 'disabled'}>Preparar busca pelo texto</button>
        </div>`
      : `<p class="export-info export-warn">
          Este navegador não permite escolher uma pasta. Nesse caso, use
          <strong>Importar arquivos / pasta</strong> e selecione tudo o que está dentro dela
          (isso cria uma cópia no aplicativo).
        </p>`}
    <p class="export-title">Banco de dados nesta pasta</p>
    <p class="export-info">
      O banco (metadados, repertórios, textos e arquivos importados) é salvo em
      <strong>cifras-backup.json</strong> nesta pasta, atualizado automaticamente quando algo muda.
      Assim você pode sincronizar a pasta com o OneDrive. As cifras em si nunca são alteradas.
    </p>
    <div class="modal-actions">
      <button data-act="folder-backup" ${dirHandle ? '' : 'disabled'}>Salvar backup agora</button>
      <button data-act="folder-restore" ${dirHandle ? '' : 'disabled'}>Restaurar backup desta pasta</button>
    </div>
    <p class="export-title">Outros arquivos</p>
    <p class="export-info">Também é possível importar arquivos avulsos ou uma pasta inteira como cópia.</p>
    <div class="modal-actions">
      <button data-act="folder-import">Importar arquivos / pasta</button>
      ${hiddenPaths().length
        ? `<button data-act="folder-unhide">Mostrar ${hiddenPaths().length} oculto(s)</button>`
        : ''}
    </div>
    ${name
      ? `<div class="modal-actions">
          <button class="danger" data-act="folder-forget">Esquecer esta pasta</button>
        </div>`
      : ''}
    <div class="modal-actions">
      <button data-act="cancel-export">Fechar</button>
    </div>
  `;
  showModal();
}

/* ============================================================
   Carregamento inicial
   ============================================================ */
async function loadAll() {
  const [songMetas, listRecords, textRecords] = await Promise.all([
    getAll('songs'),
    getAll('lists'),
    getAll('texts')
  ]);

  const textMap = new Map(textRecords.map((item) => [item.id, item.text || '']));
  songs = songMetas.map((meta) => {
    const song = { ...meta, text: textMap.get(meta.id) || '' };
    buildHay(song);
    return song;
  });

  lists = listRecords
    .map((list) => ({ ...list, items: Array.isArray(list.items) ? list.items : [] }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name, 'pt'));

  if (openList && !listById(openList)) openList = null;
  if (editingList && !listById(editingList)) editingList = null;
}

/* ============================================================
   Importação
   ============================================================ */
async function sha256(buffer) {
  try {
    if (!window.crypto || !crypto.subtle) return null;
    if (buffer.byteLength > 80 * 1024 * 1024) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    return null;
  }
}

async function extractText(file, buffer, onPage) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.pdf') && window.pdfjsLib) {
      const doc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      const parts = [];
      const total = doc.numPages;
      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        parts.push(content.items.map((item) => item.str).join(' '));
        try { page.cleanup(); } catch (ignore) { /* ignore */ }
        if (onPage) onPage(pageNumber, total);
        if (pageNumber % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      await doc.destroy();
      return parts.join('\n').trim();
    }

    if (name.endsWith('.docx') && window.mammoth) {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.slice(0) });
      return String(result.value || '').trim();
    }
  } catch (err) {
    console.warn('Não foi possível extrair o texto de ' + file.name, err);
  }
  return '';
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => isSupportedFile(file.name));
  if (!files.length) {
    toast('Escolha arquivos PDF, DOCX, DOC, PNG ou JPG.', 'error');
    return;
  }
  if (importing) {
    toast('Aguarde a importação atual terminar.', 'error');
    return;
  }

  importing = true;
  try {
    await requestPersistence();
    setProgress(0, 'Preparando importação…');
    toast('Importando ' + files.length + ' arquivo(s)…');

    let imported = 0;
    let updated = 0;
    let failed = 0;
    let withoutText = 0;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setProgress(index / files.length, 'Lendo ' + (index + 1) + ' de ' + files.length + ': ' + file.name);

      if (file.size > MAX_FILE_BYTES) {
        failed++;
        toast(file.name + ' é grande demais (limite de ' +
          Math.round(MAX_FILE_BYTES / 1024 / 1024) + ' MB).', 'error');
        continue;
      }

      let existing = null;
      let before = null;
      try {
        const buffer = await file.arrayBuffer();
        const hash = await sha256(buffer);
        const text = await extractText(file, buffer, (page, total) => {
          if (!total) return;
          setProgress(
            (index + page / total) / files.length,
            'Lendo ' + file.name + ' — página ' + page + ' de ' + total
          );
        });
        existing = songs.find((song) => !song.folderPath &&
          String(song.file || '').toLowerCase() === file.name.toLowerCase());
        const type = fileType(file.name) || file.name.split('.').pop().toLowerCase();
        const blob = new Blob([buffer], { type: mimeOf(file.name) });
        const now = Date.now();
        before = existing ? {
          file: existing.file,
          size: existing.size,
          type: existing.type,
          hash: existing.hash,
          updatedAt: existing.updatedAt,
          text: existing.text
        } : null;

        let song;
        if (existing) {
          existing.file = file.name;
          existing.size = file.size;
          existing.type = type;
          existing.hash = hash;
          existing.updatedAt = now;
          existing.text = text;
          song = existing;
        } else {
          song = {
            id: uid(),
            name: baseName(file.name) || file.name,
            file: file.name,
            size: file.size,
            type,
            artist: '',
            key: '',
            tags: [],
            fav: false,
            added: now,
            updatedAt: now,
            source: 'local',
            hash,
            text
          };
        }

        setProgress((index + 0.9) / files.length, 'Salvando ' + file.name + '…');
        await storeFile(song, blob, text);
        buildHay(song);

        if (existing) {
          updated++;
        } else {
          songs.push(song);
          imported++;
        }

        if (!text && type !== 'doc' && type !== 'image') withoutText++;
      } catch (err) {
        console.error('Falha ao importar ' + file.name, err);
        if (existing && before) {
          Object.assign(existing, before);
          buildHay(existing);
        }
        failed++;
      }

      setProgress((index + 1) / files.length, 'Importando ' + (index + 1) + ' de ' + files.length + '…');
    }

    const parts = [];
    if (imported) parts.push(imported + ' importada(s)');
    if (updated) parts.push(updated + ' atualizada(s)');
    if (withoutText) parts.push(withoutText + ' sem texto pesquisável');
    if (failed) parts.push(failed + ' com erro');
    toast(parts.length ? parts.join(' · ') : 'Nenhum arquivo foi importado.', failed ? 'error' : '');
  } catch (err) {
    console.error('Falha na importação', err);
    toast('Não foi possível concluir a importação.', 'error');
  } finally {
    setProgress(null);
    importing = false;
    if (!db && !storageWarningShown) {
      storageWarningShown = true;
      toast('Armazenamento local indisponível: os dados valem só nesta sessão.', 'error');
    }
    render();
  }
}

/* ============================================================
   Lista e busca
   ============================================================ */
function filtered() {
  const terms = norm(q).split(/\s+/).filter(Boolean);

  return songs.filter((song) => {
    if (tag) {
      if (tag === '★') {
        if (!song.fav) return false;
      } else if (!(song.tags || []).includes(tag)) {
        return false;
      }
    }
    if (!terms.length) return true;
    return terms.every((word) => (song._hay || '').includes(word));
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
}

function songRow(song) {
  return `<div class="row" data-song="${song.id}">
    <button class="star ${song.fav ? 'on' : ''}" data-act="fav" data-song="${song.id}"
      aria-label="${song.fav ? 'Remover dos favoritos' : 'Marcar como favorita'}" title="Favorita">${song.fav ? '★' : '☆'}</button>
    <button class="main" data-act="open" data-song="${song.id}">
      <span class="name">${esc(song.name)}${song.missing ? ' <span class="file-badge" title="Arquivo não encontrado na pasta">⚠</span>' : ''}</span>
      <span class="sub">${esc(subtitle(song))}</span>
    </button>
    ${song.key ? `<span class="key">${esc(song.key)}</span>` : ''}
    <button class="icon-btn" data-act="edit" data-song="${song.id}"
      aria-label="Editar ${esc(song.name)}" title="Editar">⋯</button>
  </div>`;
}

function render() {
  $('#tabLibrary').classList.toggle('on', view === 'lib');
  $('#tabLists').classList.toggle('on', view === 'lists');
  $('#tabLibrary').setAttribute('aria-selected', view === 'lib' ? 'true' : 'false');
  $('#tabLists').setAttribute('aria-selected', view === 'lists' ? 'true' : 'false');
  $('#searchWrap').hidden = view !== 'lib';
  $('#count').textContent = songs.length + (songs.length === 1 ? ' cifra' : ' cifras');

  if (view === 'lib') {
    renderLibrary();
  } else {
    renderListsView();
  }
}

function renderLibrary() {
  if (tag && tag !== '★' && !songs.some((song) => (song.tags || []).includes(tag))) {
    tag = '';
  }
  const tags = Array.from(new Set(songs.flatMap((song) => song.tags || [])))
    .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));
  const visible = filtered();
  const mapped = songs.filter((song) => song.folderPath).length;
  const folderName = dirHandle ? dirHandle.name : (pendingDirHandle ? pendingDirHandle.name : '');

  $('#main').innerHTML = `
    <div class="bar">
      <button class="primary" data-act="open-folder">📁 Pasta das cifras</button>
      <button data-act="import">＋ Importar arquivos</button>
    </div>
    <p class="hint folder-line">
      ${folderName
        ? `Pasta: <strong>${esc(folderName)}</strong> · ${mapped} arquivo(s) listado(s)${dirHandle ? '' : ' · acesso precisa ser liberado'}`
        : 'Escolha a pasta do tablet para listar PDF, DOCX, DOC e imagens sem importar.'}
    </p>
    ${songs.length ? `<div class="chips">${['★', ...tags].map((tagName) => `
      <button class="chip ${tag === tagName ? 'on' : ''}" data-tag="${esc(tagName)}">${esc(tagName)}</button>
    `).join('')}</div>` : ''}
    ${visible.length
      ? visible.map(songRow).join('')
      : `<div class="empty">${songs.length
        ? 'Nada encontrado com essa busca ou etiqueta.'
        : '<strong>Sua biblioteca está vazia.</strong><br>Escolha a pasta onde já estão as cifras para listá-las automaticamente.<br><br><button class="primary" data-act="open-folder">📁 Escolher a pasta</button>'}</div>`}
  `;
}

function addResultsHtml(list) {
  const terms = norm(addQ[list.id] || '').split(/\s+/).filter(Boolean);
  const matches = songs
    .filter((song) => !list.items.includes(song.id) && terms.every((word) => (song._hay || '').includes(word)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }))
    .slice(0, 30);

  if (!matches.length) {
    return '<div class="hint" style="padding:6px 4px">Nenhuma música encontrada.</div>';
  }

  return matches.map((song) => `
    <div class="row" data-song="${song.id}">
      <button class="main" data-act="add-to-list" data-list="${list.id}" data-song="${song.id}">
        <span class="name">${esc(song.name)}</span>
        <span class="sub">${esc(subtitle(song))}</span>
      </button>
      ${song.key ? `<span class="key">${esc(song.key)}</span>` : ''}
      <button class="primary" data-act="add-to-list" data-list="${list.id}" data-song="${song.id}"
        aria-label="Adicionar ${esc(song.name)}">＋</button>
    </div>
  `).join('');
}

function listCard(list) {
  const expanded = openList === list.id;
  const editing = expanded && editingList === list.id;
  const rows = list.items.map((songId, index) => {
    const song = songById(songId);
    if (!song) return '';
    const content = `<span class="name">${esc(song.name)}</span>
        <span class="sub">${esc(song.artist || (song.type ? song.type.toUpperCase() : ''))}</span>`;
    return `<div class="row ${editing ? 'editing' : ''}" data-list="${list.id}" data-song="${song.id}" data-index="${index}">
      <span class="index">${index + 1}</span>
      ${editing
        ? `<div class="main edit-target" aria-label="Arraste para reordenar ${esc(song.name)}">${content}</div>`
        : `<button class="main" data-act="play-list-song" data-list="${list.id}" data-index="${index}">${content}</button>`}
      ${song.key ? `<span class="key">${esc(song.key)}</span>` : ''}
      ${editing ? `<div class="actions">
        <button class="icon-btn danger" data-act="remove-from-list" data-list="${list.id}" data-index="${index}" aria-label="Remover do repertório">✕</button>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="list-card">
    <div class="row list-head" data-act="toggle-list" data-list="${list.id}">
      <button class="main" data-act="toggle-list" data-list="${list.id}" aria-expanded="${expanded}">
        <span class="name"><span class="list-caret" aria-hidden="true">${expanded ? '▾' : '▸'}</span> ${esc(list.name)}</span>
        <span class="sub">${list.items.length} música(s)${editing ? ' · editando' : (expanded ? '' : ' · toque para abrir')}</span>
      </button>
      <div class="actions" data-act="noop">
        <button class="primary" data-act="play-list" data-list="${list.id}" aria-label="Tocar repertório">▶<span class="label"> Tocar</span></button>
        <button data-act="edit-list" data-list="${list.id}">${editing ? 'Concluir' : 'Editar'}</button>
        <button data-act="export-list" data-list="${list.id}" ${list.items.length ? '' : 'disabled'}
          aria-label="Exportar repertório em zip" title="Exportar repertório">⤓<span class="label"> Exportar</span></button>
        <button class="danger" data-act="delete-list" data-list="${list.id}" aria-label="Excluir repertório">🗑</button>
      </div>
    </div>
    ${expanded ? (rows
      ? `<div class="list-songs">${rows}</div>
        ${editing ? '<p class="hint drag-hint">Segure e arraste a música para reordenar. Toque em ✕ para remover.</p>' : ''}`
      : '<div class="empty" style="padding:22px 12px">Repertório vazio. Toque em Editar para adicionar músicas.</div>') : ''}
    ${editing ? `<div class="add-box">
      <input type="search" data-addq="${list.id}" placeholder="Digite para buscar e adicionar…"
        value="${esc(addQ[list.id] || '')}" autocomplete="off" aria-label="Buscar músicas para adicionar">
      <div class="add-results" data-results="${list.id}">${addResultsHtml(list)}</div>
    </div>` : ''}
  </div>`;
}

function renderListsView() {
  $('#main').innerHTML = `
    <div class="bar">
      <input type="text" id="newListName" placeholder="Nome do novo repertório (ex.: Culto domingo)" autocomplete="off">
      <button class="primary" data-act="create-list">Criar</button>
    </div>
    ${lists.length ? lists.map(listCard).join('') : '<div class="empty">Nenhum repertório ainda.<br>Crie um para organizar as músicas de cada culto.</div>'}
  `;
}

/* ============================================================
   Ações da lista de cifras e repertórios
   ============================================================ */
async function toggleFav(song) {
  song.fav = !song.fav;
  song.updatedAt = Date.now();
  try {
    await saveMeta(song);
    render();
  } catch (err) {
    console.error(err);
    toast('Não foi possível salvar a favorita.', 'error');
  }
}

function openFromLibrary(song) {
  const visible = filtered();
  queue = visible.map((item) => item.id);
  qi = queue.indexOf(song.id);
  if (qi < 0) {
    queue = [song.id];
    qi = 0;
  }
  openViewer();
}

function playList(list) {
  queue = list.items.filter((id) => songById(id));
  if (!queue.length) {
    toast('Este repertório está vazio.');
    return;
  }
  qi = 0;
  openViewer();
}

function playListSong(list, songId) {
  queue = list.items.filter((id) => songById(id));
  qi = queue.indexOf(songId);
  if (qi < 0) {
    queue = [songId];
    qi = 0;
  }
  openViewer();
}

async function createList() {
  const input = $('#newListName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }

  const list = {
    id: uid(),
    name,
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    await putOne('lists', list);
    lists.push(list);
    openList = list.id;
    editingList = list.id;
    rememberOpenList();
    addQ[list.id] = '';
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector('[data-addq="' + list.id + '"]');
      if (field) field.focus();
    });
  } catch (err) {
    console.error(err);
    toast('Não foi possível criar o repertório.', 'error');
  }
}

function rememberOpenList() {
  try {
    if (openList) sessionStorage.setItem(OPEN_LIST_KEY, openList);
    else sessionStorage.removeItem(OPEN_LIST_KEY);
  } catch (err) { /* ignore */ }
}

function focusAddField(listId) {
  requestAnimationFrame(() => {
    const field = document.querySelector('[data-addq="' + listId + '"]');
    if (field) field.focus();
  });
}

async function toggleList(list) {
  const opening = openList !== list.id;
  openList = opening ? list.id : null;
  if (!opening && editingList === list.id) editingList = null;
  if (opening && editingList && editingList !== list.id) editingList = null;
  rememberOpenList();
  render();
}

async function toggleEditList(list) {
  if (editingList === list.id) {
    editingList = null;
    render();
    return;
  }
  openList = list.id;
  editingList = list.id;
  rememberOpenList();
  if (!addQ[list.id]) addQ[list.id] = '';
  render();
  focusAddField(list.id);
}

async function addToLibraryList(list, songId) {
  if (list.items.includes(songId)) return;
  list.items.push(songId);
  list.updatedAt = Date.now();
  try {
    await putOne('lists', list);
    addQ[list.id] = '';
    render();
    focusAddField(list.id);
  } catch (err) {
    console.error(err);
    toast('Não foi possível adicionar a música.', 'error');
  }
}

function dragAfterRow(container, y, draggedRow) {
  const rows = Array.from(container.querySelectorAll('.row[data-index]'))
    .filter((row) => row !== draggedRow && !row.classList.contains('dragging'));
  let closest = { offset: -Infinity, row: null };
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, row };
    }
  }
  return closest.row;
}

async function reorderList(list, orderedIds) {
  const visible = new Set(orderedIds);
  let next = 0;
  const items = list.items.map((id) => (visible.has(id) ? orderedIds[next++] : id));
  if (items.every((id, index) => id === list.items[index])) {
    render();
    return;
  }
  list.items = items;
  list.updatedAt = Date.now();
  try {
    await putOne('lists', list);
    render();
    toast('Ordem atualizada.');
  } catch (err) {
    console.error(err);
    render();
    toast('Não foi possível salvar a nova ordem.', 'error');
  }
}

async function removeListItem(list, index) {
  list.items.splice(index, 1);
  list.updatedAt = Date.now();
  try {
    await putOne('lists', list);
    render();
  } catch (err) {
    console.error(err);
    toast('Não foi possível remover a música.', 'error');
  }
}

async function deleteList(list) {
  if (!confirm('Excluir o repertório "' + list.name + '"? As cifras continuam na biblioteca.')) return;
  try {
    await deleteOne('lists', list.id);
    lists = lists.filter((item) => item.id !== list.id);
    if (openList === list.id) {
      openList = null;
      rememberOpenList();
    }
    if (editingList === list.id) editingList = null;
    render();
    toast('Repertório excluído.');
  } catch (err) {
    console.error(err);
    toast('Não foi possível excluir o repertório.', 'error');
  }
}

/* ============================================================
   Exportação de repertório (zip)
   ============================================================ */
function openExportModal(list) {
  if (!list.items.length) {
    toast('Este repertório está vazio.');
    return;
  }
  pendingExport = null;

  const found = list.items.map(songById).filter(Boolean);
  const pdfSongs = found.filter((song) => song.type === 'pdf');
  const otherSongs = found.filter((song) => song.type !== 'pdf');
  const total = found.reduce((sum, song) => sum + (Number(song.size) || 0), 0);
  const missing = list.items.length - found.length;
  const big = total > MAX_ZIP_BYTES;

  $('#modalBody').innerHTML = `
    <h2 id="modalTitle">Exportar repertório</h2>
    <div class="file-name">${esc(list.name)}</div>
    <p class="export-info">
      ${found.length} música(s) · ${formatBytes(total)} no total.
    </p>
    ${big ? `<p class="export-info export-warn">Repertório grande: o tablet pode demorar e precisar de memória. Se falhar, exporte em partes.</p>` : ''}
    ${missing ? `<p class="export-info export-warn">${missing} música(s) não estão mais na biblioteca e ficarão de fora.</p>` : ''}

    <h3 class="export-title">Zip com os arquivos originais</h3>
    <p class="export-info">Reúne PDFs, DOCs e imagens como estão, na ordem do repertório. Nada é alterado.</p>
    <div class="modal-actions">
      <button class="primary grow" data-act="export-zip-download" data-list="${list.id}">⤓ Baixar .zip</button>
      <button data-act="export-zip-share" data-list="${list.id}">Compartilhar</button>
    </div>

    <h3 class="export-title">PDF único${otherSongs.length ? ' (somente PDFs)' : ''}</h3>
    <p class="export-info">
      Junta as cifras em um só PDF, na ordem do repertório, bom para ler, imprimir ou enviar pelo celular.
      ${pdfSongs.length ? '' : '<br><strong>Este repertório não tem nenhuma cifra em PDF.</strong>'}
    </p>
    ${otherSongs.length ? `<p class="export-info export-warn">Ficarão de fora do PDF único (${otherSongs.length}): ${esc(otherSongs.slice(0, 8).map((song) => song.name).join(', '))}${otherSongs.length > 8 ? '…' : ''}. Use o zip para levá-las.</p>` : ''}
    <div class="modal-actions">
      <button class="primary grow" data-act="export-pdf-download" data-list="${list.id}" ${pdfSongs.length ? '' : 'disabled'}>⤓ Baixar .pdf</button>
      <button data-act="export-pdf-share" data-list="${list.id}" ${pdfSongs.length ? '' : 'disabled'}>Compartilhar</button>
    </div>

    <div class="modal-actions">
      <button data-act="cancel-export">Cancelar</button>
    </div>
  `;
  showModal();
}

async function buildListZip(list, onProgress) {
  if (!window.JSZip) throw new Error('JSZip não carregado');

  const songs = [];
  const missing = [];
  for (let index = 0; index < list.items.length; index++) {
    const song = songById(list.items[index]);
    if (!song) {
      missing.push('(removida da biblioteca)');
      continue;
    }
    const record = await resolveBlob(song);
    if (!record) {
      missing.push(song.name);
      continue;
    }
    songs.push({ song, blob: record });
    if (onProgress) {
      onProgress(
        (index + 1) / list.items.length * 0.35,
        'Lendo ' + (index + 1) + ' de ' + list.items.length + ': ' + song.name
      );
    }
  }

  if (!songs.length) throw new Error('Nenhum arquivo encontrado neste aparelho.');

  const zip = new JSZip();
  const used = new Set();
  for (let index = 0; index < songs.length; index++) {
    const { song, blob } = songs[index];
    const extension = extensionOf(song);
    const base = sanitizeFileName(
      String(song.name || baseName(song.file) || 'cifra').replace(/\.(pdf|docx?|png|jpe?g|webp)$/i, '')
    );
    const prefix = String(index + 1).padStart(2, '0') + ' - ';
    let name = prefix + base + extension;
    let duplicate = 2;
    while (used.has(name.toLowerCase())) {
      name = prefix + base + ' (' + duplicate++ + ')' + extension;
    }
    used.add(name.toLowerCase());
    zip.file(name, blob, { compression: 'STORE' });
    if (onProgress) {
      onProgress(
        0.35 + (index + 1) / songs.length * 0.25,
        'Adicionando ' + (index + 1) + ' de ' + songs.length + '…'
      );
    }
  }

  const filename = sanitizeFileName(list.name || 'repertorio') + ' - cifras.zip';
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => {
      if (onProgress) {
        onProgress(0.6 + (meta.percent / 100) * 0.4, 'Montando o zip… ' + Math.round(meta.percent) + '%');
      }
    }
  );

  return { blob, filename, count: songs.length, missing };
}

async function exportListZip(list, action) {
  if (exporting) {
    toast('Aguarde a exportação atual terminar.', 'error');
    return;
  }

  exporting = true;
  try {
    const result = await buildListZip(list, (fraction, message) => setProgress(fraction, message));
    pendingExport = { kind: 'zip', filename: result.filename, blob: result.blob };

    if (action === 'download') {
      downloadBlob(result.blob, result.filename);
      closeModal();
      const note = result.missing.length
        ? ' Ficaram de fora: ' + result.missing.join(', ') + '.'
        : '';
      toast('Zip baixado: ' + result.count + ' arquivo(s), ' + formatBytes(result.blob.size) + '.' + note,
        result.missing.length ? 'error' : '');
    } else {
      openExportReadyModal(result.filename, result.blob, result.count,
        result.missing.length ? 'Ficaram de fora: ' + result.missing.join(', ') : '');
    }
  } catch (err) {
    console.error('Falha ao montar o zip', err);
    toast(err && err.message ? err.message : 'Não foi possível montar o zip.', 'error');
  } finally {
    exporting = false;
    setProgress(null);
  }
}

/* ---------- PDF único ---------- */
async function pdfBytesForSong(song, onProgress) {
  let raw;
  if (currentBlobSongId === song.id && currentBlob) {
    raw = await currentBlob.arrayBuffer();
  } else {
    const record = await resolveBlob(song);
    if (!record) return null;
    raw = await record.arrayBuffer();
  }

  // Copia os bytes sem abrir o PDF no pdf.js, para preservar cifras escritas à mão.
  const fresh = new Uint8Array(raw);
  try {
    const document = await PDFLib.PDFDocument.load(fresh, { ignoreEncryption: true });
    // Se o PDF tiver páginas rotacionadas, congela a rotação nas páginas para o merge sair correto.
    const rotated = document.getPages().filter((page) => page.getRotation().angle % 360 !== 0).length;
    if (rotated) return await document.save();
  } catch (err) {
    if (onProgress) onProgress(null, song.name + ': não foi possível ler, ficará de fora.');
    return null;
  }
  return raw;
}

async function buildListPdf(list, onProgress) {
  if (!window.PDFLib) throw new Error('pdf-lib não carregado');

  const songs = [];
  const missing = [];
  const skipped = [];

  for (let index = 0; index < list.items.length; index++) {
    const song = songById(list.items[index]);
    if (!song) {
      missing.push('(removida da biblioteca)');
      continue;
    }
    if (song.type !== 'pdf') {
      skipped.push(song.name);
      continue;
    }
    const bytes = await pdfBytesForSong(song, onProgress);
    if (!bytes) {
      skipped.push(song.name);
      continue;
    }
    songs.push({ song, bytes });
    if (onProgress) {
      onProgress(
        (index + 1) / list.items.length * 0.35,
        'Lendo ' + (index + 1) + ' de ' + list.items.length + ': ' + song.name
      );
    }
  }

  if (!songs.length) throw new Error('Nenhuma cifra em PDF pôde ser usada.');

  const merged = await PDFLib.PDFDocument.create();
  for (let index = 0; index < songs.length; index++) {
    const { song, bytes } = songs[index];
    const source = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    if (onProgress) {
      onProgress(
        0.35 + (index + 1) / songs.length * 0.55,
        'Juntando ' + (index + 1) + ' de ' + songs.length + ': ' + song.name
      );
    }
  }

  if (onProgress) onProgress(0.92, 'Gerando o PDF…');
  const bytes = await merged.save({ useObjectStreams: true });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const filename = sanitizeFileName(list.name || 'repertorio') + ' - cifras.pdf';

  return {
    blob,
    filename,
    count: songs.length,
    missing,
    skipped,
    notes: skipped.length ? 'Ficaram de fora (não são PDF): ' + skipped.join(', ') : ''
  };
}

async function exportListPdf(list, action) {
  if (exporting) {
    toast('Aguarde a exportação atual terminar.', 'error');
    return;
  }

  exporting = true;
  try {
    const result = await buildListPdf(list, (fraction, message) => {
      if (fraction == null) {
        toast(message, 'error');
        return;
      }
      setProgress(fraction, message);
    });
    pendingExport = { kind: 'pdf', filename: result.filename, blob: result.blob };

    if (action === 'download') {
      downloadBlob(result.blob, result.filename);
      closeModal();
      toast('PDF baixado: ' + result.count + ' cifra(s), ' + formatBytes(result.blob.size) + '.' +
        (result.notes ? ' ' + result.notes + '.' : ''), result.notes ? 'error' : '');
    } else {
      openExportReadyModal(result.filename, result.blob, result.count, result.notes);
    }
  } catch (err) {
    console.error('Falha ao montar o PDF único', err);
    toast(err && err.message ? err.message : 'Não foi possível montar o PDF único.', 'error');
  } finally {
    exporting = false;
    setProgress(null);
  }
}

function openExportReadyModal(filename, blob, count, note) {
  $('#modalBody').innerHTML = `
    <h2 id="modalTitle">Arquivo pronto</h2>
    <div class="file-name">${esc(filename)}</div>
    <p class="export-info">${count} cifra(s) · ${formatBytes(blob.size)}</p>
    ${note ? `<p class="export-info export-warn">${esc(note)}</p>` : ''}
    <div class="modal-actions">
      <button class="primary grow" data-act="share-export">Compartilhar</button>
      <button data-act="download-export">Baixar</button>
      <button data-act="cancel-export">Fechar</button>
    </div>
  `;
  showModal();
}

async function sharePendingExport() {
  if (!pendingExport) return;
  const { blob, filename, kind } = pendingExport;
  const file = new File([blob], filename, {
    type: kind === 'pdf' ? 'application/pdf' : 'application/zip'
  });

  let canShare = false;
  try {
    canShare = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch (err) {
    canShare = false;
  }

  if (canShare) {
    try {
      await navigator.share({ files: [file], title: filename });
      closeModal();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('Compartilhamento do arquivo indisponível, baixando.', err);
    }
  }

  downloadBlob(blob, filename);
  closeModal();
  toast('Compartilhamento indisponível: o arquivo foi baixado.');
}

function showModal() {
  $('#modal').classList.add('show');
  $('#modal').setAttribute('aria-hidden', 'false');
}

/* ============================================================
   Edição de metadados
   ============================================================ */
function openEdit(song) {
  editingSongId = song.id;
  $('#modalBody').innerHTML = `
    <h2 id="modalTitle">Editar cifra</h2>
    <div class="file-name">${esc(song.file)}</div>
    <label for="editName">Nome</label>
    <input id="editName" type="text" value="${esc(song.name)}">
    <label for="editArtist">Artista</label>
    <input id="editArtist" type="text" value="${esc(song.artist)}">
    <label for="editKey">Tom</label>
    <input id="editKey" type="text" value="${esc(song.key)}" placeholder="G, Am, F#…">
    <label for="editTags">Etiquetas (separadas por vírgula)</label>
    <input id="editTags" type="text" value="${esc((song.tags || []).join(', '))}" placeholder="louvor, adoração, Natal">
    <div class="modal-actions">
      <button class="primary grow" data-act="save-edit">Salvar</button>
      <button data-act="cancel-edit">Cancelar</button>
      <button class="danger" data-act="delete-song">Excluir</button>
    </div>
  `;
  $('#modal').classList.add('show');
  $('#modal').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    const nameInput = $('#editName');
    if (nameInput) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
    }
  });
}

function closeModal() {
  $('#modal').classList.remove('show');
  $('#modal').setAttribute('aria-hidden', 'true');
  editingSongId = null;
  pendingExport = null;
}

async function saveEdit() {
  const song = songById(editingSongId);
  if (!song) {
    closeModal();
    return;
  }
  const name = $('#editName').value.trim();
  if (!name) {
    $('#editName').focus();
    toast('O nome não pode ficar vazio.', 'error');
    return;
  }
  song.name = name;
  song.artist = $('#editArtist').value.trim();
  song.key = $('#editKey').value.trim();
  song.tags = Array.from(new Set(
    $('#editTags').value.split(',').map((item) => item.trim()).filter(Boolean)
  ));
  song.updatedAt = Date.now();
  buildHay(song);

  try {
    await saveMeta(song);
    closeModal();
    render();
    toast('Cifra atualizada.');
  } catch (err) {
    console.error(err);
    toast('Não foi possível salvar as alterações.', 'error');
  }
}

async function deleteSong(song) {
  const count = lists.filter((list) => list.items.includes(song.id)).length;
  const mapped = Boolean(song.folderPath) || song.source === 'folder';
  const warning = (mapped
    ? 'Remover "' + song.name + '" da biblioteca?\n\nO arquivo original NÃO será apagado da pasta do tablet.'
    : 'Excluir "' + song.name + '" do aparelho?') +
    (count ? '\n\nEla também será removida de ' + count + ' repertório(s).' : '');
  if (!confirm(warning)) return;

  try {
    // Cifras mapeadas não são apagadas do tablet; ficam ocultas para não voltar na próxima leitura.
    if (mapped && song.folderPath) hideFolderPath(song.folderPath);
    const updatedLists = await deleteSongRecord(song.id);
    songs = songs.filter((item) => item.id !== song.id);
    for (const updated of updatedLists) {
      const index = lists.findIndex((list) => list.id === updated.id);
      if (index >= 0) lists[index] = updated;
    }
    closeModal();
    render();
    toast(mapped ? 'Removida da biblioteca. O arquivo continua na pasta.' : 'Cifra excluída.');
  } catch (err) {
    console.error(err);
    toast('Não foi possível excluir a cifra.', 'error');
  }
}

/* ============================================================
   Visualizador (modo palco)
   ============================================================ */
function pageWidth() {
  const width = viewerBodyWidth();
  return Math.min(4000, Math.max(160, (width - 16) * zoom));
}

function viewerBodyWidth() {
  const body = $('#viewerBody');
  return body.clientWidth || 360;
}

function destroyPdfDoc(doc) {
  if (!doc) return;
  try {
    const result = doc.destroy();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (err) { /* ignore */ }
}

function resetPdf() {
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
  for (const record of renderedPages.values()) {
    if (record.task) {
      try { record.task.cancel(); } catch (err) { /* ignore */ }
    }
  }
  renderedPages.clear();
  renderingPages.clear();
  pageElements = [];
  if (currentDoc) {
    destroyPdfDoc(currentDoc);
    currentDoc = null;
  }
}

async function openViewer() {
  if (!queue.length) return;
  viewerOpen = true;
  const viewer = $('#viewer');
  viewer.classList.add('show');
  viewer.setAttribute('aria-hidden', 'false');
  await showSong();
}

function closeViewer() {
  viewerOpen = false;
  renderGeneration++;
  resetPdf();
  currentBlob = null;
  currentBlobSongId = null;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  const viewer = $('#viewer');
  viewer.classList.remove('show');
  viewer.setAttribute('aria-hidden', 'true');
  $('#viewerBody').innerHTML = '';
  $('#viewerTitle').textContent = '';
}

async function showSong() {
  const song = currentSong();
  if (!song) {
    closeViewer();
    return;
  }

  const token = ++renderGeneration;
  resetPdf();
  currentBlob = null;
  currentBlobSongId = null;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  const body = $('#viewerBody');
  body.scrollTop = 0;
  body.classList.toggle('invert', invert);
  body.innerHTML = '<div class="viewer-msg">Carregando…</div>';
  $('#viewerTitle').textContent =
    (queue.length > 1 ? (qi + 1) + '/' + queue.length + ' · ' : '') +
    song.name + (song.key ? ' · ' + song.key : '');

  if (song.missing) {
    body.innerHTML = '<div class="viewer-msg">O arquivo não está mais na pasta.<br>' +
      'Se ele foi movido ou renomeado, toque em “📁 Pasta das cifras” e depois em “Atualizar lista”.</div>';
    return;
  }

  let blob;
  try {
    blob = await loadFile(song);
  } catch (err) {
    console.error(err);
  }

  if (token !== renderGeneration) return;

  if (!blob) {
    body.innerHTML = song.folderPath
      ? '<div class="viewer-msg">O arquivo não foi encontrado na pasta.<br>' +
        'Toque em “📁 Pasta das cifras” e depois em “Atualizar lista”.</div>'
      : '<div class="viewer-msg">O arquivo não foi encontrado neste aparelho.<br>Importe novamente.</div>';
    return;
  }

  currentBlob = blob;
  currentBlobSongId = song.id;

  try {
    if (song.type === 'pdf') {
      if (!window.pdfjsLib) throw new Error('pdf.js não carregado');
      const doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
      if (token !== renderGeneration) {
        destroyPdfDoc(doc);
        return;
      }
      currentDoc = doc;
      await setupPdf(doc, token);
    } else if (song.type === 'docx') {
      if (!window.mammoth) throw new Error('mammoth não carregado');
      const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      if (token !== renderGeneration) return;
      body.innerHTML = '<div class="doc" style="font-size:' + (16 * zoom) + 'px">' +
        sanitizeHtml(result.value) + '</div>';
    } else if (song.type === 'image') {
      currentObjectUrl = URL.createObjectURL(blob);
      const wrap = document.createElement('div');
      wrap.className = 'image-view';
      const image = document.createElement('img');
      image.src = currentObjectUrl;
      image.alt = song.name;
      wrap.appendChild(image);
      body.innerHTML = '';
      body.appendChild(wrap);
      applyImageZoom();
    } else {
      body.innerHTML = '<div class="viewer-msg">Arquivos .doc antigos não abrem no navegador.<br>' +
        'Use “✎ Abrir” para baixar e edite no Word, salvando como .docx ou PDF.</div>';
    }

    // Prepara a busca pelo texto aos poucos, sem atrasar a abertura.
    if (song.folderPath && !song.text && (song.type === 'pdf' || song.type === 'docx')) {
      setTimeout(() => { indexSongText(songById(song.id) || song); }, 1200);
    }
  } catch (err) {
    console.error('Falha ao abrir a cifra', err);
    if (token === renderGeneration) {
      body.innerHTML = '<div class="viewer-msg">Não foi possível abrir este arquivo.<br>' +
        'Tente baixá-lo com “✎ Abrir”.</div>';
    }
  }
}

function sanitizeHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attr.name);
      }
    }
    if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
  });
  return parsed.body.innerHTML;
}

async function setupPdf(doc, token) {
  const first = await doc.getPage(1);
  if (token !== renderGeneration) return;
  const firstViewport = first.getViewport({ scale: 1 });
  const ratio = firstViewport.width / firstViewport.height;
  try { first.cleanup(); } catch (err) { /* ignore */ }

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-pages';
  const width = pageWidth();

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    page.dataset.page = String(pageNumber);
    page.style.width = width + 'px';
    page.style.aspectRatio = ratio + '';
    page.setAttribute('aria-label', 'Página ' + pageNumber);
    const number = document.createElement('span');
    number.className = 'page-num';
    number.textContent = 'Página ' + pageNumber;
    page.appendChild(number);
    wrapper.appendChild(page);
    pageElements.push(page);
  }

  const body = $('#viewerBody');
  body.innerHTML = '';
  body.appendChild(wrapper);

  pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        renderPage(entry.target, token, false);
      } else {
        releasePage(entry.target);
      }
    }
  }, { root: body, rootMargin: '800px 0px', threshold: 0 });

  pageElements.forEach((page) => pageObserver.observe(page));
}

function addPageNumber(page, pageNumber) {
  if (page.querySelector('.page-num')) return;
  const number = document.createElement('span');
  number.className = 'page-num';
  number.textContent = 'Página ' + pageNumber;
  page.appendChild(number);
}

function isPageNear(page) {
  if (!viewerOpen || !page || !page.isConnected) return false;
  const body = $('#viewerBody');
  if (!body) return false;
  const rect = body.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  return pageRect.bottom > rect.top - 900 && pageRect.top < rect.bottom + 900;
}

async function renderPage(page, token, force) {
  if (token !== renderGeneration || !currentDoc || !viewerOpen) return;
  const pageNumber = Number(page.dataset.page);
  if (!pageNumber) return;
  const renderKey = token + ':' + pageNumber;
  if (renderingPages.has(renderKey)) return;
  renderingPages.add(renderKey);

  try {
    const existing = renderedPages.get(pageNumber);
    if (existing && !force) return;
    if (existing) {
      if (existing.task) {
        try { existing.task.cancel(); } catch (err) { /* ignore */ }
      }
      existing.canvas.remove();
      renderedPages.delete(pageNumber);
      page.classList.remove('rendered');
    }

    let pdfPage;
    try {
      pdfPage = await currentDoc.getPage(pageNumber);
    } catch (err) {
      return;
    }
    if (token !== renderGeneration || !currentDoc || !isPageNear(page)) {
      try { pdfPage.cleanup(); } catch (err) { /* ignore */ }
      addPageNumber(page, pageNumber);
      return;
    }

    const base = pdfPage.getViewport({ scale: 1 });
    const width = pageWidth();
    const cssHeight = width * base.height / base.width;
    page.style.width = width + 'px';
    page.style.aspectRatio = base.width + ' / ' + base.height;

    const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
    let renderScale = deviceScale;
    if (width * cssHeight * deviceScale * deviceScale > MAX_CANVAS_PIXELS) {
      renderScale = Math.max(0.5, Math.sqrt(MAX_CANVAS_PIXELS / (width * cssHeight)));
    }

    const viewport = pdfPage.getViewport({ scale: (width * renderScale) / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Página ' + pageNumber + ' da cifra');

    const context = canvas.getContext('2d');
    if (!context) {
      try { pdfPage.cleanup(); } catch (err) { /* ignore */ }
      return;
    }
    // O fundo da página é branco; sem isso, áreas transparentes do PDF ficariam escuras.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const record = { canvas, page: pdfPage, task: null };
    renderedPages.set(pageNumber, record);

    const number = page.querySelector('.page-num');
    if (number) number.remove();
    page.appendChild(canvas);
    page.classList.add('rendered');

    try {
      record.task = pdfPage.render({ canvasContext: context, viewport });
      await record.task.promise;
    } catch (err) {
      if (!err || err.name !== 'RenderingCancelledException') {
        console.warn('Falha ao desenhar a página ' + pageNumber, err);
      }
      if (renderedPages.get(pageNumber) === record) {
        canvas.remove();
        renderedPages.delete(pageNumber);
        page.classList.remove('rendered');
        addPageNumber(page, pageNumber);
      }
      return;
    } finally {
      try { pdfPage.cleanup(); } catch (err) { /* ignore */ }
    }

    if (renderedPages.get(pageNumber) === record) record.task = null;
  } finally {
    renderingPages.delete(renderKey);
  }
}

function releasePage(page) {
  const pageNumber = Number(page.dataset.page);
  const record = renderedPages.get(pageNumber);
  if (!record) return;
  if (record.task) {
    try { record.task.cancel(); } catch (err) { /* ignore */ }
  }
  record.canvas.remove();
  renderedPages.delete(pageNumber);
  page.classList.remove('rendered');
  addPageNumber(page, pageNumber);
}

function refreshZoom() {
  if (!viewerOpen) return;
  const body = $('#viewerBody');
  const rect = body.getBoundingClientRect();
  const ratio = body.scrollHeight > body.clientHeight
    ? body.scrollTop / (body.scrollHeight - body.clientHeight)
    : 0;

  if (currentDoc) {
    const token = renderGeneration;
    const width = pageWidth();

    for (const page of pageElements) {
      page.style.width = width + 'px';
    }

    for (const page of pageElements) {
      const pageRect = page.getBoundingClientRect();
      const near = pageRect.bottom > rect.top - 800 && pageRect.top < rect.bottom + 800;
      const rendered = renderedPages.has(Number(page.dataset.page));
      if (!near) {
        if (rendered) releasePage(page);
      } else {
        renderPage(page, token, rendered);
      }
    }
  } else {
    const doc = body.querySelector('.doc');
    if (doc) doc.style.fontSize = (16 * zoom) + 'px';
    applyImageZoom();
  }

  requestAnimationFrame(() => {
    body.scrollTop = ratio * Math.max(0, body.scrollHeight - body.clientHeight);
  });
}

function applyImageZoom() {
  const image = $('#viewerBody .image-view img');
  if (!image) return;
  const width = Math.min(6000, Math.max(160, (viewerBodyWidth() - 16) * zoom));
  image.style.width = width + 'px';
}

function changeZoom(delta) {
  zoom = Math.max(0.5, Math.min(3, Math.round((zoom + delta) * 100) / 100));
  refreshZoom();
}

function stepSong(delta) {
  if (!viewerOpen) return;
  const next = qi + delta;
  if (next < 0 || next >= queue.length) return;
  qi = next;
  showSong();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function fileRecordForCurrent() {
  const song = currentSong();
  if (!song) return null;
  if (currentBlob && currentBlobSongId === song.id) {
    return { song, blob: currentBlob };
  }
  try {
    const blob = await resolveBlob(song);
    if (!blob) {
      toast('Arquivo não encontrado.', 'error');
      return null;
    }
    currentBlob = blob;
    currentBlobSongId = song.id;
    return { song, blob };
  } catch (err) {
    console.error(err);
    toast('Não foi possível ler o arquivo.', 'error');
    return null;
  }
}

async function downloadCurrent() {
  const found = await fileRecordForCurrent();
  if (!found) return;
  downloadBlob(found.blob, found.song.file);
  toast('Arquivo baixado. Edite e reimporte com o mesmo nome para atualizar.');
}

async function shareCurrent() {
  const song = currentSong();
  if (!song) return;

  // Usa o blob já aberto no visualizador para o Safari não perder o gesto do usuário.
  let blob = currentBlobSongId === song.id ? currentBlob : null;
  if (!blob) {
    const found = await fileRecordForCurrent();
    if (!found) return;
    blob = found.blob;
  }

  const type = mimeOf(song.file);
  const file = new File([blob], song.file, { type });

  let canShare = false;
  try {
    canShare = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch (err) {
    canShare = false;
  }

  if (canShare) {
    try {
      await navigator.share({ files: [file], title: song.name, text: song.name });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('Compartilhamento indisponível, baixando arquivo.', err);
    }
  }

  downloadBlob(blob, song.file);
  toast('Compartilhamento indisponível: o arquivo foi baixado.');
}

/* ============================================================
   Eventos
   ============================================================ */
function bindEvents() {
  const main = $('#main');

  $('#search').addEventListener('input', (event) => {
    q = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });

  $('#tabLibrary').addEventListener('click', () => {
    view = 'lib';
    render();
  });

  $('#tabLists').addEventListener('click', () => {
    view = 'lists';
    render();
  });

  $('#themeBtn').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* ignore */ }
  });

  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (err) { /* ignore */ }
    deferredInstall = null;
    $('#installBtn').hidden = true;
  });

  $('#fileInput').addEventListener('change', (event) => {
    importFiles(event.target.files);
    event.target.value = '';
  });

  const folderInput = $('#folderInput');
  if (folderInput) {
    folderInput.addEventListener('change', (event) => {
      importFiles(event.target.files);
      event.target.value = '';
    });
  }

  main.addEventListener('click', async (event) => {
    const tagButton = event.target.closest('[data-tag]');
    if (tagButton) {
      tag = tag === tagButton.dataset.tag ? '' : tagButton.dataset.tag;
      render();
      return;
    }

    const element = event.target.closest('[data-act]');
    if (!element) return;

    const action = element.dataset.act;
    const listEl = element.closest('[data-list]');
    const listId = element.dataset.list || (listEl ? listEl.dataset.list : null);
    const list = listId ? listById(listId) : null;
    const songId = element.dataset.song || (element.closest('[data-song]') ? element.closest('[data-song]').dataset.song : null);
    const song = songId ? songById(songId) : null;
    const indexEl = element.closest('[data-index]');
    const index = indexEl ? Number(indexEl.dataset.index) : -1;

    try {
      switch (action) {
        case 'import':
          $('#fileInput').click();
          break;
        case 'open-folder':
          openFolderModal();
          break;
        case 'fav':
          if (song) await toggleFav(song);
          break;
        case 'open':
          if (song) openFromLibrary(song);
          break;
        case 'edit':
          if (song) openEdit(song);
          break;
        case 'create-list':
          await createList();
          break;
        case 'toggle-list':
          if (list) await toggleList(list);
          break;
        case 'edit-list':
          if (list) await toggleEditList(list);
          break;
        case 'play-list':
          if (list) playList(list);
          break;
        case 'play-list-song':
          if (list && song) playListSong(list, song.id);
          break;
        case 'delete-list':
          if (list) await deleteList(list);
          break;
        case 'export-list':
          if (list) openExportModal(list);
          break;
        case 'add-to-list':
          if (list && song) await addToLibraryList(list, song.id);
          break;
        case 'remove-from-list':
          if (list && index >= 0) await removeListItem(list, index);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(err);
      toast('Algo deu errado. Tente novamente.', 'error');
    }
  });

  main.addEventListener('input', (event) => {
    const input = event.target.closest('[data-addq]');
    if (!input) return;
    const listId = input.dataset.addq;
    addQ[listId] = input.value;
    const list = listById(listId);
    const box = main.querySelector('[data-results="' + listId + '"]');
    if (list && box) box.innerHTML = addResultsHtml(list);
  });

  /* Arrastar e soltar para reordenar (funciona com toque e mouse). */
  main.addEventListener('pointerdown', (event) => {
    if (dragState) return;
    const row = event.target.closest('.row[data-index]');
    if (!row) return;
    const container = row.parentElement;
    const listEl = row.closest('[data-list]');
    const list = listEl ? listById(listEl.dataset.list) : null;
    if (!row || !container || !list || editingList !== list.id) return;
    if (event.target.closest('[data-act="remove-from-list"]')) return;
    if (event.target.closest('[data-act="play-list-song"]')) return;
    if (event.target.closest('a') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea')) return;

    event.preventDefault();
    dragState = {
      row,
      list,
      container,
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false
    };
    row.classList.add('dragging');
    document.body.classList.add('dragging-row');
    try {
      row.setPointerCapture(event.pointerId);
    } catch (err) { /* ignore */ }
  });

  window.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    if (Math.abs(event.clientY - dragState.startY) > 3) dragState.moved = true;

    const edge = 64;
    if (event.clientY < edge) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 14);

    const after = dragAfterRow(dragState.container, event.clientY, dragState.row);
    if (after !== dragState.row.nextElementSibling) {
      dragState.container.insertBefore(dragState.row, after);
    }
  });

  const finishDrag = async (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    state.row.classList.remove('dragging');
    document.body.classList.remove('dragging-row');
    if (!state.moved) return;

    const orderedIds = Array.from(state.container.querySelectorAll('.row[data-index]'))
      .map((row) => row.dataset.song);
    await reorderList(state.list, orderedIds);
  };
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);

  main.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.id === 'newListName') {
      event.preventDefault();
      createList();
    }
  });

  $('#modal').addEventListener('click', async (event) => {
    if (event.target === $('#modal')) {
      closeModal();
      return;
    }
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const action = button.dataset.act;
    try {
      if (action === 'cancel-edit') closeModal();
      else if (action === 'save-edit') await saveEdit();
      else if (action === 'delete-song') {
        const song = songById(editingSongId);
        if (song) await deleteSong(song);
      } else if (action === 'export-zip-download' || action === 'export-zip-share') {
        const list = listById(button.dataset.list);
        if (list) await exportListZip(list, action === 'export-zip-download' ? 'download' : 'share');
      } else if (action === 'export-pdf-download' || action === 'export-pdf-share') {
        const list = listById(button.dataset.list);
        if (list) await exportListPdf(list, action === 'export-pdf-download' ? 'download' : 'share');
      } else if (action === 'share-export') {
        await sharePendingExport();
      } else if (action === 'download-export') {
        if (pendingExport) {
          const { blob, filename } = pendingExport;
          downloadBlob(blob, filename);
          closeModal();
          toast('Arquivo baixado: ' + formatBytes(blob.size) + '.');
        }
      } else if (action === 'cancel-export') {
        closeModal();
      } else if (action === 'folder-pick') {
        const ok = await pickLibraryFolder();
        if (ok) {
          closeModal();
          await scanLibraryFolder();
        }
      } else if (action === 'folder-permission') {
        const ok = await ensureFolderPermission();
        if (ok) {
          closeModal();
          await scanLibraryFolder();
        } else {
          toast('Não foi possível liberar o acesso à pasta.', 'error');
        }
      } else if (action === 'folder-scan') {
        closeModal();
        await scanLibraryFolder();
      } else if (action === 'folder-index') {
        closeModal();
        await indexFolderTexts();
      } else if (action === 'folder-backup') {
        closeModal();
        await exportDbToFolder();
      } else if (action === 'folder-restore') {
        closeModal();
        await importDbFromFolder();
      } else if (action === 'folder-forget') {
        if (confirm('Esquecer a pasta "' +
          ((dirHandle || pendingDirHandle) ? (dirHandle || pendingDirHandle).name : '') +
          '"?\n\nAs cifras continuam na pasta e na biblioteca, mas só abrirão depois de escolher a pasta de novo.')) {
          await forgetLibraryFolder();
          closeModal();
          render();
          toast('Pasta esquecida. Escolha de novo quando quiser.');
        }
      } else if (action === 'folder-import') {
        const input = $('#folderInput') || $('#fileInput');
        if (input) input.click();
      } else if (action === 'folder-unhide') {
        const hidden = hiddenPaths().length;
        setHiddenPaths([]);
        closeModal();
        await scanLibraryFolder();
        toast(hidden + ' arquivo(s) oculto(s) voltaram para a biblioteca.');
      }
    } catch (err) {
      console.error(err);
      toast('Algo deu errado. Tente novamente.', 'error');
    }
  });

  $('#closeViewer').addEventListener('click', closeViewer);
  $('#prevSong').addEventListener('click', () => stepSong(-1));
  $('#nextSong').addEventListener('click', () => stepSong(1));
  $('#zoomOut').addEventListener('click', () => changeZoom(-0.15));
  $('#zoomIn').addEventListener('click', () => changeZoom(0.15));
  $('#invertBtn').addEventListener('click', () => {
    invert = !invert;
    $('#viewerBody').classList.toggle('invert', invert);
  });
  $('#downloadBtn').addEventListener('click', downloadCurrent);
  $('#shareBtn').addEventListener('click', shareCurrent);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if ($('#modal').classList.contains('show')) {
        closeModal();
        return;
      }
      if (viewerOpen) {
        closeViewer();
        return;
      }
    }

    if (!viewerOpen) return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepSong(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepSong(-1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeZoom(0.15);
    } else if (event.key === '-') {
      event.preventDefault();
      changeZoom(-0.15);
    }
  });

  window.addEventListener('resize', () => {
    if (!viewerOpen) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshZoom, 200);
  });

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      importFiles(event.dataTransfer.files);
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    $('#installBtn').hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    $('#installBtn').hidden = true;
    toast('App instalado.');
  });

  const folderBtn = $('#folderBtn');
  if (folderBtn) {
    folderBtn.addEventListener('click', () => openFolderModal());
  }
}

/* ============================================================
   Inicialização
   ============================================================ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('Service worker não registrado.', err);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Nova versão disponível. Feche e abra o app para atualizar.');
  });
}

async function init() {
  bindEvents();

  try {
    openList = sessionStorage.getItem(OPEN_LIST_KEY) || null;
  } catch (err) {
    openList = null;
  }

  const opened = await openDB();
  if (!opened) {
    storageWarningShown = true;
    toast('Armazenamento local indisponível: os dados valem só nesta sessão.', 'error');
  } else {
    await requestPersistence();
  }

  try {
    await loadAll();
  } catch (err) {
    console.error('Falha ao carregar os dados', err);
    try { db.close(); } catch (closeErr) { /* ignore */ }
    db = null;
    toast('Não foi possível ler os dados salvos. O app continua, mas sem os dados antigos.', 'error');
  }

  render();
  registerServiceWorker();

  // Revincula a pasta escolhida e relê os arquivos que estiverem nela.
  try {
    await restoreDirHandle();
    if (dirHandle) {
      await scanLibraryFolder({ silent: true });
    } else if (pendingDirHandle) {
      toast('Toque em 📁 para liberar o acesso à pasta das cifras.');
    }
  } catch (err) {
    console.warn('Pasta das cifras não revinculada.', err);
  }

  if (location.protocol === 'file:') {
    toast('Para instalar como app e funcionar offline, abra por um endereço http(s).', 'error');
  }
}

init();
