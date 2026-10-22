// Спільні елементи інтерфейсу: створення DOM, іконки, тости, форматування.

import { MIC_MESSAGES } from './recorder.js';

// h('div', { class: 'card', onClick: fn }, 'текст', child) — короткий спосіб створити елемент.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  today: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/>',
  voice: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  thought: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8V16h6v-.1c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z"/>',
  poetry: '<path d="M2.5 5H8a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2.5z"/><path d="M21.5 5H16a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h6.5z"/>',
  progress: '<path d="M3 20.5h18M6.5 20.5v-6M12 20.5v-11M17.5 20.5V5"/>',
  themeAuto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  wind: '<path d="M3 8h10.5a3 3 0 1 0-3-3M3 12h15.5a3 3 0 1 1-3 3M3 16h6"/>',
  word: '<path d="M3 19 7.8 5.5h1.4L14 19M4.7 14.5h7.6"/><path d="M16 12.3c.7-.7 1.6-1.1 2.6-1.1 1.7 0 2.9 1 2.9 2.7V19M21.5 15.4c-3.7 0-5.6.7-5.6 2 0 1 .8 1.6 1.9 1.6 2.1 0 3.7-1.4 3.7-3.6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  flame: '<path d="M12 21.5c-3.9 0-6.5-2.7-6.5-6.3 0-3.4 2.4-5.4 3.7-7.7.5 1.7 1.3 2.8 2.5 3.3-.2-3.3 1.3-6.1 3.6-8.3.3 3 1.8 4.9 3.1 6.8a8.6 8.6 0 0 1 1.6 5.6c0 3.8-3.4 6.6-8 6.6z"/>',
  trophy: '<path d="M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V7A3.5 3.5 0 0 0 8 10.5M17 5.5h2.5V7a3.5 3.5 0 0 1-3.5 3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 3 3 5-6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/>',
  shuffle: '<path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8c1 1.6 2.3 2.6 4.3 2.6H21M3 17h3.5c1.4 0 2.4-.5 3.3-1.4M14.2 8.4c.9-.9 1.9-1.4 3.3-1.4H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

let toastTimer = 0;
export function toast(text, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Збирає функції очищення віджетів екрана: scope.use(widget) повертає widget.el.
export function disposer() {
  const fns = [];
  return {
    use(widget) {
      fns.push(widget.destroy);
      return widget.el;
    },
    add(fn) {
      fns.push(fn);
    },
    dispose() {
      fns.splice(0).forEach((fn) => fn());
    },
  };
}

// plural(5, ['день', 'дні', 'днів']) → 'днів'
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 75 → «1 хв 15 с», 40 → «40 с»
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  if (!m) return `${s} с`;
  return s % 60 ? `${m} хв ${s % 60} с` : `${m} хв`;
}

// «ле́гіт» → [«л», <span class="stress">е</span>, «гіт»].
// Наголос малюємо стилем: комбінований знак ́ у багатьох шрифтах стає не над тією літерою.
export function stressed(text) {
  const parts = text.split('́');
  return parts.flatMap((part, k) => {
    if (k === parts.length - 1) return [part];
    return [part.slice(0, -1), h('span', { class: 'stress' }, part.slice(-1))];
  }).filter((p) => p !== '');
}

export function micNotice(code) {
  const msg = MIC_MESSAGES[code] ?? MIC_MESSAGES.failed;
  return h('div', { class: 'notice', role: 'alert' }, h('strong', null, msg.title), h('p', null, msg.text));
}
