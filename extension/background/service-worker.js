/**
 * TranX background service worker
 * - 多语言词典查询（en 查词；ko/ja 整行翻译）
 * - 词典缓存（chrome.storage.local · tranx_dict_cache）
 * - 生词本：英语词形经 chrome.storage.sync 跨设备同步（每词一个 key：tv:<word>）
 */

const CACHE_KEY = 'tranx_dict_cache';
/** 旧版 local 整包 key，仅用于迁移 */
const VOCAB_LEGACY_LOCAL = 'tranx_vocab';
/** 若曾把整包误写入 sync 的 key */
const VOCAB_LEGACY_SYNC_BLOB = 'tranx_vocab';
/** sync 中每个英语词：tv:hello → addedAt(number) */
const VOCAB_PREFIX = 'tv:';
const VOCAB_MIGRATED_FLAG = 'tranx_vocab_migrated_to_sync_v1';
/** 预留 settings 等，词条约 500 上限提示 */
const VOCAB_SOFT_MAX = 480;
const CACHE_MAX = 2000;

const DEFAULT_SETTINGS = {
  enabled: true,
  delay: 200,
  showPhonetic: true,
  showPos: true,
  showEnglish: false,
  minWordLength: 2,
  /** en | ko | ja | auto */
  sourceLang: 'en',
  clickInterceptMode: 'all',
  clickInterceptN: 1,
};

/** 有道 le 参数 */
const YOUDAO_LE = { en: 'en', ko: 'ko', ja: 'jap' };
/** MyMemory 源语言 */
const MM_SRC = { en: 'en', ko: 'ko', ja: 'ja' };

/** @type {Map<string, object>} */
const memoryCache = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('settings');
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  } else {
    await chrome.storage.sync.set({
      settings: { ...DEFAULT_SETTINGS, ...stored.settings },
    });
  }
  try {
    await migrateVocabToSync();
  } catch (err) {
    console.warn('[TranX] vocab migrate on install failed', err);
  }
});

// 浏览器启动时尝试迁移
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    migrateVocabToSync().catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    LOOKUP_WORD: () =>
      lookupWord(message.word, message.lang || 'en', message.unit).then(
        (data) => ({
          ok: true,
          data,
        })
      ),
    GET_SETTINGS: async () => {
      const r = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
      return { ok: true, settings: { ...DEFAULT_SETTINGS, ...r.settings } };
    },
    CLEAR_CACHE: async () => {
      memoryCache.clear();
      await chrome.storage.local.remove(CACHE_KEY);
      return { ok: true };
    },
    VOCAB_HAS: async () => {
      const saved = await isInVocab(message.word, message.lang || 'en');
      return { ok: true, saved };
    },
    VOCAB_TOGGLE: () =>
      toggleVocab(message.word, message.entry, message.lang || message.entry?.lang || 'en'),
    VOCAB_LIST: async () => {
      const list = await listVocab();
      return { ok: true, list, count: list.length };
    },
    VOCAB_REMOVE: async () => {
      await removeVocab(message.word, message.lang, message.id);
      return { ok: true };
    },
    VOCAB_EXPORT: async () => {
      const list = await listVocab();
      return {
        ok: true,
        payload: {
          version: 3,
          exportedAt: new Date().toISOString(),
          app: 'TranX',
          // 仅英语词 + 时间；释义不导出
          words: list.map((x) => ({ w: x.word, t: x.addedAt })),
        },
      };
    },
    VOCAB_IMPORT: () => importVocab(message.words, message.mode || 'merge'),
    VOCAB_CLEAR: async () => {
      await clearVocab();
      return { ok: true };
    },
  };

  const handler = handlers[message?.type];
  if (!handler) return false;

  Promise.resolve()
    .then(handler)
    .then((result) => sendResponse(result))
    .catch((err) =>
      sendResponse({ ok: false, error: String(err?.message || err) })
    );
  return true;
});

// ---------------------------------------------------------------------------
// 规范化 / 缓存 key
// ---------------------------------------------------------------------------

