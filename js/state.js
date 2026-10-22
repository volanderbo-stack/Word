// Стан застосунку: прогрес, налаштування, XP, рівні, серія днів.
// Усе зберігається в localStorage під одним ключем.

const STORAGE_KEY = 'slovo:v1';
const VERSION = 1;

export const XP_REWARDS = { warmup: 10, exercise: 15, speech: 25, poemAloud: 20, word: 5 };

export const LEVELS = [
  { name: 'Новачок', minXp: 0 },
  { name: 'Промовець', minXp: 300 },
  { name: 'Оратор', minXp: 1000 },
  { name: 'Майстер слова', minXp: 3000 },
];

function createDefaults() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    settings: { theme: 'auto', poemFont: 20 },
    xp: 0,
    streak: { current: 0, best: 0, lastDay: null },
    days: {}, // 'РРРР-ММ-ДД' → { completed, steps, xp }
    practiceSeconds: 0,
    stats: { recordings: 0, exercises: 0, poemsRead: [], wordsLearned: 0 },
    ratings: [], // { date, type, clarity, logic, confidence }
    dictionary: [], // картки особистого словника
    challenge: { completedDays: [] },
    badges: {}, // id бейджа → дата отримання
  };
}

// Міграції формату: ключ — версія, З якої мігруємо. Кожна функція повертає дані з version + 1.
const MIGRATIONS = {
  // 1: (data) => ({ ...data, version: 2 }),
};

// Додає поля, що з'явилися в нових версіях, не чіпаючи збережених значень.
function mergeDefaults(defaults, saved) {
  const merged = { ...defaults, ...saved };
  for (const [key, value] of Object.entries(defaults)) {
    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
    if (isPlainObject && saved[key] && typeof saved[key] === 'object') merged[key] = { ...value, ...saved[key] };
  }
  return merged;
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Пошкоджені дані або заблоковане сховище — починаємо з чистого стану.
  }
  if (!data || typeof data !== 'object') return createDefaults();
  while (data.version < VERSION && MIGRATIONS[data.version]) data = MIGRATIONS[data.version](data);
  return mergeDefaults(createDefaults(), data);
}

let state = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Приватний режим або переповнене сховище: застосунок працює, але прогрес не збережеться.
  }
}

