/* ============================================================
   BLOCK BLAST ENGINE — Данила Щербаков — Лучший
   Полноценный движок: сетка 8×8, drag-and-drop, линии,
   комбо, частицы, магазин сплэшей, темы, обои.
   ============================================================ */
'use strict';

/* ---------- КОНСТАНТЫ ---------- */
const SIZE = 8;
const GAP = 5;

const SHAPES = [
  { m: [[1]], w: 3 },
  { m: [[1,1]], w: 3 }, { m: [[1],[1]], w: 3 },
  { m: [[1,1,1]], w: 2.5 }, { m: [[1],[1],[1]], w: 2.5 },
  { m: [[1,1,1,1]], w: 2 }, { m: [[1],[1],[1],[1]], w: 2 },
  { m: [[1,1,1,1,1]], w: 1.1 }, { m: [[1],[1],[1],[1],[1]], w: 1.1 },
  { m: [[1,1],[1,1]], w: 2.5 },
  { m: [[1,1,1],[1,1,1],[1,1,1]], w: 0.9 },
  { m: [[1,0],[1,1]], w: 2 }, { m: [[0,1],[1,1]], w: 2 },
  { m: [[1,1],[1,0]], w: 2 }, { m: [[1,1],[0,1]], w: 2 },
  { m: [[1,0,0],[1,0,0],[1,1,1]], w: 1.3 },
  { m: [[1,1,1],[1,0,0],[1,0,0]], w: 1.3 },
  { m: [[1,1,1],[0,0,1],[0,0,1]], w: 1.3 },
  { m: [[0,0,1],[0,0,1],[1,1,1]], w: 1.3 },
  { m: [[1,1,1],[0,1,0]], w: 1.5 }, { m: [[0,1,0],[1,1,1]], w: 1.5 },
  { m: [[1,0],[1,1],[1,0]], w: 1.5 }, { m: [[0,1],[1,1],[0,1]], w: 1.5 }
];

const PALETTE = ['#ff5d5d', '#ffab3c', '#ffd23f', '#5ad66a', '#38b6ff', '#7a5cff', '#ff6ac2'];

const SPLASHES = {
  fire:    { name: 'Огненный всплеск',  desc: 'Раскалённые оранжево-красные искры.', price: 0,
             colors: ['#ffdd55', '#ffb03a', '#ff7a2f', '#ff4d2e', '#ff2d55'] },
  neon:    { name: 'Неоновый импульс',  desc: 'Холодное бирюзово-голубое свечение.', price: 250,
             colors: ['#9ff7ff', '#3ae4ff', '#18b8f0', '#7dffd4', '#e0fbff'] },
  crystal: { name: 'Кристальный взрыв', desc: 'Фиолетово-белые вспышки кристаллов.', price: 400,
             colors: ['#ffffff', '#f3e8ff', '#d8b4fe', '#c084fc', '#8b5cf6'] }
};

const COIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/></svg>';

/* ---------- ХРАНИЛИЩЕ ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('bb_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bb_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- СОСТОЯНИЕ ---------- */
let grid = [];
let cells = [];
let pieces = [null, null, null];
let score = 0, best = 0, coins = 0, runCoins = 0, streak = 0;
let theme = 'slate', splashId = 'fire';
let owned = { fire: true, neon: false, crystal: false };
let wallData = null;
let boardOpen = false, shopOpen = false;
let metrics = { left: 0, top: 0, cell: 0 };
let drag = null;
let shakeRaf = null, shakeMag = 0;

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const body = document.body;
const gridEl = $('grid'), previewLayer = $('previewLayer'), dragLayer = $('dragLayer');
const boardWrap = $('boardWrap'), stage = $('stage'), comboPlate = $('comboPlate');
const slots = [...document.querySelectorAll('.slot')];
const fx = $('fx'), fxCtx = fx.getContext('2d');
const toastEl = $('toast');

