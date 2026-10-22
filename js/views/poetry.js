// Вкладка «Поезія і слова»: вірші класиків, читання вголос, особистий словник, повторення, тест.
// Адреси: #/poetry (список), #/poetry/poem/<id>, #/poetry/dictionary, #/poetry/review, #/poetry/quiz.

import { linkedPoems, poems, words } from '../../data/content.js';
import { BOX_INTERVALS, addWord, dueCards, hasWord, learnedCount, removeWord, reviewCard, setSentence } from '../srs.js';
import { XP_REWARDS, addXp, dayKey, getState, markPoemAloud, setPoemFont } from '../state.js';
import { disposer, h, icon, plural, stressed, toast } from '../ui.js';
import { poemCard, rewardToast, speakPanel } from '../widgets.js';

export const title = 'Поезія і слова';
export const tabLabel = 'Поезія';
export const tabIcon = 'poetry';

const SECTIONS = [
  { id: 'list', label: 'Вірші', href: '#/poetry' },
  { id: 'dictionary', label: 'Словник', href: '#/poetry/dictionary' },
  { id: 'quiz', label: 'Тест', href: '#/poetry/quiz' },
];

const FONT_MIN = 16;
const FONT_MAX = 30;

export function render(root, ctx) {
  const [sub, id] = ctx.params;
  const scope = disposer();

  if (sub === 'poem') {
    renderPoem(root, ctx, scope, id);
    return scope.dispose;
  }
  if (sub === 'review') {
    ctx.setTitle('Повторення');
    renderReview(root);
    return scope.dispose;
  }

  const active = sub === 'dictionary' || sub === 'quiz' ? sub : 'list';
  root.append(h('nav', { class: 'segmented', 'aria-label': 'Розділи вкладки «Поезія і слова»' },
    SECTIONS.map((s) => h('a', { href: s.href, 'aria-current': s.id === active ? 'true' : null }, s.label))));

  if (active === 'dictionary') renderDictionary(root);
  else if (active === 'quiz') renderQuiz(root);
  else renderList(root);
  return scope.dispose;
}

// ---------- Список віршів ----------

function renderList(root) {
  const authors = [...new Set(poems.map((p) => p.author))];
  let author = null;
  const chips = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Фільтр за автором' });
  const list = h('ul', { class: 'steps' });

  function paint() {
    const read = getState().stats.poemsRead;
    chips.replaceChildren(...[null, ...authors].map((a) => h('button', {
      class: 'chip-btn',
      type: 'button',
      'aria-pressed': String(a === author),
      onClick: () => {
        author = a;
        paint();
      },
    }, a ?? 'Усі')));
    list.replaceChildren(...poems.filter((p) => !author || p.author === author).map((p) => h('li', null,
      h('a', { class: read.includes(p.id) ? 'step-row is-done' : 'step-row', href: `#/poetry/poem/${p.id}` },
        h('span', { class: 'step-row__icon' }, icon(read.includes(p.id) ? 'check' : 'poetry')),
        h('span', { class: 'step-row__text' },
          h('span', { class: 'step-row__title' }, p.title),
          h('span', { class: 'step-row__sub' }, `${p.author} · ${p.year}`)),
        h('span', { class: 'step-row__end' }, icon('chevron'))))));
  }
  paint();

  const readCount = getState().stats.poemsRead.length;
  root.append(
    h('section', { class: 'card stack' },
      h('div', { class: 'row-between' },
        h('h2', { class: 'card-title' }, 'Класики'),
        h('span', { class: 'muted small' }, `Прочитано вголос: ${readCount} з ${poems.length}`)),
      h('p', { class: 'small muted' }, 'Читання вголос — найкоротший шлях до багатої мови: ритм, паузи і нові слова запам’ятовуються самі.'),
      chips,
      list),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Читати на сайтах'),
      h('p', { class: 'small muted' }, 'Вірші поетів XX століття захищені авторським правом, а кілька класичних текстів ми ще звіряємо з першоджерелом. Тому тут лише назви — читайте за посиланням, і вголос.'),
      h('ul', { class: 'steps' }, linkedPoems.map((p) => h('li', null,
        h('a', { class: 'step-row', href: p.link, target: '_blank', rel: 'noopener' },
          h('span', { class: 'step-row__icon' }, icon('link')),
          h('span', { class: 'step-row__text' },
            h('span', { class: 'step-row__title' }, p.title),
            h('span', { class: 'step-row__sub' }, p.author)),
          h('span', { class: 'step-row__end' }, icon('chevron'))))))),
  );
}

// ---------- Вірш і читання вголос ----------