function notify() {
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

// Єдиний спосіб змінити стан: update((s) => { s.xp += 10; }).
export function update(mutator) {
  mutator(state);
  save();
  notify();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetState() {
  state = createDefaults();
  save();
  notify();
}

// ---------- Дати (за локальним часом користувача) ----------

export function dayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
}

// Порядковий номер календарного дня: однаковий протягом доби, змінюється опівночі.
export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// «Слово дня», «вірш дня» тощо: той самий елемент протягом дня, наступного дня — інший.
export function pickForDay(list, offset = 0, date = new Date()) {
  if (!list.length) return undefined;
  return list[(dayNumber(date) + offset) % list.length];
}

function ensureDay(s, key = dayKey()) {
  s.days[key] ??= { completed: false, steps: {}, xp: 0 };
  return s.days[key];
}

// ---------- XP і рівні ----------

export function levelInfo(xp = state.xp) {
  let index = LEVELS.length - 1;
  while (index > 0 && xp < LEVELS[index].minXp) index--;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return {
    index,
    current,
    next,
    progress: next ? (xp - current.minXp) / (next.minXp - current.minXp) : 1,
    toNext: next ? next.minXp - xp : 0,
  };
}

// Повертає true, якщо користувач щойно перейшов на новий рівень.
export function addXp(amount) {
  const before = levelInfo().index;
  update((s) => {
    s.xp += amount;
    ensureDay(s).xp += amount;
  });
  return levelInfo().index > before;
}

// ---------- Серія днів ----------

// Серія обривається, якщо останній зарахований день був раніше, ніж учора.
export function currentStreak() {
  const { current, lastDay } = state.streak;
  if (!lastDay) return 0;
  const today = dayKey();
  return lastDay === today || lastDay === shiftDay(today, -1) ? current : 0;
}

// Зараховує сьогоднішній день — викликається після щоденного тренування.
export function completeToday() {
  const today = dayKey();
  update((s) => {
    ensureDay(s, today).completed = true;
    const { lastDay } = s.streak;
    if (lastDay === today) return;
    s.streak.current = lastDay === shiftDay(today, -1) ? s.streak.current + 1 : 1;
    s.streak.best = Math.max(s.streak.best, s.streak.current);
    s.streak.lastDay = today;
  });
}

// ---------- Щоденне тренування ----------

export function todaySteps() {
  return state.days[dayKey()]?.steps ?? {};
}

// Позначає крок тренування виконаним і нараховує XP.
// Коли виконано всі кроки зі списку allSteps — зараховує день у серію.
export function markStep(stepId, xp, allSteps) {
  if (todaySteps()[stepId]) return { already: true, levelUp: false, dayCompleted: false };
  update((s) => {
    ensureDay(s).steps[stepId] = true;
    s.stats.exercises += 1;
  });
  const levelUp = addXp(xp);
  const day = state.days[dayKey()];
  const dayCompleted = !day.completed && allSteps.every((id) => day.steps[id]);
  if (dayCompleted) completeToday();
  return { already: false, levelUp, dayCompleted };
}

// ---------- Челендж 30 днів ----------

// Одне завдання на календарний день: наступне відкривається завтра.
export function challengeStatus(total) {
  const done = state.challenge.completedDays;
  return {
    completed: done.length,
    day: Math.min(done.length + 1, total),
    doneToday: done.at(-1)?.date === dayKey(),
    finished: done.length >= total,
  };
}

export function completeChallengeDay(total, xp) {
  const status = challengeStatus(total);
  if (status.doneToday || status.finished) return { levelUp: false };
  update((s) => { s.challenge.completedDays.push({ day: status.day, date: dayKey() }); });
  return { levelUp: addXp(xp) };
}

export function resetChallenge() {
  update((s) => { s.challenge.completedDays = []; });
}

// ---------- Вірші й самооцінка ----------

export function markPoemRead(id) {
  update((s) => {
    if (!s.stats.poemsRead.includes(id)) s.stats.poemsRead.push(id);
  });
}

// Читання вірша вголос. Повертає true, якщо цей вірш сьогодні читають уперше (тоді дається XP).
export function markPoemAloud(id) {
  const firstToday = !(state.days[dayKey()]?.poems ?? []).includes(id);
  update((s) => {
    const day = ensureDay(s);
    day.poems ??= [];
    if (!day.poems.includes(id)) day.poems.push(id);
    if (!s.stats.poemsRead.includes(id)) s.stats.poemsRead.push(id);
  });
  return firstToday;
}

// rating: { clarity, logic, confidence } — від 1 до 5.
export function addRating(type, rating) {
  update((s) => { s.ratings.push({ date: dayKey(), ts: Date.now(), type, ...rating }); });
}

// ---------- Практика ----------

export function addPractice(seconds) {
  if (seconds > 0) update((s) => { s.practiceSeconds += Math.round(seconds); });
}

export function logRecording(seconds) {
  update((s) => {
    s.stats.recordings += 1;
    s.practiceSeconds += Math.round(seconds);
  });
}

export function practiceMinutes() {
  return Math.floor(state.practiceSeconds / 60);
}

// ---------- Налаштування ----------

export function setTheme(theme) {
  update((s) => { s.settings.theme = theme; });
}

export function setPoemFont(size) {
  update((s) => { s.settings.poemFont = size; });
}

// ---------- Експорт та імпорт ----------

export function exportState() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

// Приймає текст JSON-файлу. Кидає Error з поясненням українською, якщо файл не підходить.
export function importState(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл пошкоджений або це не JSON.');
  }
  if (!data || typeof data !== 'object' || typeof data.version !== 'number' || typeof data.xp !== 'number') {
    throw new Error('Це не файл прогресу «Слова».');
  }
  if (data.version > VERSION) throw new Error('Файл створено новішою версією застосунку. Оновіть застосунок.');
  while (data.version < VERSION && MIGRATIONS[data.version]) data = MIGRATIONS[data.version](data);
  delete data.exportedAt;
  state = mergeDefaults(createDefaults(), data);
  save();
  notify();
}
