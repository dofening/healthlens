/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 通用工具：格式化、统计、颜色、DOM */
(function () {
  'use strict';
  const HL = window.HL = window.HL || {};
  // 版权信息：侧栏底部、设置、导入页和控制台都从这里读取
  HL.about = Object.freeze({ name: '健康透镜', en: 'HealthLens', author: 'dofen', year: 2026, copyright: '© 2026 dofen' });
  const DAY = 86400000;
  const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // ---------- 时间（全部是“本地墙钟当 UTC”的毫秒） ----------
  const T = {
    DAY: DAY,
    day(ms) { return Math.floor(ms / DAY); },
    ms(day) { return day * DAY; },
    d(ms) { return new Date(ms); },
    ymd(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); },
    date(ms, opt) { // 2026年1月14日
      if (!isFinite(ms)) return '—';
      const d = new Date(ms);
      let s = (opt && opt.noYear ? '' : d.getUTCFullYear() + '年') + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
      if (opt && opt.week) s += ' ' + WEEK_CN[d.getUTCDay()];
      return s;
    },
    md(ms) { const d = new Date(ms); return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日'; },
    ym(ms) { const d = new Date(ms); return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月'; },
    hm(ms) { const d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); },
    hms(ms) { const d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); },
    dt(ms) { return isFinite(ms) ? T.date(ms) + ' ' + T.hm(ms) : '—'; },
    dtFull(ms) { return isFinite(ms) ? T.date(ms, { week: true }) + ' ' + T.hms(ms) : '—'; },
    week(ms) { return WEEK_CN[new Date(ms).getUTCDay()]; },
    weekdayIdx(day) { return (new Date(day * DAY).getUTCDay() + 6) % 7; }, // 周一=0
    WEEK_CN: WEEK_CN,
    WEEK_MON: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    clockMin(ms) { const r = ((ms % DAY) + DAY) % DAY; return r / 60000; },
    clock(min) { // 分钟 → HH:MM（可超过 24h 或为负）
      let m = Math.round(min); m = ((m % 1440) + 1440) % 1440;
      return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    },
    dur(sec, opt) { // 7小时32分
      if (!isFinite(sec)) return '—';
      const neg = sec < 0; sec = Math.abs(sec);
      let out;
      if (sec < 60) out = Math.round(sec) + '秒';
      else if (sec < 3600) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); out = m + '分' + (opt && opt.sec && s ? s + '秒' : (opt && opt.short ? '' : '钟')); if (opt && opt.sec && s) out = m + '分' + s + '秒'; }
      else if (sec < 86400 * 2) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); out = m === 60 ? (h + 1) + '小时' : h + '小时' + (m ? m + '分' : ''); }
      else { const d = Math.floor(sec / 86400), h = Math.round((sec % 86400) / 3600); out = d + '天' + (h ? h + '小时' : ''); }
      return (neg ? '-' : '') + out;
    },
    durH(min) { return T.dur(min * 60); },
    span(days) { // 天数 → 4年5个月
      if (days < 60) return Math.round(days) + '天';
      const y = Math.floor(days / 365.25), mo = Math.round((days - y * 365.25) / 30.44);
      return (y ? y + '年' : '') + (mo ? mo + '个月' : '');
    },
    monthKey(day) { const d = new Date(day * DAY); return d.getUTCFullYear() * 12 + d.getUTCMonth(); },
    monthStartDay(mk) { return T.day(Date.UTC(Math.floor(mk / 12), mk % 12, 1)); },
    weekStartDay(day) { return day - T.weekdayIdx(day); },
    year(ms) { return new Date(ms).getUTCFullYear(); },
    age(dobStr, atMs) {
      if (!dobStr) return NaN;
      const p = dobStr.split('-').map(Number);
      const d = new Date(atMs);
      let a = d.getUTCFullYear() - p[0];
      if (d.getUTCMonth() + 1 < p[1] || (d.getUTCMonth() + 1 === p[1] && d.getUTCDate() < p[2])) a--;
      return a;
    }
  };
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- 数字 ----------
  const N = {
    int(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'; },
    fix(v, d) { if (!isFinite(v)) return '—'; return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
    auto(v, d) { // 按量级给小数位
      if (!isFinite(v)) return '—';
      const a = Math.abs(v);
      if (d !== undefined) return N.fix(v, d);
      if (a >= 1000) return N.int(v);
      if (a >= 100) return N.fix(v, 0);
      if (a >= 10) return N.fix(v, 1);
      if (a >= 1) return N.fix(v, 1);
      if (a === 0) return '0';
      return N.fix(v, 2);
    },
    cn(v, d) { // 中文万/亿
      if (!isFinite(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e8) return trim0((v / 1e8).toFixed(d === undefined ? 2 : d)) + '亿';
      if (a >= 1e4) return trim0((v / 1e4).toFixed(d === undefined ? (a >= 1e6 ? 0 : 1) : d)) + '万';
      return N.auto(v);
    },
    axis(v) {
      const a = Math.abs(v);
      if (a >= 1e8) return trim0((v / 1e8).toFixed(1)) + '亿';
      if (a >= 1e4) return trim0((v / 1e4).toFixed(a >= 1e5 ? 0 : 1)) + '万';
      if (a >= 1000) return N.int(v);
      if (a >= 10 || a === 0) return trim0(v.toFixed(a >= 100 ? 0 : 1));
      return trim0(v.toFixed(2));
    },
    pct(v, d) { return isFinite(v) ? N.fix(v * 100, d === undefined ? 0 : d) + '%' : '—'; },
    signed(v, d) { if (!isFinite(v)) return '—'; const s = N.fix(Math.abs(v), d === undefined ? 1 : d); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s; }
  };
  function trim0(s) { return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }

  // ---------- 统计 ----------
  const S = {
    mean(a) { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v) { s += v; n++; } } return n ? s / n : NaN; },
    sum(a) { let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v) s += v; } return s; },
    sortedFinite(a) { const o = []; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v && isFinite(v)) o.push(v); } o.sort(function (x, y) { return x - y; }); return o; },
    q(sorted, p) { // 线性插值分位数
      const n = sorted.length; if (!n) return NaN;
      const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
    },
    std(a) { const m = S.mean(a); let s = 0, n = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v) { s += (v - m) * (v - m); n++; } } return n > 1 ? Math.sqrt(s / (n - 1)) : NaN; },
    linreg(xs, ys) { // 最小二乘
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < xs.length; i++) { const x = xs[i], y = ys[i]; if (x === x && y === y) { n++; sx += x; sy += y; sxx += x * x; sxy += x * y; } }
      if (n < 3) return null;
      const den = n * sxx - sx * sx; if (!den) return null;
      const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
      let ssr = 0, sst = 0; const my = sy / n;
      for (let i = 0; i < xs.length; i++) { const x = xs[i], y = ys[i]; if (x === x && y === y) { const f = a + b * x; ssr += (y - f) * (y - f); sst += (y - my) * (y - my); } }
      return { a: a, b: b, n: n, r2: sst ? 1 - ssr / sst : 0 };
    },
    pearson(xs, ys) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < xs.length; i++) { const x = xs[i], y = ys[i]; if (x === x && y === y) { n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; } }
      if (n < 3) return { r: NaN, n: n };
      const c = n * sxy - sx * sy, d = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
      return { r: d ? c / d : NaN, n: n };
    },
    rank(a) { // 平均秩，NaN 保持 NaN
      const idx = []; for (let i = 0; i < a.length; i++) if (a[i] === a[i]) idx.push(i);
      idx.sort(function (x, y) { return a[x] - a[y]; });
      const r = new Float64Array(a.length).fill(NaN);
      for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++; const rv = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = rv; i = j + 1; }
      return r;
    },
    spearman(xs, ys) { // 只用两边都有值的点
      const X = [], Y = [];
      for (let i = 0; i < xs.length; i++) if (xs[i] === xs[i] && ys[i] === ys[i]) { X.push(xs[i]); Y.push(ys[i]); }
      if (X.length < 8) return { r: NaN, n: X.length, p: 1 };
      const res = S.pearson(S.rank(X), S.rank(Y));
      res.p = S.pCorr(res.r, res.n);
      return res;
    },
    pCorr(r, n) { // 相关系数的双侧 p 值（t 分布近似）
      if (!isFinite(r) || n < 4) return 1;
      const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
      return 2 * (1 - S.tcdf(Math.abs(t), n - 2));
    },
    tcdf(t, df) { // Student t 累积分布（正则化不完全 beta）
      const x = df / (df + t * t);
      return 1 - 0.5 * S.ibeta(x, df / 2, 0.5);
    },
    ibeta(x, a, b) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      const lbeta = S.lgamma(a + b) - S.lgamma(a) - S.lgamma(b);
      const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta);
      if (x < (a + 1) / (a + b + 2)) return front * S.betacf(x, a, b) / a;
      return 1 - Math.exp(Math.log(1 - x) * b + Math.log(x) * a + lbeta) * S.betacf(1 - x, b, a) / b;
    },
    betacf(x, a, b) {
      const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
      let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
      if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
      for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
        const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
      }
      return h;
    },
    lgamma(z) {
      const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
      if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - S.lgamma(1 - z);
      z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
      const t = z + g + 0.5;
      return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    },
    welch(a, b) { // 两组均值差的 Welch t 检验
      const ma = S.mean(a), mb = S.mean(b), va = Math.pow(S.std(a), 2), vb = Math.pow(S.std(b), 2), na = a.length, nb = b.length;
      if (na < 5 || nb < 5) return { diff: ma - mb, p: 1 };
      const se = Math.sqrt(va / na + vb / nb); if (!se) return { diff: ma - mb, p: 1 };
      const t = (ma - mb) / se;
      const df = Math.pow(va / na + vb / nb, 2) / (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
      return { diff: ma - mb, t: t, p: 2 * (1 - S.tcdf(Math.abs(t), df)), ma: ma, mb: mb };
    },
    movingAvg(vals, win) { // 忽略 NaN 的居中/尾随滑动均值（尾随）
      const n = vals.length, out = new Float64Array(n).fill(NaN);
      let s = 0, c = 0;
      for (let i = 0; i < n; i++) {
        const v = vals[i]; if (v === v) { s += v; c++; }
        if (i >= win) { const o = vals[i - win]; if (o === o) { s -= o; c--; } }
        if (c >= Math.max(1, Math.floor(win / 3))) out[i] = s / c;
      }
      return out;
    },
    circMeanMin(mins) { // 时钟分钟的圆周平均
      let sx = 0, sy = 0, n = 0;
      for (const m of mins) if (m === m) { const a = m / 1440 * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); n++; }
      if (!n) return NaN;
      let a = Math.atan2(sy / n, sx / n); if (a < 0) a += 2 * Math.PI;
      return a / (2 * Math.PI) * 1440;
    },
    lowerBound(arr, x, lo, hi) { lo = lo || 0; hi = hi === undefined ? arr.length : hi; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }
  };

  // ---------- 颜色（OKLCH 渐变） ----------
  function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linToSrgb(c) { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); }
  function rgbToOklab(rgb) {
    const r = srgbToLin(rgb[0]), g = srgbToLin(rgb[1]), b = srgbToLin(rgb[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function oklabToRgb(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  const C = {
    rgba(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; },
    // 深色模式的顺序色阶：从接近背景的暗色到亮色，单一色相，亮度单调
    ramp(hex, n) {
      const lab = rgbToOklab(hexToRgb(hex));
      const L0 = lab[0], c0 = Math.hypot(lab[1], lab[2]), h = Math.atan2(lab[2], lab[1]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 1 : i / (n - 1);
        const L = 0.27 + (Math.max(L0, 0.62) + 0.2 - 0.27) * t;
        const c = c0 * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI / 2)) * (t > 0.85 ? 1 - (t - 0.85) * 1.6 : 1);
        const rgb = oklabToRgb(Math.min(0.95, L), c * Math.cos(h), c * Math.sin(h));
        out.push('rgb(' + rgb.join(',') + ')');
      }
      return out;
    },
    rampAt(ramp, t) { if (!(t === t)) return null; t = Math.max(0, Math.min(1, t)); return ramp[Math.round(t * (ramp.length - 1))]; },
    // 发散：蓝 - 灰 - 红
    diverging(t) { // t ∈ [-1, 1]
      const neg = [57, 135, 229], pos = [230, 103, 103], mid = [58, 65, 80];
      const a = Math.min(1, Math.abs(t)); const tgt = t < 0 ? neg : pos;
      return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(mid[k] + (tgt[k] - mid[k]) * a); }).join(',') + ')';
    }
  };

  // ---------- DOM ----------
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // 仅用于程序内置的静态标记（图标等），绝不放入导出文件里的字符串
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (v[sk] == null) continue; if (sk.indexOf('--') === 0) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  const ease = {
    outCubic(t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    outBack(t) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  HL.T = T; HL.N = N; HL.S = S; HL.C = C; HL.h = h; HL.ease = ease; HL.reduceMotion = reduceMotion; HL.pad = pad;
})();