/* ---------- УТИЛИТЫ ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const lighten = hex => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + 60), g = Math.min(255, ((n >> 8) & 255) + 60), b = Math.min(255, (n & 255) + 60);
  return `rgb(${r},${g},${b})`;
};
function vibrate(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

function pickWeighted() {
  let total = 0;
  for (const s of SHAPES) total += s.w;
  let t = Math.random() * total;
  for (const s of SHAPES) { t -= s.w; if (t <= 0) return s.m; }
  return SHAPES[0].m;
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
}

/* ---------- ЧАСТИЦЫ ---------- */
const FX = { parts: [], last: 0 };

function sizeFx() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.width = innerWidth * dpr;
  fx.height = innerHeight * dpr;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnBurst(x, y, count, opts = {}) {
  const pal = SPLASHES[splashId].colors;
  const base = opts.base || null;
  const g = opts.gravity !== undefined ? opts.gravity : 520;
  for (let i = 0; i < count; i++) {
    const ang = rnd(0, Math.PI * 2);
    const spd = rnd(60, opts.speed || 250);
    FX.parts.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - rnd(30, 120),
      life: 0, ttl: rnd(.45, .95),
      size: rnd(1.6, opts.maxSize || 4.4),
      g,
      col: base && Math.random() < .35 ? lighten(base) : pick(pal)
    });
  }
}

/* Мини-превью в магазине */
const previews = [];
function buildPreviews() {
  previews.length = 0;
  document.querySelectorAll('.shop-preview').forEach(cv => {
    previews.push({ cv, ctx: cv.getContext('2d'), parts: [], next: 0, pal: SPLASHES[cv.dataset.s].colors });
  });
}
function previewBurst(p) {
  const w = p.cv.clientWidth, h = p.cv.clientHeight;
  const x = rnd(w * .25, w * .75), y = h * .62;
  for (let i = 0; i < 16; i++) {
    const ang = rnd(0, Math.PI * 2), spd = rnd(30, 130);
    p.parts.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rnd(20, 80),
      life: 0, ttl: rnd(.4, .8), size: rnd(1, 2.6), g: 240, col: pick(p.pal)
    });
  }
}

function fxLoop(t) {
  const dt = Math.min(.033, (t - FX.last) / 1000 || .016);
  FX.last = t;
  fxCtx.clearRect(0, 0, innerWidth, innerHeight);

  if (FX.parts.length) {
    fxCtx.globalCompositeOperation = 'lighter';
    for (let i = FX.parts.length - 1; i >= 0; i--) {
      const p = FX.parts[i];
      p.life += dt;
      if (p.life >= p.ttl) { FX.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.ttl;
      fxCtx.globalAlpha = a;
      fxCtx.shadowColor = p.col;
      fxCtx.shadowBlur = p.size * 4;
      fxCtx.fillStyle = p.col;
      fxCtx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    fxCtx.globalAlpha = 1; fxCtx.shadowBlur = 0;
    fxCtx.globalCompositeOperation = 'source-over';
  }

  if (shopOpen && previews.length) {
    for (const p of previews) {
      const w = p.cv.clientWidth, h = p.cv.clientHeight;
      if (!w) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (p.cv.width !== w * dpr) { p.cv.width = w * dpr; p.cv.height = h * dpr; }
      p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.ctx.clearRect(0, 0, w, h);
      if (t > p.next) { previewBurst(p); p.next = t + rnd(600, 1100); }
      p.ctx.globalCompositeOperation = 'lighter';
      for (let i = p.parts.length - 1; i >= 0; i--) {
        const q = p.parts[i];
        q.life += dt;
        if (q.life >= q.ttl) { p.parts.splice(i, 1); continue; }
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        p.ctx.globalAlpha = 1 - q.life / q.ttl;
        p.ctx.shadowColor = q.col; p.ctx.shadowBlur = q.size * 4;
        p.ctx.fillStyle = q.col;
        p.ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      p.ctx.globalAlpha = 1; p.ctx.shadowBlur = 0;
      p.ctx.globalCompositeOperation = 'source-over';
    }
  }
  requestAnimationFrame(fxLoop);
}

/* ---------- ТРЯСКА ---------- */
function shake(mag) {
  if (shakeRaf) cancelAnimationFrame(shakeRaf);
  const dur = 320, start = performance.now();
  const step = t => {
    const k = (t - start) / dur;
    if (k >= 1) { stage.style.transform = ''; shakeRaf = null; return; }
    const d = mag * (1 - k);
    stage.style.transform = `translate(${rnd(-d, d)}px, ${rnd(-d, d)}px)`;
    shakeRaf = requestAnimationFrame(step);
  };
  shakeRaf = requestAnimationFrame(step);
}

/* ---------- ЛОГИКА ПОЛЯ ---------- */
function buildGrid() {
  gridEl.innerHTML = '';
  cells = []; grid = [];
  for (let r = 0; r < SIZE; r++) {
    grid.push(Array(SIZE).fill(null));
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      const d = document.createElement('div');
      d.className = 'cell';
      gridEl.appendChild(d);
      row.push(d);
    }
    cells.push(row);
  }
}

function measure() {
  const r = gridEl.getBoundingClientRect();
  metrics.left = r.left; metrics.top = r.top;
  metrics.cell = (r.width - GAP * (SIZE - 1)) / SIZE;
}

function canPlace(m, r, c) {
  for (let i = 0; i < m.length; i++)
    for (let j = 0; j < m[i].length; j++)
      if (m[i][j]) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE || grid[rr][cc]) return false;
      }
  return true;
}
function anyFit(m) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (canPlace(m, r, c)) return true;
  return false;
}

