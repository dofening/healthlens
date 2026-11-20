/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 洞察引擎：跨指标的关联、趋势变化、作息规律、异常日子
 * 只陈述数据里看到的“伴随关系”，不推断因果；每条都带样本量和相关系数。 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, S = HL.S, A = HL.A, CH = HL.CH, UI = HL.UI, CAT = HL.CAT;
  const DAY = 86400000;
  const INS = HL.INS = {};

  function table(d0, d1) {
    return A.memo('ins-table|' + A.settings.dedup + A.settings.excludeUserEntered, function () {
      const defs = A.metricDefs(); const vals = {}; defs.forEach(function (d) { vals[d.key] = d.fn(); });
      return { defs: defs, vals: vals, byKey: defs.reduce(function (o, d) { o[d.key] = d; return o; }, {}) };
    });
  }
  INS.table = table;
  function slice(arr, d0, d1, shift) { const out = []; for (let d = d0; d <= d1; d++) { const i = d - A.day0 + (shift || 0); out.push(i >= 0 && i < arr.length ? arr[i] : NaN); } return out; }
  function strength(r) { const a = Math.abs(r); return a >= 0.5 ? '强' : a >= 0.3 ? '中等' : '弱'; }
  function fmtV(def, v) {
    if (!(v === v)) return '—';
    if (def.clock) return T.clock(v + 18 * 60);
    if (def.clockWake) return T.clock(v);
    if (def.unit === '小时') return T.dur(v * 3600);
    return N.fix(v, def.dec || 0) + (def.unit ? ' ' + def.unit : '');
  }
  function fmtDiff(def, v) {
    if (!(v === v)) return '—';
    if (def.clock || def.clockWake) return T.dur(Math.abs(v) * 60);
    if (def.unit === '小时') return T.dur(Math.abs(v) * 3600);
    return N.fix(Math.abs(v), def.dec || 0) + (def.unit ? ' ' + def.unit : '');
  }
  INS.fmtV = fmtV;

  // 预设的假设对：[A, B, B 相对 A 的天数偏移, 描述 A 的短语, 描述 B 的短语]
  const PAIRS = [
    ['steps', 'sleep', 1, '白天走得多', '当晚睡眠时长'],
    ['steps', 'deep', 1, '白天走得多', '当晚深睡占比'],
    ['exercise', 'sleep', 1, '锻炼分钟多', '当晚睡眠时长'],
    ['exercise', 'deep', 1, '锻炼分钟多', '当晚深睡占比'],
    ['workout', 'rhr', 1, '有体能训练', '第二天静息心率'],
    ['workout', 'hrv', 1, '有体能训练', '第二天心率变异性'],
    ['move', 'hrv', 1, '活动能量多', '第二天心率变异性'],
    ['sleep', 'rhr', 0, '前一晚睡得久', '当天静息心率'],
    ['sleep', 'hrv', 0, '前一晚睡得久', '当天心率变异性'],
    ['sleep', 'steps', 0, '前一晚睡得久', '当天步数'],
    ['sleep', 'walkhr', 0, '前一晚睡得久', '当天步行心率'],
    ['bed', 'sleep', 0, '睡得晚', '这一晚的睡眠时长'],
    ['bed', 'deep', 0, '睡得晚', '这一晚的深睡占比'],
    ['bed', 'steps', 0, '睡得晚', '第二天步数'],
    ['awake', 'rhr', 0, '夜里醒着的时间长', '当天静息心率'],
    ['daylight', 'sleep', 1, '白天晒得多（日光时间）', '当晚睡眠时长'],
    ['daylight', 'bed', 1, '白天晒得多', '当晚入睡时间'],
    ['listen', 'sleep', 1, '耳机听得多', '当晚睡眠时长'],
    ['listen', 'bed', 1, '耳机听得多', '当晚入睡时间'],
    ['envdb', 'hrv', 0, '环境更吵', '当天心率变异性'],
    ['wrist', 'rhr', 0, '手腕温度偏高', '当天静息心率'],
    ['resp', 'rhr', 0, '夜间呼吸频率偏高', '当天静息心率'],
    ['steps', 'speed', 0, '走得多', '当天步行速度'],
    ['hr', 'hrv', 0, '平均心率高', '当天心率变异性'],
    ['flights', 'walkhr', 0, '爬楼多', '当天步行心率']
  ];

  INS.correlations = function (d0, d1) {
    const tb = table(); const out = [];
    PAIRS.forEach(function (p) {
      const da = tb.byKey[p[0]], db = tb.byKey[p[1]]; if (!da || !db) return;
      let xa = slice(tb.vals[p[0]], d0, d1, 0), xb = slice(tb.vals[p[1]], d0, d1, p[2]);
      if (da.zeroOk) { // 训练时长：0 也是有效值，但只在有心率/睡眠数据的日子比较
        xa = xa.map(function (v, i) { return xb[i] === xb[i] ? (v === v ? v : 0) : NaN; });
      }
      const sp = S.spearman(xa, xb);
      if (!(sp.n >= 20) || !isFinite(sp.r)) return;
      // 分组对比：A 的前 1/3 与后 1/3
      const pairs = []; for (let i = 0; i < xa.length; i++) if (xa[i] === xa[i] && xb[i] === xb[i]) pairs.push([xa[i], xb[i], d0 + i]);
      let hiG, loG, splitTxt;
      if (da.zeroOk) { hiG = pairs.filter(function (q) { return q[0] > 0; }); loG = pairs.filter(function (q) { return q[0] === 0; }); splitTxt = ['有训练的日子', '没训练的日子']; }
      else { const s = pairs.slice().sort(function (a, b) { return a[0] - b[0]; }); const k = Math.floor(s.length / 3); loG = s.slice(0, k); hiG = s.slice(s.length - k); splitTxt = [p[3].replace(/^(.*)$/, '$1的 1/3 日子'), '最少的 1/3']; }
      if (hiG.length < 6 || loG.length < 6) return;
      const wt = S.welch(hiG.map(function (q) { return q[1]; }), loG.map(function (q) { return q[1]; }));
      out.push({ a: da, b: db, shift: p[2], pa: p[3], pb: p[4], r: sp.r, n: sp.n, p: sp.p, hi: wt.ma, lo: wt.mb, diff: wt.diff, pDiff: wt.p, hiN: hiG.length, loN: loG.length, pairs: pairs, split: splitTxt });
    });
    return out;
  };

  INS.generate = function (d0, d1) {
    const list = [];
    const tb = table();
    // 1. 关联
    INS.correlations(d0, d1).forEach(function (c) {
      const sig = c.p < 0.05 && Math.abs(c.r) >= 0.15;
      if (!sig) return;
      const up = c.r > 0;
      const better = c.b.key === 'rhr' || c.b.key === 'walkhr' || c.b.key === 'awake' ? !up : (c.b.key === 'bed' ? !up : up);
      const t2 = c.b.clock ? (up ? '往往更晚' : '往往更早') : c.b.unit === '小时' ? (up ? '往往更长' : '往往更短') : (up ? '往往更高' : '往往更低');
      const ttl = c.pa + '的日子，' + c.pb + t2;
      const txt = (c.a.zeroOk ? '有训练的 ' + c.hiN + ' 天里，' : c.pa.replace('得多', '得最多').replace('得久', '得最久').replace('得晚', '得最晚').replace('多', '最多') + '的 ' + c.hiN + ' 天里，') + c.pb + '平均 ' + fmtV(c.b, c.hi) + '；' + (c.a.zeroOk ? '没训练的 ' + c.loN + ' 天' : '最少的 ' + c.loN + ' 天') + '平均 ' + fmtV(c.b, c.lo) + '，相差 ' + fmtDiff(c.b, c.diff) + '。';
      list.push({ kind: 'corr', title: ttl, text: txt, color: (CAT.DOMAINS[c.b.group] || CAT.DOMAINS.other).color, score: Math.abs(c.r) * Math.log10(c.n), tags: ['相关系数 ' + N.fix(c.r, 2) + '（' + strength(c.r) + '）', c.n + ' 天配对数据', c.p < 0.001 ? 'p < 0.001' : 'p = ' + N.fix(c.p, 3)], corr: c });
    });
    // 2. 趋势：最近 90 天 vs 之前 90 天
    const span = d1 - d0 + 1;
    if (span >= 150) {
      const w = Math.min(90, Math.floor(span / 2));
      ['steps', 'rhr', 'hrv', 'sleep', 'speed', 'walkhr', 'resp', 'listen', 'daylight', 'bed'].forEach(function (k) {
        const def = tb.byKey[k]; if (!def) return;
        const a = slice(tb.vals[k], d1 - w + 1, d1).filter(function (v) { return v === v; }), b = slice(tb.vals[k], d1 - 2 * w + 1, d1 - w).filter(function (v) { return v === v; });
        if (a.length < 20 || b.length < 20) return;
        const wt = S.welch(a, b); if (!(wt.p < 0.01)) return;
        const rel = wt.mb ? wt.diff / Math.abs(wt.mb) : 0; if (Math.abs(rel) < 0.04 && !def.clock) return;
        const up = wt.diff > 0;
        const verb = def.clock ? (up ? '推迟了' : '提前了') : (up ? '升高了' : '降低了');
        list.push({ kind: 'trend', title: '最近 ' + w + ' 天，' + def.name + verb + ' ' + fmtDiff(def, wt.diff), text: '最近 ' + w + ' 天平均 ' + fmtV(def, wt.ma) + '（' + a.length + ' 天有数据），再往前 ' + w + ' 天平均 ' + fmtV(def, wt.mb) + '（' + b.length + ' 天）。', color: (CAT.DOMAINS[def.group] || CAT.DOMAINS.other).color, score: 1.2 + Math.min(1.5, Math.abs(wt.t || 0) / 6), tags: [def.clock ? '' : N.signed(rel * 100, 0) + '%', (wt.p < 0.001 ? 'p < 0.001' : 'p = ' + N.fix(wt.p, 3))].filter(Boolean), trend: { key: k, w: w } });
      });
    }
    // 3. 星期规律
    const wk = function (k) { const def = tb.byKey[k]; if (!def) return null; const sums = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0]; for (let d = d0; d <= d1; d++) { const v = tb.vals[k][d - A.day0]; if (v === v) { const w = T.weekdayIdx(d); sums[w] += v; cnt[w]++; } } return sums.map(function (s, i) { return cnt[i] >= 4 ? s / cnt[i] : NaN; }); };
    const st = wk('steps');
    if (st && st.filter(function (v) { return v === v; }).length === 7) {
      let mx = 0, mn = 0; st.forEach(function (v, i) { if (v > st[mx]) mx = i; if (v < st[mn]) mn = i; });
      if (st[mx] > st[mn] * 1.15) list.push({ kind: 'week', title: T.WEEK_MON[mx] + '走得最多，' + T.WEEK_MON[mn] + '走得最少', text: T.WEEK_MON[mx] + '平均 ' + N.int(st[mx]) + ' 步，' + T.WEEK_MON[mn] + '平均 ' + N.int(st[mn]) + ' 步，差 ' + N.pct(st[mx] / st[mn] - 1) + '。', color: CAT.DOMAINS.activity.color, score: 1.1, tags: ['按星期几平均'], week: { key: 'steps', vals: st } });
    }
    const ss = A.sleepStats(d0, d1);
    if (ss.measured >= 14 && isFinite(ss.jetlag) && Math.abs(ss.jetlag) >= 30) {
      list.push({ kind: 'jetlag', title: '周末的睡眠中点比工作日' + (ss.jetlag > 0 ? '晚 ' : '早 ') + T.dur(Math.abs(ss.jetlag) * 60), text: '这在睡眠研究里叫「社会时差」：工作日睡眠中点约 ' + T.clock(ss.midWeekday + 1080) + '，周末约 ' + T.clock(ss.midWeekend + 1080) + '。差得越多，周一越像倒时差。', color: CAT.DOMAINS.sleep.color, score: 1.3 + Math.abs(ss.jetlag) / 120, tags: ['周五、周六晚上按周末算', ss.measured + ' 晚'] });
    }
    if (ss.measured >= 10 && isFinite(ss.bedStd)) {
      list.push({ kind: 'regular', title: '一半的夜晚在 ' + T.clock(ss.bedQ1 + 1080) + '–' + T.clock(ss.bedQ3 + 1080) + ' 之间睡着', text: '通常 ' + T.clock(ss.bed + 1080) + ' 睡着、' + T.clock(ss.wake) + ' 醒来，入睡时间的标准差是 ' + T.dur(ss.bedStd * 60) + '。' + (isFinite(ss.sri) ? '睡眠规律性指数（SRI）' + N.fix(ss.sri, 0) + '：100 表示每天同一时刻都处在同样的睡/醒状态，研究中成年人常见 60–85。' : ''), color: CAT.DOMAINS.sleep.color, score: 1.0, tags: [ss.measured + ' 晚有效记录'] });
    }
    // 4. 一天中最活跃的时段
    if (A.has(A.Q('StepCount'))) {
      const sst = A.stats(A.Q('StepCount'), d0, d1);
      if (sst && sst.hour) { let mx = 0; for (let i = 0; i < 24; i++) if (sst.hour[i] > sst.hour[mx]) mx = i; const tot = S.sum(sst.hour); let eve = 0; for (let i = 18; i < 24; i++) eve += sst.hour[i]; list.push({ kind: 'hour', title: '一天里最常走路的是 ' + mx + ':00–' + (mx + 1) + ':00', text: '这个小时平均 ' + N.int(sst.hour[mx]) + ' 步；晚上 6 点以后走的步数占全天 ' + N.pct(eve / tot) + '。', color: CAT.DOMAINS.activity.color, score: 0.9, tags: ['每小时平均'] }); }
    }
    // 5. 耳机音量：WHO 安全收听剂量（80 dB 每周 40 小时）
    if (A.has(A.Q('HeadphoneAudioExposure'))) {
      const ad = A.audioDaily(A.Q('HeadphoneAudioExposure'));
      let weeks = 0, over = 0, worst = null;
      for (let ws = A.range.d0 - T.weekdayIdx(A.range.d0); ws <= d1; ws += 7) {
        let dose = 0, secs = 0;
        for (let d = ws; d < ws + 7; d++) { const i = d - A.day0; if (i < 0 || i >= A.nDays || d < d0 || d > d1) continue; dose += ad.energy[i] / Math.pow(10, 8); secs += ad.secs[i]; }
        if (secs < 3600) continue;
        const pct = dose / (40 * 3600); weeks++; if (pct > 1) over++;
        if (!worst || pct > worst.pct) worst = { pct: pct, ws: ws, secs: secs };
      }
      if (weeks >= 4) list.push({ kind: 'dose', title: over ? weeks + ' 周里有 ' + over + ' 周耳机音量超过了安全剂量' : '耳机音量一直在安全剂量以内', text: '按世界卫生组织的安全收听标准（相当于 80 dB 每周 40 小时）计算每周的声音剂量。剂量最高的是 ' + T.date(worst.ws * DAY) + ' 那一周，达到标准的 ' + N.pct(worst.pct) + '（那周戴了 ' + T.dur(worst.secs) + '）。', color: CAT.DOMAINS.hearing.color, score: over ? 1.6 : 0.8, tags: ['按时长加权', weeks + ' 周有数据'] });
    }
    // 6. 静息心率异常日
    const an = INS.anomalies(d0, d1);
    if (an.rhrHigh.length) list.push({ kind: 'anom', title: an.rhrHigh.length + ' 天的静息心率明显高于你平时', text: '以你前 30 天的均值和波动为基准，这些天高出 2 个标准差以上：' + an.rhrHigh.slice(-5).map(function (x) { return T.md(x.day * DAY) + '（' + N.int(x.v) + '，平时 ' + N.int(x.base) + '）'; }).join('、') + '。生病、喝酒、熬夜、压力大的时候常出现这种情况。', color: CAT.DOMAINS.heart.color, score: 1.25, tags: ['个人基准线'] });
    if (an.wristHigh.length) list.push({ kind: 'anom', title: an.wristHigh.length + ' 晚的手腕温度比平时高 0.5 °C 以上', text: '最近几次：' + an.wristHigh.slice(-5).map(function (x) { return T.md(x.day * DAY) + '（+' + N.fix(x.v - x.base, 2) + ' °C）'; }).join('、') + '。以前 30 晚的中位数为基准。', color: CAT.DOMAINS.sleep.color, score: 1.15, tags: ['个人基准线'] });
    if (an.spo2Low) list.push({ kind: 'anom', title: '有 ' + an.spo2Low.n + ' 次血氧读数低于 90%', text: '占全部血氧测量的 ' + N.pct(an.spo2Low.n / an.spo2Low.tot, 1) + '，大多在 ' + an.spo2Low.when + '。手表戴得松、手腕动作、寒冷都会让读数偏低，单次低值不必紧张，持续偏低再关注。', color: CAT.DOMAINS.resp.color, score: 0.95, tags: [an.spo2Low.tot + ' 次测量'] });
    // 7. 数据质量
    const q = INS.quality();
    if (q.dupRecords > 0 || q.dupWorkouts > 0) list.push({ kind: 'quality', title: '导出文件里有 ' + N.int(q.dupRecords) + ' 条完全重复的记录' + (q.dupWorkouts ? '、' + q.dupWorkouts + ' 条重复的体能训练' : ''), text: '主要来自：' + q.topDupSources.map(function (x) { return x[0] + '（' + N.int(x[1]) + ' 条）'; }).join('、') + '。统计时已经去掉；手机上的「健康」App 不会提示这类重复。', color: CAT.DOMAINS.other.color, score: 1.4, tags: ['已自动处理'] });
    list.sort(function (a, b) { return b.score - a.score; });
    return list;
  };

  INS.top = function (list, n) { // 各类型轮流挑，避免首页全是同一种
    const out = [], used = {};
    for (let round = 0; out.length < n && round < 4; round++) list.forEach(function (it) { if (out.length >= n || out.indexOf(it) >= 0) return; if ((used[it.kind] || 0) > round) return; used[it.kind] = (used[it.kind] || 0) + 1; out.push(it); });
    return out;
  };

  INS.anomalies = function (d0, d1) {
    return A.memo('anom|' + d0 + '|' + d1, function () {
      const out = { rhrHigh: [], hrvLow: [], wristHigh: [], spo2Low: null };
      const base = function (arr, d, win) { const v = []; for (let k = d - win; k < d; k++) { const i = k - A.day0; if (i >= 0 && arr[i] === arr[i]) v.push(arr[i]); } return v; };
      if (A.has(A.Q('RestingHeartRate'))) {
        const r = A.dailyValues(A.Q('RestingHeartRate'));
        for (let d = d0; d <= d1; d++) { const v = r[d - A.day0]; if (!(v === v)) continue; const b = base(r, d, 30); if (b.length < 10) continue; const m = S.mean(b), s = S.std(b); if (v > m + 2 * Math.max(s, 1.5)) out.rhrHigh.push({ day: d, v: v, base: m }); }
      }
      if (A.has(A.Q('AppleSleepingWristTemperature'))) {
        const r = A.dailyValues(A.Q('AppleSleepingWristTemperature'));
        for (let d = d0; d <= d1; d++) { const v = r[d - A.day0]; if (!(v === v)) continue; const b = base(r, d, 30); if (b.length < 10) continue; const m = S.q(b.slice().sort(function (x, y) { return x - y; }), 0.5); if (v - m >= 0.5) out.wristHigh.push({ day: d, v: v, base: m }); }
      }
      if (A.has(A.Q('OxygenSaturation'))) {
        const t = A.t(A.Q('OxygenSaturation')); const ab = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
        let n = 0, tot = 0; const hours = new Array(24).fill(0);
        for (let i = ab[0]; i < ab[1]; i++) { tot++; if (A.val(t, i) < 90) { n++; hours[Math.floor((t.s[i] % DAY) / 3600000)]++; } }
        if (n) { let night = 0; for (let hh = 0; hh < 24; hh++) if (hh < 7 || hh >= 23) night += hours[hh]; out.spo2Low = { n: n, tot: tot, when: night / n > 0.5 ? '夜里睡觉时' : '白天' }; }
      }
      return out;
    });
  };

  INS.quality = function () {
    return A.memo('quality', function () {
      const ds = A.ds; let dup = 0, ue = 0; const bySrc = {}, ueSrc = {};
      ds.types.forEach(function (t) { dup += t.dup; ue += t.userEntered; Object.keys(t.dupBySrc || {}).forEach(function (s) { bySrc[s] = (bySrc[s] || 0) + t.dupBySrc[s]; }); Object.keys(t.ueBySrc || {}).forEach(function (s) { ueSrc[s] = (ueSrc[s] || 0) + t.ueBySrc[s]; }); });
      const top = Object.keys(bySrc).map(function (s) { return [ds.sources[s].name, bySrc[s]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
      const ueTop = Object.keys(ueSrc).map(function (s) { return [ds.sources[s].name, ueSrc[s]]; }).sort(function (a, b) { return b[1] - a[1]; });
      return { dupRecords: dup, userEntered: ue, dupWorkouts: ds.workoutDup || 0, topDupSources: top, ueSources: ueTop, dupBySrc: bySrc };
    });
  };

  // 洞察卡片
  INS.card = function (it, withViz) {
    const el = h('div', { class: 'ins', style: { '--c': it.color } }, h('div', { class: 'bar' }), h('div', null, h('h4', { text: it.title }), h('p', { text: it.text }), h('div', { class: 'meta' }, it.tags.map(function (t) { return h('span', { class: 'tag', text: t }); }))));
    if (withViz && it.corr) {
      const box = UI.chartBox(); box.style.marginTop = '10px'; el.lastChild.appendChild(box);
      const c = it.corr;
      new CH.Scatter(box, { x: c.pairs.map(function (q) { return q[0]; }), y: c.pairs.map(function (q) { return q[1]; }), color: it.color, fit: true, xLabel: c.a.name + (c.a.unit && !c.a.clock ? '（' + c.a.unit + '）' : ''), yLabel: c.pb + (c.b.unit && !c.b.clock ? '（' + c.b.unit + '）' : ''),
        xFmt: c.a.clock ? function (v) { return T.clock(v + 1080); } : c.a.clockWake ? T.clock : N.axis, yFmt: c.b.clock ? function (v) { return T.clock(v + 1080); } : c.b.clockWake ? T.clock : N.axis,
        xStep: c.a.clock || c.a.clockWake ? 120 : undefined, yStep: c.b.clock || c.b.clockWake ? 120 : undefined,
        tip: function (i, e2) { const q = c.pairs[i]; CH.tt.head(e2, T.date(q[2] * DAY, { week: true })); CH.tt.row(e2, it.color, fmtV(c.b, q[1]), c.pb); CH.tt.row(e2, null, fmtV(c.a, q[0]), c.a.name); } }, { height: 220 });
    }
    return el;
  };
})();