function normalizeLang(lang) {
  const l = String(lang || 'en').toLowerCase();
  if (l === 'ko' || l === 'ja' || l === 'en') return l;
  return 'en';
}

function normalizeWord(w, lang = 'en') {
  let s = String(w || '').trim();
  if (!s) return '';
  const l = normalizeLang(lang);
  if (l === 'en') {
    return s
      .toLowerCase()
      .replace(/^[^a-z']+|[^a-z']+$/gi, '');
  }
  // 日韩：去掉首尾空白与常见标点，保留文字本身大小写形态
  return s.replace(
    /^[\s\u3000\u2000-\u200B.,!?;:，。！？、·…「」『』（）()[\]【】""'']+|[\s\u3000\u2000-\u200B.,!?;:，。！？、·…「」『』（）()[\]【】""'']+$/g,
    ''
  );
}

function cacheKey(lang, word) {
  return `${normalizeLang(lang)}:${word}`;
}

// ---------------------------------------------------------------------------
// 生词本：chrome.storage.sync，每词 key = tv:<word>，value = addedAt
// 避免单 key 8KB 限制；MAX_ITEMS≈512，软上限约 480 词
// ---------------------------------------------------------------------------

function vocabSyncKey(word) {
  return `${VOCAB_PREFIX}${word}`;
}

function parseVocabSyncKey(key) {
  if (!key || !String(key).startsWith(VOCAB_PREFIX)) return null;
  return String(key).slice(VOCAB_PREFIX.length);
}

/** 纯函数：任意旧结构 → { [word]: addedAt } */
function normalizeVocabEntries(raw) {
  const next = {};
  if (!raw || typeof raw !== 'object') return next;

  for (const [id, item] of Object.entries(raw)) {
    let word = '';
    let addedAt = 0;
    let lang = 'en';

    if (typeof item === 'number') {
      word = id.startsWith(VOCAB_PREFIX)
        ? id.slice(VOCAB_PREFIX.length)
        : id.includes(':')
          ? id.slice(id.indexOf(':') + 1)
          : id;
      addedAt = item;
    } else if (item && typeof item === 'object') {
      lang = normalizeLang(item.lang || 'en');
      word = item.word || item.displayWord || item.w || '';
      addedAt = Number(item.addedAt || item.t) || 0;
      if (!word && id.includes(':')) {
        const i = id.indexOf(':');
        const maybe = id.slice(0, i);
        if (maybe === 'en' || maybe === 'ko' || maybe === 'ja' || maybe === 'tv') {
          word = id.slice(i + 1);
          if (maybe !== 'tv' && maybe !== 'en') lang = maybe;
        } else word = id;
      } else if (!word) word = id.startsWith(VOCAB_PREFIX) ? id.slice(3) : id;
    } else if (typeof item === 'string') {
      word = item;
      addedAt = Date.now();
    } else {
      continue;
    }

    if (lang !== 'en') continue;
    word = normalizeWord(word, 'en');
    if (!word || !/^[a-z]+(?:'[a-z]+)?$/.test(word)) continue;
    const t = addedAt || Date.now();
    if (!next[word] || t < next[word]) next[word] = t;
  }
  return next;
}

let migratePromise = null;

async function migrateVocabToSync() {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const flag = await chrome.storage.local.get(VOCAB_MIGRATED_FLAG);
    const local = await chrome.storage.local.get(VOCAB_LEGACY_LOCAL);
    const syncAll = await chrome.storage.sync.get(null);

    const fromLocal = normalizeVocabEntries(local[VOCAB_LEGACY_LOCAL]);
    const fromSyncBlob = normalizeVocabEntries(syncAll[VOCAB_LEGACY_SYNC_BLOB]);
    const fromSyncKeys = {};
    for (const [k, v] of Object.entries(syncAll)) {
      const w = parseVocabSyncKey(k);
      if (w) fromSyncKeys[w] = typeof v === 'number' ? v : Number(v) || Date.now();
    }

    // 合并：保留较早收藏时间
    const merged = { ...fromSyncKeys };
    for (const src of [fromSyncBlob, fromLocal]) {
      for (const [w, t] of Object.entries(src)) {
        if (!merged[w] || t < merged[w]) merged[w] = t;
      }
    }

    const toWrite = {};
    for (const [w, t] of Object.entries(merged)) {
      const sk = vocabSyncKey(w);
      if (syncAll[sk] !== t) toWrite[sk] = t;
    }

    if (Object.keys(toWrite).length) {
      await setSyncInBatches(toWrite);
    }

    // 清掉 legacy 整包，避免超 8KB / 重复
    if (syncAll[VOCAB_LEGACY_SYNC_BLOB] != null) {
      await chrome.storage.sync.remove(VOCAB_LEGACY_SYNC_BLOB);
    }
    if (local[VOCAB_LEGACY_LOCAL] != null) {
      await chrome.storage.local.remove(VOCAB_LEGACY_LOCAL);
    }
    await chrome.storage.local.set({ [VOCAB_MIGRATED_FLAG]: true });
  })().finally(() => {
    migratePromise = null;
  });
  return migratePromise;
}