function renderCell(r, c) {
  const el = cells[r][c], v = grid[r][c];
  if (v) { el.classList.add('filled'); el.style.background = v; }
  else { el.classList.remove('filled', 'clearing'); el.style.background = ''; }
}

/* ---------- ФИГУРЫ ---------- */
function buildPieceDom(piece, cellPx, gapPx) {
  const m = piece.shape;
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.gridTemplateColumns = `repeat(${m[0].length}, ${cellPx}px)`;
  el.style.gridAutoRows = `${cellPx}px`;
  el.style.gap = gapPx + 'px';
  for (const row of m)
    for (const v of row) {
      const b = document.createElement('div');
      if (v) { b.className = 'blk'; b.style.background = piece.color; }
      el.appendChild(b);
    }
  return el;
}

function randomPiece() {
  return { shape: pickWeighted(), color: pick(PALETTE) };
}

function newRound() {
  pieces = [randomPiece(), randomPiece(), randomPiece()];
  renderTray();
}

function renderTray() {
  measure();
  slots.forEach((slot, i) => {
    slot.innerHTML = '';
    slot.classList.remove('used', 'empty');
    const p = pieces[i];
    if (!p) { slot.classList.add('used'); return; }
    const rows = p.shape.length, cols = p.shape[0].length;
    const availW = slot.clientWidth - 26, availH = slot.clientHeight - 26;
    const cellPx = Math.max(10, Math.min((availW - (cols - 1) * 4) / cols, (availH - (rows - 1) * 4) / rows, metrics.cell * .62));
    slot.appendChild(buildPieceDom(p, cellPx, 4));
    if (!anyFit(p.shape)) slot.classList.add('empty');
  });
}

/* ---------- ПРОЕКЦИЯ ---------- */
let pvCells = [];
function showPreview(m, r, c, color) {
  clearPreview();
  for (let i = 0; i < m.length; i++)
    for (let j = 0; j < m[i].length; j++)
      if (m[i][j]) {
        const d = document.createElement('div');
        d.className = 'pv';
        d.style.width = d.style.height = metrics.cell + 'px';
        d.style.left = (c + j) * (metrics.cell + GAP) + 'px';
        d.style.top = (r + i) * (metrics.cell + GAP) + 'px';
        d.style.background = color;
        previewLayer.appendChild(d);
        pvCells.push(d);
      }
}
function clearPreview() {
  pvCells.forEach(d => d.remove());
  pvCells = [];
}

