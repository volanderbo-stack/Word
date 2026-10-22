// Точка входу: нижнє меню, перемикання вкладок, тема, service worker.

import { checkBadges } from './badges.js';
import { getState, setTheme, subscribe } from './state.js';
import { h, icon, toast } from './ui.js';
import * as today from './views/today.js';
import * as voice from './views/voice.js';
import * as thought from './views/thought.js';
import * as poetry from './views/poetry.js';
import * as progress from './views/progress.js';

// Порядок тут = порядок вкладок у нижньому меню. Адреса вкладки: #/назва.
const ROUTES = { today, voice, thought, poetry, progress };
const DEFAULT_ROUTE = 'today';

const THEMES = ['auto', 'light', 'dark'];
const THEME_LABELS = { auto: 'як у системі', light: 'світла', dark: 'темна' };
const THEME_ICONS = { auto: 'themeAuto', light: 'sun', dark: 'moon' };

const root = document.documentElement;
const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const tabbarEl = document.getElementById('tabbar');
const themeBtn = document.getElementById('theme-toggle');

let cleanup = null;

function buildTabbar() {
  const tabs = Object.entries(ROUTES).map(([name, view]) =>
    h('a', { class: 'tab', href: `#/${name}`, 'data-route': name }, icon(view.tabIcon), h('span', null, view.tabLabel)),
  );
  tabbarEl.append(h('div', { class: 'tabbar__inner' }, tabs));
}

// #/today/warmup → { name: 'today', params: ['warmup'] }
function currentRoute() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return name in ROUTES ? { name, params } : { name: DEFAULT_ROUTE, params: [] };
}

function setTitle(text) {
  titleEl.textContent = text;
  document.title = `${text} · Слово`;
}

function renderRoute() {
  const { name, params } = currentRoute();
  const view = ROUTES[name];

  // Кожен екран може повернути функцію очищення (зупинити таймери, запис тощо).
  cleanup?.();
  cleanup = null;

  setTitle(view.title);
  for (const tab of tabbarEl.querySelectorAll('.tab')) {
    if (tab.dataset.route === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  viewEl.replaceChildren();
  viewEl.classList.remove('enter');
  void viewEl.offsetWidth; // перезапуск анімації появи
  viewEl.classList.add('enter');
  cleanup = view.render(viewEl, { params, setTitle }) ?? null;

  window.scrollTo(0, 0);
  viewEl.focus({ preventScroll: true });
}

function applyTheme(theme) {
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  themeBtn.replaceChildren(icon(THEME_ICONS[theme]));
  themeBtn.setAttribute('aria-label', `Тема: ${THEME_LABELS[theme]}. Натисніть, щоб змінити`);
  syncThemeColor();
}

// Колір рядка стану на телефоні має збігатися з фоном.
function syncThemeColor() {
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').setAttribute('content', bg);
}

function initTheme() {
  applyTheme(getState().settings.theme);
  themeBtn.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(getState().settings.theme) + 1) % THEMES.length];
    setTheme(next);
    applyTheme(next);
    toast(`Тема: ${THEME_LABELS[next]}`);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker не зареєстровано:', err));
  });
}

// Після кожної зміни прогресу перевіряємо бейджі. Повідомлення — трохи пізніше,
// щоб не перекривати тост із нарахованим XP.
function watchBadges() {
  let checking = false;
  subscribe(() => {
    if (checking) return;
    checking = true;
    const fresh = checkBadges();
    checking = false;
    fresh.forEach((badge, i) => setTimeout(() => toast(`🏅 Новий бейдж: «${badge.title}»`, 3000), 2600 + i * 3200));
  });
}

buildTabbar();
watchBadges();
initTheme();
renderRoute();
window.addEventListener('hashchange', renderRoute);
registerServiceWorker();
