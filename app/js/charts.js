/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 图表库（Canvas）
 * 统一：2px 线、≤24px 柱、4px 圆角柱头、1px 实线网格、悬停十字线 + 提示框、进入视口才播放的绘制动画。
 * 所有文字都用 textContent 写进提示框，导出文件里的名字不会被当成 HTML。
 */
(function () {
  'use strict';
  const HL = window.HL;
  const T = HL.T, N = HL.N, S = HL.S, C = HL.C, ease = HL.ease;
  const CH = HL.CH = {};
  const PAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
  CH.PAL = PAL;
  const COL = { ink: '#edf1f7', ink2: '#a8b4c5', ink3: '#75839a', ink4: '#556279', grid: 'rgba(150,172,206,0.09)', axis: 'rgba(150,172,206,0.22)', surface: '#111824', page: '#0b1018' };
  CH.COL = COL;
  const FNUM = '"Bahnschrift","DIN Alternate","D-DIN","Barlow","Segoe UI Variable Display","Segoe UI","Microsoft YaHei UI","Noto Sans CJK SC",sans-serif';
  const FCN = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  CH.FNUM = FNUM; CH.FCN = FCN;
  const DAY = 86400000;
  CH.live = new Set();
  // 「出现在屏幕上时再播放」：IntersectionObserver + 轮询兜底（抽屉滑入等 CSS 变换时 IO 偶尔不触发）
  const pending = new Set();
  function inView(el) { if (!el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth; }
  setInterval(function () { pending.forEach(function (p) { if (!p.el.isConnected) { pending.delete(p); return; } if (inView(p.el)) { pending.delete(p); p.io.disconnect(); p.cb(); } }); }, 400);
  CH.onReveal = function (el, cb) {
    const p = { el: el, cb: cb, io: null };
    p.io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; }) && pending.has(p)) { pending.delete(p); p.io.disconnect(); cb(); } }, { threshold: 0.05 });
    pending.add(p); p.io.observe(el);
    return p;
  };

  // ---------- 提示框 ----------
  const TT = CH.TT = {
    el: null,
    get() { if (!this.el) this.el = document.getElementById('tooltip'); return this.el; },
    show(cx, cy, build) {
      const el = this.get(); if (!el) return;
      el.textContent = '';
      build(el);
      el.classList.add('on');
      const r = el.getBoundingClientRect();
      let x = cx + 16, y = cy + 14;
      if (x + r.width > window.innerWidth - 8) x = cx - r.width - 16;
      if (y + r.height > window.innerHeight - 8) y = cy - r.height - 12;
      el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
    },
    hide() { const el = this.get(); if (el) el.classList.remove('on'); }
  };
  // 提示框内容工具
  const tt = CH.tt = {
    head(el, text) { const d = document.createElement('div'); d.className = 'tt-h'; d.textContent = text; el.appendChild(d); },
    row(el, color, val, lab) {
      const r = document.createElement('div'); r.className = 'tt-r';
      if (color) { const k = document.createElement('span'); k.className = 'key'; k.style.setProperty('--c', color); r.appendChild(k); }
      const v = document.createElement('span'); v.className = 'val'; v.textContent = val; r.appendChild(v);
      if (lab) { const l = document.createElement('span'); l.className = 'lab'; l.textContent = lab; r.appendChild(l); }
      el.appendChild(r);
    },
    note(el, text) { const d = document.createElement('div'); d.className = 'tt-n'; d.textContent = text; el.appendChild(d); }
  };

  // ---------- 基类 ----------
  function Base(el, opt) {
    this.el = el; this.opt = opt || {};
    el.classList.add('chart');
    this.cv = document.createElement('canvas');
    this.cv.setAttribute('role', 'img');
    if (this.opt.label) this.cv.setAttribute('aria-label', this.opt.label);
    el.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.p = 0; this.started = false; this.w = 0; this.h = 0;
    const self = this;
    this.ro = new ResizeObserver(function () { self.resize(); });
    this.ro.observe(el);
    this.io = CH.onReveal(el, function () { if (!self.started) { self.started = true; self.play(); } }).io;
    this.cv.addEventListener('pointermove', function (e) { if (self.onMove) self.onMove(e); });
    this.cv.addEventListener('pointerleave', function () { self.hover = null; TT.hide(); self.render(); });
    this.cv.addEventListener('click', function (e) { if (self.onClick) self.onClick(e); });
    CH.live.add(this);
  }
  Base.prototype.resize = function () {
    const w = this.el.clientWidth; if (!w) return;
    const h = typeof this.opt.height === 'function' ? this.opt.height.call(this, w) : (this.opt.height || 220);
    const dpr = window.devicePixelRatio || 1;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.layout) this.layout();
    this.render();
  };
  Base.prototype.play = function (dur) {
    const self = this;
    if (HL.reduceMotion) { this.p = 1; this.render(); return; }
    cancelAnimationFrame(this.raf);
    const d = dur || this.opt.duration || 1100, t0 = performance.now();
    const step = function (now) {
      const k = Math.min(1, (now - t0) / d);
      self.p = k; self.render();
      if (k < 1) self.raf = requestAnimationFrame(step);
      else if (self.onDone) self.onDone();
    };
    this.raf = requestAnimationFrame(step);
  };
  Base.prototype.render = function () {
    if (!this.w) return;
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    this.draw(c, this.started ? this.p : 0);
  };
  Base.prototype.update = function (data) {
    this.setData(data);
    if (this.layout) this.layout();
    if (this.started) this.play(this.opt.updateDuration || 800); else this.render();
  };
  Base.prototype.destroy = function () {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.io.disconnect(); CH.live.delete(this);
    if (this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
  };
  Base.prototype.pt = function (e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  CH.destroyAll = function (root) { Array.from(CH.live).forEach(function (c) { if (!root || root.contains(c.el)) c.destroy(); }); TT.hide(); };
  function inherit(Ctor) { Ctor.prototype = Object.create(Base.prototype); Ctor.prototype.constructor = Ctor; return Ctor; }

  // ---------- 刻度 ----------
  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; }
    const st = niceStep(hi - lo, n || 4);
    const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
    const out = []; for (let v = a; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    return { ticks: out, lo: a, hi: b, step: st };
  }
  CH.niceTicks = niceTicks;
  function roundRectTop(c, x, y, w, h, r) { // 柱头圆角，底部方角
    r = Math.min(r, w / 2, Math.abs(h));
    if (h <= 0 || r <= 0.5) { c.rect(x, y, w, h); return; }
    c.moveTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h); c.closePath();
  }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  CH.rr = rr;
  function periodLabel(day, gran) {
    const ms = day * DAY;
    if (gran === 'day') return T.date(ms, { week: true });
    if (gran === 'week') return T.date(ms) + ' – ' + T.md(ms + 6 * DAY);
    if (gran === 'month') return T.ym(ms);
    return T.year(ms) + '年';
  }
  CH.periodLabel = periodLabel;
  function xLabels(xs, gran) { // 返回 [{i, text, strong}]
    const out = [], n = xs.length;
    if (!n) return out;
    let lastY = null, lastM = null;
    for (let i = 0; i < n; i++) {
      const d = new Date(xs[i] * DAY), y = d.getUTCFullYear(), m = d.getUTCMonth();
      if (gran === 'year') { out.push({ i: i, text: y + '', strong: true }); continue; }
      if (gran === 'month') { if (y !== lastY) out.push({ i: i, text: y + '年', strong: true }); else if (n <= 30) out.push({ i: i, text: (m + 1) + '月' }); lastY = y; continue; }
      if (gran === 'week') { if (m !== lastM) { out.push({ i: i, text: y !== lastY ? y + '年' + (m === 0 ? '' : (m + 1) + '月') : (m + 1) + '月', strong: y !== lastY }); } lastM = m; lastY = y; continue; }
      // day
      if (n > 50) { if (m !== lastM) out.push({ i: i, text: y !== lastY ? y + '年' + (m + 1) + '月' : (m + 1) + '月', strong: y !== lastY }); lastM = m; lastY = y; }
      else { const k = Math.max(1, Math.ceil(n / 9)); if (i % k === 0) out.push({ i: i, text: (m + 1) + '/' + d.getUTCDate() }); }
    }
    return out;
  }

  function dateTicks(t0, t1) { // 稀疏数据的日期刻度
    const span = (t1 - t0) / DAY, out = [];
    if (span <= 45) { const st = span <= 10 ? 1 : span <= 21 ? 2 : 5; for (let d = Math.ceil(t0 / DAY); d * DAY <= t1; d++) { const dt = new Date(d * DAY); if ((dt.getUTCDate() - 1) % st === 0 || st === 1) out.push({ t: d * DAY, text: (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate(), strong: dt.getUTCDate() === 1 }); } return out; }
    if (span <= 730) { const st = span <= 200 ? 1 : span <= 400 ? 2 : 3; let y = new Date(t0).getUTCFullYear(), m = new Date(t0).getUTCMonth() + 1; for (let k = 0; k < 60; k++) { if (m > 11) { m -= 12; y++; } const t = Date.UTC(y, m, 1); if (t > t1) break; if (m % st === 0 || m === 0) out.push({ t: t, text: m === 0 ? y + '年' : (m + 1) + '月', strong: m === 0 }); m++; } return out; }
    for (let y = new Date(t0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++) out.push({ t: Date.UTC(y, 0, 1), text: y + '年', strong: true });
    return out;
  }
  CH.dateTicks = dateTicks;

  // ---------- 时间序列图 ----------
  // data: { x:[day...], gran, series:[{name,color,type:'bar'|'line'|'area'|'band'|'dots', y:[], lo:[], hi:[], width, alpha, stack}], fmt(v), yFmt(v), zero, goal:{v,label}, band:{lo,hi,label}, avg, markMax, ttExtra(i,el), yMin, yMax }
  const TimeChart = CH.TimeChart = inherit(function TimeChart(el, data, opt) {
    Base.call(this, el, Object.assign({ height: 230 }, opt));
    this.setData(data);
  });
  TimeChart.prototype.setData = function (d) { this.d = d; };
  TimeChart.prototype.layout = function () {
    const d = this.d; if (!d) return;
    const padL = this.opt.padL || 46, padR = this.opt.padR || 14, padT = this.opt.padT || 14, padB = 26;
    this.L = padL; this.R = this.w - padR; this.Tp = padT; this.B = this.h - padB;
    let lo = Infinity, hi = -Infinity;
    const n = d.x.length;
    const stackTop = new Float64Array(n);
    d.series.forEach(function (s) {
      if (s.hidden) return;
      for (let i = 0; i < n; i++) {
        let v = s.y ? s.y[i] : NaN;
        if (s.stack) { if (v === v) { stackTop[i] += v; v = stackTop[i]; } }
        if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; }
        if (s.lo) { const a = s.lo[i]; if (a === a && a < lo) lo = a; }
        if (s.hi) { const b = s.hi[i]; if (b === b && b > hi) hi = b; }
      }
    });
    if (d.goal && d.goal.v === d.goal.v) { hi = Math.max(hi, d.goal.v); lo = Math.min(lo, d.goal.v); }
    if (d.band) { const bl = typeof d.band.lo === 'number' ? d.band.lo : NaN, bh = typeof d.band.hi === 'number' ? d.band.hi : NaN; if (bl === bl) lo = Math.min(lo, bl); if (bh === bh) hi = Math.max(hi, bh); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const zero = d.zero !== undefined ? d.zero : d.series.some(function (s) { return s.type === 'bar'; });
    if (zero) lo = Math.min(0, lo);
    else { const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1; const pos = lo >= 0; lo -= pad; hi += pad; if (pos && lo < 0) lo = 0; }
    if (d.yMin !== undefined) lo = d.yMin; if (d.yMax !== undefined) hi = d.yMax;
    const nt = niceTicks(lo, hi, this.h < 170 ? 3 : 4);
    if (lo >= 0 && nt.lo < 0) nt.lo = 0;
    if (d.yCap !== undefined && nt.hi > d.yCap) { nt.hi = d.yCap; nt.ticks = nt.ticks.filter(function (v) { return v <= d.yCap; }); }
    this.ylo = zero && lo >= 0 ? 0 : nt.lo; this.yhi = nt.hi; this.ticks = nt.ticks.filter(function (v) { return v >= nt.lo - 1e-9 && v <= nt.hi; });
    if (d.yMin !== undefined) this.ylo = d.yMin; if (d.yMax !== undefined) this.yhi = d.yMax;
    this.slot = (this.R - this.L) / Math.max(1, n);
    this.xl = xLabels(d.x, d.gran);
  };
  TimeChart.prototype.X = function (i) { return this.L + (i + 0.5) * this.slot; };
  TimeChart.prototype.Y = function (v) { return this.B - (v - this.ylo) / (this.yhi - this.ylo || 1) * (this.B - this.Tp); };
  TimeChart.prototype.draw = function (c, p) {
    const d = this.d; if (!d || !d.x.length) { drawEmpty(c, this.w, this.h, this.opt.empty); return; }
    const self = this, n = d.x.length, slot = this.slot;
    const fmtY = d.yFmt || N.axis;
    // 网格 + y 轴
    c.font = '11px ' + FNUM; c.textBaseline = 'middle'; c.textAlign = 'right';
    this.ticks.forEach(function (v) {
      const y = Math.round(self.Y(v)) + 0.5;
      c.strokeStyle = v === 0 ? COL.axis : COL.grid; c.lineWidth = 1;
      c.beginPath(); c.moveTo(self.L, y); c.lineTo(self.R, y); c.stroke();
      c.fillStyle = COL.ink3; c.fillText(fmtY(v), self.L - 8, y);
    });
    // x 轴标签
    c.textAlign = 'center'; c.textBaseline = 'top';
    let lastX = -Infinity;
    this.xl.forEach(function (lb) {
      const x = self.X(lb.i) - (d.gran === 'day' && n > 50 ? slot / 2 : 0);
      c.font = (lb.strong ? '500 ' : '') + '11px ' + FCN;
      const tw = c.measureText(lb.text).width;
      if (x - tw / 2 < lastX + 8) return;
      if (x - tw / 2 < self.L - 30 || x + tw / 2 > self.w) return;
      c.fillStyle = lb.strong ? COL.ink2 : COL.ink3; c.fillText(lb.text, x, self.B + 8);
      lastX = x + tw / 2;
      if (lb.strong && n > 12) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(Math.round(x) + 0.5, self.Tp); c.lineTo(Math.round(x) + 0.5, self.B); c.stroke(); }
    });
    // 参考带（个人正常范围等）
    if (d.band) {
      c.fillStyle = d.band.color || 'rgba(150,172,206,0.08)';
      if (typeof d.band.lo === 'number') { const y1 = this.Y(d.band.hi), y0 = this.Y(d.band.lo); c.fillRect(this.L, y1, this.R - this.L, y0 - y1); }
      else drawBand(c, this, d.band.lo, d.band.hi, n, 1);
    }
    // 进度：从左往右展开
    const revealX = this.L + (this.R - this.L) * ease.outCubic(p);
    c.save();
    c.beginPath(); c.rect(0, 0, revealX + 2, this.h); c.clip();
    const stackBase = new Float64Array(n);
    const bars = d.series.filter(function (s) { return s.type === 'bar' && !s.hidden; });
    const barW = Math.max(1, Math.min(24, slot * (slot > 6 ? 0.68 : 0.82)));
    d.series.forEach(function (s) {
      if (s.hidden) return;
      const col = s.color || PAL[0];
      if (s.type === 'band') { c.fillStyle = C.rgba(col, s.alpha || 0.16); drawBand(c, self, s.lo, s.hi, n, 1); return; }
      if (s.type === 'bar') {
        const grow = 0.35 + 0.65 * ease.outCubic(Math.min(1, p * 1.4));
        if (slot < 2.2 && !s.stack) { // 太密：画成阶梯面积
          c.fillStyle = col; c.beginPath(); c.moveTo(self.L, self.Y(0));
          for (let i = 0; i < n; i++) { const v = s.y[i] === s.y[i] ? s.y[i] * grow : 0; const x0 = self.L + i * slot; c.lineTo(x0, self.Y(v)); c.lineTo(x0 + slot, self.Y(v)); }
          c.lineTo(self.R, self.Y(0)); c.closePath(); c.fill(); return;
        }
        c.fillStyle = col;
        for (let i = 0; i < n; i++) {
          let v = s.y[i]; if (!(v === v) || v === 0) continue;
          const base = s.stack ? stackBase[i] : 0;
          const top = base + v * grow;
          const x = self.X(i) - barW / 2, y0 = self.Y(base), y1 = self.Y(top);
          const gap = s.stack && base > 0 ? 1 : 0; // 堆叠段之间 2px 背景缝（上下各 1）
          c.globalAlpha = (self.hover !== null && self.hover !== undefined && self.hover !== i) ? 0.55 : 1;
          c.beginPath();
          const isTop = !s.stack || s === lastStacked(bars, i);
          if (isTop && barW >= 5) roundRectTop(c, x, y1, barW, Math.max(0, y0 - y1 - gap), 4); else c.rect(x, y1, barW, Math.max(0, y0 - y1 - gap));
          c.fill();
          if (s.stack) stackBase[i] = base + v;
        }
        c.globalAlpha = 1;
        return;
      }
      // 线 / 面积 / 点
      const ys = s.y;
      let valid = 0; for (let i = 0; i < n; i++) if (ys[i] === ys[i]) valid++;
      if (s.type === 'area' || s.fill) {
        c.fillStyle = C.rgba(col, s.alpha || 0.1);
        let open = false;
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const v = i < n ? ys[i] : NaN;
          if (v === v) { const x = self.X(i), y = self.Y(v); if (!open) { c.moveTo(x, self.Y(Math.max(self.ylo, 0))); c.lineTo(x, y); open = true; } else c.lineTo(x, y); }
          else if (open) { const x = self.X(i - 1); c.lineTo(x, self.Y(Math.max(self.ylo, 0))); c.closePath(); open = false; }
        }
        c.fill();
      }
      if (s.type !== 'dots') {
        c.strokeStyle = col; c.lineWidth = s.width || 2; c.lineJoin = 'round'; c.lineCap = 'round';
        if (s.dim) c.globalAlpha = 0.5;
        c.beginPath(); let pen = false;
        for (let i = 0; i < n; i++) {
          const v = ys[i];
          if (v === v) { const x = self.X(i), y = self.Y(v); if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; } }
          else if (!s.connect) pen = false;
        }
        c.stroke(); c.globalAlpha = 1;
      }
      if (s.type === 'dots' || (valid <= 60 && s.markers !== false) || s.markers) {
        const r = s.r || (valid > 200 ? 2 : 4);
        for (let i = 0; i < n; i++) {
          const v = ys[i]; if (!(v === v)) continue;
          const x = self.X(i), y = self.Y(v);
          c.beginPath(); c.arc(x, y, r + (r > 2 ? 2 : 0), 0, Math.PI * 2); c.fillStyle = COL.surface; if (r > 2) c.fill();
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = col; c.fill();
        }
      }
    });
    c.restore();
    // 目标线
    if (d.goal && d.goal.v === d.goal.v) {
      const y = Math.round(this.Y(d.goal.v)) + 0.5;
      c.strokeStyle = 'rgba(237,241,247,0.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(this.L, y); c.lineTo(this.R, y); c.stroke();
      if (d.goal.label) { c.font = '11px ' + FCN; c.fillStyle = COL.ink2; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(d.goal.label, this.R, y - 3); }
    }
    // 平均线
    if (d.avg && d.avg.v === d.avg.v) {
      const y = Math.round(this.Y(d.avg.v)) + 0.5;
      c.strokeStyle = 'rgba(237,241,247,0.35)'; c.lineWidth = 1; c.setLineDash([]); c.beginPath(); c.moveTo(this.L, y); c.lineTo(this.R, y); c.stroke();
      c.font = '11px ' + FCN; c.fillStyle = COL.ink2; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(d.avg.label, this.L + 6, y - 3);
    }
    // 最高点标注
    if (d.markMax && p > 0.85) {
      const s = d.series.find(function (s) { return !s.hidden && s.type !== 'band'; });
      if (s) {
        let mi = -1, mv = -Infinity; for (let i = 0; i < n; i++) { const v = s.stack ? NaN : s.y[i]; if (v > mv) { mv = v; mi = i; } }
        if (mi >= 0) {
          const x = this.X(mi), y = this.Y(mv);
          c.globalAlpha = Math.min(1, (p - 0.85) / 0.15);
          c.font = '500 11px ' + FNUM; c.fillStyle = COL.ink; c.textBaseline = 'bottom';
          const txt = (d.fmt || N.auto)(mv);
          const tw = c.measureText(txt).width;
          c.textAlign = x + tw / 2 > this.R ? 'right' : x - tw / 2 < this.L ? 'left' : 'center';
          c.fillText(txt, x, Math.max(this.Tp + 10, y - 5));
          c.globalAlpha = 1;
        }
      }
    }
    // 悬停十字线
    if (this.hover !== null && this.hover !== undefined) {
      const x = Math.round(this.X(this.hover)) + 0.5;
      c.strokeStyle = 'rgba(237,241,247,0.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, this.Tp); c.lineTo(x, this.B); c.stroke();
      d.series.forEach(function (s) {
        if (s.hidden || s.type === 'bar' || s.type === 'band') return;
        const v = s.y[self.hover]; if (!(v === v)) return;
        const y = self.Y(v);
        c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fillStyle = COL.surface; c.fill();
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fillStyle = s.color || PAL[0]; c.fill();
      });
    }
  };
  function lastStacked(bars, i) { let last = null; bars.forEach(function (s) { if (s.stack && s.y[i] === s.y[i] && s.y[i] > 0) last = s; }); return last; }
  function drawBand(c, ch, lo, hi, n, alphaMul) {
    let i = 0;
    while (i < n) {
      while (i < n && !(lo[i] === lo[i] && hi[i] === hi[i])) i++;
      if (i >= n) break;
      const st = i; while (i < n && lo[i] === lo[i] && hi[i] === hi[i]) i++;
      const en = i - 1;
      c.beginPath();
      if (st === en) { const x = ch.X(st), w = Math.max(2, ch.slot * 0.6); c.rect(x - w / 2, ch.Y(hi[st]), w, ch.Y(lo[st]) - ch.Y(hi[st])); }
      else {
        c.moveTo(ch.X(st), ch.Y(hi[st]));
        for (let k = st + 1; k <= en; k++) c.lineTo(ch.X(k), ch.Y(hi[k]));
        for (let k = en; k >= st; k--) c.lineTo(ch.X(k), ch.Y(lo[k]));
        c.closePath();
      }
      c.fill();
    }
  }
  TimeChart.prototype.onMove = function (e) {
    const d = this.d; if (!d || !d.x.length) return;
    const pt = this.pt(e), x = pt[0];
    if (x < this.L - 4 || x > this.R + 4) { if (this.hover !== null) { this.hover = null; TT.hide(); this.render(); } return; }
    const i = Math.max(0, Math.min(d.x.length - 1, Math.floor((x - this.L) / this.slot)));
    if (i !== this.hover) { this.hover = i; this.render(); }
    const self = this;
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, (d.label || periodLabel)(d.x[i], d.gran));
      const fmt = d.fmt || N.auto;
      d.series.forEach(function (s) {
        if (s.hidden || s.noTip) return;
        if (s.type === 'band') { if (s.lo[i] === s.lo[i]) tt.row(el, s.color, fmt(s.lo[i]) + ' – ' + fmt(s.hi[i]), s.name); return; }
        const v = s.y[i]; if (!(v === v)) return;
        tt.row(el, s.color, (s.fmt || fmt)(v), s.name);
      });
      if (d.ttExtra) d.ttExtra(i, el);
    });
  };
  TimeChart.prototype.onClick = function (e) { if (this.d && this.d.onPick && this.hover !== null && this.hover !== undefined) this.d.onPick(this.hover, this.d.x[this.hover]); };

  function drawEmpty(c, w, h, msg) {
    c.font = '13px ' + FCN; c.fillStyle = COL.ink3; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(msg || '这个时间范围内没有数据', w / 2, h / 2);
  }
  CH.drawEmpty = drawEmpty;

  // ---------- 小折线（读数下方） ----------
  CH.spark = function (canvas, ys, color, opt) {
    const w = canvas.clientWidth || 140, h = canvas.clientHeight || 26, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    let lo = Infinity, hi = -Infinity; ys.forEach(function (v) { if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } });
    if (!isFinite(lo)) return;
    if (opt && opt.zero) lo = Math.min(0, lo);
    if (hi === lo) { hi += 1; lo -= 1; }
    const n = ys.length, X = function (i) { return 2 + (w - 4) * (n === 1 ? 0.5 : i / (n - 1)); }, Y = function (v) { return h - 3 - (v - lo) / (hi - lo) * (h - 6); };
    let t0 = null;
    const frame = function (now) {
      if (t0 === null) t0 = now;
      const k = HL.reduceMotion ? 1 : Math.min(1, (now - t0) / 900), q = ease.outCubic(k);
      c.clearRect(0, 0, w, h);
      c.save(); c.beginPath(); c.rect(0, 0, 2 + (w - 4) * q + 2, h); c.clip();
      c.strokeStyle = 'rgba(168,180,197,0.55)'; c.lineWidth = 1.5; c.lineJoin = 'round'; c.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) { const v = ys[i]; if (v === v) { if (pen) c.lineTo(X(i), Y(v)); else { c.moveTo(X(i), Y(v)); pen = true; } } else pen = false; }
      c.stroke();
      // 最后一段用强调色
      let li = n - 1; while (li >= 0 && !(ys[li] === ys[li])) li--;
      if (li >= 0) { c.beginPath(); c.arc(X(li), Y(ys[li]), 2.5, 0, Math.PI * 2); c.fillStyle = color || COL.ink; c.fill(); }
      c.restore();
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  // ---------- 日历热力图 ----------
  // data: { base(day0), vals(Float64Array 以 base 为起点), d0, d1, ramp:[...], fmt(v), max, label(day,v), onPick(day) }
  const Calendar = CH.Calendar = inherit(function Calendar(el, data, opt) {
    const self = this;
    Base.call(this, el, Object.assign({ height: function (w) { return self.calcH(w); }, duration: 900 }, opt));
    this.setData(data);
  });
  Calendar.prototype.setData = function (d) {
    this.d = d;
    const y0 = T.year(d.d0 * DAY), y1 = T.year(d.d1 * DAY);
    this.years = []; for (let y = y1; y >= y0; y--) this.years.push(y);
    let mx = d.max; if (!(mx > 0)) { const arr = []; for (let dd = d.d0; dd <= d.d1; dd++) { const v = d.vals[dd - d.base]; if (v === v && v > 0) arr.push(v); } arr.sort(function (a, b) { return a - b; }); mx = S.q(arr, 0.97) || 1; }
    this.max = mx;
  };
  Calendar.prototype.calcH = function (w) { const cell = this.cellSize(w); return 22 + this.years.length * (cell * 7 + 2 * 6 + 22); };
  Calendar.prototype.cellSize = function (w) { return Math.max(6, Math.min(16, Math.floor((w - 44) / 53) - 2)); };
  Calendar.prototype.layout = function () { this.cell = this.cellSize(this.w); this.gap = 2; };
  Calendar.prototype.pos = function (day) {
    const ms = day * DAY, y = T.year(ms), yi = this.years.indexOf(y); if (yi < 0) return null;
    const jan1 = T.day(Date.UTC(y, 0, 1)), off = T.weekdayIdx(jan1);
    const wk = Math.floor((day - jan1 + off) / 7), wd = T.weekdayIdx(day);
    const cs = this.cell + this.gap, top = 22 + yi * (this.cell * 7 + this.gap * 6 + 22);
    return [40 + wk * cs, top + wd * cs, yi];
  };
  Calendar.prototype.draw = function (c, p) {
    const d = this.d, self = this, cs = this.cell + this.gap;
    c.font = '11px ' + FCN; c.textBaseline = 'middle';
    this.years.forEach(function (y, yi) {
      const top = 22 + yi * (self.cell * 7 + self.gap * 6 + 22);
      c.fillStyle = COL.ink2; c.textAlign = 'left'; c.font = '500 12px ' + FNUM; c.fillText(String(y), 0, top - 11);
      c.font = '11px ' + FCN; c.fillStyle = COL.ink4;
      ['一', '三', '五'].forEach(function (t, k) { c.fillText(t, 14, top + (k * 2) * cs + self.cell / 2); });
      for (let m = 0; m < 12; m++) {
        const md = T.day(Date.UTC(y, m, 1)); const pp = self.pos(md); if (!pp) continue;
        c.fillStyle = COL.ink3; c.textAlign = 'left'; c.fillText((m + 1) + '月', pp[0], top - 11);
      }
    });
    const total = d.d1 - d.d0 + 1;
    for (let day = d.d0; day <= d.d1; day++) {
      const pp = this.pos(day); if (!pp) continue;
      const k = (day - d.d0) / total;
      const a = Math.max(0, Math.min(1, (p * 1.35 - k * 0.35) * 1.2));
      if (a <= 0) continue;
      const v = d.vals[day - d.base];
      c.globalAlpha = a;
      if (v === v && v > 0) c.fillStyle = C.rampAt(d.ramp, Math.sqrt(Math.min(1, v / this.max)) * 0.86 + 0.14);
      else c.fillStyle = 'rgba(150,172,206,0.06)';
      c.beginPath(); rr(c, pp[0], pp[1], this.cell, this.cell, Math.min(3, this.cell / 3)); c.fill();
      if (this.hover === day) { c.strokeStyle = COL.ink; c.lineWidth = 1.5; c.stroke(); }
    }
    c.globalAlpha = 1;
  };
  Calendar.prototype.dayAt = function (x, y) {
    const cs = this.cell + this.gap;
    for (let yi = 0; yi < this.years.length; yi++) {
      const top = 22 + yi * (this.cell * 7 + this.gap * 6 + 22);
      if (y < top || y > top + 7 * cs) continue;
      const wd = Math.floor((y - top) / cs), wk = Math.floor((x - 40) / cs); if (wk < 0 || wd > 6) return null;
      const yr = this.years[yi], jan1 = T.day(Date.UTC(yr, 0, 1)), off = T.weekdayIdx(jan1);
      const day = jan1 - off + wk * 7 + wd;
      if (T.year(day * DAY) !== yr) return null;
      return day;
    }
    return null;
  };
  Calendar.prototype.onMove = function (e) {
    const pt = this.pt(e), day = this.dayAt(pt[0], pt[1]), d = this.d;
    if (day === null || day < d.d0 || day > d.d1) { if (this.hover !== null) { this.hover = null; this.render(); } TT.hide(); return; }
    if (day !== this.hover) { this.hover = day; this.render(); }
    const v = d.vals[day - d.base];
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, T.date(day * DAY, { week: true }));
      if (d.label) d.label(day, v, el); else tt.row(el, d.ramp[d.ramp.length - 2], v === v ? (d.fmt || N.auto)(v) : '无数据', '');
    });
  };
  Calendar.prototype.onClick = function () { if (this.d.onPick && this.hover !== null) this.d.onPick(this.hover); };

  // ---------- 矩阵热力图 ----------
  // data: { rows:[label], cols:[label], get(r,c)->v, color(v)->css, fmt(v,r,c), rowW, colEvery, cellH, onPick(r,c) }
  const Matrix = CH.Matrix = inherit(function Matrix(el, data, opt) {
    const self = this;
    Base.call(this, el, Object.assign({ height: function () { return self.calcH(); }, duration: 800 }, opt));
    this.setData(data);
  });
  Matrix.prototype.setData = function (d) { this.d = d; };
  Matrix.prototype.calcH = function () { const d = this.d; return (d.top || 20) + d.rows.length * ((d.cellH || 20) + 2) + 4; };
  Matrix.prototype.layout = function () {
    const d = this.d; this.L = d.rowW || 52; this.Tp = d.top || 20;
    this.cw = (this.w - this.L - 4) / d.cols.length; this.ch = d.cellH || 20;
  };
  Matrix.prototype.draw = function (c, p) {
    const d = this.d, self = this;
    c.font = '11px ' + FCN; c.textBaseline = 'middle';
    d.rows.forEach(function (r, ri) { c.fillStyle = COL.ink3; c.textAlign = 'right'; c.fillText(r, self.L - 8, self.Tp + ri * (self.ch + 2) + self.ch / 2); });
    const every = d.colEvery || 1;
    d.cols.forEach(function (cl, ci) { if (ci % every) return; c.fillStyle = COL.ink3; c.textAlign = 'center'; c.fillText(cl, self.L + ci * self.cw + self.cw / 2, self.Tp - 10); });
    const tot = d.rows.length + d.cols.length;
    for (let ri = 0; ri < d.rows.length; ri++) for (let ci = 0; ci < d.cols.length; ci++) {
      const v = d.get(ri, ci);
      const a = Math.max(0, Math.min(1, (p * 1.5 - (ri + ci) / tot * 0.5) * 1.3)); if (a <= 0) continue;
      c.globalAlpha = a;
      c.fillStyle = v === v && v !== null ? d.color(v, ri, ci) : 'rgba(150,172,206,0.05)';
      const x = this.L + ci * this.cw + 1, y = this.Tp + ri * (this.ch + 2);
      c.beginPath(); rr(c, x, y, Math.max(1, this.cw - 2), this.ch, Math.min(4, this.cw / 3)); c.fill();
      if (d.text && v === v && this.cw > 30) { c.globalAlpha = a; c.fillStyle = d.textColor ? d.textColor(v) : COL.ink; c.textAlign = 'center'; c.font = '11px ' + FNUM; c.fillText(d.text(v, ri, ci), x + (this.cw - 2) / 2, y + this.ch / 2); c.font = '11px ' + FCN; }
      if (this.hover && this.hover[0] === ri && this.hover[1] === ci) { c.globalAlpha = 1; c.strokeStyle = COL.ink; c.lineWidth = 1.5; c.stroke(); }
    }
    c.globalAlpha = 1;
  };
  Matrix.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d;
    const ci = Math.floor((pt[0] - this.L) / this.cw), ri = Math.floor((pt[1] - this.Tp) / (this.ch + 2));
    if (ci < 0 || ri < 0 || ci >= d.cols.length || ri >= d.rows.length) { this.hover = null; TT.hide(); this.render(); return; }
    if (!this.hover || this.hover[0] !== ri || this.hover[1] !== ci) { this.hover = [ri, ci]; this.render(); }
    const v = d.get(ri, ci);
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, (d.headOf ? d.headOf(ri, ci) : d.rows[ri] + ' · ' + d.cols[ci]));
      if (d.tip) d.tip(ri, ci, v, el); else tt.row(el, null, v === v ? d.fmt(v, ri, ci) : '无数据', '');
    });
  };
  Matrix.prototype.onClick = function () { if (this.d.onPick && this.hover) this.d.onPick(this.hover[0], this.hover[1]); };

  // ---------- 直方图 ----------
  // data: { sorted:Float64Array, color, bins, lo, hi, fmt, unit, marks:[{v,label}], zones:[{lo,hi,color,name}], weights:[] (可选：预先分好桶的值) }
  const Histo = CH.Histo = inherit(function Histo(el, data, opt) { Base.call(this, el, Object.assign({ height: 190 }, opt)); this.setData(data); });
  Histo.prototype.setData = function (d) {
    this.d = d;
    const s = d.sorted;
    if (d.counts) { this.counts = d.counts; this.edges = d.edges; return; }
    if (!s || !s.length) { this.counts = []; return; }
    let lo = d.lo !== undefined ? d.lo : S.q(s, 0.005), hi = d.hi !== undefined ? d.hi : S.q(s, 0.995);
    if (hi <= lo) { lo = s[0]; hi = s[s.length - 1] + 1; }
    let nb = d.bins || 36;
    if (d.step) { lo = Math.floor(lo / d.step) * d.step; hi = Math.ceil((hi + 1e-9) / d.step) * d.step; nb = Math.max(1, Math.round((hi - lo) / d.step)); }
    const w = (hi - lo) / nb, counts = new Float64Array(nb);
    for (let i = 0; i < s.length; i++) { let b = Math.floor((s[i] - lo) / w); if (b < 0) b = 0; if (b >= nb) b = nb - 1; counts[b]++; }
    this.counts = counts; this.edges = []; for (let i = 0; i <= nb; i++) this.edges.push(lo + i * w);
  };
  Histo.prototype.layout = function () { this.L = 8; this.R = this.w - 8; this.Tp = 16; this.B = this.h - 24; this.max = Math.max.apply(null, Array.from(this.counts).concat([1])); };
  Histo.prototype.draw = function (c, p) {
    const d = this.d, n = this.counts.length; if (!n) { drawEmpty(c, this.w, this.h); return; }
    const slot = (this.R - this.L) / n, bw = Math.max(1, slot - 2), self = this;
    const lo = this.edges[0], hi = this.edges[n];
    const X = function (v) { return self.L + (v - lo) / (hi - lo) * (self.R - self.L); };
    for (let i = 0; i < n; i++) {
      const v = this.counts[i]; if (!v) continue;
      const mid = (this.edges[i] + this.edges[i + 1]) / 2;
      let col = d.color;
      if (d.zones) d.zones.forEach(function (z) { if (mid >= z.lo && mid < z.hi) col = z.color; });
      const k = Math.max(0, Math.min(1, p * 1.4 - i / n * 0.4));
      const hgt = (this.B - this.Tp) * v / this.max * ease.outCubic(k);
      c.fillStyle = col; c.globalAlpha = this.hover === i ? 1 : 0.9;
      c.beginPath(); roundRectTop(c, this.L + i * slot + 1, this.B - hgt, bw, hgt, bw >= 6 ? 3 : 0); c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = COL.axis; c.beginPath(); c.moveTo(this.L, this.B + 0.5); c.lineTo(this.R, this.B + 0.5); c.stroke();
    // x 刻度
    const nt = niceTicks(lo, hi, 6);
    c.font = '11px ' + FNUM; c.fillStyle = COL.ink3; c.textAlign = 'center'; c.textBaseline = 'top';
    nt.ticks.forEach(function (v) { if (v < lo || v > hi) return; c.fillText((d.fmt || N.axis)(v), X(v), self.B + 7); });
    // 标记线（中位数等）
    if (d.marks && p > 0.6) {
      c.globalAlpha = Math.min(1, (p - 0.6) / 0.4);
      let lastR = -Infinity, row = 0;
      d.marks.forEach(function (m) {
        if (!(m.v === m.v) || m.v < lo || m.v > hi) return;
        const x = Math.round(X(m.v)) + 0.5;
        c.strokeStyle = 'rgba(237,241,247,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, self.Tp - 2); c.lineTo(x, self.B); c.stroke();
        c.font = '11px ' + FCN; const txt = m.label; const tw = c.measureText(txt).width;
        row = x - tw / 2 < lastR + 6 ? row + 1 : 0;
        c.fillStyle = COL.ink2; c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.fillText(txt, Math.min(self.R - tw / 2, Math.max(self.L + tw / 2, x)), self.Tp - 3 + row * 13);
        lastR = x + tw / 2;
      });
      c.globalAlpha = 1;
    }
  };
  Histo.prototype.onMove = function (e) {
    const pt = this.pt(e), n = this.counts.length; if (!n) return;
    const i = Math.floor((pt[0] - this.L) / ((this.R - this.L) / n));
    if (i < 0 || i >= n) { this.hover = null; TT.hide(); this.render(); return; }
    if (i !== this.hover) { this.hover = i; this.render(); }
    const d = this.d, self = this, tot = S.sum(this.counts);
    TT.show(e.clientX, e.clientY, function (el) {
      const f = d.fmt || N.auto;
      tt.head(el, f(self.edges[i]) + ' – ' + f(self.edges[i + 1]) + (d.unit ? ' ' + d.unit : ''));
      tt.row(el, d.color, d.countFmt ? d.countFmt(self.counts[i]) : N.int(self.counts[i]) + ' 次', N.pct(self.counts[i] / tot, 1));
    });
  };

  // ---------- 散点图 ----------
  // data: { x:[], y:[], color, xFmt, yFmt, xLabel, yLabel, fit, identity, sd, tip(i, el), alpha, r }
  const Scatter = CH.Scatter = inherit(function Scatter(el, data, opt) { Base.call(this, el, Object.assign({ height: 260 }, opt)); this.setData(data); });
  Scatter.prototype.setData = function (d) { this.d = d; };
  Scatter.prototype.layout = function () {
    const d = this.d; this.L = 48; this.R = this.w - 12; this.Tp = 12; this.B = this.h - 34;
    const xs = S.sortedFinite(d.x), ys = S.sortedFinite(d.y);
    if (!xs.length) return;
    let x0 = d.xMin !== undefined ? d.xMin : S.q(xs, 0.002), x1 = d.xMax !== undefined ? d.xMax : S.q(xs, 0.998), y0 = d.yMin !== undefined ? d.yMin : S.q(ys, 0.002), y1 = d.yMax !== undefined ? d.yMax : S.q(ys, 0.998);
    if (d.identity) { x0 = y0 = Math.min(x0, y0); x1 = y1 = Math.max(x1, y1); }
    const px = (x1 - x0) * 0.06 || 1, py = (y1 - y0) * 0.08 || 1;
    this.xt = niceTicks(x0 - px, x1 + px, 5); this.yt = niceTicks(y0 - py, y1 + py, 4);
    const stepTicks = function (lo, hi, st) { const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, t = []; for (let v = a; v <= b + 1e-9; v += st) t.push(v); return { ticks: t, lo: a, hi: b, step: st }; };
    if (d.xStep) { const span = x1 - x0 + 2 * px; let st = d.xStep; while (span / st > 7) st *= 2; this.xt = stepTicks(x0 - px, x1 + px, st); }
    if (d.yStep) { const span = y1 - y0 + 2 * py; let st = d.yStep; while (span / st > 6) st *= 2; this.yt = stepTicks(y0 - py, y1 + py, st); }
    if (xs[0] >= 0 && this.xt.lo < 0) { this.xt.lo = 0; this.xt.ticks = this.xt.ticks.filter(function (v) { return v >= 0; }); }
    if (ys[0] >= 0 && this.yt.lo < 0) { this.yt.lo = 0; this.yt.ticks = this.yt.ticks.filter(function (v) { return v >= 0; }); }
    this.x0 = this.xt.lo; this.x1 = this.xt.hi; this.y0 = this.yt.lo; this.y1 = this.yt.hi;
    if (d.fit) this.fit = S.linreg(d.x, d.y);
    // 网格索引便于最近点查找
    this.grid = new Map();
    for (let i = 0; i < d.x.length; i++) { if (!(d.x[i] === d.x[i] && d.y[i] === d.y[i])) continue; const k = Math.floor(this.X(d.x[i]) / 16) + ',' + Math.floor(this.Y(d.y[i]) / 16); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(i); }
  };
  Scatter.prototype.X = function (v) { return this.L + (v - this.x0) / (this.x1 - this.x0) * (this.R - this.L); };
  Scatter.prototype.Y = function (v) { return this.B - (v - this.y0) / (this.y1 - this.y0) * (this.B - this.Tp); };
  Scatter.prototype.draw = function (c, p) {
    const d = this.d, self = this; if (!d.x.length || !this.xt) { drawEmpty(c, this.w, this.h); return; }
    c.font = '11px ' + FNUM; c.textBaseline = 'middle'; c.textAlign = 'right';
    this.yt.ticks.forEach(function (v) { const y = Math.round(self.Y(v)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(self.L, y); c.lineTo(self.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText((d.yFmt || N.axis)(v), self.L - 8, y); });
    c.textAlign = 'center'; c.textBaseline = 'top';
    this.xt.ticks.forEach(function (v) { const x = Math.round(self.X(v)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x, self.Tp); c.lineTo(x, self.B); c.stroke(); c.fillStyle = COL.ink3; c.fillText((d.xFmt || N.axis)(v), x, self.B + 6); });
    c.font = '11px ' + FCN; c.fillStyle = COL.ink3;
    if (d.xLabel) { c.textAlign = 'right'; c.fillText(d.xLabel, this.R, this.B + 20); }
    if (d.yLabel) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(d.yLabel, this.L + 4, this.Tp); }
    if (d.identity) { c.strokeStyle = COL.axis; c.beginPath(); c.moveTo(this.X(this.x0), this.Y(this.x0)); c.lineTo(this.X(this.x1), this.Y(this.x1)); c.stroke(); }
    const n = d.x.length, r = d.r || (n > 2000 ? 1.6 : n > 400 ? 2.6 : 4);
    c.fillStyle = d.color || PAL[0]; c.globalAlpha = (d.alpha || (n > 2000 ? 0.35 : 0.8));
    const lim = Math.floor(n * ease.outCubic(p));
    for (let i = 0; i < lim; i++) {
      const x = d.x[i], y = d.y[i]; if (!(x === x && y === y)) continue;
      if (d.colors) c.fillStyle = d.colors[i];
      c.beginPath(); c.arc(this.X(x), this.Y(y), r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    if (this.fit && p > 0.7 && isFinite(this.fit.b)) {
      c.globalAlpha = Math.min(1, (p - 0.7) / 0.3);
      c.strokeStyle = COL.ink; c.lineWidth = 2; c.beginPath();
      c.moveTo(this.X(this.x0), this.Y(this.fit.a + this.fit.b * this.x0)); c.lineTo(this.X(this.x1), this.Y(this.fit.a + this.fit.b * this.x1));
      c.save(); c.beginPath(); c.rect(this.L, this.Tp, this.R - this.L, this.B - this.Tp); c.clip();
      c.beginPath(); c.moveTo(this.X(this.x0), this.Y(this.fit.a + this.fit.b * this.x0)); c.lineTo(this.X(this.x1), this.Y(this.fit.a + this.fit.b * this.x1)); c.stroke(); c.restore();
      c.globalAlpha = 1;
    }
    if (d.ellipse && p > 0.8) { // Poincaré SD1/SD2 椭圆
      const e = d.ellipse; c.globalAlpha = Math.min(1, (p - 0.8) / 0.2);
      c.save(); c.translate(this.X(e.cx), this.Y(e.cy)); c.rotate(-Math.PI / 4);
      const sx = (this.R - this.L) / (this.x1 - this.x0);
      c.strokeStyle = COL.ink; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 0, Math.max(1, e.sd2 * 2 * sx), Math.max(1, e.sd1 * 2 * sx), 0, 0, Math.PI * 2); c.stroke();
      c.restore(); c.globalAlpha = 1;
    }
    if (this.hover !== null && this.hover !== undefined) { const i = this.hover; c.beginPath(); c.arc(this.X(d.x[i]), this.Y(d.y[i]), r + 4, 0, Math.PI * 2); c.strokeStyle = COL.ink; c.lineWidth = 2; c.stroke(); }
  };
  Scatter.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d; if (!this.grid) return;
    const gx = Math.floor(pt[0] / 16), gy = Math.floor(pt[1] / 16);
    let best = -1, bd = 24 * 24;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const a = this.grid.get((gx + dx) + ',' + (gy + dy)); if (!a) continue; for (let k = 0; k < a.length; k++) { const i = a[k]; const ddx = this.X(d.x[i]) - pt[0], ddy = this.Y(d.y[i]) - pt[1], dd = ddx * ddx + ddy * ddy; if (dd < bd) { bd = dd; best = i; } } }
    if (best < 0) { if (this.hover !== null) { this.hover = null; this.render(); } TT.hide(); return; }
    if (best !== this.hover) { this.hover = best; this.render(); }
    TT.show(e.clientX, e.clientY, function (el) { if (d.tip) d.tip(best, el); else { tt.row(el, d.color, (d.yFmt || N.auto)(d.y[best]), d.yLabel || ''); tt.row(el, null, (d.xFmt || N.auto)(d.x[best]), d.xLabel || ''); } });
  };
  Scatter.prototype.onClick = function () { if (this.d.onPick && this.hover !== null && this.hover !== undefined) this.d.onPick(this.hover); };

  // ---------- 柱状（类别，24 小时/星期等） ----------
  // data: { labels:[], y:[], color, fmt, highlight(i), every, tip(i, el), colors:[] }
  const Bars = CH.Bars = inherit(function Bars(el, data, opt) { Base.call(this, el, Object.assign({ height: 170 }, opt)); this.setData(data); });
  Bars.prototype.setData = function (d) { this.d = d; };
  Bars.prototype.layout = function () {
    const d = this.d; this.L = d.noAxis ? 4 : 40; this.R = this.w - 6; this.Tp = 16; this.B = this.h - 22;
    const vals = d.y.filter(function (v) { return v === v; });
    const nt = niceTicks(0, Math.max.apply(null, vals.concat([d.minMax || 0.0001])), 3);
    this.yhi = nt.hi; this.ticks = nt.ticks; this.slot = (this.R - this.L) / d.y.length;
  };
  Bars.prototype.draw = function (c, p) {
    const d = this.d, self = this, n = d.y.length;
    if (!d.noAxis) {
      c.font = '11px ' + FNUM; c.textAlign = 'right'; c.textBaseline = 'middle';
      this.ticks.forEach(function (v) { const y = Math.round(self.B - v / self.yhi * (self.B - self.Tp)) + 0.5; c.strokeStyle = v === 0 ? COL.axis : COL.grid; c.beginPath(); c.moveTo(self.L, y); c.lineTo(self.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText((d.yFmt || N.axis)(v), self.L - 7, y); });
    }
    const bw = Math.min(24, this.slot * 0.66);
    c.textAlign = 'center'; c.textBaseline = 'top'; c.font = '11px ' + FCN;
    for (let i = 0; i < n; i++) {
      const x = this.L + (i + 0.5) * this.slot;
      if (!d.every || i % d.every === 0) { c.fillStyle = COL.ink3; c.fillText(d.labels[i], x, this.B + 6); }
      const v = d.y[i]; if (!(v === v) || v <= 0) continue;
      const k = Math.max(0, Math.min(1, p * 1.5 - i / n * 0.5));
      const hgt = v / this.yhi * (this.B - this.Tp) * ease.outCubic(k);
      c.fillStyle = d.colors ? d.colors[i] : (d.highlight && !d.highlight(i) ? C.rgba(d.color, 0.45) : d.color);
      if (this.hover === i) c.fillStyle = d.color;
      c.beginPath(); roundRectTop(c, x - bw / 2, this.B - hgt, bw, hgt, bw >= 6 ? 4 : 0); c.fill();
      if (d.valueLabels && k >= 1 && bw > 14) { c.fillStyle = COL.ink2; c.font = '11px ' + FNUM; c.textBaseline = 'bottom'; c.fillText((d.fmt || N.auto)(v), x, this.B - hgt - 3); c.textBaseline = 'top'; c.font = '11px ' + FCN; }
    }
  };
  Bars.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, i = Math.floor((pt[0] - this.L) / this.slot);
    if (i < 0 || i >= d.y.length) { this.hover = null; TT.hide(); this.render(); return; }
    if (i !== this.hover) { this.hover = i; this.render(); }
    TT.show(e.clientX, e.clientY, function (el) { if (d.tip) d.tip(i, el); else { tt.head(el, d.labels[i]); tt.row(el, d.color, d.y[i] === d.y[i] ? (d.fmt || N.auto)(d.y[i]) : '无数据', d.unit || ''); } });
  };

  // ---------- 活动圆环（SVG） ----------
  CH.rings = function (el, vals, opt) {
    // vals: [{v: 比例, color}] 由外到内
    opt = opt || {};
    const size = opt.size || 180, sw = opt.stroke || Math.round(size * 0.1), gap = opt.gap === undefined ? Math.max(2, sw * 0.18) : opt.gap;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size); svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('role', 'img'); if (opt.label) svg.setAttribute('aria-label', opt.label);
    const arcs = [];
    vals.forEach(function (r, k) {
      const rad = size / 2 - sw / 2 - k * (sw + gap);
      if (rad <= sw / 2) return;
      const circ = 2 * Math.PI * rad;
      const bg = document.createElementNS(ns, 'circle');
      bg.setAttribute('cx', size / 2); bg.setAttribute('cy', size / 2); bg.setAttribute('r', rad); bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke', C.rgba(r.color, r.na ? 0.06 : 0.18)); bg.setAttribute('stroke-width', sw);
      svg.appendChild(bg);
      if (r.na) return;
      const fg = document.createElementNS(ns, 'circle');
      fg.setAttribute('cx', size / 2); fg.setAttribute('cy', size / 2); fg.setAttribute('r', rad); fg.setAttribute('fill', 'none');
      fg.setAttribute('stroke', r.color); fg.setAttribute('stroke-width', sw); fg.setAttribute('stroke-linecap', 'round');
      fg.setAttribute('transform', 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')');
      fg.setAttribute('stroke-dasharray', circ + ' ' + circ); fg.setAttribute('stroke-dashoffset', circ);
      svg.appendChild(fg);
      // 超过一圈：第二圈
      let fg2 = null;
      if (r.v > 1) {
        fg2 = document.createElementNS(ns, 'circle');
        ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'transform'].forEach(function (a) { fg2.setAttribute(a, fg.getAttribute(a)); });
        fg2.setAttribute('stroke-dasharray', circ + ' ' + circ); fg2.setAttribute('stroke-dashoffset', circ);
        fg2.style.filter = 'drop-shadow(0 0 ' + (sw * 0.25) + 'px rgba(0,0,0,0.6))';
        svg.appendChild(fg2);
      }
      arcs.push({ fg: fg, fg2: fg2, circ: circ, v: Math.max(0, Math.min(r.v || 0, 3)) });
    });
    el.appendChild(svg);
    const dur = HL.reduceMotion ? 0 : (opt.duration || 1400), t0 = performance.now() + (opt.delay || 0);
    const frame = function (now) {
      const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, q = ease.outCubic(k);
      arcs.forEach(function (a) {
        const v = a.v * q;
        const first = Math.min(1, v);
        a.fg.setAttribute('stroke-dashoffset', a.circ * (1 - first) + (first >= 1 ? 0 : 0));
        if (first <= 0.001) a.fg.setAttribute('stroke-opacity', 0); else a.fg.setAttribute('stroke-opacity', 1);
        if (a.fg2) { const sec = Math.max(0, v - 1); a.fg2.setAttribute('stroke-dashoffset', a.circ * (1 - Math.min(1, sec))); a.fg2.setAttribute('stroke-opacity', sec > 0.001 ? 1 : 0); }
      });
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return svg;
  };

  // ---------- 睡眠阶段图 ----------
  // data: { segs:[[s,e,code]], s0, s1, inBed:[s,e] }
  const STAGE_ROW = { 2: 0, 5: 1, 3: 2, 1: 2, 4: 3, 0: 4 };
  const STAGE_COL = { 0: '#3A4A63', 1: '#7f72e6', 2: '#e0663a', 3: '#7f72e6', 4: '#5b4bc4', 5: '#b3abf5' };
  CH.STAGE_COL = STAGE_COL;
  const Hypno = CH.Hypno = inherit(function Hypno(el, data, opt) { Base.call(this, el, Object.assign({ height: 220, duration: 1600 }, opt)); this.setData(data); });
  Hypno.prototype.setData = function (d) { this.d = d; };
  Hypno.prototype.layout = function () { this.L = 74; this.R = this.w - 10; this.Tp = 8; this.B = this.h - 26; this.rows = this.d.rows || ['清醒', '快速动眼', '核心睡眠', '深度睡眠']; this.rh = (this.B - this.Tp) / this.rows.length; };
  Hypno.prototype.X = function (ms) { const d = this.d; return this.L + (ms - d.s0) / (d.s1 - d.s0) * (this.R - this.L); };
  Hypno.prototype.draw = function (c, p) {
    const d = this.d, self = this; if (!d || !d.segs.length) { drawEmpty(c, this.w, this.h, '这一晚没有分期数据'); return; }
    c.font = '12px ' + FCN; c.textBaseline = 'middle'; c.textAlign = 'right';
    this.rows.forEach(function (r, i) { c.fillStyle = COL.ink3; c.fillText(r, self.L - 12, self.Tp + i * self.rh + self.rh / 2); c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(self.L, Math.round(self.Tp + (i + 1) * self.rh) + 0.5); c.lineTo(self.R, Math.round(self.Tp + (i + 1) * self.rh) + 0.5); c.stroke(); });
    // 时刻
    c.textAlign = 'center'; c.textBaseline = 'top'; c.font = '11px ' + FNUM;
    const h0 = Math.ceil(d.s0 / 3600000) * 3600000;
    const stepH = (d.s1 - d.s0) / 3600000 > 12 ? 2 : 1;
    for (let t = h0; t <= d.s1; t += 3600000 * stepH) { const x = this.X(t); c.fillStyle = COL.ink3; c.fillText(T.hm(t), x, this.B + 8); c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(Math.round(x) + 0.5, this.Tp); c.lineTo(Math.round(x) + 0.5, this.B); c.stroke(); }
    if (d.inBed && d.inBed[0] === d.inBed[0]) { c.fillStyle = 'rgba(150,172,206,0.06)'; c.fillRect(this.X(d.inBed[0]), this.Tp, this.X(d.inBed[1]) - this.X(d.inBed[0]), this.B - this.Tp); }
    const cut = d.s0 + (d.s1 - d.s0) * ease.inOutCubic(Math.min(1, p));
    c.save(); c.beginPath(); c.rect(0, 0, this.X(cut) + 1, this.h); c.clip();
    // 连接竖线
    const segs = d.segs.filter(function (s) { return s[2] !== 0; });
    c.lineWidth = 1;
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1], b = segs[i]; if (b[0] - a[1] > 5 * 60000) continue;
      const ra = STAGE_ROW[a[2]], rb = STAGE_ROW[b[2]]; if (ra === rb) continue;
      const x = Math.round(this.X(b[0])) + 0.5;
      const y1 = this.Tp + ra * this.rh + this.rh / 2, y2 = this.Tp + rb * this.rh + this.rh / 2;
      const g = c.createLinearGradient(0, y1, 0, y2); g.addColorStop(0, C.rgba(STAGE_COL[a[2]], 0.7)); g.addColorStop(1, C.rgba(STAGE_COL[b[2]], 0.7));
      c.strokeStyle = g; c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y2); c.stroke();
    }
    segs.forEach(function (s, i) {
      const row = STAGE_ROW[s[2]]; if (row === undefined) return;
      const x0 = self.X(s[0]), x1 = Math.max(x0 + 1.5, self.X(s[1]));
      const y = self.Tp + row * self.rh + self.rh * 0.18, hh = self.rh * 0.64;
      c.fillStyle = STAGE_COL[s[2]];
      if (self.hover === i) { c.shadowColor = STAGE_COL[s[2]]; c.shadowBlur = 12; }
      c.beginPath(); rr(c, x0, y, x1 - x0, hh, Math.min(5, (x1 - x0) / 2)); c.fill();
      c.shadowBlur = 0;
    });
    c.restore();
    if (p < 1) { const x = this.X(cut); const g = c.createLinearGradient(x - 40, 0, x, 0); g.addColorStop(0, 'rgba(179,171,245,0)'); g.addColorStop(1, 'rgba(179,171,245,0.25)'); c.fillStyle = g; c.fillRect(x - 40, this.Tp, 40, this.B - this.Tp); }
    this._segs = segs;
  };
  Hypno.prototype.onMove = function (e) {
    const pt = this.pt(e), segs = this._segs || [], self = this;
    let hit = -1;
    for (let i = 0; i < segs.length; i++) { const row = STAGE_ROW[segs[i][2]]; const x0 = this.X(segs[i][0]), x1 = Math.max(x0 + 4, this.X(segs[i][1])); const y = this.Tp + row * this.rh; if (pt[0] >= x0 - 2 && pt[0] <= x1 + 2 && pt[1] >= y && pt[1] <= y + this.rh) { hit = i; break; } }
    if (hit !== this.hover) { this.hover = hit < 0 ? null : hit; this.render(); }
    if (hit < 0) { TT.hide(); return; }
    const s = segs[hit];
    TT.show(e.clientX, e.clientY, function (el) { tt.head(el, T.hm(s[0]) + ' – ' + T.hm(s[1])); tt.row(el, STAGE_COL[s[2]], T.dur((s[1] - s[0]) / 1000), HL.CAT.SLEEP_STAGE[s[2]].name); });
  };

  // ---------- 睡眠时间窗（每晚入睡→醒来的浮动条） ----------
  // data: { nights:[n], d0, d1, onPick(n) }
  const SleepWin = CH.SleepWin = inherit(function SleepWin(el, data, opt) { Base.call(this, el, Object.assign({ height: 300, duration: 1300 }, opt)); this.setData(data); });
  SleepWin.prototype.setData = function (d) { this.d = d; };
  SleepWin.prototype.layout = function () {
    const d = this.d; this.L = 46; this.R = this.w - 10; this.Tp = 10; this.B = this.h - 26;
    // 纵轴范围：以 18:00 为 0（分钟）
    let lo = Infinity, hi = -Infinity;
    d.nights.forEach(function (n) { if (n.bedMin < lo) lo = n.bedMin; const w = n.wakeMin + 6 * 60 + 18 * 60 - 18 * 60 + 360; const wm = (n.end - (n.day - 1) * DAY) / 60000 - 18 * 60; if (wm > hi) hi = wm; });
    if (!isFinite(lo)) { lo = 240; hi = 900; }
    this.ylo = Math.floor(Math.max(0, lo - 30) / 60) * 60; this.yhi = Math.ceil(Math.min(24 * 60, hi + 30) / 60) * 60;
    this.nD = d.d1 - d.d0 + 1; this.slot = (this.R - this.L) / this.nD;
  };
  SleepWin.prototype.Y = function (min) { return this.Tp + (min - this.ylo) / (this.yhi - this.ylo) * (this.B - this.Tp); };
  SleepWin.prototype.draw = function (c, p) {
    const d = this.d, self = this; if (!d.nights.length) { drawEmpty(c, this.w, this.h, '这个时间范围内没有睡眠记录'); return; }
    c.font = '11px ' + FNUM; c.textAlign = 'right'; c.textBaseline = 'middle';
    const st = (this.yhi - this.ylo) / 60 > 12 ? 180 : 120;
    for (let m = Math.ceil(this.ylo / st) * st; m <= this.yhi; m += st) { const y = Math.round(this.Y(m)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(this.L, y); c.lineTo(this.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText(T.clock(m + 18 * 60), this.L - 8, y); }
    const xl = xLabels(Array.from({ length: this.nD }, function (_, i) { return d.d0 + i; }), 'day');
    c.textAlign = 'center'; c.textBaseline = 'top'; let lastX = -1e9;
    xl.forEach(function (lb) { const x = self.L + lb.i * self.slot; c.font = (lb.strong ? '500 ' : '') + '11px ' + FCN; const tw = c.measureText(lb.text).width; if (x - tw / 2 < lastX + 8) return; c.fillStyle = lb.strong ? COL.ink2 : COL.ink3; c.fillText(lb.text, x, self.B + 8); lastX = x + tw / 2; });
    const bw = Math.max(1, Math.min(14, this.slot * 0.72));
    const prog = ease.outCubic(p);
    d.nights.forEach(function (n, k) {
      const i = n.day - d.d0; if (i < 0 || i >= self.nD) return;
      const x = self.L + (i + 0.5) * self.slot - bw / 2;
      const base = (n.day - 1) * DAY + 18 * 3600000;
      const ym = function (ms) { return self.Y((ms - base) / 60000); };
      const mid = (ym(n.start) + ym(n.end)) / 2;
      const local = Math.max(0, Math.min(1, prog * 1.3 - (i / self.nD) * 0.3));
      if (local <= 0) return;
      const sq = function (y) { return mid + (y - mid) * ease.outCubic(local); };
      c.globalAlpha = self.hover === k ? 1 : (self.hover !== null && self.hover !== undefined ? 0.6 : 0.95);
      if (n.kind !== 'stages' || bw < 3) {
        c.fillStyle = n.kind === 'inbed' ? 'rgba(127,114,230,0.45)' : '#7f72e6';
        const y0 = sq(ym(n.start)), y1 = sq(ym(n.end));
        c.beginPath(); rr(c, x, y0, bw, Math.max(1, y1 - y0), Math.min(4, bw / 2)); c.fill();
      } else {
        c.save(); const y0 = sq(ym(n.start)), y1 = sq(ym(n.end)); c.beginPath(); rr(c, x, y0, bw, Math.max(1, y1 - y0), Math.min(4, bw / 2)); c.clip();
        n.segs.forEach(function (s) { if (s[2] === 0) return; c.fillStyle = STAGE_COL[s[2]]; const a = sq(ym(s[0])), b = sq(ym(s[1])); c.fillRect(x, a, bw, Math.max(0.8, b - a)); });
        c.restore();
      }
    });
    c.globalAlpha = 1;
  };
  SleepWin.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d; const i = Math.floor((pt[0] - this.L) / this.slot); const day = d.d0 + i;
    let k = -1; for (let j = 0; j < d.nights.length; j++) if (d.nights[j].day === day) { k = j; break; }
    if (k !== this.hover) { this.hover = k < 0 ? null : k; this.render(); }
    if (k < 0) { TT.hide(); return; }
    const n = d.nights[k];
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, T.date(n.day * DAY, { week: true }) + ' 醒来');
      tt.row(el, '#7f72e6', T.dur(n.asleep), n.kind === 'inbed' ? '在床（iPhone 记录）' : '睡眠');
      tt.row(el, null, T.hm(n.start) + ' – ' + T.hm(n.end), n.kind === 'inbed' ? '' : '入睡 – 醒来');
      if (n.kind === 'stages') { tt.row(el, STAGE_COL[4], T.dur(n.deep), '深度'); tt.row(el, STAGE_COL[5], T.dur(n.rem), '快速动眼'); tt.row(el, STAGE_COL[2], T.dur(n.awake), '清醒'); }
      if (d.onPick) tt.note(el, '点击查看这一晚');
    });
  };
  SleepWin.prototype.onClick = function () { if (this.d.onPick && this.hover !== null && this.hover !== undefined) this.d.onPick(this.d.nights[this.hover]); };

  // ---------- 心电图 ----------
  // data: { samples, rate, peaks, unit } —— 按 25mm/s、10mm/mV 画 3 行（每行 10 秒）
  const ECG = CH.ECG = inherit(function ECG(el, data, opt) { const self = this; Base.call(this, el, Object.assign({ height: function (w) { return self.calcH(w); }, duration: 2600 }, opt)); this.setData(data); });
  ECG.prototype.setData = function (d) { this.d = d; };
  ECG.prototype.sec = function () { return this.opt.secPerRow || 10; };
  ECG.prototype.calcH = function (w) { const rows = this.rowsN(); const mm = (w - 2) / (this.sec() * 25); return rows * Math.max(90, Math.min(200, mm * 28)) + 18; };
  ECG.prototype.rowsN = function () { const d = this.d; return this.opt.rows || Math.max(1, Math.ceil(d.samples.length / d.rate / this.sec())); };
  ECG.prototype.layout = function () { this.rows = this.rowsN(); this.rowH = (this.h - 18) / this.rows; this.mm = (this.w - 2) / (this.sec() * 25); };
  ECG.prototype.draw = function (c, p) {
    const d = this.d, self = this, mm = this.mm, rows = this.rows;
    // 毫米方格
    for (let r = 0; r < rows; r++) {
      const top = r * this.rowH;
      for (let x = 0, k = 0; x <= this.w; x += mm, k++) { c.strokeStyle = k % 5 === 0 ? 'rgba(242,85,122,0.20)' : 'rgba(242,85,122,0.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, top); c.lineTo(Math.round(x) + 0.5, top + this.rowH - 6); c.stroke(); }
      for (let y = top, k = 0; y <= top + this.rowH - 6; y += mm, k++) { c.strokeStyle = k % 5 === 0 ? 'rgba(242,85,122,0.20)' : 'rgba(242,85,122,0.07)'; c.beginPath(); c.moveTo(0, Math.round(y) + 0.5); c.lineTo(this.w, Math.round(y) + 0.5); c.stroke(); }
      c.font = '11px ' + FNUM; c.fillStyle = COL.ink3; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText((r * this.sec()) + '–' + (r * this.sec() + this.sec()) + ' 秒', 4, top + 3);
    }
    const n = d.samples.length, per = d.rate * this.sec(), scale = 10 * mm / 1000; // µV → px（10mm/mV）
    const total = Math.floor(n * Math.min(1, p));
    c.lineWidth = 1.6; c.lineJoin = 'round'; c.strokeStyle = '#ff7a98';
    for (let r = 0; r < rows; r++) {
      const a = r * per, b = Math.min(total, (r + 1) * per); if (b <= a) break;
      const mid = r * this.rowH + (this.rowH - 6) * 0.58;
      c.beginPath();
      const stepS = Math.max(1, Math.floor(per / (this.w * 2)));
      for (let i = a; i < b; i += stepS) { const x = (i - a) / d.rate * 25 * mm; const y = mid - d.samples[i] * scale; if (i === a) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
      if (b < (r + 1) * per && p < 1) { const x = (b - a) / d.rate * 25 * mm, y = mid - d.samples[b - 1] * scale; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.shadowColor = '#ff7a98'; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0; }
      if (d.peaks && p >= 1) {
        c.fillStyle = 'rgba(237,241,247,0.55)';
        for (let k = 0; k < d.peaks.length; k++) { const pk = d.peaks[k]; if (pk < a || pk >= b) continue; const x = (pk - a) / d.rate * 25 * mm; c.beginPath(); c.arc(x, r * this.rowH + this.rowH - 10, 2, 0, Math.PI * 2); c.fill(); }
      }
    }
  };
  ECG.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, r = Math.floor(pt[1] / this.rowH); if (r < 0 || r >= this.rows) return;
    const sec = r * this.sec() + pt[0] / (25 * this.mm), i = Math.round(sec * d.rate); if (i < 0 || i >= d.samples.length) { TT.hide(); return; }
    let near = null; if (d.peaks) for (let k = 1; k < d.peaks.length; k++) if (d.peaks[k] >= i) { near = (d.peaks[k] - d.peaks[k - 1]) / d.rate * 1000; break; }
    TT.show(e.clientX, e.clientY, function (el) { tt.head(el, N.fix(sec, 2) + ' 秒'); tt.row(el, '#ff7a98', N.int(d.samples[i]) + ' µV', '电压'); if (near) tt.row(el, null, N.int(near) + ' 毫秒', '这一跳的 RR 间期（≈' + N.int(60000 / near) + ' 次/分）'); });
  };

  // ---------- 轨迹地图 ----------
  // data: { routes:[{lat,lon,t,speed, color?}], colorBy: 'speed'|'none', ramp, focus: idx, markers: true }
  function merc(lat, lon) { const x = (lon + 180) / 360, s = Math.sin(lat * Math.PI / 180); return [x, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; }
  const RouteMap = CH.RouteMap = inherit(function RouteMap(el, data, opt) { Base.call(this, el, Object.assign({ height: 360, duration: 2600 }, opt)); this.setData(data); });
  RouteMap.prototype.setData = function (d) {
    this.d = d;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    this.proj = d.routes.map(function (r) {
      const n = r.lat.length, xs = new Float64Array(n), ys = new Float64Array(n);
      for (let i = 0; i < n; i++) { const m = merc(r.lat[i], r.lon[i]); xs[i] = m[0]; ys[i] = m[1]; if (m[0] < x0) x0 = m[0]; if (m[0] > x1) x1 = m[0]; if (m[1] < y0) y0 = m[1]; if (m[1] > y1) y1 = m[1]; }
      return { xs: xs, ys: ys };
    });
    this.bb = [x0, y0, x1, y1];
  };
  RouteMap.prototype.layout = function () {
    const bb = this.bb, pad = 24; const sx = (this.w - pad * 2) / Math.max(1e-12, bb[2] - bb[0]), sy = (this.h - pad * 2) / Math.max(1e-12, bb[3] - bb[1]);
    this.s = Math.min(sx, sy); this.ox = pad + (this.w - pad * 2 - (bb[2] - bb[0]) * this.s) / 2; this.oy = pad + (this.h - pad * 2 - (bb[3] - bb[1]) * this.s) / 2;
    // 地面尺度（米/像素）用于比例尺
    const midLat = this.d.routes.length ? this.d.routes[0].lat[0] : 0;
    this.mpp = 40075016.686 * Math.cos(midLat * Math.PI / 180) / this.s;
  };
  RouteMap.prototype.P = function (x, y) { return [this.ox + (x - this.bb[0]) * this.s, this.oy + (y - this.bb[1]) * this.s]; };
  RouteMap.prototype.draw = function (c, p) {
    const d = this.d, self = this; if (!d.routes.length) { drawEmpty(c, this.w, this.h, '没有 GPS 轨迹'); return; }
    // 经纬网
    c.strokeStyle = 'rgba(150,172,206,0.05)'; c.lineWidth = 1;
    for (let x = 0; x < this.w; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, this.h); c.stroke(); }
    for (let y = 0; y < this.h; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(this.w, y + 0.5); c.stroke(); }
    const many = d.routes.length > 1;
    const prog = ease.inOutCubic(Math.min(1, p));
    this.proj.forEach(function (pr, ri) {
      const r = d.routes[ri], n = pr.xs.length; if (n < 2) return;
      const local = many ? Math.max(0, Math.min(1, prog * 1.6 - ri / d.routes.length * 0.6)) : prog;
      const lim = Math.max(1, Math.floor(n * local));
      const focus = d.focus === undefined || d.focus === ri;
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (d.colorBy === 'speed' && !many) {
        // 按速度着色
        let sLo = Infinity, sHi = -Infinity; const arr = [];
        for (let i = 0; i < n; i++) { const v = r.speed[i]; if (v === v && v >= 0) arr.push(v); }
        arr.sort(function (a, b) { return a - b; }); sLo = S.q(arr, 0.05); sHi = S.q(arr, 0.95);
        c.lineWidth = 4;
        for (let i = 1; i < lim; i++) {
          const a = self.P(pr.xs[i - 1], pr.ys[i - 1]), b = self.P(pr.xs[i], pr.ys[i]);
          const t = Math.max(0, Math.min(1, ((r.speed[i] === r.speed[i] ? r.speed[i] : sLo) - sLo) / Math.max(0.01, sHi - sLo)));
          c.strokeStyle = C.rampAt(d.ramp, 0.25 + t * 0.75); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        }
      } else {
        c.strokeStyle = r.color || d.color || '#ff7a3d'; c.lineWidth = many ? 2 : 3.5; c.globalAlpha = focus ? (many ? 0.75 : 1) : 0.18;
        if (many) { c.shadowColor = r.color || d.color || '#ff7a3d'; c.shadowBlur = 6; }
        c.beginPath(); let a = self.P(pr.xs[0], pr.ys[0]); c.moveTo(a[0], a[1]);
        for (let i = 1; i < lim; i++) { const b = self.P(pr.xs[i], pr.ys[i]); c.lineTo(b[0], b[1]); }
        c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1;
      }
      if (!many || d.focus === ri) {
        const s0 = self.P(pr.xs[0], pr.ys[0]); c.beginPath(); c.arc(s0[0], s0[1], 6, 0, Math.PI * 2); c.fillStyle = COL.surface; c.fill(); c.beginPath(); c.arc(s0[0], s0[1], 4, 0, Math.PI * 2); c.fillStyle = '#3fcf6a'; c.fill();
        const e0 = self.P(pr.xs[lim - 1], pr.ys[lim - 1]); c.beginPath(); c.arc(e0[0], e0[1], 6, 0, Math.PI * 2); c.fillStyle = COL.surface; c.fill(); c.beginPath(); c.arc(e0[0], e0[1], 4, 0, Math.PI * 2); c.fillStyle = local >= 1 ? '#ff5d5d' : '#fff'; c.fill();
        // 公里标
        if (local >= 1 && r.metrics && r.metrics.cum && !many) {
          c.font = '600 10px ' + FNUM; c.textAlign = 'center'; c.textBaseline = 'middle';
          let next = 1000;
          for (let i = 1; i < n; i++) if (r.metrics.cum[i] >= next) { const q = self.P(pr.xs[i], pr.ys[i]); c.beginPath(); c.arc(q[0], q[1], 8, 0, Math.PI * 2); c.fillStyle = 'rgba(11,16,24,0.85)'; c.fill(); c.fillStyle = COL.ink; c.fillText(String(next / 1000), q[0], q[1] + 0.5); next += 1000; }
        }
      }
    });
    // 比例尺
    const target = this.mpp * 120; const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].reduce(function (b, v) { return Math.abs(v - target) < Math.abs(b - target) ? v : b; }, 100);
    const px = nice / this.mpp; c.strokeStyle = COL.ink3; c.lineWidth = 1.5; c.beginPath(); c.moveTo(this.w - 20 - px, this.h - 16); c.lineTo(this.w - 20, this.h - 16); c.stroke();
    c.font = '11px ' + FNUM; c.fillStyle = COL.ink3; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(nice >= 1000 ? nice / 1000 + ' 公里' : nice + ' 米', this.w - 20, this.h - 20);
    if (this.hp) { c.beginPath(); c.arc(this.hp[0], this.hp[1], 6, 0, Math.PI * 2); c.strokeStyle = COL.ink; c.lineWidth = 2; c.stroke(); }
  };
  RouteMap.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, self = this; let best = null, bd = 18 * 18;
    this.proj.forEach(function (pr, ri) { const step = Math.max(1, Math.floor(pr.xs.length / 1500)); for (let i = 0; i < pr.xs.length; i += step) { const q = self.P(pr.xs[i], pr.ys[i]); const dd = (q[0] - pt[0]) * (q[0] - pt[0]) + (q[1] - pt[1]) * (q[1] - pt[1]); if (dd < bd) { bd = dd; best = [ri, i, q]; } } });
    if (!best) { this.hp = null; TT.hide(); this.render(); return; }
    this.hp = best[2]; this.render();
    const r = d.routes[best[0]], i = best[1];
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, (d.routes.length > 1 && r.title ? r.title + ' · ' : '') + T.dt(r.t[i]));
      if (r.speed[i] === r.speed[i]) tt.row(el, null, N.fix(r.speed[i] * 3.6, 1) + ' km/h', '速度' + (r.speed[i] > 0.3 ? '（配速 ' + paceStr(1000 / r.speed[i]) + '/公里）' : ''));
      if (r.metrics && r.metrics.cum) tt.row(el, null, N.fix(r.metrics.cum[i] / 1000, 2) + ' 公里', '已行进');
      if (d.routes.length > 1 && d.onPick) tt.note(el, '点击查看这次训练');
    });
    this._pick = best[0];
  };
  RouteMap.prototype.onClick = function () { if (this.d.onPick && this._pick !== undefined && this.hp) this.d.onPick(this._pick); };
  function paceStr(secPerKm) { if (!isFinite(secPerKm)) return '—'; const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return m + '′' + (s < 10 ? '0' : '') + s + '″'; }
  CH.pace = paceStr;

  // ---------- 听力图 ----------
  // data: { points:[{f,l,r}] }
  const Audio = CH.Audiogram = inherit(function Audiogram(el, data, opt) { Base.call(this, el, Object.assign({ height: 300, duration: 1400 }, opt)); this.setData(data); });
  Audio.prototype.setData = function (d) { this.d = d; };
  Audio.prototype.layout = function () { this.L = 56; this.R = this.w - 16; this.Tp = 14; this.B = this.h - 30; this.f0 = Math.log2(125); this.f1 = Math.log2(8000); this.y0 = -10; this.y1 = 90; };
  Audio.prototype.X = function (f) { return this.L + (Math.log2(f) - this.f0) / (this.f1 - this.f0) * (this.R - this.L); };
  Audio.prototype.Y = function (db) { return this.Tp + (db - this.y0) / (this.y1 - this.y0) * (this.B - this.Tp); };
  Audio.prototype.draw = function (c, p) {
    const d = this.d, self = this;
    // WHO 听力分级背景
    const bands = [[-10, 20, '正常'], [20, 35, '轻度'], [35, 50, '中度'], [50, 65, '中重度'], [65, 80, '重度'], [80, 90, '极重度']];
    bands.forEach(function (b, i) { c.fillStyle = i === 0 ? 'rgba(46,196,182,0.07)' : 'rgba(150,172,206,' + (0.015 + i * 0.012) + ')'; c.fillRect(self.L, self.Y(b[0]), self.R - self.L, self.Y(b[1]) - self.Y(b[0])); c.font = '11px ' + FCN; c.fillStyle = COL.ink4; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(b[2], self.R - 6, (self.Y(b[0]) + self.Y(b[1])) / 2); });
    c.font = '11px ' + FNUM; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let db = -10; db <= 90; db += 10) { const y = Math.round(this.Y(db)) + 0.5; c.strokeStyle = db === 0 ? COL.axis : COL.grid; c.beginPath(); c.moveTo(this.L, y); c.lineTo(this.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText(db + '', this.L - 8, y); }
    c.textAlign = 'center'; c.textBaseline = 'top';
    [125, 250, 500, 1000, 2000, 4000, 8000].forEach(function (f) { const x = Math.round(self.X(f)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x, self.Tp); c.lineTo(x, self.B); c.stroke(); c.fillStyle = COL.ink3; c.fillText(f >= 1000 ? f / 1000 + 'k' : f + '', x, self.B + 7); });
    c.font = '11px ' + FCN; c.textAlign = 'left'; c.fillStyle = COL.ink3; c.fillText('dB HL', 4, this.Tp - 2); c.textAlign = 'right'; c.fillText('频率 Hz', this.R, this.B + 18);
    const pts = d.points.slice().sort(function (a, b) { return a.f - b.f; });
    const draw = function (key, col, mark) {
      c.save(); c.beginPath(); c.rect(0, 0, self.L + (self.R - self.L) * ease.outCubic(p) + 6, self.h); c.clip();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); let pen = false;
      pts.forEach(function (q) { const v = q[key]; if (!(v === v)) return; const x = self.X(q.f), y = self.Y(v); if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; } });
      c.stroke();
      pts.forEach(function (q) {
        const v = q[key]; if (!(v === v)) return; const x = self.X(q.f), y = self.Y(v);
        c.lineWidth = 2; c.strokeStyle = col;
        if (mark === 'o') { c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fillStyle = COL.surface; c.fill(); c.stroke(); }
        else { c.beginPath(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); }
      });
      c.restore();
    };
    draw('r', '#e66767', 'o'); draw('l', '#3987e5', 'x');
  };
  Audio.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, self = this; let best = null, bd = 1e9;
    d.points.forEach(function (q) { const dx = Math.abs(self.X(q.f) - pt[0]); if (dx < bd) { bd = dx; best = q; } });
    if (!best || bd > 40) { TT.hide(); return; }
    TT.show(e.clientX, e.clientY, function (el) { tt.head(el, best.f + ' Hz'); tt.row(el, '#e66767', N.fix(best.r, 1) + ' dB HL', '右耳'); tt.row(el, '#3987e5', N.fix(best.l, 1) + ' dB HL', '左耳'); });
  };

  // ---------- 生命之带（总览主视觉） ----------
  // data: { d0, d1, tracks:[{name, color, vals:Float64Array(以 base 为起点), base, fmt, kind:'bar'|'band', lo, hi, h}], marks:[{day, text}], onPick(day) }
  const Ribbon = CH.Ribbon = inherit(function Ribbon(el, data, opt) { const self = this; Base.call(this, el, Object.assign({ height: function () { return self.calcH(); }, duration: 2400 }, opt)); this.setData(data); });
  Ribbon.prototype.setData = function (d) {
    this.d = d;
    d.tracks.forEach(function (tr) {
      const arr = []; for (let day = d.d0; day <= d.d1; day++) { const v = tr.vals[day - tr.base]; if (v === v && v > 0) arr.push(tr.hi ? tr.hi[day - tr.base] : v); }
      arr.sort(function (a, b) { return a - b; }); tr.max = tr.max || S.q(arr, 0.985) || 1; tr.min = tr.kind === 'band' ? (function () { const a = []; for (let day = d.d0; day <= d.d1; day++) { const v = tr.lo[day - tr.base]; if (v === v) a.push(v); } a.sort(function (x, y) { return x - y; }); return S.q(a, 0.01); })() : 0;
    });
  };
  Ribbon.prototype.calcH = function () { let h = 26; this.d.tracks.forEach(function (t) { h += (t.h || 60) + 14; }); return h + 18; };
  Ribbon.prototype.layout = function () { this.L = 86; this.R = this.w - 6; this.n = this.d.d1 - this.d.d0 + 1; this.slot = (this.R - this.L) / this.n; };
  Ribbon.prototype.draw = function (c, p) {
    const d = this.d, self = this, n = this.n, slot = this.slot;
    const prog = p;
    const revealDay = d.d0 + n * ease.inOutCubic(Math.min(1, prog));
    // 年份
    c.font = '500 11px ' + FNUM; c.textBaseline = 'top'; c.textAlign = 'left';
    for (let y = T.year(d.d0 * DAY); y <= T.year(d.d1 * DAY); y++) {
      const day = Math.max(d.d0, T.day(Date.UTC(y, 0, 1))); const x = this.L + (day - d.d0) * slot;
      c.fillStyle = COL.ink3; c.fillText(String(y), x + 3, 2);
      c.strokeStyle = 'rgba(150,172,206,0.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, 18); c.lineTo(Math.round(x) + 0.5, this.h - 14); c.stroke();
    }
    let top = 26;
    this.tops = [];
    d.tracks.forEach(function (tr) {
      const th = tr.h || 60; self.tops.push([top, th]);
      c.font = '12px ' + FCN; c.fillStyle = COL.ink2; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tr.name, self.L - 14, top + th / 2);
      c.fillStyle = tr.color; c.beginPath(); c.arc(self.L - 6 - c.measureText(tr.name).width - 14, top + th / 2, 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(150,172,206,0.10)'; c.beginPath(); c.moveTo(self.L, top + th + 0.5); c.lineTo(self.R, top + th + 0.5); c.stroke();
      const bw = Math.max(1, slot * (slot > 4 ? 0.7 : 1.02));
      for (let day = d.d0; day <= d.d1 && day <= revealDay; day++) {
        const i = day - tr.base, x = self.L + (day - d.d0) * slot;
        if (tr.kind === 'band') {
          const lo = tr.lo[i], hi = tr.hi[i]; if (!(lo === lo && hi === hi)) continue;
          const y0 = top + th - (lo - tr.min) / (tr.max - tr.min) * th, y1 = top + th - (Math.min(hi, tr.max) - tr.min) / (tr.max - tr.min) * th;
          c.fillStyle = C.rgba(tr.color, 0.8); c.fillRect(x, Math.max(top, y1), bw, Math.max(1, y0 - y1));
        } else {
          const v = tr.vals[i]; if (!(v === v) || v <= 0) continue;
          const hh = Math.min(1, v / tr.max) * th;
          c.fillStyle = tr.colorOf ? tr.colorOf(day, v) : tr.color;
          c.fillRect(x, top + th - hh, bw, hh);
        }
      }
      top += th + 14;
    });
    // 扫描线
    if (prog < 1) {
      const x = this.L + (revealDay - d.d0) * slot;
      const g = c.createLinearGradient(x - 60, 0, x, 0); g.addColorStop(0, 'rgba(242,85,122,0)'); g.addColorStop(1, 'rgba(242,85,122,0.28)');
      c.fillStyle = g; c.fillRect(x - 60, 20, 60, this.h - 34);
      c.fillStyle = '#ff8aa5'; c.fillRect(x, 20, 1.5, this.h - 34);
    }
    // 里程碑
    if (prog > 0.95 && d.marks) {
      c.globalAlpha = Math.min(1, (prog - 0.95) / 0.05);
      c.font = '11px ' + FCN; c.textBaseline = 'bottom';
      d.marks.forEach(function (m) {
        const x = self.L + (m.day - d.d0 + 0.5) * slot;
        c.strokeStyle = 'rgba(237,241,247,0.5)'; c.beginPath(); c.moveTo(Math.round(x) + 0.5, 22); c.lineTo(Math.round(x) + 0.5, self.h - 14); c.stroke();
        c.fillStyle = COL.ink; c.textAlign = x > self.w - 140 ? 'right' : 'left'; c.fillText(m.text, x + (c.textAlign === 'left' ? 5 : -5), self.h - 2);
      });
      c.globalAlpha = 1;
    }
    if (this.hover !== null && this.hover !== undefined) { const x = Math.round(this.L + (this.hover - d.d0 + 0.5) * slot) + 0.5; c.strokeStyle = 'rgba(237,241,247,0.7)'; c.beginPath(); c.moveTo(x, 20); c.lineTo(x, this.h - 14); c.stroke(); }
  };
  Ribbon.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d; const day = d.d0 + Math.floor((pt[0] - this.L) / this.slot);
    if (day < d.d0 || day > d.d1 || pt[0] < this.L) { this.hover = null; TT.hide(); this.render(); return; }
    if (day !== this.hover) { this.hover = day; this.render(); }
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, T.date(day * DAY, { week: true }));
      d.tracks.forEach(function (tr) {
        const i = day - tr.base;
        if (tr.kind === 'band') { if (tr.lo[i] === tr.lo[i]) tt.row(el, tr.color, N.int(tr.lo[i]) + '–' + N.int(tr.hi[i]), tr.name + (tr.unit ? '（' + tr.unit + '）' : '')); }
        else { const v = tr.vals[i]; tt.row(el, tr.color, v === v && v > 0 ? tr.fmt(v) : '—', tr.name); }
      });
      if (d.onPick) tt.note(el, '点击查看这一天');
    });
  };
  Ribbon.prototype.onClick = function () { if (this.d.onPick && this.hover !== null && this.hover !== undefined) this.d.onPick(this.hover); };

  // ---------- 时间线（设备 / 来源 / 版本） ----------
  // data: { rows:[{name, sub, color, spans:[[a,b]], ticks:[{t, label}]}], t0, t1 }
  const Gantt = CH.Gantt = inherit(function Gantt(el, data, opt) { const self = this; Base.call(this, el, Object.assign({ height: function () { return 30 + self.d.rows.length * 34; }, duration: 1200 }, opt)); this.setData(data); });
  Gantt.prototype.setData = function (d) { this.d = d; };
  Gantt.prototype.layout = function () { this.L = Math.min(240, Math.max(150, this.w * 0.22)); this.R = this.w - 12; };
  Gantt.prototype.X = function (t) { const d = this.d; return this.L + (t - d.t0) / (d.t1 - d.t0 || 1) * (this.R - this.L); };
  Gantt.prototype.draw = function (c, p) {
    const d = this.d, self = this;
    c.font = '500 11px ' + FNUM; c.textBaseline = 'top'; c.textAlign = 'left';
    for (let y = T.year(d.t0); y <= T.year(d.t1) + 1; y++) { const t = Date.UTC(y, 0, 1); if (t < d.t0 || t > d.t1) continue; const x = Math.round(this.X(t)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x, 18); c.lineTo(x, this.h); c.stroke(); c.fillStyle = COL.ink3; c.fillText(String(y), x + 3, 2); }
    d.rows.forEach(function (r, i) {
      const y = 28 + i * 34;
      c.font = '12.5px ' + FCN; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = COL.ink2;
      let name = r.name; while (c.measureText(name).width > self.L - 16 && name.length > 3) name = name.slice(0, -2) + '…';
      c.fillText(name, self.L - 12, y + 9);
      const k = Math.max(0, Math.min(1, p * 1.4 - i / d.rows.length * 0.4)), q = ease.outCubic(k);
      r.spans.forEach(function (sp) {
        const x0 = self.X(sp[0]), x1 = Math.max(x0 + 3, self.X(sp[1]));
        c.fillStyle = r.color; c.globalAlpha = self.hover === i ? 1 : 0.85;
        c.beginPath(); rr(c, x0, y + 3, Math.max(3, (x1 - x0) * q), 12, 4); c.fill(); c.globalAlpha = 1;
      });
      if (r.ticks && q >= 1) r.ticks.forEach(function (tk) { const x = Math.round(self.X(tk.t)) + 0.5; c.strokeStyle = COL.page; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x, y + 15); c.stroke(); c.lineWidth = 1; });
    });
  };
  Gantt.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, i = Math.floor((pt[1] - 26) / 34);
    if (i < 0 || i >= d.rows.length) { this.hover = null; TT.hide(); this.render(); return; }
    if (i !== this.hover) { this.hover = i; this.render(); }
    const r = d.rows[i], t = d.t0 + (pt[0] - this.L) / (this.R - this.L) * (d.t1 - d.t0);
    let near = null; if (r.ticks) r.ticks.forEach(function (tk) { if (tk.t <= t && (!near || tk.t > near.t)) near = tk; });
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, r.name);
      r.spans.forEach(function (sp) { tt.row(el, r.color, T.date(sp[0]) + ' – ' + T.date(sp[1]), ''); });
      if (r.sub) tt.note(el, r.sub);
      if (near) tt.note(el, '这时的版本：' + near.label + '（' + T.date(near.t) + ' 起）');
    });
  };

  // ---------- 一天之内（时间轴为钟点） ----------
  // data: { t0, t1, lines:[{name,color,t:[],v:[],dots,width}], bars:{name,color,t:[],v:[],w(ms)}, yFmt, fmt, unit, bands:[{t0,t1,color,label}] }
  const Intraday = CH.Intraday = inherit(function Intraday(el, data, opt) { Base.call(this, el, Object.assign({ height: 200, duration: 1200 }, opt)); this.setData(data); });
  Intraday.prototype.setData = function (d) { this.d = d; };
  Intraday.prototype.layout = function () {
    const d = this.d; this.L = 44; this.R = this.w - 10; this.Tp = 12; this.B = this.h - 24;
    let lo = Infinity, hi = -Infinity;
    (d.lines || []).forEach(function (l) { l.v.forEach(function (v) { if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }); });
    if (d.bars) d.bars.v.forEach(function (v) { if (v > hi) hi = v; lo = Math.min(lo, 0); });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (!d.bars) { const pad = (hi - lo) * 0.1 || 5; lo -= pad; hi += pad; }
    const nt = niceTicks(lo, hi, 4); this.ylo = d.bars ? 0 : nt.lo; this.yhi = nt.hi; this.ticks = nt.ticks;
  };
  Intraday.prototype.X = function (t) { const d = this.d; return this.L + (t - d.t0) / (d.t1 - d.t0) * (this.R - this.L); };
  Intraday.prototype.Y = function (v) { return this.B - (v - this.ylo) / (this.yhi - this.ylo || 1) * (this.B - this.Tp); };
  Intraday.prototype.draw = function (c, p) {
    const d = this.d, self = this;
    const any = (d.lines || []).some(function (l) { return l.v.length; }) || (d.bars && d.bars.v.length);
    if (!any) { drawEmpty(c, this.w, this.h, d.empty || '这段时间没有数据'); return; }
    c.font = '11px ' + FNUM; c.textAlign = 'right'; c.textBaseline = 'middle';
    this.ticks.forEach(function (v) { const y = Math.round(self.Y(v)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(self.L, y); c.lineTo(self.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText((d.yFmt || N.axis)(v), self.L - 7, y); });
    const span = d.t1 - d.t0;
    c.textAlign = 'center'; c.textBaseline = 'top';
    if (d.dateAxis && span > 1.2 * DAY) {
      const ticks = dateTicks(d.t0, d.t1);
      let lastX = -1e9;
      ticks.forEach(function (tk) { const x = Math.round(self.X(tk.t)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x, self.Tp); c.lineTo(x, self.B); c.stroke(); c.font = (tk.strong ? '500 ' : '') + '11px ' + FCN; const tw = c.measureText(tk.text).width; if (x - tw / 2 < lastX + 8 || x + tw / 2 > self.w) return; c.fillStyle = tk.strong ? COL.ink2 : COL.ink3; c.fillText(tk.text, x, self.B + 7); lastX = x + tw / 2; });
      c.font = '11px ' + FNUM;
    } else {
      const step = span > 36 * 3600000 ? 6 * 3600000 : span > 10 * 3600000 ? 3 * 3600000 : span > 3 * 3600000 ? 3600000 : span > 3600000 ? 15 * 60000 : 5 * 60000;
      for (let t = Math.ceil(d.t0 / step) * step; t <= d.t1; t += step) { const x = Math.round(this.X(t)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x, this.Tp); c.lineTo(x, this.B); c.stroke(); c.fillStyle = COL.ink3; c.fillText(T.hm(t), x, this.B + 7); }
    }
    (d.bands || []).forEach(function (b) { c.fillStyle = b.color; c.fillRect(self.X(b.t0), self.Tp, self.X(b.t1) - self.X(b.t0), self.B - self.Tp); if (b.label) { c.font = '11px ' + FCN; c.fillStyle = COL.ink3; c.textAlign = 'left'; c.fillText(b.label, self.X(b.t0) + 4, self.Tp + 2); } });
    const cut = this.L + (this.R - this.L) * ease.outCubic(p);
    c.save(); c.beginPath(); c.rect(0, 0, cut + 2, this.h); c.clip();
    if (d.bars) {
      const bw = Math.max(1, Math.min(24, (this.X(d.t0 + d.bars.w) - this.X(d.t0)) * 0.72));
      c.fillStyle = d.bars.color;
      d.bars.t.forEach(function (t, i) { const v = d.bars.v[i]; if (!(v > 0)) return; const x = self.X(t + d.bars.w / 2) - bw / 2, y = self.Y(v); c.beginPath(); roundRectTop(c, x, y, bw, self.B - y, bw >= 6 ? 4 : 0); c.fill(); });
    }
    (d.lines || []).forEach(function (l) {
      c.strokeStyle = l.color; c.fillStyle = l.color; c.lineWidth = l.width || 2; c.lineJoin = 'round';
      if (l.dots) { l.t.forEach(function (t, i) { const v = l.v[i]; if (!(v === v)) return; const r = l.r || 1.8; if (l.ring) { c.beginPath(); c.arc(self.X(t), self.Y(v), r + 2, 0, Math.PI * 2); c.fillStyle = COL.surface; c.fill(); c.fillStyle = l.color; } c.beginPath(); c.arc(self.X(t), self.Y(v), r, 0, Math.PI * 2); c.fill(); }); return; }
      if (l.dim) c.globalAlpha = 0.45;
      c.beginPath(); let pen = false, lastT = -Infinity;
      l.t.forEach(function (t, i) { const v = l.v[i]; if (!(v === v)) { pen = false; return; } const x = self.X(t), y = self.Y(v); if (pen && t - lastT < (l.gap || 20 * 60000)) c.lineTo(x, y); else c.moveTo(x, y); pen = true; lastT = t; });
      c.stroke(); c.globalAlpha = 1;
    });
    c.restore();
    if (this.hx !== undefined && this.hx !== null) { c.strokeStyle = 'rgba(237,241,247,0.4)'; c.beginPath(); c.moveTo(Math.round(this.hx) + 0.5, this.Tp); c.lineTo(Math.round(this.hx) + 0.5, this.B); c.stroke(); }
  };
  Intraday.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d; if (pt[0] < this.L - 6 || pt[0] > this.R + 6) { this.hx = null; TT.hide(); this.render(); return; }
    if (d.dateAxis) { // 稀疏数据：找最近的点
      const self = this; let best = null, bd = 40;
      (d.lines || []).forEach(function (l) { if (!l.dots) return; l.t.forEach(function (t, i) { const v = l.v[i]; if (!(v === v)) return; const dx = Math.abs(self.X(t) - pt[0]), dy = Math.abs(self.Y(v) - pt[1]) * 0.35; const dd = dx + dy; if (dd < bd) { bd = dd; best = [l, i]; } }); });
      if (!best) { this.hx = null; TT.hide(); this.render(); return; }
      this.hx = this.X(best[0].t[best[1]]); this.render();
      TT.show(e.clientX, e.clientY, function (el) { const l = best[0], i = best[1]; tt.head(el, T.dtFull(l.t[i])); tt.row(el, l.color, (d.fmt || N.auto)(l.v[i]) + (l.unit ? ' ' + l.unit : ''), l.name); if (l.notes && l.notes[i]) tt.note(el, l.notes[i]); });
      return;
    }
    const t = d.t0 + (pt[0] - this.L) / (this.R - this.L) * (d.t1 - d.t0);
    this.hx = pt[0]; this.render();
    TT.show(e.clientX, e.clientY, function (el) {
      tt.head(el, T.hm(t));
      (d.lines || []).forEach(function (l) { let bi = -1, bd = Infinity; for (let i = 0; i < l.t.length; i++) { const dd = Math.abs(l.t[i] - t); if (dd < bd) { bd = dd; bi = i; } } if (bi >= 0 && bd < 30 * 60000) tt.row(el, l.color, (d.fmt || N.auto)(l.v[bi]) + (l.unit ? ' ' + l.unit : ''), l.name + ' · ' + T.hm(l.t[bi])); });
      if (d.bars) { for (let i = 0; i < d.bars.t.length; i++) if (t >= d.bars.t[i] && t < d.bars.t[i] + d.bars.w) tt.row(el, d.bars.color, (d.bars.fmt || N.auto)(d.bars.v[i]) + (d.bars.unit ? ' ' + d.bars.unit : ''), d.bars.name + ' · ' + T.hm(d.bars.t[i]) + '–' + T.hm(d.bars.t[i] + d.bars.w)); }
    });
  };

  // ---------- 24 小时剖面（中位数 + 四分位带） ----------
  // data: { mid:[24], lo:[24], hi:[24], color, fmt, unit, lo2, hi2 }
  const Profile24 = CH.Profile24 = inherit(function Profile24(el, data, opt) { Base.call(this, el, Object.assign({ height: 210, duration: 1200 }, opt)); this.setData(data); });
  Profile24.prototype.setData = function (d) { this.d = d; };
  Profile24.prototype.layout = function () {
    const d = this.d; this.L = 42; this.R = this.w - 10; this.Tp = 12; this.B = this.h - 24;
    let lo = Infinity, hi = -Infinity; [d.lo, d.hi, d.mid, d.lo2, d.hi2].forEach(function (a) { if (a) a.forEach(function (v) { if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }); });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const nt = niceTicks(lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.05, 4); this.ylo = nt.lo; this.yhi = nt.hi; this.ticks = nt.ticks;
  };
  Profile24.prototype.X = function (hh) { return this.L + (hh + 0.5) / 24 * (this.R - this.L); };
  Profile24.prototype.Y = function (v) { return this.B - (v - this.ylo) / (this.yhi - this.ylo || 1) * (this.B - this.Tp); };
  Profile24.prototype.draw = function (c, p) {
    const d = this.d, self = this, col = d.color;
    c.font = '11px ' + FNUM; c.textAlign = 'right'; c.textBaseline = 'middle';
    this.ticks.forEach(function (v) { const y = Math.round(self.Y(v)) + 0.5; c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(self.L, y); c.lineTo(self.R, y); c.stroke(); c.fillStyle = COL.ink3; c.fillText((d.yFmt || N.axis)(v), self.L - 7, y); });
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let hh = 0; hh < 24; hh += 3) { c.fillStyle = COL.ink3; c.fillText(hh + ':00', this.X(hh), this.B + 7); }
    c.save(); c.beginPath(); c.rect(0, 0, this.L + (this.R - this.L) * ease.outCubic(p) + 2, this.h); c.clip();
    const band = function (lo, hi, a) { if (!lo) return; c.fillStyle = C.rgba(col, a); c.beginPath(); let st = false; for (let i = 0; i < 24; i++) { if (!(hi[i] === hi[i])) continue; const x = self.X(i), y = self.Y(hi[i]); if (!st) { c.moveTo(x, y); st = true; } else c.lineTo(x, y); } for (let i = 23; i >= 0; i--) { if (!(lo[i] === lo[i])) continue; c.lineTo(self.X(i), self.Y(lo[i])); } c.closePath(); c.fill(); };
    band(d.lo2, d.hi2, 0.08); band(d.lo, d.hi, 0.2);
    c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); let pen = false;
    for (let i = 0; i < 24; i++) { const v = d.mid[i]; if (!(v === v)) { pen = false; continue; } const x = this.X(i), y = this.Y(v); if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; } }
    c.stroke(); c.restore();
    if (this.hover !== null && this.hover !== undefined) { const x = Math.round(this.X(this.hover)) + 0.5; c.strokeStyle = 'rgba(237,241,247,0.4)'; c.beginPath(); c.moveTo(x, this.Tp); c.lineTo(x, this.B); c.stroke(); const v = d.mid[this.hover]; if (v === v) { c.beginPath(); c.arc(x, this.Y(v), 4, 0, Math.PI * 2); c.fillStyle = col; c.fill(); } }
  };
  Profile24.prototype.onMove = function (e) {
    const pt = this.pt(e), d = this.d, i = Math.floor((pt[0] - this.L) / ((this.R - this.L) / 24));
    if (i < 0 || i > 23) { this.hover = null; TT.hide(); this.render(); return; }
    if (i !== this.hover) { this.hover = i; this.render(); }
    TT.show(e.clientX, e.clientY, function (el) { const f = d.fmt || N.auto; tt.head(el, HL.pad(i) + ':00 – ' + HL.pad(i) + ':59'); tt.row(el, d.color, f(d.mid[i]) + (d.unit ? ' ' + d.unit : ''), d.midName || '中位数'); if (d.lo) tt.row(el, null, f(d.lo[i]) + ' – ' + f(d.hi[i]), d.bandName || '中间一半的范围'); if (d.n) tt.note(el, N.int(d.n[i]) + ' 次测量'); });
  };

  // ---------- 导入页的心电扫描线 ----------
  CH.traceLoop = function (canvas, getSpeed) {
    const c = canvas.getContext('2d'); let w = 0, h = 0, x = 0, last = performance.now(), running = true, phase = 0;
    const pts = [];
    function size() { const dpr = window.devicePixelRatio || 1; w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); window.addEventListener('resize', size);
    function beat(t) { // 模拟 PQRST
      const ph = t % 1;
      if (ph < 0.1) return Math.sin(ph / 0.1 * Math.PI) * 0.12;
      if (ph < 0.16) return 0;
      if (ph < 0.18) return -0.15;
      if (ph < 0.21) return 1;
      if (ph < 0.24) return -0.32;
      if (ph < 0.3) return 0;
      if (ph < 0.46) return Math.sin((ph - 0.3) / 0.16 * Math.PI) * 0.22;
      return 0;
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min(50, now - last); last = now;
      const sp = getSpeed ? getSpeed() : 1;
      const adv = dt * 0.16 * (0.8 + sp * 0.6);
      phase += adv / 120 * (0.9 + sp * 0.5);
      x += adv;
      if (x > w) { x = 0; pts.length = 0; }
      pts.push([x, h * 0.6 - beat(phase) * h * 0.5]);
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(150,172,206,0.08)'; c.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 24) { c.beginPath(); c.moveTo(gx + 0.5, 0); c.lineTo(gx + 0.5, h); c.stroke(); }
      for (let gy = 0; gy < h; gy += 24) { c.beginPath(); c.moveTo(0, gy + 0.5); c.lineTo(w, gy + 0.5); c.stroke(); }
      c.lineWidth = 2; c.lineJoin = 'round';
      const g = c.createLinearGradient(Math.max(0, x - 400), 0, x, 0); g.addColorStop(0, 'rgba(242,85,122,0)'); g.addColorStop(1, 'rgba(255,138,165,1)');
      c.strokeStyle = g; c.beginPath();
      pts.forEach(function (p0, i) { if (i) c.lineTo(p0[0], p0[1]); else c.moveTo(p0[0], p0[1]); });
      c.stroke();
      const lp = pts[pts.length - 1]; c.beginPath(); c.arc(lp[0], lp[1], 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.shadowColor = '#ff7a98'; c.shadowBlur = 16; c.fill(); c.shadowBlur = 0;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop: function () { running = false; window.removeEventListener('resize', size); } };
  };
})();