async function setSyncInBatches(obj, batchSize = 40) {
  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = Object.fromEntries(entries.slice(i, i + batchSize));
    try {
      await chrome.storage.sync.set(chunk);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/QUOTA|quota|MAX_ITEMS|MAX_WRITE/i.test(msg)) {
        throw new Error(
          'Chrome 同步存储空间或写入频率不足。请精简生词本、确认已登录并开启同步后重试。'
        );
      }
      throw err;
    }
  }
}

async function readVocabMap() {
  await migrateVocabToSync();
  const all = await chrome.storage.sync.get(null);
  const map = {};
  for (const [k, v] of Object.entries(all)) {
    const w = parseVocabSyncKey(k);
    if (!w) continue;
    map[w] = typeof v === 'number' ? v : Number(v) || 0;
  }
  // 兼容尚未拆完的 blob
  if (all[VOCAB_LEGACY_SYNC_BLOB]) {
    Object.assign(map, normalizeVocabEntries(all[VOCAB_LEGACY_SYNC_BLOB]));
  }
  return map;
}

async function isInVocab(rawWord, lang) {
  if (normalizeLang(lang || 'en') !== 'en') return false;
  const w = normalizeWord(rawWord, 'en');
  if (!w) return false;
  await migrateVocabToSync();
  const sk = vocabSyncKey(w);
  const cur = await chrome.storage.sync.get(sk);
  return cur[sk] != null;
}

