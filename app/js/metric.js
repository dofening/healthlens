/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 通用指标面板：任何一种数据类型都能自动选对统计方式和图表
 *   累计量（步数/能量…）→ 每日总量柱 + 7 日均线、最佳日/周/月、日历热力、时段分布
 *   测量值（心率/血氧…）→ 每日范围带 + 均值线、分布直方图、最高/最低出现时刻
 *   声压级（耳机/环境）→ 能量平均 dB、收听时长
 *   事件（洗手/通知…）→ 次数、时长、发生时段
 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, S = HL.S, C = HL.C, CH = HL.CH, UI = HL.UI, A = HL.A, CAT = HL.CAT;
  const DAY = 86400000;
  const M = HL.M = {};

  function colorOf(t) { return (CAT.DOMAINS[t.def.dom] || CAT.DOMAINS.other).color; }
  M.colorOf = colorOf;
  M.unit = function (t) { return t.disp.unit || ''; };
  M.fmt = function (t) { return UI.fmtType(t); };
  M.withUnit = function (t, v) { const u = M.unit(t); return M.fmt(t)(v) + (u ? ' ' + u : ''); };

  // 主图数据
  M.seriesFor = function (t, d0, d1, gran, sumMode) {
    const kind = t.def.kind, col = colorOf(t);
    if (kind === 'sum' || kind === 'stand' || kind === 'event' || (kind === 'audio' && sumMode === 'time')) {
      let daily;
      if (kind === 'sum') daily = A.dailyValues(t.id);
      else if (kind === 'stand') daily = A.dailyValues(t.id);
      else if (kind === 'event') daily = A.dailyValues(t.id);
      else daily = A.dailyValues(t.id, 'secs');
      const mode = gran === 'day' ? 'sum' : (sumMode === 'total' ? 'sum' : 'avg');
      const ro = A.rollup(daily, d0, d1, gran, mode);
      const series = [{ name: gran === 'day' ? '当天' : (mode === 'sum' ? '合计' : '日均'), color: col, type: 'bar', y: ro.y }];
      if (gran === 'day' && ro.y.length > 14) series.push({ name: '7 日平均', color: '#edf1f7', type: 'line', y: Array.from(S.movingAvg(ro.y.map(function (v) { return v === v ? v : (kind === 'event' ? 0 : NaN); }), 7)), width: 1.5, markers: false, dim: true });
      return { x: ro.x, gran: gran, series: series, zero: true };
    }
    if (kind === 'audio') {
      const ad = A.audioDaily(t.id);
      if (gran === 'day') {
        const ro = A.rollup(ad.laeq, d0, d1, 'day', 'avg', null, ad.max);
        return { x: ro.x, gran: gran, series: [{ name: '当天能量平均', color: col, type: 'line', y: ro.y }, { name: '当天最响', color: col, type: 'dots', y: ro.hi, r: 1.8, noTip: false }], zero: false };
      }
      // 周/月：按时长重新做能量平均
      const xs = [], ys = [], his = [];
      const ro = A.rollup(ad.secs, d0, d1, gran, 'sum');
      ro.x.forEach(function (x0, k) {
        const x1 = k + 1 < ro.x.length ? ro.x[k + 1] - 1 : d1;
        let s = 0, e = 0, mx = NaN;
        for (let d = Math.max(x0, d0); d <= x1; d++) { const i = d - A.day0; if (ad.secs[i]) { s += ad.secs[i]; e += ad.energy[i]; if (!(mx >= ad.max[i])) mx = ad.max[i]; } }
        xs.push(x0); ys.push(A.laeq(s, e)); his.push(mx);
      });
      return { x: xs, gran: gran, series: [{ name: '能量平均', color: col, type: 'line', y: ys }, { name: '最响', color: col, type: 'dots', y: his, r: 2 }], zero: false };
    }
    // 测量值
    const ad = A.avgDaily(t.id);
    const ro = A.rollup(ad.mean, d0, d1, gran, 'avg', ad.min, ad.max);
    let nS = 0; for (let d = d0; d <= d1; d++) nS += ad.cnt[d - A.day0];
    const dense = nS / Math.max(1, ro.x.length) > 20;
    let bandName = '最低–最高';
    if (dense) { // 每个周期内样本的 10%–90%，比最低最高更能代表“平常”
      bandName = '10%–90% 范围';
      const k = t.disp.k, bb = t.disp.b;
      ro.x.forEach(function (x0, i) {
        const x1 = i + 1 < ro.x.length ? ro.x[i + 1] : d1 + 1;
        const ab = A.idxRange(t, Math.max(x0, d0) * DAY, Math.min(x1, d1 + 1) * DAY);
        const vals = []; for (let j = ab[0]; j < ab[1]; j++) if (!(t.fl[j] & 2) && t.v[j] === t.v[j]) vals.push(t.v[j] * k + bb);
        vals.sort(function (a, b) { return a - b; });
        ro.lo[i] = vals.length >= 5 ? S.q(vals, 0.1) : NaN; ro.hi[i] = vals.length >= 5 ? S.q(vals, 0.9) : NaN;
      });
    }
    // 均值要按样本加权
    if (gran !== 'day') {
      ro.x.forEach(function (x0, k) {
        const x1 = k + 1 < ro.x.length ? ro.x[k + 1] - 1 : d1; let s = 0, c = 0;
        for (let d = Math.max(x0, d0); d <= x1; d++) { const i = d - A.day0; s += ad.sum[i]; c += ad.cnt[i]; }
        ro.y[k] = c ? s / c : NaN;
      });
    }
    let valid = 0, multi = 0; for (let i = 0; i < ro.y.length; i++) if (ro.y[i] === ro.y[i]) { valid++; if (ro.hi[i] > ro.lo[i]) multi++; }
    const series = [];
    if (multi > valid * 0.3) series.push({ name: bandName, color: col, type: 'band', lo: ro.lo, hi: ro.hi, alpha: 0.2 });
    series.push({ name: gran === 'day' ? '当天平均' : '平均', color: col, type: 'line', y: ro.y, connect: valid < 80, markers: valid <= 60 });
    const out = { x: ro.x, gran: gran, series: series, zero: false };
    if (M.unit(t) === '%') { let mx = -Infinity; ro.hi.concat(ro.y).forEach(function (v) { if (v > mx) mx = v; }); if (mx <= 100) out.yCap = 100; }
    return out;
  };

  // 读数
  M.readoutsFor = function (t, st, full) {
    const kind = t.def.kind, f = M.fmt(t), u = M.unit(t), col = colorOf(t);
    const items = [];
    const when = function (ms) { return T.dt(ms); };
    if (!st || !st.records) return items;
    if (kind === 'sum') {
      const ft = function (v) { return st.total >= 1e5 ? N.cn(v) : st.total >= 100 ? N.int(v) : f(v); };
      items.push({ k: '合计', v: st.total, fmt: ft, u: u, s: st.days + ' 天有记录', big: full });
      items.push({ k: '日均', v: st.perDay, fmt: f, u: u, s: '中位数 ' + f(st.median) });
      items.push({ k: '最多的一天', v: st.max.v, fmt: f, u: u, s: T.date(st.max.day * DAY, { week: true }) });
      if (st.bestWeek) items.push({ k: '最多的一周', v: st.bestWeek.v, fmt: function (v) { return v >= 1e5 ? N.cn(v) : v >= 100 ? N.int(v) : f(v); }, u: u, s: T.date(st.bestWeek.day * DAY) + ' 起' });
      if (st.bestMonth && full) items.push({ k: '最多的一个月', v: st.bestMonth.v, fmt: function (v) { return v >= 1e5 ? N.cn(v) : f(v); }, u: u, s: T.ym(st.bestMonth.day * DAY) });
      if (full) items.push({ k: '最少的一天', v: st.min.v, fmt: f, u: u, s: st.min.day >= 0 ? T.date(st.min.day * DAY) : '' });
      if (st.trend && full) { const per = st.trend.b * 30; items.push({ k: '趋势（每 30 天）', text: N.signed(per, t.def.dec), u: u, s: '线性拟合 ' + st.trend.n + ' 天' }); }
    } else if (kind === 'audio') {
      items.push({ k: '能量平均', v: st.laeq, fmt: function (v) { return N.fix(v, 1); }, u: 'dB', s: '按时长加权', big: full });
      items.push({ k: '累计时长', text: st.secs >= 172800 ? N.int(st.secs / 3600) : T.dur(st.secs), u: st.secs >= 172800 ? '小时' : '', s: st.days + ' 天有记录' });
      items.push({ k: '日均时长', text: T.dur(st.perDaySecs), s: '有记录的日子' });
      items.push({ k: '≥80 dB 的时间', text: N.pct(st.over80, 1), s: '≥90 dB ' + N.pct(st.over90, 1) });
      items.push({ k: '最响', v: st.max.v, fmt: function (v) { return N.fix(v, 1); }, u: 'dB', s: when(st.max.t) });
      if (full) items.push({ k: '最安静', v: st.min.v, fmt: function (v) { return N.fix(v, 1); }, u: 'dB', s: when(st.min.t) });
    } else if (kind === 'event') {
      items.push({ k: '次数', v: st.count, fmt: N.int, u: '次', s: st.days + ' 天有记录', big: full });
      if (st.secs > 0) { items.push({ k: '累计时长', text: T.dur(st.secs) }); items.push({ k: '平均每次', text: T.dur(st.avgSecs, { sec: true }), s: '最长 ' + T.dur(st.maxSecs, { sec: true }) }); }
      items.push({ k: '第一次', text: T.md(st.firstT), s: T.year(st.firstT) + '年 ' + T.hm(st.firstT) });
      items.push({ k: '最近一次', text: T.md(st.lastT), s: T.year(st.lastT) + '年 ' + T.hm(st.lastT) });
    } else if (kind === 'stand') {
      items.push({ k: '日均站立', v: st.perDay, fmt: function (v) { return N.fix(v, 1); }, u: '小时', s: st.days + ' 天有记录', big: full });
      items.push({ k: '最多的一天', v: st.max.v, fmt: N.int, u: '小时', s: st.max.day >= 0 ? T.date(st.max.day * DAY) : '' });
      items.push({ k: '累计', v: st.total, fmt: N.int, u: '小时' });
    } else {
      const isPct = u === '%';
      items.push({ k: '平均', v: st.mean, fmt: f, u: u, s: N.int(st.n) + ' 次测量' + (full ? '' : ' · 中位数 ' + f(st.median)), big: full });
      if (full) items.push({ k: '中位数', v: st.median, fmt: f, u: u, s: '一半的测量低于它' });
      items.push({ k: '最高', v: st.max.v, fmt: f, u: u, s: when(st.max.t) });
      items.push({ k: '最低', v: st.min.v, fmt: f, u: u, s: when(st.min.t) });
      if (st.latest) items.push({ k: '最近一次', v: st.latest.v, fmt: f, u: u, s: when(st.latest.t) });
      if (!full && items.length > 4) items.splice(4);
      if (full) {
        items.push({ k: '常见范围（5%–95%）', text: f(st.p5) + '–' + f(st.p95), u: u, s: '标准差 ' + f(st.std) });
        if (st.trend) { const per = st.trend.b * 30; items.push({ k: '趋势（每 30 天）', text: N.signed(per, Math.max(1, t.def.dec)), u: u, s: '基于 ' + st.trend.n + ' 天的日均' }); }
        if (st.first) items.push({ k: '第一次测量', v: st.first.v, fmt: f, u: u, s: when(st.first.t) });
      }
      if (isPct && t.id === A.Q('AtrialFibrillationBurden')) items.forEach(function (it) { if (it.v === 2 || (typeof it.v === 'number' && it.v <= 2.0001 && it.v >= 1.9999)) { it.text = '<2'; it.v = undefined; } });
    }
    return items;
  };

  // 主图（紧凑面板和完整页面共用）：只画这个类型实际有数据的时段
  M.mainChart = function (box, acts, t, opt) {
    opt = opt || {};
    const r = A.range, kind = t.def.kind, col = colorOf(t);
    const ext = A.extent(t.id, r.d0, r.d1);
    if (!ext) { box.appendChild(UI.empty('这个时间范围内没有数据')); return null; }
    const d0 = ext[0], d1 = ext[1];
    const st = opt.st || A.stats(t.id, r.d0, r.d1);
    const nPts = kind === 'event' ? st.count : st.n;
    const sparse = (kind === 'avg' || kind === 'event') && nPts < 60;
    if (sparse) {
      const ab = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY), ts = [], vs = [], notes = [];
      const k = t.disp.k, bb = t.disp.b;
      for (let i = ab[0]; i < ab[1]; i++) {
        if (t.fl[i] & 2) continue;
        ts.push(t.s[i]);
        if (kind === 'event') { vs.push(t.d[i] / 60); notes.push(A.catLabel(t, t.v[i])); }
        else { vs.push(t.v[i] * k + bb); notes.push(t.fl[i] & 16 ? '低于可检测下限（导出值为下限）' : (A.ds.sources[t.src[i]] || {}).name || ''); }
      }
      const span = Math.max(ts[ts.length - 1] - ts[0], DAY), pad = Math.max(DAY * 0.6, span * 0.05);
      const f = kind === 'event' ? function (v) { return T.dur(v * 60, { sec: true }); } : M.fmt(t);
      const name = kind === 'event' ? '持续时长' : t.def.name;
      const lines = [];
      if (kind !== 'event' && ts.length > 1) lines.push({ name: name, color: col, t: ts, v: vs, gap: 1e15, width: 1.5, dim: true });
      lines.push({ name: name, color: col, t: ts, v: vs, dots: true, r: 4, ring: true, unit: kind === 'event' ? '' : M.unit(t), notes: notes });
      return new CH.Intraday(box, { t0: ts[0] - pad, t1: ts[ts.length - 1] + pad, lines: lines, dateAxis: true, fmt: f, yFmt: kind === 'event' ? function (v) { return N.axis(v) + '分'; } : N.axis }, { height: opt.height || 210 });
    }
    let gran = opt.gran || A.autoGran(d0, d1), sumMode = 'avg';
    const chart = new CH.TimeChart(box, null, { height: opt.height || 210 });
    const data = function () {
      const d = M.seriesFor(t, d0, d1, gran, sumMode);
      d.fmt = M.fmt(t); d.markMax = (kind === 'sum' || kind === 'stand') && gran !== 'day';
      if (opt.goal && (gran === 'day' || sumMode !== 'total')) d.goal = opt.goal;
      if (opt.onPick) d.onPick = function (i, day) { opt.onPick(day, gran); };
      return d;
    };
    chart.update(data());
    if (acts) {
      let mt = null;
      const g = UI.seg([{ v: 'day', label: '日' }, { v: 'week', label: '周' }, { v: 'month', label: '月' }, { v: 'year', label: '年' }], gran, function (v) { gran = v; chart.update(data()); if (mt) mt.style.display = gran === 'day' ? 'none' : ''; }, 'sm');
      if (kind === 'sum' || kind === 'event' || kind === 'stand') { mt = UI.seg([{ v: 'avg', label: '日均' }, { v: 'total', label: '合计' }], sumMode, function (v) { sumMode = v; chart.update(data()); }, 'sm'); acts.appendChild(mt); if (gran === 'day') mt.style.display = 'none'; }
      acts.appendChild(g);
    }
    return chart;
  };

  // 紧凑面板（用于各板块页面）
  M.panel = function (id, opt) {
    opt = opt || {};
    const t = A.t(id); if (!t || !t.n) return null;
    const r = A.range, col = colorOf(t);
    const st = A.stats(id, r.d0, r.d1);
    const title = opt.title || t.def.name;
    const p = UI.panel(title, { color: col, hint: (M.unit(t) ? M.unit(t) + ' · ' : '') + N.int(t.n) + ' 条', desc: opt.desc === false ? null : (opt.desc || t.def.desc), span: opt.span || 12 });
    if (!st.records) { p.body.appendChild(UI.empty('这个时间范围内没有「' + t.def.name + '」的数据。全部记录在 ' + T.date(t.s[0]) + ' – ' + T.date(t.s[t.n - 1]) + ' 之间。')); return p.el; }
    p.body.appendChild(UI.readouts(M.readoutsFor(t, st, false), { tight: true, unitInHint: M.unit(t) }));
    const box = UI.chartBox(); box.style.marginTop = '14px';
    p.body.appendChild(box);
    M.mainChart(box, p.acts, t, { st: st, height: opt.height, goal: opt.goal, gran: opt.gran, onPick: opt.onPick });
    if (opt.more !== false) {
      const more = h('button', { class: 'btn ghost sm', type: 'button', text: '全部细节' });
      more.addEventListener('click', function () { HL.App.go('explore', { type: id }); });
      p.acts.appendChild(more);
    }
    if (opt.extra) opt.extra(p.body, st, t);
    return p.el;
  };

  // 完整页面（全部数据浏览器）
  M.full = function (root, id) {
    const t = A.t(id); if (!t) { root.appendChild(UI.empty('没有找到这个数据类型')); return; }
    const r = A.range, col = colorOf(t), kind = t.def.kind;
    const st = A.stats(id, r.d0, r.d1);
    const dom = CAT.DOMAINS[t.def.dom] || CAT.DOMAINS.other;
    const head = h('div', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('div', null,
        h('h2', null, h('span', { class: 'sw', style: { '--c': col } }), t.def.name, M.unit(t) ? h('span', { class: 'tag', text: M.unit(t) }) : null),
        h('p', { text: (t.def.desc || '') + (t.def.guessed ? '（这个类型不在内置目录里，名字由标识符生成）' : '') }),
        h('p', { class: 'note', text: dom.name + ' · ' + t.id + ' · 全部 ' + N.int(t.n) + ' 条，' + T.date(t.s[0]) + ' – ' + T.date(t.s[t.n - 1]) + '（跨度 ' + T.span((t.s[t.n - 1] - t.s[0]) / DAY + 1) + '）' })
      )));
    root.appendChild(head);
    if (kind === 'sleep') { const b = h('button', { class: 'btn', type: 'button', text: '打开睡眠页面' }); b.addEventListener('click', function () { HL.App.go('sleep'); }); head.appendChild(b); }
    if (!st.records) { root.appendChild(UI.empty('这个时间范围内没有记录。把上方时间范围切到「全部」可以看到 ' + T.date(t.s[0]) + ' 以来的数据。')); rawSection(root, t); return; }
    if (kind !== 'sleep') root.appendChild(UI.readouts(M.readoutsFor(t, st, true)));

    // 主图
    if (kind !== 'sleep') {
      const pnl = UI.panel('随时间变化', { hint: kind === 'sum' ? '柱：每日/每周期总量；白线：7 日平均' : kind === 'audio' ? '线：能量平均；点：当期最响' : kind === 'avg' ? '色带：当期常见范围；线：平均' : '' });
      pnl.el.style.marginTop = '18px';
      const box = UI.chartBox(); pnl.body.appendChild(box);
      M.mainChart(box, pnl.acts, t, { st: st, height: 280 });
      root.appendChild(pnl.el);
    }

    const grid = UI.grid(); grid.style.marginTop = '18px'; root.appendChild(grid);
    // 分布
    if (kind === 'avg' || kind === 'audio') {
      const p = UI.panel('数值分布', { span: 6, hint: st.n + ' 次测量' }); grid.appendChild(p.el);
      const b = UI.chartBox(); p.body.appendChild(b);
      const f = M.fmt(t);
      new CH.Histo(b, { sorted: st.sorted, color: col, fmt: f, unit: M.unit(t), marks: [{ v: st.p5, label: '5%' }, { v: st.median, label: '中位 ' + f(st.median) }, { v: st.p95, label: '95%' }] });
    } else if (kind === 'sum' || kind === 'stand') {
      const p = UI.panel('每日总量分布', { span: 6, hint: st.days + ' 天' }); grid.appendChild(p.el);
      const b = UI.chartBox(); p.body.appendChild(b);
      const f = M.fmt(t); const sorted = st.sorted || [];
      new CH.Histo(b, { sorted: Float64Array.from(sorted), color: col, fmt: N.axis, unit: M.unit(t), countFmt: function (c) { return N.int(c) + ' 天'; }, marks: [{ v: st.median, label: '中位 ' + f(st.median) }, { v: st.p90, label: '90% ' + f(st.p90) }] });
    }
    // 时段
    if (st.hour && kind !== 'stand') {
      const p = UI.panel(kind === 'sum' ? '一天中的分布（每小时平均）' : kind === 'event' ? '发生在几点' : kind === 'audio' ? '每小时平均收听分钟' : '一天中各时段的平均值', { span: 6 }); grid.appendChild(p.el);
      const b = UI.chartBox(); p.body.appendChild(b);
      const ys = Array.from(st.hour);
      const f = kind === 'audio' ? function (v) { return N.fix(v, 1); } : M.fmt(t);
      new CH.Bars(b, { labels: ys.map(function (_, i) { return i + ''; }), y: ys, color: col, every: 3, fmt: f, unit: kind === 'audio' ? '分钟' : M.unit(t), tip: function (i, el) { CH.tt.head(el, HL.pad(i) + ':00 – ' + HL.pad(i) + ':59'); CH.tt.row(el, col, ys[i] === ys[i] ? f(ys[i]) : '无数据', kind === 'audio' ? '分钟' : M.unit(t)); }, minMax: kind === 'avg' ? undefined : 0.0001 }, { height: 180 });
      if (kind === 'avg') { p.body.appendChild(UI.note('只统计有测量的时段；夜里的数据通常更少。')); }
    }
    if (st.week) {
      const p = UI.panel(kind === 'sum' || kind === 'stand' ? '星期几（日均）' : kind === 'event' ? '星期几（日均次数）' : '星期几（平均）', { span: 6 }); grid.appendChild(p.el);
      const b = UI.chartBox(); p.body.appendChild(b);
      const ys = Array.from(st.week), f = kind === 'audio' ? function (v) { return N.fix(v, 0) + ' 分钟'; } : M.fmt(t);
      new CH.Bars(b, { labels: T.WEEK_MON, y: ys, color: col, fmt: f, valueLabels: true, unit: kind === 'audio' ? '' : M.unit(t) }, { height: 180 });
    }
    // 日历
    if (kind === 'sum' || kind === 'event' || kind === 'stand' || kind === 'audio') {
      const p = UI.panel('日历', { span: 12, hint: '颜色越亮数值越高；点击某天可以在「总览」查看那天' }); grid.appendChild(p.el);
      const b = UI.chartBox(); p.body.appendChild(b);
      const vals = kind === 'audio' ? A.dailyValues(id, 'secs') : A.dailyValues(id);
      const f = kind === 'audio' ? function (v) { return T.dur(v * 60); } : function (v) { return M.fmt(t)(v) + (M.unit(t) ? ' ' + M.unit(t) : ''); };
      new CH.Calendar(b, { base: A.day0, vals: vals, d0: r.d0, d1: r.d1, ramp: C.ramp(col, 9), fmt: f, onPick: function (day) { HL.App.go('overview', { day: day }); } });
    }
    // 极值清单
    const ex = extremes(t, r.d0, r.d1, kind);
    if (ex) {
      const p = UI.panel(kind === 'sum' ? '最多与最少的日子' : '最高与最低的记录', { span: 12 }); grid.appendChild(p.el);
      const wrap = h('div', { class: 'grid' }); p.body.appendChild(wrap);
      const mk = function (title, rows) { const c = h('div', { class: 'c6' }); c.appendChild(h('div', { class: 'note', text: title, style: { marginBottom: '6px' } })); c.appendChild(UI.table([{ k: 'rank', label: '#', fmt: function (x) { return x.rank; } }, { k: 'v', label: '数值', n: true, fmt: function (x) { return x.v; } }, { k: 't', label: '时间', fmt: function (x) { return x.t; } }, { k: 'src', label: '来源', muted: true, fmt: function (x) { return x.src; } }], rows, { scroll: false })); wrap.appendChild(c); };
      mk(kind === 'sum' ? '最多的 8 天' : '最高的 8 次', ex.top); mk(kind === 'sum' ? '最少的 8 天（有记录的）' : '最低的 8 次', ex.bottom);
    }
    // 来源与设备
    const ps = UI.panel('数据来自哪里', { span: 6, hint: '按记录条数' }); grid.appendChild(ps.el);
    ps.body.appendChild(UI.barList(st.bySrc.slice(0, 10).map(function (e) { const s = A.ds.sources[e[0]]; return { name: s ? s.name : '?', sub: s ? A.SRC_CLASS[s.cls] : '', v: e[1], text: N.int(e[1]), unit: '条', color: col }; })));
    if (kind === 'sum' && st.credit) {
      const tot = S.sum(st.credit);
      if (tot > 0) {
        ps.body.appendChild(h('div', { class: 'note', style: { margin: '14px 0 6px' }, text: '去重后，每个来源实际计入的份额：' }));
        const rows = []; st.credit.forEach(function (v, i) { if (v > 0) rows.push({ name: A.ds.sources[i].name, v: v, text: N.pct(v / tot, 1), color: col }); });
        rows.sort(function (a, b) { return b.v - a.v; });
        ps.body.appendChild(UI.barList(rows));
        const raw = S.sum(st.rawBySrc);
        ps.body.appendChild(UI.note('所有来源直接相加是 ' + N.int(raw) + ' ' + M.unit(t) + '，去重后 ' + N.int(tot) + '。' + (st.dupTotal > 0 ? '另有完全重复的记录 ' + N.int(st.dupTotal) + ' 已忽略。' : '') + (st.ueTotal > 0 ? '手动录入的 ' + N.int(st.ueTotal) + ' 未计入（可在设置里改）。' : '')));
      }
    }
    const pd = UI.panel('测量设备', { span: 6, hint: '按记录条数' }); grid.appendChild(pd.el);
    pd.body.appendChild(UI.barList(st.byDev.slice(0, 10).map(function (e) { const d = e[0] ? A.ds.devices[e[0] - 1] : null; return { name: d ? (d.name || d.model) : '未注明设备', sub: d ? (CAT.deviceLabel(d) || d.hardware || d.model) : '', v: e[1], text: N.int(e[1]), unit: '条', color: col }; })));
    // 元数据
    if (t.metaKeys.length) {
      const pm = UI.panel('附加信息（元数据）', { span: 12, hint: '每条记录附带的额外字段' }); grid.appendChild(pm.el);
      pm.body.appendChild(UI.table([{ k: 'k', label: '字段', fmt: function (r) { return (CAT.META_CN[r[0]] || '') ? CAT.META_CN[r[0]] + '（' + r[0] + '）' : r[0]; } }, { k: 'n', label: '条数', n: true, fmt: function (r) { return N.int(r[1]); }, sort: function (r) { return r[1]; } }, { k: 'ex', label: '取值示例', muted: true, fmt: function (r) { return r[2].join('、'); } }], t.metaKeys, { scroll: false, sortK: 'n' }));
      if (id === A.Q('HeartRate')) { const ctx = A.hrContext(r.d0, r.d1); if (ctx) pm.body.appendChild(UI.note('运动状态：未注明 ' + N.int(ctx[0].n) + ' 条（平均 ' + N.fix(ctx[0].mean, 0) + '），静止 ' + N.int(ctx[1].n) + ' 条（平均 ' + N.fix(ctx[1].mean, 0) + '），活动中 ' + N.int(ctx[2].n) + ' 条（平均 ' + N.fix(ctx[2].mean, 0) + '）。')); }
    }
    if (kind === 'event' && st.byValue && st.byValue.length) { const pv = UI.panel('记录的取值', { span: 6 }); grid.appendChild(pv.el); pv.body.appendChild(UI.barList(st.byValue.map(function (e) { return { name: e[0], v: e[1], text: N.int(e[1]), unit: '次', color: col }; }))); }
    rawSection(root, t);
  };

  function extremes(t, d0, d1, kind) {
    const fmt = M.fmt(t), u = M.unit(t);
    if (kind === 'sum' || kind === 'stand') {
      const vals = A.dailyValues(t.id); const days = [];
      for (let d = d0; d <= d1; d++) { const v = vals[d - A.day0]; if (v === v && v > 0) days.push([d, v]); }
      if (!days.length) return null;
      days.sort(function (a, b) { return b[1] - a[1]; });
      const row = function (e, i) { return { rank: i + 1, v: fmt(e[1]) + ' ' + u, t: T.date(e[0] * DAY, { week: true }), src: '' }; };
      return { top: days.slice(0, 8).map(row), bottom: days.slice(-8).reverse().map(row) };
    }
    if (kind === 'event') return null;
    const [a, b] = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY);
    const idx = []; for (let i = a; i < b; i++) if (!(t.fl[i] & 2) && t.v[i] === t.v[i]) idx.push(i);
    if (!idx.length) return null;
    idx.sort(function (x, y) { return t.v[y] - t.v[x]; });
    const row = function (i, k) { const s = A.ds.sources[t.src[i]]; return { rank: k + 1, v: fmt(A.val(t, i)) + ' ' + u, t: T.dtFull(t.s[i]), src: s ? s.name : '' }; };
    return { top: idx.slice(0, 8).map(row), bottom: idx.slice(-8).reverse().map(row) };
  }

  function rawSection(root, t) {
    const sec = UI.section('原始记录', '导出文件里这一类型的每一条记录（按开始时间）。可以导出成 CSV 用 Excel 打开。');
    root.appendChild(sec.el);
    const f = M.fmt(t), u = M.unit(t);
    const dl = h('button', { class: 'btn sm', type: 'button' }, UI.icon('download'), '导出 CSV');
    dl.addEventListener('click', function () {
      const lines = ['开始时间,结束时间,时长(秒),数值,单位,来源,设备,手动录入,重复'];
      for (let i = 0; i < t.n; i++) {
        const s = A.ds.sources[t.src[i]], d = t.dev[i] ? A.ds.devices[t.dev[i] - 1] : null;
        const v = t.kind === 'c' ? A.catLabel(t, t.v[i]) : (t.v[i] === t.v[i] ? +(A.val(t, i)).toFixed(4) : '');
        lines.push([T.ymd(t.s[i]) + ' ' + T.hms(t.s[i]), T.ymd(t.s[i] + t.d[i] * 1000) + ' ' + T.hms(t.s[i] + t.d[i] * 1000), Math.round(t.d[i]), v, u, s ? s.name : '', d ? d.name : '', t.fl[i] & 1 ? '是' : '', t.fl[i] & 2 ? '是' : ''].map(UI.csvCell).join(','));
      }
      UI.download(t.def.name + '.csv', lines.join('\n'));
      UI.toast('已导出 ' + N.int(t.n) + ' 条');
    });
    sec.acts.appendChild(dl);
    const cols = [{ label: '开始', w: '22%' }, { label: '时长', w: '12%' }, { label: '数值', n: true, w: '14%' }, { label: '来源', w: '18%' }, { label: '设备', w: '22%' }, { label: '标记', w: '12%' }];
    sec.body.appendChild(UI.vtable(cols, t.n, function (k) {
      const i = t.n - 1 - k; // 新的在前
      const s = A.ds.sources[t.src[i]], d = t.dev[i] ? A.ds.devices[t.dev[i] - 1] : null;
      const v = t.kind === 'c' ? A.catLabel(t, t.v[i]) : (t.v[i] === t.v[i] ? f(A.val(t, i)) + (u ? ' ' + u : '') : '—');
      const flags = []; if (t.fl[i] & 1) flags.push('手动'); if (t.fl[i] & 2) flags.push('重复'); if (t.fl[i] & 16) flags.push('低于下限'); const mc = (t.fl[i] >> 2) & 3; if (t.id === A.Q('HeartRate') && mc) flags.push(mc === 1 ? '静止' : '活动中');
      return [T.ymd(t.s[i]) + ' ' + T.hms(t.s[i]), t.d[i] ? T.dur(t.d[i], { sec: true }) : '瞬时', v, s ? s.name : '', d ? (d.name || d.model) : '', flags.join(' ')];
    }, { height: 420 }));
  }
})();
