const DEFAULT_SETTINGS = {
  enabled: true,
  delay: 200,
  showPhonetic: true,
  showPos: true,
  showEnglish: false,
  minWordLength: 2,
  sourceLang: 'en',
  clickInterceptMode: 'all',
  clickInterceptN: 1,
};

/** @type {Array<object>} */
let vocabList = [];
/** @type {Map<string, { loading?: boolean, phonetic?: string, meanings?: string, error?: string }>} */
const defCache = new Map();

const els = {
  enabled: document.getElementById('enabled'),
  delay: document.getElementById('delay'),
  delayValue: document.getElementById('delayValue'),
  showPhonetic: document.getElementById('showPhonetic'),
  showPos: document.getElementById('showPos'),
  showEnglish: document.getElementById('showEnglish'),
  minWordLength: document.getElementById('minWordLength'),
  sourceLang: document.getElementById('sourceLang'),
  sourceLangHint: document.getElementById('sourceLangHint'),
  clickInterceptMode: document.getElementById('clickInterceptMode'),
  clickInterceptN: document.getElementById('clickInterceptN'),
  rowClickN: document.getElementById('rowClickN'),
  clickModeHint: document.getElementById('clickModeHint'),
  clearCache: document.getElementById('clearCache'),
  vocabCount: document.getElementById('vocabCount'),
  vocabSearch: document.getElementById('vocabSearch'),
  vocabList: document.getElementById('vocabList'),
  vocabEmpty: document.getElementById('vocabEmpty'),
  exportVocab: document.getElementById('exportVocab'),
  importVocab: document.getElementById('importVocab'),
  importFile: document.getElementById('importFile'),
  clearVocab: document.getElementById('clearVocab'),
};

init();

async function init() {
  bindTabs();
  await loadSettings();
  await loadVocab();
  bindSettings();
  bindVocab();
}

function bindTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        const active = panel.id === `panel-${name}`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
      if (name === 'vocab') loadVocab();
    });
  });
}

async function loadSettings() {
  const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  const s = { ...DEFAULT_SETTINGS, ...settings };

  els.enabled.checked = !!s.enabled;
  els.delay.value = s.delay;
  els.delayValue.textContent = `${s.delay} ms`;
  els.showPhonetic.checked = !!s.showPhonetic;
  els.showPos.checked = !!s.showPos;
  els.showEnglish.checked = !!s.showEnglish;
  els.minWordLength.value = String(s.minWordLength);
  const sl = s.sourceLang;
  els.sourceLang.value =
    sl === 'ko' || sl === 'ja' || sl === 'auto' ? sl : 'en';
  els.clickInterceptMode.value =
    s.clickInterceptMode === 'nth' ? 'nth' : 'all';
  els.clickInterceptN.value = String(
    Math.max(1, Math.min(5, Number(s.clickInterceptN) || 1))
  );
  syncSourceLangUi();
  syncClickModeUi();
}

function syncSourceLangUi() {
  const m = els.sourceLang.value;
  const map = {
    en: '仅识别<strong>英语单词</strong>。<strong>中文永不触发</strong>。',
    ko: '识别到<strong>韩文</strong>时<strong>整行翻译</strong>为中文（不拆词）。',
    ja: '识别到<strong>日语</strong>时<strong>整行翻译</strong>（汉字需附近有假名，避免中文误触）。',
    auto: '英语按<strong>词</strong>；日/韩按<strong>整行翻译</strong>。<strong>纯中文不触发</strong>。',
  };
  els.sourceLangHint.innerHTML = map[m] || map.en;
}

function syncClickModeUi() {
  const mode = els.clickInterceptMode.value;
  const n = Number(els.clickInterceptN.value) || 1;
  els.rowClickN.style.opacity = mode === 'nth' ? '1' : '0.45';
  els.clickInterceptN.disabled = mode !== 'nth';

  if (mode === 'all') {
    els.clickModeHint.innerHTML =
      '<strong>仅点击词上</strong>时拦截并立即收藏/取消；点卡片<strong>空白处</strong>正常进帖。';
  } else {
    els.clickModeHint.innerHTML = `仅点击词上时拦截；同一词连续点 <strong>${n}</strong> 次才收藏/取消（${STREAK_HINT}）。空白处仍可进帖。`;
  }
}

