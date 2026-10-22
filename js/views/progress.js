// Вкладка «Прогрес»: рівень, статистика, календар, графік самооцінок, бейджі, записи, дані.

import { BADGES, badgeProgress } from '../badges.js';
import { ratingChart } from '../charts.js';
import { clearRecordings } from '../db.js';
import { learnedCount } from '../srs.js';
import { currentStreak, dayKey, exportState, getState, importState, levelInfo, practiceMinutes, resetState } from '../state.js';
import { disposer, h, icon, plural, toast } from '../ui.js';
import { recordingsList } from '../widgets.js';

export const title = 'Прогрес';
export const tabLabel = 'Прогрес';
export const tabIcon = 'progress';

export function render(root) {
  const scope = disposer();
  const records = recordingsList({ emptyText: 'Записів поки немає. Записуйте виступи у вправах — і вони з’являться тут.' });

  root.append(
    levelCard(),
    statsCard(),
    calendarCard(),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Самооцінка виступів'),
      scope.use(ratingChart(getState().ratings, { limit: 30 }))),
    badgesCard(),
    h('section', { class: 'card stack' },
      h('div', { class: 'row-between' },
        h('p', { class: 'eyebrow' }, 'Мої записи'),
        clearRecordsButton(records)),
      scope.use(records)),
    dataCard(),
  );
  return scope.dispose;
}

// ---------- Рівень ----------

function levelCard() {
  const { current, next, progress, toNext, index } = levelInfo();
  return h('section', { class: 'card stack level-hero' },
    h('div', { class: 'row-between' },
      h('div', null,
        h('p', { class: 'eyebrow' }, `Рівень ${index + 1} з 4`),
        h('h2', { class: 'level-hero__name' }, current.name)),
      h('div', { class: 'level-hero__xp' }, h('b', null, String(getState().xp)), h('span', null, 'XP'))),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-label': 'Прогрес рівня' },
      h('span', { style: `--p: ${(progress * 100).toFixed(1)}%` })),
    h('p', { class: 'muted small' }, next ? `Ще ${toNext} XP до рівня «${next.name}»` : 'Найвищий рівень досягнуто. Ви — майстер слова!'));
}

// ---------- Статистика ----------

function statTile(value, label, sub, iconName) {
  return h('div', { class: 'tile tile--stat' },
    h('div', { class: 'tile__icon' }, icon(iconName)),
    h('div', { class: 'tile__value' }, String(value)),
    h('div', { class: 'tile__label' }, label),
    sub ? h('div', { class: 'tile__sub' }, sub) : null);
}

function statsCard() {
  const s = getState();
  const streak = currentStreak();
  const minutes = practiceMinutes();
  const learned = learnedCount();
  const poems = s.stats.poemsRead.length;
  return h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, 'Статистика'),
    h('div', { class: 'tiles' },
      statTile(streak, `${plural(streak, ['день', 'дні', 'днів'])} поспіль`, `рекорд: ${s.streak.best}`, 'flame'),
      statTile(minutes, `${plural(minutes, ['хвилина', 'хвилини', 'хвилин'])} практики`, null, 'clock'),
      statTile(learned, `${plural(learned, ['слово', 'слова', 'слів'])} вивчено`, `у словнику: ${s.dictionary.length}`, 'word'),
      statTile(poems, `${plural(poems, ['вірш', 'вірші', 'віршів'])} уголос`, null, 'poetry'),
      statTile(s.stats.recordings, `${plural(s.stats.recordings, ['запис', 'записи', 'записів'])} голосу`, null, 'voice'),
      statTile(s.stats.exercises, `${plural(s.stats.exercises, ['вправа', 'вправи', 'вправ'])}`, null, 'checkCircle')));
}

// ---------- Календар останніх 5 тижнів ----------

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const cellDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });

