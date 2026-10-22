// Вкладка «Голос і дикція»: скоромовки, дихання, запис голосу, поради.
// Адреси: #/voice/twisters, #/voice/breath[/<id вправи>], #/voice/record, #/voice/tips.

import { breathing, fillerWords, speechTips, tongueTwisters } from '../../data/content.js';
import { disposer, formatDuration, h, icon } from '../ui.js';
import { breathingWidget, fillerCounter, recordingsList, speakPanel, twisterWidget } from '../widgets.js';

export const title = 'Голос і дикція';
export const tabLabel = 'Голос';
export const tabIcon = 'voice';

const SECTIONS = [
  { id: 'twisters', label: 'Скоромовки' },
  { id: 'breath', label: 'Дихання' },
  { id: 'record', label: 'Запис' },
  { id: 'tips', label: 'Поради' },
];

const TIP_CATEGORIES = [
  { id: 'tempo', label: 'Темп' },
  { id: 'pause', label: 'Паузи' },
  { id: 'intonation', label: 'Інтонація і голос' },
  { id: 'parasites', label: 'Слова-паразити' },
];

export function render(root, ctx) {
  const [sectionId = 'twisters', itemId] = ctx.params;
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  const scope = disposer();

  root.append(h('nav', { class: 'segmented', 'aria-label': 'Розділи тренування голосу' },
    SECTIONS.map((s) => h('a', { href: `#/voice/${s.id}`, 'aria-current': s === section ? 'true' : null }, s.label))));

  const builders = { twisters: twistersSection, breath: breathSection, record: recordSection, tips: tipsSection };
  root.append(...builders[section.id](scope, itemId));

  return scope.dispose;
}

// ---------- Скоромовки ----------

function twistersSection(scope) {
  const LEVELS = [
    { value: 0, label: 'Усі' },
    { value: 1, label: 'Легкі' },
    { value: 2, label: 'Середні' },
    { value: 3, label: 'Складні' },
  ];
  let level = 0;
  let current = null;
  const slot = h('div');

  const filterBtns = LEVELS.map((l) => h('button', { type: 'button', onClick: () => show(l.value) }, l.label));
  const filter = h('div', { class: 'segmented segmented--quiet', role: 'group', 'aria-label': 'Складність' }, filterBtns);

  function show(value) {
    level = value;
    filterBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(LEVELS[k].value === level)));
    current?.destroy();
    const list = level ? tongueTwisters.filter((t) => t.level === level) : tongueTwisters;
    current = twisterWidget(list);
    slot.replaceChildren(current.el);
  }
  scope.add(() => current?.destroy());
  show(0);

  return [
    h('section', { class: 'card stack' }, filter, slot),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Як тренуватися'),
      h('ul', { class: 'checklist small' },
        h('li', null, 'Почніть повільно: чіткість важливіша за швидкість.'),
        h('li', null, 'Активно працюйте губами і язиком, наче говорите для глухуватого слухача.'),
        h('li', null, 'Збилися на швидкому темпі — поверніться на крок назад.'),
        h('li', null, 'Записуйте себе у вкладці «Запис», щоб почути, які звуки «пливуть».'))),
  ];
}

// ---------- Дихання ----------

function breathSection(scope, itemId) {
  const exercise = breathing.find((b) => b.id === itemId) ?? breathing[0];
  return [
    h('section', { class: 'card' }, scope.use(breathingWidget(exercise))),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Усі вправи'),
      h('ul', { class: 'steps' }, breathing.map((b) => {
        const cycle = b.inhale + b.hold + b.exhale + b.rest;
        const active = b === exercise;
        return h('li', null, h('a', { class: active ? 'step-row is-active' : 'step-row', href: `#/voice/breath/${b.id}`, 'aria-current': active ? 'true' : null },
          h('span', { class: 'step-row__icon' }, icon('wind')),
          h('span', { class: 'step-row__text' },
            h('span', { class: 'step-row__title' }, b.name),
            h('span', { class: 'step-row__sub' }, b.goal)),
          h('span', { class: 'step-row__end' }, active ? icon('check') : h('span', { class: 'small' }, formatDuration(cycle * b.cycles)))));
      }))),
  ];
}

// ---------- Запис ----------

function recordSection(scope) {
  const list = recordingsList({ limit: 10 });
  const panel = speakPanel({
    type: 'free',
    label: 'Вільний запис',
    hint: 'Розкажіть про свій день або прочитайте абзац із книжки',
    onFinish: (result) => {
      if (result.recorded) list.reload();
    },
  });

  return [
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Почуйте себе з боку'),
      h('p', { class: 'small' }, 'Запишіть 1–2 хвилини, потім прослухайте. Зверніть увагу на темп, паузи, чіткість закінчень і слова-паразити.'),
      scope.use(panel)),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Лічильник слів-паразитів'),
      h('p', { class: 'small' }, 'Прослухайте запис і натискайте на слово щоразу, коли його чуєте. Те, що помічаєте, вже під контролем.'),
      scope.use(fillerCounter(fillerWords))),
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Останні записи'),
      scope.use(list)),
  ];
}

// ---------- Поради ----------

function tipsSection() {
  return TIP_CATEGORIES.map((cat) => h('section', { class: 'card stack' },
    h('p', { class: 'eyebrow' }, cat.label),
    h('ul', { class: 'tip-list' }, speechTips.filter((t) => t.category === cat.id).map((t) => h('li', null,
      h('b', null, t.title),
      h('p', { class: 'small' }, t.text))))));
}
