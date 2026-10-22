// Прості SVG-графіки без бібліотек.
// Кольори ліній — токени --series-1…3 у styles.css (перевірені на розрізнення при дальтонізмі).

import { h } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export const RATING_SERIES = [
  { id: 'clarity', label: 'Чіткість', color: 'var(--series-1)' },
  { id: 'logic', label: 'Логіка', color: 'var(--series-2)' },
  { id: 'confidence', label: 'Впевненість', color: 'var(--series-3)' },
];

const shortDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const fullDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Графік самооцінок 1–5: по точці на кожен виступ, останні `limit` виступів.
export function ratingChart(allRatings, { limit = 20 } = {}) {
  const ratings = allRatings.slice(-limit);
  const el = h('div', { class: 'chart' });

  if (ratings.length < 2) {
    el.append(h('p', { class: 'muted small' }, ratings.length
      ? 'Ще один виступ із самооцінкою — і тут з’явиться графік динаміки.'
      : 'Оцініть свій виступ після будь-якої вправи — і тут з’явиться графік динаміки.'));
    return { el, destroy() {} };
  }

  const last = ratings.at(-1);
  const legend = h('ul', { class: 'chart__legend' }, RATING_SERIES.map((s) => h('li', null,
    h('span', { class: 'chart__swatch', style: `background:${s.color}` }), s.label, ' ', h('b', null, String(last[s.id])))));
  const plot = h('div', { class: 'chart__plot' });
  const tooltip = h('div', { class: 'chart__tooltip', role: 'status' });
  plot.append(tooltip);

  const table = h('details', { class: 'details' },
    h('summary', null, 'Таблиця'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Дата'), RATING_SERIES.map((s) => h('th', null, s.label)))),
      h('tbody', null, [...ratings].reverse().map((r) => h('tr', null,
        h('td', null, shortDate.format(r.ts)), RATING_SERIES.map((s) => h('td', null, String(r[s.id]))))))))
  );

  el.append(legend, plot, table);

  function draw() {
    plot.querySelector('svg')?.remove();
    const width = Math.max(240, plot.clientWidth);
    const height = 180;
    const pad = { top: 12, right: 92, bottom: 26, left: 22 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (ratings.length === 1 ? innerW / 2 : (i / (ratings.length - 1)) * innerW);
    const y = (v) => pad.top + ((5 - v) / 4) * innerH;

    const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Графік самооцінок за останні виступи' });

    // Сітка й підписи осі Y (1–5) — приглушені.
    for (let v = 1; v <= 5; v++) {
      root.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: 'chart__grid' }));
      const t = svg('text', { x: pad.left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'chart__axis' });
      t.textContent = String(v);
      root.append(t);
    }
    // Підписи осі X: перша й остання дата.
    [[0, 'start'], [ratings.length - 1, 'end']].forEach(([i, anchor]) => {
      const t = svg('text', { x: x(i), y: height - 6, 'text-anchor': anchor, class: 'chart__axis' });
      t.textContent = shortDate.format(ratings[i].ts);
      root.append(t);
    });

    for (const s of RATING_SERIES) {
      const d = ratings.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[s.id]).toFixed(1)}`).join(' ');
      root.append(svg('path', { d, class: 'chart__line', style: `stroke:${s.color}` }));
      const end = ratings.length - 1;
      root.append(svg('circle', { cx: x(end), cy: y(ratings[end][s.id]), r: 4, class: 'chart__dot', style: `fill:${s.color}` }));
    }

    // Підписи на кінцях ліній (назва + значення): розсуваємо, щоб не налазили один на одного.
    const labels = RATING_SERIES.map((s) => ({ s, y: y(last[s.id]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
    for (const { s, y: ly } of labels) {
      const t = svg('text', { x: width - pad.right + 10, y: ly + 4, class: 'chart__end' });
      const value = svg('tspan', { class: 'chart__end-value' });
      value.textContent = ` ${last[s.id]}`;
      t.append(s.label, value);
      root.append(t);
    }

    // Шар наведення: вертикальна лінія + підказка з усіма трьома значеннями.
    const cross = svg('line', { y1: pad.top, y2: pad.top + innerH, class: 'chart__cross' });
    const hit = svg('rect', { x: pad.left - 10, y: 0, width: innerW + 20, height, fill: 'transparent' });
    root.append(cross, hit);

    const show = (clientX) => {
      const box = root.getBoundingClientRect();
      const px = ((clientX - box.left) / box.width) * width;
      const i = Math.max(0, Math.min(ratings.length - 1, Math.round(((px - pad.left) / innerW) * (ratings.length - 1))));
      const r = ratings[i];
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.classList.add('is-visible');
      tooltip.replaceChildren(
        h('div', { class: 'chart__tooltip-date' }, fullDate.format(r.ts)),
        ...RATING_SERIES.map((s) => h('div', null, h('span', { class: 'chart__swatch', style: `background:${s.color}` }), `${s.label}: `, h('b', null, String(r[s.id])))),
      );
      tooltip.classList.add('is-visible');
      const left = (x(i) / width) * plot.clientWidth;
      tooltip.style.left = `${Math.min(Math.max(left, 70), plot.clientWidth - 70)}px`;
    };
    const hide = () => {
      cross.classList.remove('is-visible');
      tooltip.classList.remove('is-visible');
    };
    // Мишею: підказка, поки курсор над графіком. Дотиком: після відпускання пальця
    // браузер одразу шле pointerleave, тому ховаємо підказку через 3 секунди.
    let hideTimer = 0;
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerdown', (e) => {
      show(e.clientX);
      clearTimeout(hideTimer);
      if (e.pointerType !== 'mouse') hideTimer = setTimeout(hide, 3000);
    });
    hit.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });

    plot.prepend(root);
  }

  // Перемальовуємо лише при зміні ширини (висота змінюється від самого малювання).
  let drawnWidth = 0;
  const observer = new ResizeObserver(() => {
    if (plot.clientWidth === drawnWidth) return;
    drawnWidth = plot.clientWidth;
    draw();
  });
  observer.observe(plot);

  return { el, destroy: () => observer.disconnect() };
}