const STREAK_HINT = '2.5 秒内有效';

function bindSettings() {
  els.enabled.addEventListener('change', saveSettings);
  els.delay.addEventListener('input', () => {
    els.delayValue.textContent = `${els.delay.value} ms`;
    saveSettings();
  });
  els.showPhonetic.addEventListener('change', saveSettings);
  els.showPos.addEventListener('change', saveSettings);
  els.showEnglish.addEventListener('change', saveSettings);
  els.minWordLength.addEventListener('change', saveSettings);
  els.sourceLang.addEventListener('change', () => {
    syncSourceLangUi();
    saveSettings();
  });
  els.clickInterceptMode.addEventListener('change', () => {
    syncClickModeUi();
    saveSettings();
  });
  els.clickInterceptN.addEventListener('change', () => {
    syncClickModeUi();
    saveSettings();
  });

  els.clearCache.addEventListener('click', async () => {
    els.clearCache.disabled = true;
    els.clearCache.textContent = '已清除';
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      els.clearCache.disabled = false;
      els.clearCache.textContent = '清除词典缓存';
    }, 1200);
  });
}

async function saveSettings() {
  const sl = els.sourceLang.value;
  const settings = {
    enabled: els.enabled.checked,
    delay: Number(els.delay.value) || 0,
    showPhonetic: els.showPhonetic.checked,
    showPos: els.showPos.checked,
    showEnglish: els.showEnglish.checked,
    minWordLength: Number(els.minWordLength.value) || 2,
    sourceLang: sl === 'ko' || sl === 'ja' || sl === 'auto' ? sl : 'en',
    clickInterceptMode: els.clickInterceptMode.value === 'nth' ? 'nth' : 'all',
    clickInterceptN: Math.max(1, Math.min(10, Number(els.clickInterceptN.value) || 1)),
  };
  await chrome.storage.sync.set({ settings });
}

// ---------------------------------------------------------------------------
// 生词本
// ---------------------------------------------------------------------------

function bindVocab() {
  els.vocabSearch.addEventListener('input', () => renderVocabList());

  els.vocabList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const word = btn.getAttribute('data-remove');
    try {
      await chrome.runtime.sendMessage({ type: 'VOCAB_REMOVE', word, id: word });
      defCache.delete(word);
      await loadVocab();
    } catch {
      /* ignore */
    }
  });

  els.exportVocab.addEventListener('click', exportVocab);
  els.importVocab.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', onImportFile);

  els.clearVocab.addEventListener('click', async () => {
    if (!vocabList.length) return;
    const ok = confirm(`确定清空生词本？共 ${vocabList.length} 个词，此操作不可撤销。`);
    if (!ok) return;
    try {
      await chrome.runtime.sendMessage({ type: 'VOCAB_CLEAR' });
      await loadVocab();
    } catch {
      /* ignore */
    }
  });
}

async function loadVocab() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'VOCAB_LIST' });
    vocabList = res?.ok && Array.isArray(res.list) ? res.list : [];
  } catch {
    vocabList = [];
  }
  els.vocabCount.textContent = String(vocabList.length);
  renderVocabList();
}

function renderVocabList() {
  const q = (els.vocabSearch.value || '').trim().toLowerCase();
  const filtered = q
    ? vocabList.filter((item) => String(item.word || '').toLowerCase().includes(q))
    : vocabList;

  els.vocabList.innerHTML = '';

  if (!vocabList.length) {
    els.vocabEmpty.hidden = false;
    els.vocabEmpty.innerHTML =
      '还没有生词。<br />在 X 上点击<strong>英语单词</strong>即可收藏（只存词形，释义实时查询）。';
    return;
  }

  if (!filtered.length) {
    els.vocabEmpty.hidden = false;
    els.vocabEmpty.textContent = '没有匹配的生词';
    return;
  }

  els.vocabEmpty.hidden = true;

  const frag = document.createDocumentFragment();
  for (const item of filtered) {
    frag.appendChild(createVocabItem(item));
  }
  els.vocabList.appendChild(frag);

  // 列表渲染后批量拉释义（限流）
  void fillDefinitions(filtered.map((x) => x.word));
}

