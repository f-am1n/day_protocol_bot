/* Shared, dependency-free domain model. Dates are local calendar dates. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DayProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parse = value => new Date(value + 'T12:00:00');
  const today = () => key(new Date());
  const shift = (date, n) => { const d = parse(date); d.setDate(d.getDate() + n); return key(d); };
  const weekday = date => (parse(date).getDay() + 6) % 7;
  const monday = date => shift(date, -weekday(date));
  const isDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= '2100-12-31' && key(parse(date)) === date;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const periods = ['morning', 'day', 'evening'];
  function validConfig(c) {
    return object(c) && ['check', 'count', 'minutes'].includes(c.type) && integer(c.target, 1, 100000) &&
      (c.type !== 'check' || c.target === 1) && ['days', 'weekly'].includes(c.schedule) &&
      Array.isArray(c.days) && c.days.length > 0 && c.days.length <= 7 && c.days.every(d => integer(d, 0, 6)) &&
      new Set(c.days).size === c.days.length && integer(c.frequency, 1, 7) &&
      (c.unit === undefined || (typeof c.unit === 'string' && c.unit.length <= 16)) &&
      (c.step === undefined || integer(c.step, 1, 100000));
  }
  function validate(s, asOf = today()) {
    if (!object(s) || (s.version !== undefined && s.version !== 2) || !Array.isArray(s.habits) || s.habits.length > 500 || !object(s.logs)) return false;
    if (s.language !== undefined && !['ru', 'en'].includes(s.language)) return false;
    const ids = new Set();
    for (const h of s.habits) {
      if (!object(h) || typeof h.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(h.id) || ['constructor', 'prototype', '__proto__'].includes(h.id) || ids.has(h.id)) return false;
      ids.add(h.id);
      if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > 70 || typeof h.icon !== 'string' || h.icon.length > 12 || !periods.includes(h.period) || !isDate(h.created) || h.created > asOf || !validConfig(h)) return false;
      if (h.archivedAt != null && (!isDate(h.archivedAt) || h.archivedAt < h.created || h.archivedAt > asOf)) return false;
      if (h.revisions !== undefined) {
        if (!Array.isArray(h.revisions) || h.revisions.length > 1000 || !h.revisions.length || h.revisions[0].from !== h.created) return false;
        if (!h.revisions.every((r, i) => validConfig(r) && isDate(r.from) && (!i || r.from > h.revisions[i - 1].from))) return false;
      }
      if (h.pauses !== undefined && (!Array.isArray(h.pauses) || h.pauses.length > 1000 || !h.pauses.every((p, i) => object(p) && isDate(p.from) && p.from >= h.created && p.from <= asOf && (p.to === null || (isDate(p.to) && p.to >= p.from && p.to <= asOf)) && (!i || (h.pauses[i - 1].to !== null && p.from >= h.pauses[i - 1].to))))) return false;
    }
    return Object.entries(s.logs).every(([date, logs]) => isDate(date) && date <= asOf && object(logs) && Object.entries(logs).every(([id, amount]) => ids.has(id) && integer(amount, 0, 100000)));
  }
  const config = h => ({type: h.type, target: h.target, schedule: h.schedule, days: [...h.days], frequency: h.frequency, unit: h.unit || (h.type === 'minutes' ? 'мин.' : 'раз'), step: h.step || 1});
  function migrate(input) {
    if (!validate(input)) throw new Error('Некорректная резервная копия');
    const s = structuredClone(input);
    for (const h of s.habits) {
      Object.assign(h, config(h));
      h.revisions ??= [{from: h.created, ...config(h)}];
      h.pauses ??= h.archivedAt ? [{from: h.archivedAt, to: null}] : [];
    }
    s.version = 2;
    return s;
  }
  function configAt(h, date) {
    let result = config(h);
    for (const revision of h.revisions || []) { if (revision.from > date) break; result = revision; }
    return result;
  }
  const value = (s, h, date) => s.logs[date]?.[h.id] || 0;
  const done = (s, h, date) => value(s, h, date) >= configAt(h, date).target;
  function active(h, date) {
    return date >= h.created && !(h.pauses || []).some(p => date >= p.from && (p.to === null || date < p.to));
  }
  function scheduled(s, h, date) {
    const c = configAt(h, date);
    return date >= h.created && (active(h, date) || value(s, h, date) > 0) && (c.schedule === 'weekly' || c.days.includes(weekday(date)));
  }
  const daily = (s, date) => s.habits.filter(h => scheduled(s, h, date) && configAt(h, date).schedule === 'days');
  function dayStats(s, date) { const list = daily(s, date); return {total: list.length, complete: list.filter(h => done(s, h, date)).length}; }
  function weekly(s, h, date, asOf = today()) {
    const start = monday(date), dates = Array.from({length: 7}, (_, i) => shift(start, i));
    const eligible = dates.filter(d => d >= h.created && configAt(h, d).schedule === 'weekly' && (active(h, d) || value(s, h, d) > 0));
    const reference = eligible[0] || date, c = configAt(h, reference);
    const target = Math.min(c.frequency, eligible.length);
    const complete = eligible.filter(d => d <= asOf && done(s, h, d)).length;
    return {target, complete, met: target > 0 && complete >= target};
  }
  function weekStats(s, date, asOf = today()) {
    const start = monday(date); let target = 0, complete = 0;
    for (let i = 0; i < 7; i++) { const d = shift(start, i); if (d > asOf) continue; const t = dayStats(s, d); target += t.total; complete += t.complete; }
    for (const h of s.habits) { const w = weekly(s, h, date, asOf); target += w.target; complete += Math.min(w.complete, w.target); }
    return {target, complete, percent: target ? Math.round(complete / target * 100) : 0};
  }
  function streak(s, h, asOf = today()) {
    let count = 0, best = 0, lastMode = null;
    for (let d = h.created; d <= asOf; d = shift(d, 1)) {
      const c = configAt(h, d);
      if (lastMode && lastMode !== c.schedule) { count = 0; best = 0; }
      lastMode = c.schedule;
      if (c.schedule === 'weekly') {
        const end = shift(monday(d), 6);
        if (d !== end && d !== asOf) continue;
        const w = weekly(s, h, d, asOf);
        if (!w.target) continue;
        if (w.met) count++; else if (end < asOf) count = 0;
      } else {
        if (!scheduled(s, h, d)) continue;
        if (done(s, h, d)) count++; else if (d < asOf) count = 0;
      }
      best = Math.max(best, count);
    }
    return {current: count, best, unit: configAt(h, asOf).schedule === 'weekly' ? 'нед.' : 'дн.'};
  }
  function revise(h, changes, date = today()) {
    const current = configAt(h, date), upcoming = config(changes);
    const changed = JSON.stringify(config(current)) !== JSON.stringify(upcoming);
    Object.assign(h, {name: changes.name, icon: changes.icon, period: changes.period});
    h.revisions = h.revisions.filter(r => r.from <= date);
    if (!changed) { Object.assign(h, upcoming); return null; }
    // Weekly contracts change at a week boundary; other goals start tomorrow.
    const from = current.schedule === 'weekly' || upcoming.schedule === 'weekly' ? shift(monday(date), 7) : shift(date, 1);
    h.revisions.push({from, ...upcoming});
    Object.assign(h, upcoming);
    return from;
  }
  function archive(h, date = today()) {
    h.archivedAt = date;
    h.pauses.push({from: date, to: null});
  }
  function restore(h, date = today()) {
    const p = h.pauses.find(p => p.to === null); if (p) p.to = date;
    h.archivedAt = null;
  }
  return {key, parse, today, shift, weekday, monday, isDate, validate, migrate, config, configAt, value, done, active, scheduled, daily, dayStats, weekly, weekStats, streak, revise, archive, restore};
});