function renderPoem(root, ctx, scope, id) {
  const index = poems.findIndex((p) => p.id === id);
  if (index < 0) {
    root.append(h('section', { class: 'card stack' }, h('p', null, 'Вірш не знайдено.'), h('a', { class: 'btn btn--block', href: '#/poetry' }, 'До списку віршів')));
    return;
  }
  const poem = poems[index];
  const next = poems[(index + 1) % poems.length];
  ctx.setTitle('Вірш');

  const reader = h('section', { class: 'card reader' }, poemCard(poem));
  let size = getState().settings.poemFont;
  const applySize = () => reader.style.setProperty('--poem-size', `${size}px`);
  applySize();
  const sizeBtn = (delta, label, text) => h('button', {
    class: 'round-btn',
    type: 'button',
    'aria-label': label,
    onClick: () => {
      size = Math.min(FONT_MAX, Math.max(FONT_MIN, size + delta));
      setPoemFont(size);
      applySize();
    },
  }, h('span', { class: 'font-btn', style: `font-size:${delta > 0 ? 19 : 14}px` }, text));

  const panel = speakPanel({
    type: 'poem',
    label: `${poem.author} — ${poem.title}`,
    hint: 'Натисніть і читайте вірш уголос',
    onFinish: ({ duration }) => {
      if (duration < 10) {
        toast('Читання коротше за 10 с — не зараховано');
        return;
      }
      if (markPoemAloud(poem.id)) rewardToast(XP_REWARDS.poemAloud, { levelUp: addXp(XP_REWARDS.poemAloud), extra: 'Вірш прочитано вголос' });
      else toast('Прочитано ще раз — так тримати!');
    },
  });

  root.append(
    h('div', { class: 'row-between' },
      h('a', { class: 'back', href: '#/poetry' }, icon('chevronLeft'), 'Вірші'),
      h('div', { class: 'row-gap' }, sizeBtn(-2, 'Зменшити шрифт', 'A−'), sizeBtn(2, 'Збільшити шрифт', 'A+'))),
    reader,
    h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Читай уголос'),
      h('ul', { class: 'checklist small' },
        h('li', null, 'Спершу прочитайте про себе, щоб зрозуміти зміст і настрій.'),
        h('li', null, 'Коротка пауза — наприкінці рядка, довша — між строфами.'),
        h('li', null, 'У кожному рядку виділіть голосом одне головне слово.'),
        h('li', null, 'Прослухайте запис: де ви поспішали, а де звучало переконливо?')),
      scope.use(panel)),
    h('a', { class: 'btn btn--block', href: `#/poetry/poem/${next.id}` }, `Далі: ${next.title}`, icon('chevron')),
  );
}

// ---------- Особистий словник ----------

function dueLabel(card, today) {
  if (card.due <= today) return 'повторити сьогодні';
  const [y, m, d] = card.due.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
  return days === 1 ? 'повторити завтра' : `повторити через ${days} ${plural(days, ['день', 'дні', 'днів'])}`;
}

function boxDots(box) {
  return h('span', { class: 'box-dots', 'aria-label': `Рівень засвоєння ${box} з ${BOX_INTERVALS.length}` },
    BOX_INTERVALS.map((_, i) => h('span', { class: i < box ? 'is-on' : null })));
}

function renderDictionary(root) {
  const { dictionary } = getState();
  const today = dayKey();
  const due = dueCards(today).length;

  const form = addWordForm(() => {
    root.replaceChildren();
    render(root, { params: ['dictionary'], setTitle() {} });
  });

  const summary = h('section', { class: 'card stack' },
    h('div', { class: 'tiles tiles--3' },
      tile(String(dictionary.length), plural(dictionary.length, ['слово', 'слова', 'слів'])),
      tile(String(learnedCount()), 'вивчено'),
      tile(String(due), 'на сьогодні')),
    due
      ? h('a', { class: 'btn btn--primary btn--block', href: '#/poetry/review' }, `Повторити ${due} ${plural(due, ['слово', 'слова', 'слів'])}`)
      : h('p', { class: 'small muted center' }, dictionary.length ? 'На сьогодні все повторено. Нові картки з’являться за розкладом.' : 'Словник поки порожній.'),
    h('p', { class: 'small muted' }, 'Картки повторюються дедалі рідше: через 1, 2, 4, 8 і 16 днів. Помилка повертає картку на початок. Слово вважається вивченим із третього рівня.'));

  if (!dictionary.length) {
    root.append(summary, form, h('section', { class: 'card stack' },
      h('p', null, 'Додавайте слова кнопкою «У словник» — під віршами та в слові дня.'),
      h('a', { class: 'btn btn--block', href: '#/poetry' }, 'До віршів')));
    return;
  }

  const list = h('ul', { class: 'dict-list' }, [...dictionary].reverse().map((card) => {
    const del = h('button', { class: 'round-btn round-btn--quiet', type: 'button', 'aria-label': `Видалити «${card.word}»` }, icon('trash'));
    const li = h('li', { class: 'dict-item' },
      h('div', { class: 'dict-item__text' },
        h('div', { class: 'row-gap' }, h('b', { class: 'dict-item__word' }, stressed(card.stress)), boxDots(card.box)),
        h('p', null, card.meaning),
        card.mySentence ? h('p', { class: 'example' }, card.mySentence) : null,
        h('p', { class: 'dict-item__meta' }, `${dueLabel(card, today)}${card.source ? ` · ${card.source}` : ''}`)),
      del);
    del.addEventListener('click', () => {
      if (!confirm(`Видалити «${card.word}» зі словника?`)) return;
      removeWord(card.word);
      li.remove();
      toast('Слово видалено');
    });
    return li;
  }));

  root.append(summary, form, h('section', { class: 'card stack' }, h('p', { class: 'eyebrow' }, 'Мої слова'), list));
}

