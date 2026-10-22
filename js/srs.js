// Особистий словник з інтервальним повторенням за системою Лейтнера.
// 5 коробок: правильна відповідь переносить картку в наступну, помилка — назад у першу.

import { XP_REWARDS, addXp, dayKey, getState, shiftDay, update } from './state.js';

// Через скільки днів показати картку знову, залежно від коробки (1…5).
export const BOX_INTERVALS = [1, 2, 4, 8, 16];

export function hasWord(word) {
  return getState().dictionary.some((card) => card.word === word);
}

// Додає слово в словник. Повертає { added, levelUp }.
export function addWord({ word, stress, meaning, example = '' }, source = '') {
  if (hasWord(word)) return { added: false, levelUp: false };
  const today = dayKey();
  update((s) => {
    s.dictionary.push({
      word,
      stress: stress || word,
      meaning,
      example,
      source,
      box: 1,
      due: shiftDay(today, BOX_INTERVALS[0]),
      added: today,
      reviews: 0,
    });
  });
  return { added: true, levelUp: addXp(XP_REWARDS.word) };
}

export function removeWord(word) {
  update((s) => { s.dictionary = s.dictionary.filter((card) => card.word !== word); });
}

export function dueCards(today = dayKey()) {
  return getState().dictionary.filter((card) => card.due <= today);
}

export function reviewCard(word, remembered) {
  const today = dayKey();
  update((s) => {
    const card = s.dictionary.find((c) => c.word === word);
    if (!card) return;
    card.box = remembered ? Math.min(BOX_INTERVALS.length, card.box + 1) : 1;
    card.due = shiftDay(today, BOX_INTERVALS[card.box - 1]);
    card.reviews += 1;
    card.lastReview = today;
  });
}

// Власне речення з тесту «Використай слово в реченні».
export function setSentence(word, sentence) {
  update((s) => {
    const card = s.dictionary.find((c) => c.word === word);
    if (card) card.mySentence = sentence;
  });
}

// Вивченим вважаємо слово, яке дійшло хоча б до 3-ї коробки.
export function learnedCount() {
  return getState().dictionary.filter((card) => card.box >= 3).length;
}
