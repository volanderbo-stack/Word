// Досягнення. Кожен бейдж: поточне значення з прогресу і ціль.
// checkBadges() викликається після кожної зміни стану (див. app.js) і повертає щойно отримані.

import { dayKey, getState, update } from './state.js';

const learned = (s) => s.dictionary.filter((c) => c.box >= 3).length;

export const BADGES = [
  { id: 'first-step', title: 'Перший крок', text: 'Виконайте першу вправу', icon: 'checkCircle', target: 1, value: (s) => s.stats.exercises },
  { id: 'first-record', title: 'Перший запис', text: 'Запишіть свій голос', icon: 'voice', target: 1, value: (s) => s.stats.recordings },
  { id: 'streak-7', title: 'Тиждень поспіль', text: '7 днів тренувань без перерви', icon: 'flame', target: 7, value: (s) => s.streak.best },
  { id: 'streak-30', title: 'Місяць поспіль', text: '30 днів тренувань без перерви', icon: 'flame', target: 30, value: (s) => s.streak.best },
  { id: 'words-10', title: 'Збирач слів', text: '10 слів в особистому словнику', icon: 'word', target: 10, value: (s) => s.dictionary.length },
  { id: 'words-50', title: '50 слів', text: '50 вивчених слів', icon: 'word', target: 50, value: learned },
  { id: 'poems-10', title: 'Читець', text: '10 віршів, прочитаних уголос', icon: 'poetry', target: 10, value: (s) => s.stats.poemsRead.length },
  { id: 'honest-10', title: 'Чесний погляд', text: '10 самооцінок після виступів', icon: 'thought', target: 10, value: (s) => s.ratings.length },
  { id: 'hour', title: 'Година практики', text: '60 хвилин тренувань загалом', icon: 'clock', target: 60, value: (s) => Math.floor(s.practiceSeconds / 60) },
  { id: 'challenge-7', title: 'Тиждень челенджу', text: '7 днів челенджу «Від тиші до промови»', icon: 'target', target: 7, value: (s) => s.challenge.completedDays.length },
  { id: 'challenge-30', title: 'Від тиші до промови', text: 'Пройдіть увесь челендж', icon: 'trophy', target: 30, value: (s) => s.challenge.completedDays.length },
  { id: 'orator', title: 'Оратор', text: 'Досягніть рівня «Оратор»', icon: 'star', target: 1000, value: (s) => s.xp },
];

export function badgeProgress(badge, s = getState()) {
  const value = badge.value(s);
  return { value: Math.min(value, badge.target), earnedOn: s.badges[badge.id] ?? null };
}

export function checkBadges() {
  const s = getState();
  const fresh = BADGES.filter((b) => !s.badges[b.id] && b.value(s) >= b.target);
  if (fresh.length) {
    const today = dayKey();
    update((st) => fresh.forEach((b) => { st.badges[b.id] = today; }));
  }
  return fresh;
}