/* ---------- DRAG & DROP ---------- */
function onSlotDown(e) {
  if (!boardOpen) return;
  const slot = e.currentTarget;
  const i = +slot.dataset.i;
  const p = pieces[i];
  if (!p) return;
  e.preventDefault();

  const ghost = buildPieceDom(p, metrics.cell, GAP);
  ghost.classList.add('drag-piece');
  dragLayer.appendChild(ghost);
  const pw = ghost.offsetWidth, ph = ghost.offsetHeight;

  drag = { i, piece: p, ghost, pw, ph, valid: false, r: 0, c: 0, slot };
  slot.style.opacity = '.25';
  moveDrag(e.clientX, e.clientY);

  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
}

function moveDrag(x, y) {
  if (!drag) return;
  const gx = Math.round((x - drag.pw / 2 - metrics.left) / (metrics.cell + GAP));
  const gy = Math.round((y - drag.ph - 26 - metrics.top) / (metrics.cell + GAP));
  if (canPlace(drag.piece.shape, gy, gx)) {
    drag.valid = true; drag.r = gy; drag.c = gx;
    drag.ghost.style.left = metrics.left + gx * (metrics.cell + GAP) + 'px';
    drag.ghost.style.top = metrics.top + gy * (metrics.cell + GAP) + 'px';
    drag.ghost.classList.add('snapped');
    showPreview(drag.piece.shape, gy, gx, drag.piece.color);
  } else {
    drag.valid = false;
    drag.ghost.style.left = x - drag.pw / 2 + 'px';
    drag.ghost.style.top = y - drag.ph - 26 + 'px';
    drag.ghost.classList.remove('snapped');
    clearPreview();
  }
}

function onDragMove(e) { e.preventDefault(); moveDrag(e.clientX, e.clientY); }

function onDragUp() {
  if (!drag) return cleanupDrag();
  const d = drag;
  clearPreview();
  if (d.valid) {
    placePiece(d.i, d.r, d.c);
    d.ghost.remove();
    cleanupDrag();
  } else {
    returnGhost(d);
  }
}

function onDragCancel() {
  if (!drag) return cleanupDrag();
  clearPreview();
  returnGhost(drag);
}

function returnGhost(d) {
  const rect = d.slot.getBoundingClientRect();
  d.ghost.classList.add('returning');
  d.ghost.style.left = rect.left + rect.width / 2 - d.pw / 2 + 'px';
  d.ghost.style.top = rect.top + rect.height / 2 - d.ph / 2 + 'px';
  d.ghost.style.transform = 'scale(.5)';
  d.ghost.style.opacity = '.25';
  d.slot.style.opacity = '';
  setTimeout(() => d.ghost.remove(), 230);
  drag = null;
}

function cleanupDrag() {
  if (drag) { drag.slot.style.opacity = ''; drag.ghost.remove(); drag = null; }
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragCancel);
}

/* ---------- РАЗМЕЩЕНИЕ И ОЧКИ ---------- */
function placePiece(i, r, c) {
  const p = pieces[i];
  let n = 0;
  const m = p.shape;
  for (let a = 0; a < m.length; a++)
    for (let b = 0; b < m[a].length; b++)
      if (m[a][b]) { grid[r + a][c + b] = p.color; n++; }
  pieces[i] = null;
  slots[i].classList.add('used');
  slots[i].innerHTML = '';

  let k = 0;
  for (let a = 0; a < m.length; a++)
    for (let b = 0; b < m[a].length; b++)
      if (m[a][b]) {
        const el = cells[r + a][c + b];
        renderCell(r + a, c + b);
        el.classList.remove('pop'); void el.offsetWidth;
        el.style.animationDelay = (k++ * 24) + 'ms';
        el.classList.add('pop');
      }

  addScore(n);
  resolve();

  if (!pieces.some(Boolean)) newRound();
  renderTray();
  checkGameOver();
}

