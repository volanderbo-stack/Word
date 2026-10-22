// Вкладка «Думка»: як будувати мову логічно й переконливо.
// Адреси: #/thought/basics, #/thought/topic[/<№>], #/thought/drills/explain|argue[/<№>],
// #/thought/debate/interview|theses, #/thought/speeches.

import { debateTheses, explainSimply, interviewQuestions, speeches, structures, topics } from '../../data/content.js';
import { ratingChart } from '../charts.js';
import { getState } from '../state.js';
import { disposer, h, icon } from '../ui.js';
import { awardExercise, selfRating, speakPanel } from '../widgets.js';

export const title = 'Думка';
export const tabLabel = 'Думка';
export const tabIcon = 'thought';

const SECTIONS = [
  { id: 'basics', label: 'Основи' },
  { id: 'topic', label: 'Тема' },
  { id: 'drills', label: 'Вправи' },
  { id: 'debate', label: 'Експромт' },
  { id: 'speeches', label: 'Промови' },
];

const LEVEL_NAMES = { 1: 'Легка тема', 2: 'Середня тема', 3: 'Складна тема' };

export function render(root, ctx) {
  const [sectionId = 'basics', ...rest] = ctx.params;
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  const scope = disposer();

  root.append(h('nav', { class: 'segmented segmented--quiet', 'aria-label': 'Розділи вкладки «Думка»' },
    SECTIONS.map((s) => h('a', { href: `#/thought/${s.id}`, 'aria-current': s === section ? 'true' : null }, s.label))));

  const builders = { basics: basicsSection, topic: topicSection, drills: drillsSection, debate: debateSection, speeches: speechesSection };
  root.append(...builders[section.id](scope, rest));

  return scope.dispose;
}

// Випадковий індекс, відмінний від поточного.
function randomIndex(length, current = -1) {
  if (length < 2) return 0;
  let i = current;
  while (i === current) i = Math.floor(Math.random() * length);
  return i;
}

// Індекс з адреси або випадковий, якщо його немає чи він некоректний.
function indexFrom(param, length) {
  const n = Number(param);
  return Number.isInteger(n) && n >= 0 && n < length ? n : randomIndex(length);
}

function shuffleButton(label, href) {
  return h('a', { class: 'btn btn--small', href }, icon('shuffle'), label);
}

// Після виступу: XP і самооцінка (одна на виступ, з'являється під панеллю).
function afterSpeech(scope, slot, type) {
  return (result) => {
    awardExercise(result);
    if (result.duration < 10) return;
    slot.replaceChildren(scope.use(selfRating({ type })));
  };
}

function structureSteps(structure) {
  return h('ol', { class: 'num-list' }, structure.steps.map((s) =>
    h('li', null, h('div', null, h('b', null, s.label), h('p', { class: 'muted small' }, s.hint)))));
}

// ---------- Основи: структури і динаміка ----------

function basicsSection(scope) {
  return [
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Ваша динаміка'),
      h('h2', { class: 'card-title' }, 'Самооцінка виступів'),
      scope.use(ratingChart(getState().ratings))),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Навіщо структура'),
      h('p', null, 'Слухач не бачить вашого тексту — він чує лише послідовність. Структура — це дорожні знаки: людина знає, де вона зараз і куди ви ведете.')),
    ...structures.map((s) => h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Структура відповіді'),
      h('h2', { class: 'card-title' }, s.name),
      h('p', { class: 'muted small' }, s.short),
      structureSteps(s),
      h('details', { class: 'details' }, h('summary', null, 'Приклад'), h('p', { class: 'example' }, s.example)))),
    h('section', { class: 'card stack' },
      h('p', null, 'Спробуйте структуру на практиці.'),
      h('a', { class: 'btn btn--primary btn--block', href: '#/thought/topic' }, 'Випадкова тема на 60 секунд')),
  ];
}

// ---------- Випадкова тема на 60 секунд ----------

function topicSection(scope, [param]) {
  const index = indexFrom(param, topics.length);
  const topic = topics[index];
  let structure = structures[0];

  const stepsSlot = h('div');
  const structButtons = structures.map((s) => h('button', { type: 'button', onClick: () => pick(s) }, s.id === 'prep' ? 'ПРЕП' : s.name.split(' → ')[0]));
  function pick(s) {
    structure = s;
    structButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(structures[k] === s)));
    stepsSlot.replaceChildren(h('p', { class: 'muted small' }, s.name), structureSteps(s));
  }
  pick(structure);

  const ratingSlot = h('div');
  const panel = speakPanel({
    type: 'topic',
    label: `Тема: ${topic.text}`,
    seconds: 60,
    hint: 'Подумайте 10–15 секунд, потім натисніть і говоріть',
    onFinish: afterSpeech(scope, ratingSlot, 'topic'),
  });

  return [
    h('section', { class: 'card stack' },
      h('div', { class: 'row-between' },
        h('span', { class: 'chip' }, LEVEL_NAMES[topic.level]),
        shuffleButton('Інша тема', `#/thought/topic/${randomIndex(topics.length, index)}`)),
      h('p', { class: 'quote' }, topic.text)),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Структура'),
      h('div', { class: 'segmented segmented--quiet', role: 'group', 'aria-label': 'Структура відповіді' }, structButtons),
      stepsSlot),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Ваш виступ · 60 секунд'),
      scope.use(panel),
      ratingSlot),
  ];
}

