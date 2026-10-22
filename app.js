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
const DB_VERSION = 2;
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
  return [song.artist, song.type ? song.type.toUpperCase() : '', ...(song.tags || [])]
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
  return 'application/octet-stream';
}

function baseName(filename) {
  return String(filename || '')
    .replace(/\.(pdf|docx?)$/i, '')
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
    return;
  }
  await tx(store, 'readwrite', (stores) => req(stores[0].put(value)));
}

async function deleteOne(store, key) {
  if (!db) {
    mem[store].delete(key);
    return;
  }
  await tx(store, 'readwrite', (stores) => req(stores[0].delete(key)));
}

function metaOf(song) {
  const { _hay, text, ...meta } = song;
  return meta;
}

async function saveSongRecord(song, blob, text) {
  const meta = metaOf(song);
  if (!db) {
    mem.songs.set(song.id, meta);
    mem.files.set(song.id, { id: song.id, blob });
    mem.texts.set(song.id, { id: song.id, text });
    return;
  }
  await tx(['songs', 'files', 'texts'], 'readwrite', (stores) => Promise.all([
    req(stores[0].put(meta)),
    req(stores[1].put({ id: song.id, blob })),
    req(stores[2].put({ id: song.id, text }))
  ]));
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

  return updatedLists;
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
  const files = Array.from(fileList || []).filter((file) => /\.(pdf|docx?)$/i.test(file.name));
  if (!files.length) {
    toast('Escolha arquivos PDF, DOCX ou DOC.', 'error');
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
        existing = songs.find((song) => String(song.file || '').toLowerCase() === file.name.toLowerCase());
        const type = file.name.split('.').pop().toLowerCase();
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
            driveId: null,
            itemId: null,
            eTag: null,
            hash,
            text
          };
        }

        setProgress((index + 0.9) / files.length, 'Salvando ' + file.name + '…');
        await saveSongRecord(song, blob, text);
        buildHay(song);

        if (existing) {
          updated++;
        } else {
          songs.push(song);
          imported++;
        }

        if (!text && type !== 'doc') withoutText++;
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
      <span class="name">${esc(song.name)}</span>
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

  $('#main').innerHTML = `
    <div class="bar">
      <button class="primary" data-act="import">＋ Importar PDF / DOCX</button>
      <span class="hint">ou arraste arquivos para esta tela</span>
    </div>
    ${songs.length ? `<div class="chips">${['★', ...tags].map((tagName) => `
      <button class="chip ${tag === tagName ? 'on' : ''}" data-tag="${esc(tagName)}">${esc(tagName)}</button>
    `).join('')}</div>` : ''}
    ${visible.length
      ? visible.map(songRow).join('')
      : `<div class="empty">${songs.length
        ? 'Nada encontrado com essa busca ou etiqueta.'
        : '<strong>Sua biblioteca está vazia.</strong><br>Importe PDFs e DOCX para guardá-los neste aparelho e usar offline.'}</div>`}
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
  const editing = openList === list.id;
  const rows = list.items.map((songId, index) => {
    const song = songById(songId);
    if (!song) return '';
    return `<div class="row" data-list="${list.id}" data-song="${song.id}" data-index="${index}">
      <span class="index">${index + 1}</span>
      <button class="main" data-act="play-list-song" data-list="${list.id}" data-index="${index}">
        <span class="name">${esc(song.name)}</span>
        <span class="sub">${esc(song.artist || (song.type ? song.type.toUpperCase() : ''))}</span>
      </button>
      ${song.key ? `<span class="key">${esc(song.key)}</span>` : ''}
      ${editing ? `<div class="actions">
        <button class="icon-btn" data-act="move-up" data-list="${list.id}" data-index="${index}" aria-label="Subir">↑</button>
        <button class="icon-btn" data-act="move-down" data-list="${list.id}" data-index="${index}" aria-label="Descer">↓</button>
        <button class="icon-btn danger" data-act="remove-from-list" data-list="${list.id}" data-index="${index}" aria-label="Remover do repertório">✕</button>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="list-card">
    <div class="row list-head" data-list="${list.id}">
      <button class="main" data-act="toggle-list" data-list="${list.id}" aria-expanded="${editing}">
        <span class="name">${esc(list.name)}</span>
        <span class="sub">${list.items.length} música(s)${editing ? ' · editando' : ''}</span>
      </button>
      <div class="actions">
        <button class="primary" data-act="play-list" data-list="${list.id}" aria-label="Tocar repertório">▶<span class="label"> Tocar</span></button>
        <button data-act="toggle-list" data-list="${list.id}">${editing ? 'Concluir' : 'Editar'}</button>
        <button data-act="export-list" data-list="${list.id}" ${list.items.length ? '' : 'disabled'}
          aria-label="Exportar repertório em zip" title="Exportar repertório">⤓<span class="label"> Exportar</span></button>
        <button class="danger" data-act="delete-list" data-list="${list.id}" aria-label="Excluir repertório">🗑</button>
      </div>
    </div>
    ${rows
      ? `<div class="list-songs">${rows}</div>`
      : '<div class="empty" style="padding:22px 12px">Repertório vazio. Toque em Editar para adicionar músicas.</div>'}
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

async function toggleList(list) {
  openList = openList === list.id ? null : list.id;
  rememberOpenList();
  render();
  if (openList) {
    requestAnimationFrame(() => {
      const field = document.querySelector('[data-addq="' + list.id + '"]');
      if (field) field.focus();
    });
  }
}

async function addToLibraryList(list, songId) {
  if (list.items.includes(songId)) return;
  list.items.push(songId);
  list.updatedAt = Date.now();
  try {
    await putOne('lists', list);
    addQ[list.id] = '';
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector('[data-addq="' + list.id + '"]');
      if (field) field.focus();
    });
  } catch (err) {
    console.error(err);
    toast('Não foi possível adicionar a música.', 'error');
  }
}

async function moveListItem(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.items.length) return;
  const temp = list.items[index];
  list.items[index] = list.items[target];
  list.items[target] = temp;
  list.updatedAt = Date.now();
  try {
    await putOne('lists', list);
    render();
  } catch (err) {
    console.error(err);
    toast('Não foi possível reordenar.', 'error');
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
    <p class="export-info">Reúne PDFs e DOCX como estão, na ordem do repertório. Nada é alterado.</p>
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
    const record = await getOne('files', song.id);
    if (!record || !record.blob) {
      missing.push(song.name);
      continue;
    }
    songs.push({ song, blob: record.blob });
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
    const extension = (String(song.file || '').match(/\.(pdf|docx?)$/i) || ['.pdf'])[0].toLowerCase();
    const base = sanitizeFileName(
      String(song.name || baseName(song.file) || 'cifra').replace(/\.(pdf|docx?)$/i, '')
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
    const record = await getOne('files', song.id);
    if (!record || !record.blob) return null;
    raw = await record.blob.arrayBuffer();
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
  const warning = count
    ? 'Excluir "' + song.name + '" do aparelho?\n\nEla também será removida de ' + count + ' repertório(s).'
    : 'Excluir "' + song.name + '" do aparelho?';
  if (!confirm(warning)) return;

  try {
    const updatedLists = await deleteSongRecord(song.id);
    songs = songs.filter((item) => item.id !== song.id);
    for (const updated of updatedLists) {
      const index = lists.findIndex((list) => list.id === updated.id);
      if (index >= 0) lists[index] = updated;
    }
    closeModal();
    render();
    toast('Cifra excluída.');
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
  const body = $('#viewerBody');
  body.scrollTop = 0;
  body.classList.toggle('invert', invert);
  body.innerHTML = '<div class="viewer-msg">Carregando…</div>';
  $('#viewerTitle').textContent =
    (queue.length > 1 ? (qi + 1) + '/' + queue.length + ' · ' : '') +
    song.name + (song.key ? ' · ' + song.key : '');

  let record;
  try {
    record = await getOne('files', song.id);
  } catch (err) {
    console.error(err);
  }

  if (token !== renderGeneration) return;

  if (!record || !record.blob) {
    body.innerHTML = '<div class="viewer-msg">O arquivo não foi encontrado neste aparelho.<br>Importe novamente.</div>';
    return;
  }

  const blob = record.blob;
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
    } else {
      body.innerHTML = '<div class="viewer-msg">Arquivos .doc antigos não abrem no navegador.<br>' +
        'Use “✎ Abrir” para baixar e edite no Word, salvando como .docx ou PDF.</div>';
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
  }

  requestAnimationFrame(() => {
    body.scrollTop = ratio * Math.max(0, body.scrollHeight - body.clientHeight);
  });
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
    const record = await getOne('files', song.id);
    if (!record || !record.blob) {
      toast('Arquivo não encontrado neste aparelho.', 'error');
      return null;
    }
    currentBlob = record.blob;
    currentBlobSongId = song.id;
    return { song, blob: record.blob };
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
        case 'move-up':
          if (list && index >= 0) await moveListItem(list, index, -1);
          break;
        case 'move-down':
          if (list && index >= 0) await moveListItem(list, index, 1);
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

  if (location.protocol === 'file:') {
    toast('Para instalar como app e funcionar offline, abra por um endereço http(s).', 'error');
  }
}

init();