async function listVocab() {
  const map = await readVocabMap();
  return Object.entries(map)
    .map(([word, addedAt]) => ({
      word,
      addedAt: Number(addedAt) || 0,
    }))
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

async function removeVocab(rawWord, _lang, id) {
  const w = normalizeWord(id || rawWord, 'en');
  if (!w) return;
  await migrateVocabToSync();
  await chrome.storage.sync.remove(vocabSyncKey(w));
}

async function clearVocab() {
  await migrateVocabToSync();
  const all = await chrome.storage.sync.get(null);
  const keys = Object.keys(all).filter(
    (k) => k.startsWith(VOCAB_PREFIX) || k === VOCAB_LEGACY_SYNC_BLOB
  );
  if (keys.length) await chrome.storage.sync.remove(keys);
}

async function toggleVocab(rawWord, entry, lang) {
  const l = normalizeLang(lang || entry?.lang || 'en');
  if (l !== 'en') {
    throw new Error('仅支持收藏英语单词');
  }
  const w = normalizeWord(rawWord || entry?.word, 'en');
  if (!w) throw new Error('empty word');

  await migrateVocabToSync();
  const sk = vocabSyncKey(w);
  const cur = await chrome.storage.sync.get(sk);

  if (cur[sk] != null) {
    await chrome.storage.sync.remove(sk);
    return { ok: true, saved: false, word: w, lang: 'en', id: w };
  }

  const map = await readVocabMap();
  if (Object.keys(map).length >= VOCAB_SOFT_MAX) {
    throw new Error(
      `生词本已接近同步上限（约 ${VOCAB_SOFT_MAX} 词）。请删除部分词后再收藏。`
    );
  }

  const t = Date.now();
  try {
    await chrome.storage.sync.set({ [sk]: t });
  } catch (err) {
    const msg = String(err?.message || err);
    if (/QUOTA|quota|MAX_ITEMS|MAX_WRITE/i.test(msg)) {
      throw new Error(
        '无法写入 Chrome 同步存储（配额或频率限制）。请确认已登录 Google 账号并开启扩展同步。'
      );
    }
    throw err;
  }

  return {
    ok: true,
    saved: true,
    word: w,
    lang: 'en',
    id: w,
    entry: { word: w, addedAt: t },
  };
}

async function importVocab(words, mode) {
  if (!Array.isArray(words)) throw new Error('invalid import data');
  await migrateVocabToSync();

  if (mode === 'replace') {
    await clearVocab();
  }

  const existing = await readVocabMap();
  const toWrite = {};
  let imported = 0;
  let skipped = 0;

  for (const item of words) {
    let w = '';
    let addedAt = Date.now();
    let lang = 'en';

    if (typeof item === 'string') {
      w = item;
    } else if (item && typeof item === 'object') {
      lang = normalizeLang(item.lang || 'en');
      w = item.word || item.displayWord || item.w || '';
      addedAt = Number(item.addedAt || item.t) || Date.now();
    } else {
      skipped++;
      continue;
    }

    if (lang !== 'en') {
      skipped++;
      continue;
    }

    w = normalizeWord(w, 'en');
    if (!w) {
      skipped++;
      continue;
    }

    if (mode === 'merge' && existing[w] != null) {
      skipped++;
      continue;
    }

    toWrite[vocabSyncKey(w)] = addedAt;
    existing[w] = addedAt;
    imported++;
  }

  if (Object.keys(existing).length > VOCAB_SOFT_MAX) {
    throw new Error(
      `导入后将超过约 ${VOCAB_SOFT_MAX} 词的同步软上限，请减少词条后重试。`
    );
  }

  if (Object.keys(toWrite).length) {
    await setSyncInBatches(toWrite);
  }

  return {
    ok: true,
    imported,
    skipped,
    count: Object.keys(existing).length,
  };
}

// ---------------------------------------------------------------------------
// 查词
// ---------------------------------------------------------------------------

async function lookupWord(rawWord, lang, unit) {
  const l = normalizeLang(lang);
  // 日韩整行：保留原文空白折叠即可，勿按「词」过度裁剪
  const word =
    l === 'en'
      ? normalizeWord(rawWord, l)
      : String(rawWord || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);
  if (!word) throw new Error('empty word');

  const u = unit || (l === 'en' ? 'word' : 'line');
  const ck = cacheKey(l, word);
  const cached = await getFromCache(ck);
  if (cached) return { ...cached, fromCache: true, lang: l, unit: u };

  const result = await fetchDefinition(word, l, u);
  result.lang = l;
  result.unit = u;
  await saveToCache(ck, result);
  return { ...result, fromCache: false };
}

async function getFromCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const store = await chrome.storage.local.get(CACHE_KEY);
    const cache = store[CACHE_KEY] || {};
    if (cache[key]) {
      memoryCache.set(key, cache[key]);
      return cache[key];
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function saveToCache(key, data) {
  memoryCache.set(key, data);
  try {
    const store = await chrome.storage.local.get(CACHE_KEY);
    const cache = store[CACHE_KEY] || {};
    cache[key] = data;
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.slice(0, keys.length - CACHE_MAX).forEach((k) => delete cache[k]);
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch {
    /* ignore */
  }
}

async function fetchDefinition(word, lang, unit) {
  const l = normalizeLang(lang);

  if (l === 'en') {
    const [youdao, freeDict, mymemory] = await Promise.allSettled([
      fetchYoudao(word, 'en'),
      fetchFreeDictionary(word),
      fetchMyMemory(word, 'en'),
    ]);
    const yd = youdao.status === 'fulfilled' ? youdao.value : null;
    const fd = freeDict.status === 'fulfilled' ? freeDict.value : null;
    const mm = mymemory.status === 'fulfilled' ? mymemory.value : null;

    const meanings = [];
    if (yd?.meanings?.length) meanings.push(...yd.meanings);
    if (!meanings.length && mm?.translation) {
      meanings.push({ pos: '', zh: mm.translation });
    }
    if (!meanings.length && !fd) throw new Error('未找到释义');

    return {
      word: yd?.word || fd?.word || word,
      phonetic: yd?.phonetic || fd?.phonetic || '',
      audio: fd?.audio || '',
      meanings: meanings.slice(0, 6),
      englishDefs: (fd?.definitions || []).slice(0, 3),
      source: yd ? 'youdao' : mm ? 'mymemory' : 'dictionary',
      lang: 'en',
      unit: 'word',
    };
  }

  // 日 / 韩：整行机器翻译为主（不依赖拆词）
  const isLine = unit === 'line' || word.length > 12;
  if (isLine) {
    try {
      const mm = await fetchMyMemory(word, l);
      return {
        word,
        phonetic: '',
        audio: '',
        meanings: [{ pos: '译', zh: mm.translation }],
        englishDefs: [],
        source: 'mymemory',
        lang: l,
        unit: 'line',
      };
    } catch {
      // 再试有道整句（fanyi 字段）
    }
  }

  const [youdao, mymemory] = await Promise.allSettled([
    fetchYoudao(word, l),
    fetchMyMemory(word, l),
  ]);
  const yd = youdao.status === 'fulfilled' ? youdao.value : null;
  const mm = mymemory.status === 'fulfilled' ? mymemory.value : null;

  const meanings = [];
  if (mm?.translation) {
    meanings.push({ pos: isLine ? '译' : '', zh: mm.translation });
  }
  if (!meanings.length && yd?.meanings?.length) meanings.push(...yd.meanings);
  if (!meanings.length) throw new Error('未找到释义');

  return {
    word: word,
    phonetic: yd?.phonetic || '',
    audio: '',
    meanings: meanings.slice(0, 6),
    englishDefs: [],
    source: mm ? 'mymemory' : 'youdao',
    lang: l,
    unit: isLine ? 'line' : 'word',
  };
}

async function fetchYoudao(word, lang) {
  const le = YOUDAO_LE[normalizeLang(lang)] || 'en';
  const suggestUrl = `https://dict.youdao.com/suggest?num=5&ver=3.0&doctype=json&cache=false&le=${le}&q=${encodeURIComponent(word)}`;
  const res = await fetch(suggestUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`youdao ${res.status}`);
  const json = await res.json();

  const entries = json?.data?.entries || [];
  if (!entries.length) {
    return fetchYoudaoJsonApi(word, lang);
  }

  const lower = word.toLowerCase();
  const exact =
    entries.find((e) => String(e.entry || '').toLowerCase() === lower) ||
    entries.find((e) => String(e.entry || '') === word) ||
    entries[0];

  const explain = exact.explain || '';
  const meanings = parseYoudaoExplain(explain);

  let phonetic = '';
  try {
    const full = await fetchYoudaoJsonApi(word, lang);
    phonetic = full?.phonetic || '';
    if (full?.meanings?.length && meanings.length < 2) {
      return full;
    }
  } catch {
    /* ignore */
  }

  return {
    word: exact.entry || word,
    phonetic,
    meanings: meanings.length ? meanings : [{ pos: '', zh: explain }],
  };
}

async function fetchYoudaoJsonApi(word, lang) {
  const l = normalizeLang(lang);
  const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`youdao jsonapi ${res.status}`);
  const data = await res.json();

  // 英语 ec；日语 jc；韩语 kc（字段因词而异，多路尝试）
  const wordBlocks = [
    data?.ec?.word?.[0],
    data?.jc?.word?.[0],
    data?.kc?.word?.[0],
    data?.newjc?.word?.[0],
    data?.newkc?.word?.[0],
    data?.simple?.word?.[0],
  ].filter(Boolean);

  let phonetic = '';
  const meanings = [];

  for (const block of wordBlocks) {
    if (!phonetic) {
      phonetic =
        block.usphone ||
        block.ukphone ||
        block.phone ||
        block.phonetic ||
        '';
    }
    const trs = block.trs || [];
    for (const tr of trs) {
      const pos = (tr.pos || '').trim();
      // 英语 tran；日韩可能是 tr 数组
      let zh = (tr.tran || '').trim();
      if (!zh && Array.isArray(tr.tr)) {
        zh = tr.tr
          .map((t) => (typeof t === 'string' ? t : t?.l?.i || t?.i || ''))
          .flat()
          .filter(Boolean)
          .join('；');
      }
      if (!zh && tr.l?.i) {
        zh = Array.isArray(tr.l.i) ? tr.l.i.join('；') : String(tr.l.i);
      }
      if (zh) meanings.push({ pos, zh: String(zh).trim() });
    }
  }

  // 日韩常见：data.jc / blng_sents 等之外的 web_trans
  if (!meanings.length && data?.web_trans?.['web-translation']?.[0]) {
    const wt = data.web_trans['web-translation'][0];
    const values = (wt?.trans || [])
      .map((t) => t.value)
      .filter(Boolean)
      .slice(0, 4);
    if (values.length) {
      meanings.push({ pos: '', zh: values.join('；') });
    }
    return {
      word: wt?.key || word,
      phonetic: phonetic ? (phonetic.startsWith('/') ? phonetic : `/${phonetic}/`) : '',
      meanings,
    };
  }

  // fanyi 机器结果
  if (!meanings.length && data?.fanyi?.tran) {
    meanings.push({ pos: '', zh: String(data.fanyi.tran) });
  }

  if (!meanings.length) throw new Error('youdao empty');
  return {
    word,
    phonetic: phonetic
      ? phonetic.startsWith('/')
        ? phonetic
        : `/${phonetic}/`
      : '',
    meanings,
  };
}

function parseYoudaoExplain(explain) {
  if (!explain) return [];
  const parts = explain.split(/\s{2,}|\s+(?=[a-z]+\.\s)/i).filter(Boolean);
  const results = [];
  for (const part of parts) {
    const m = part.match(/^([a-z]+\.)\s*(.+)$/i);
    if (m) results.push({ pos: m[1], zh: m[2].trim() });
    else results.push({ pos: '', zh: part.trim() });
  }
  if (!results.length) results.push({ pos: '', zh: explain.trim() });
  return results;
}

async function fetchFreeDictionary(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`freedict ${res.status}`);
  const arr = await res.json();
  const entry = arr?.[0];
  if (!entry) throw new Error('freedict empty');

  const phonetic =
    entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '';
  const audio = entry.phonetics?.find((p) => p.audio)?.audio || '';
  const definitions = [];
  for (const m of entry.meanings || []) {
    const pos = m.partOfSpeech || '';
    for (const d of (m.definitions || []).slice(0, 2)) {
      definitions.push({
        pos,
        en: d.definition || '',
        example: d.example || '',
      });
    }
  }
  return { word: entry.word || word, phonetic, audio, definitions };
}

async function fetchMyMemory(word, lang) {
  const src = MM_SRC[normalizeLang(lang)] || 'en';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${src}|zh-CN`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const json = await res.json();
  const translation = json?.responseData?.translatedText;
  if (!translation) throw new Error('mymemory empty');
  if (translation.toLowerCase() === String(word).toLowerCase()) {
    throw new Error('mymemory empty');
  }
  return { translation };
}
