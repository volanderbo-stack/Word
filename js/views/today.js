// Вкладка «Сьогодні»: установка дня, щоденне тренування з 4 кроків, челендж 30 днів.
// Адреси: #/today — головна, #/today/<крок> — крок тренування, #/today/challenge — завдання челенджу.

import { breathing, challenge30, mindset, poems, structures, tongueTwisters, topics, words } from '../../data/content.js';
import {
  XP_REWARDS, challengeStatus, completeChallengeDay, currentStreak, getState, levelInfo,
  markPoemRead, markStep, pickForDay, resetChallenge, todaySteps,
} from '../state.js';
import { disposer, formatDuration, h, icon, plural } from '../ui.js';
import { breathingWidget, poemCard, rewardToast, selfRating, speakPanel, twisterWidget, wordCard } from '../widgets.js';

export const title = 'Сьогодні';
export const tabLabel = 'Сьогодні';
export const tabIcon = 'today';

// xp(ctx) — скільки XP дає крок; ctx.recorded = чи був запис виступу.
const STEPS = [
  { id: 'warmup', title: 'Розминка голосу', minutes: 4, icon: 'wind', xp: () => XP_REWARDS.warmup },
  { id: 'word', title: 'Слово дня', minutes: 2, icon: 'word', xp: () => XP_REWARDS.word },
  { id: 'thought', title: 'Вправа на думку', minutes: 6, icon: 'thought', xp: (c) => (c.recorded ? XP_REWARDS.speech : XP_REWARDS.exercise) },
  { id: 'poem', title: 'Вірш дня', minutes: 5, icon: 'poetry', xp: () => XP_REWARDS.poemAloud },
];
const STEP_IDS = STEPS.map((s) => s.id);

// Контент дня однаковий протягом доби; різні зсуви, щоб списки не «крокували» синхронно.
function todayPlan() {
  return {
    mindset: pickForDay(mindset),
    word: pickForDay(words, 3),
    topic: pickForDay(topics, 7),
    structure: pickForDay(structures),
    poem: pickForDay(poems, 2),
    twister: pickForDay(tongueTwisters, 5),
    breath: pickForDay(breathing, 1),
  };
}

export function render(root, ctx) {
  const [sub] = ctx.params;
  const scope = disposer();
  const plan = todayPlan();

  if (STEP_IDS.includes(sub)) renderStep(root, ctx, scope, plan, sub);
  else if (sub === 'challenge') renderChallenge(root, ctx, scope);
  else renderHome(root, plan);

  return scope.dispose;
}

// ---------- Головний екран ----------

function renderHome(root, plan) {
  const date = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  root.append(
    h('p', { class: 'date-line' }, date[0].toUpperCase() + date.slice(1)),
    statsCard(),
    mindsetCard(plan.mindset),
    trainingCard(plan),
    challengeCard(() => {
      root.replaceChildren();
      renderHome(root, plan);
    }),
  );
}

function statsCard() {
  const streak = currentStreak();
  const { current, next, progress, toNext } = levelInfo();
  return h('section', { class: 'card stats' },
    h('div', { class: streak ? 'streak' : 'streak is-zero' },
      h('div', { class: 'streak__num' }, icon('flame'), String(streak)),
      h('div', { class: 'streak__label' }, `${plural(streak, ['день', 'дні', 'днів'])} поспіль`)),
    h('div', { class: 'level' },
      h('div', { class: 'row-between' },
        h('span', { class: 'level__name' }, current.name),
        h('span', { class: 'muted small' }, `${getState().xp} XP`)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-label': 'Прогрес рівня' },
        h('span', { style: `--p: ${(progress * 100).toFixed(1)}%` })),
      h('p', { class: 'muted small' }, next ? `Ще ${toNext} XP до рівня «${next.name}»` : 'Найвищий рівень. Ви — майстер слова!')),
  );
}

function mindsetCard(item) {
  return h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, 'Установка дня'),
    h('p', { class: 'quote' }, item.text),
    h('hr', { class: 'sep' }),
    h('p', { class: 'eyebrow' }, 'Питання для роздумів'),
    h('p', null, item.question),
  );
}

function stepSubtitle(id, plan) {
  switch (id) {
    case 'warmup': return `${plan.breath.name} · скоромовка`;
    case 'word': return `«${plan.word.word}»`;
    case 'thought': return plan.topic.text;
    case 'poem': return `${plan.poem.author} — ${plan.poem.title}`;
    default: return '';
  }
}