function tile(value, label) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile__value' }, value), h('div', { class: 'tile__label' }, label));
}

function addWordForm(onAdded) {
  const word = h('input', { class: 'input', type: 'text', placeholder: 'Слово, напр. «обрій»', 'aria-label': 'Слово', autocomplete: 'off' });
  const meaning = h('input', { class: 'input', type: 'text', placeholder: 'Значення', 'aria-label': 'Значення', autocomplete: 'off' });
  const example = h('input', { class: 'input', type: 'text', placeholder: 'Приклад (необов’язково)', 'aria-label': 'Приклад', autocomplete: 'off' });
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('plus'), 'Додати');
  const form = h('form', { class: 'stack' }, word, meaning, example, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const w = word.value.trim();
    const m = meaning.value.trim();
    if (!w || !m) {
      toast('Вкажіть слово і його значення');
      return;
    }
    if (hasWord(w)) {
      toast('Це слово вже є у словнику');
      return;
    }
    const { levelUp } = addWord({ word: w, stress: w, meaning: m, example: example.value.trim() }, 'Моє слово');
    rewardToast(XP_REWARDS.word, { levelUp, extra: `«${w}» у словнику` });
    onAdded();
  });
  return h('details', { class: 'card details' }, h('summary', null, 'Додати своє слово'), form);
}

// ---------- Повторення карток ----------

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderReview(root) {
  const queue = shuffle(dueCards());
  let i = 0;
  let remembered = 0;
  const stage = h('div', { class: 'stack' });
  root.append(h('a', { class: 'back', href: '#/poetry/dictionary' }, icon('chevronLeft'), 'Словник'), stage);

  if (!queue.length) {
    stage.append(h('section', { class: 'card stack center' },
      h('p', { class: 'lead' }, 'На сьогодні карток немає.'),
      h('a', { class: 'btn btn--block', href: '#/poetry/dictionary' }, 'До словника')));
    return;
  }

  function showCard() {
    const card = queue[i];
    const back = h('div', { class: 'stack flash__back', hidden: true },
      h('hr', { class: 'sep' }),
      h('p', { class: 'lead' }, card.meaning),
      card.example ? h('p', { class: 'example' }, card.example) : null,
      card.mySentence ? h('p', { class: 'small muted' }, `Ваше речення: ${card.mySentence}`) : null);
    const reveal = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Показати значення');
    const answer = h('div', { class: 'answer-row', hidden: true },
      h('button', { class: 'btn', type: 'button', onClick: () => grade(false) }, 'Не пам’ятаю'),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => grade(true) }, 'Пам’ятаю'));
    reveal.addEventListener('click', () => {
      back.hidden = false;
      answer.hidden = false;
      reveal.hidden = true;
    });

    stage.replaceChildren(
      h('div', { class: 'row-between' },
        h('span', { class: 'muted small' }, `${i + 1} з ${queue.length}`),
        boxDots(card.box)),
      h('div', { class: 'bar' }, h('span', { style: `--p: ${(i / queue.length) * 100}%` })),
      h('section', { class: 'card stack flash reveal' },
        h('p', { class: 'small muted' }, 'Згадайте значення, а потім перевірте себе'),
        h('p', { class: 'big-word' }, stressed(card.stress)),
        card.source ? h('p', { class: 'small muted' }, card.source) : null,
        back),
      reveal,
      answer);
  }

  function grade(ok) {
    reviewCard(queue[i].word, ok);
    if (ok) remembered += 1;
    i += 1;
    if (i < queue.length) showCard();
    else finish();
  }

  function finish() {
    const xp = remembered * XP_REWARDS.word;
    if (xp) rewardToast(xp, { levelUp: addXp(xp) });
    stage.replaceChildren(h('section', { class: 'card stack center reveal' },
      h('div', { class: 'hero__icon center-self' }, icon('checkCircle')),
      h('h2', { class: 'card-title' }, 'Повторення завершено'),
      h('p', null, `Пам’ятаєте ${remembered} з ${queue.length}. ${remembered === queue.length ? 'Бездоганно!' : 'Забуті слова повернуться завтра.'}`),
      h('a', { class: 'btn btn--primary btn--block', href: '#/poetry/quiz' }, 'Використати слово в реченні'),
      h('a', { class: 'btn btn--block', href: '#/poetry/dictionary' }, 'До словника')));
  }

  showCard();
}

