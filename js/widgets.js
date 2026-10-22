// Віджети вправ, спільні для кількох вкладок.
// Кожен віджет повертає { el, destroy } — destroy() зупиняє таймери й запис, коли користувач іде з екрана.

import { deleteRecording, listRecordings, saveRecording } from './db.js';
import { recordingSupport, startRecording } from './recorder.js';
import { addWord, hasWord } from './srs.js';
import { XP_REWARDS, addPractice, addRating, addXp, levelInfo, logRecording, update } from './state.js';
import { formatDuration, formatTime, h, icon, micNotice, plural, stressed, toast } from './ui.js';

// ---------- Звук і вібрація наприкінці таймера ----------

let audioCtx = null;

// Викликати з обробника натискання: браузери дозволяють звук лише після дії користувача.
export function primeAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

export function signal() {
  navigator.vibrate?.(180);
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  } catch {
    // Звук не критичний.
  }
}

export function rewardToast(xp, { levelUp = false, extra = '' } = {}) {
  const parts = [`+${xp} XP`];
  if (extra) parts.push(extra);
  if (levelUp) parts.push(`Новий рівень: ${levelInfo().current.name}! 🎉`);
  toast(parts.join(' · '), levelUp || extra ? 3500 : 2200);
}

// XP за вправу поза щоденним тренуванням: із записом — як за виступ, без — як за вправу.
// Випадкові короткі натискання (менше minSeconds) не рахуються.
export function awardExercise({ duration, recorded }, { minSeconds = 10 } = {}) {
  if (duration < minSeconds) {
    toast(`Виступ коротший за ${minSeconds} с — XP не нараховано`);
    return 0;
  }
  const xp = recorded ? XP_REWARDS.speech : XP_REWARDS.exercise;
  update((s) => { s.stats.exercises += 1; });
  rewardToast(xp, { levelUp: addXp(xp) });
  return xp;
}

// ---------- Виступ: таймер + запис ----------

const RING_LENGTH = 2 * Math.PI * 46;