function trainingCard(plan) {
  const done = todaySteps();
  const doneCount = STEP_IDS.filter((id) => done[id]).length;
  const minutes = STEPS.reduce((sum, s) => sum + s.minutes, 0);
  const allDone = doneCount === STEPS.length;

  return h('section', { class: 'card stack' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'card-title' }, 'Тренування дня'),
      h('span', { class: 'muted small' }, `≈ ${minutes} хв`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(STEPS.length), 'aria-valuenow': String(doneCount), 'aria-label': 'Виконано кроків' },
      h('span', { style: `--p: ${(doneCount / STEPS.length) * 100}%` })),
    allDone
      ? h('div', { class: 'banner' }, icon('flame'),
        h('div', null, h('b', null, 'День зараховано!'), h('p', { class: 'small' }, 'Повертайтеся завтра, щоб не перервати серію.')))
      : null,
    h('ul', { class: 'steps' }, STEPS.map((s, k) => h('li', null,
      h('a', { class: done[s.id] ? 'step-row is-done' : 'step-row', href: `#/today/${s.id}` },
        h('span', { class: 'step-row__icon' }, icon(done[s.id] ? 'check' : s.icon)),
        h('span', { class: 'step-row__text' },
          h('span', { class: 'step-row__title' }, `${k + 1}. ${s.title}`),
          h('span', { class: 'step-row__sub' }, stepSubtitle(s.id, plan))),
        h('span', { class: 'step-row__end' }, done[s.id] ? icon('checkCircle') : h('span', { class: 'small' }, `${s.minutes} хв`)))))),
  );
}

function challengeCard(rerender) {
  const total = challenge30.length;
  const status = challengeStatus(total);
  const bar = h('div', { class: 'bar bar--warm', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(status.completed), 'aria-label': 'Прогрес челенджу' },
    h('span', { style: `--p: ${(status.completed / total) * 100}%` }));
  const head = h('div', { class: 'row-between' },
    h('p', { class: 'eyebrow' }, 'Челендж «Від тиші до промови»'),
    h('span', { class: 'muted small' }, `${status.completed} / ${total}`));

  if (status.finished) {
    const again = h('button', { class: 'btn btn--block', type: 'button' }, 'Пройти ще раз');
    again.addEventListener('click', () => {
      if (!confirm('Почати челендж спочатку? Пройдені дні обнуляться.')) return;
      resetChallenge();
      rerender();
    });
    return h('section', { class: 'card stack' }, head, bar,
      h('div', { class: 'banner' }, icon('trophy'), h('div', null, h('b', null, 'Челендж пройдено!'), h('p', { class: 'small' }, 'Тридцять днів — від тиші до промови. Ви це зробили.'))),
      again);
  }

  if (status.doneToday) {
    const next = challenge30[status.day - 1];
    return h('section', { class: 'card stack' }, head, bar,
      h('div', { class: 'banner banner--success' }, icon('checkCircle'),
        h('div', null, h('b', null, `День ${status.completed} виконано`), h('p', { class: 'small' }, `Завтра — день ${next.day}: «${next.title}»`))));
  }

  const task = challenge30[status.day - 1];
  return h('section', { class: 'card stack' }, head, bar,
    h('h2', { class: 'card-title' }, `День ${task.day}. ${task.title}`),
    h('p', null, task.task),
    h('div', { class: 'meta-row' }, h('span', { class: 'chip' }, `Виступ ${formatDuration(task.seconds)}`)),
    h('a', { class: 'btn btn--primary btn--block', href: '#/today/challenge' }, icon('target'), 'Виконати завдання'));
}

// ---------- Крок тренування ----------

function stepHeader(index) {
  return h('div', { class: 'row-between' },
    h('a', { class: 'back', href: '#/today' }, icon('chevronLeft'), 'Сьогодні'),
    h('span', { class: 'pill' }, `Крок ${index + 1} з ${STEPS.length}`));
}

function renderStep(root, ctx, scope, plan, id) {
  const index = STEP_IDS.indexOf(id);
  const step = STEPS[index];
  const stepCtx = { recorded: false };
  ctx.setTitle(step.title);

  const builders = { warmup: warmupStep, word: wordStep, thought: thoughtStep, poem: poemStep };
  const { content, onDone } = builders[id](scope, plan, stepCtx, () => paintDone());

  const doneBtn = h('button', { class: 'btn btn--primary btn--block', type: 'button' });
  const alreadyDone = !!todaySteps()[id];
  function paintDone() {
    doneBtn.textContent = alreadyDone ? 'Виконано ✓ Далі' : `Готово · +${step.xp(stepCtx)} XP`;
  }
  paintDone();

  doneBtn.addEventListener('click', () => {
    const xp = step.xp(stepCtx);
    const res = markStep(id, xp, STEP_IDS);
    if (!res.already) {
      onDone?.();
      rewardToast(xp, {
        levelUp: res.levelUp,
        extra: res.dayCompleted ? `День зараховано! Серія: ${currentStreak()} 🔥` : '',
      });
    }
    const next = STEPS.find((s) => !todaySteps()[s.id]);
    location.hash = next ? `#/today/${next.id}` : '#/today';
  });

  root.append(stepHeader(index), ...content, h('div', { class: 'done-bar' }, doneBtn));
}