function createVocabItem(item) {
  const el = document.createElement('div');
  el.className = 'vocab-item';
  el.dataset.word = item.word;

  const word = item.word || '';
  const cached = defCache.get(word);
  const date = item.addedAt ? formatDate(item.addedAt) : '';

  let meaningsHtml = '<span class="def-loading">释义加载中…</span>';
  let phonetic = '';
  if (cached?.error) {
    meaningsHtml = `<span class="def-error">${escapeHtml(cached.error)}</span>`;
  } else if (cached && !cached.loading && cached.meanings != null) {
    meaningsHtml = cached.meanings || '（暂无释义）';
    phonetic = cached.phonetic || '';
  }

  el.innerHTML = `
    <div class="vocab-item-top">
      <span class="vocab-item-word">${escapeHtml(word)}</span>
      <span class="vocab-item-phonetic">${escapeHtml(phonetic)}</span>
      <button type="button" class="vocab-item-del" data-remove="${escapeAttr(word)}" title="移除">×</button>
    </div>
    <div class="vocab-item-meanings">${meaningsHtml}</div>
    ${date ? `<div class="vocab-item-meta">${date}</div>` : ''}
  `;
  return el;
}

async function fillDefinitions(words) {
  const unique = [...new Set(words.filter(Boolean))];
  // 简单串行+小并发，避免打爆接口
  const concurrency = 3;
  let i = 0;

  async function worker() {
    while (i < unique.length) {
      const word = unique[i++];
      const existing = defCache.get(word);
      if (existing && !existing.loading && (existing.meanings != null || existing.error)) {
        patchVocabItem(word);
        continue;
      }
      defCache.set(word, { loading: true });
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'LOOKUP_WORD',
          word,
          lang: 'en',
          unit: 'word',
        });
        if (!res?.ok || !res.data) {
          defCache.set(word, { error: res?.error || '查询失败' });
        } else {
          const d = res.data;
          const meanings = (d.meanings || [])
            .slice(0, 3)
            .map((m) => {
              const pos = m.pos ? `<span class="pos">${escapeHtml(m.pos)}</span>` : '';
              return `${pos}${escapeHtml(m.zh || '')}`;
            })
            .filter(Boolean)
            .join('；');
          defCache.set(word, {
            phonetic: d.phonetic || '',
            meanings: meanings || '（暂无释义）',
          });
        }
      } catch (err) {
        defCache.set(word, { error: String(err?.message || err) });
      }
      patchVocabItem(word);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, () => worker())
  );
}

function patchVocabItem(word) {
  const el = els.vocabList.querySelector(`.vocab-item[data-word="${cssEscape(word)}"]`);
  if (!el) return;
  const cached = defCache.get(word);
  if (!cached) return;
  const ph = el.querySelector('.vocab-item-phonetic');
  const body = el.querySelector('.vocab-item-meanings');
  if (ph) ph.textContent = cached.phonetic || '';
  if (body) {
    if (cached.error) {
      body.innerHTML = `<span class="def-error">${escapeHtml(cached.error)}</span>`;
    } else if (cached.loading) {
      body.innerHTML = '<span class="def-loading">释义加载中…</span>';
    } else {
      body.innerHTML = cached.meanings || '（暂无释义）';
    }
  }
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

async function exportVocab() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'VOCAB_EXPORT' });
    if (!res?.ok) {
      alert(res?.error || '导出失败');
      return;
    }
    const blob = new Blob([JSON.stringify(res.payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tranx-vocab-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(String(err?.message || err));
  }
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const words = Array.isArray(json) ? json : json.words;
    if (!Array.isArray(words)) {
      alert('无法识别的文件格式。请使用本扩展导出的 JSON。');
      return;
    }

    const mode = confirm(
      `即将导入 ${words.length} 条记录。\n\n确定 = 合并（跳过已有词）\n取消 = 中止\n\n如需「完全替换」请先清空生词本再导入。`
    )
      ? 'merge'
      : null;
    if (!mode) return;

    const res = await chrome.runtime.sendMessage({
      type: 'VOCAB_IMPORT',
      words,
      mode,
    });
    if (!res?.ok) {
      alert(res?.error || '导入失败');
      return;
    }
    await loadVocab();
    alert(`导入完成：新增 ${res.imported}，跳过 ${res.skipped}，当前共 ${res.count} 词。`);
  } catch (err) {
    alert('导入失败：' + String(err?.message || err));
  }
}

function formatDate(ts) {
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
