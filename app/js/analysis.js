/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 分析层
 * 输入：解析引擎产出的 dataset；输出：按天/周/月的序列、区间统计、睡眠夜、体能训练、HRV 逐拍分析、洞察。
 * 结果按「类型 + 设置」缓存；时间区间筛选只是在缓存好的日数组上取切片。
 */
(function () {
  'use strict';
  const HL = window.HL;
  const T = HL.T, S = HL.S, CAT = HL.CAT;
  const DAY = 86400000;
  const A = HL.A = {};
  let DS = null;
  const cache = new Map();
  A.settings = { dedup: 'max', excludeUserEntered: true, sleepGoalMin: 480, stepGoal: 10000 };

  function pdate(str) { // 'YYYY-MM-DD HH:MM:SS +0800' -> 本地墙钟毫秒
    if (!str) return NaN;
    return Date.UTC(+str.substr(0, 4), +str.substr(5, 2) - 1, +str.substr(8, 2), +str.substr(11, 2) || 0, +str.substr(14, 2) || 0, +str.substr(17, 2) || 0);
  }
  A.pdate = pdate;

  function classifySource(s) {
    let w = 0, p = 0, pad = 0;
    (s.devModels || []).forEach(function (e) { const k = String(e[0]); if (/Watch/i.test(k)) w += e[1]; else if (/iPhone/i.test(k)) p += e[1]; else if (/iPad/i.test(k)) pad += e[1]; });
    if (w || p || pad) { if (w >= p && w >= pad) return 0; if (p >= pad) return 1; return 2; }
    if (/watch/i.test(s.name)) return 0;
    if (/iphone/i.test(s.name)) return 1;
    if (/ipad/i.test(s.name)) return 2;
    return 3;
  }
  A.SRC_CLASS = ['Apple Watch', 'iPhone', 'iPad', '其他 App / 设备'];

  A.init = function (ds, settings) {
    DS = ds; A.ds = ds; cache.clear();
    if (settings) Object.assign(A.settings, settings);
    A.byId = new Map();
    ds.types.forEach(function (t, i) {
      t.idx = i; t.def = CAT.type(t.id); t.disp = CAT.display(t.id, t.unit);
      A.byId.set(t.id, t);
    });
    ds.sources.forEach(function (s, i) { s.idx = i; s.cls = classifySource(s); });
    A.exportMs = pdate(ds.exportDate) || Date.now();
    let lo = Infinity, hi = -Infinity;
    ds.types.forEach(function (t) { if (t.n) { if (t.s[0] < lo) lo = t.s[0]; const e = t.s[t.n - 1]; if (e > hi) hi = e; } });
    ds.activity.forEach(function (a) { const ms = pdate(a.date + ' 00:00:00'); if (ms < lo) lo = ms; if (ms > hi) hi = ms; });
    if (!isFinite(lo)) { lo = A.exportMs; hi = A.exportMs; }
    hi = Math.min(Math.max(hi, lo), A.exportMs);
    A.day0 = T.day(lo); A.day1 = T.day(hi); A.nDays = A.day1 - A.day0 + 1;
    A.range = { d0: A.day0, d1: A.day1 };
    A.me = ds.me || {};
    A.dob = A.me.HKCharacteristicTypeIdentifierDateOfBirth || '';
    A.age = T.age(A.dob, A.exportMs);
    // 活动圆环按天索引
    A.rings = buildRings(ds.activity);
    A.workouts = buildWorkouts(ds);
  };
  A.setSettings = function (st) { Object.assign(A.settings, st); cache.clear(); A.workouts = buildWorkouts(DS); };
  A.setRange = function (d0, d1) { A.range = { d0: Math.max(A.day0, d0), d1: Math.min(A.day1, d1) }; };
  A.extent = function (id, d0, d1) { // 某类型在 [d0,d1] 内实际有数据的首尾日
    const t = A.byId.get(id); if (!t || !t.n) return null;
    const a = Math.max(d0, Math.floor(t.s[0] / DAY)), b = Math.min(d1, Math.floor(t.s[t.n - 1] / DAY));
    return b >= a ? [a, b] : null;
  };
  A.has = function (id) { const t = A.byId.get(id); return !!(t && t.n); };
  A.t = function (id) { return A.byId.get(id); };
  A.Q = function (s) { return 'HKQuantityTypeIdentifier' + s; };
  A.C = function (s) { return 'HKCategoryTypeIdentifier' + s; };
  function memo(key, fn) { if (cache.has(key)) return cache.get(key); const v = fn(); cache.set(key, v); return v; }
  A.memo = memo;

  // 二分：类型里开始时间落在 [ms0, ms1) 的记录下标区间
  A.idxRange = function (t, ms0, ms1) { return [S.lowerBound(t.s, ms0, 0, t.n), S.lowerBound(t.s, ms1, 0, t.n)]; };
  A.val = function (t, i) { return t.v[i] * t.disp.k + t.disp.b; };

  // ---------- 累计量：跨来源去重的日/小时序列 ----------
  const B = 96, BMS = DAY / B;
  A.sumDaily = function (id) {
    const st = A.settings;
    return memo('sum|' + id + '|' + st.dedup + '|' + st.excludeUserEntered, function () {
      const t = A.byId.get(id);
      const nD = A.nDays, d0 = A.day0;
      const out = { daily: new Float64Array(nD), hourly: new Float32Array(nD * 24), has: new Uint8Array(nD), credit: new Float64Array(DS.sources.length),
        rawBySrc: new Float64Array(DS.sources.length), dupTotal: 0, ueTotal: 0, dupN: 0, ueN: 0, records: 0 };
      if (!t) return out;
      const k = t.disp.k;
      const perSrc = new Map();
      const s = t.s, d = t.d, v = t.v, src = t.src, fl = t.fl;
      for (let i = 0; i < t.n; i++) {
        const val = v[i] * k;
        if (!(val > 0)) continue;
        if (fl[i] & 2) { out.dupTotal += val; out.dupN++; continue; }
        if (st.excludeUserEntered && (fl[i] & 1)) { out.ueTotal += val; out.ueN++; continue; }
        out.records++;
        out.rawBySrc[src[i]] += val;
        let m = perSrc.get(src[i]); if (!m) { m = new Map(); perSrc.set(src[i], m); }
        const a = s[i], e = a + d[i] * 1000;
        if (e - a <= 1000) { const day = Math.floor(a / DAY); let arr = m.get(day); if (!arr) { arr = new Float32Array(B); m.set(day, arr); } arr[Math.floor((a - day * DAY) / BMS)] += val; continue; }
        const dur = e - a;
        let cur = a, guard = 0;
        while (cur < e && guard++ < 20000) {
          const day = Math.floor(cur / DAY), b = Math.floor((cur - day * DAY) / BMS);
          const segEnd = Math.min(e, day * DAY + (b + 1) * BMS);
          let arr = m.get(day); if (!arr) { arr = new Float32Array(B); m.set(day, arr); }
          arr[b] += val * (segEnd - cur) / dur;
          cur = segEnd;
        }
      }
      const srcIds = Array.from(perSrc.keys());
      const cls = srcIds.map(function (x) { return DS.sources[x].cls; });
      const days = new Set();
      perSrc.forEach(function (m) { m.forEach(function (_, day) { days.add(day); }); });
      const mode = st.dedup;
      days.forEach(function (day) {
        const di = day - d0; if (di < 0 || di >= nD) return;
        const arrs = srcIds.map(function (x) { return perSrc.get(x).get(day) || null; });
        let tot = 0;
        for (let b = 0; b < B; b++) {
          let val = 0, win = -1;
          if (mode === 'sum') {
            for (let j = 0; j < arrs.length; j++) if (arrs[j] && arrs[j][b] > 0) { val += arrs[j][b]; out.credit[srcIds[j]] += arrs[j][b]; }
          } else if (mode === 'priority') {
            for (let c = 0; c <= 3 && val === 0; c++) for (let j = 0; j < arrs.length; j++) if (cls[j] === c && arrs[j] && arrs[j][b] > val) { val = arrs[j][b]; win = j; }
          } else { // max：Apple 设备之间取最大；没有 Apple 设备数据的时段才用第三方
            for (let j = 0; j < arrs.length; j++) if (cls[j] <= 2 && arrs[j] && arrs[j][b] > val) { val = arrs[j][b]; win = j; }
            if (val === 0) for (let j = 0; j < arrs.length; j++) if (arrs[j] && arrs[j][b] > val) { val = arrs[j][b]; win = j; }
          }
          if (val > 0) {
            tot += val; out.hourly[di * 24 + (b >> 2)] += val;
            if (win >= 0) out.credit[srcIds[win]] += val;
          }
        }
        out.daily[di] = tot; if (tot > 0) out.has[di] = 1;
      });
      return out;
    });
  };

  // ---------- 离散测量：日均/最值 ----------
  A.avgDaily = function (id) {
    return memo('avg|' + id, function () {
      const t = A.byId.get(id);
      const nD = A.nDays, d0 = A.day0;
      const out = { cnt: new Uint32Array(nD), sum: new Float64Array(nD), min: new Float64Array(nD).fill(NaN), max: new Float64Array(nD).fill(NaN),
        minT: new Float64Array(nD).fill(NaN), maxT: new Float64Array(nD).fill(NaN), hSum: new Float64Array(nD * 24), hCnt: new Uint32Array(nD * 24), mean: new Float64Array(nD).fill(NaN) };
      if (!t) return out;
      const k = t.disp.k, b = t.disp.b;
      for (let i = 0; i < t.n; i++) {
        if (t.fl[i] & 2) continue;
        const raw = t.v[i]; if (raw !== raw) continue;
        const v = raw * k + b, ms = t.s[i];
        const di = Math.floor(ms / DAY) - d0; if (di < 0 || di >= nD) continue;
        out.cnt[di]++; out.sum[di] += v;
        if (!(out.min[di] <= v)) { out.min[di] = v; out.minT[di] = ms; }
        if (!(out.max[di] >= v)) { out.max[di] = v; out.maxT[di] = ms; }
        const hh = Math.floor((ms - (di + d0) * DAY) / 3600000);
        out.hSum[di * 24 + hh] += v; out.hCnt[di * 24 + hh]++;
      }
      for (let i = 0; i < nD; i++) if (out.cnt[i]) out.mean[i] = out.sum[i] / out.cnt[i];
      return out;
    });
  };

  // ---------- 声压级：按时长的能量平均 ----------
  A.audioDaily = function (id) {
    return memo('audio|' + id, function () {
      const t = A.byId.get(id);
      const nD = A.nDays, d0 = A.day0;
      const out = { secs: new Float64Array(nD), energy: new Float64Array(nD), max: new Float64Array(nD).fill(NaN), maxT: new Float64Array(nD).fill(NaN),
        over80: new Float64Array(nD), over90: new Float64Array(nD), hSecs: new Float64Array(nD * 24), laeq: new Float64Array(nD).fill(NaN), byDev: new Map(), hist: new Float64Array(13) };
      if (!t) return out;
      for (let i = 0; i < t.n; i++) {
        if (t.fl[i] & 2) continue;
        const L = t.v[i]; if (L !== L) continue;
        const ms = t.s[i], sec = Math.max(1, t.d[i]);
        const di = Math.floor(ms / DAY) - d0; if (di < 0 || di >= nD) continue;
        const e = sec * Math.pow(10, L / 10);
        out.secs[di] += sec; out.energy[di] += e;
        if (!(out.max[di] >= L)) { out.max[di] = L; out.maxT[di] = ms; }
        if (L >= 80) out.over80[di] += sec; if (L >= 90) out.over90[di] += sec;
        // 跨小时分摊收听时长
        let cur = ms; const end = ms + sec * 1000; let guard = 0;
        while (cur < end && guard++ < 200) {
          const dd = Math.floor(cur / DAY) - d0, hh = Math.floor((cur % DAY) / 3600000);
          const hEnd = Math.floor(cur / 3600000) * 3600000 + 3600000, seg = Math.min(end, hEnd) - cur;
          if (dd >= 0 && dd < nD) out.hSecs[dd * 24 + hh] += seg / 1000;
          cur = Math.min(end, hEnd);
        }
        const dv = t.dev[i];
        let r = out.byDev.get(dv); if (!r) { r = { secs: 0, energy: 0, n: 0, first: ms, last: ms, max: -Infinity }; out.byDev.set(dv, r); }
        r.secs += sec; r.energy += e; r.n++; if (ms < r.first) r.first = ms; if (ms > r.last) r.last = ms; if (L > r.max) r.max = L;
        const hb = Math.max(0, Math.min(12, Math.floor((L - 40) / 5) + 1)); out.hist[L < 40 ? 0 : hb] += sec;
      }
      for (let i = 0; i < nD; i++) if (out.secs[i]) out.laeq[i] = 10 * Math.log10(out.energy[i] / out.secs[i]);
      return out;
    });
  };
  A.laeq = function (secs, energy) { return secs > 0 ? 10 * Math.log10(energy / secs) : NaN; };

  // ---------- 事件 ----------
  A.eventDaily = function (id) {
    return memo('ev|' + id, function () {
      const t = A.byId.get(id);
      const nD = A.nDays, d0 = A.day0;
      const out = { cnt: new Uint32Array(nD), secs: new Float64Array(nD), hCnt: new Uint32Array(nD * 24), list: [] };
      if (!t) return out;
      for (let i = 0; i < t.n; i++) {
        if (t.fl[i] & 2) continue;
        const ms = t.s[i]; const di = Math.floor(ms / DAY) - d0; if (di < 0 || di >= nD) continue;
        out.cnt[di]++; out.secs[di] += t.d[i];
        out.hCnt[di * 24 + Math.floor((ms % DAY) / 3600000)]++;
        out.list.push(i);
      }
      return out;
    });
  };

  // ---------- 站立小时 ----------
  A.standDaily = function () {
    return memo('stand', function () {
      const t = A.byId.get(A.C('AppleStandHour'));
      const nD = A.nDays, d0 = A.day0;
      const out = { stood: new Uint8Array(nD), idle: new Uint8Array(nD), hStood: new Uint32Array(24), hIdle: new Uint32Array(24), has: new Uint8Array(nD), grid: new Int8Array(nD * 24).fill(-1) };
      if (!t) return out;
      let stoodCode = -1;
      t.catCodes.forEach(function (e) { if (/Stood$/.test(e[0])) stoodCode = e[1]; });
      for (let i = 0; i < t.n; i++) {
        if (t.fl[i] & 2) continue;
        const ms = t.s[i], di = Math.floor(ms / DAY) - d0; if (di < 0 || di >= nD) continue;
        const hh = Math.floor((ms % DAY) / 3600000);
        const stood = t.v[i] === stoodCode;
        if (stood) { out.stood[di]++; out.hStood[hh]++; } else { out.idle[di]++; out.hIdle[hh]++; }
        out.grid[di * 24 + hh] = stood ? 1 : 0;
        out.has[di] = 1;
      }
      return out;
    });
  };

  // ---------- 通用：某类型的日值（用于图表/相关性） ----------
  // 返回 Float64Array(nDays)，无数据为 NaN
  A.dailyValues = function (id, how) {
    const t = A.byId.get(id); if (!t) return new Float64Array(A.nDays).fill(NaN);
    const kind = t.def.kind;
    return memo('dv|' + id + '|' + (how || '') + '|' + A.settings.dedup + A.settings.excludeUserEntered, function () {
      const out = new Float64Array(A.nDays).fill(NaN);
      if (kind === 'sum') { const r = A.sumDaily(id); for (let i = 0; i < A.nDays; i++) if (r.has[i]) out[i] = r.daily[i]; }
      else if (kind === 'audio') { const r = A.audioDaily(id); if (how === 'secs') { for (let i = 0; i < A.nDays; i++) if (r.secs[i]) out[i] = r.secs[i] / 60; } else out.set(r.laeq); }
      else if (kind === 'event') { const r = A.eventDaily(id); for (let i = 0; i < A.nDays; i++) out[i] = r.cnt[i]; }
      else if (kind === 'stand') { const r = A.standDaily(); for (let i = 0; i < A.nDays; i++) if (r.has[i]) out[i] = r.stood[i]; }
      else { const r = A.avgDaily(id); if (how === 'min') out.set(r.min); else if (how === 'max') out.set(r.max); else out.set(r.mean); }
      return out;
    });
  };

  // ---------- 按粒度汇总 ----------
  // gran: day | week | month | year；返回 {x(周期起点日), y, lo, hi, n, days}
  A.rollup = function (daily, d0, d1, gran, mode, lo, hi) {
    // mode: sum（周期总和） | avg（周期内有数据日的均值） | mean（对已有均值再平均）
    const xs = [], ys = [], los = [], his = [], ns = [];
    if (gran === 'day') {
      for (let d = d0; d <= d1; d++) { const i = d - A.day0; xs.push(d); ys.push(daily[i]); los.push(lo ? lo[i] : NaN); his.push(hi ? hi[i] : NaN); ns.push(daily[i] === daily[i] ? 1 : 0); }
      return { x: xs, y: ys, lo: los, hi: his, n: ns, gran: gran };
    }
    let curKey = null, start = 0, s = 0, c = 0, mn = Infinity, mx = -Infinity, days = 0;
    const keyOf = function (d) { if (gran === 'week') return T.weekStartDay(d); if (gran === 'month') return T.monthKey(d); return T.year(d * DAY); };
    const startOf = function (key) { if (gran === 'week') return key; if (gran === 'month') return T.monthStartDay(key); return T.day(Date.UTC(key, 0, 1)); };
    const flush = function () {
      if (curKey === null) return;
      xs.push(startOf(curKey));
      ys.push(c ? (mode === 'sum' ? s : s / c) : NaN);
      los.push(mn === Infinity ? NaN : mn); his.push(mx === -Infinity ? NaN : mx); ns.push(c);
    };
    for (let d = d0; d <= d1; d++) {
      const key = keyOf(d);
      if (key !== curKey) { flush(); curKey = key; s = 0; c = 0; mn = Infinity; mx = -Infinity; }
      const i = d - A.day0, v = daily[i];
      if (v === v) { s += v; c++; }
      const l = lo ? lo[i] : v, h = hi ? hi[i] : v;
      if (l === l && l < mn) mn = l; if (h === h && h > mx) mx = h;
    }
    flush();
    return { x: xs, y: ys, lo: los, hi: his, n: ns, gran: gran };
  };
  A.autoGran = function (d0, d1) { const n = d1 - d0 + 1; return n <= 120 ? 'day' : n <= 800 ? 'week' : 'month'; };

  // ---------- 区间统计（各类型通用） ----------
  A.stats = function (id, d0, d1) {
    const t = A.byId.get(id); if (!t) return null;
    d0 = d0 === undefined ? A.range.d0 : d0; d1 = d1 === undefined ? A.range.d1 : d1;
    const kind = t.def.kind;
    const i0 = d0 - A.day0, i1 = d1 - A.day0;
    const r = { id: id, kind: kind, unit: t.disp.unit, d0: d0, d1: d1, rangeDays: d1 - d0 + 1 };
    const [a, b] = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
    r.records = b - a; r.firstT = r.records ? t.s[a] : NaN; r.lastT = r.records ? t.s[b - 1] : NaN;
    r.allFirst = t.n ? t.s[0] : NaN; r.allLast = t.n ? t.s[t.n - 1] : NaN;
    const hour = new Float64Array(24), hourN = new Float64Array(24), wk = new Float64Array(7), wkN = new Float64Array(7);
    if (kind === 'sum') {
      const sd = A.sumDaily(id);
      let tot = 0, days = 0, maxV = -Infinity, maxD = -1, minV = Infinity, minD = -1; const vals = [];
      for (let i = i0; i <= i1; i++) {
        if (!sd.has[i]) continue;
        const v = sd.daily[i]; tot += v; days++; vals.push(v);
        if (v > maxV) { maxV = v; maxD = i + A.day0; } if (v < minV) { minV = v; minD = i + A.day0; }
        for (let h = 0; h < 24; h++) { hour[h] += sd.hourly[i * 24 + h]; }
        const w = T.weekdayIdx(i + A.day0); wk[w] += v; wkN[w]++;
      }
      for (let h = 0; h < 24; h++) hour[h] = days ? hour[h] / days : NaN;
      for (let w = 0; w < 7; w++) wk[w] = wkN[w] ? wk[w] / wkN[w] : NaN;
      const sorted = vals.slice().sort(function (x, y) { return x - y; });
      Object.assign(r, { total: tot, days: days, perDay: days ? tot / days : NaN, perDayAll: tot / (d1 - d0 + 1), median: S.q(sorted, 0.5), p90: S.q(sorted, 0.9), p10: S.q(sorted, 0.1),
        max: { v: maxV, day: maxD }, min: { v: minV, day: minD }, hour: hour, week: wk, sorted: sorted });
      // 最佳周/月
      r.bestWeek = bestPeriod(sd.daily, sd.has, d0, d1, 'week');
      r.bestMonth = bestPeriod(sd.daily, sd.has, d0, d1, 'month');
      // 趋势（每 30 天变化）
      const xs = [], ys = []; for (let i = i0; i <= i1; i++) if (sd.has[i]) { xs.push(i); ys.push(sd.daily[i]); }
      r.trend = S.linreg(xs, ys);
      r.credit = sd.credit; r.rawBySrc = sd.rawBySrc; r.dupTotal = sd.dupTotal; r.ueTotal = sd.ueTotal;
    } else if (kind === 'audio') {
      const ad = A.audioDaily(id);
      let secs = 0, en = 0, o80 = 0, o90 = 0, days = 0, maxV = -Infinity, maxT = NaN;
      for (let i = i0; i <= i1; i++) {
        if (!ad.secs[i]) continue;
        secs += ad.secs[i]; en += ad.energy[i]; o80 += ad.over80[i]; o90 += ad.over90[i]; days++;
        if (ad.max[i] > maxV) { maxV = ad.max[i]; maxT = ad.maxT[i]; }
        for (let h = 0; h < 24; h++) hour[h] += ad.hSecs[i * 24 + h] / 60;
        const w = T.weekdayIdx(i + A.day0); wk[w] += ad.secs[i] / 60; wkN[w]++;
      }
      for (let h = 0; h < 24; h++) hour[h] = days ? hour[h] / days : NaN;
      for (let w = 0; w < 7; w++) wk[w] = wkN[w] ? wk[w] / wkN[w] : NaN;
      Object.assign(r, { secs: secs, laeq: A.laeq(secs, en), days: days, perDaySecs: days ? secs / days : NaN, over80: secs ? o80 / secs : NaN, over90: secs ? o90 / secs : NaN, max: { v: maxV, t: maxT }, hour: hour, week: wk });
      samplesStats(t, a, b, r);
    } else if (kind === 'event') {
      const ed = A.eventDaily(id);
      let cnt = 0, secs = 0, days = 0;
      for (let i = i0; i <= i1; i++) { if (ed.cnt[i]) { cnt += ed.cnt[i]; secs += ed.secs[i]; days++; } for (let h = 0; h < 24; h++) hour[h] += ed.hCnt[i * 24 + h]; const w = T.weekdayIdx(i + A.day0); wk[w] += ed.cnt[i]; wkN[w]++; }
      for (let w = 0; w < 7; w++) wk[w] = wkN[w] ? wk[w] / wkN[w] : NaN;
      const durs = []; for (let i = a; i < b; i++) if (!(t.fl[i] & 2)) durs.push(t.d[i]);
      durs.sort(function (x, y) { return x - y; });
      Object.assign(r, { count: cnt, secs: secs, days: days, avgSecs: cnt ? secs / cnt : NaN, medSecs: S.q(durs, 0.5), maxSecs: durs[durs.length - 1], minSecs: durs[0], hour: hour, week: wk });
      // 类别值分布
      const byVal = new Map(); for (let i = a; i < b; i++) byVal.set(t.v[i], (byVal.get(t.v[i]) || 0) + 1);
      r.byValue = Array.from(byVal.entries()).map(function (e) { return [catLabel(t, e[0]), e[1]]; });
    } else if (kind === 'stand') {
      const sd = A.standDaily();
      let stood = 0, days = 0, maxV = -1, maxD = -1, minV = Infinity, minD = -1; const vals = [];
      for (let i = i0; i <= i1; i++) { if (!sd.has[i]) continue; stood += sd.stood[i]; days++; vals.push(sd.stood[i]); if (sd.stood[i] > maxV) { maxV = sd.stood[i]; maxD = i + A.day0; } if (sd.stood[i] < minV) { minV = sd.stood[i]; minD = i + A.day0; } const w = T.weekdayIdx(i + A.day0); wk[w] += sd.stood[i]; wkN[w]++; }
      for (let w = 0; w < 7; w++) wk[w] = wkN[w] ? wk[w] / wkN[w] : NaN;
      const sortedS = vals.slice().sort(function (x, y) { return x - y; });
      Object.assign(r, { total: stood, days: days, perDay: days ? stood / days : NaN, max: { v: maxV, day: maxD }, min: { v: minV, day: minD }, median: S.q(sortedS, 0.5), p90: S.q(sortedS, 0.9), sorted: sortedS, week: wk, hour: hour });
    } else if (kind !== 'sleep') {
      const ad = A.avgDaily(id);
      let days = 0;
      for (let i = i0; i <= i1; i++) {
        if (!ad.cnt[i]) continue; days++;
        for (let h = 0; h < 24; h++) { hour[h] += ad.hSum[i * 24 + h]; hourN[h] += ad.hCnt[i * 24 + h]; }
        const w = T.weekdayIdx(i + A.day0); wk[w] += ad.sum[i]; wkN[w] += ad.cnt[i];
      }
      for (let h = 0; h < 24; h++) hour[h] = hourN[h] ? hour[h] / hourN[h] : NaN;
      for (let w = 0; w < 7; w++) wk[w] = wkN[w] ? wk[w] / wkN[w] : NaN;
      r.days = days; r.hour = hour; r.hourN = hourN; r.week = wk;
      samplesStats(t, a, b, r);
      const xs = [], ys = []; for (let i = i0; i <= i1; i++) if (ad.cnt[i]) { xs.push(i); ys.push(ad.mean[i]); }
      r.trend = S.linreg(xs, ys);
    }
    // 来源/设备构成（按记录条数）
    const bySrc = new Map(), byDev = new Map();
    for (let i = a; i < b; i++) { bySrc.set(t.src[i], (bySrc.get(t.src[i]) || 0) + 1); byDev.set(t.dev[i], (byDev.get(t.dev[i]) || 0) + 1); }
    r.bySrc = Array.from(bySrc.entries()).sort(function (x, y) { return y[1] - x[1]; });
    r.byDev = Array.from(byDev.entries()).sort(function (x, y) { return y[1] - x[1]; });
    let dup = 0, ue = 0; for (let i = a; i < b; i++) { if (t.fl[i] & 2) dup++; if (t.fl[i] & 1) ue++; }
    r.dup = dup; r.ue = ue;
    return r;
  };
  function samplesStats(t, a, b, r) {
    const k = t.disp.k, bb = t.disp.b;
    const vals = []; let maxV = -Infinity, maxI = -1, minV = Infinity, minI = -1, lastI = -1, firstI = -1;
    for (let i = a; i < b; i++) {
      if (t.fl[i] & 2) continue; const raw = t.v[i]; if (raw !== raw) continue;
      const v = raw * k + bb; vals.push(v);
      if (v > maxV) { maxV = v; maxI = i; } if (v < minV) { minV = v; minI = i; }
      if (firstI < 0) firstI = i; lastI = i;
    }
    const sorted = Float64Array.from(vals).sort();
    r.n = vals.length; r.mean = S.mean(vals); r.std = S.std(vals); r.sorted = sorted;
    r.median = S.q(sorted, 0.5); r.p5 = S.q(sorted, 0.05); r.p25 = S.q(sorted, 0.25); r.p75 = S.q(sorted, 0.75); r.p95 = S.q(sorted, 0.95);
    if (r.kind !== 'audio') r.max = { v: maxV, t: maxI >= 0 ? t.s[maxI] : NaN, i: maxI };
    else r.maxSample = { v: maxV, t: maxI >= 0 ? t.s[maxI] : NaN, i: maxI };
    r.min = { v: minV, t: minI >= 0 ? t.s[minI] : NaN, i: minI };
    r.latest = lastI >= 0 ? { v: t.v[lastI] * k + bb, t: t.s[lastI], i: lastI } : null;
    r.first = firstI >= 0 ? { v: t.v[firstI] * k + bb, t: t.s[firstI], i: firstI } : null;
  }
  function bestPeriod(daily, has, d0, d1, gran) {
    const ro = A.rollup(Float64Array.from(daily, function (v, i) { return has[i] ? v : NaN; }), d0, d1, gran, 'sum');
    let best = -1, bi = -1;
    for (let i = 0; i < ro.y.length; i++) if (ro.y[i] > best) { best = ro.y[i]; bi = i; }
    return bi >= 0 ? { v: best, day: ro.x[bi], n: ro.n[bi] } : null;
  }
  function catLabel(t, code) {
    if (t.id === A.C('SleepAnalysis')) { const st = CAT.SLEEP_STAGE[code]; return st ? st.name : String(code); }
    for (let k = 0; k < t.catCodes.length; k++) if (t.catCodes[k][1] === code) return CAT.catName(t.catCodes[k][0]);
    return String(code);
  }
  A.catLabel = catLabel;

  // ---------- 连续达标 ----------
  A.streaks = function (daily, has, goal, d0, d1) {
    let cur = 0, best = 0, bestEnd = -1, curStart = -1, bestStart = -1, hit = 0, n = 0;
    for (let d = d0; d <= d1; d++) {
      const i = d - A.day0;
      const ok = has[i] && daily[i] >= goal;
      if (has[i]) n++;
      if (ok) { hit++; if (cur === 0) curStart = d; cur++; if (cur > best) { best = cur; bestEnd = d; bestStart = curStart; } } else cur = 0;
    }
    return { current: cur, best: best, bestStart: bestStart, bestEnd: bestEnd, hit: hit, n: n };
  };

  // ---------- 活动圆环 ----------
  function buildRings(act) {
    const nD = A.nDays, d0 = A.day0;
    const r = { has: new Uint8Array(nD), move: new Float64Array(nD).fill(NaN), moveGoal: new Float64Array(nD).fill(NaN), ex: new Float64Array(nD).fill(NaN), exGoal: new Float64Array(nD).fill(NaN),
      stand: new Float64Array(nD).fill(NaN), standGoal: new Float64Array(nD).fill(NaN), moveTime: new Float64Array(nD).fill(NaN), moveTimeGoal: new Float64Array(nD).fill(NaN), unit: 'kcal' };
    act.forEach(function (a) {
      if (!a.date) return;
      const di = T.day(Date.UTC(+a.date.substr(0, 4), +a.date.substr(5, 2) - 1, +a.date.substr(8, 2))) - d0;
      if (di < 0 || di >= nD) return;
      r.has[di] = 1; r.move[di] = a.move; r.moveGoal[di] = a.moveGoal; r.ex[di] = a.exercise; r.exGoal[di] = a.exerciseGoal;
      r.stand[di] = a.stand; r.standGoal[di] = a.standGoal; r.moveTime[di] = a.moveTime; r.moveTimeGoal[di] = a.moveTimeGoal; if (a.unit) r.unit = a.unit;
    });
    return r;
  }
  A.ringStats = function (d0, d1) {
    const R = A.rings; const i0 = d0 - A.day0, i1 = d1 - A.day0;
    const o = { days: 0, moveClosed: 0, exClosed: 0, standClosed: 0, allClosed: 0, exDays: 0, standDays: 0, moveSum: 0, exSum: 0, standSum: 0, goals: [] };
    let lastGoal = null;
    for (let i = i0; i <= i1; i++) {
      if (!R.has[i]) continue; o.days++;
      const mv = R.move[i] >= R.moveGoal[i] && R.moveGoal[i] > 0;
      const exOk = R.exGoal[i] > 0, stOk = R.standGoal[i] > 0;
      const ex = exOk && R.ex[i] >= R.exGoal[i], st = stOk && R.stand[i] >= R.standGoal[i];
      if (mv) o.moveClosed++; if (exOk) { o.exDays++; if (ex) o.exClosed++; } if (stOk) { o.standDays++; if (st) o.standClosed++; }
      if (mv && (!exOk || ex) && (!stOk || st) && (exOk || stOk)) o.allClosed++;
      o.moveSum += R.move[i] || 0; o.exSum += R.ex[i] || 0; o.standSum += R.stand[i] || 0;
      const g = R.moveGoal[i] + '|' + R.exGoal[i] + '|' + R.standGoal[i];
      if (g !== lastGoal) { o.goals.push({ day: i + A.day0, move: R.moveGoal[i], ex: R.exGoal[i], stand: R.standGoal[i] }); lastGoal = g; }
    }
    const moveDaily = Float64Array.from(R.move, function (v, i) { return v; });
    const ratio = new Float64Array(A.nDays); const has = new Uint8Array(A.nDays);
    for (let i = 0; i < A.nDays; i++) if (R.has[i] && R.moveGoal[i] > 0) { ratio[i] = R.move[i] / R.moveGoal[i]; has[i] = 1; }
    o.moveStreak = A.streaks(ratio, has, 1, d0, d1);
    return o;
  };

  // ---------- 睡眠 ----------
  A.sleepNights = function () {
    return memo('sleep', function () {
      const t = A.byId.get(A.C('SleepAnalysis'));
      const nights = [];
      if (!t) return nights;
      // 按「醒来日」分组：中午 12 点为界
      const groups = new Map();
      for (let i = 0; i < t.n; i++) {
        if (t.fl[i] & 2) continue;
        const nd = Math.floor((t.s[i] + 12 * 3600000) / DAY);
        let g = groups.get(nd); if (!g) { g = []; groups.set(nd, g); } g.push(i);
      }
      const keys = Array.from(groups.keys()).sort(function (a, b) { return a - b; });
      keys.forEach(function (nd) {
        const idx = groups.get(nd);
        // 每个来源的分期统计
        const bySrc = new Map();
        idx.forEach(function (i) {
          let r = bySrc.get(t.src[i]); if (!r) { r = { src: t.src[i], asleep: 0, stages: 0, inbed: 0, list: [] }; bySrc.set(t.src[i], r); }
          const c = t.v[i], dur = t.d[i];
          if (c === 1 || c === 3 || c === 4 || c === 5) r.asleep += dur;
          if (c >= 2) r.stages += dur;
          if (c === 0) r.inbed += dur;
          r.list.push(i);
        });
        let best = null;
        bySrc.forEach(function (r) {
          const score = (r.stages > 0 ? 1e9 : 0) + r.asleep * 10 + r.inbed;
          if (!best || score > best.score) { best = r; best.score = score; }
        });
        if (!best) return;
        const kind = best.stages > 0 ? 'stages' : best.asleep > 0 ? 'asleep' : 'inbed';
        // 选中来源的片段（排序）
        const segs = best.list.slice().sort(function (a, b) { return t.s[a] - t.s[b]; });
        // 切分会话：间隔 > 90 分钟另起
        const sessions = [];
        let cur = null;
        segs.forEach(function (i) {
          const s = t.s[i], e = s + t.d[i] * 1000;
          if (!cur || s - cur.e > 90 * 60000) { cur = { s: s, e: e, idx: [] }; sessions.push(cur); }
          cur.idx.push(i); if (e > cur.e) cur.e = e;
        });
        const asleepOf = function (ss) { let a = 0; ss.idx.forEach(function (i) { const c = t.v[i]; if (c === 1 || c === 3 || c === 4 || c === 5 || (kind === 'inbed' && c === 0)) a += t.d[i]; }); return a; };
        sessions.forEach(function (ss) { ss.asleep = asleepOf(ss); ss.nightLike = ss.asleep >= 3 * 3600 || (ss.e > nd * DAY - 2 * 3600000 && ss.s < nd * DAY + 6 * 3600000); });
        sessions.sort(function (a, b) { return (b.nightLike - a.nightLike) || (b.asleep - a.asleep); });
        const main = sessions[0];
        if (!main.nightLike) return; // 这个窗口里只有白天的小睡，不算一晚
        const naps = sessions.slice(1).filter(function (ss) { return ss.asleep >= 10 * 60; });
        const n = { day: nd, src: best.src, kind: kind, core: 0, deep: 0, rem: 0, unspec: 0, awake: 0, inbed: 0, segs: [], naps: naps.map(function (ss) { return { s: ss.s, e: ss.e, asleep: ss.asleep }; }) };
        let firstAsleep = Infinity, lastAsleep = -Infinity, firstRem = Infinity, awakenings = 0, prevAsleep = false, transitions = 0, prevCode = -1;
        main.idx.sort(function (a, b) { return t.s[a] - t.s[b]; });
        main.idx.forEach(function (i) {
          const c = t.v[i], s = t.s[i], e = s + t.d[i] * 1000, dur = t.d[i];
          n.segs.push([s, e, c]);
          if (c === 3) n.core += dur; else if (c === 4) n.deep += dur; else if (c === 5) { n.rem += dur; if (s < firstRem) firstRem = s; } else if (c === 1) n.unspec += dur; else if (c === 2) n.awake += dur; else if (c === 0) n.inbed += dur;
          const asleep = c === 1 || c === 3 || c === 4 || c === 5;
          if (asleep) { if (s < firstAsleep) firstAsleep = s; if (e > lastAsleep) lastAsleep = e; }
          if (c === 2 && prevAsleep) awakenings++;
          if (c !== 0) { if (prevCode >= 0 && c !== prevCode) transitions++; prevCode = c; prevAsleep = asleep; }
        });
        // 同一夜其他来源的「在床」记录（例如 iPhone 睡眠模式）
        let ibS = Infinity, ibE = -Infinity;
        idx.forEach(function (i) { if (t.v[i] === 0) { const s = t.s[i], e = s + t.d[i] * 1000; if (e > main.s - 3 * 3600000 && s < main.e + 3 * 3600000) { if (s < ibS) ibS = s; if (e > ibE) ibE = e; } } });
        if (kind === 'inbed') { firstAsleep = main.s; lastAsleep = main.e; n.asleep = n.inbed; }
        else n.asleep = n.core + n.deep + n.rem + n.unspec;
        n.start = firstAsleep; n.end = lastAsleep;
        n.inBedStart = isFinite(ibS) ? ibS : NaN; n.inBedEnd = isFinite(ibE) ? ibE : NaN;
        const span = (lastAsleep - firstAsleep) / 1000;
        n.span = span;
        n.efficiency = kind === 'inbed' ? NaN : (span > 0 ? Math.min(1, n.asleep / span) : NaN);
        n.latency = isFinite(ibS) && firstAsleep >= ibS && kind !== 'inbed' ? (firstAsleep - ibS) / 1000 : NaN;
        n.remLatency = isFinite(firstRem) ? (firstRem - firstAsleep) / 1000 : NaN;
        n.awakenings = awakenings; n.transitions = transitions;
        n.mid = (firstAsleep + lastAsleep) / 2;
        // 以 18:00 为 0 点的入睡/醒来分钟数（便于跨零点平均）
        n.bedMin = ((firstAsleep - (nd - 1) * DAY) / 60000) - 18 * 60;
        n.wakeMin = ((lastAsleep - nd * DAY) / 60000);
        n.midMin = ((n.mid - (nd - 1) * DAY) / 60000) - 18 * 60;
        n.napSecs = naps.reduce(function (s, x) { return s + x.asleep; }, 0);
        const midClock = ((n.mid % DAY) + DAY) % DAY / 3600000;
        n.daytime = midClock >= 12 && midClock < 20; // 主睡眠的中点在中午到晚上 8 点之间
        n.srcName = DS.sources[best.src] ? DS.sources[best.src].name : '';
        if (n.asleep >= 30 * 60 || kind === 'inbed') nights.push(n);
      });
      return nights;
    });
  };
  A.nightsIn = function (d0, d1) { return A.sleepNights().filter(function (n) { return n.day >= d0 && n.day <= d1; }); };
  A.sleepStats = function (d0, d1) {
    const ns = A.nightsIn(d0, d1);
    const staged = ns.filter(function (n) { return n.kind === 'stages'; });
    const measured = ns.filter(function (n) { return n.kind !== 'inbed'; });
    const pool = measured.length ? measured : ns;
    const m = function (arr, f) { return S.mean(arr.map(f)); };
    const o = { nights: ns.length, staged: staged.length, measured: measured.length, inbedOnly: ns.length - measured.length, pool: pool };
    o.asleep = m(pool, function (n) { return n.asleep; });
    o.deep = m(staged, function (n) { return n.deep; }); o.core = m(staged, function (n) { return n.core; }); o.rem = m(staged, function (n) { return n.rem; }); o.awake = m(staged, function (n) { return n.awake; });
    o.deepPct = m(staged, function (n) { return n.deep / n.asleep; }); o.remPct = m(staged, function (n) { return n.rem / n.asleep; }); o.corePct = m(staged, function (n) { return n.core / n.asleep; });
    o.efficiency = m(staged, function (n) { return n.efficiency; });
    o.awakenings = m(staged, function (n) { return n.awakenings; });
    const timed = pool.filter(function (n) { return !n.daytime; }); // 作息时间只看夜间睡眠
    o.timed = timed; o.daytimeN = pool.length - timed.length;
    const qs = function (f) { const a = timed.map(f).filter(function (x) { return x === x; }).sort(function (x, y) { return x - y; }); return [S.q(a, 0.5), S.q(a, 0.25), S.q(a, 0.75)]; };
    const bq = qs(function (n) { return n.bedMin; }), wq = qs(function (n) { return n.wakeMin; }), mq = qs(function (n) { return n.midMin; });
    o.bed = bq[0]; o.bedQ1 = bq[1]; o.bedQ3 = bq[2]; o.wake = wq[0]; o.wakeQ1 = wq[1]; o.wakeQ3 = wq[2]; o.mid = mq[0];
    o.bedStd = S.std(timed.map(function (n) { return n.bedMin; })); o.wakeStd = S.std(timed.map(function (n) { return n.wakeMin; }));
    const wkd = timed.filter(function (n) { const w = T.weekdayIdx(n.day); return w <= 4; }), wke = timed.filter(function (n) { const w = T.weekdayIdx(n.day); return w >= 5; });
    o.midWeekday = S.mean(wkd.map(function (n) { return n.midMin; })); o.midWeekend = S.mean(wke.map(function (n) { return n.midMin; }));
    o.jetlag = o.midWeekend - o.midWeekday; // 社会时差（分钟）
    o.asleepWeekday = S.mean(wkd.map(function (n) { return n.asleep; })); o.asleepWeekend = S.mean(wke.map(function (n) { return n.asleep; }));
    o.longest = pool.reduce(function (b, n) { return !b || n.asleep > b.asleep ? n : b; }, null);
    o.shortest = pool.reduce(function (b, n) { return !b || n.asleep < b.asleep ? n : b; }, null);
    o.earliestBed = timed.reduce(function (b, n) { return !b || n.bedMin < b.bedMin ? n : b; }, null);
    o.latestBed = timed.reduce(function (b, n) { return !b || n.bedMin > b.bedMin ? n : b; }, null);
    o.earliestWake = timed.reduce(function (b, n) { return !b || n.wakeMin < b.wakeMin ? n : b; }, null);
    o.latestWake = timed.reduce(function (b, n) { return !b || n.wakeMin > b.wakeMin ? n : b; }, null);
    o.mostDeep = staged.reduce(function (b, n) { return !b || n.deep > b.deep ? n : b; }, null);
    const goal = A.settings.sleepGoalMin * 60;
    o.goalHit = pool.filter(function (n) { return n.asleep >= goal; }).length;
    o.naps = ns.reduce(function (s, n) { return s + n.naps.length; }, 0);
    o.sri = sleepRegularity(staged);
    return o;
  };
  // 睡眠规律性指数（SRI）：相隔 24 小时的两个时刻处于相同状态（睡/醒）的概率，映射到 -100..100
  function sleepRegularity(nights) {
    if (nights.length < 5) return NaN;
    const byDay = new Map(); nights.forEach(function (n) { byDay.set(n.day, n); });
    let same = 0, tot = 0;
    nights.forEach(function (n) {
      const nx = byDay.get(n.day + 1); if (!nx) return;
      // 以 n.day-1 的 18:00 起，取 24 小时、5 分钟一格
      const base = (n.day - 1) * DAY + 18 * 3600000;
      for (let k = 0; k < 288; k++) {
        const t1 = base + k * 300000, t2 = t1 + DAY;
        const a = asleepAt(n, t1), b = asleepAt(nx, t2);
        if (a === b) same++; tot++;
      }
    });
    return tot ? (same / tot) * 200 - 100 : NaN;
  }
  function asleepAt(n, ms) { for (let i = 0; i < n.segs.length; i++) { const s = n.segs[i]; if (ms >= s[0] && ms < s[1]) return s[2] === 1 || s[2] >= 3 ? 1 : 0; } return 0; }

  // ---------- 体能训练 ----------
  function buildWorkouts(ds) {
    const list = [];
    const routeByFile = new Map();
    (ds.routes || []).forEach(function (r) { routeByFile.set(r.file, r); });
    ds.workouts.forEach(function (w, i) {
      const o = { i: i, w: w, type: w.type, name: CAT.workoutName(w.type), s: w.s, e: w.e, dup: !!w.dupOf, src: w.src, srcName: ds.sources[w.src] ? ds.sources[w.src].name : '' };
      o.durMin = w.durationUnit === 'min' || !w.durationUnit ? w.duration : w.durationUnit === 'hr' ? w.duration * 60 : w.duration / 60;
      if (!(o.durMin > 0)) o.durMin = (w.e - w.s) / 60000;
      const st = w.stats || {};
      const dist = st.HKQuantityTypeIdentifierDistanceWalkingRunning || st.HKQuantityTypeIdentifierDistanceCycling || st.HKQuantityTypeIdentifierDistanceSwimming || null;
      o.distKm = dist ? (dist.unit === 'm' ? dist.sum / 1000 : dist.unit === 'mi' ? dist.sum * 1.609344 : dist.sum) : (w.totalDistance > 0 ? (w.totalDistanceUnit === 'm' ? w.totalDistance / 1000 : w.totalDistanceUnit === 'mi' ? w.totalDistance * 1.609344 : w.totalDistance) : NaN);
      const en = st.HKQuantityTypeIdentifierActiveEnergyBurned;
      o.kcal = en ? (en.unit === 'kJ' ? en.sum * 0.239 : en.sum) : (w.totalEnergy > 0 ? w.totalEnergy : NaN);
      const basal = st.HKQuantityTypeIdentifierBasalEnergyBurned; o.basalKcal = basal ? basal.sum : NaN;
      const hr = st.HKQuantityTypeIdentifierHeartRate;
      o.hrAvg = hr && hr.avg > 0 ? hr.avg : NaN; o.hrMin = hr && hr.min > 0 ? hr.min : NaN; o.hrMax = hr && hr.max > 0 ? hr.max : NaN;
      const steps = st.HKQuantityTypeIdentifierStepCount; o.steps = steps ? steps.sum : NaN;
      const m = w.meta || {};
      o.indoor = m.HKIndoorWorkout === '1';
      o.userEntered = m.HKWasUserEntered === '1';
      o.tempC = m.HKWeatherTemperature ? convTemp(m.HKWeatherTemperature) : NaN;
      o.humidity = m.HKWeatherHumidity ? (function (v) { return (v > 100 ? v / 100 : v) / 100; })(parseFloat(m.HKWeatherHumidity)) : NaN;
      o.mets = m.HKAverageMETs ? parseFloat(m.HKAverageMETs) : NaN;
      o.elevM = m.HKElevationAscended ? convLen(m.HKElevationAscended) : NaN;
      o.tz = m.HKTimeZone || '';
      const eff = (w.childRecords || []).filter(function (c) { return /EffortScore/.test(c.type || ''); });
      o.effort = eff.length ? eff[eff.length - 1].value : NaN;
      o.effortUser = (w.childRecords || []).some(function (c) { return c.type === 'HKQuantityTypeIdentifierWorkoutEffortScore'; });
      o.zones = (w.zones || []).filter(function (z) { return /HeartRate/.test(z.type); })[0] || null;
      o.events = w.events || [];
      o.pauses = o.events.filter(function (e) { return /Pause/.test(e.type); }).length;
      o.segments = o.events.filter(function (e) { return /Segment/.test(e.type); });
      o.route = null;
      (w.routes || []).forEach(function (rt) { const f = (rt.path || '').split('/').pop(); if (routeByFile.has(f)) o.route = routeByFile.get(f); });
      if (o.route && !o.route.metrics) o.route.metrics = routeMetrics(o.route);
      if (!(o.distKm > 0) && o.route && o.route.metrics) o.distKm = o.route.metrics.distKm;
      o.paceMinKm = o.distKm > 0.05 ? o.durMin / o.distKm : NaN;
      o.speedKmh = o.distKm > 0 ? o.distKm / (o.durMin / 60) : NaN;
      o.day = T.day(w.s);
      list.push(o);
    });
    return list;
  }
  function convTemp(s) { const v = parseFloat(s); if (/degF/.test(s)) return (v - 32) * 5 / 9; return v; }
  function convLen(s) { const v = parseFloat(s); if (/\bcm\b/.test(s)) return v / 100; if (/\bkm\b/.test(s)) return v * 1000; if (/\bft\b/.test(s)) return v * 0.3048; return v; }
  // 默认去掉重复写入；若设置里排除手动录入，也去掉手动录入的训练
  A.workoutsIn = function (d0, d1, withAll) { const ex = A.settings.excludeUserEntered; return A.workouts.filter(function (w) { return w.day >= d0 && w.day <= d1 && (withAll || (!w.dup && !(ex && w.userEntered))); }); };
  A.workoutValid = function (w) { return !w.dup && !(A.settings.excludeUserEntered && w.userEntered); };

  function hav(la1, lo1, la2, lo2) {
    const R = 6371008.8, r = Math.PI / 180;
    const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    const x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  A.hav = hav;
  function routeMetrics(r) {
    const n = r.lat.length; if (n < 2) return { distKm: 0, splits: [], cum: new Float64Array(n) };
    const cum = new Float64Array(n); let dist = 0, moving = 0, maxSpd = 0, gain = 0, loss = 0;
    let lastEle = r.ele[0];
    for (let i = 1; i < n; i++) {
      const dd = hav(r.lat[i - 1], r.lon[i - 1], r.lat[i], r.lon[i]);
      dist += dd; cum[i] = dist;
      const dt = (r.t[i] - r.t[i - 1]) / 1000;
      if (dt > 0 && dd / dt > 0.5 && dt < 30) moving += dt;
      const e = r.ele[i];
      if (e === e && lastEle === lastEle) { const de = e - lastEle; if (Math.abs(de) >= 1) { if (de > 0) gain += de; else loss -= de; lastEle = e; } } else if (e === e) lastEle = e;
    }
    // 平滑后的最快速度（10 秒窗口）
    for (let i = 0, j = 0; i < n; i++) { while (j < n && r.t[j] - r.t[i] < 10000) j++; if (j < n) { const dt = (r.t[j] - r.t[i]) / 1000; if (dt > 0) { const sp = (cum[j] - cum[i]) / dt; if (sp > maxSpd && sp < 15) maxSpd = sp; } } }
    // 每公里配速
    const splits = []; let nextKm = 1000, lastT = r.t[0], lastD = 0;
    for (let i = 1; i < n; i++) {
      while (cum[i] >= nextKm) {
        const f = (nextKm - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        const tk = r.t[i - 1] + f * (r.t[i] - r.t[i - 1]);
        splits.push({ km: nextKm / 1000, sec: (tk - lastT) / 1000, dist: nextKm - lastD });
        lastT = tk; lastD = nextKm; nextKm += 1000;
      }
    }
    const rest = dist - lastD; if (rest > 150) splits.push({ km: dist / 1000, sec: (r.t[n - 1] - lastT) / 1000, dist: rest, partial: true });
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    for (let i = 0; i < n; i++) { if (r.lat[i] < la0) la0 = r.lat[i]; if (r.lat[i] > la1) la1 = r.lat[i]; if (r.lon[i] < lo0) lo0 = r.lon[i]; if (r.lon[i] > lo1) lo1 = r.lon[i]; }
    const hasEle = Array.prototype.some.call(r.ele, function (e) { return e === e && e !== 0; });
    return { distKm: dist / 1000, durSec: (r.t[n - 1] - r.t[0]) / 1000, movingSec: moving, maxSpeed: maxSpd, gain: hasEle ? gain : NaN, loss: hasEle ? loss : NaN, splits: splits, cum: cum,
      bbox: [la0, lo0, la1, lo1], start: [r.lat[0], r.lon[0]], end: [r.lat[n - 1], r.lon[n - 1]], points: n, hasEle: hasEle };
  }
  A.routeMetrics = routeMetrics;
  // 体能训练期间的心率样本
  A.workoutHR = function (w) {
    const t = A.byId.get(A.Q('HeartRate')); if (!t) return { t: [], v: [] };
    const [a, b] = A.idxRange(t, w.s - 60000, w.e + 3 * 60000);
    const ts = [], vs = [];
    for (let i = a; i < b; i++) { if (t.fl[i] & 2) continue; ts.push(t.s[i]); vs.push(t.v[i]); }
    return { t: ts, v: vs };
  };
  A.hrZones = function () { // 用最近一次体能训练里系统给出的心率区间；没有则用 220-年龄 的比例
    const ws = A.workouts.filter(function (w) { return w.zones && w.zones.zones && w.zones.zones.length; });
    if (ws.length) { const z = ws[ws.length - 1].zones.zones; return { bounds: z.map(function (x) { return x.max; }).filter(function (v) { return v === v; }), source: 'apple' }; }
    const max = 220 - (A.age || 30);
    return { bounds: [0.6, 0.7, 0.8, 0.9].map(function (p) { return Math.round(max * p); }), source: 'age' };
  };

  // ---------- HRV 逐拍分析 ----------
  A.hrvBeats = function () {
    return memo('hrvbeats', function () {
      const t = A.byId.get(A.Q('HeartRateVariabilitySDNN'));
      if (!t || !t.hrv) return null;
      const bt = DS.beats.t, bb = DS.beats.bpm;
      const n = t.n;
      const rmssd = new Float32Array(n).fill(NaN), pnn50 = new Float32Array(n).fill(NaN), meanHR = new Float32Array(n).fill(NaN), sd1 = new Float32Array(n).fill(NaN), sd2 = new Float32Array(n).fill(NaN), nRR = new Uint16Array(n);
      for (let i = 0; i < n; i++) {
        const b0 = t.hrv.b0[i], bn = t.hrv.bn[i]; if (bn < 5) continue;
        const rr = [];
        for (let k = b0 + 1; k < b0 + bn; k++) { const v = (bt[k] - bt[k - 1]) * 1000; if (v >= 300 && v <= 2000) rr.push(v); else rr.push(NaN); }
        let ss = 0, c = 0, over = 0, hs = 0, hn = 0; const d1 = [], d2 = [];
        for (let k = 1; k < rr.length; k++) {
          const x = rr[k - 1], y = rr[k]; if (!(x === x && y === y)) continue;
          if (Math.abs(y - x) > 0.25 * x) continue; // 疑似漏拍/早搏
          const d = y - x; ss += d * d; c++; if (Math.abs(d) > 50) over++;
          d1.push((y - x) / Math.SQRT2); d2.push((y + x) / Math.SQRT2);
        }
        for (let k = 0; k < rr.length; k++) if (rr[k] === rr[k]) { hs += 60000 / rr[k]; hn++; }
        if (c >= 4) { rmssd[i] = Math.sqrt(ss / c); pnn50[i] = over / c; sd1[i] = S.std(d1); sd2[i] = S.std(d2); }
        if (hn) meanHR[i] = hs / hn; nRR[i] = c;
      }
      return { rmssd: rmssd, pnn50: pnn50, meanHR: meanHR, sd1: sd1, sd2: sd2, nRR: nRR };
    });
  };
  // 区间内的 Poincaré 点（RRn, RRn+1），最多 maxPts
  A.poincare = function (d0, d1, maxPts) {
    const t = A.byId.get(A.Q('HeartRateVariabilitySDNN')); if (!t || !t.hrv) return { x: [], y: [], n: 0 };
    const [a, b] = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
    const bt = DS.beats.t; let total = 0;
    for (let i = a; i < b; i++) total += Math.max(0, t.hrv.bn[i] - 2);
    const step = Math.max(1, Math.ceil(total / (maxPts || 6000)));
    const xs = [], ys = []; let k2 = 0;
    for (let i = a; i < b; i++) {
      const b0 = t.hrv.b0[i], bn = t.hrv.bn[i];
      for (let k = b0 + 2; k < b0 + bn; k++) {
        if ((k2++ % step) !== 0) continue;
        const x = (bt[k - 1] - bt[k - 2]) * 1000, y = (bt[k] - bt[k - 1]) * 1000;
        if (x >= 300 && x <= 2000 && y >= 300 && y <= 2000) { xs.push(x); ys.push(y); }
      }
    }
    return { x: xs, y: ys, n: total };
  };

  // ---------- 心率：按运动状态、按小时 ----------
  A.hrContext = function (d0, d1) {
    const t = A.byId.get(A.Q('HeartRate')); if (!t) return null;
    const [a, b] = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
    const groups = [[], [], [], []];
    for (let i = a; i < b; i++) { if (t.fl[i] & 2) continue; groups[(t.fl[i] >> 2) & 3].push(t.v[i]); }
    return groups.map(function (g) { const s = Float64Array.from(g).sort(); return { n: g.length, mean: S.mean(g), median: S.q(s, 0.5), p5: S.q(s, 0.05), p95: S.q(s, 0.95), sorted: s }; });
  };
  // 估算心跳总数：按样本把心率在时间上做阶梯积分（相邻样本间隔超过 20 分钟视为无佩戴）
  A.heartbeats = function (d0, d1) {
    const t = A.byId.get(A.Q('HeartRate')); if (!t) return { beats: 0, covered: 0 };
    const [a, b] = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
    let beats = 0, covered = 0;
    for (let i = a; i < b - 1; i++) {
      const dt = (t.s[i + 1] - t.s[i]) / 60000; if (dt <= 0 || dt > 20) continue;
      beats += t.v[i] * dt; covered += dt;
    }
    return { beats: beats, covered: covered };
  };

  // ---------- 每日指标表（洞察 & 年度回顾用） ----------
  A.metricDefs = function () {
    const Qn = A.Q;
    const defs = [];
    const add = function (key, name, unit, fn, opt) { defs.push(Object.assign({ key: key, name: name, unit: unit, fn: fn }, opt || {})); };
    if (A.has(Qn('StepCount'))) add('steps', '步数', '步', function () { return A.dailyValues(Qn('StepCount')); }, { dec: 0, group: 'activity' });
    if (A.has(Qn('DistanceWalkingRunning'))) add('dist', '步行距离', '公里', function () { return A.dailyValues(Qn('DistanceWalkingRunning')); }, { dec: 1, group: 'activity' });
    if (A.ds.activity.length) add('move', '活动能量', '千卡', function () { const R = A.rings; return Float64Array.from(R.move, function (v, i) { return R.has[i] ? v : NaN; }); }, { dec: 0, group: 'activity' });
    if (A.rings && Array.prototype.some.call(A.rings.exGoal, function (g) { return g > 0; })) add('exercise', '锻炼分钟', '分钟', function () { const R = A.rings; return Float64Array.from(R.ex, function (v, i) { return R.has[i] && R.exGoal[i] > 0 ? v : NaN; }); }, { dec: 0, group: 'activity' });
    if (A.has(Qn('FlightsClimbed'))) add('flights', '爬楼层数', '层', function () { return A.dailyValues(Qn('FlightsClimbed')); }, { dec: 0, group: 'activity' });
    if (A.has(Qn('TimeInDaylight'))) add('daylight', '日光时间', '分钟', function () { return A.dailyValues(Qn('TimeInDaylight')); }, { dec: 0, group: 'activity' });
    if (A.sleepNights().some(function (n) { return n.kind !== 'inbed'; })) {
      const nightArr = function (f, staged) { const out = new Float64Array(A.nDays).fill(NaN); A.sleepNights().forEach(function (n) { if (n.kind === 'inbed' || (staged && n.kind !== 'stages')) return; const i = n.day - A.day0; if (i >= 0 && i < A.nDays) out[i] = f(n); }); return out; };
      add('sleep', '睡眠时长', '小时', function () { return nightArr(function (n) { return n.asleep / 3600; }); }, { dec: 1, group: 'sleep' });
      add('bed', '入睡时间', '', function () { return nightArr(function (n) { return n.daytime ? NaN : n.bedMin; }); }, { dec: 0, group: 'sleep', clock: true });
      add('wake', '醒来时间', '', function () { return nightArr(function (n) { return n.daytime ? NaN : n.wakeMin; }); }, { dec: 0, group: 'sleep', clockWake: true });
      add('deep', '深睡占比', '%', function () { return nightArr(function (n) { return n.deep / n.asleep * 100; }, true); }, { dec: 0, group: 'sleep' });
      add('rem', '快速动眼占比', '%', function () { return nightArr(function (n) { return n.rem / n.asleep * 100; }, true); }, { dec: 0, group: 'sleep' });
      add('awake', '夜间清醒', '分钟', function () { return nightArr(function (n) { return n.awake / 60; }, true); }, { dec: 0, group: 'sleep' });
    }
    const avgM = function (key, s, name, unit, dec, group) { if (A.has(Qn(s))) add(key, name, unit, function () { return A.dailyValues(Qn(s)); }, { dec: dec, group: group }); };
    avgM('rhr', 'RestingHeartRate', '静息心率', '次/分', 0, 'heart');
    avgM('hrv', 'HeartRateVariabilitySDNN', '心率变异性', '毫秒', 0, 'heart');
    avgM('walkhr', 'WalkingHeartRateAverage', '步行心率', '次/分', 0, 'heart');
    avgM('hr', 'HeartRate', '平均心率', '次/分', 0, 'heart');
    avgM('resp', 'RespiratoryRate', '呼吸频率', '次/分', 1, 'resp');
    avgM('spo2', 'OxygenSaturation', '血氧', '%', 1, 'resp');
    avgM('wrist', 'AppleSleepingWristTemperature', '手腕温度', '°C', 2, 'sleep');
    avgM('speed', 'WalkingSpeed', '步行速度', 'km/h', 2, 'mobility');
    avgM('effort', 'PhysicalEffort', '运动强度', 'MET', 2, 'activity');
    if (A.has(Qn('HeadphoneAudioExposure'))) {
      add('listen', '耳机收听时长', '分钟', function () { return A.dailyValues(Qn('HeadphoneAudioExposure'), 'secs'); }, { dec: 0, group: 'hearing' });
      add('hpdb', '耳机音量', 'dB', function () { return A.dailyValues(Qn('HeadphoneAudioExposure')); }, { dec: 0, group: 'hearing' });
    }
    if (A.has(Qn('EnvironmentalAudioExposure'))) add('envdb', '环境噪音', 'dB', function () { return A.dailyValues(Qn('EnvironmentalAudioExposure')); }, { dec: 0, group: 'hearing' });
    if (A.workouts.some(A.workoutValid)) add('workout', '训练时长', '分钟', function () { const out = new Float64Array(A.nDays).fill(0); A.workouts.forEach(function (w) { if (!A.workoutValid(w)) return; const i = w.day - A.day0; if (i >= 0 && i < A.nDays) out[i] += w.durMin; }); return out; }, { dec: 0, group: 'activity', zeroOk: true });
    return defs;
  };
})();