function calendarCard() {
  const { days } = getState();
  const today = new Date();
  const todayKey = dayKey(today);
  // Починаємо з понеділка 4 тижні тому — разом 5 повних тижнів до поточного.
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset - 28);

  const cells = [];
  for (let i = 0; i < 35; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(date);
    const day = days[key];
    const future = key > todayKey;
    const state = day?.completed ? 'done' : day?.xp ? 'partial' : 'none';
    const label = `${cellDate.format(date)}: ${future ? 'попереду' : state === 'done' ? 'тренування виконано' : state === 'partial' ? `частково, ${day.xp} XP` : 'без тренування'}`;
    cells.push(h('div', {
      class: `cal__cell cal__cell--${future ? 'future' : state}${key === todayKey ? ' is-today' : ''}`,
      title: label,
      'aria-label': label,
      role: 'img',
    }, String(date.getDate())));
  }

  return h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, 'Останні 5 тижнів'),
    h('div', { class: 'cal' }, WEEKDAYS.map((d) => h('div', { class: 'cal__head' }, d)), cells),
    h('div', { class: 'cal__legend' },
      h('span', null, h('i', { class: 'cal__cell cal__cell--done' }), 'тренування дня'),
      h('span', null, h('i', { class: 'cal__cell cal__cell--partial' }), 'частково'),
      h('span', null, h('i', { class: 'cal__cell cal__cell--none' }), 'без практики')));
}

// ---------- Бейджі ----------

const earnedDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });

function badgesCard() {
  const earnedCount = BADGES.filter((b) => getState().badges[b.id]).length;
  return h('section', { class: 'card stack' },
    h('div', { class: 'row-between' },
      h('p', { class: 'eyebrow' }, 'Досягнення'),
      h('span', { class: 'muted small' }, `${earnedCount} з ${BADGES.length}`)),
    h('ul', { class: 'badges' }, BADGES.map((b) => {
      const { value, earnedOn } = badgeProgress(b);
      const [y, m, d] = (earnedOn ?? '').split('-').map(Number);
      return h('li', { class: earnedOn ? 'badge is-earned' : 'badge' },
        h('div', { class: 'badge__icon' }, icon(b.icon)),
        h('div', { class: 'badge__title' }, b.title),
        h('div', { class: 'badge__text' }, b.text),
        earnedOn
          ? h('div', { class: 'badge__meta' }, earnedDate.format(new Date(y, m - 1, d)))
          : h('div', { class: 'badge__meta' }, h('div', { class: 'bar bar--thin' }, h('span', { style: `--p: ${(value / b.target) * 100}%` })), `${value} / ${b.target}`));
    })));
}

// ---------- Записи ----------

function clearRecordsButton(records) {
  const btn = h('button', { class: 'btn btn--small', type: 'button' }, icon('trash'), 'Видалити всі');
  btn.addEventListener('click', async () => {
    if (!confirm('Видалити всі записи голосу? Їх не можна буде відновити. Прогрес і статистика збережуться.')) return;
    try {
      await clearRecordings();
      records.reload();
      toast('Усі записи видалено');
    } catch {
      toast('Не вдалося видалити записи');
    }
  });
  return btn;
}

// ---------- Дані: експорт, імпорт, скидання ----------

function dataCard() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });

  const exportBtn = h('button', { class: 'btn btn--block', type: 'button' }, icon('download'), 'Експортувати прогрес');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `slovo-progress-${dayKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Файл прогресу збережено');
  });

  const importBtn = h('button', { class: 'btn btn--block', type: 'button' }, icon('upload'), 'Імпортувати прогрес');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!confirm('Замінити поточний прогрес даними з файлу? Поточний прогрес буде втрачено.')) return;
    try {
      importState(await file.text());
      toast('Прогрес відновлено');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast(err.message, 4000);
    }
  });

  const resetBtn = h('button', { class: 'btn btn--block btn--danger', type: 'button' }, icon('reset'), 'Скинути прогрес');
  resetBtn.addEventListener('click', () => {
    if (!confirm('Скинути весь прогрес: XP, серію, словник, оцінки й бейджі? Це не можна скасувати. Записи голосу залишаться.')) return;
    resetState();
    location.hash = '#/today';
    location.reload();
  });

  return h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, 'Ваші дані'),
    h('p', { class: 'small muted' }, 'Усе зберігається лише в цьому браузері. Експортуйте прогрес у файл, щоб перенести його на інший пристрій або зберегти копію. Записи голосу до файлу не входять.'),
    exportBtn, importBtn, fileInput, resetBtn);
}
