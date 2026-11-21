// Зельевар — правила, механики, решатель и генератор уровней.
// Общий код для игры (браузер/WebView) и для офлайн-генерации (node tools/gen.js).
(function (root) {
'use strict';

const HID = 16;                 // флаг «скрытый слой» в коде ячейки
const col = u => u & 15;
const PALETTE_SIZE = 12;

// Механики и уровень, на котором каждая впервые появляется (с обучающей подсказкой)
const MECHS = {
  hidden: 8,    // тайные слои «?» — открываются, когда оказываются сверху
  ice: 16,      // ледяная колба — оттаивает через N ходов
  blitz: 25,    // блиц — уровень на время
  funnel: 28,   // воронка — в неё можно только наливать
  lock: 36,     // колба под замком — открывается, когда собран цвет замка
  tall: 46,     // высокая колба — вмещает больше слоёв
  deep: 63,     // глубокие колбы — по 5 слоёв каждого цвета
  stone: 77,    // камень на дне — колба на один слой меньше, только как буфер
  dark: 123,    // тёмный уровень — видны только верхние слои во всех колбах
  filter: 153,  // колба-фильтр — принимает только свой цвет
  seal: 186,    // сургучная печать — колба откроется, когда собрано N любых цветов
  tap: 227,     // колба с краном — выливается снизу, а не сверху
  recipe: 273,  // рецепт — уровень с ограничением ходов
  narrow: 320,  // узкое горлышко — за раз наливается только один слой
  heavy: 380,   // тяжёлое зелье — опускается на дно колбы, можно лить поверх любого цвета
  order: 450,   // заказ клиента — цвета засчитываются строго по порядку
  boil: 530,    // котёл — каждые N ходов верхний слой уходит на дно
  bomb: 610,    // нестабильное зелье — колбу надо собрать или освободить к N-му ходу
  frost: 700,   // ледяной слой — слой внутри колбы и всё под ним заморожены N ходов
  crack: 800,   // треснувшая колба — из неё можно перелить только N раз
  mirror: 900,  // зеркальная колба — после наливания содержимое переворачивается
};
const MODES = ['blitz', 'recipe'];   // режимы, а не механики колб

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Правила ----------
function initState(L) { return { f: L.start.map(a => a.slice()), moves: 0, c: L.flasks.map(f => f.crack || 0) }; }
function cloneState(st) { return { f: st.f.map(a => a.slice()), moves: st.moves, c: (st.c || []).slice() }; }

function topRun(a) {
  const n = a.length; if (!n) return 0;
  const c = a[n - 1]; if (c >= HID) return 0;
  let k = 0; for (let i = n - 1; i >= 0 && a[i] === c; i--) k++;
  return k;
}
// Сколько порций у цвета: обычно U, у «больших» цветов (механика высоких колб) — больше
function need(L, c) { return (L.cnt && L.cnt[c]) || L.U; }
// Колба собрана: в ней все порции одного цвета (скрытые тоже считаются — они сразу открываются)
function complete(a, x) {
  if (!a.length) return false;
  const c = col(a[0]), n = typeof x === 'number' ? x : need(x, c);
  if (a.length !== n) return false;
  for (let i = 1; i < n; i++) if (col(a[i]) !== c) return false;
  return true;
}
function doneMask(L, st) {
  let m = 0;
  for (const a of st.f) if (complete(a, L)) m |= 1 << col(a[0]);
  if (L.order) {       // «заказ клиента»: цвет засчитан, только если все предыдущие по заказу уже собраны
    let ok = true;
    for (const c of L.order) { if (!ok) m &= ~(1 << c); else if (!((m >> c) & 1)) ok = false; }
  }
  return m;
}
// Колба собрана и засчитана (с учётом порядка заказа)
function flaskDone(L, a, done) { return complete(a, L) && ((done >> col(a[0])) & 1) === 1; }
function cracked(L, st, i) { return L.flasks[i].crack > 0 && st.c && st.c[i] <= 0; }
// Нестабильное зелье: на N-м ходу колба должна быть собрана или пуста
function exploded(L, st) {
  return L.flasks.some((F, q) => F.bomb > 0 && st.moves === F.bomb && st.f[q].length > 0 && !complete(st.f[q], L));
}
function popcount(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
function frozen(L, st, i) { return st.moves < L.flasks[i].ice; }
function locked(L, i, done) { const k = L.flasks[i].lock; return k >= 0 && !((done >> k) & 1); }
function sealed(L, i, done) { const s = L.flasks[i].seal; return s > 0 && popcount(done) < s; }
function usable(L, st, i, done) { return !frozen(L, st, i) && !locked(L, i, done) && !sealed(L, i, done) && !cracked(L, st, i); }
const isTap = (L, i) => L.flasks[i].type === 't';
// Сколько одинаковых слоёв выльется: сверху, а у колбы с краном — снизу
function outRun(L, a, i, st) {
  let k;
  if (!isTap(L, i)) k = topRun(a);
  else {
    const n = a.length; if (!n) return 0;
    const c = a[0]; if (c >= HID) return 0;
    k = 0; while (k < n && a[k] === c) k++;
  }
  const F = L.flasks[i];
  if (F.frost && st && st.moves < F.frost) k = Math.min(k, Math.max(0, a.length - 1 - F.frostAt));
  return k;
}
const frostOn = (L, st, i) => L.flasks[i].frost > 0 && st.moves < L.flasks[i].frost;
function outColor(L, i, a) { return isTap(L, i) ? a[0] : a[a.length - 1]; }

// Причина, по которой ход невозможен (или null, если можно)
function whyNot(L, st, i, j, done) {
  if (done === undefined) done = doneMask(L, st);
  const a = st.f[i], b = st.f[j];
  if (i === j) return 'same';
  if (!a.length) return 'empty';
  if (L.flasks[i].type === 'f') return 'funnel';
  if (flaskDone(L, a, done)) return 'complete';
  if (frozen(L, st, i) || frozen(L, st, j)) return 'ice';
  if (locked(L, i, done) || locked(L, j, done)) return 'lock';
  if (sealed(L, i, done) || sealed(L, j, done)) return 'seal';
  if (cracked(L, st, i) || cracked(L, st, j)) return 'crack';
  if (outRun(L, a, i, st) === 0) return 'frost';
  if (b.length >= L.flasks[j].cap) return 'full';
  const oc = outColor(L, i, a), fc = L.flasks[j].filter;
  if (fc >= 0 && oc !== fc) return 'filter';
  // тяжёлое зелье можно лить поверх любого цвета — оно опустится на дно
  if (b.length && b[b.length - 1] !== oc && col(oc) !== L.heavy) return 'color';
  return null;
}
function canPour(L, st, i, j, done) { return whyNot(L, st, i, j, done) === null; }

// Ход. Возвращает запись, по которой ход можно точно отменить (и повторить в анимации)
function pour(L, st, i, j) {
  const a = st.f[i], b = st.f[j], Fj = L.flasks[j];
  let n = Math.min(outRun(L, a, i, st), Fj.cap - b.length);
  if (Fj.narrow) n = Math.min(n, 1);                                   // узкое горлышко
  const tap = isTap(L, i);
  const units = tap ? a.splice(0, n) : a.splice(a.length - n, n);
  const sink = L.heavy >= 0 && col(units[0]) === L.heavy;               // тяжёлое зелье — на дно
  if (sink) b.unshift(...units); else b.push(...units);
  let rev = false;
  if (!tap && a.length && a[a.length - 1] >= HID) { a[a.length - 1] -= HID; rev = true; }
  let flip = false, frev = false;
  if (Fj.mirror && b.length > 1) {                                      // зеркальная колба переворачивается
    b.reverse(); flip = true;
    if (b[b.length - 1] >= HID) { b[b.length - 1] -= HID; frev = true; }
  }
  if (L.flasks[i].crack) st.c[i]--;
  st.moves++;
  const rot = [];                                                       // котлы: верхний слой уходит вниз
  for (let q = 0; q < L.flasks.length; q++) {
    const K = L.flasks[q].boil, x = st.f[q];
    if (K && st.moves % K === 0 && x.length > 1) {
      x.unshift(x.pop()); let r = false;
      if (x[x.length - 1] >= HID) { x[x.length - 1] -= HID; r = true; }
      rot.push([q, r]);
    }
  }
  return { i, j, n, rev, sink, flip, frev, rot };
}
function unpour(L, st, m) {
  const a = st.f[m.i], b = st.f[m.j];
  for (let k = m.rot.length - 1; k >= 0; k--) { const q = m.rot[k][0], x = st.f[q]; if (m.rot[k][1]) x[x.length - 1] += HID; x.push(x.shift()); }
  st.moves--;
  if (L.flasks[m.i].crack) st.c[m.i]++;
  if (m.flip) { if (m.frev) b[b.length - 1] += HID; b.reverse(); }
  if (m.rev) a[a.length - 1] += HID;
  const units = m.sink ? b.splice(0, m.n) : b.splice(b.length - m.n, m.n);
  if (isTap(L, m.i)) a.unshift(...units); else a.push(...units);
}
function won(L, st) { return st.f.every(a => !a.length || complete(a, L)); }

// ---------- Решатель: поиск в глубину с отсечениями ----------
function solve(L, st0, limit, maxDepth) {
  limit = limit || 200000; maxDepth = maxDepth || Infinity;
  const st = cloneState(st0), U = L.U, F = L.flasks, N = F.length;
  const plain = [], special = [];
  const isPlain = f => f.cap === U && f.type === 'n' && !f.ice && f.lock < 0 && !(f.filter >= 0) && !f.seal && !f.stone &&
    !f.narrow && !f.boil && !f.bomb && !f.frost && !f.crack && !f.mirror;
  F.forEach((f, i) => (isPlain(f) ? plain : special).push(i));
  const maxT = Math.max(0, ...F.map(f => Math.max(f.ice || 0, f.frost || 0, f.bomb || 0) + (f.bomb > 0 ? 1 : 0)));
  const boils = F.map(f => f.boil).filter(Boolean), hasBomb = F.some(f => f.bomb > 0), hasCrack = F.some(f => f.crack);
  const key = () => plain.map(i => st.f[i].join(',')).sort().join('|') + '#' +
    special.map(i => st.f[i].join(',')).join('|') + '#' + (st.moves < maxT ? st.moves : '') +
    (boils.length ? '#' + boils.map(K => st.moves % K).join(',') : '') + (hasCrack ? '#' + st.c.join(',') : '');
  const seen = new Map(), path = [];
  let nodes = 0, aborted = false;

  function moves() {
    const done = doneMask(L, st), res = [];
    for (let i = 0; i < N; i++) {
      const a = st.f[i]; if (!a.length) continue;
      const run = outRun(L, a, i, st), emptyCls = new Set();
      for (let j = 0; j < N; j++) {
        if (!canPour(L, st, i, j, done)) continue;
        const b = st.f[j]; let s;
        if (!b.length) {
          const cls = F[j].cap + F[j].type + (F[j].ice ? 'i' + j : '') + (F[j].filter >= 0 ? 'f' + F[j].filter : '') + (F[j].narrow ? 'n' : '') + (F[j].mirror ? 'm' : '') + (F[j].crack ? 'c' + j : '') + (F[j].boil ? 'b' + j : '') + (F[j].bomb ? 'x' + j : '') + (F[j].frost ? 'z' + j : '');
          if (emptyCls.has(cls)) continue;
          emptyCls.add(cls);
          if (run === a.length && F[j].cap === F[i].cap && F[j].type === F[i].type && isPlain(F[i]) && isPlain(F[j])) continue;
          s = 1;
        } else {
          const fill = Math.min(run, F[j].cap - b.length);
          s = fill < run ? 2 : 4;
          if (topRun(b) === b.length && b.length + fill === need(L, col(b[b.length - 1]))) s = 10;
        }
        if (run === a.length) s += 2;
        else if (!isTap(L, i) && a[a.length - 1 - run] >= HID) s += 1;
        res.push([s, i, j]);
      }
    }
    return res.sort((x, y) => y[0] - x[0]);
  }
  function dfs() {
    if (won(L, st)) return true;
    if (path.length >= maxDepth) return false;
    if (++nodes > limit) { aborted = true; return false; }
    const k = key(), d = seen.get(k);
    if (d !== undefined && d <= path.length) return false;
    seen.set(k, path.length);
    for (const [, i, j] of moves()) {
      const m = pour(L, st, i, j);
      if (hasBomb && exploded(L, st)) { unpour(L, st, m); continue; }   // взрыв — этот ход тупиковый
      path.push([i, j]);
      if (dfs()) return true;
      path.pop(); unpour(L, st, m);
      if (aborted) return false;
    }
    return false;
  }
  const ok = dfs();
  return { path: ok ? path.slice() : null, nodes, aborted };
}

// Укорачивание решения: ищем решения всё короче, пока хватает бюджета
function solveShort(L, st0, budget) {
  let best = solve(L, st0, 120000);
  if (!best.path) return best;
  let spent = best.nodes;
  while (spent < budget) {
    const r = solve(L, st0, Math.min(150000, budget - spent), best.path.length - 1);
    spent += r.nodes;
    if (!r.path) break;
    best = r;
  }
  return best;
}

// ---------- Генератор ----------
function roleOf(n) {
  const p = n % 10;
  if (n % 20 === 5 && n >= MECHS.blitz) return 'blitz';
  if (n % 20 === 13 && n >= MECHS.recipe) return 'recipe';
  if (p === 0) return 'boss';
  if (p === 9) return 'hard';
  if (p === 1 || p === 2) return 'easy';
  return 'normal';
}

function specFor(n) {
  const r = rng(n * 2654435761);
  const intro0 = Object.keys(MECHS).find(m => MECHS[m] === n);
  const role = intro0 && !MODES.includes(intro0) ? 'normal' : roleOf(n);
  let base = n <= 84 ? 3 + Math.floor((n - 1) / 12) : Math.round(8.2 + 1.8 * Math.sin(n / 6.3) + (r() < 0.3 ? 1 : 0));
  let k = base + ({ easy: -1, normal: 0, recipe: 0, blitz: -1, hard: 1, boss: 2 })[role];
  let U = 4;
  if (role === 'easy' && n > 50 && r() < 0.5) { U = 5; k -= 1; }   // «длинные» колбы для разнообразия
  if (n === 1) k = 2; else if (n <= 4) k = 3;
  k = Math.max(n === 1 ? 2 : 3, Math.min(k, 11));

  const avail = Object.keys(MECHS).filter(m => !MODES.includes(m) && MECHS[m] <= n);
  const intro = Object.keys(MECHS).find(m => MECHS[m] === n) || null;
  let mechs = [];
  if (intro && !MODES.includes(intro)) mechs = [intro];
  else if (avail.length) {
    let cnt = 0;
    if (n <= 50) {
      if (role === 'normal' || role === 'recipe') cnt = r() < 0.65 ? 1 : 0;
      else if (role === 'hard') cnt = 1;
      else if (role === 'boss') cnt = 2;
    } else {
      // после 50-го — хотя бы одна механика на каждом уровне, часто несколько
      const x = r();
      cnt = { easy:1, normal:x < 0.45 ? 2 : 1, recipe:1, blitz:1, hard:x < 0.5 ? 3 : 2, boss:3 }[role];
      if (n > 200 && role === 'normal' && x < 0.12) cnt = 3;
    }
    const pool = shuffle(r, avail.slice());
    mechs = pool.slice(0, Math.min(cnt, pool.length));
    // «тёмный» уже скрывает всё — вместе с «тайными слоями» это повтор
    if (mechs.includes('dark') && mechs.includes('hidden')) {
      const alt = pool.find(m => !mechs.includes(m));
      mechs = mechs.filter(m => m !== 'hidden'); if (alt) mechs.push(alt);
    }
  }
  if (intro === 'hidden' || intro === 'ice') k = Math.min(k, 5);
  if (mechs.includes('deep')) { U = 5; k = Math.min(k - 2, 8); }
  if (mechs.includes('tall')) k = Math.min(k, 9);
  if (mechs.includes('dark')) k = Math.min(k, intro ? 6 : 9);
  if (intro && ['narrow', 'heavy', 'order', 'boil', 'bomb', 'frost', 'crack', 'mirror'].includes(intro)) k = Math.min(k, 7);
  k = Math.max(3, k);
  return { n, role, k, U, mechs, intro, seed: n * 7919 };
}

function longestStreak(units) {
  let best = 1, cur = 1;
  for (let i = 1; i < units.length; i++) { cur = units[i] === units[i - 1] ? cur + 1 : 1; best = Math.max(best, cur); }
  return best;
}

function build(spec, r) {
  const { k, U, mechs, role, intro } = spec;
  const pal = shuffle(r, [...Array(PALETTE_SIZE).keys()]).slice(0, k);
  const BIG = U + 2, bigN = mechs.includes('tall') ? (role === 'hard' || role === 'boss' ? 2 : 1) : 0;
  const big = pal.slice(0, bigN), cnt = {};
  big.forEach(c => cnt[c] = BIG);
  const units = [];
  for (const c of pal) for (let u = 0; u < (cnt[c] || U); u++) units.push(c);
  shuffle(r, units);
  const caps = shuffle(r, pal.map((c, q) => q < bigN ? BIG : U));
  const filled = [];
  let pos = 0;
  for (const cap of caps) {
    const ch = units.slice(pos, pos + cap); pos += cap;
    if (longestStreak(ch) >= cap - 1 && k > 2) return null;
    filled.push({ f: { cap, type: 'n', ice: 0, lock: -1 }, u: ch });
  }
  const empties = [...Array(spec.empties || 2)].map(() => ({ f: { cap: U, type: 'n', ice: 0, lock: -1 }, u: [] }));
  const free = shuffle(r, filled.slice());
  const soft = intro || role === 'easy' || role === 'normal' || role === 'recipe';
  const replaceEmpty = (obj, last) => {
    const idx = empties.map((e, q) => q).filter(q => { const f = empties[q].f; return f.type === 'n' && f.cap === U && !f.stone && !(f.filter >= 0); });
    if (idx.length > 1 || (idx.length && !soft)) empties[last ? idx[idx.length - 1] : idx[0]] = obj; else empties.push(obj);
  };
  const take = () => free.pop();
  let heavy = -1, order = null;
  for (const m of mechs) {
    if (m === 'hidden') {
      const cnt = intro ? Math.ceil(k * 0.6) : ri(r, 2, Math.max(2, Math.ceil(k * 0.6)));
      const pool = shuffle(r, filled.slice()).slice(0, cnt);
      for (const x of pool) { const depth = ri(r, Math.max(1, U - 3), U - 1); for (let q = 0; q < depth; q++) x.u[q] |= HID; }
    } else if (m === 'ice') {
      const cnt = role === 'boss' ? 2 : 1;
      for (let q = 0; q < cnt && free.length > 1; q++) take().f.ice = ri(r, 4, 8) + (role === 'boss' ? 2 : 0);
    } else if (m === 'lock') {
      if (free.length < 2) continue;
      const x = take();
      const others = pal.filter(c => x.u.filter(u => col(u) === c).length < 2);
      x.f.lock = (others.length ? others : pal)[ri(r, 0, (others.length ? others : pal).length - 1)];
    } else if (m === 'funnel') {
      const fun = { f: { cap: U, type: 'f', ice: 0, lock: -1 }, u: [] };
      if (soft) empties.push(fun); else replaceEmpty(fun);
    } else if (m === 'stone') {
      empties.push({ f: { cap: U - 1, type: 'n', ice: 0, lock: -1, stone: 1 }, u: [] });
    } else if (m === 'dark') {
      for (const x of filled) for (let q = 0; q < x.u.length - 1; q++) x.u[q] |= HID;
    } else if (m === 'filter') {
      const small = pal.filter(c => !cnt[c]);
      const fl = { f: { cap: U, type: 'n', ice: 0, lock: -1, filter: small[ri(r, 0, small.length - 1)] }, u: [] };
      if (soft) empties.push(fl); else replaceEmpty(fl);
    } else if (m === 'seal') {
      if (free.length < 2) continue;
      take().f.seal = ri(r, 1, Math.max(1, Math.min(3, k - 3)));
    } else if (m === 'tap') {
      if (free.length < 2) continue;
      take().f.type = 't';
    } else if (m === 'narrow') {
      const nf = { f: { cap: U, type: 'n', ice: 0, lock: -1, narrow: 1 }, u: [] };
      if (soft) empties.push(nf); else replaceEmpty(nf);
    } else if (m === 'heavy') {
      const small = pal.filter(c => !cnt[c]);
      heavy = small[ri(r, 0, small.length - 1)];
    } else if (m === 'order') {
      order = shuffle(r, pal.slice()).slice(0, Math.min(k, ri(r, 3, 5)));
    } else if (m === 'boil') {
      if (free.length < 2) continue;
      take().f.boil = ri(r, 3, 5);
    } else if (m === 'bomb') {
      if (free.length < 2) continue;
      take().f.bomb = -1;                // срок ставится после решения (setBomb)
    } else if (m === 'frost') {
      if (free.length < 2) continue;
      const x = take();
      x.f.frost = ri(r, 5, 10) + (role === 'boss' ? 2 : 0);
      x.f.frostAt = ri(r, 0, Math.max(0, x.f.cap - 3));
    } else if (m === 'crack') {
      if (free.length < 2) continue;
      take().f.crack = ri(r, 2, 4);
    } else if (m === 'mirror') {
      if (free.length < 2) continue;
      take().f.mirror = 1;
    }
  }
  for (const x of filled) if (x.f.type === 't') x.u = x.u.map(col);   // у колбы с краном нет тайных слоёв
  const all = shuffle(r, filled).concat(empties);
  return {
    n: spec.n, U, role, mechs, intro, k, cnt: bigN ? cnt : undefined,
    heavy: heavy >= 0 ? heavy : undefined, order: order || undefined,
    flasks: all.map(x => x.f),
    start: all.map(x => x.u),
  };
}

// Срок «нестабильного зелья»: по найденному решению смотрим, когда колба собрана или пуста, и даём запас
function setBomb(L, path) {
  const q = L.flasks.findIndex(f => f.bomb === -1);
  const st = initState(L);
  let t = -1;
  for (let s = 0; s < path.length; s++) {
    pour(L, st, path[s][0], path[s][1]);
    const a = st.f[q];
    if (!a.length || complete(a, L)) { t = s + 1; break; }
  }
  if (t < 0) { delete L.flasks[q].bomb; return solve(L, initState(L), 120000); }
  for (const N of [t + Math.max(3, Math.ceil(t * 0.4)), t + 2, t]) {
    L.flasks[q].bomb = N;
    const r = solve(L, initState(L), 150000);
    if (r.path) return r;
  }
  return null;
}

// Свой уровень (генератор после 1000-го): цвета, порции, пустые колбы, сложность, режим, механики
function makeCustom(o) {
  const seed = o.seed || (Math.floor(Math.random() * 1e9) + 1);
  const spec = { n: 100000 + (seed % 100000), role: o.mode || ({ easy:'easy', hard:'hard' }[o.diff] || 'normal'), k: o.colors, U: o.portions || 4,
    mechs: (o.mechs || []).filter(m => m !== 'deep' && !MODES.includes(m)), intro: null, seed, empties: o.empties || 2, custom: true };
  if (spec.mechs.includes('tall')) spec.k = Math.min(spec.k, 9);
  for (;;) {
    const L = tryMake(spec);
    if (L) { L.n = spec.n; return L; }
    if (spec.mechs.length) spec.mechs.pop(); else if (spec.k > 3) spec.k--; else if (spec.empties < 3) spec.empties++; else return null;
  }
}

function makeLevel(n) {
  const spec = specFor(n);
  for (let relax = 0; ; relax++) {
    const L = tryMake(spec);
    if (L) return L;
    if (spec.mechs.length > 1) spec.mechs.pop(); else if (spec.k > 3) spec.k--; else throw new Error('level ' + n + ' failed');
  }
}
function tryMake(spec) {
  const want = { easy: 2, normal: 3, recipe: 3, blitz: 2, hard: 5, boss: 6 }[spec.role];
  const minLen = Math.ceil(spec.k * 1.6);
  const cands = [];
  for (let attempt = 0; cands.length < want && attempt < 400; attempt++) {
    if (spec.n >= MECHS.narrow && cands.length && attempt >= 30) break;   // поздние уровни: хватит и того, что нашлось
    const r = rng(spec.seed + attempt * 104729);
    const L = build(spec, r);
    if (!L) continue;
    let res = solve(L, initState(L), spec.n >= MECHS.narrow ? 60000 : 120000);
    if (res.path && L.flasks.some(f => f.bomb === -1)) res = setBomb(L, res.path);
    if (res && res.path && res.path.length >= minLen) cands.push({ L, nodes: res.nodes, len: res.path.length });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.nodes - b.nodes);
  const pick = spec.role === 'hard' || spec.role === 'boss' ? cands[cands.length - 1]
    : spec.role === 'normal' ? cands[cands.length >> 1] : cands[0];
  const L = pick.L;
  L.par = pick.len;
  L.difficulty = pick.nodes;
  if (L.role === 'recipe' || L.role === 'blitz') {
    const sh = solveShort(L, initState(L), spec.custom ? 150000 : 900000);
    L.par = sh.path.length;
    if (L.role === 'recipe') L.limit = Math.ceil(L.par * 1.25) + 1;
    if (L.role === 'blitz') L.time = Math.round(Math.max(40, L.par * 3 + 15));
  }
  return L;
}

const api = { makeCustom, flaskDone, cracked, exploded, frostOn, need, solveShort, popcount, sealed, outRun, outColor, isTap, MODES, HID, col, MECHS, PALETTE_SIZE, rng, initState, cloneState, topRun, complete, doneMask, frozen, locked,
  usable, whyNot, canPour, pour, unpour, won, solve, specFor, makeLevel, roleOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
