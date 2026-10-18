// 學習者的名字：整套課的範例（櫃檯對話、通行證、JWT 內容）都用這個名字
(() => {
  const KEY = 'jwks-course:name';
  const FALLBACK = '小明';
  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  const read = () => { try { return clean(localStorage.getItem(KEY)); } catch (e) { return ''; } };
  window.jwksName = () => read() || FALLBACK;
  window.jwksHasName = () => !!read();
  window.jwksNameHTML = () => window.jwksName().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = () => document.querySelectorAll('[data-name]').forEach((el) => { el.textContent = window.jwksName(); });
  window.jwksSetName = (v) => {
    try { const c = clean(v); if (c) localStorage.setItem(KEY, c); else localStorage.removeItem(KEY); } catch (e) {}
    fill();
    document.dispatchEvent(new CustomEvent('jwks:name'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
// 首頁的名字欄位（有的話就接上）
(() => {
  const bind = () => {
    const input = document.getElementById('learner-name');
    if (!input) return;
    input.value = window.jwksHasName() ? window.jwksName() : '';
    input.addEventListener('input', () => window.jwksSetName(input.value));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();

// JWKS 小學堂：共用邏輯
// 1. 課程頁：一畫面一步驟、進度點、上一步／下一步、完成蓋章
// 2. 首頁：集章卡、「開始／繼續上課」按鈕
(() => {
  // 剪報標題：把 .ransom 的每個字拆開，套上不同「報紙」樣式，固定亂數讓每次看到都一樣
  document.querySelectorAll('.ransom').forEach((h, n) => {
    if (getComputedStyle(h).getPropertyValue('--ransom').trim() !== '1') return;
    const text = h.textContent.trim();
    h.setAttribute('aria-label', text);
    const styles = ['c1', 'c2', 'c3', 'c4', 'c5'];
    let seed = 17 + n * 31, prev = '';
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    h.innerHTML = [...text].map((ch) => {
      if (!ch.trim()) return '<span class="cut space" aria-hidden="true"> </span>';
      let c;
      do { c = styles[Math.floor(rnd() * styles.length)]; } while (c === prev);
      prev = c;
      const r = (rnd() * 8 - 4).toFixed(1), y = (rnd() * 6 - 3).toFixed(1);
      return `<span class="cut ${c}" aria-hidden="true" style="--r:${r}deg;--y:${y}px">${ch}</span>`;
    }).join('');
  });

  const KEY = 'jwks-course:done';

  const getDone = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  };
  const markDone = (id) => {
    try {
      const s = new Set(getDone());
      s.add(id);
      localStorage.setItem(KEY, JSON.stringify([...s]));
    } catch (e) { /* 無痕模式等情況存不了，就只是不記進度 */ }
  };
  // 印章：大多數時候蓋「學會」，偶爾會出現彩蛋章。
  // 每一課抽到哪個章會記下來，之後回首頁看到的都是同一個。
  const SKEY = 'jwks-course:stamps';
  const VARIANTS = [['learn', 55], ['right', 20], ['awesome', 15], ['cat', 10]];
  const pickStamp = () => {
    let r = Math.random() * 100;
    for (const [v, w] of VARIANTS) { if ((r -= w) < 0) return v; }
    return 'learn';
  };
  const getStamps = () => {
    try { const v = JSON.parse(localStorage.getItem(SKEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
    catch (e) { return {}; }
  };
  const saveStamp = (id, v) => {
    try { const s = getStamps(); s[id] = v; localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
  };
  const CAT =
    '<svg viewBox="0 0 40 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 30C4 22 5 15 8 10L7 2l7.5 5c3.5-1 7.5-1 11 0L33 2l-1 8c3 5 4 12 2 20z"/>' +
    '<path d="M11.5 17.5q3-1.6 6 0M22.5 17.5q3-1.6 6 0"/>' +
    '<path d="M13 16.6h3.4M24 16.6h3.4" stroke-width="1.6"/>' +
    '<path d="M19 21h2l-1 1.3z" fill="currentColor"/>' +
    '<path d="M16.5 24q1.75 1.6 3.5 0q1.75 1.6 3.5 0"/>' +
    '<path d="M3 20.5l6 .8M3 24l6-.6M37 20.5l-6 .8M37 24l-6-.6" stroke-width="1.5"/></svg>';
  const stampHTML = (v) => {
    switch (v) {
      case 'right':
        return '<span class="stamp stamp-right" role="img" aria-label="全對"><span>全對</span></span>';
      case 'awesome':
        return '<span class="stamp stamp-awesome" role="img" aria-label="我他媽超屌"><span>我他媽</span><span>超屌！</span></span>';
      case 'cat':
        return '<span class="stamp stamp-cat" role="img" aria-label="貓咪認證">' + CAT + '<span>認證</span></span>';
      default:
        return '<span class="stamp stamp-learn" role="img" aria-label="已學會"><span>學</span><span>會</span></span>';
    }
  };
  const stampFor = (id) => getStamps()[id] || 'learn';

  // ───── 課程頁 ─────
  const lesson = document.querySelector('[data-lesson]');
  if (lesson) {
    const id = lesson.dataset.lesson;
    const steps = [...lesson.querySelectorAll('.step')];
    const dots = lesson.querySelector('.dots');
    const label = lesson.querySelector('.progress-text');
    const prev = document.querySelector('[data-prev]');
    const next = document.querySelector('[data-next]');
    let cur = 0;

    steps.forEach(() => {
      const d = document.createElement('span');
      d.className = 'dot';
      dots.appendChild(d);
    });

    const show = (i, moveFocus) => {
      cur = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((s, k) => s.classList.toggle('active', k === cur));
      [...dots.children].forEach((d, k) => {
        d.classList.toggle('on', k === cur);
        d.classList.toggle('past', k < cur);
      });
      label.textContent = `第 ${cur + 1} 步，共 ${steps.length} 步`;
      prev.disabled = cur === 0;
      next.hidden = cur === steps.length - 1;
      history.replaceState(null, '', '#' + (cur + 1));
      if (moveFocus) {
        window.scrollTo({ top: 0 });
        const h = steps[cur].querySelector('h1, h2');
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }
    };

    prev.addEventListener('click', () => show(cur - 1, true));
    next.addEventListener('click', () => show(cur + 1, true));
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight' && cur < steps.length - 1) show(cur + 1, true);
      if (e.key === 'ArrowLeft' && cur > 0) show(cur - 1, true);
    });

    const fromHash = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(fromHash) ? fromHash - 1 : 0, false);

    // 完成蓋章
    const slot = lesson.querySelector('.slot');
    const doneBtn = lesson.querySelector('[data-complete]');
    const after = lesson.querySelector('.after-complete');
    const setStamped = (animate) => {
      slot.innerHTML = stampHTML(stampFor(id));
      slot.classList.add('filled');
      if (animate) slot.firstElementChild.classList.add('stamp-in');
      doneBtn.hidden = true;
      after.hidden = false;
    };
    if (slot && doneBtn && after) {
      if (getDone().includes(id)) setStamped(false);
      doneBtn.addEventListener('click', () => { markDone(id); saveStamp(id, pickStamp()); setStamped(true); });
    }
  }

  // ───── 首頁集章卡 ─────
  const card = document.querySelector('[data-stampcard]');
  if (card) {
    const done = getDone();
    card.querySelectorAll('li[data-id]').forEach((li) => {
      if (done.includes(li.dataset.id)) {
        const s = li.querySelector('.slot');
        s.innerHTML = stampHTML(stampFor(li.dataset.id));
        s.classList.add('filled');
      }
    });

    const count = document.querySelector('[data-count]');
    if (count) count.textContent = card.querySelectorAll('.slot.filled').length;

    const start = document.querySelector('[data-start]');
    const links = [...card.querySelectorAll('li[data-id] a')];
    const nextLink = links.find((a) => !done.includes(a.closest('li').dataset.id));
    if (start && done.length > 0) {
      if (nextLink) {
        start.textContent = '繼續上課';
        start.href = nextLink.getAttribute('href');
      } else {
        start.textContent = '從第 1 課複習';
      }
    }
  }
})();