function ring() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'dial__ring');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<circle class="dial__track" cx="50" cy="50" r="46"/><circle class="dial__progress" cx="50" cy="50" r="46" stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="${RING_LENGTH}"/>`;
  const progress = svg.querySelector('.dial__progress');
  return { svg, set: (p) => progress.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - p))) };
}

// Аудіоплеєр для запису. Chrome не знає тривалості webm-записів із MediaRecorder,
// тому один раз перемотуємо в кінець — після цього шкала прослуховування працює.
function playbackAudio(blob) {
  const url = URL.createObjectURL(blob);
  const audio = h('audio', { controls: true, preload: 'metadata', src: url });
  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration !== Infinity) return;
    audio.currentTime = 1e101;
    audio.addEventListener('timeupdate', () => { audio.currentTime = 0; }, { once: true });
  });
  return { audio, url };
}

// Одна кнопка: запускає таймер і (якщо увімкнено) запис голосу.
// seconds > 0 — зворотний відлік із кільцем прогресу; 0 — вільний виступ із лічильником часу.
// Без мікрофона вправа працює як звичайний таймер — помилка лише пояснюється.
export function speakPanel({ type, label = 'Запис', seconds = 0, record = true, hint, onFinish } = {}) {
  const support = recordingSupport();
  let recordOn = record && support === 'ok';
  let running = false;
  let session = null;
  let startedAt = 0;
  let timerId = 0;
  let rafId = 0;
  let audioUrl = null;
  let destroyed = false;

  const dialRing = ring();
  const btn = h('button', { class: 'rec-btn', type: 'button' }, h('span', { class: 'rec-btn__shape' }));
  const dial = h('div', { class: seconds ? 'dial' : 'dial no-ring' }, dialRing.svg, btn);
  const time = h('div', { class: 'rec-time' }, formatTime(seconds));
  const status = h('div', { class: 'rec-status muted' });
  const output = h('div', { class: 'rec-output' });

  const toggleInput = h('input', { type: 'checkbox', role: 'switch' });
  toggleInput.checked = recordOn;
  toggleInput.addEventListener('change', () => {
    recordOn = toggleInput.checked;
    paintIdle();
  });
  const toggle = support === 'ok'
    ? h('label', { class: 'switch' }, h('span', null, 'Записувати голос'), toggleInput, h('span', { class: 'switch__track', 'aria-hidden': 'true' }))
    : null;

  const el = h('div', { class: 'recorder' }, dial, time, status, toggle, output);
  if (support !== 'ok') output.append(micNotice(support));

  function paintIdle() {
    el.classList.toggle('is-timer', !recordOn);
    btn.setAttribute('aria-label', recordOn ? 'Почати виступ і запис' : 'Запустити таймер');
    status.textContent = hint ?? (recordOn ? 'Натисніть і говоріть' : 'Натисніть, щоб запустити таймер');
  }
  paintIdle();

  btn.addEventListener('click', () => (running ? finish() : start()));

  const elapsed = () => (performance.now() - startedAt) / 1000;

  function tick() {
    const e = elapsed();
    if (seconds) {
      time.textContent = formatTime(Math.ceil(seconds - e));
      dialRing.set(Math.min(1, e / seconds));
      if (e >= seconds) {
        signal();
        finish();
      }
    } else {
      time.textContent = formatTime(e);
    }
  }

  async function start() {
    primeAudio();
    output.replaceChildren();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    btn.disabled = true;
    if (recordOn) {
      status.textContent = 'Чекаю на дозвіл до мікрофона…';
      try {
        session = await startRecording();
      } catch (err) {
        session = null;
        output.append(micNotice(err.code));
      }
      if (destroyed) {
        session?.cancel();
        return;
      }
    }
    running = true;
    startedAt = performance.now();
    btn.disabled = false;
    toggleInput.disabled = true;
    btn.setAttribute('aria-label', 'Зупинити');
    el.classList.toggle('is-timer', !session);
    el.classList.add('is-recording');
    status.textContent = session ? 'Йде запис… Натисніть, щоб зупинити' : 'Говоріть… Натисніть, щоб зупинити';
    dialRing.set(0);
    tick();
    timerId = setInterval(tick, 200);
    if (session) {
      const meter = () => {
        el.style.setProperty('--level', session ? session.level().toFixed(3) : '0');
        rafId = requestAnimationFrame(meter);
      };
      meter();
    }
  }

  function stopTicking() {
    clearInterval(timerId);
    cancelAnimationFrame(rafId);
    el.style.setProperty('--level', '0');
    el.classList.remove('is-recording');
  }

  async function finish() {
    if (!running) return;
    running = false;
    stopTicking();
    const duration = seconds ? Math.min(elapsed(), seconds) : elapsed();
    const result = { duration, recorded: false, id: null };
    btn.disabled = true;

    if (session) {
      const current = session;
      session = null;
      status.textContent = 'Зберігаю…';
      try {
        const { blob } = await current.stop();
        if (destroyed) return;
        if (!blob.size) throw new Error('empty');
        const player = playbackAudio(blob);
        audioUrl = player.url;
        output.replaceChildren(player.audio);
        logRecording(duration);
        result.recorded = true;
        try {
          result.id = await saveRecording({ blob, type, label, duration });
          status.textContent = `Готово: ${formatDuration(duration)}. Прослухайте себе з боку`;
        } catch {
          status.textContent = 'Запис готовий, але браузер не дозволив його зберегти';
        }
      } catch {
        addPractice(duration);
        status.textContent = 'Запис не вдався, але час практики зараховано';
        output.replaceChildren(micNotice('failed'));
      }
    } else {
      addPractice(duration);
      status.textContent = `Готово: ${formatDuration(duration)} практики`;
    }

    time.textContent = formatTime(duration);
    btn.disabled = false;
    toggleInput.disabled = false;
    btn.setAttribute('aria-label', 'Почати знову');
    el.classList.toggle('is-timer', !recordOn);
    onFinish?.(result);
  }

  function destroy() {
    destroyed = true;
    if (running) {
      stopTicking();
      addPractice(elapsed());
      running = false;
    }
    session?.cancel();
    session = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }

  return { el, destroy, stop: finish };
}

// ---------- Дихальна вправа ----------

const PHASE_LABELS = { inhale: 'Вдих', hold: 'Затримка', exhale: 'Видих', rest: 'Пауза' };
const PHASE_ORDER = ['inhale', 'hold', 'exhale', 'rest'];

export function breathingWidget(exercise, { cycles = exercise.cycles, onComplete } = {}) {
  const phases = [];
  for (let c = 1; c <= cycles; c++) {
    for (const key of PHASE_ORDER) if (exercise[key] > 0) phases.push({ key, secs: exercise[key], cycle: c });
  }
  const total = phases.reduce((sum, p) => sum + p.secs, 0);

  const circle = h('div', { class: 'breath__circle' });
  const label = h('div', { class: 'breath__phase' }, 'Готові?');
  const count = h('div', { class: 'breath__count' });
  const visual = h('div', { class: 'breath', 'aria-live': 'polite' },
    h('div', { class: 'breath__halo' }), circle, h('div', { class: 'breath__label' }, label, count));
  const pattern = h('div', { class: 'meta-row' },
    PHASE_ORDER.filter((k) => exercise[k] > 0).map((k) => h('span', { class: 'chip' }, `${PHASE_LABELS[k]} ${exercise[k]} с`)));
  const info = h('p', { class: 'muted small center' }, `${cycles} ${plural(cycles, ['цикл', 'цикли', 'циклів'])} · ≈ ${formatDuration(total)}`);
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Почати');
  const el = h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('h3', { class: 'card-title' }, exercise.name), pattern),
    visual, info, h('p', { class: 'small muted' }, exercise.tip), btn);

  let idx = -1;
  let phaseStart = 0;
  let startedAt = 0;
  let timerId = 0;
  let running = false;

  function setPhase(n) {
    idx = n;
    const p = phases[n];
    phaseStart = performance.now();
    label.textContent = PHASE_LABELS[p.key];
    circle.style.transitionDuration = `${p.secs}s`;
    if (p.key === 'inhale') circle.style.transform = 'scale(1)';
    if (p.key === 'exhale') circle.style.transform = 'scale(0.55)';
    info.textContent = `Цикл ${p.cycle} з ${cycles}`;
  }

  function tick() {
    const p = phases[idx];
    const left = p.secs - (performance.now() - phaseStart) / 1000;
    count.textContent = String(Math.max(1, Math.ceil(left)));
    if (left > 0) return;
    if (idx + 1 < phases.length) setPhase(idx + 1);
    else stop(true);
  }

  function start() {
    primeAudio();
    running = true;
    startedAt = performance.now();
    btn.textContent = 'Зупинити';
    setPhase(0);
    tick();
    timerId = setInterval(tick, 100);
  }

  function stop(completed) {
    if (!running) return;
    running = false;
    clearInterval(timerId);
    addPractice((performance.now() - startedAt) / 1000);
    circle.style.transitionDuration = '0.8s';
    circle.style.transform = 'scale(0.55)';
    label.textContent = completed ? 'Чудово!' : 'Готові?';
    count.textContent = '';
    info.textContent = `${cycles} ${plural(cycles, ['цикл', 'цикли', 'циклів'])} · ≈ ${formatDuration(total)}`;
    btn.textContent = completed ? 'Ще раз' : 'Почати';
    if (completed) {
      signal();
      onComplete?.();
    }
  }

  btn.addEventListener('click', () => (running ? stop(false) : start()));

  return { el, destroy: () => stop(false) };
}

// ---------- Скоромовка з темпом і підсвіткою ----------

// Склади за секунду для кожного темпу.
const TEMPOS = [
  { id: 'slow', label: 'Повільно', rate: 2.2, tip: 'Чітко вимовляйте кожен звук, особливо приголосні.' },
  { id: 'mid', label: 'Середньо', rate: 3.5, tip: 'Тримайте чіткість, додайте природну інтонацію.' },
  { id: 'fast', label: 'Швидко', rate: 5, tip: 'Швидко, але без «ковтання» звуків. Збилися — повільніше.' },
];
const VOWELS = /[аеєиіїоуюя]/gi;

function wordTimings(text, rate) {
  return text.split(/\s+/).filter(Boolean).map((word) => {
    const syllables = (word.match(VOWELS) ?? []).length;
    const pause = /[,.!?:;—–]$/.test(word) ? 0.35 : 0;
    return { word, secs: syllables / rate + pause };
  });
}

const LEVEL_NAMES = { 1: 'Легка', 2: 'Середня', 3: 'Складна' };

export function twisterWidget(list, { index = 0 } = {}) {
  let i = Math.min(index, list.length - 1);
  let tempo = TEMPOS[0];
  let running = false;
  let timer = 0;
  let startedAt = 0;
  let reps = 0;
  let lastRun = 0;
  const doneTempos = new Set();

  const counter = h('span', { class: 'muted small' });
  const nav = list.length > 1
    ? h('div', { class: 'row-between' },
      h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Попередня скоромовка', onClick: () => go(-1) }, icon('chevronLeft')),
      counter,
      h('div', { class: 'row-gap' },
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Випадкова скоромовка', onClick: random }, icon('shuffle')),
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Наступна скоромовка', onClick: () => go(1) }, icon('chevron'))))
    : null;
  const meta = h('div', { class: 'meta-row' });
  const text = h('p', { class: 'twister__text' });
  const tempoBtns = TEMPOS.map((t) => h('button', { type: 'button', onClick: () => setTempo(t) }, t.label));
  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Темп' }, tempoBtns);
  const goal = h('p', { class: 'muted small' });
  const startBtn = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => (running ? stop(false) : run()) });
  const result = h('p', { class: 'muted small center' });
  const el = h('div', { class: 'twister stack' }, nav, meta, text, segmented, goal, startBtn, result);

  function paint() {
    const t = list[i];
    const timings = wordTimings(t.text, tempo.rate);
    const total = timings.reduce((sum, w) => sum + w.secs, 0);
    counter.textContent = `${i + 1} з ${list.length}`;
    meta.replaceChildren(
      h('span', { class: 'chip' }, `${LEVEL_NAMES[t.level]} ${'●'.repeat(t.level)}${'○'.repeat(3 - t.level)}`),
      h('span', { class: 'chip' }, `Звуки ${t.focus}`),
    );
    text.replaceChildren(...timings.flatMap((w) => [h('span', { class: 'w' }, w.word), ' ']));
    tempoBtns.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(TEMPOS[k] === tempo));
      b.classList.toggle('is-done', doneTempos.has(TEMPOS[k].id));
    });
    goal.textContent = `Ціль: ≈ ${Math.max(1, Math.round(total))} с. ${tempo.tip}`;
    startBtn.textContent = reps ? 'Читати ще раз' : 'Читати за підсвіткою';
    result.textContent = reps
      ? `Прочитано ${reps} ${plural(reps, ['раз', 'рази', 'разів'])}. Останнє — ${lastRun.toFixed(1)} с`
      : 'Читайте вголос слово, яке підсвічується. Спершу повільно, потім швидше.';
  }

  function run() {
    const timings = wordTimings(list[i].text, tempo.rate);
    const spans = [...text.querySelectorAll('.w')];
    running = true;
    startedAt = performance.now();
    el.classList.add('is-running');
    startBtn.textContent = 'Зупинити';
    let k = 0;
    const step = () => {
      spans.forEach((s, j) => {
        s.classList.toggle('is-past', j < k);
        s.classList.toggle('is-now', j === k);
      });
      if (k >= spans.length) {
        stop(true);
        return;
      }
      timer = setTimeout(() => {
        k += 1;
        step();
      }, timings[k].secs * 1000);
    };
    step();
  }

  function stop(completed) {
    clearTimeout(timer);
    if (!running) return;
    running = false;
    const secs = (performance.now() - startedAt) / 1000;
    addPractice(secs);
    el.classList.remove('is-running');
    if (completed) {
      reps += 1;
      lastRun = secs;
      doneTempos.add(tempo.id);
      // Підказуємо наступний темп: повільно → середньо → швидко.
      const next = TEMPOS[TEMPOS.indexOf(tempo) + 1];
      if (next && !doneTempos.has(next.id)) tempo = next;
    }
    paint();
  }

  function setTempo(t) {
    stop(false);
    tempo = t;
    paint();
  }

  function go(delta) {
    stop(false);
    i = (i + delta + list.length) % list.length;
    reps = 0;
    doneTempos.clear();
    tempo = TEMPOS[0];
    paint();
  }

  function random() {
    if (list.length < 2) return;
    let next = i;
    while (next === i) next = Math.floor(Math.random() * list.length);
    go(next - i);
  }

  paint();
  return { el, destroy: () => stop(false) };
}

// ---------- Слова ----------

export function saveWordButton(word, source = '') {
  const btn = h('button', { class: 'btn btn--small', type: 'button' });
  const paint = () => {
    const saved = hasWord(word.word);
    btn.replaceChildren(icon(saved ? 'check' : 'plus'), saved ? 'У словнику' : 'У словник');
    btn.disabled = saved;
  };
  btn.addEventListener('click', () => {
    const { added, levelUp } = addWord(word, source);
    if (added) rewardToast(XP_REWARDS.word, { levelUp, extra: `«${word.word}» у словнику` });
    paint();
  });
  paint();
  return btn;
}

export function wordCard(word) {
  return h('div', { class: 'stack' },
    h('p', { class: 'big-word', 'aria-label': word.word }, stressed(word.stress || word.word)),
    h('p', { class: 'lead' }, word.meaning),
    word.example ? h('p', { class: 'example' }, word.example) : null,
    h('div', null, saveWordButton(word, 'Слово дня')),
  );
}

// ---------- Вірш ----------

export function poemCard(poem) {
  return h('article', { class: 'stack' },
    h('div', null,
      h('p', { class: 'eyebrow' }, poem.author),
      h('h2', { class: 'poem__title' }, poem.title),
      poem.year ? h('p', { class: 'muted small' }, poem.year) : null),
    h('p', { class: 'poem__text' }, poem.text),
    poem.words?.length
      ? h('div', { class: 'stack' },
        h('p', { class: 'eyebrow' }, 'Слова з вірша'),
        h('ul', { class: 'word-list' }, poem.words.map((w) => h('li', { class: 'word-item' },
          h('div', null, h('b', null, stressed(w.stress || w.word)), h('p', null, w.meaning)),
          saveWordButton(w, `${poem.author}, «${poem.title}»`)))))
      : null,
    poem.source
      ? h('a', { class: 'source-link', href: poem.source, target: '_blank', rel: 'noopener' }, icon('link'), 'Звірити текст із першоджерелом')
      : null,
  );
}

// ---------- Самооцінка після виступу ----------

const CRITERIA = [
  { id: 'clarity', label: 'Чіткість', hint: 'Чи було зрозуміло й виразно?', advice: 'Сповільніть темп і доводьте до кінця кожне слово.' },
  { id: 'logic', label: 'Логіка', hint: 'Чи була думка послідовною?', advice: 'Спробуйте структуру ПРЕП: позиція, причина, приклад, позиція.' },
  { id: 'confidence', label: 'Впевненість', hint: 'Чи звучав голос упевнено?', advice: 'Опускайте тон наприкінці речень і робіть паузу замість «е-е».' },
];

export function selfRating({ type, onSaved } = {}) {
  const values = {};
  const saveBtn = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: true }, 'Зберегти оцінку');
  const rows = CRITERIA.map((c) => {
    const buttons = [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': `${c.label}: ${n} з 5`,
      onClick: () => {
        values[c.id] = n;
        buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k + 1 === n)));
        saveBtn.disabled = CRITERIA.some((x) => !values[x.id]);
      },
    }, String(n)));
    return h('div', { class: 'rating__row' },
      h('div', null, h('b', null, c.label), ' ', h('span', { class: 'muted small' }, c.hint)),
      h('div', { class: 'rating__scale' }, buttons));
  });
  const el = h('div', { class: 'stack' }, h('p', { class: 'eyebrow' }, 'Оцініть свій виступ'), rows, saveBtn);

  saveBtn.addEventListener('click', () => {
    addRating(type, { ...values });
    const avg = (values.clarity + values.logic + values.confidence) / 3;
    const weakest = CRITERIA.reduce((a, b) => (values[b.id] < values[a.id] ? b : a));
    el.replaceChildren(
      h('p', { class: 'eyebrow' }, 'Оцінку збережено'),
      h('p', { class: 'lead' }, `Середній бал: ${avg.toFixed(1)} з 5`),
      h('p', { class: 'small' }, avg >= 4.5 ? 'Чудовий виступ! Наступного разу ускладніть тему.' : `Порада на наступний раз (${weakest.label.toLowerCase()}): ${weakest.advice}`),
    );
    onSaved?.(values);
  });

  return { el, destroy() {} };
}

// ---------- Список записів ----------

const TYPE_LABELS = {
  'mic-test': 'Перевірка мікрофона',
  free: 'Вільний запис',
  word: 'Слово дня',
  thought: 'Вправа на думку',
  topic: 'Випадкова тема',
  explain: 'Поясни просто',
  argue: 'Аргумент і контраргумент',
  interview: 'Співбесіда',
  debate: 'Дебати',
  speech: 'Розбір промови',
  poem: 'Читання вірша',
  challenge: 'Челендж',
};

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function recordingsList({ limit = 0, type, emptyText = 'Записів поки немає. Запишіть себе — і вони з’являться тут.' } = {}) {
  const list = h('ul', { class: 'rec-list' });
  const el = h('div', null, list);
  let player = null;
  let playingBtn = null;
  const urls = [];

  function stopPlaying() {
    player?.pause();
    if (playingBtn) playingBtn.replaceChildren(icon('play'));
    player = null;
    playingBtn = null;
  }

  function row(rec) {
    const playBtn = h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Прослухати' }, icon('play'));
    const delBtn = h('button', { class: 'round-btn round-btn--quiet', type: 'button', 'aria-label': 'Видалити запис' }, icon('trash'));
    const li = h('li', { class: 'rec-row' },
      playBtn,
      h('div', { class: 'rec-row__text' },
        h('div', { class: 'rec-row__title' }, rec.label || TYPE_LABELS[rec.type] || 'Запис'),
        h('div', { class: 'rec-row__meta' }, `${dateFormat.format(rec.createdAt)} · ${formatTime(rec.duration)}`)),
      delBtn);

    playBtn.addEventListener('click', () => {
      if (playingBtn === playBtn) {
        stopPlaying();
        return;
      }
      stopPlaying();
      const url = URL.createObjectURL(rec.blob);
      urls.push(url);
      player = new Audio(url);
      playingBtn = playBtn;
      playBtn.replaceChildren(icon('pause'));
      player.addEventListener('ended', stopPlaying);
      player.play().catch(() => {
        stopPlaying();
        toast('Не вдалося відтворити запис');
      });
    });

    delBtn.addEventListener('click', async () => {
      if (!confirm('Видалити цей запис? Його не можна буде відновити.')) return;
      if (playingBtn === playBtn) stopPlaying();
      try {
        await deleteRecording(rec.id);
        li.remove();
        if (!list.children.length) list.replaceWith(empty());
        toast('Запис видалено');
      } catch {
        toast('Не вдалося видалити запис');
      }
    });
    return li;
  }

  const empty = () => h('p', { class: 'muted small' }, emptyText);

  async function reload() {
    stopPlaying();
    let items = [];
    try {
      items = await listRecordings({ type });
    } catch {
      el.replaceChildren(h('p', { class: 'muted small' }, 'Сховище записів недоступне в цьому браузері.'));
      return;
    }
    if (limit) items = items.slice(0, limit);
    list.replaceChildren(...items.map(row));
    el.replaceChildren(items.length ? list : empty());
  }

  reload();

  return {
    el,
    reload,
    destroy() {
      stopPlaying();
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

// ---------- Лічильник слів-паразитів ----------

export function fillerCounter(words) {
  const counts = new Map(words.map((w) => [w, 0]));
  const total = h('p', { class: 'lead' });
  const buttons = words.map((w) => {
    const badge = h('span', { class: 'filler__count' }, '0');
    const btn = h('button', { class: 'filler', type: 'button', 'aria-label': `${w}: додати один` }, h('span', null, w), badge);
    btn.addEventListener('click', () => {
      counts.set(w, counts.get(w) + 1);
      badge.textContent = String(counts.get(w));
      btn.classList.add('bump');
      setTimeout(() => btn.classList.remove('bump'), 150);
      paintTotal();
    });
    return { btn, badge };
  });
  const reset = h('button', { class: 'btn btn--small', type: 'button' }, 'Скинути');
  reset.addEventListener('click', () => {
    words.forEach((w) => counts.set(w, 0));
    buttons.forEach(({ badge }) => { badge.textContent = '0'; });
    paintTotal();
  });

  function paintTotal() {
    const sum = [...counts.values()].reduce((a, b) => a + b, 0);
    total.textContent = sum ? `Разом: ${sum}` : 'Поки жодного — чудово!';
  }
  paintTotal();

  const el = h('div', { class: 'stack' },
    h('div', { class: 'filler-grid' }, buttons.map((b) => b.btn)),
    h('div', { class: 'row-between' }, total, reset));
  return { el, destroy() {} };
}