function resolve() {
  const rows = [], cols = [];
  for (let r = 0; r < SIZE; r++) if (grid[r].every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c++) { let f = true; for (let r = 0; r < SIZE; r++) if (!grid[r][c]) { f = false; break; } if (f) cols.push(c); }
  const n = rows.length + cols.length;
  if (!n) { streak = 0; return; }

  streak++;
  const clearSet = new Set();
  rows.forEach(r => { for (let c = 0; c < SIZE; c++) clearSet.add(r * SIZE + c); });
  cols.forEach(c => { for (let r = 0; r < SIZE; r++) clearSet.add(r * SIZE + c); });

  clearSet.forEach(idx => {
    const r = (idx / SIZE) | 0, c = idx % SIZE;
    const el = cells[r][c];
    const rect = el.getBoundingClientRect();
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 12, { base: grid[r][c] });
    grid[r][c] = null;
    el.classList.remove('pop');
    el.classList.add('clearing');
    setTimeout(() => renderCell(r, c), 240);
  });

  const pts = (80 * n + (n - 1) * 40) * Math.min(streak, 5);
  addScore(pts);
  floatPts('+' + pts);

  const gain = n * 8 + (n - 1) * 12 + (streak > 1 ? streak * 5 : 0);
  coins += gain; runCoins += gain;
  store.set('coins', coins);
  flyCoins(gain);
  updateHUD();

  shake(4 + n * 2.5);
  if (n >= 2) vibrate(15);

  const texts = n >= 4 ? ['ЛЕГЕНДА!']
    : n === 3 ? ['ЩЕРБАКОК МОЩЬ!', 'ЛЕГЕНДА!']
    : streak >= 3 ? ['ДАНИЛА ЛУЧШИЙ!', 'ЩЕРБАКОК МОЩЬ!']
    : ['ДАНИЛА ЛУЧШИЙ!'];
  showCombo(pick(texts));
}

function addScore(v) {
  score += v;
  if (score > best) { best = score; store.set('best', best); }
  const el = $('scoreVal');
  el.textContent = score;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  $('bestVal').textContent = best;
}

function showCombo(text) {
  comboPlate.textContent = text;
  comboPlate.classList.remove('show'); void comboPlate.offsetWidth;
  comboPlate.classList.add('show');
}