// ---------- Вправи: «Поясни просто» і «Аргумент і контраргумент» ----------

function drillsSection(scope, [mode = 'explain', param]) {
  const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Вправа' },
    h('a', { href: '#/thought/drills/explain', 'aria-current': mode !== 'argue' ? 'true' : null }, 'Поясни просто'),
    h('a', { href: '#/thought/drills/argue', 'aria-current': mode === 'argue' ? 'true' : null }, 'За і проти'));
  return [tabs, ...(mode === 'argue' ? argueDrill(scope, param) : explainDrill(scope, param))];
}

// Рахуємо речення в нотатці: «Поясни просто» має вкластися у три.
function sentenceCount(text) {
  return text.split(/[.!?…]+/).filter((s) => s.trim().length > 2).length;
}

function explainDrill(scope, param) {
  const index = indexFrom(param, explainSimply.length);
  const concept = explainSimply[index];

  const counter = h('p', { class: 'small muted' }, 'Речень: 0 з 3');
  const note = h('textarea', { class: 'textarea', rows: '4', placeholder: 'Напишіть пояснення тут — три речення.', 'aria-label': 'Ваше пояснення' });
  note.addEventListener('input', () => {
    const n = sentenceCount(note.value);
    counter.textContent = n > 3 ? `Речень: ${n} — більше трьох, спробуйте скоротити` : `Речень: ${n} з 3`;
    counter.className = `small ${n === 3 ? 'text-success' : n > 3 ? 'text-warn' : 'muted'}`;
  });

  const ratingSlot = h('div');
  const panel = speakPanel({
    type: 'explain',
    label: `Поясни просто: ${concept}`,
    seconds: 45,
    hint: 'Три речення вголос. Натисніть і пояснюйте',
    onFinish: afterSpeech(scope, ratingSlot, 'explain'),
  });

  return [
    h('section', { class: 'card stack' },
      h('div', { class: 'row-between' },
        h('p', { class: 'eyebrow' }, 'Поясніть так, щоб зрозуміла дитина'),
        shuffleButton('Інше', `#/thought/drills/explain/${randomIndex(explainSimply.length, index)}`)),
      h('p', { class: 'quote' }, concept),
      h('ol', { class: 'num-list' },
        h('li', null, h('div', null, h('b', null, 'Що це'), h('p', { class: 'muted small' }, 'Одне речення без термінів.'))),
        h('li', null, h('div', null, h('b', null, 'Як це працює'), h('p', { class: 'muted small' }, 'Порівняйте з чимось побутовим.'))),
        h('li', null, h('div', null, h('b', null, 'Навіщо це'), h('p', { class: 'muted small' }, 'Приклад із життя слухача.'))))),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Вголос · 45 секунд'),
      scope.use(panel),
      ratingSlot),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Або спершу напишіть'),
      note,
      counter),
  ];
}

function argueDrill(scope, param) {
  const index = indexFrom(param, debateTheses.length);
  const thesis = debateTheses[index];
  const finished = new Set();
  let recorded = false;
  let longest = 0;
  const ratingSlot = h('div');

  // XP і самооцінка — коли виконано обидві частини.
  const part = (id, title, tip) => h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, title),
    h('p', { class: 'small' }, tip),
    scope.use(speakPanel({
      type: 'argue',
      label: `${id === 'pro' ? 'За' : 'Проти'}: ${thesis}`,
      seconds: 45,
      onFinish: (result) => {
        if (result.duration >= 10) finished.add(id);
        recorded ||= result.recorded;
        longest = Math.max(longest, result.duration);
        if (finished.size === 2 && !ratingSlot.childElementCount) {
          awardExercise({ duration: longest, recorded });
          ratingSlot.append(scope.use(selfRating({ type: 'argue' })));
        }
      },
    })));

  return [
    h('section', { class: 'card stack' },
      h('div', { class: 'row-between' },
        h('p', { class: 'eyebrow' }, 'Теза'),
        shuffleButton('Інша', `#/thought/drills/argue/${randomIndex(debateTheses.length, index)}`)),
      h('p', { class: 'quote' }, thesis),
      h('p', { class: 'small muted' }, 'Сильний оратор уміє захистити обидві сторони. Це вчить бачити аргументи опонента ще до того, як він їх скаже.')),
    part('pro', '1 · Аргумент «за» · 45 с', 'Позиція → причина → приклад. Один сильний аргумент кращий за три слабкі.'),
    part('contra', '2 · Контраргумент · 45 с', 'Почніть із «Так, …, але …»: чесно визнайте сильну сторону, а потім заперечте її.'),
    h('section', { class: 'card stack' }, h('p', { class: 'muted small' }, 'Після обох частин з’явиться самооцінка.'), ratingSlot),
  ];
}

