/* ============================================================
   BLOCK BLAST ENGINE — Данила Щербаков — Лучший
   v2: 3D-кубики, Web Audio синтез, спрайтовые частицы,
   комбо-плашки, drag&drop на translate3d.
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

/* ---------- УТИЛИТЫ ЦВЕТА ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) { // amt: -1 (чернее) .. 1 (белее)
  const [r, g, b] = hexToRgb(hex);
  const t = amt > 0 ? 255 : 0, p = Math.abs(amt);
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
const SHADES = {};
PALETTE.forEach(h => { SHADES[h] = { hex: h, light: shade(h, .45), dark: shade(h, -.32) }; });
function gradOf(hex) {
  const s = SHADES[hex] || (SHADES[hex] = { hex, light: shade(hex, .45), dark: shade(hex, -.32) });
  return `linear-gradient(180deg, ${s.light} 0%, ${hex} 48%, ${s.dark} 100%)`;
}

function vibrate(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

/* ---------- СОСТОЯНИЕ ---------- */
let grid = [], cells = [];
let pieces = [null, null, null];
let score = 0, best = 0, coins = 0, runCoins = 0, streak = 0;
let theme = 'slate', splashId = 'fire';
let owned = { fire: true, neon: false, crystal: false };
let wallData = null;
let boardOpen = false, shopOpen = false;
let metrics = { left: 0, top: 0, cell: 0 };
let drag = null;
let shakeRaf = null;

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const body = document.body;
const gridEl = $('grid'), previewLayer = $('previewLayer'), dragLayer = $('dragLayer');
const boardWrap = $('boardWrap'), boardInner = $('boardInner'), stage = $('stage');
const comboPlate = $('comboPlate');
const slots = [...document.querySelectorAll('.slot')];
const fx = $('fx'), fxCtx = fx.getContext('2d');
const toastEl = $('toast');

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
}

/* ============================================================
   ЗВУКОВОЙ ДВИЖОК — чистый Web Audio синтез, без файлов
   ============================================================ */
const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;

  function ctx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = .85;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, (ac.sampleRate * .5) | 0, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(o) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (o.at || 0);
    const osc = a.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + (o.d || .2));
    const g = a.createGain();
    const atk = o.a || .008;
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.v || .25, t0 + atk);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + atk + (o.d || .2));
    osc.connect(g);
    let out = g;
    if (o.lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; out.connect(f); out = f; }
    if (o.hp) { const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; out.connect(f); out = f; }
    out.connect(master);
    osc.start(t0); osc.stop(t0 + atk + (o.d || .2) + .06);
  }

  function noise(o) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (o.at || 0);
    const src = a.createBufferSource(); src.buffer = noiseBuf;
    const g = a.createGain();
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.v || .2, t0 + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + (o.d || .05));
    src.connect(g);
    const f = a.createBiquadFilter();
    f.type = o.hp ? 'highpass' : 'lowpass';
    f.frequency.value = o.f || 1000;
    f.Q.value = .8;
    g.connect(f); f.connect(master);
    src.start(t0); src.stop(t0 + (o.d || .05) + .03);
  }

  return {
    unlock() { ctx(); },
    // 1) Взятие фигуры — короткий мягкий клик
    pickup() {
      tone({ type: 'triangle', f: 760, f2: 520, d: .06, v: .16 });
      noise({ hp: true, f: 3200, d: .03, v: .07 });
    },
    // 2) Установка — плотный упругий стук
    place() {
      tone({ type: 'sine', f: 185, f2: 62, d: .13, v: .5 });
      tone({ type: 'triangle', f: 340, f2: 130, d: .05, v: .14 });
      noise({ f: 480, d: .06, v: .26 });
    },
    // 3) Сгорание линий — аккорд-«дзинь», тон растёт с серией
    clear(streak) {
      const step = Math.min(Math.max(streak - 1, 0), 7);
      const base = 523.25 * Math.pow(2, step * 2 / 12); // +2 полутона за серию
      [1, 1.25, 1.5, 2].forEach((m, i) => {
        tone({ type: 'triangle', f: base * m, d: .5, v: .2, at: i * .045 });
        tone({ type: 'sine', f: base * m * 2, d: .34, v: .07, at: i * .045 });
      });
      noise({ hp: true, f: 5200, d: .24, v: .05, at: .02 });
    }
  };
})();
window.addEventListener('pointerdown', () => Sound.unlock(), true);

/* ============================================================
   ЧАСТИЦЫ — спрайтовые светящиеся искры + объёмные осколки
   ============================================================ */
const FX = { glow: [], debris: [], last: 0 };
const spriteCache = {};