function floatPts(text) {
  const el = document.createElement('div');
  el.className = 'float-pts';
  el.textContent = text;
  document.body.appendChild(el);
  const r = boardWrap.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height * .16;
  el.animate(
    [
      { transform: `translate(-50%,-50%) scale(.5)`, opacity: 0 },
      { transform: `translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: .25 },
      { transform: `translate(-50%,-150%) scale(1)`, opacity: 0 }
    ],
    { duration: 950, easing: 'cubic-bezier(.2,.8,.3,1)' }
  ).onfinish = () => el.remove();
}

function flyCoins(gain) {
  const n = Math.min(6, 3 + Math.floor(gain / 25));
  const r = boardWrap.getBoundingClientRect();
  const t = $('coinsPill').getBoundingClientRect();
  const fx0 = r.left + r.width / 2, fy0 = r.top + r.height / 2;
  const tx = t.left + t.width / 2, ty = t.top + t.height / 2;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.innerHTML = COIN_SVG;
    document.body.appendChild(el);
    const sx = fx0 + rnd(-46, 46), sy = fy0 + rnd(-46, 46);
    el.animate(
      [
        { transform: `translate(${sx}px,${sy}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${sx}px,${sy - 20}px) scale(1)`, opacity: 1, offset: .2 },
        { transform: `translate(${tx}px,${ty}px) scale(.45)`, opacity: .9 }
      ],
      { duration: 520 + i * 70, delay: i * 45, easing: 'cubic-bezier(.5,-.1,.6,1)', fill: 'forwards' }
    ).onfinish = () => el.remove();
  }
}

/* ---------- GAME OVER ---------- */
function checkGameOver() {
  const alive = pieces.filter(Boolean);
  if (alive.length && alive.some(p => anyFit(p.shape))) return;
  boardOpen = false;
  store.set('best', best);
  setTimeout(showGameOver, 420);
}

function showGameOver() {
  $('overScore').textContent = score;
  $('overBest').textContent = best;
  $('overCoins').textContent = runCoins;
  $('overRecord').classList.toggle('hidden', !(score >= best && score > 0));
  $('overOverlay').classList.remove('hidden');
}

/* ---------- HUD / ЭКРАНЫ ---------- */
function updateHUD() {
  $('coinsVal').textContent = coins;
  $('bestVal').textContent = best;
  $('menuBest').textContent = best;
  $('menuCoins').textContent = coins;
  $('shopCoins').textContent = coins;
}

function startGame() {
  score = 0; streak = 0; runCoins = 0;
  grid.forEach((row, r) => row.forEach((_, c) => { grid[r][c] = null; renderCell(r, c); }));
  $('scoreVal').textContent = '0';
  updateHUD();
  newRound();
  boardOpen = true;
}

function showScreen(id) {
  ['menuScreen', 'gameScreen'].forEach(s => $(s).classList.toggle('hidden', s !== id));
}

function openMenu() {
  boardOpen = false;
  cleanupDrag();
  closeOverlays();
  updateHUD();
  showScreen('menuScreen');
}

function closeOverlays() {
  ['pauseOverlay', 'overOverlay', 'shopOverlay', 'settingsOverlay'].forEach(id => $(id).classList.add('hidden'));
  shopOpen = false;
}

/* ---------- МАГАЗИН ---------- */
function renderShop() {
  const list = $('shopList');
  list.innerHTML = '';
  for (const id of Object.keys(SPLASHES)) {
    const s = SPLASHES[id];
    const isOwned = owned[id], isActive = splashId === id;
    const card = document.createElement('div');
    card.className = 'shop-card' + (isOwned ? ' owned' : '');
    card.innerHTML = `
      <canvas class="shop-preview" data-s="${id}"></canvas>
      <div class="shop-row">
        <div class="shop-info">
          <div class="shop-name">${s.name}</div>
          <div class="shop-desc">${s.desc}</div>
        </div>
        <button class="btn shop-btn"></button>
      </div>`;
    const btn = card.querySelector('.shop-btn');
    if (isActive) {
      btn.classList.add('active');
      btn.textContent = 'ВЫБРАН';
    } else if (isOwned) {
      btn.classList.add('select');
      btn.textContent = 'ВЫБРАТЬ';
      btn.addEventListener('click', () => { splashId = id; store.set('splash', id); renderShop(); toast('Эффект применён'); });
    } else {
      btn.classList.add('buy', 'btn-glass');
      btn.innerHTML = `КУПИТЬ ${s.price} ${COIN_SVG}`;
      btn.disabled = coins < s.price;
      btn.addEventListener('click', () => {
        if (coins < s.price) { toast('Недостаточно монет'); return; }
        coins -= s.price;
        owned[id] = true; splashId = id;
        store.set('coins', coins); store.set('owned', owned); store.set('splash', id);
        updateHUD(); renderShop(); buildPreviews();
        const r = btn.getBoundingClientRect();
        spawnBurst(r.left + r.width / 2, r.top, 18, { speed: 160 });
        toast('Куплено: ' + s.name);
      });
    }
    list.appendChild(card);
  }
  buildPreviews();
}

function openShop() {
  shopOpen = true;
  $('shopCoins').textContent = coins;
  renderShop();
  $('shopOverlay').classList.remove('hidden');
}

/* ---------- НАСТРОЙКИ ---------- */
function setTheme(t) {
  theme = t;
  body.dataset.theme = t;
  store.set('theme', t);
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t));
}

function applyWall() {
  const wall = $('boardWall'), thumb = $('wallThumb'), rm = $('btnWallRemove');
  if (wallData) {
    wall.style.backgroundImage = `url(${wallData})`;
    wall.classList.remove('hidden');
    body.classList.add('has-wall');
    thumb.style.backgroundImage = `url(${wallData})`;
    thumb.classList.remove('hidden');
    rm.classList.remove('hidden');
  } else {
    wall.classList.add('hidden');
    wall.style.backgroundImage = '';
    body.classList.remove('has-wall');
    thumb.classList.add('hidden');
    rm.classList.add('hidden');
  }
}

function onWallFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Выберите изображение'); return; }
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1024, k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    wallData = cv.toDataURL('image/jpeg', .82);
    URL.revokeObjectURL(url);
    store.set('wall', wallData);
    applyWall();
    toast('Обои установлены');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Не удалось загрузить файл'); };
  img.src = url;
}

/* ---------- СОБЫТИЯ ---------- */
function bindUI() {
  slots.forEach(s => s.addEventListener('pointerdown', onSlotDown));
  document.addEventListener('contextmenu', e => { if (boardOpen) e.preventDefault(); });

  $('btnPlay').addEventListener('click', () => { showScreen('gameScreen'); requestAnimationFrame(() => { measure(); startGame(); }); });
  $('btnBack').addEventListener('click', () => { if (boardOpen) $('pauseOverlay').classList.remove('hidden'); });
  $('btnResume').addEventListener('click', () => $('pauseOverlay').classList.add('hidden'));
  $('btnRestartPause').addEventListener('click', () => { closeOverlays(); startGame(); });
  $('btnMenuPause').addEventListener('click', openMenu);

  $('btnAgain').addEventListener('click', () => { closeOverlays(); startGame(); });
  $('btnMenuOver').addEventListener('click', openMenu);

  $('btnShopMenu').addEventListener('click', openShop);
  $('btnShopGame').addEventListener('click', openShop);
  $('btnCloseShop').addEventListener('click', () => { shopOpen = false; $('shopOverlay').classList.add('hidden'); });

  $('btnSettingsMenu').addEventListener('click', () => $('settingsOverlay').classList.remove('hidden'));
  $('btnSettingsGame').addEventListener('click', () => $('settingsOverlay').classList.remove('hidden'));
  $('btnCloseSettings').addEventListener('click', () => $('settingsOverlay').classList.add('hidden'));

  document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.t)));

  $('wallInput').addEventListener('change', e => { onWallFile(e.target.files[0]); e.target.value = ''; });
  $('btnWallRemove').addEventListener('click', () => { wallData = null; store.set('wall', null); applyWall(); toast('Обои удалены'); });

  $('btnReset').addEventListener('click', () => {
    if (!confirm('Сбросить рекорд, монеты и покупки?')) return;
    ['best', 'coins', 'owned', 'splash', 'theme', 'wall'].forEach(k => { try { localStorage.removeItem('bb_' + k); } catch (e) {} });
    best = 0; coins = 0;
    owned = { fire: true, neon: false, crystal: false };
    splashId = 'fire';
    setTheme('slate');
    wallData = null; applyWall(); updateHUD();
    toast('Прогресс сброшен');
  });

  window.addEventListener('resize', () => { sizeFx(); measure(); if (boardOpen) renderTray(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { sizeFx(); measure(); if (boardOpen) renderTray(); }, 220));
}

/* ---------- СТАРТ ---------- */
function init() {
  best = +store.get('best', 0) || 0;
  coins = +store.get('coins', 0) || 0;
  owned = Object.assign({ fire: true, neon: false, crystal: false }, store.get('owned', {}));
  splashId = store.get('splash', 'fire');
  if (!SPLASHES[splashId] || !owned[splashId]) splashId = 'fire';
  wallData = store.get('wall', null);

  setTheme(store.get('theme', 'slate'));
  applyWall();
  buildGrid();
  sizeFx();
  requestAnimationFrame(() => { measure(); updateHUD(); });
  bindUI();
  requestAnimationFrame(fxLoop);
}

init();