// ---------- Співбесіда / Дебати: 30 секунд на відповідь ----------

function debateSection(scope, [mode = 'interview']) {
  const isTheses = mode === 'theses';
  const list = isTheses ? debateTheses : interviewQuestions;
  let current = -1;
  let local = disposer();
  scope.add(() => local.dispose());

  const stage = h('div', { class: 'stack' });
  const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Режим' },
    h('a', { href: '#/thought/debate/interview', 'aria-current': !isTheses ? 'true' : null }, 'Співбесіда'),
    h('a', { href: '#/thought/debate/theses', 'aria-current': isTheses ? 'true' : null }, 'Дебати'));

  function intro() {
    const btn = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: next }, 'Отримати питання');
    stage.replaceChildren(h('section', { class: 'card stack center' },
      h('p', { class: 'lead' }, isTheses
        ? 'Випадкова теза. Оберіть позицію за 5 секунд — і захищайте її 30 секунд.'
        : 'Випадкове складне питання. На відповідь — 30 секунд, без підготовки.'),
      h('p', { class: 'small muted' }, 'Саме так буває на співбесіді чи в суперечці: немає часу на ідеальну відповідь, є час на ясну.'),
      btn));
  }

  function next() {
    local.dispose();
    local = disposer();
    current = randomIndex(list.length, current);
    const text = list[current];
    const ratingSlot = h('div');
    const panel = speakPanel({
      type: isTheses ? 'debate' : 'interview',
      label: `${isTheses ? 'Дебати' : 'Співбесіда'}: ${text}`,
      seconds: 30,
      hint: 'Натисніть і відповідайте',
      onFinish: afterSpeech(local, ratingSlot, isTheses ? 'debate' : 'interview'),
    });
    stage.replaceChildren(
      h('section', { class: 'card stack reveal' },
        h('p', { class: 'eyebrow' }, isTheses ? 'Теза для дебатів' : 'Питання'),
        h('p', { class: 'quote' }, text),
        isTheses ? h('p', { class: 'small muted' }, 'Почніть із чіткої позиції: «Я за», або «Я проти», — і одразу причина.') : null),
      h('section', { class: 'card stack' }, local.use(panel), ratingSlot),
      h('button', { class: 'btn btn--block', type: 'button', onClick: next }, icon('shuffle'), 'Наступне питання'),
    );
  }

  intro();
  return [tabs, stage];
}

// ---------- Розбори промов ----------

function speechesSection(scope) {
  return [
    h('section', { class: 'card stack' },
      h('p', null, 'Що робить промову сильною: теза, прийоми, вплив. Тексти не наводимо — лише переказ і розбір.'),
      h('p', { class: 'small muted' }, 'Після кожного розбору — коротке завдання, щоб спробувати прийом самому.')),
    ...speeches.map((sp) => {
      const taskBody = h('div', { class: 'stack' }, h('p', null, sp.task));
      const task = h('details', { class: 'details' }, h('summary', null, 'Ваше завдання'), taskBody);
      // Панель запису створюємо лише при відкритті, щоб не тримати п'ять зайвих таймерів.
      task.addEventListener('toggle', () => {
        if (!task.open || taskBody.childElementCount > 1) return;
        const ratingSlot = h('div');
        taskBody.append(scope.use(speakPanel({ type: 'speech', label: `Прийом: ${sp.title}`, seconds: 45, onFinish: afterSpeech(scope, ratingSlot, 'speech') })), ratingSlot);
      });

      return h('section', { class: 'card stack' },
        h('div', null,
          h('p', { class: 'eyebrow' }, sp.speaker),
          h('h2', { class: 'card-title' }, sp.title),
          h('p', { class: 'muted small' }, sp.date)),
        h('p', null, sp.context),
        h('div', { class: 'thesis' }, h('p', { class: 'eyebrow' }, 'Теза'), h('p', { class: 'lead' }, sp.thesis)),
        h('p', { class: 'eyebrow' }, 'Прийоми'),
        h('ol', { class: 'num-list' }, sp.techniques.map((t) =>
          h('li', null, h('div', null, h('b', null, t.name), h('p', { class: 'muted small' }, t.how))))),
        h('div', null, h('p', { class: 'eyebrow' }, 'Сила впливу'), h('p', null, sp.impact)),
        task,
        h('a', { class: 'source-link', href: sp.link, target: '_blank', rel: 'noopener' }, icon('link'), 'Дізнатися більше'));
    }),
  ];
}
