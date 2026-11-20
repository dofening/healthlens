/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 页面：总览、活动、心脏、睡眠 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, S = HL.S, C = HL.C, A = HL.A, CH = HL.CH, UI = HL.UI, CAT = HL.CAT, M = HL.M, INS = HL.INS;
  const DAY = 86400000;
  const P = HL.pages = HL.pages || {};
  const D = CAT.DOMAINS;
  const Q = function (s) { return A.Q(s); };

  // 设备分组（同一款产品合并，保留各个标识）
  HL.devGroups = function () {
    return A.memo('devgroups', function () {
      const g = new Map();
      A.ds.devices.forEach(function (d, i) {
        const kind = CAT.deviceKind(d);
        const key = kind + '|' + (CAT.deviceLabel(d) || d.hardware || (d.model + '|' + d.name.replace(/^.*的/, '').replace(/[^\w\s一-龥•.-]/g, '').trim().toLowerCase()));
        let r = g.get(key);
        if (!r) { r = { key: key, kind: kind, label: CAT.deviceLabel(d), hardware: d.hardware || '', model: d.model, manufacturer: d.manufacturer, names: new Map(), ids: [], n: 0, first: Infinity, last: -Infinity, software: new Map(), firmware: new Map(), types: new Map(), sources: new Map() }; g.set(key, r); }
        r.ids.push(i + 1); r.n += d.n; r.names.set(d.name, (r.names.get(d.name) || 0) + d.n); if (!r.hardware && d.hardware) r.hardware = d.hardware;
        if (d.first < r.first) r.first = d.first; if (d.last > r.last) r.last = d.last;
        d.software.forEach(function (s) { const o = r.software.get(s[0]); if (!o) r.software.set(s[0], { n: s[1], first: s[2], last: s[3] }); else { o.n += s[1]; o.first = Math.min(o.first, s[2]); o.last = Math.max(o.last, s[3]); } });
        d.firmware.forEach(function (s) { const o = r.firmware.get(s[0]); if (!o) r.firmware.set(s[0], { n: s[1], first: s[2], last: s[3] }); else { o.n += s[1]; o.first = Math.min(o.first, s[2]); o.last = Math.max(o.last, s[3]); } });
        d.types.forEach(function (tp) { r.types.set(tp[0], (r.types.get(tp[0]) || 0) + tp[1]); });
        d.sources.forEach(function (sp) { r.sources.set(sp[0], (r.sources.get(sp[0]) || 0) + sp[1]); });
      });
      return Array.from(g.values()).sort(function (a, b) { return b.n - a.n; });
    });
  };
  HL.typeName = function (id) { if (/^Workout:/.test(id)) return '体能训练·' + CAT.workoutName(id.slice(8)); if (id === 'Audiogram') return '听力图'; if (id === 'Correlation') return '关联记录'; return CAT.type(id).name; };

  // =============== 总览 ===============
  P.overview = {
    title: '总览', icon: 'overview', color: '#e9eef5',
    sub: function () { return '所有数据按时间摊开；点任意一天看那天的细节'; },
    render: function (v, params) {
      const r = A.range, ds = A.ds;
      const nDev = HL.devGroups().length;
      const nTypes = ds.types.filter(function (t) { return t.n; }).length;
      const b = function (t, cn) { return h('b', { class: cn ? 'cn-b' : '' }, t); };
      v.appendChild(h('div', { class: 'hero' }, h('p', { class: 'hero-line' },
        '从 ', b(T.date(A.day0 * DAY), true), ' 到 ', b(T.date(A.day1 * DAY), true), '，', b(N.int(ds.counts.records)), ' 条记录、', b(String(nTypes)), ' 种指标，来自 ', b(String(nDev)), ' 台设备和 ', b(String(ds.sources.length)), ' 个来源。')));
      // 生命之带
      const wrap = h('div', { class: 'ribbon-wrap' }); v.appendChild(wrap);
      const box = UI.chartBox(); wrap.appendChild(box);
      const tracks = [];
      if (A.has(Q('StepCount'))) tracks.push({ name: '步数', color: D.activity.color, vals: A.dailyValues(Q('StepCount')), base: A.day0, fmt: function (x) { return N.int(x) + ' 步'; }, h: 62 });
      const nights = A.sleepNights();
      if (nights.length) { const sl = new Float64Array(A.nDays).fill(NaN), kind = new Uint8Array(A.nDays); nights.forEach(function (n) { const i = n.day - A.day0; if (i >= 0 && i < A.nDays) { sl[i] = n.asleep / 3600; kind[i] = n.kind === 'inbed' ? 1 : 2; } }); tracks.push({ name: '睡眠', color: D.sleep.color, vals: sl, base: A.day0, fmt: function (x) { return T.dur(x * 3600); }, h: 46, max: 10, colorOf: function (day) { return kind[day - A.day0] === 1 ? 'rgba(139,128,240,0.45)' : D.sleep.color; } }); }
      if (A.has(Q('HeartRate'))) { const hr = A.avgDaily(Q('HeartRate')); tracks.push({ name: '心率', color: D.heart.color, kind: 'band', lo: hr.min, hi: hr.max, vals: hr.mean, base: A.day0, unit: '次/分', h: 46 }); }
      if (A.has(Q('HeadphoneAudioExposure'))) tracks.push({ name: '耳机', color: D.hearing.color, vals: A.dailyValues(Q('HeadphoneAudioExposure'), 'secs'), base: A.day0, fmt: function (x) { return T.dur(x * 60); }, h: 34 });
      const marks = [];
      const watch = ds.sources.filter(function (s) { return s.cls === 0 && s.n > 1000; }).sort(function (a, b) { return a.first - b.first; })[0];
      if (watch && T.day(watch.first) > r.d0 + 30) marks.push({ day: T.day(watch.first), text: '开始戴 Apple Watch' });
      new CH.Ribbon(box, { d0: r.d0, d1: r.d1, tracks: tracks, marks: marks, onPick: function (day) { HL.App.openDay(day); } });
      wrap.appendChild(h('p', { class: 'note', style: { margin: '6px 0 0' }, text: '每一竖条是一天。浅色的睡眠条是 iPhone 睡眠模式记下的「在床时间」，深色是 Apple Watch 测到的实际睡眠。' }));

      // 关键数字
      const sec = UI.section('这段时间的总量', T.date(r.d0 * DAY) + ' – ' + T.date(r.d1 * DAY));
      v.appendChild(sec.el);
      const items = [];
      const monthly = function (id, how) { const dv = A.dailyValues(id, how); return A.rollup(dv, r.d0, r.d1, 'month', 'sum').y; };
      if (A.has(Q('StepCount'))) { const st = A.stats(Q('StepCount')); items.push({ k: '步数', v: st.total, fmt: function (x) { return N.cn(x); }, u: '步', s: '日均 ' + N.int(st.perDay), spark: monthly(Q('StepCount')), color: D.activity.color }); }
      if (A.has(Q('DistanceWalkingRunning'))) { const st = A.stats(Q('DistanceWalkingRunning')); items.push({ k: '步行与跑步', v: st.total, fmt: function (x) { return N.int(x); }, u: '公里', s: '≈ ' + N.fix(st.total / 42.195, 0) + ' 个马拉松', spark: monthly(Q('DistanceWalkingRunning')), color: D.activity.color }); }
      const ringS = A.ringStats(r.d0, r.d1);
      if (ringS.days) items.push({ k: '活动能量', v: ringS.moveSum, fmt: function (x) { return N.cn(x); }, u: '千卡', s: '活动环闭合 ' + ringS.moveClosed + ' 天', color: D.activity.color });
      const ss = A.sleepStats(r.d0, r.d1);
      if (ss.nights) items.push({ k: '睡眠记录', v: ss.nights, fmt: N.int, u: '晚', s: ss.measured ? '手表测得 ' + ss.measured + ' 晚，平均 ' + T.dur(ss.asleep) : '均为 iPhone 在床记录', color: D.sleep.color });
      if (A.has(Q('HeartRate'))) { const hb = A.heartbeats(r.d0, r.d1); if (hb.beats > 0) items.push({ k: '心跳（估算）', v: hb.beats, fmt: function (x) { return N.cn(x, 0); }, u: '次', s: '基于 ' + N.int(hb.covered / 60) + ' 小时心率记录', color: D.heart.color }); }
      const wk = A.workoutsIn(r.d0, r.d1);
      if (wk.length) items.push({ k: '体能训练', v: wk.length, fmt: N.int, u: '次', s: '共 ' + T.dur(S.sum(wk.map(function (w) { return w.durMin; })) * 60), color: D.activity.color });
      if (A.has(Q('HeadphoneAudioExposure'))) { const st = A.stats(Q('HeadphoneAudioExposure')); items.push({ k: '戴耳机', v: st.secs / 3600, fmt: N.int, u: '小时', s: '平均 ' + N.fix(st.laeq, 0) + ' dB', spark: monthly(Q('HeadphoneAudioExposure'), 'secs'), color: D.hearing.color }); }
      sec.body.appendChild(UI.readouts(items));

      // 发现
      const ins = INS.generate(r.d0, r.d1);
      if (ins.length) {
        const s2 = UI.section('值得一看', '从数据里自动找出来的规律，全部见「洞察」页。手机上的「健康」App 不会做这些对比。');
        v.appendChild(s2.el);
        const more = h('button', { class: 'btn sm', type: 'button', text: '全部洞察' }); more.addEventListener('click', function () { HL.App.go('insights'); }); s2.acts.appendChild(more);
        const g = h('div', { class: 'insights' }); INS.top(ins, 4).forEach(function (it) { g.appendChild(INS.card(it)); }); s2.body.appendChild(g);
      }

      // 最近 7 天
      const s3 = UI.section('最近 7 天', '点一行打开那一天');
      v.appendChild(s3.el);
      const rows = [];
      const stepsV = A.dailyValues(Q('StepCount')), distV = A.dailyValues(Q('DistanceWalkingRunning'));
      const rhrV = A.dailyValues(Q('RestingHeartRate')), hrvV = A.dailyValues(Q('HeartRateVariabilitySDNN'));
      const nightBy = new Map(); nights.forEach(function (n) { nightBy.set(n.day, n); });
      for (let d = r.d1; d > r.d1 - 7 && d >= r.d0; d--) {
        const i = d - A.day0, R = A.rings, nt = nightBy.get(d);
        rows.push({ day: d, steps: stepsV[i], dist: distV[i], move: R.has[i] ? R.move[i] : NaN, moveGoal: R.moveGoal[i], ex: R.has[i] && R.exGoal[i] > 0 ? R.ex[i] : NaN, stand: R.has[i] && R.standGoal[i] > 0 ? R.stand[i] : NaN, sleep: nt ? nt.asleep : NaN, sleepKind: nt ? nt.kind : '', rhr: rhrV[i], hrv: hrvV[i] });
      }
      s3.body.appendChild(UI.table([
        { k: 'day', label: '日期', fmt: function (x) { return T.date(x.day * DAY, { week: true, noYear: true }); } },
        { k: 'steps', label: '步数', n: true, fmt: function (x) { return N.int(x.steps); } },
        { k: 'dist', label: '距离', n: true, fmt: function (x) { return x.dist === x.dist ? N.fix(x.dist, 1) + ' km' : '—'; } },
        { k: 'move', label: '活动能量', n: true, fmt: function (x) { return x.move === x.move ? N.int(x.move) + ' / ' + N.int(x.moveGoal) : '—'; } },
        { k: 'ex', label: '锻炼', n: true, fmt: function (x) { return x.ex === x.ex ? N.int(x.ex) + ' 分' : '—'; } },
        { k: 'stand', label: '站立', n: true, fmt: function (x) { return x.stand === x.stand ? N.int(x.stand) + ' 小时' : '—'; } },
        { k: 'sleep', label: '前一晚睡眠', n: true, fmt: function (x) { return x.sleep === x.sleep ? T.dur(x.sleep) + (x.sleepKind === 'inbed' ? '（在床）' : '') : '—'; } },
        { k: 'rhr', label: '静息心率', n: true, fmt: function (x) { return x.rhr === x.rhr ? N.int(x.rhr) : '—'; } },
        { k: 'hrv', label: 'HRV', n: true, fmt: function (x) { return x.hrv === x.hrv ? N.int(x.hrv) + ' ms' : '—'; } }
      ], rows, { scroll: false, onClick: function (x) { HL.App.openDay(x.day); } }));

      // 数据清单
      const s4 = UI.section('导出包里的全部内容', '每一种数据都列在这里，点名字查看完整细节和原始记录。');
      v.appendChild(s4.el);
      s4.body.appendChild(HL.inventory());
      if (params.day) setTimeout(function () { HL.App.openDay(+params.day); }, 300);
    }
  };

  HL.inventory = function () {
    const ds = A.ds;
    const groups = {};
    ds.types.forEach(function (t) { if (!t.n) return; const dom = t.def.dom; (groups[dom] = groups[dom] || []).push(t); });
    const wrap = h('div', { class: 'grid' });
    Object.keys(D).forEach(function (dk) {
      const list = groups[dk]; if (!list) return;
      list.sort(function (a, b) { return b.n - a.n; });
      const col = h('div', { class: 'c4' });
      col.appendChild(h('div', { class: 'typelist inv' }, h('div', { class: 'grp', style: { '--c': D[dk].color } }, h('i'), D[dk].name)));
      list.forEach(function (t) {
        const bt = h('button', { type: 'button', class: 'invrow', title: t.id }, h('span', { text: t.def.name }), h('span', { text: N.int(t.n) + ' · ' + T.ym(t.s[0]).replace('年', '.').replace('月', '') + '–' + T.ym(t.s[t.n - 1]).replace('年', '.').replace('月', '') }));
        bt.addEventListener('click', function () { HL.App.go('explore', { type: t.id }); });
        col.firstChild.appendChild(bt);
      });
      wrap.appendChild(col);
    });
    // 非记录类
    const other = h('div', { class: 'c4' }, h('div', { class: 'typelist inv' }, h('div', { class: 'grp', style: { '--c': '#9aa9bc' } }, h('i'), '其他内容')));
    const add = function (name, val, page) { const bt = h('button', { type: 'button' }, h('span', { text: name }), h('span', { text: val })); if (page) bt.addEventListener('click', function () { HL.App.go(page); }); other.firstChild.appendChild(bt); };
    add('体能训练', N.int(ds.workouts.length) + ' 条（有效 ' + A.workouts.filter(A.workoutValid).length + '）', 'workouts');
    add('活动圆环', N.int(ds.activity.length) + ' 天', 'activity');
    if (ds.routes.length) add('GPS 轨迹', ds.routes.length + ' 条', 'workouts');
    if (ds.ecgs.length) add('心电图', ds.ecgs.length + ' 份', 'ecg');
    if (ds.beats.t.length) add('逐拍心跳', N.int(ds.beats.t.length) + ' 次', 'heart');
    if (ds.audiograms.length) add('听力图', ds.audiograms.length + ' 份', 'hearing');
    add('设备', HL.devGroups().length + ' 台', 'devices');
    add('数据来源', ds.sources.length + ' 个', 'devices');
    if (ds.clinical.length) add('临床记录', ds.clinical.length + ' 条', 'devices');
    if (ds.vision.length) add('视力处方', ds.vision.length + ' 份', 'body');
    if (ds.correlations.length) add('关联记录', ds.correlations.length + ' 条', 'devices');
    add('个人信息', '生日、性别、血型等', 'body');
    wrap.appendChild(other);
    return wrap;
  };

  // =============== 某一天 ===============
  HL.App = HL.App || {};
  const openDay = function (day) {
    UI.drawer(T.date(day * DAY, { week: true }), function (body, titleEl) { renderDay(body, titleEl, day); });
  };
  function renderDay(body, titleEl, day) {
    CH.destroyAll(body); body.textContent = '';
    titleEl.textContent = T.date(day * DAY, { week: true });
    const nav = h('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px' } });
    const prev = h('button', { class: 'btn sm', type: 'button' }, UI.icon('chevL'), '前一天'), next = h('button', { class: 'btn sm', type: 'button' }, '后一天', UI.icon('chevR'));
    prev.disabled = day <= A.day0; next.disabled = day >= A.day1;
    prev.addEventListener('click', function () { renderDay(body, titleEl, day - 1); }); next.addEventListener('click', function () { renderDay(body, titleEl, day + 1); });
    nav.appendChild(prev); nav.appendChild(next); body.appendChild(nav);
    const i = day - A.day0, R = A.rings;
    const g = h('div', { style: { display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' } });
    if (R.has[i]) {
      const rv = [{ v: R.moveGoal[i] > 0 ? R.move[i] / R.moveGoal[i] : 0, color: '#ff3b6b' }, { v: R.exGoal[i] > 0 ? R.ex[i] / R.exGoal[i] : 0, color: '#a4f23a', na: !(R.exGoal[i] > 0) }, { v: R.standGoal[i] > 0 ? R.stand[i] / R.standGoal[i] : 0, color: '#22d3ee', na: !(R.standGoal[i] > 0) }];
      const rb = h('div'); CH.rings(rb, rv, { size: 120, label: '活动圆环' }); g.appendChild(rb);
    }
    const items = [];
    const sv = function (id, how) { const a = A.dailyValues(Q(id), how); return a[i]; };
    if (A.has(Q('StepCount'))) items.push({ k: '步数', v: sv('StepCount'), fmt: N.int, u: '步' });
    if (A.has(Q('DistanceWalkingRunning'))) items.push({ k: '距离', v: sv('DistanceWalkingRunning'), fmt: function (x) { return N.fix(x, 2); }, u: '公里' });
    if (R.has[i]) items.push({ k: '活动能量', v: R.move[i], fmt: N.int, u: '千卡', s: '目标 ' + N.int(R.moveGoal[i]) });
    if (R.has[i] && R.exGoal[i] > 0) items.push({ k: '锻炼', v: R.ex[i], fmt: N.int, u: '分钟', s: '目标 ' + N.int(R.exGoal[i]) });
    if (R.has[i] && R.standGoal[i] > 0) items.push({ k: '站立', v: R.stand[i], fmt: N.int, u: '小时', s: '目标 ' + N.int(R.standGoal[i]) });
    if (A.has(Q('FlightsClimbed'))) items.push({ k: '爬楼', v: sv('FlightsClimbed'), fmt: N.int, u: '层' });
    if (A.has(Q('TimeInDaylight'))) items.push({ k: '日光', v: sv('TimeInDaylight'), fmt: N.int, u: '分钟' });
    if (A.has(Q('HeartRate'))) { const hr = A.avgDaily(Q('HeartRate')); if (hr.cnt[i]) items.push({ k: '心率范围', text: N.int(hr.min[i]) + '–' + N.int(hr.max[i]), u: '次/分', s: '平均 ' + N.int(hr.mean[i]) + '，' + hr.cnt[i] + ' 次测量' }); }
    if (A.has(Q('RestingHeartRate'))) items.push({ k: '静息心率', v: sv('RestingHeartRate'), fmt: N.int, u: '次/分' });
    if (A.has(Q('HeartRateVariabilitySDNN'))) items.push({ k: 'HRV', v: sv('HeartRateVariabilitySDNN'), fmt: N.int, u: '毫秒' });
    if (A.has(Q('HeadphoneAudioExposure'))) { const m = sv('HeadphoneAudioExposure', 'secs'); items.push({ k: '戴耳机', text: m === m ? T.dur(m * 60) : '—', s: m === m ? N.fix(sv('HeadphoneAudioExposure'), 0) + ' dB' : '' }); }
    const ro = UI.readouts(items.filter(function (x) { return x.text !== undefined || x.v === x.v; }), { tight: true }); ro.style.flex = '1'; g.appendChild(ro);
    body.appendChild(g);
    // 当天心率 + 步数
    const t0 = day * DAY, t1 = t0 + DAY;
    const wk = A.workouts.filter(function (w) { return A.workoutValid(w) && w.e > t0 && w.s < t1; });
    const night = A.sleepNights().find(function (n) { return n.day === day; });
    const bands = wk.map(function (w) { return { t0: Math.max(t0, w.s), t1: Math.min(t1, w.e), color: 'rgba(255,122,61,0.12)', label: w.name }; });
    if (night) bands.push({ t0: Math.max(t0, night.start), t1: Math.min(t1, night.end), color: 'rgba(139,128,240,0.12)', label: '睡眠' });
    if (A.has(Q('HeartRate'))) {
      const t = A.t(Q('HeartRate')), ab = A.idxRange(t, t0, t1), ts = [], vs = [];
      for (let k = ab[0]; k < ab[1]; k++) { ts.push(t.s[k]); vs.push(t.v[k]); }
      const p = UI.panel('心率', { color: D.heart.color, hint: ts.length + ' 次测量' }); body.appendChild(p.el);
      const bx = UI.chartBox(); p.body.appendChild(bx);
      new CH.Intraday(bx, { t0: t0, t1: t1, lines: [{ name: '心率', color: D.heart.color, t: ts, v: vs, unit: '次/分', gap: 30 * 60000 }], bands: bands, fmt: N.int, empty: '这天没有心率数据' }, { height: 190 });
    }
    if (A.has(Q('StepCount'))) {
      const sd = A.sumDaily(Q('StepCount')); const ts = [], vs = [];
      for (let hh = 0; hh < 24; hh++) { ts.push(t0 + hh * 3600000); vs.push(sd.hourly[i * 24 + hh]); }
      const p = UI.panel('每小时步数', { color: D.activity.color }); p.el.style.marginTop = '14px'; body.appendChild(p.el);
      const bx = UI.chartBox(); p.body.appendChild(bx);
      new CH.Intraday(bx, { t0: t0, t1: t1, bars: { name: '步数', color: D.activity.color, t: ts, v: vs, w: 3600000, fmt: N.int, unit: '步' }, bands: bands, empty: '这天没有步数' }, { height: 160 });
    }
    if (night && night.kind !== 'inbed') {
      const p = UI.panel('前一晚的睡眠', { color: D.sleep.color, hint: T.hm(night.start) + ' – ' + T.hm(night.end) + ' · ' + T.dur(night.asleep) }); p.el.style.marginTop = '14px'; body.appendChild(p.el);
      const bx = UI.chartBox(); p.body.appendChild(bx);
      new CH.Hypno(bx, { segs: night.segs, s0: night.start - 10 * 60000, s1: night.end + 10 * 60000 }, { height: 180 });
    }
    if (wk.length) {
      const p = UI.panel('这天的体能训练', { color: D.activity.color }); p.el.style.marginTop = '14px'; body.appendChild(p.el);
      p.body.appendChild(HL.workoutTable(wk, { limit: 20 }));
    }
  }
  HL.App.openDay = openDay;

  // =============== 活动 ===============
  P.activity = {
    title: '活动', icon: 'activity', color: D.activity.color,
    sub: function () { return '步数、能量、圆环、站立、爬楼、日光'; },
    render: function (v, params) {
      const r = A.range, R = A.rings;
      // 选中的日子
      let sel = params.day ? +params.day : r.d1;
      while (sel > r.d0 && !R.has[sel - A.day0] && !(A.dailyValues(Q('StepCount'))[sel - A.day0] > 0)) sel--;
      const hero = UI.panel(null, { cls: 'hero-panel' }); v.appendChild(hero.el);
      const draw = function () {
        hero.body.textContent = '';
        const i = sel - A.day0;
        const top = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' } },
          h('div', null, h('div', { class: 'note', text: '活动圆环' }), h('div', { style: { fontSize: '20px', fontWeight: 600 }, text: T.date(sel * DAY, { week: true }) })));
        const nav = h('div', { style: { display: 'flex', gap: '6px' } });
        const pb = h('button', { class: 'btn sm', type: 'button' }, UI.icon('chevL')), nb = h('button', { class: 'btn sm', type: 'button' }, UI.icon('chevR'));
        pb.addEventListener('click', function () { if (sel > A.day0) { sel--; draw(); } }); nb.addEventListener('click', function () { if (sel < A.day1) { sel++; draw(); } });
        const dayBtn = h('button', { class: 'btn sm', type: 'button', text: '这天的详细数据' }); dayBtn.addEventListener('click', function () { HL.App.openDay(sel); });
        nav.appendChild(pb); nav.appendChild(nb); nav.appendChild(dayBtn); top.appendChild(nav); hero.body.appendChild(top);
        const row = h('div', { class: 'rings-day' });
        const has = R.has[i];
        const vals = [{ v: has && R.moveGoal[i] > 0 ? R.move[i] / R.moveGoal[i] : 0, color: '#ff3b6b' }, { v: has && R.exGoal[i] > 0 ? R.ex[i] / R.exGoal[i] : 0, color: '#a4f23a', na: !(has && R.exGoal[i] > 0) }, { v: has && R.standGoal[i] > 0 ? R.stand[i] / R.standGoal[i] : 0, color: '#22d3ee', na: !(has && R.standGoal[i] > 0) }];
        const rb = h('div'); CH.rings(rb, vals, { size: 210, label: '活动圆环' }); row.appendChild(rb);
        const leg = h('div', { class: 'ring-legend' });
        const lr = function (name, c, val, goal, unit, na) { leg.appendChild(h('div', { class: 'r' }, h('div', { class: 'k' }, h('i', { style: { '--c': c } }), name), h('div', { class: 'v' }, na ? '未设置目标' : (val === val ? N.int(val) : '—'), na ? null : h('small', { text: '/ ' + N.int(goal) + ' ' + unit + (val === val && goal > 0 ? '  ' + N.pct(val / goal) : '') })))); };
        lr('活动', '#ff3b6b', has ? R.move[i] : NaN, R.moveGoal[i], '千卡', false);
        lr('锻炼', '#a4f23a', has ? R.ex[i] : NaN, R.exGoal[i], '分钟', !(R.exGoal[i] > 0));
        lr('站立', '#22d3ee', has ? R.stand[i] : NaN, R.standGoal[i], '小时', !(R.standGoal[i] > 0));
        row.appendChild(leg);
        // 一周
        const ws = T.weekStartDay(sel), week = h('div', { class: 'week-rings', style: { flex: '1', minWidth: '360px' } });
        for (let d = ws; d < ws + 7; d++) {
          const k = d - A.day0, cell = h('div', { class: 'd' + (d === sel ? ' on' : '') });
          const ok = k >= 0 && k < A.nDays && R.has[k];
          const mini = h('div'); CH.rings(mini, [{ v: ok && R.moveGoal[k] > 0 ? R.move[k] / R.moveGoal[k] : 0, color: '#ff3b6b' }, { v: ok && R.exGoal[k] > 0 ? R.ex[k] / R.exGoal[k] : 0, color: '#a4f23a', na: !(ok && R.exGoal[k] > 0) }, { v: ok && R.standGoal[k] > 0 ? R.stand[k] / R.standGoal[k] : 0, color: '#22d3ee', na: !(ok && R.standGoal[k] > 0) }], { size: 46, stroke: 5, gap: 1.5, duration: 900, delay: (d - ws) * 60 });
          cell.appendChild(mini); cell.appendChild(h('div', { text: T.WEEK_MON[d - ws] + ' ' + new Date(d * DAY).getUTCDate() }));
          if (d >= A.day0 && d <= A.day1) cell.addEventListener('click', (function (dd) { return function () { sel = dd; draw(); }; })(d));
          week.appendChild(cell);
        }
        row.appendChild(week);
        hero.body.appendChild(row);
        const st = A.dailyValues(Q('StepCount'))[i], dist = A.dailyValues(Q('DistanceWalkingRunning'))[i], fl = A.dailyValues(Q('FlightsClimbed'))[i];
        hero.body.appendChild(h('p', { class: 'note', style: { marginTop: '12px' }, text: '这天 ' + (st === st ? N.int(st) + ' 步' : '没有步数记录') + (dist === dist ? '，' + N.fix(dist, 2) + ' 公里' : '') + (fl === fl ? '，爬了 ' + N.int(fl) + ' 层楼' : '') + '。圆环数值直接来自「健康」导出的活动汇总。' }));
      };
      draw();

      // 圆环统计
      const rs = A.ringStats(r.d0, r.d1);
      if (rs.days) {
        const sec = UI.section('圆环记录', '这段时间里每天的圆环完成情况', { color: '#ff3b6b' }); v.appendChild(sec.el);
        sec.body.appendChild(UI.readouts([
          { k: '有圆环的天数', v: rs.days, fmt: N.int, u: '天' },
          { k: '活动环闭合', text: N.pct(rs.moveClosed / rs.days), s: rs.moveClosed + ' 天' },
          rs.exDays ? { k: '锻炼环闭合', text: N.pct(rs.exClosed / rs.exDays), s: rs.exClosed + ' / ' + rs.exDays + ' 天（有目标的）' } : null,
          rs.standDays ? { k: '站立环闭合', text: N.pct(rs.standClosed / rs.standDays), s: rs.standClosed + ' / ' + rs.standDays + ' 天' } : null,
          rs.exDays ? { k: '三环全闭合', v: rs.allClosed, fmt: N.int, u: '天' } : null,
          { k: '活动环最长连续闭合', v: rs.moveStreak.best, fmt: N.int, u: '天', s: rs.moveStreak.best ? T.md(rs.moveStreak.bestStart * DAY) + ' – ' + T.md(rs.moveStreak.bestEnd * DAY) : '' },
          { k: '当前连续', v: rs.moveStreak.current, fmt: N.int, u: '天' }
        ]));
        const g = UI.grid(); g.style.marginTop = '16px'; sec.body.appendChild(g);
        // 每月闭合率
        const p1 = UI.panel('每个月的闭合率', { span: 8 }); g.appendChild(p1.el);
        const ratio = new Float64Array(A.nDays).fill(NaN), exr = new Float64Array(A.nDays).fill(NaN), str = new Float64Array(A.nDays).fill(NaN);
        for (let k = 0; k < A.nDays; k++) if (R.has[k]) { ratio[k] = R.moveGoal[k] > 0 && R.move[k] >= R.moveGoal[k] ? 1 : 0; if (R.exGoal[k] > 0) exr[k] = R.ex[k] >= R.exGoal[k] ? 1 : 0; if (R.standGoal[k] > 0) str[k] = R.stand[k] >= R.standGoal[k] ? 1 : 0; }
        const gran = r.d1 - r.d0 > 60 ? 'month' : 'week';
        const ro1 = A.rollup(ratio, r.d0, r.d1, gran, 'avg'), ro2 = A.rollup(exr, r.d0, r.d1, gran, 'avg'), ro3 = A.rollup(str, r.d0, r.d1, gran, 'avg');
        const bx = UI.chartBox(); p1.body.appendChild(bx);
        const ser = [{ name: '活动环', color: '#ff3b6b', type: 'line', y: ro1.y.map(function (x) { return x * 100; }) }];
        if (rs.exDays) ser.push({ name: '锻炼环', color: '#a4f23a', type: 'line', y: ro2.y.map(function (x) { return x * 100; }) });
        if (rs.standDays) ser.push({ name: '站立环', color: '#22d3ee', type: 'line', y: ro3.y.map(function (x) { return x * 100; }) });
        new CH.TimeChart(bx, { x: ro1.x, gran: gran, series: ser, yMin: 0, yMax: 100, fmt: function (x) { return N.fix(x, 0) + '%'; }, yFmt: function (x) { return x + '%'; } }, { height: 220 });
        if (ser.length > 1) p1.body.appendChild(UI.legend(ser.map(function (s) { return { name: s.name, color: s.color }; })));
        const p2 = UI.panel('目标的变化', { span: 4, hint: '每次改目标' }); g.appendChild(p2.el);
        p2.body.appendChild(UI.table([{ k: 'day', label: '开始日期', fmt: function (x) { return T.date(x.day * DAY); } }, { k: 'move', label: '活动', n: true, fmt: function (x) { return N.int(x.move) + ' 千卡'; } }, { k: 'ex', label: '锻炼', n: true, fmt: function (x) { return x.ex ? N.int(x.ex) + ' 分' : '—'; } }, { k: 'stand', label: '站立', n: true, fmt: function (x) { return x.stand ? N.int(x.stand) + ' 时' : '—'; } }], rs.goals.slice().reverse(), { maxH: 260 }));
      }

      // 各项指标
      const sec2 = UI.section('每一项活动数据', '柱子是每天/每周期的量，白线是 7 日平均；右上角可以切换按日、周、月、年看。', { color: D.activity.color });
      v.appendChild(sec2.el);
      const g2 = UI.grid(); sec2.body.appendChild(g2);
      const order = ['StepCount', 'DistanceWalkingRunning', 'ActiveEnergyBurned', 'BasalEnergyBurned', 'FlightsClimbed', 'AppleExerciseTime', 'AppleStandTime', 'TimeInDaylight', 'PhysicalEffort', 'DistanceCycling'];
      const shown = new Set();
      order.forEach(function (s) {
        const id = Q(s); if (!A.has(id)) return; shown.add(id);
        const el = M.panel(id, { span: s === 'StepCount' ? 12 : 6, height: s === 'StepCount' ? 250 : 200, goal: s === 'StepCount' ? { v: A.settings.stepGoal, label: '目标 ' + N.int(A.settings.stepGoal) } : null });
        if (el) g2.appendChild(el);
      });
      if (A.has(A.C('AppleStandHour'))) { shown.add(A.C('AppleStandHour')); const el = M.panel(A.C('AppleStandHour'), { span: 6 }); if (el) g2.appendChild(el); }
      A.ds.types.forEach(function (t) { if (t.n && t.def.dom === 'activity' && !shown.has(t.id)) { const el = M.panel(t.id, { span: 6 }); if (el) g2.appendChild(el); } });

      // 什么时候在动
      if (A.has(Q('StepCount'))) {
        const sec3 = UI.section('一周里什么时候在走路', '每格是「星期几 × 几点」的平均步数，颜色越亮走得越多。', { color: D.activity.color });
        v.appendChild(sec3.el);
        const sd = A.sumDaily(Q('StepCount'));
        const grid = []; for (let w = 0; w < 7; w++) grid.push(new Float64Array(24));
        const cnt = new Float64Array(7);
        for (let d = r.d0; d <= r.d1; d++) { const k = d - A.day0; if (!sd.has[k]) continue; const w = T.weekdayIdx(d); cnt[w]++; for (let hh = 0; hh < 24; hh++) grid[w][hh] += sd.hourly[k * 24 + hh]; }
        let mx = 0; grid.forEach(function (row, w) { for (let hh = 0; hh < 24; hh++) { row[hh] = cnt[w] ? row[hh] / cnt[w] : NaN; if (row[hh] > mx) mx = row[hh]; } });
        const ramp = C.ramp(D.activity.color, 9);
        const bx = UI.chartBox(); sec3.body.appendChild(h('div', { class: 'panel' }, bx));
        new CH.Matrix(bx, { rows: T.WEEK_MON, cols: Array.from({ length: 24 }, function (_, i) { return i + ''; }), colEvery: 2, get: function (ri, ci) { return grid[ri][ci]; }, color: function (x) { return C.rampAt(ramp, Math.pow(x / mx, 0.8) * 0.9 + 0.1); }, fmt: function (x) { return N.int(x) + ' 步'; }, headOf: function (ri, ci) { return T.WEEK_MON[ri] + ' ' + HL.pad(ci) + ':00–' + HL.pad(ci) + ':59'; }, cellH: 24, rowW: 44 });
      }
      // 换个角度看总量
      const dist = A.has(Q('DistanceWalkingRunning')) ? A.stats(Q('DistanceWalkingRunning')).total : NaN;
      const fl = A.has(Q('FlightsClimbed')) ? A.stats(Q('FlightsClimbed')).total : NaN;
      const kcal = A.ringStats(r.d0, r.d1).moveSum;
      const sec4 = UI.section('换个角度看这些数字', '按常见参照物折算，只是帮助感受量级。');
      v.appendChild(sec4.el);
      sec4.body.appendChild(UI.facts([
        dist === dist ? { k: '走过的距离', v: N.fix(dist, 0), u: '公里', w: '≈ ' + N.fix(dist / 42.195, 1) + ' 个全程马拉松，或绕地球赤道 ' + N.pct(dist / 40075, 1) } : null,
        dist === dist ? { k: '相当于', v: N.fix(dist / 1318, 2), u: '趟京沪高铁', w: '按北京南—上海虹桥约 1,318 公里' } : null,
        fl === fl ? { k: '爬过的楼', v: N.int(fl), u: '层', w: '按每层约 3 米 ≈ ' + N.fix(fl * 3 / 8848.86, 2) + ' 座珠穆朗玛峰' } : null,
        kcal > 0 ? { k: '活动消耗', v: N.int(kcal), u: '千卡', w: '≈ ' + N.int(kcal / 232) + ' 碗米饭（每碗约 200 克熟米饭、232 千卡）' } : null
      ]));
    }
  };

  // =============== 心脏 ===============
  P.heart = {
    title: '心脏', icon: 'heart', color: D.heart.color,
    available: function () { return A.has(Q('HeartRate')) || A.has(Q('RestingHeartRate')) || A.ds.ecgs.length; },
    sub: function () { return '心率、静息心率、心率变异性、逐拍心跳、心肺适能'; },
    render: function (v) {
      const r = A.range, col = D.heart.color;
      // 主视觉：最近一次心电图
      const g0 = UI.grid(); v.appendChild(g0);
      const ecgs = A.ds.ecgs.filter(function (e) { return e.samples && e.samples.length; }).sort(function (a, b) { return b.t - a.t; });
      if (ecgs.length) {
        const e = ecgs[0];
        const p = UI.panel('最近一次心电图', { span: 8, color: col, hint: T.dt(e.t) + ' · ' + e.classification + ' · 前 6 秒' }); g0.appendChild(p.el);
        const bx = UI.chartBox(); p.body.appendChild(bx);
        new CH.ECG(bx, { samples: e.samples.subarray(0, Math.round(e.rate * 6)), rate: e.rate, peaks: e.rPeaks }, { rows: 1, secPerRow: 6, duration: 3200, height: 205 });
        const more = h('button', { class: 'btn sm', type: 'button', text: '全部 ' + ecgs.length + ' 份心电图' }); more.addEventListener('click', function () { HL.App.go('ecg'); }); p.acts.appendChild(more);
      }
      const side = UI.panel('现在的状态', { span: ecgs.length ? 4 : 12, color: col }); g0.appendChild(side.el);
      const latest = function (id) { const t = A.t(Q(id)); if (!t || !t.n) return null; return { v: A.val(t, t.n - 1), t: t.s[t.n - 1] }; };
      const avgLast = function (id, days) { const dv = A.dailyValues(Q(id)); const a = []; for (let d = A.day1 - days + 1; d <= A.day1; d++) { const x = dv[d - A.day0]; if (x === x) a.push(x); } return S.mean(a); };
      const rhr = latest('RestingHeartRate'), hrv = latest('HeartRateVariabilitySDNN'), vo2 = latest('VO2Max'), whr = latest('WalkingHeartRateAverage');
      side.body.appendChild(UI.readouts([
        rhr ? { k: '静息心率', v: rhr.v, fmt: N.int, u: '次/分', s: '近 30 天平均 ' + N.fix(avgLast('RestingHeartRate', 30), 0) } : null,
        hrv ? { k: '心率变异性', v: avgLast('HeartRateVariabilitySDNN', 7), fmt: N.int, u: '毫秒', s: '近 7 天平均（SDNN）' } : null,
        vo2 ? { k: '最大摄氧量', v: vo2.v, fmt: function (x) { return N.fix(x, 1); }, u: 'mL/kg/min', s: T.date(vo2.t) } : null,
        whr ? { k: '步行心率', v: whr.v, fmt: N.int, u: '次/分', s: T.date(whr.t) } : null
      ].filter(Boolean)));
      side.body.firstChild.style.gridTemplateColumns = '1fr 1fr';

      // 心率
      const sec = UI.section('心率', '每天的最低–最高（色带）和平均（线）', { color: col }); v.appendChild(sec.el);
      const g = UI.grid(); sec.body.appendChild(g);
      if (A.has(Q('HeartRate'))) {
        g.appendChild(M.panel(Q('HeartRate'), { span: 12, height: 240, desc: false }));
        // 24 小时剖面
        const t = A.t(Q('HeartRate')), ab = A.idxRange(t, r.d0 * DAY, (r.d1 + 1) * DAY);
        const byH = []; for (let k = 0; k < 24; k++) byH.push([]);
        for (let k = ab[0]; k < ab[1]; k++) { if (t.fl[k] & 2) continue; byH[Math.floor((t.s[k] % DAY) / 3600000)].push(t.v[k]); }
        const qs = byH.map(function (a) { a.sort(function (x, y) { return x - y; }); return [S.q(a, 0.5), S.q(a, 0.25), S.q(a, 0.75), S.q(a, 0.1), S.q(a, 0.9), a.length]; });
        const p1 = UI.panel('一天里的心率节律', { span: 6, desc: '每个钟点的中位数（线）、中间一半（深色带）和 10%–90%（浅色带）。' }); g.appendChild(p1.el);
        const b1 = UI.chartBox(); p1.body.appendChild(b1);
        new CH.Profile24(b1, { mid: qs.map(function (x) { return x[0]; }), lo: qs.map(function (x) { return x[1]; }), hi: qs.map(function (x) { return x[2]; }), lo2: qs.map(function (x) { return x[3]; }), hi2: qs.map(function (x) { return x[4]; }), n: qs.map(function (x) { return x[5]; }), color: col, fmt: N.int, unit: '次/分' });
        // 分布 + 区间
        const st = A.stats(Q('HeartRate'));
        const zb = A.hrZones(); const zr = C.ramp(col, 8);
        const zones = []; let lo = 0; zb.bounds.forEach(function (b, k) { zones.push({ lo: lo, hi: b, color: k === 0 ? 'rgba(150,172,206,0.45)' : zr[2 + k] }); lo = b; }); zones.push({ lo: lo, hi: 999, color: zr[7] });
        const p2 = UI.panel('心率分布', { span: 6, desc: (zb.source === 'apple' ? '颜色是 Apple Watch 给你划分的心率区间：' : '颜色按 220−年龄 估算的心率区间：') + zb.bounds.join(' / ') + ' 次/分。' }); g.appendChild(p2.el);
        const b2 = UI.chartBox(); p2.body.appendChild(b2);
        new CH.Histo(b2, { sorted: st.sorted, color: col, zones: zones, step: 2, fmt: N.int, unit: '次/分', marks: [{ v: st.median, label: '中位 ' + N.int(st.median) }] });
        // 运动状态
        const ctx = A.hrContext(r.d0, r.d1);
        if (ctx && ctx[1].n + ctx[2].n > 50) {
          const p3 = UI.panel('静止时 vs 活动中', { span: 6, desc: 'Apple Watch 给每次心率标了测量时的状态。看静止状态的心率，比混在一起的平均值更能反映身体基线。' }); g.appendChild(p3.el);
          p3.body.appendChild(UI.barList([
            { name: '静止时', sub: N.int(ctx[1].n) + ' 次', v: ctx[1].median, text: N.int(ctx[1].median), unit: '次/分', color: col },
            { name: '活动中', sub: N.int(ctx[2].n) + ' 次', v: ctx[2].median, text: N.int(ctx[2].median), unit: '次/分', color: col },
            { name: '未注明', sub: N.int(ctx[0].n) + ' 次', v: ctx[0].median, text: N.int(ctx[0].median), unit: '次/分', color: 'rgba(150,172,206,0.5)' }
          ], { max: 200 }));
          p3.body.appendChild(UI.note('数值是中位数。静止时 5%–95% 范围：' + N.int(ctx[1].p5) + '–' + N.int(ctx[1].p95) + ' 次/分；活动中：' + N.int(ctx[2].p5) + '–' + N.int(ctx[2].p95) + ' 次/分。'));
        }
        const hb = A.heartbeats(r.d0, r.d1);
        const p4 = UI.panel('心跳了多少次', { span: 6 }); g.appendChild(p4.el);
        p4.body.appendChild(UI.readouts([{ k: '有记录的时段里', v: hb.beats, fmt: function (x) { return N.cn(x, 0); }, u: '次', s: '覆盖 ' + N.int(hb.covered / 60) + ' 小时' }, { k: '按平均心率推算全天', v: hb.covered ? hb.beats / hb.covered * 1440 : NaN, fmt: N.int, u: '次/天', s: '心脏一天大约跳这么多下' }]));
        p4.body.appendChild(UI.note('把相邻两次心率测量之间的时间按心率累加（间隔超过 20 分钟视为没戴手表，不计入）。'));
      }
      // 静息心率 + 个人基准
      if (A.has(Q('RestingHeartRate'))) {
        const sec2 = UI.section('静息心率与你的正常范围', '色带是按你前 30 天的数据算出的「平时范围」（均值 ± 1 个标准差），跳出色带的日子值得留意。', { color: col }); v.appendChild(sec2.el);
        const dv = A.dailyValues(Q('RestingHeartRate'));
        const lo = [], hi = [], ys = [], xs = [];
        const ex = A.extent(Q('RestingHeartRate'), r.d0, r.d1) || [r.d0, r.d1];
        for (let d = ex[0]; d <= ex[1]; d++) {
          xs.push(d); ys.push(dv[d - A.day0]);
          const b = []; for (let k = d - 30; k < d; k++) { const x = dv[k - A.day0]; if (k >= A.day0 && x === x) b.push(x); }
          if (b.length >= 10) { const m = S.mean(b), s = S.std(b); lo.push(m - s); hi.push(m + s); } else { lo.push(NaN); hi.push(NaN); }
        }
        const p = UI.panel(null); sec2.body.appendChild(p.el);
        const bx = UI.chartBox(); p.body.appendChild(bx);
        new CH.TimeChart(bx, { x: xs, gran: 'day', series: [{ name: '平时范围', color: col, type: 'band', lo: lo, hi: hi, alpha: 0.14 }, { name: '静息心率', color: col, type: 'line', y: ys, markers: false }], fmt: N.int, zero: false }, { height: 240 });
        const an = INS.anomalies(r.d0, r.d1);
        p.body.appendChild(UI.note(an.rhrHigh.length ? '高出平时 2 个标准差以上的日子：' + an.rhrHigh.map(function (x) { return T.md(x.day * DAY) + '（' + N.int(x.v) + '）'; }).join('、') : '这段时间没有明显高于平时的日子。'));
      }
      // HRV
      if (A.has(Q('HeartRateVariabilitySDNN'))) {
        const sec3 = UI.section('心率变异性（HRV）', 'Apple 只显示 SDNN。导出包里还带着每次测量的逐拍心跳时间，这里据此另外算出 RMSSD、pNN50 和庞加莱散点图。', { color: col }); v.appendChild(sec3.el);
        const g3 = UI.grid(); sec3.body.appendChild(g3);
        const t = A.t(Q('HeartRateVariabilitySDNN')), hb = A.hrvBeats();
        const nD = A.nDays, rm = new Float64Array(nD), rc = new Float64Array(nD), pn = new Float64Array(nD);
        const ab = A.idxRange(t, r.d0 * DAY, (r.d1 + 1) * DAY);
        const allR = [], allP = [], allS1 = [], allS2 = [];
        for (let k = ab[0]; k < ab[1]; k++) { if (!hb || !(hb.rmssd[k] === hb.rmssd[k])) continue; const di = Math.floor(t.s[k] / DAY) - A.day0; rm[di] += hb.rmssd[k]; pn[di] += hb.pnn50[k]; rc[di]++; allR.push(hb.rmssd[k]); allP.push(hb.pnn50[k]); allS1.push(hb.sd1[k]); allS2.push(hb.sd2[k]); }
        const rmD = Float64Array.from(rm, function (x, i) { return rc[i] ? x / rc[i] : NaN; });
        const sd = A.dailyValues(Q('HeartRateVariabilitySDNN'));
        const exH = A.extent(Q('HeartRateVariabilitySDNN'), r.d0, r.d1) || [r.d0, r.d1];
        const gran = A.autoGran(exH[0], exH[1]);
        const roS = A.rollup(sd, exH[0], exH[1], gran, 'avg'), roR = A.rollup(rmD, exH[0], exH[1], gran, 'avg');
        const p1 = UI.panel('SDNN 与 RMSSD', { span: 12, hint: '单位都是毫秒' }); g3.appendChild(p1.el);
        const b1 = UI.chartBox(); p1.body.appendChild(b1);
        new CH.TimeChart(b1, { x: roS.x, gran: gran, series: [{ name: 'SDNN（Apple 提供）', color: col, type: 'line', y: roS.y }, { name: 'RMSSD（由逐拍心跳计算）', color: '#3987e5', type: 'line', y: roR.y }], fmt: function (x) { return N.int(x) + ' ms'; }, zero: false }, { height: 230 });
        p1.body.appendChild(UI.legend([{ name: 'SDNN（Apple 提供）', color: col }, { name: 'RMSSD（由逐拍心跳计算）', color: '#3987e5' }]));
        const sorted = allR.slice().sort(function (a, b) { return a - b; });
        p1.body.appendChild(UI.readouts([
          { k: 'SDNN 中位数', v: A.stats(Q('HeartRateVariabilitySDNN')).median, fmt: N.int, u: 'ms' },
          { k: 'RMSSD 中位数', v: S.q(sorted, 0.5), fmt: N.int, u: 'ms', s: allR.length + ' 次测量' },
          { k: 'pNN50 平均', text: N.pct(S.mean(allP), 1), s: '相邻心跳间隔相差 >50ms 的比例' },
          { k: 'SD1 / SD2', text: N.fix(S.mean(allS1), 1) + ' / ' + N.fix(S.mean(allS2), 1), u: 'ms', s: '短期 / 长期变异' },
          { k: '逐拍心跳', v: A.ds.beats.t.length, fmt: function (x) { return N.cn(x); }, u: '次', s: '导出包全部' }
        ], { tight: true }));
        const pc = A.poincare(r.d0, r.d1, 7000);
        const p2 = UI.panel('庞加莱散点图', { span: 6, desc: '每个点是一对相邻心跳间隔（这一跳，下一跳）。点云越“胖”，心率变异越大；椭圆的短轴对应 SD1，长轴对应 SD2。' }); g3.appendChild(p2.el);
        const b2 = UI.chartBox(); p2.body.appendChild(b2);
        const mx = S.mean(pc.x);
        new CH.Scatter(b2, { x: pc.x, y: pc.y, color: col, identity: true, alpha: 0.28, r: 1.4, xLabel: 'RRₙ（毫秒）', yLabel: 'RRₙ₊₁（毫秒）', ellipse: { cx: mx, cy: mx, sd1: S.mean(allS1), sd2: S.mean(allS2) }, tip: function (i, el) { CH.tt.row(el, col, N.int(pc.x[i]) + ' → ' + N.int(pc.y[i]) + ' ms', '相邻两次心跳间隔'); } }, { height: 320 });
        p2.body.appendChild(UI.note('显示了 ' + N.int(pc.x.length) + ' 对（从 ' + N.int(pc.n) + ' 对里均匀抽样）。'));
        // HRV 按时段
        const byH = []; for (let k = 0; k < 24; k++) byH.push([]);
        for (let k = ab[0]; k < ab[1]; k++) byH[Math.floor((t.s[k] % DAY) / 3600000)].push(t.v[k]);
        const qs = byH.map(function (a) { a.sort(function (x, y) { return x - y; }); return [S.q(a, 0.5), S.q(a, 0.25), S.q(a, 0.75), a.length]; });
        const p3 = UI.panel('HRV 在一天里的变化', { span: 6, desc: 'Apple Watch 多在你静止时测 HRV。夜间和清晨通常较高。' }); g3.appendChild(p3.el);
        const b3 = UI.chartBox(); p3.body.appendChild(b3);
        new CH.Profile24(b3, { mid: qs.map(function (x) { return x[0]; }), lo: qs.map(function (x) { return x[1]; }), hi: qs.map(function (x) { return x[2]; }), n: qs.map(function (x) { return x[3]; }), color: col, fmt: N.int, unit: 'ms' }, { height: 300 });
      }
      // 其他心脏指标
      const sec4 = UI.section('更多心脏指标', null, { color: col }); v.appendChild(sec4.el);
      const g4 = UI.grid(); sec4.body.appendChild(g4);
      ['WalkingHeartRateAverage', 'VO2Max', 'HeartRateRecoveryOneMinute', 'AtrialFibrillationBurden'].forEach(function (s) { if (A.has(Q(s))) { const el = M.panel(Q(s), { span: 6, desc: s === 'AtrialFibrillationBurden' ? CAT.type(Q(s)).desc + ' 你的 ' + A.t(Q(s)).n + ' 条记录里，有 ' + (function () { const t = A.t(Q(s)); let c = 0; for (let i = 0; i < t.n; i++) if (t.fl[i] & 16) c++; return c; })() + ' 条低于可检测下限（导出值记为 2%）。' : undefined }); if (el) g4.appendChild(el); } });
      A.ds.types.forEach(function (t) { if (t.n && t.def.dom === 'heart' && t.def.kind === 'event') { const el = M.panel(t.id, { span: 6 }); if (el) g4.appendChild(el); } });
    }
  };

  // =============== 睡眠 ===============
  P.sleep = {
    title: '睡眠', icon: 'sleep', color: D.sleep.color,
    available: function () { return A.sleepNights().length > 0; },
    sub: function () { return '每一晚的分期、作息规律、睡眠中的身体指标'; },
    render: function (v, params) {
      const r = A.range, col = D.sleep.color;
      const all = A.sleepNights(), ns = A.nightsIn(r.d0, r.d1);
      if (!ns.length) { v.appendChild(UI.empty('这个时间范围内没有睡眠记录。全部记录在 ' + T.date(all[0].day * DAY) + ' – ' + T.date(all[all.length - 1].day * DAY) + '。')); return; }
      let cur = params.night ? ns.findIndex(function (n) { return n.day === +params.night; }) : -1;
      if (cur < 0) { cur = ns.length - 1; for (let k = ns.length - 1; k >= 0; k--) if (ns[k].kind === 'stages') { cur = k; break; } }
      const hero = UI.panel(null); v.appendChild(hero.el);
      let hyp = null;
      const draw = function () {
        const n = ns[cur];
        CH.destroyAll(hero.body); hero.body.textContent = '';
        const top = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' } },
          h('div', null, h('div', { class: 'note', text: n.kind === 'inbed' ? 'iPhone 记录的在床时间' : n.daytime ? '这一天的主睡眠（在白天）' : '这一晚' }), h('div', { style: { fontSize: '20px', fontWeight: 600 }, text: T.date((n.day - 1) * DAY, { noYear: false }) + ' 晚 → ' + T.date(n.day * DAY, { week: true, noYear: true }) })));
        const nav = h('div', { style: { display: 'flex', gap: '6px' } });
        const pb = h('button', { class: 'btn sm', type: 'button' }, UI.icon('chevL'), '前一晚'), nb = h('button', { class: 'btn sm', type: 'button' }, '后一晚', UI.icon('chevR'));
        pb.disabled = cur <= 0; nb.disabled = cur >= ns.length - 1;
        pb.addEventListener('click', function () { if (cur > 0) { cur--; draw(); } }); nb.addEventListener('click', function () { if (cur < ns.length - 1) { cur++; draw(); } });
        nav.appendChild(pb); nav.appendChild(nb); top.appendChild(nav); hero.body.appendChild(top);
        if (n.kind === 'stages') {
          const bx = UI.chartBox(); hero.body.appendChild(bx);
          hyp = new CH.Hypno(bx, { segs: n.segs, s0: Math.min(n.start, isFinite(n.inBedStart) ? n.inBedStart : n.start) - 10 * 60000, s1: Math.max(n.end, isFinite(n.inBedEnd) ? n.inBedEnd : n.end) + 10 * 60000, inBed: [n.inBedStart, n.inBedEnd] }, { height: 240 });
          hero.body.appendChild(UI.readouts([
            { k: '睡眠时长', text: T.dur(n.asleep), s: T.hm(n.start) + ' 入睡 · ' + T.hm(n.end) + ' 醒来', big: true },
            { k: '深度睡眠', text: T.dur(n.deep), s: N.pct(n.deep / n.asleep) },
            { k: '核心睡眠', text: T.dur(n.core), s: N.pct(n.core / n.asleep) },
            { k: '快速动眼', text: T.dur(n.rem), s: N.pct(n.rem / n.asleep) + (n.remLatency === n.remLatency ? ' · 入睡 ' + T.dur(n.remLatency) + ' 后首次' : '') },
            { k: '清醒', text: T.dur(n.awake), s: '醒来 ' + n.awakenings + ' 次' },
            { k: '睡眠效率', text: N.pct(n.efficiency), s: '入睡到醒来之间真正睡着的比例' },
            n.latency === n.latency ? { k: '入睡用时', text: T.dur(n.latency), s: '从「在床」到睡着' } : null,
            n.naps.length ? { k: '小睡', text: n.naps.length + ' 次', s: T.dur(n.napSecs) } : null
          ], { tight: true }));
        } else {
          hero.body.appendChild(UI.readouts([{ k: n.kind === 'inbed' ? '在床时长' : '睡眠时长', text: T.dur(n.asleep), big: true }, { k: '开始', text: T.hm(n.start) }, { k: '结束', text: T.hm(n.end) }, { k: '来源', text: n.srcName }]));
          hero.body.appendChild(UI.note(n.kind === 'inbed' ? '这一晚只有 iPhone「睡眠」专注模式记下的在床时间，没有手表测量，所以没有分期。' : '这一晚只有「睡着」与否，没有分期。'));
        }
      };
      draw();
      // 时间窗
      const st = A.sleepStats(r.d0, r.d1);
      const sec = UI.section('每晚几点睡、几点醒', '每根竖条是一晚，从入睡画到醒来，颜色是睡眠阶段；浅色是只有在床时间的夜晚。点一根看那一晚。', { color: col }); v.appendChild(sec.el);
      const p0 = UI.panel(null); sec.body.appendChild(p0.el);
      const b0 = UI.chartBox(); p0.body.appendChild(b0);
      new CH.SleepWin(b0, { nights: ns, d0: ns[0].day, d1: ns[ns.length - 1].day, onPick: function (n) { cur = ns.indexOf(n); draw(); document.getElementById('main').scrollTo({ top: 0, behavior: 'smooth' }); } }, { height: 320 });
      p0.body.appendChild(UI.legend([{ name: '深度', color: CH.STAGE_COL[4], box: true }, { name: '核心', color: CH.STAGE_COL[3], box: true }, { name: '快速动眼', color: CH.STAGE_COL[5], box: true }, { name: '清醒', color: CH.STAGE_COL[2], box: true }, { name: '在床（iPhone）', color: 'rgba(127,114,230,0.45)', box: true }]));
      // 汇总
      sec.body.appendChild(h('div', { style: { height: '16px' } }));
      if (st.daytimeN) sec.body.appendChild(UI.note('有 ' + st.daytimeN + ' 次主睡眠发生在白天（睡眠中点在中午到晚上 8 点之间，多半是熬夜后补觉），时长照常统计，但不计入「几点睡、几点醒」的统计。'));
      sec.body.appendChild(UI.readouts([
        { k: '平均睡眠', text: T.dur(st.asleep), s: st.measured ? st.measured + ' 晚手表数据' : st.nights + ' 晚在床记录' },
        { k: '通常几点睡着', text: T.clock(st.bed + 1080), s: '一半的夜晚在 ' + T.clock(st.bedQ1 + 1080) + '–' + T.clock(st.bedQ3 + 1080) },
        { k: '通常几点醒来', text: T.clock(st.wake), s: '一半的早上在 ' + T.clock(st.wakeQ1) + '–' + T.clock(st.wakeQ3) },
        { k: '达到目标', text: N.pct(st.goalHit / st.pool.length), s: '≥ ' + T.dur(A.settings.sleepGoalMin * 60) + '：' + st.goalHit + ' 晚' },
        isFinite(st.jetlag) ? { k: '社会时差', text: T.dur(Math.abs(st.jetlag) * 60), s: '周末比工作日' + (st.jetlag >= 0 ? '晚' : '早') } : null,
        isFinite(st.sri) ? { k: '规律性指数 SRI', v: st.sri, fmt: function (x) { return N.fix(x, 0); }, s: '−100 到 100，越高越规律' } : null,
        st.staged ? { k: '平均醒来次数', v: st.awakenings, fmt: function (x) { return N.fix(x, 1); }, u: '次/晚' } : null
      ]));
      // 时长与分期
      const sec2 = UI.section('睡了多久、怎么分配', '每晚各阶段的时长叠在一起；横线是你的睡眠目标（可在设置里改）。', { color: col }); v.appendChild(sec2.el);
      const g = UI.grid(); sec2.body.appendChild(g);
      const p1 = UI.panel(null, { span: 8 }); g.appendChild(p1.el);
      const byDay = new Map(); ns.forEach(function (n) { byDay.set(n.day, n); });
      const sd0 = ns[0].day, sd1 = ns[ns.length - 1].day;
      let sgran = A.autoGran(sd0, sd1);
      const b1 = UI.chartBox(); p1.body.appendChild(b1);
      const fh = function (x) { return T.dur(x * 3600); };
      const stageKeys = [['deep', '深度', CH.STAGE_COL[4]], ['core', '核心', CH.STAGE_COL[3]], ['rem', '快速动眼', CH.STAGE_COL[5]], ['unspec', '睡眠（未分期）', '#7f72e6'], ['awake', '清醒', CH.STAGE_COL[2]]];
      const sleepData = function () {
        const daily = {}; stageKeys.forEach(function (k) { daily[k[0]] = new Float64Array(A.nDays).fill(NaN); });
        const ibD = new Float64Array(A.nDays).fill(NaN), asD = new Float64Array(A.nDays).fill(NaN);
        ns.forEach(function (n) { const i = n.day - A.day0; if (n.kind === 'stages') stageKeys.forEach(function (k) { daily[k[0]][i] = n[k[0]] / 3600; }); else if (n.kind === 'inbed') ibD[i] = n.asleep / 3600; else asD[i] = n.asleep / 3600; });
        const mode = sgran === 'day' ? 'sum' : 'avg';
        const roA = A.rollup(asD, sd0, sd1, sgran, mode).y;
        const sers = stageKeys.map(function (k) { const ro = A.rollup(daily[k[0]], sd0, sd1, sgran, mode); const y = k[0] === 'unspec' ? ro.y.map(function (v, j) { const ra = roA[j]; return (v === v ? v : 0) + (ra === ra ? ra : 0) || NaN; }) : ro.y; return { name: k[1], color: k[2], type: 'bar', stack: true, y: y, x: ro.x, fmt: fh }; });
        const roI = A.rollup(ibD, sd0, sd1, sgran, mode);
        const hasStage = sers[0].y.map(function (v, j) { return sers.some(function (s2) { return s2.y[j] === s2.y[j] && s2.y[j] > 0; }); });
        sers.push({ name: '在床（iPhone）', color: 'rgba(127,114,230,0.45)', type: 'bar', stack: true, y: roI.y.map(function (v, j) { return hasStage[j] ? NaN : v; }), fmt: fh });
        return { x: sers[0].x, gran: sgran, series: sers.filter(function (x) { return x.y.some(function (v) { return v === v && v > 0; }); }), goal: { v: A.settings.sleepGoalMin / 60, label: '目标 ' + T.dur(A.settings.sleepGoalMin * 60) }, fmt: fh, yFmt: function (x) { return x + ' 时'; }, label: sgran === 'day' ? function (day) { return T.date(day * DAY, { week: true }) + ' 醒来'; } : null,
          onPick: sgran === 'day' ? function (i, day) { const k = ns.findIndex(function (n) { return n.day === day; }); if (k >= 0) { cur = k; draw(); document.getElementById('main').scrollTo({ top: 0, behavior: 'smooth' }); } } : null };
      };
      const sch = new CH.TimeChart(b1, null, { height: 250 });
      sch.update(sleepData());
      p1.acts.appendChild(UI.seg([{ v: 'day', label: '每晚' }, { v: 'week', label: '周平均' }, { v: 'month', label: '月平均' }], sgran, function (v2) { sgran = v2; sch.update(sleepData()); }, 'sm'));
      const p2 = UI.panel('平均一晚的构成', { span: 4, hint: st.staged + ' 晚有分期' }); g.appendChild(p2.el);
      if (st.staged) {
        p2.body.appendChild(UI.segBar([{ name: '深度', v: st.deep, color: CH.STAGE_COL[4], valText: T.dur(st.deep) }, { name: '核心', v: st.core, color: CH.STAGE_COL[3], valText: T.dur(st.core) }, { name: '快速动眼', v: st.rem, color: CH.STAGE_COL[5], valText: T.dur(st.rem), dark: true }, { name: '清醒', v: st.awake, color: CH.STAGE_COL[2], valText: T.dur(st.awake) }], { legendVal: function (p) { return T.dur(p.v); } }));
        p2.body.appendChild(h('div', { style: { height: '14px' } }));
        p2.body.appendChild(UI.facts([{ k: '最长的一晚', v: T.dur(st.longest.asleep), w: T.date(st.longest.day * DAY) }, { k: '最短的一晚', v: T.dur(st.shortest.asleep), w: T.date(st.shortest.day * DAY) }, st.mostDeep ? { k: '深睡最多', v: T.dur(st.mostDeep.deep), w: T.date(st.mostDeep.day * DAY) } : null, { k: '睡得最晚', v: T.hm(st.latestBed.start), w: T.date((st.latestBed.day - 1) * DAY) + ' 晚' }, { k: '醒得最早', v: T.hm(st.earliestWake.end), w: T.date(st.earliestWake.day * DAY) }, { k: '醒得最晚', v: T.hm(st.latestWake.end), w: T.date(st.latestWake.day * DAY) }]));
      } else p2.body.appendChild(UI.empty('这段时间没有带分期的睡眠（需要 Apple Watch）'));
      // 星期规律
      const sec3 = UI.section('一周里的睡眠规律', '按醒来那天是星期几分组。周五、周六晚上的睡眠落在周六、周日。', { color: col }); v.appendChild(sec3.el);
      const g3 = UI.grid(); sec3.body.appendChild(g3);
      const wkA = [[], [], [], [], [], [], []], wkB = [[], [], [], [], [], [], []];
      st.pool.forEach(function (n) { const w = T.weekdayIdx(n.day); wkA[w].push(n.asleep / 3600); if (!n.daytime) wkB[w].push(n.bedMin); });
      const pA = UI.panel('平均睡多久', { span: 6 }); g3.appendChild(pA.el); const bA = UI.chartBox(); pA.body.appendChild(bA);
      new CH.Bars(bA, { labels: T.WEEK_MON, y: wkA.map(S.mean), color: col, fmt: function (x) { return T.dur(x * 3600); }, valueLabels: true, yFmt: function (x) { return x + '时'; } }, { height: 190 });
      const pB = UI.panel('平均几点入睡', { span: 6 }); g3.appendChild(pB.el); const bB = UI.chartBox(); pB.body.appendChild(bB);
      const bm = wkB.map(function (a) { return S.mean(a); });
      const base = Math.floor((Math.min.apply(null, bm.filter(function (x) { return x === x; })) - 60) / 60) * 60;
      new CH.Bars(bB, { labels: T.WEEK_MON, y: bm.map(function (x) { return x - base; }), color: col, fmt: function (x) { return T.clock(x + base + 1080); }, valueLabels: true, yFmt: function (x) { return T.clock(x + base + 1080); }, tip: function (i, el) { CH.tt.head(el, T.WEEK_MON[i] + '醒来的那晚'); CH.tt.row(el, col, T.clock(bm[i] + 1080), '平均入睡（' + wkB[i].length + ' 晚）'); } }, { height: 190 });
      // 睡眠中的身体
      const sec4 = UI.section('睡眠时的身体指标', '这些都是 Apple Watch 在你睡着时测的。', { color: col }); v.appendChild(sec4.el);
      const g4 = UI.grid(); sec4.body.appendChild(g4);
      ['AppleSleepingWristTemperature', 'RespiratoryRate', 'AppleSleepingBreathingDisturbances', 'OxygenSaturation'].forEach(function (s) { if (A.has(Q(s))) { const el = M.panel(Q(s), { span: 6 }); if (el) g4.appendChild(el); } });
      if (!g4.children.length) g4.appendChild(UI.empty('没有睡眠中的体征数据'));
    }
  };
})();