// ---------- Тест «Використай слово в реченні» ----------

// Слова змінюються (обрій → обрію), тому перевіряємо основу: слово без останніх двох літер.
function containsWord(sentence, word) {
  const clean = (s) => s.toLowerCase().replace(/́/g, '').replace(/[’ʼ]/g, "'");
  const text = clean(sentence);
  const target = clean(word);
  if (target.includes(' ')) return text.includes(target);
  const stem = target.length > 4 ? target.slice(0, -2) : target;
  return text.includes(stem);
}

function renderQuiz(root) {
  const { dictionary } = getState();
  const pool = dictionary.length ? dictionary : words.map((w) => ({ ...w, stress: w.stress || w.word }));
  let last = null;
  const stage = h('div', { class: 'stack' });

  function next() {
    let item = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (item === last) item = pool[Math.floor(Math.random() * pool.length)];
    last = item;

    const input = h('textarea', { class: 'textarea', rows: '3', placeholder: 'Ваше речення з цим словом…', 'aria-label': 'Ваше речення' });
    const check = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Перевірити');
    const feedback = h('div', { class: 'stack' });

    check.addEventListener('click', () => {
      const sentence = input.value.trim();
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (wordCount < 3) {
        toast('Напишіть повне речення — хоча б кілька слів');
        return;
      }
      const found = containsWord(sentence, item.word);
      const succeed = h('button', { class: 'btn btn--primary', type: 'button' }, 'Вдалося');
      const retry = h('button', { class: 'btn', type: 'button' }, 'Ще потренуюсь');
      succeed.addEventListener('click', () => {
        if (hasWord(item.word)) setSentence(item.word, sentence);
        rewardToast(XP_REWARDS.word, { levelUp: addXp(XP_REWARDS.word) });
        next();
      });
      retry.addEventListener('click', next);
      feedback.replaceChildren(
        h('div', { class: found ? 'banner banner--success' : 'banner' },
          icon(found ? 'checkCircle' : 'thought'),
          h('p', { class: 'small' }, found
            ? 'Слово на місці. Тепер скажіть речення вголос — із паузою перед новим словом. Чи звучить природно?'
            : `Не бачу слова «${item.word}» у реченні. Форма може змінюватися, але корінь має залишитися.`)),
        h('p', { class: 'small muted' }, 'Оцініть самі: чи правильно вжито слово за значенням?'),
        h('div', { class: 'answer-row' }, retry, succeed));
      check.hidden = true;
    });

    stage.replaceChildren(
      h('section', { class: 'card stack reveal' },
        h('p', { class: 'eyebrow' }, dictionary.length ? 'Слово з вашого словника' : 'Слово для тренування'),
        h('p', { class: 'big-word' }, stressed(item.stress)),
        h('p', null, item.meaning),
        item.example ? h('details', { class: 'details' }, h('summary', null, 'Підказка'), h('p', { class: 'example' }, item.example)) : null),
      h('section', { class: 'card stack' },
        h('p', { class: 'eyebrow' }, 'Використайте слово в реченні'),
        input,
        check,
        feedback),
      h('button', { class: 'btn btn--block', type: 'button', onClick: next }, icon('shuffle'), 'Інше слово'));
  }

  root.append(
    h('section', { class: 'card stack' },
      h('p', { class: 'small' }, 'Слово по-справжньому ваше, коли ви вживаєте його самі. Напишіть речення, перевірте і скажіть його вголос.'),
      dictionary.length ? null : h('p', { class: 'small muted' }, 'Ваш словник поки порожній, тому слова беремо з «Слова дня».')),
    stage);
  next();
}