function warmupStep(scope, plan) {
  return {
    content: [
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, `1 · Дихання — ${plan.breath.goal.toLowerCase()}`),
        scope.use(breathingWidget(plan.breath, { cycles: Math.min(3, plan.breath.cycles) }))),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, '2 · Скоромовка'),
        h('p', { class: 'small' }, 'Прочитайте тричі: повільно, середньо і швидко. Темп перемикається сам після кожного прочитання.'),
        scope.use(twisterWidget([plan.twister]))),
    ],
  };
}

function wordStep(scope, plan) {
  return {
    content: [
      h('section', { class: 'card stack' }, h('p', { class: 'eyebrow' }, 'Слово дня'), wordCard(plan.word)),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Завдання'),
        h('p', null, 'Скажіть уголос два речення з цим словом: одне про сьогоднішній день, друге — про мрію.'),
        scope.use(speakPanel({ type: 'word', label: `Слово дня: ${plan.word.word}`, hint: 'Натисніть і скажіть два речення' }))),
    ],
  };
}

function thoughtStep(scope, plan, stepCtx, refresh) {
  const { topic, structure } = plan;
  const ratingSlot = h('div');
  const panel = speakPanel({
    type: 'thought',
    label: `Тема: ${topic.text}`,
    seconds: 60,
    hint: 'Хвилина на виступ. Натисніть і говоріть',
    onFinish: (result) => {
      stepCtx.recorded ||= result.recorded;
      refresh();
      if (!ratingSlot.childElementCount) ratingSlot.append(scope.use(selfRating({ type: 'thought' })));
    },
  });

  return {
    content: [
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Тема дня'),
        h('p', { class: 'quote' }, topic.text)),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Структура відповіді'),
        h('h3', { class: 'card-title' }, structure.name),
        h('ol', { class: 'num-list' }, structure.steps.map((s) => h('li', null, h('div', null, h('b', null, s.label), h('p', { class: 'muted small' }, s.hint))))),
        h('details', { class: 'details' }, h('summary', null, 'Приклад'), h('p', { class: 'example' }, structure.example))),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Ваш виступ · 60 секунд'),
        h('p', { class: 'small' }, 'Подумайте 10–15 секунд, а потім говоріть за структурою. Запис дає +25 XP замість +15.'),
        scope.use(panel),
        ratingSlot),
    ],
  };
}

function poemStep(scope, plan) {
  const { poem } = plan;
  return {
    content: [
      h('section', { class: 'card' }, poemCard(poem)),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Читай уголос'),
        h('p', { class: 'small' }, 'Читайте повільно. Коротка пауза — наприкінці рядка, довша — між строфами. Виділяйте голосом головне слово в кожному рядку.'),
        scope.use(speakPanel({ type: 'poem', label: `${poem.author} — ${poem.title}`, hint: 'Натисніть і читайте вірш' }))),
    ],
    onDone: () => markPoemRead(poem.id),
  };
}

// ---------- Завдання челенджу ----------

function renderChallenge(root, ctx, scope) {
  const total = challenge30.length;
  const status = challengeStatus(total);
  ctx.setTitle('Челендж');
  const back = h('a', { class: 'back', href: '#/today' }, icon('chevronLeft'), 'Сьогодні');

  if (status.doneToday || status.finished) {
    root.append(back, h('section', { class: 'card stack' },
      h('p', null, status.finished ? 'Челендж уже пройдено.' : 'Сьогоднішнє завдання виконано. Наступне відкриється завтра.'),
      h('a', { class: 'btn btn--block', href: '#/today' }, 'На головну')));
    return;
  }

  const task = challenge30[status.day - 1];
  let spoke = false;
  let recorded = false;
  const doneBtn = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: true }, 'Спершу виступіть');

  const panel = speakPanel({
    type: 'challenge',
    label: `Челендж, день ${task.day}: ${task.title}`,
    seconds: task.seconds,
    hint: `Ваш час — ${formatDuration(task.seconds)}. Натисніть і говоріть`,
    onFinish: (result) => {
      spoke = true;
      recorded ||= result.recorded;
      doneBtn.disabled = false;
      doneBtn.textContent = `Зарахувати день ${task.day} · +${recorded ? XP_REWARDS.speech : XP_REWARDS.exercise} XP`;
    },
  });

  doneBtn.addEventListener('click', () => {
    if (!spoke) return;
    const xp = recorded ? XP_REWARDS.speech : XP_REWARDS.exercise;
    const { levelUp } = completeChallengeDay(total, xp);
    rewardToast(xp, { levelUp, extra: task.day === total ? 'Челендж пройдено! 🏆' : `День ${task.day} з ${total}` });
    location.hash = '#/today';
  });

  root.append(
    h('div', { class: 'row-between' }, back, h('span', { class: 'pill' }, `День ${task.day} з ${total}`)),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, task.title),
      h('p', { class: 'lead' }, task.task)),
    h('section', { class: 'card stack' }, scope.use(panel)),
    h('div', { class: 'done-bar' }, doneBtn),
  );
}