function sprite(color) {
  if (spriteCache[color]) return spriteCache[color];
  const s = document.createElement('canvas'); s.width = s.height = 32;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(.28, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  spriteCache[color] = s;
  return s;
}

function sizeFx() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.width = innerWidth * dpr;
  fx.height = innerHeight * dpr;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnBlockBurst(rect, hex) {
  const sh = SHADES[hex] || { hex, light: shade(hex, .45), dark: shade(hex, -.32) };
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const splashPal = SPLASHES[splashId].colors;

  for (let i = 0; i < 34; i++) {
    const ang = rnd(0, Math.PI * 2), spd = rnd(60, 330);
    const col = Math.random() < .62 ? hex : pick(splashPal);
    FX.glow.push({
      spr: sprite(col),
      x: cx + rnd(-8, 8), y: cy + rnd(-8, 8),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rnd(60, 170),
      life: 0, ttl: rnd(.5, 1), size: rnd(8, 18), g: 760
    });
  }
  for (let i = 0; i < 18; i++) {
    const ang = rnd(0, Math.PI * 2), spd = rnd(90, 300);
    FX.debris.push({
      x: cx + rnd(-6, 6), y: cy + rnd(-6, 6),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rnd(40, 150),
      life: 0, ttl: rnd(.4, .75), size: rnd(3, 6.5),
      rot: rnd(0, Math.PI), vr: rnd(-9, 9), g: 980,
      col: pick([hex, sh.light, sh.dark])
    });
  }
  if (FX.glow.length > 1400) FX.glow.splice(0, FX.glow.length - 1400);
  if (FX.debris.length > 800) FX.debris.splice(0, FX.debris.length - 800);
}

/* Мини-превью магазина */
const previews = [];
function buildPreviews() {
  previews.length = 0;
  document.querySelectorAll('.shop-preview').forEach(cv => {
    previews.push({ cv, ctx: cv.getContext('2d'), parts: [], next: 0, pal: SPLASHES[cv.dataset.s].colors });
  });
}

function fxLoop(t) {
  const dt = Math.min(.033, (t - FX.last) / 1000 || .016);
  FX.last = t;
  fxCtx.clearRect(0, 0, innerWidth, innerHeight);

  // Осколки (обычный режим)
  if (FX.debris.length) {
    for (let i = FX.debris.length - 1; i >= 0; i--) {
      const p = FX.debris[i];
      p.life += dt;
      if (p.life >= p.ttl) { FX.debris.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      fxCtx.globalAlpha = 1 - p.life / p.ttl;
      fxCtx.save();
      fxCtx.translate(p.x, p.y); fxCtx.rotate(p.rot);
      fxCtx.fillStyle = p.col;
      fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      fxCtx.restore();
    }
    fxCtx.globalAlpha = 1;
  }
  // Светящиеся искры (аддитив)
  if (FX.glow.length) {
    fxCtx.globalCompositeOperation = 'lighter';
    for (let i = FX.glow.length - 1; i >= 0; i--) {
      const p = FX.glow[i];
      p.life += dt;
      if (p.life >= p.ttl) { FX.glow.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.life / p.ttl;
      fxCtx.globalAlpha = k;
      const s = p.size * (.7 + .3 * k);
      fxCtx.drawImage(p.spr, p.x - s / 2, p.y - s / 2, s, s);
    }
    fxCtx.globalAlpha = 1;
    fxCtx.globalCompositeOperation = 'source-over';
  }

  // Анимированные превью в магазине
  if (shopOpen && previews.length) {
    for (const p of previews) {
      const w = p.cv.clientWidth, h = p.cv.clientHeight;
      if (!w) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (p.cv.width !== w * dpr) { p.cv.width = w * dpr; p.cv.height = h * dpr; }
      p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.ctx.clearRect(0, 0, w, h);
      if (t > p.next) {
        const bx = rnd(w * .25, w * .75), by = h * .62;
        for (let i = 0; i < 16; i++) {
          const ang = rnd(0, Math.PI * 2), spd = rnd(30, 130);
          p.parts.push({
            spr: sprite(pick(p.pal)),
            x: bx, y: by,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rnd(20, 80),
            life: 0, ttl: rnd(.4, .8), size: rnd(5, 11), g: 240
          });
        }
        p.next = t + rnd(600, 1100);
      }
      p.ctx.globalCompositeOperation = 'lighter';
      for (let i = p.parts.length - 1; i >= 0; i--) {
        const q = p.parts[i];
        q.life += dt;
        if (q.life >= q.ttl) { p.parts.splice(i, 1); continue; }
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        p.ctx.globalAlpha = 1 - q.life / q.ttl;
        const s = q.size;
        p.ctx.drawImage(q.spr, q.x - s / 2, q.y - s / 2, s, s);
      }
      p.ctx.globalAlpha = 1;
      p.ctx.globalCompositeOperation = 'source-over';
    }
  }
  requestAnimationFrame(fxLoop);
}

/* ---------- ТРЯСКА ЭКРАНА ---------- */
function shake(mag, dur = 320) {
  if (shakeRaf) cancelAnimationFrame(shakeRaf);
  const start = performance.now();
  const step = t => {
    const k = (t - start) / dur;
    if (k >= 1) { stage.style.transform = ''; shakeRaf = null; return; }
    const d = mag * (1 - k);
    stage.style.transform = `translate3d(${rnd(-d, d)}px, ${rnd(-d, d)}px, 0)`;
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
  if (v) { el.classList.add('filled'); el.style.background = gradOf(v); }
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
      if (v) { b.className = 'blk'; b.style.background = gradOf(piece.color); }
      el.appendChild(b);
    }
  return el;
}

function randomPiece() { return { shape: pickWeighted(), color: pick(PALETTE) }; }
function pickWeighted() {
  let total = 0;
  for (const s of SHAPES) total += s.w;
  let t = Math.random() * total;
  for (const s of SHAPES) { t -= s.w; if (t <= 0) return s.m; }
  return SHAPES[0].m;
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
function hexToRgba(hex, a) { return `rgba(${hexToRgb(hex).join(',')},${a})`; }
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
        d.style.background = `linear-gradient(180deg, ${hexToRgba(color, .7)}, ${hexToRgba(color, .45)})`;
        d.style.setProperty('--pv-glow', hexToRgba(color, .55));
        previewLayer.appendChild(d);
        pvCells.push(d);
      }
}
function clearPreview() { pvCells.forEach(d => d.remove()); pvCells = []; }

/* ============================================================
   DRAG & DROP — только transform: translate3d (без reflow)
   ============================================================ */
function onSlotDown(e) {
  if (!boardOpen) return;
  const slot = e.currentTarget;
  const i = +slot.dataset.i;
  const p = pieces[i];
  if (!p) return;
  e.preventDefault();
  Sound.pickup();

  const ghost = buildPieceDom(p, metrics.cell, GAP);
  ghost.classList.add('drag-piece');
  dragLayer.appendChild(ghost);
  const pw = ghost.offsetWidth, ph = ghost.offsetHeight;

  drag = { i, piece: p, ghost, pw, ph, valid: false, r: 0, c: 0, slot, lastKey: '', lift: 30, transform: '' };
  slot.style.opacity = '.25';
  moveDrag(e.clientX, e.clientY);

  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
}

function moveDrag(x, y) {
  if (!drag) return;
  const tx = x - drag.pw / 2;
  const ty = y - drag.ph - drag.lift;
  // Фигура увеличена на 1.1 и висит прямо над пальцем
  drag.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.1)`;
  drag.ghost.style.transform = drag.transform;

  const gx = Math.round((tx - metrics.left) / (metrics.cell + GAP));
  const gy = Math.round((ty - metrics.top) / (metrics.cell + GAP));
  const key = gx + ',' + gy;
  if (key !== drag.lastKey) {
    drag.lastKey = key;
    if (canPlace(drag.piece.shape, gy, gx)) {
      drag.valid = true; drag.r = gy; drag.c = gx;
      showPreview(drag.piece.shape, gy, gx, drag.piece.color);
    } else {
      drag.valid = false;
      clearPreview();
    }
  }
}

function onDragMove(e) { e.preventDefault(); moveDrag(e.clientX, e.clientY); }

function onDragUp() {
  if (!drag) return cleanupDrag();
  const d = drag;
  clearPreview();
  if (d.valid) {
    d.ghost.remove();
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragCancel);
    placePiece(d.i, d.r, d.c);
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
  const ftx = rect.left + rect.width / 2 - d.pw / 2;
  const fty = rect.top + rect.height / 2 - d.ph / 2;
  d.slot.style.opacity = '';
  d.ghost.animate(
    [
      { transform: d.transform, opacity: 1 },
      { transform: `translate3d(${ftx}px, ${fty}px, 0) scale(.55)`, opacity: .15 }
    ],
    { duration: 220, easing: 'cubic-bezier(.3,.7,.4,1)' }
  ).onfinish = () => d.ghost.remove();
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragCancel);
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
  const m = p.shape;
  let n = 0;
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

  Sound.place();
  addScore(n);
  resolve();

  if (!pieces.some(Boolean)) newRound();
  renderTray();
  checkGameOver();
}

function resolve() {
  const rows = [], cols = [];
  for (let r = 0; r < SIZE; r++) if (grid[r].every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c++) {
    let f = true;
    for (let r = 0; r < SIZE; r++) if (!grid[r][c]) { f = false; break; }
    if (f) cols.push(c);
  }
  const n = rows.length + cols.length;
  if (!n) { streak = 0; return; }

  streak++;
  const clearSet = new Set();
  rows.forEach(r => { for (let c = 0; c < SIZE; c++) clearSet.add(r * SIZE + c); });
  cols.forEach(c => { for (let r = 0; r < SIZE; r++) clearSet.add(r * SIZE + c); });

  clearSet.forEach(idx => {
    const r = (idx / SIZE) | 0, c = idx % SIZE;
    const el = cells[r][c];
    spawnBlockBurst(el.getBoundingClientRect(), grid[r][c]);
    grid[r][c] = null;
    el.classList.remove('pop');
    el.classList.add('clearing');
    setTimeout(() => renderCell(r, c), 240);
  });

  boardFlash();
  Sound.clear(streak);

  const pts = (80 * n + (n - 1) * 40) * Math.min(streak, 5);
  addScore(pts);
  floatPts('+' + pts);

  const gain = n * 8 + (n - 1) * 12 + (streak > 1 ? streak * 5 : 0);
  coins += gain; runCoins += gain;
  store.set('coins', coins);
  flyCoins(gain);
  updateHUD();

  shake(3 + n * 3, 300 + n * 40);
  if (n >= 2) vibrate(15);

  // ИМЕННЫЕ ПЛАШКИ
  if (n === 1) {
    lineToast('ДАНИЛА ТАЩИТ!');
  } else {
    const TIERS = ['ДАНИЛА ЩЕРБАКОВ — ЛУЧШИЙ!', 'ЩЕРБАКОК МОЩЬ!', 'ЛЕГЕНДА!'];
    let t = n >= 4 ? 2 : n - 2;
    if (streak >= 3) t = Math.min(2, t + 1);
    comboBanner(TIERS[t], `КОМБО ×${n}`);
  }
}

/* ---------- ПЛАШКИ И ЭФФЕКТЫ ---------- */
function comboBanner(text, sub) {
  comboPlate.innerHTML = `<span class="cp-main">${text}</span>` +
    (sub ? `<span class="cp-sub">${sub}</span>` : '');
  comboPlate.classList.remove('show'); void comboPlate.offsetWidth;
  comboPlate.classList.add('show');
}

function lineToast(text) {
  const el = document.createElement('div');
  el.className = 'line-toast';
  el.textContent = text;
  boardInner.appendChild(el);
  el.animate(
    [
      { transform: 'translate(-50%, 12px) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, 0) scale(1.08)', opacity: 1, offset: .25 },
      { transform: 'translate(-50%, -8px) scale(1)', opacity: 1, offset: .7 },
      { transform: 'translate(-50%, -30px) scale(1)', opacity: 0 }
    ],
    { duration: 950, easing: 'cubic-bezier(.2,.8,.3,1)' }
  ).onfinish = () => el.remove();
}

function boardFlash() {
  const f = document.createElement('div');
  f.className = 'board-flash';
  boardInner.appendChild(f);
  f.animate([{ opacity: .5 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' })
    .onfinish = () => f.remove();
}

function addScore(v) {
  score += v;
  if (score > best) { best = score; store.set('best', best); }
  const el = $('scoreVal');
  el.textContent = score;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  $('bestVal').textContent = best;
}

function floatPts(text) {
  const el = document.createElement('div');
  el.className = 'float-pts';
  el.textContent = text;
  document.body.appendChild(el);
  const r = boardWrap.getBoundingClientRect();
  el.animate(
    [
      { transform: `translate(${r.left + r.width / 2}px, ${r.top + r.height * .16}px) translate(-50%,-50%) scale(.5)`, opacity: 0 },
      { transform: `translate(${r.left + r.width / 2}px, ${r.top + r.height * .16}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: .25 },
      { transform: `translate(${r.left + r.width / 2}px, ${r.top + r.height * .04}px) translate(-50%,-50%) scale(1)`, opacity: 0 }
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
      btn.addEventListener('click', () => {
        splashId = id; store.set('splash', id);
        renderShop(); toast('Эффект применён');
      });
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
        for (let i = 0; i < 20; i++) {
          const ang = rnd(0, Math.PI * 2), spd = rnd(40, 170);
          FX.glow.push({
            spr: sprite(pick(SPLASHES[id].colors)),
            x: r.left + r.width / 2, y: r.top + r.height / 2,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60,
            life: 0, ttl: rnd(.4, .8), size: rnd(6, 13), g: 500
          });
        }
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

  $('btnPlay').addEventListener('click', () => {
    showScreen('gameScreen');
    requestAnimationFrame(() => { measure(); startGame(); });
  });
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