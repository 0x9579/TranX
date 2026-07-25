/**
 * TranX content script
 * - 多语言悬浮取词（en / ko / ja，中文永不触发）
 * - 仅当点击落在词上时拦截并收藏；卡片空白处放行进帖
 * - 点击收藏（storage 本地直写）
 */

(() => {
  'use strict';

  const LOG = (...args) => console.log('[TranX]', ...args);
  const TOOLTIP_ID = 'tranx-tooltip';
  const HIGHLIGHT_CLASS = 'tranx-word-highlight';
  const STATUS_PILL_ID = 'tranx-status-pill';
  const VOCAB_KEY = 'tranx_vocab';

  const RE_LATIN_WORD = /[a-zA-Z']/;
  const RE_HANGUL = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
  const RE_KANA = /[\u3040-\u309F\u30A0-\u30FF]/
  const RE_HAN = /[\u4E00-\u9FFF\u3400-\u4DBF]/
  const EN_WORD_RE = /^[a-zA-Z]+(?:[''][a-zA-Z]+)?$/;

  const TWEET_TEXT_SELS = [
    '[data-testid="tweetText"]',
    '[data-testid="card.layoutLarge.detail"]',
    '[data-testid="UserDescription"]',
  ];

  /** 仅这些控件真正放行（进帖请点时间戳） */
  const ALLOW_CLICK_SELS = [
    '[data-testid="reply"]',
    '[data-testid="retweet"]',
    '[data-testid="unretweet"]',
    '[data-testid="like"]',
    '[data-testid="unlike"]',
    '[data-testid="bookmark"]',
    '[data-testid="removeBookmark"]',
    '[data-testid="share"]',
    '[data-testid="caret"]',
    '[data-testid="app-text-transition-container"]',
    '[data-testid="User-Name"]',
    '[data-testid="UserAvatar-Container"]',
    '[data-testid="Tweet-User-Avatar"]',
    '[data-testid="DashButton_NewTweet_Button"]',
    '[data-testid="placementTracking"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="previewInterstitial"]',
    'time',
    'input',
    'textarea',
    'select',
  ].join(',');

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

  let settings = { ...DEFAULT_SETTINGS };
  let tooltipEl = null;
  let highlightEl = null;
  let hideTimer = null;
  let showTimer = null;
  let currentWord = '';
  let currentLang = 'en';
  let currentKey = '';
  let currentEntry = null;
  let currentSaved = false;
  let lastLookupToken = 0;
  let swallowUntil = 0;
  let streakWord = '';
  let streakCount = 0;
  let streakTimer = null;
  let toggleLock = false;

  // —— 关键同步初始化：绝不因 settings/SW 阻塞绑定 ——
  createTooltip();
  bindEvents();
  showInjectedPill();
  LOG('content script injected', location.href);
  void loadSettings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      if (!settings.enabled) {
        hideTooltip();
        resetStreak();
      }
      LOG('settings updated', settings);
    }
    if (area === 'local' && changes[VOCAB_KEY] && currentLang === 'en' && currentWord) {
      const map = changes[VOCAB_KEY].newValue || {};
      currentSaved = map[currentWord] != null || map[`en:${currentWord}`] != null;
      updateSavedBadge();
    }
  });

  async function loadSettings() {
    try {
      const { settings: s } = await chrome.storage.sync.get({
        settings: DEFAULT_SETTINGS,
      });
      settings = { ...DEFAULT_SETTINGS, ...s };
      LOG('settings loaded', settings);
    } catch (err) {
      LOG('settings load failed, using defaults', err);
    }
  }

  function showInjectedPill() {
    if (document.getElementById(STATUS_PILL_ID)) return;
    const pill = document.createElement('div');
    pill.id = STATUS_PILL_ID;
    pill.textContent = 'TranX 已加载';
    pill.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(pill);
    setTimeout(() => pill.classList.add('tranx-pill-hide'), 2200);
    setTimeout(() => pill.remove(), 3000);
  }

  function createTooltip() {
    if (document.getElementById(TOOLTIP_ID)) {
      tooltipEl = document.getElementById(TOOLTIP_ID);
      return;
    }
    tooltipEl = document.createElement('div');
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.innerHTML = `
      <div class="tranx-inner">
        <div class="tranx-header">
          <span class="tranx-word"></span>
          <span class="tranx-phonetic"></span>
          <span class="tranx-saved-badge" hidden>★ 已收藏</span>
        </div>
        <div class="tranx-body"></div>
        <div class="tranx-footer">
          <span class="tranx-source"></span>
          <span class="tranx-hint-click">点击收藏</span>
        </div>
      </div>
    `;
    (document.documentElement || document.body).appendChild(tooltipEl);
  }

  function bindEvents() {
    // 只挂 window 捕获阶段一次，避免 window+document 双触发把「收藏」马上又取消
    const opts = { capture: true, passive: false };
    window.addEventListener('pointerdown', onPointerDown, opts);
    window.addEventListener('mousedown', onMouseDown, opts);
    window.addEventListener('mouseup', onMouseUp, opts);
    window.addEventListener('click', onClick, opts);

    window.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
    window.addEventListener(
      'scroll',
      () => {
        hideTooltip();
        resetStreak();
      },
      { capture: true, passive: true }
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideTooltip();
    });
  }

  // =========================================================================
  // 点击拦截
  // =========================================================================

  function onPointerDown(e) {
    handlePress(e, 'pointerdown');
  }

  function onMouseDown(e) {
    // pointerdown 已拦截的「点词」手势：后续 mouse 事件继续吞掉，防止仍触发进帖
    if (Date.now() < swallowUntil) {
      blockEvent(e);
      return;
    }
    handlePress(e, 'mousedown');
  }

  function onMouseUp(e) {
    if (Date.now() < swallowUntil) blockEvent(e);
  }

  function onClick(e) {
    if (Date.now() < swallowUntil) {
      blockEvent(e);
      return;
    }
    // 极少数环境没有 pointer/mouse down 时的兜底
    handlePress(e, 'click');
  }

  /** 同一原生事件只处理一次 */
  const handledEvents = new WeakSet();

  function handlePress(e, phase) {
    if (!settings.enabled) return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!target || isOurUi(target)) return;

    // 显示更多 / 点赞 / 时间等：永远放行
    if (isAllowedControl(target)) {
      LOG(phase, 'allow control');
      return;
    }

    // 同一 event 对象若被重复派发
    if (handledEvents.has(e)) {
      blockEvent(e);
      return;
    }

    // 核心策略：只有光标下是有效词时才拦截；空白区域放行进帖
    const wordInfo = getWordAtPoint(e.clientX, e.clientY);
    if (!wordInfo || !isValidToken(wordInfo.word, wordInfo.lang, wordInfo.unit)) {
      LOG(phase, 'pass-through (no word)', { target: describeEl(target) });
      return;
    }

    LOG(phase, 'intercept word', {
      word: wordInfo.word.slice(0, 40),
      lang: wordInfo.lang,
      unit: wordInfo.unit,
      target: describeEl(target),
    });

    handledEvents.add(e);
    blockEvent(e);
    swallowUntil = Date.now() + 700;
    void activateWord(wordInfo);
  }

  function blockEvent(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    } catch {
      /* ignore */
    }
  }

  function isOurUi(el) {
    const node = el.nodeType === 1 ? el : el.parentElement;
    return Boolean(
      node?.closest?.(`#${TOOLTIP_ID}, #${STATUS_PILL_ID}, .${HIGHLIGHT_CLASS}`)
    );
  }

  function getArticle(el) {
    const node = el.nodeType === 1 ? el : el.parentElement;
    if (!node) return null;
    return (
      node.closest?.('article[data-testid="tweet"]') ||
      node.closest?.('article') ||
      null
    );
  }

  function isAllowedControl(el) {
    const node = el.nodeType === 1 ? el : el.parentElement;
    if (!node) return false;

    // 「显示更多 / Show more」等展开控件常在正文区域内，必须优先放行
    if (isExpandCollapseControl(node)) return true;

    // 翻译帖子等次要控件
    if (isTranslateControl(node)) return true;

    // 正文内的其它链接/按钮不放行（要能点词）
    if (isInTweetText(node)) return false;

    if (node.closest?.(ALLOW_CLICK_SELS)) return true;

    // 显式用户/时间链接放行；整帖 status 遮罩链接不放行
    const a = node.closest?.('a[href]');
    if (a && !isInTweetText(a)) {
      if (a.closest?.('time') || a.querySelector?.('time')) return true;
      if (a.closest?.('[data-testid="User-Name"]')) return true;
      if (a.closest?.('[data-testid="UserAvatar-Container"]')) return true;
      // 大面积 status 跳转链：拦截
      if (isStatusNavLink(a)) return false;
    }

    return false;
  }

  /**
   * 识别「显示更多 / Show more / Show less」等展开收起控件。
   * X 常把它做成正文末尾的 role=button 或可点击 span，且没有稳定 testid。
   */
  function isExpandCollapseControl(el) {
    if (!el) return false;

    // 已知 / 可能的 testid
    if (
      el.closest?.(
        '[data-testid="tweet-text-show-more-link"], [data-testid="tweet-text-show-less-link"], [data-testid="expanded"], [data-testid="showMore"], [data-testid="show-more"]'
      )
    ) {
      return true;
    }

    let cur = el.nodeType === 1 ? el : el.parentElement;
    for (let depth = 0; cur && depth < 8; depth++, cur = cur.parentElement) {
      if (!cur.getAttribute) continue;

      // 超出当前帖子不再找
      if (cur.tagName === 'ARTICLE') break;

      const testid = cur.getAttribute('data-testid') || '';
      if (/show[-_]?more|show[-_]?less|expand|truncate/i.test(testid)) {
        return true;
      }

      const role = (cur.getAttribute('role') || '').toLowerCase();
      const tag = cur.tagName;
      const isClickable =
        role === 'button' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        cur.hasAttribute('tabindex');

      // 只对「短文本可点击节点」做文案匹配，避免把整段正文当成按钮
      const raw = (cur.innerText || cur.textContent || '').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length > 48) continue;

      if (isExpandCollapseLabel(raw)) {
        // 短文案匹配到「显示更多」即可；若本身可点击更稳
        if (isClickable || depth <= 2) return true;
      }
    }
    return false;
  }

  function isExpandCollapseLabel(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    // 完整或接近完整的按钮文案
    if (
      /^(Show more|Show less|See more|See less|Read more|Read less|显示更多|显示更少|显示较少|收起|展开)$/i.test(
        t
      )
    ) {
      return true;
    }
    // 带省略号/前后缀的变体，如 "… Show more" / "显示更多。"
    if (
      /^(…|\.\.\.|…\s*)?(Show more|Show less|See more|显示更多|显示更少|显示较少|收起|展开)\.?$/i.test(
        t
      )
    ) {
      return true;
    }
    return false;
  }

  /** 翻译相关按钮（常在帖子下方，偶尔也在正文旁） */
  function isTranslateControl(el) {
    if (!el) return false;
    if (el.closest?.('[data-testid="tweetText"] [role="button"]')) {
      // 进一步用文案判断，避免误放行正文里其它 button
    }
    let cur = el.nodeType === 1 ? el : el.parentElement;
    for (let depth = 0; cur && depth < 6; depth++, cur = cur.parentElement) {
      if (cur.tagName === 'ARTICLE') break;
      const raw = (cur.innerText || cur.textContent || '').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length > 40) continue;
      if (
        /^(Translate|翻译帖子|翻译|Show translation|Hide translation|显示翻译|隐藏翻译|View translation)$/i.test(
          raw
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /** X 用来「点卡片进帖」的透明/大链接 */
  function isStatusNavLink(a) {
    if (!a || !a.getAttribute) return false;
    const href = a.getAttribute('href') || '';
    if (!/\/status\/\d+/i.test(href)) return false;
    // 正文里的引用链接也有 status，但通常在 tweetText 内 —— 调用方已排除
    // 几乎无文本、或带 aria-labelledby/空内容，多为导航遮罩
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 80) {
      // 时间链接文本短但在 time 内，已在 allow 处理
      if (a.closest('time')) return false;
      return true;
    }
    return true;
  }

  function isInTweetText(el) {
    const node = el?.nodeType === 1 ? el : el?.parentElement;
    if (!node?.closest) return false;
    return TWEET_TEXT_SELS.some((sel) => node.closest(sel));
  }

  function describeEl(el) {
    if (!el) return '';
    const n = el.nodeType === 1 ? el : el.parentElement;
    if (!n) return '';
    const id = n.id ? `#${n.id}` : '';
    const dt = n.getAttribute?.('data-testid')
      ? `[data-testid="${n.getAttribute('data-testid')}"]`
      : '';
    return `${n.tagName}${id}${dt}`;
  }

  // =========================================================================
  // 取词（穿透 status 遮罩）
  // =========================================================================

  function sourceLangMode() {
    const m = String(settings.sourceLang || 'en').toLowerCase();
    if (m === 'ko' || m === 'ja' || m === 'auto') return m;
    return 'en';
  }

  function minLenFor(lang) {
    if (lang === 'en') return Math.max(1, Number(settings.minWordLength) || 2);
    return 1;
  }

  function isValidToken(word, lang, unit) {
    if (!word) return false;
    if (lang === 'en') {
      if (!EN_WORD_RE.test(word)) return false;
      return word.length >= minLenFor('en');
    }
    // 日韩：整行翻译，只要含对应文字且不太短
    const len = [...word].length;
    if (len < 1 || len > 500) return false;
    if (lang === 'ko') return RE_HANGUL.test(word);
    if (lang === 'ja') return RE_KANA.test(word) || RE_HAN.test(word);
    return false;
  }

  function normalizeSurface(word, lang) {
    const s = String(word || '').replace(/\s+/g, ' ').trim();
    if (lang === 'en') {
      return s
        .toLowerCase()
        .replace(/^[^a-z']+|[^a-z']+$/gi, '');
    }
    return s;
  }

  /** 生词本仅英语：key 就是小写词形 */
  function vocabKey(lang, word) {
    if (lang && lang !== 'en') return '';
    return normalizeSurface(word, 'en');
  }

  function hasNearbyKana(text, offset, radius = 40) {
    const a = Math.max(0, offset - radius);
    const b = Math.min(text.length, offset + radius + 1);
    return RE_KANA.test(text.slice(a, b));
  }

  /** 检测光标字符对应的源语言；中文（纯汉字无假名）返回 null */
  function detectLangAt(text, offset, mode) {
    if (offset < 0 || offset >= text.length) return null;
    const ch = text[offset];
    if (RE_LATIN_WORD.test(ch)) {
      if (mode === 'en' || mode === 'auto') return 'en';
      return null;
    }
    if (RE_HANGUL.test(ch)) {
      if (mode === 'ko' || mode === 'auto') return 'ko';
      return null;
    }
    if (RE_KANA.test(ch)) {
      if (mode === 'ja' || mode === 'auto') return 'ja';
      return null;
    }
    if (RE_HAN.test(ch)) {
      // 纯中文不触发；仅当附近有假名才当日记
      if ((mode === 'ja' || mode === 'auto') && hasNearbyKana(text, offset)) {
        return 'ja';
      }
      return null;
    }
    return null;
  }

  function charTop(node, offset) {
    const text = node.textContent || '';
    if (!text.length) return null;
    let i = offset;
    if (i >= text.length) i = text.length - 1;
    if (i < 0) return null;
    try {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      const rect = r.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;
      return rect.top;
    } catch {
      return null;
    }
  }

  /**
   * 取视觉上的「整行」文本（跨 span 文本节点），用于日/韩整行翻译
   */
  function getVisualLineSpan(textNode, offset) {
    const root =
      textNode.parentElement?.closest?.(
        '[data-testid="tweetText"], [data-testid="card.layoutLarge.detail"], [data-testid="UserDescription"]'
      ) || textNode.parentElement;

    const baseTop = charTop(textNode, offset);
    if (baseTop == null || !root) return null;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    let line = '';
    let firstNode = null;
    let firstStart = 0;
    let lastNode = null;
    let lastEnd = 0;
    const TOP_TOL = 4;

    for (const n of nodes) {
      const t = n.textContent || '';
      for (let i = 0; i < t.length; i++) {
        const top = charTop(n, i);
        if (top == null) continue;
        if (Math.abs(top - baseTop) <= TOP_TOL) {
          if (!firstNode) {
            firstNode = n;
            firstStart = i;
          }
          lastNode = n;
          lastEnd = i + 1;
          line += t[i];
        }
      }
    }

    line = line.replace(/\s+/g, ' ').trim();
    if (!line || !firstNode || !lastNode) return null;

    // 过长截断（翻译 API 限制）
    if (line.length > 400) line = line.slice(0, 400);

    return {
      text: line,
      firstNode,
      firstStart,
      lastNode,
      lastEnd,
    };
  }

  /**
   * 英语：按词；日/韩：识别到则整行
   */
  function expandTokenAt(text, offset, textNode) {
    if (offset < 0 || offset >= text.length) return null;
    const mode = sourceLangMode();
    const lang = detectLangAt(text, offset, mode);
    if (!lang) return null;

    if (lang === 'en') {
      const ch = text[offset];
      if (!RE_LATIN_WORD.test(ch)) return null;
      let start = offset;
      let end = offset;
      while (start > 0 && RE_LATIN_WORD.test(text[start - 1])) start--;
      while (end < text.length - 1 && RE_LATIN_WORD.test(text[end + 1])) end++;
      end += 1;
      const word = text.slice(start, end).replace(/^'+|'+$/g, '');
      if (!isValidToken(word, 'en')) return null;
      return {
        start,
        end,
        lang: 'en',
        word,
        unit: 'word',
        rangeNode: textNode,
        rangeEndNode: textNode,
        rangeEndOffset: end,
      };
    }

    // 日 / 韩：整行翻译
    const line = getVisualLineSpan(textNode, offset);
    if (!line || !isValidToken(line.text, lang, 'line')) return null;
    return {
      start: line.firstStart,
      end: line.lastEnd,
      lang,
      word: line.text,
      unit: 'line',
      rangeNode: line.firstNode,
      rangeEndNode: line.lastNode,
      rangeEndOffset: line.lastEnd,
    };
  }

  /**
   * 暂时关闭遮罩 pointer-events，再用 caretRangeFromPoint 取词
   */
  function getWordAtPoint(x, y) {
    const disabled = [];
    try {
      const stack = document.elementsFromPoint(x, y) || [];
      for (const el of stack) {
        if (!el || el === tooltipEl || el.id === STATUS_PILL_ID) continue;
        if (el.classList?.contains(HIGHLIGHT_CLASS)) {
          disablePe(el, disabled);
          continue;
        }
        // 遮在正文上的 status 导航链
        const a =
          el.tagName === 'A'
            ? el
            : el.closest?.('a[href*="/status/"], a[href*="status"]');
        if (a && !isInTweetText(a) && isStatusNavLink(a)) {
          disablePe(a, disabled);
          continue;
        }
        // 已碰到正文，停止剥层
        if (isInTweetText(el)) break;
        // 其它挡在正文前的空 div 遮罩
        if (
          el.tagName === 'DIV' &&
          !isInTweetText(el) &&
          getArticle(el) &&
          !(el.textContent || '').trim() &&
          el.childElementCount === 0
        ) {
          disablePe(el, disabled);
        }
      }

      return readWordFromCaret(x, y);
    } finally {
      for (const el of disabled) {
        try {
          el.style.pointerEvents = el.dataset.tranxPePrev || '';
          delete el.dataset.tranxPePrev;
        } catch {
          /* ignore */
        }
      }
    }
  }

  function disablePe(el, bag) {
    if (!el || bag.includes(el)) return;
    el.dataset.tranxPePrev = el.style.pointerEvents || '';
    el.style.pointerEvents = 'none';
    bag.push(el);
  }

  function readWordFromCaret(x, y) {
    let range = null;
    try {
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos?.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
    } catch {
      return null;
    }
    if (!range?.startContainer) return null;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    if (!isInTweetText(node.parentElement)) {
      // 不在标准 tweetText 时：只要在 article 内也尝试（兼容 DOM 变化）
      if (!getArticle(node.parentElement)) return null;
    }

    const text = node.textContent || '';
    const offset = range.startOffset;

    // 行尾/空白：不 snap 到前一个字符
    if (offset < 0 || text.length === 0) return null;
    if (offset >= text.length) return null;

    const token = expandTokenAt(text, offset, node);
    if (!token) return null;

    const { lang, word, unit } = token;

    const wordRange = document.createRange();
    try {
      wordRange.setStart(token.rangeNode || node, token.start);
      wordRange.setEnd(
        token.rangeEndNode || token.rangeNode || node,
        token.rangeEndOffset != null ? token.rangeEndOffset : token.end
      );
    } catch {
      return null;
    }

    // 指针必须落在该片段像素矩形内
    if (!pointHitsRange(x, y, wordRange, unit === 'line' ? 2 : 1)) return null;

    const rect = wordRange.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return { word, lang, unit: unit || 'word', rect, node, start: token.start, end: token.end };
  }

  /** 判断 (x,y) 是否落在 range 的任一 client rect 内 */
  function pointHitsRange(x, y, range, pad = 1) {
    let rects;
    try {
      rects = range.getClientRects();
    } catch {
      return false;
    }
    if (!rects || !rects.length) return false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad
      ) {
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // 收藏
  // =========================================================================

  async function activateWord(wordInfo) {
    const word = wordInfo.word;
    const lang = wordInfo.lang || 'en';
    const canSave = lang === 'en';
    const key = canSave ? vocabKey('en', word) : `view:${lang}:${truncateLabel(word, 48)}`;
    LOG('activateWord', key, canSave ? 'savable' : 'view-only');

    markHighlight(wordInfo.rect);
    clearTimeout(hideTimer);

    let entry = currentEntry;
    if (currentKey !== key || !entry) {
      currentWord = canSave ? normalizeSurface(word, 'en') : word;
      currentLang = lang;
      currentKey = key;
      currentEntry = null;
      currentSaved = false;
      renderLoading(truncateLabel(word), wordInfo.rect);
      try {
        entry = await lookupWord(word, lang, wordInfo.unit);
        if (currentKey !== key) return;
        currentEntry = entry;
        currentSaved = canSave ? await vocabHas(word) : false;
        renderResult(entry, wordInfo.rect);
      } catch (err) {
        LOG('lookup failed', err);
        if (currentKey !== key) return;
        renderError(
          truncateLabel(word),
          String(err?.message || err || '查询失败'),
          wordInfo.rect
        );
        return;
      }
    } else {
      positionTooltip(wordInfo.rect);
      tooltipEl?.classList.add('tranx-visible');
    }

    // 非英语：只展示翻译，不进入生词本
    if (!canSave) {
      updateClickHint();
      return;
    }

    const mode = settings.clickInterceptMode === 'nth' ? 'nth' : 'all';
    const need = Math.max(1, Math.min(10, Number(settings.clickInterceptN) || 1));

    if (mode === 'all' || need <= 1) {
      resetStreak();
      await doToggle(word, entry);
      return;
    }

    if (streakWord !== key) {
      streakWord = key;
      streakCount = 1;
    } else {
      streakCount += 1;
    }
    bumpStreakTimer();

    if (streakCount < need) {
      updateClickHint();
      return;
    }
    resetStreak();
    await doToggle(word, entry);
  }

  function truncateLabel(s, max = 28) {
    const t = String(s || '');
    if ([...t].length <= max) return t;
    return [...t].slice(0, max).join('') + '…';
  }

  async function lookupWord(word, lang, unit) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'LOOKUP_WORD',
        word,
        lang: lang || 'en',
        unit: unit || (lang === 'en' ? 'word' : 'line'),
      });
      if (res?.ok && res.data) return res.data;
      if (res && res.ok === false) throw new Error(res.error || '查询失败');
    } catch (err) {
      LOG('LOOKUP_WORD message failed', err);
    }
    throw new Error('词典服务不可用，请在扩展页检查 Service Worker');
  }

  async function vocabHas(word) {
    const key = vocabKey('en', word);
    if (!key) return false;
    try {
      const store = await chrome.storage.local.get(VOCAB_KEY);
      const map = store[VOCAB_KEY] || {};
      // 新格式 word→timestamp；兼容旧 en:word / 对象
      if (map[key] != null) return true;
      if (map[`en:${key}`] != null) return true;
      if (map[key] && typeof map[key] === 'object') return true;
      return false;
    } catch {
      return false;
    }
  }

  async function doToggle(word, entry) {
    if (!entry || toggleLock) return;
    toggleLock = true;
    try {
      const result = await vocabToggle(word);
      currentSaved = result.saved;
      currentKey = result.id || vocabKey('en', word);
      currentLang = 'en';
      updateSavedBadge();
      updateClickHint();
      LOG('toggle', currentKey, currentSaved);
    } catch (err) {
      LOG('toggle failed', err);
    } finally {
      setTimeout(() => {
        toggleLock = false;
      }, 280);
    }
  }

  /** 仅英语：storage 为 { [word]: addedAt } */
  async function vocabToggle(rawWord) {
    const w = normalizeSurface(rawWord, 'en');
    if (!w) throw new Error('empty word');

    const store = await chrome.storage.local.get(VOCAB_KEY);
    const map =
      store[VOCAB_KEY] && typeof store[VOCAB_KEY] === 'object'
        ? { ...store[VOCAB_KEY] }
        : {};

    // 清理可能的旧 key
    const legacy = `en:${w}`;
    const exists = map[w] != null || map[legacy] != null;

    if (exists) {
      delete map[w];
      delete map[legacy];
      await chrome.storage.local.set({ [VOCAB_KEY]: map });
      return { saved: false, word: w, lang: 'en', id: w };
    }

    map[w] = Date.now();
    // 顺带去掉旧对象形态
    delete map[legacy];
    await chrome.storage.local.set({ [VOCAB_KEY]: map });
    return { saved: true, word: w, lang: 'en', id: w };
  }

  function resetStreak() {
    streakWord = '';
    streakCount = 0;
    if (streakTimer) clearTimeout(streakTimer);
    streakTimer = null;
  }

  function bumpStreakTimer() {
    if (streakTimer) clearTimeout(streakTimer);
    streakTimer = setTimeout(() => resetStreak(), 2500);
  }

  // =========================================================================
  // 悬浮
  // =========================================================================

  function onMouseMove(e) {
    if (!settings.enabled) return;
    const target = e.target;
    // 移到我们自己的 tooltip/高亮上时不立刻隐藏（避免闪烁），但空白处必须收起
    if (!target || isOurUi(target)) return;

    const wordInfo = getWordAtPoint(e.clientX, e.clientY);
    // 光标下没有有效词（含帖子空白、行尾空白、中文）→ 一律隐藏
    if (!wordInfo || !isValidToken(wordInfo.word, wordInfo.lang, wordInfo.unit)) {
      scheduleHide();
      return;
    }

    const key = vocabKey(wordInfo.lang, wordInfo.word);
    if (key === currentKey && tooltipEl?.classList.contains('tranx-visible')) {
      clearTimeout(hideTimer);
      return;
    }

    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showWord(wordInfo), Math.max(0, Number(settings.delay) || 0));
  }

  async function showWord(wordInfo) {
    const word = wordInfo.word;
    const lang = wordInfo.lang || 'en';
    const key = vocabKey(lang, word);
    currentWord = normalizeSurface(word, lang);
    currentLang = lang;
    currentKey = key;
    currentEntry = null;
    currentSaved = false;
    const token = ++lastLookupToken;

    markHighlight(wordInfo.rect);
    renderLoading(truncateLabel(word), wordInfo.rect);

    try {
      const entry = await lookupWord(word, lang, wordInfo.unit);
      if (token !== lastLookupToken) return;
      currentEntry = entry;
      currentSaved = lang === 'en' ? await vocabHas(word) : false;
      renderResult(entry, wordInfo.rect);
    } catch (err) {
      if (token !== lastLookupToken) return;
      renderError(truncateLabel(word), String(err?.message || err), wordInfo.rect);
    }
  }

  // =========================================================================
  // UI
  // =========================================================================

  function renderLoading(word, rect) {
    ensureTooltip();
    tooltipEl.querySelector('.tranx-word').textContent = word;
    tooltipEl.querySelector('.tranx-phonetic').textContent = '';
    tooltipEl.querySelector('.tranx-source').textContent = '';
    const hint = tooltipEl.querySelector('.tranx-hint-click');
    if (hint) hint.hidden = true;
    updateSavedBadge(true);
    tooltipEl.querySelector('.tranx-body').innerHTML =
      '<div class="tranx-loading"><span class="tranx-spinner"></span>查询中…</div>';
    positionTooltip(rect);
    tooltipEl.classList.add('tranx-visible');
    tooltipEl.classList.remove('tranx-error');
  }

  function renderResult(data, rect) {
    ensureTooltip();
    const isLine = data.unit === 'line' || currentLang === 'ko' || currentLang === 'ja';
    const title = isLine
      ? truncateLabel(data.word || currentWord, 32)
      : data.word || currentWord;
    tooltipEl.querySelector('.tranx-word').textContent = title;
    tooltipEl.querySelector('.tranx-phonetic').textContent =
      !isLine && settings.showPhonetic && data.phonetic ? data.phonetic : '';

    const lines = [];
    if (isLine && data.word && data.word !== title) {
      // 原文过长时在正文里展示完整一行
      lines.push(
        `<div class="tranx-meaning tranx-src-line"><span class="tranx-zh">${escapeHtml(data.word)}</span></div>`
      );
      lines.push('<div class="tranx-divider"></div>');
    }
    for (const m of data.meanings || []) {
      const pos =
        settings.showPos && m.pos
          ? `<span class="tranx-pos">${escapeHtml(m.pos)}</span>`
          : '';
      lines.push(
        `<div class="tranx-meaning">${pos}<span class="tranx-zh">${escapeHtml(m.zh)}</span></div>`
      );
    }
    if (!isLine && settings.showEnglish && data.englishDefs?.length) {
      lines.push('<div class="tranx-divider"></div>');
      for (const d of data.englishDefs.slice(0, 2)) {
        const pos = d.pos
          ? `<span class="tranx-pos">${escapeHtml(d.pos)}</span>`
          : '';
        lines.push(
          `<div class="tranx-meaning tranx-en">${pos}<span class="tranx-en-text">${escapeHtml(d.en)}</span></div>`
        );
      }
    }
    tooltipEl.querySelector('.tranx-body').innerHTML = lines.length
      ? lines.join('')
      : '<div class="tranx-empty">暂无释义</div>';

    const sourceMap = {
      youdao: '有道词典',
      mymemory: '机器翻译',
      dictionary: 'Dictionary',
    };
    const unitTag = isLine ? '整行' : '';
    const src = sourceMap[data.source] || '';
    tooltipEl.querySelector('.tranx-source').textContent = [
      unitTag,
      src,
      data.fromCache ? '缓存' : '',
    ]
      .filter(Boolean)
      .join(' · ');

    updateClickHint();
    updateSavedBadge();
    tooltipEl.classList.add('tranx-visible');
    tooltipEl.classList.remove('tranx-error');
    positionTooltip(rect);
  }

  function renderError(word, msg, rect) {
    ensureTooltip();
    tooltipEl.querySelector('.tranx-word').textContent = word;
    tooltipEl.querySelector('.tranx-phonetic').textContent = '';
    tooltipEl.querySelector('.tranx-source').textContent = '';
    const hint = tooltipEl.querySelector('.tranx-hint-click');
    if (hint) hint.hidden = true;
    currentEntry = null;
    updateSavedBadge(true);
    tooltipEl.querySelector('.tranx-body').innerHTML =
      `<div class="tranx-empty">${escapeHtml(msg)}</div>`;
    tooltipEl.classList.add('tranx-visible', 'tranx-error');
    positionTooltip(rect);
  }

  function ensureTooltip() {
    if (!tooltipEl || !document.contains(tooltipEl)) createTooltip();
  }

  function updateClickHint() {
    const hintEl = tooltipEl?.querySelector('.tranx-hint-click');
    if (!hintEl || !currentEntry) {
      if (hintEl) hintEl.hidden = true;
      return;
    }
    hintEl.hidden = false;
    const mode = settings.clickInterceptMode === 'nth' ? 'nth' : 'all';
    const need = Math.max(1, Math.min(10, Number(settings.clickInterceptN) || 1));
    if (currentLang !== 'en') {
      hintEl.textContent =
        currentLang === 'ko' ? '韩·整行 · 不可收藏' : '日·整行 · 不可收藏';
      return;
    }
    if (currentSaved) {
      hintEl.textContent =
        mode === 'nth' && need > 1 ? `再点 ${need} 次取消` : '再点取消收藏';
      return;
    }
    if (mode === 'nth' && need > 1) {
      const left =
        streakWord === currentKey ? Math.max(0, need - streakCount) : need;
      hintEl.textContent =
        left > 0 ? `再点 ${left} 次收藏` : '点击收藏';
    } else {
      hintEl.textContent = '点击收藏';
    }
  }

  function updateSavedBadge(forceHide) {
    const badge = tooltipEl?.querySelector('.tranx-saved-badge');
    if (!badge) return;
    badge.hidden = forceHide || !currentSaved;
  }

  function positionTooltip(rect) {
    ensureTooltip();
    if (!rect) return;
    tooltipEl.style.left = '0px';
    tooltipEl.style.top = '0px';
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.classList.add('tranx-visible');

    const tipRect = tooltipEl.getBoundingClientRect();
    const gap = 10;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - gap;
    if (top < 8) {
      top = rect.bottom + gap;
      tooltipEl.classList.add('tranx-below');
    } else {
      tooltipEl.classList.remove('tranx-below');
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));
    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.visibility = 'visible';
  }

  function markHighlight(rect) {
    clearHighlight();
    if (!rect || !rect.width) return;
    highlightEl = document.createElement('div');
    highlightEl.className = HIGHLIGHT_CLASS;
    highlightEl.style.left = `${rect.left}px`;
    highlightEl.style.top = `${rect.top}px`;
    highlightEl.style.width = `${rect.width}px`;
    highlightEl.style.height = `${rect.height}px`;
    document.documentElement.appendChild(highlightEl);
  }

  function clearHighlight() {
    if (highlightEl) {
      highlightEl.remove();
      highlightEl = null;
    }
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    // 移出单词后立即收起，无延迟
    hideTooltip();
  }

  function hideTooltip() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    currentWord = '';
    currentLang = 'en';
    currentKey = '';
    currentEntry = null;
    currentSaved = false;
    lastLookupToken++;
    clearHighlight();
    if (!tooltipEl) return;
    tooltipEl.classList.remove('tranx-visible');
    tooltipEl.style.visibility = 'hidden';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
