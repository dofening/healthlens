/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 页面：体能训练、行动能力、呼吸、听力与环境、身体、心电图 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, S = HL.S, C = HL.C, A = HL.A, CH = HL.CH, UI = HL.UI, CAT = HL.CAT, M = HL.M;
  const DAY = 86400000;
  const P = HL.pages;
  const D = CAT.DOMAINS;
  const Q = function (s) { return A.Q(s); };
  const WCOL = { Walking: '#3987e5', Running: '#d95926', Cycling: '#199e70', HighIntensityIntervalTraining: '#c98500', Swimming: '#d55181', Hiking: '#0ca30c', Yoga: '#9085e9' };
  function wColor(type, idx) { const k = String(type).replace('HKWorkoutActivityType', ''); return WCOL[k] || CH.PAL[(idx || 0) % 8]; }
  HL.wColor = wColor;

  HL.workoutTable = function (list, opt) {
    opt = opt || {};
    return UI.table([
      { k: 's', label: '开始', fmt: function (w) { return T.date(w.s, { noYear: !!opt.noYear }) + ' ' + T.hm(w.s); }, sort: function (w) { return w.s; } },
      { k: 'name', label: '类型', fmt: function (w) { const s = h('span', null, UI.tag(w.name, wColor(w.type))); if (w.dup) s.appendChild(UI.tag('重复', null, 'warn')); if (w.userEntered) s.appendChild(UI.tag('手动', null)); if (w.indoor) s.appendChild(UI.tag('室内', null)); return s; }, sort: function (w) { return w.name; } },
      { k: 'dur', label: '时长', n: true, fmt: function (w) { return T.dur(w.durMin * 60); }, sort: function (w) { return w.durMin; } },
      { k: 'dist', label: '距离', n: true, fmt: function (w) { return w.distKm > 0 ? N.fix(w.distKm, 2) + ' km' : '—'; }, sort: function (w) { return w.distKm || 0; } },
      { k: 'pace', label: '配速', n: true, fmt: function (w) { return w.paceMinKm > 0 && w.paceMinKm < 40 ? CH.pace(w.paceMinKm * 60) : '—'; }, sort: function (w) { return w.paceMinKm || 99; } },
      { k: 'kcal', label: '活动能量', n: true, fmt: function (w) { return w.kcal > 0 ? N.int(w.kcal) + ' 千卡' : '—'; }, sort: function (w) { return w.kcal || 0; } },
      { k: 'hr', label: '平均心率', n: true, fmt: function (w) { return w.hrAvg > 0 ? N.int(w.hrAvg) : '—'; }, sort: function (w) { return w.hrAvg || 0; } },
      { k: 'wx', label: '天气', fmt: function (w) { return w.tempC === w.tempC ? N.fix(w.tempC, 0) + ' °C' + (w.humidity === w.humidity ? ' · ' + N.pct(w.humidity) : '') : '—'; }, muted: true },
      { k: 'src', label: '来源', muted: true, fmt: function (w) { return w.srcName + (w.route ? ' · 有轨迹' : ''); } }
    ], list, { onClick: HL.openWorkout, sortK: 's', dir: -1, maxH: opt.maxH || 560, limit: opt.limit });
  };

  // ---------- 单次训练详情 ----------
  HL.openWorkout = function (w) {
    UI.drawer(w.name + ' · ' + T.date(w.s, { week: true }), function (body) {
      body.appendChild(UI.readouts([
        { k: '时长', text: T.dur(w.durMin * 60), s: T.hm(w.s) + ' – ' + T.hm(w.e), big: true },
        w.distKm > 0 ? { k: '距离', v: w.distKm, fmt: function (x) { return N.fix(x, 2); }, u: '公里' } : null,
        w.paceMinKm > 0 && w.paceMinKm < 40 ? { k: '平均配速', text: CH.pace(w.paceMinKm * 60), u: '/公里', s: N.fix(w.speedKmh, 1) + ' km/h' } : null,
        w.kcal > 0 ? { k: '活动能量', v: w.kcal, fmt: N.int, u: '千卡', s: w.basalKcal > 0 ? '总计 ' + N.int(w.kcal + w.basalKcal) + ' 千卡' : '' } : null,
        w.hrAvg > 0 ? { k: '平均心率', v: w.hrAvg, fmt: N.int, u: '次/分', s: '最高 ' + N.int(w.hrMax) + (w.hrMin > 0 ? ' · 最低 ' + N.int(w.hrMin) : '') } : null,
        w.mets > 0 ? { k: '平均强度', v: w.mets, fmt: function (x) { return N.fix(x, 1); }, u: 'MET' } : null,
        w.elevM === w.elevM ? { k: '累计爬升', v: w.elevM, fmt: function (x) { return N.fix(x, 0); }, u: '米' } : null,
        w.tempC === w.tempC ? { k: '天气', text: N.fix(w.tempC, 1) + ' °C', s: w.humidity === w.humidity ? '湿度 ' + N.pct(w.humidity) : '' } : null,
        w.effort === w.effort ? { k: '强度评分', v: w.effort, fmt: function (x) { return N.fix(x, 0); }, u: '/ 10', s: w.effortUser ? '你自己打的分' : 'Apple Watch 估算' } : null,
        w.steps > 0 ? { k: '步数', v: w.steps, fmt: N.int, u: '步' } : null
      ].filter(Boolean), { tight: true }));
      const g = UI.grid(); g.style.marginTop = '16px'; body.appendChild(g);
      if (w.route) {
        const m = w.route.metrics;
        const p = UI.panel('路线', { span: 12, hint: N.fix(m.distKm, 2) + ' 公里 · ' + N.int(m.points) + ' 个 GPS 点 · 颜色表示速度（越亮越快）' }); g.appendChild(p.el);
        const bx = UI.chartBox(); p.body.appendChild(bx);
        new CH.RouteMap(bx, { routes: [w.route], colorBy: 'speed', ramp: C.ramp(wColor(w.type), 9) }, { height: 360 });
        p.body.appendChild(UI.note('移动时间 ' + T.dur(m.movingSec) + '（总 ' + T.dur(m.durSec) + '），最快速度 ' + N.fix(m.maxSpeed * 3.6, 1) + ' km/h（10 秒平滑）。' + (m.hasEle ? '' : '这条轨迹没有海拔数据。') + '起点 ' + N.fix(m.start[0], 4) + ', ' + N.fix(m.start[1], 4) + '。'));
        if (m.splits.length) {
          const ps = UI.panel('每公里分段', { span: 6 }); g.appendChild(ps.el);
          const best = Math.min.apply(null, m.splits.filter(function (s) { return !s.partial; }).map(function (s) { return s.sec; }).concat([Infinity]));
          ps.body.appendChild(UI.barList(m.splits.map(function (s, i) { const pace = s.sec / (s.dist / 1000); return { name: s.partial ? '最后 ' + N.fix(s.dist / 1000, 2) + ' 公里' : '第 ' + (i + 1) + ' 公里', v: 1 / pace, text: CH.pace(pace), unit: '/公里', color: s.sec === best ? wColor(w.type) : C.rgba(wColor(w.type), 0.55) }; })));
        }
      }
      const hr = A.workoutHR(w);
      if (hr.t.length > 3) {
        const p = UI.panel('心率曲线', { span: w.route && w.route.metrics.splits.length ? 6 : 12, color: D.heart.color, hint: hr.t.length + ' 次测量' }); g.appendChild(p.el);
        const bx = UI.chartBox(); p.body.appendChild(bx);
        new CH.Intraday(bx, { t0: w.s - 60000, t1: w.e + 3 * 60000, lines: [{ name: '心率', color: D.heart.color, t: hr.t, v: hr.v, unit: '次/分', gap: 5 * 60000 }], fmt: N.int }, { height: 220 });
      }
      if (w.zones && w.zones.zones.length) {
        const p = UI.panel('心率区间', { span: 12, desc: 'Apple Watch 记下的每个心率区间里停留的时长。' }); g.appendChild(p.el);
        const zr = C.ramp(D.heart.color, 8);
        p.body.appendChild(UI.segBar(w.zones.zones.map(function (z, i) { return { name: '区间 ' + (i + 1) + '（' + (z.min === z.min ? N.int(z.min) : '<') + (z.max === z.max ? '–' + N.int(z.max) : '+') + '）', v: z.duration * (z.unit === 's' ? 1 / 60 : 1), color: zr[3 + i] || zr[7], valText: T.dur(z.duration * (z.unit === 's' ? 1 : 60)) }; }), { legendVal: function (p) { return p.valText; } }));
      }
      // 元数据
      const p = UI.panel('原始信息', { span: 12 }); g.appendChild(p.el);
      const kv = h('dl', { class: 'kv' });
      const add = function (k, val) { if (val === undefined || val === null || val === '') return; kv.appendChild(h('dt', { text: k })); kv.appendChild(h('dd', { text: String(val) })); };
      add('类型标识', w.type); add('来源', w.srcName + (w.w.sourceVersion ? '（版本 ' + w.w.sourceVersion + '）' : ''));
      const dev = w.w.dev ? A.ds.devices[w.w.dev - 1] : null; if (dev) add('设备', (dev.name || '') + ' ' + (CAT.deviceLabel(dev) || dev.hardware || ''));
      add('写入时间', T.dtFull(w.w.created)); add('开始', T.dtFull(w.s)); add('结束', T.dtFull(w.e));
      Object.keys(w.w.meta).forEach(function (k) { add(CAT.META_CN[k] || k, w.w.meta[k]); });
      Object.keys(w.w.stats).forEach(function (k) { const s = w.w.stats[k]; add('统计 · ' + CAT.type(k).name, [s.sum === s.sum ? '合计 ' + N.auto(s.sum) : '', s.avg === s.avg ? '平均 ' + N.auto(s.avg) : '', s.min === s.min ? '最低 ' + N.auto(s.min) : '', s.max === s.max ? '最高 ' + N.auto(s.max) : ''].filter(Boolean).join('，') + ' ' + (s.unit || '')); });
      const EVN = { Pause: '暂停', Resume: '继续', Segment: '分段', Marker: '标记', Lap: '圈', MotionPaused: '自动暂停', MotionResumed: '自动继续', PauseOrResumeRequest: '暂停/继续请求' };
      if (w.events.length) { const ec = {}; w.events.forEach(function (e) { const k = String(e.type).replace('HKWorkoutEventType', ''); ec[k] = (ec[k] || 0) + 1; }); add('事件', Object.keys(ec).map(function (k) { return (EVN[k] || k) + ' × ' + ec[k]; }).join('，')); }
      if (w.w.routes.length) add('轨迹文件', w.w.routes.map(function (r) { return r.path; }).join('，'));
      p.body.appendChild(kv);
    });
  };

  // =============== 体能训练 ===============
  P.workouts = {
    title: '体能训练', icon: 'workout', color: D.activity.color,
    available: function () { return A.ds.workouts.length > 0; },
    count: function () { return String(A.workouts.filter(A.workoutValid).length); },
    sub: function () { return '每一次训练、GPS 路线、配速、心率区间'; },
    render: function (v, params) {
      const r = A.range;
      const all = A.workoutsIn(r.d0, r.d1, true), list = all.filter(A.workoutValid);
      if (!all.length) { v.appendChild(UI.empty('这个时间范围内没有体能训练')); return; }
      if (!list.length) {
        v.appendChild(UI.empty('这个时间范围内的 ' + all.length + ' 条体能训练都是重复写入或手动录入的，默认不计入统计（可在设置里把「手动录入」改为计入）。下面列出原始记录。'));
        const secE = UI.section('全部体能训练', null, { color: D.activity.color }); v.appendChild(secE.el);
        secE.body.appendChild(HL.workoutTable(all));
        return;
      }
      // 路线总图
      const withRoute = list.filter(function (w) { return w.route; });
      if (withRoute.length) {
        // 按 0.3° 网格找最大的聚集区
        const cells = new Map(); withRoute.forEach(function (w) { const s = w.route.metrics.start; const k = Math.round(s[0] / 0.3) + ',' + Math.round(s[1] / 0.3); cells.set(k, (cells.get(k) || []).concat([w])); });
        const groups = Array.from(cells.values()).sort(function (a, b) { return b.length - a.length; });
        const p = UI.panel('你走过、骑过的路线', { color: D.activity.color, hint: '点一条路线查看那次训练' }); v.appendChild(p.el);
        const holder = h('div'); p.body.appendChild(holder);
        const showGroup = function (gi) {
          CH.destroyAll(holder); holder.textContent = '';
          const grp = groups[gi];
          const bx = UI.chartBox(); holder.appendChild(bx);
          new CH.RouteMap(bx, { routes: grp.map(function (w) { const rt = w.route; rt.color = wColor(w.type); rt.title = w.name + ' ' + T.md(w.s); return rt; }), colorBy: 'none', onPick: function (i) { HL.openWorkout(grp[i]); } }, { height: 420, duration: 3200 });
          const types = {}; grp.forEach(function (w) { types[w.type] = w.name; });
          holder.appendChild(UI.legend(Object.keys(types).map(function (k) { return { name: types[k], color: wColor(k) }; })));
        };
        if (groups.length > 1) {
          const centers = groups.map(function (g) { const s0 = g[0].route.metrics.start; return N.fix(s0[0], 2) + '°N ' + N.fix(s0[1], 2) + '°E'; });
          p.acts.appendChild(UI.seg(groups.map(function (g, i) { return { v: i, label: '区域 ' + (i + 1) + ' · ' + g.length + ' 条', title: '起点大约在 ' + centers[i] }; }), 0, showGroup, 'sm'));
        }
        showGroup(0);
        p.body.appendChild(UI.note('没有加载在线地图（软件不联网），路线画在经纬网上；比例尺在右下角。轨迹按出发地点相距约 30 公里分成不同区域。'));
      }
      const dupN = all.filter(function (w) { return w.dup; }).length, manN = all.filter(function (w) { return !w.dup && w.userEntered && A.settings.excludeUserEntered; }).length;
      const tot = function (f) { return S.sum(list.map(f)); };
      v.appendChild(h('div', { style: { height: '18px' } }));
      v.appendChild(UI.readouts([
        { k: '训练次数', v: list.length, fmt: N.int, u: '次', s: [dupN ? dupN + ' 条重复已合并' : '', manN ? manN + ' 条手动录入未计入' : ''].filter(Boolean).join('，') },
        { k: '总时长', text: T.dur(tot(function (w) { return w.durMin; }) * 60) },
        { k: '总距离', v: tot(function (w) { return w.distKm > 0 ? w.distKm : 0; }), fmt: function (x) { return N.fix(x, 1); }, u: '公里' },
        { k: '活动能量', v: tot(function (w) { return w.kcal > 0 ? w.kcal : 0; }), fmt: N.int, u: '千卡' },
        { k: '有 GPS 轨迹', v: withRoute.length, fmt: N.int, u: '次' },
        { k: '有心率区间', v: list.filter(function (w) { return w.zones; }).length, fmt: N.int, u: '次' }
      ]));
      // 按类型
      const g = UI.grid(); g.style.marginTop = '18px'; v.appendChild(g);
      const byType = {}; list.forEach(function (w) { const o = byType[w.type] || (byType[w.type] = { name: w.name, type: w.type, n: 0, min: 0, km: 0, kcal: 0 }); o.n++; o.min += w.durMin; o.km += w.distKm > 0 ? w.distKm : 0; o.kcal += w.kcal > 0 ? w.kcal : 0; });
      const tl = Object.values(byType).sort(function (a, b) { return b.min - a.min; });
      const p1 = UI.panel('按类型', { span: 5, hint: '按总时长排序' }); g.appendChild(p1.el);
      p1.body.appendChild(UI.barList(tl.map(function (o) { return { name: o.name, sub: o.n + ' 次' + (o.km ? ' · ' + N.fix(o.km, 1) + ' km' : ''), v: o.min, text: T.dur(o.min * 60), color: wColor(o.type) }; })));
      // 每月训练量（按类型堆叠）
      const p2 = UI.panel('每个月练了多久', { span: 7 }); g.appendChild(p2.el);
      const gran = r.d1 - r.d0 > 120 ? 'month' : 'week';
      const series = tl.slice(0, 6).map(function (o) {
        const dv = new Float64Array(A.nDays).fill(NaN);
        list.forEach(function (w) { if (w.type !== o.type) return; const i = w.day - A.day0; dv[i] = (dv[i] === dv[i] ? dv[i] : 0) + w.durMin / 60; });
        const ro = A.rollup(dv, r.d0, r.d1, gran, 'sum');
        return { name: o.name, color: wColor(o.type), type: 'bar', stack: true, y: ro.y, x: ro.x, fmt: function (x) { return T.dur(x * 3600); } };
      });
      const b2 = UI.chartBox(); p2.body.appendChild(b2);
      new CH.TimeChart(b2, { x: series[0].x, gran: gran, series: series, fmt: function (x) { return T.dur(x * 3600); }, yFmt: function (x) { return x + ' 时'; } }, { height: 230 });
      if (series.length > 1) p2.body.appendChild(UI.legend(series.map(function (s) { return { name: s.name, color: s.color, box: true }; })));
      // 个人最佳
      const best = function (f, filter) { let b = null; list.forEach(function (w) { if (filter && !filter(w)) return; const x = f(w); if (x === x && x > 0 && (!b || x > f(b))) b = w; }); return b; };
      const lng = best(function (w) { return w.durMin; }), far = best(function (w) { return w.distKm; }), kc = best(function (w) { return w.kcal; });
      const fastRun = best(function (w) { return 1 / w.paceMinKm; }, function (w) { return /Running/.test(w.type) && w.distKm >= 1; });
      const fastWalk = best(function (w) { return 1 / w.paceMinKm; }, function (w) { return /Walking/.test(w.type) && w.distKm >= 1; });
      const hrMax = best(function (w) { return w.hrMax; });
      const p3 = UI.panel('个人最佳', { span: 12 }); g.appendChild(p3.el);
      const fact = function (k, w, val, u) { return w ? { k: k, v: val, u: u, w: w.name + ' · ' + T.date(w.s) } : null; };
      p3.body.appendChild(UI.facts([
        fact('最长的一次', lng, lng && T.dur(lng.durMin * 60), ''), fact('最远的一次', far, far && N.fix(far.distKm, 2), '公里'), fact('消耗最多', kc, kc && N.int(kc.kcal), '千卡'),
        fact('最快的跑步（≥1 公里）', fastRun, fastRun && CH.pace(fastRun.paceMinKm * 60), '/公里'), fact('最快的步行（≥1 公里）', fastWalk, fastWalk && CH.pace(fastWalk.paceMinKm * 60), '/公里'), fact('训练中最高心率', hrMax, hrMax && N.int(hrMax.hrMax), '次/分')
      ].filter(Boolean)));
      // 训练时间分布
      const p4 = UI.panel('通常几点训练', { span: 6 }); g.appendChild(p4.el);
      const hrs = new Array(24).fill(0); list.forEach(function (w) { hrs[new Date(w.s).getUTCHours()]++; });
      const b4 = UI.chartBox(); p4.body.appendChild(b4);
      new CH.Bars(b4, { labels: hrs.map(function (_, i) { return i + ''; }), y: hrs, color: D.activity.color, every: 3, fmt: function (x) { return x + ' 次'; } }, { height: 170 });
      const p5 = UI.panel('星期几训练', { span: 6 }); g.appendChild(p5.el);
      const wks = new Array(7).fill(0); list.forEach(function (w) { wks[T.weekdayIdx(w.day)]++; });
      const b5 = UI.chartBox(); p5.body.appendChild(b5);
      new CH.Bars(b5, { labels: T.WEEK_MON, y: wks, color: D.activity.color, fmt: function (x) { return x + ' 次'; }, valueLabels: true }, { height: 170 });
      // 全部训练
      const srcOf = function (f) { return Array.from(new Set(all.filter(f).map(function (w) { return w.srcName; }))).join('、'); };
      const why = [dupN ? dupN + ' 条是同一来源、同一起止时间的重复写入（来自「' + srcOf(function (w) { return w.dup; }) + '」）' : '', manN ? manN + ' 条是手动录入（来自「' + srcOf(function (w) { return !w.dup && w.userEntered; }) + '」，比如 30 分钟走 9.8 公里这种明显不合常理的记录）' : ''].filter(Boolean);
      const sec = UI.section('全部体能训练', why.length ? '其中 ' + why.join('；') + '，默认不显示也不计入统计。点一行看详情。' : '点一行看详情。', { color: D.activity.color });
      v.appendChild(sec.el);
      let showAll = false;
      const holder2 = h('div'); sec.body.appendChild(holder2);
      const fill = function () { holder2.textContent = ''; holder2.appendChild(HL.workoutTable(showAll ? all : list)); };
      if (dupN || manN) sec.acts.appendChild(UI.seg([{ v: 0, label: '有效的 ' + list.length + ' 条' }, { v: 1, label: '显示全部 ' + all.length + ' 条' }], 0, function (x) { showAll = !!x; fill(); }, 'sm'));
      fill();
      if (params.w) { const w = A.workouts[+params.w]; if (w) setTimeout(function () { HL.openWorkout(w); }, 300); }
    }
  };

  // =============== 通用：按板块列面板 ===============
  function domainPage(dom, order, intro) {
    return function (v) {
      const g = UI.grid(); v.appendChild(g);
      const shown = new Set();
      if (intro) intro(v, g, shown);
      order.forEach(function (s) { const id = Q(s); if (!A.has(id) || shown.has(id)) return; shown.add(id); const el = M.panel(id, { span: 6 }); if (el) g.appendChild(el); });
      A.ds.types.forEach(function (t) { if (t.n && t.def.dom === dom && !shown.has(t.id)) { const el = M.panel(t.id, { span: 6 }); if (el) g.appendChild(el); } });
      if (!g.children.length) g.appendChild(UI.empty('没有这一类数据'));
    };
  }

  P.mobility = {
    title: '行动能力', icon: 'mobility', color: D.mobility.color,
    available: function () { return A.ds.types.some(function (t) { return t.n && t.def.dom === 'mobility'; }); },
    sub: function () { return 'iPhone 放在口袋里时测出的步态，以及跑步动态'; },
    render: domainPage('mobility', ['WalkingSpeed', 'WalkingStepLength', 'WalkingDoubleSupportPercentage', 'WalkingAsymmetryPercentage', 'AppleWalkingSteadiness', 'SixMinuteWalkTestDistance', 'StairAscentSpeed', 'StairDescentSpeed', 'RunningSpeed', 'RunningPower', 'RunningStrideLength', 'RunningVerticalOscillation', 'RunningGroundContactTime'], function (v, g) {
      const t = A.t(Q('WalkingAsymmetryPercentage'));
      if (t && t.n) {
        const r = A.range, ab = A.idxRange(t, r.d0 * DAY, (r.d1 + 1) * DAY);
        const c = [0, 0, 0, 0];
        for (let i = ab[0]; i < ab[1]; i++) { const m = t.m[i]; if (m === m) c[Math.max(0, Math.min(3, m))]++; }
        const tot = c[0] + c[1] + c[2] + c[3];
        if (tot && c[1] + c[2] > 0) {
          const p = UI.panel('手机通常放在哪边', { span: 12, desc: '测步行不对称性时，iPhone 会记下它在身体哪一侧（导出里的 DevicePlacementSide）。由此能看出你的习惯。' }); g.appendChild(p.el);
          p.body.appendChild(UI.segBar([{ name: '左侧', v: c[1], color: '#3987e5' }, { name: '右侧', v: c[2], color: '#d95926' }, { name: '中间', v: c[3], color: '#199e70' }, { name: '未知', v: c[0], color: 'rgba(150,172,206,0.4)' }], { legendVal: function (p) { return N.int(p.v) + ' 次'; } }));
        }
      }
    })
  };

  P.resp = {
    title: '呼吸', icon: 'resp', color: D.resp.color,
    available: function () { return A.ds.types.some(function (t) { return t.n && t.def.dom === 'resp'; }); },
    sub: function () { return '呼吸频率、血氧、睡眠中的呼吸紊乱'; },
    render: domainPage('resp', ['RespiratoryRate', 'OxygenSaturation', 'AppleSleepingBreathingDisturbances'], function (v, g, shown) {
      const t = A.t(Q('OxygenSaturation'));
      if (t && t.n) {
        const r = A.range, ab = A.idxRange(t, r.d0 * DAY, (r.d1 + 1) * DAY);
        const xs = [], ys = [], ts = [];
        for (let i = ab[0]; i < ab[1]; i++) { const kpa = t.m[i]; if (kpa === kpa && kpa > 50) { xs.push(44330 * (1 - Math.pow(kpa / 101.325, 1 / 5.255))); ys.push(A.val(t, i)); ts.push(t.s[i]); } }
        const altS = xs.slice().sort(function (a, b) { return a - b; });
        const spread = S.q(altS, 0.95) - S.q(altS, 0.05);
        if (xs.length > 30 && spread < 400) {
          const p = UI.panel('测血氧时所在的海拔', { span: 12 }); g.appendChild(p.el);
          p.body.appendChild(UI.facts([{ k: '按气压估算的海拔', v: N.int(S.q(altS, 0.05)) + ' – ' + N.int(S.q(altS, 0.95)), u: '米', w: '90% 的血氧测量在这个范围内（' + xs.length + ' 次带气压的测量）' }, { k: '测量时的气压', v: N.fix(101.325 * Math.pow(1 - S.q(altS, 0.5) / 44330, 5.255), 1), u: 'kPa', w: '中位数；海平面标准气压是 101.3 kPa' }]));
          p.body.appendChild(UI.note('手表测血氧时会顺便记下气压。你的测量基本都在海平面附近（这几百米的起伏主要是天气引起的气压变化），所以看不出海拔对血氧的影响；去高原时这里会显示两者的关系。'));
        }
        if (xs.length > 30 && spread >= 400) {
          const p = UI.panel('血氧与所在海拔', { span: 12, desc: '每次测血氧时手表还记下了气压。按标准大气换算成大致海拔：到了高海拔地区，血氧会自然偏低。天气变化也会让气压波动几百帕，所以海拔只是估计。' }); g.appendChild(p.el);
          const bx = UI.chartBox(); p.body.appendChild(bx);
          new CH.Scatter(bx, { x: xs, y: ys, color: D.resp.color, xLabel: '估算海拔（米）', yLabel: '血氧（%）', fit: true, alpha: 0.4, tip: function (i, el) { CH.tt.head(el, T.dt(ts[i])); CH.tt.row(el, D.resp.color, N.fix(ys[i], 0) + '%', '血氧'); CH.tt.row(el, null, N.int(xs[i]) + ' 米', '估算海拔'); } }, { height: 240 });
        }
      }
    })
  };

  // =============== 听力与环境 ===============
  P.hearing = {
    title: '听力与环境', icon: 'hearing', color: D.hearing.color,
    available: function () { return A.ds.types.some(function (t) { return t.n && t.def.dom === 'hearing'; }) || A.ds.audiograms.length; },
    sub: function () { return '耳机音量和时长、每副耳机、环境噪音、降噪、听力测试'; },
    render: function (v) {
      const r = A.range, col = D.hearing.color;
      const hp = Q('HeadphoneAudioExposure');
      if (A.has(hp)) {
        const st = A.stats(hp);
        const sec = UI.section('耳机', '每条耳机音量记录都带着时长，所以能算出你戴了多久、按时长加权的平均音量。', { color: col }); v.appendChild(sec.el);
        const g = UI.grid(); sec.body.appendChild(g);
        // 收听时长
        const p0 = UI.panel('每天戴多久', { span: 12, hint: '累计 ' + T.dur(st.secs) }); g.appendChild(p0.el);
        const gran0 = A.autoGran(r.d0, r.d1);
        const ro = A.rollup(A.dailyValues(hp, 'secs'), r.d0, r.d1, gran0, gran0 === 'day' ? 'sum' : 'avg');
        const b0 = UI.chartBox(); p0.body.appendChild(b0);
        new CH.TimeChart(b0, { x: ro.x, gran: gran0, series: [{ name: gran0 === 'day' ? '当天' : '日均', color: col, type: 'bar', y: ro.y }], fmt: function (x) { return T.dur(x * 60); }, yFmt: function (x) { return x >= 60 ? N.fix(x / 60, 0) + ' 时' : x + ' 分'; }, markMax: true }, { height: 220 });
        g.appendChild(M.panel(hp, { span: 12, title: '耳机音量', desc: '线是能量平均（按时长加权的 dB），点是当期最响的一次。长期超过 80 dB 对听力不利。' }));
        // 每副耳机
        const ad = A.audioDaily(hp);
        const groups = new Map();
        ad.byDev.forEach(function (rec, di) {
          const d = di ? A.ds.devices[di - 1] : null;
          const key = d ? (CAT.deviceLabel(d) || d.model) + '|' + d.name : '未注明';
          const o = groups.get(key) || { name: d ? d.name : '未注明设备', label: d ? (CAT.deviceLabel(d) || (d.model && !/^0x/.test(d.model) ? d.model : '型号 ' + (d.model || '?'))) : '', secs: 0, energy: 0, first: Infinity, last: -Infinity, ids: 0 };
          o.secs += rec.secs; o.energy += rec.energy; o.first = Math.min(o.first, rec.first); o.last = Math.max(o.last, rec.last); o.ids++;
          groups.set(key, o);
        });
        const gl = Array.from(groups.values()).sort(function (a, b) { return b.secs - a.secs; });
        const p1 = UI.panel('用过的每一副耳机', { span: 7, desc: '全部时间范围。同名同型号的多个连接标识已合并；名字里带别人称呼的，多半是借来戴过的。' }); g.appendChild(p1.el);
        p1.body.appendChild(UI.table([
          { k: 'name', label: '耳机', fmt: function (o) { return h('span', null, o.name, o.label ? h('span', { class: 'muted', style: { marginLeft: '6px', color: 'var(--ink-3)' }, text: o.label }) : null); } },
          { k: 'secs', label: '戴了多久', n: true, fmt: function (o) { return T.dur(o.secs); }, sort: function (o) { return o.secs; } },
          { k: 'db', label: '平均音量', n: true, fmt: function (o) { return N.fix(A.laeq(o.secs, o.energy), 1) + ' dB'; }, sort: function (o) { return A.laeq(o.secs, o.energy); } },
          { k: 'when', label: '使用时间', muted: true, fmt: function (o) { return T.ym(o.first) + ' – ' + T.ym(o.last); }, sort: function (o) { return o.first; } }
        ], gl, { sortK: 'secs', maxH: 420 }));
        const p2 = UI.panel('音量分布', { span: 5, desc: '按时长统计：每个音量段里你一共听了多久。' }); g.appendChild(p2.el);
        const edges = [], counts = []; for (let k = 0; k <= 13; k++) edges.push(35 + k * 5);
        for (let k = 0; k < 13; k++) counts.push(ad.hist[k] / 3600);
        const b2 = UI.chartBox(); p2.body.appendChild(b2);
        const zr = C.ramp(col, 9);
        new CH.Histo(b2, { counts: Float64Array.from(counts), edges: edges, color: col, zones: [{ lo: 0, hi: 80, color: col }, { lo: 80, hi: 90, color: '#fab219' }, { lo: 90, hi: 200, color: '#ec835a' }], fmt: N.int, unit: 'dB', countFmt: function (c) { return T.dur(c * 3600); } }, { height: 220 });
        p2.body.appendChild(UI.legend([{ name: '80 dB 以下', color: col, box: true }, { name: '80–90 dB', color: '#fab219', box: true }, { name: '90 dB 以上', color: '#ec835a', box: true }]));
        p2.body.appendChild(UI.note('≥80 dB 的时间占 ' + N.pct(st.over80, 1) + '，≥90 dB 占 ' + N.pct(st.over90, 1) + '。'));
        // 一周热力
        const p3 = UI.panel('一周里什么时候戴耳机', { span: 12, desc: '每格是这个时段平均每天戴耳机的分钟数。' }); g.appendChild(p3.el);
        const grid = []; for (let w = 0; w < 7; w++) grid.push(new Float64Array(24)); const cnt = new Float64Array(7);
        for (let d = r.d0; d <= r.d1; d++) { const k = d - A.day0, w = T.weekdayIdx(d); cnt[w]++; for (let hh = 0; hh < 24; hh++) grid[w][hh] += ad.hSecs[k * 24 + hh] / 60; }
        let mx = 0; grid.forEach(function (row, w) { for (let hh = 0; hh < 24; hh++) { row[hh] = cnt[w] ? row[hh] / cnt[w] : NaN; if (row[hh] > mx) mx = row[hh]; } });
        const b3 = UI.chartBox(); p3.body.appendChild(b3);
        new CH.Matrix(b3, { rows: T.WEEK_MON, cols: Array.from({ length: 24 }, function (_, i) { return i + ''; }), colEvery: 2, get: function (ri, ci) { return grid[ri][ci]; }, color: function (x) { return C.rampAt(zr, Math.sqrt(x / (mx || 1)) * 0.88 + 0.12); }, fmt: function (x) { return N.fix(x, 1) + ' 分钟/天'; }, headOf: function (ri, ci) { return T.WEEK_MON[ri] + ' ' + HL.pad(ci) + ':00–' + HL.pad(ci) + ':59'; }, cellH: 24, rowW: 44 });
      }
      const sec2 = UI.section('环境与降噪', null, { color: col }); v.appendChild(sec2.el);
      const g2 = UI.grid(); sec2.body.appendChild(g2);
      ['EnvironmentalAudioExposure', 'EnvironmentalSoundReduction'].forEach(function (s) { if (A.has(Q(s))) { const el = M.panel(Q(s), { span: 6 }); if (el) g2.appendChild(el); } });
      A.ds.types.forEach(function (t) { if (t.n && t.def.dom === 'hearing' && t.def.kind === 'event') { const el = M.panel(t.id, { span: 6 }); if (el) g2.appendChild(el); } });
      // 噪声事件列表
      const ev = A.t(A.C('AudioExposureEvent'));
      if (ev && ev.n) {
        const p = UI.panel('每一次噪声提醒', { span: 6, hint: ev.n + ' 次' }); g2.appendChild(p.el);
        const rows = []; for (let i = 0; i < ev.n; i++) rows.push({ t: ev.s[i], d: ev.d[i], lv: ev.m[i] });
        p.body.appendChild(UI.table([{ k: 't', label: '时间', fmt: function (x) { return T.dt(x.t); }, sort: function (x) { return x.t; } }, { k: 'lv', label: '音量', n: true, fmt: function (x) { return x.lv === x.lv ? N.fix(x.lv, 1) + ' dB' : '—'; }, sort: function (x) { return x.lv; } }, { k: 'd', label: '持续', n: true, fmt: function (x) { return T.dur(x.d, { sec: true }); } }], rows, { sortK: 't', maxH: 300 }));
      }
      // 听力图
      if (A.ds.audiograms.length) {
        const sec3 = UI.section('听力测试', '用 AirPods 做的听力测试结果。按世界卫生组织的分级，20 dB HL 以内为正常听力。', { color: col }); v.appendChild(sec3.el);
        A.ds.audiograms.forEach(function (au) {
          const dev = au.dev ? A.ds.devices[au.dev - 1] : null;
          const p = UI.panel(T.date(au.s, { week: true }) + ' 的听力图', { hint: (dev ? dev.name + ' · ' : '') + au.points.length + ' 个频率 · 圆圈＝右耳，叉＝左耳' }); sec3.body.appendChild(p.el);
          const g3 = UI.grid(); p.body.appendChild(g3);
          const c1 = h('div', { class: 'c8' }); g3.appendChild(c1); const bx = UI.chartBox(); c1.appendChild(bx);
          new CH.Audiogram(bx, { points: au.points });
          const c2 = h('div', { class: 'c4' }); g3.appendChild(c2);
          const avg = function (k) { const f = [500, 1000, 2000, 4000]; const v2 = au.points.filter(function (q) { return f.indexOf(q.f) >= 0; }).map(function (q) { return q[k]; }); return S.mean(v2); };
          c2.appendChild(UI.readouts([{ k: '右耳平均（0.5–4k）', v: avg('r'), fmt: function (x) { return N.fix(x, 1); }, u: 'dB HL' }, { k: '左耳平均（0.5–4k）', v: avg('l'), fmt: function (x) { return N.fix(x, 1); }, u: 'dB HL' }]));
          c2.appendChild(h('div', { style: { height: '12px' } }));
          c2.appendChild(UI.table([{ k: 'f', label: '频率', fmt: function (q) { return q.f + ' Hz'; } }, { k: 'r', label: '右耳', n: true, fmt: function (q) { return N.fix(q.r, 1); } }, { k: 'l', label: '左耳', n: true, fmt: function (q) { return N.fix(q.l, 1); } }], au.points.slice().sort(function (a, b) { return a.f - b.f; }), { scroll: false }));
        });
      }
    }
  };

  // =============== 身体 ===============
  P.body = {
    title: '身体', icon: 'body', color: D.body.color,
    sub: function () { return '个人信息、身体测量'; },
    render: function (v) {
      const me = A.me || {};
      const sec = UI.section('个人信息', '「健康」App 里「健康详细信息」填写的内容。', { color: D.body.color }); v.appendChild(sec.el);
      const ht = A.t(Q('Height')), wt = A.t(Q('BodyMass'));
      const lastV = function (t) { return t && t.n ? { v: A.val(t, t.n - 1), t: t.s[t.n - 1] } : null; };
      const H = lastV(ht), W = lastV(wt);
      const bmi = H && W ? W.v / Math.pow(H.v / 100, 2) : NaN;
      sec.body.appendChild(UI.facts([
        { k: '出生日期', v: me.HKCharacteristicTypeIdentifierDateOfBirth || '未填写', w: isFinite(A.age) ? '导出时 ' + A.age + ' 岁' : '' },
        { k: '性别', v: CAT.SEX_CN[me.HKCharacteristicTypeIdentifierBiologicalSex] || '—' },
        { k: '血型', v: CAT.BLOOD_CN[me.HKCharacteristicTypeIdentifierBloodType] || '—' },
        { k: '菲茨帕特里克皮肤类型', v: CAT.SKIN_CN[me.HKCharacteristicTypeIdentifierFitzpatrickSkinType] || '—' },
        { k: '影响心肺适能的药物', v: me.HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse || '—' },
        H ? { k: '身高', v: N.fix(H.v, 0), u: '厘米', w: '记录于 ' + T.date(H.t) } : null,
        W ? { k: '体重', v: N.fix(W.v, 1), u: '公斤', w: '记录于 ' + T.date(W.t) } : null,
        bmi === bmi ? { k: '身体质量指数（BMI）', v: N.fix(bmi, 1), w: '按上面的身高体重计算；18.5–23.9 是中国成人的正常范围' } : null,
        { k: '数据语言', v: A.ds.locale || '—' }
      ]));
      if ((ht && ht.n <= 2) || (wt && wt.n <= 2)) sec.body.appendChild(UI.note('身高体重各只有 ' + ((wt && wt.n) || 0) + ' 条记录，可能和现在不一样。BMI 只是粗略参考，不区分肌肉和脂肪。'));
      const g = UI.grid(); g.style.marginTop = '18px'; v.appendChild(g);
      A.ds.types.forEach(function (t) { if (t.n && (t.def.dom === 'body' || t.def.dom === 'vitals' || t.def.dom === 'nutrition' || t.def.dom === 'cycle' || t.def.dom === 'mind' || t.def.dom === 'events' || t.def.dom === 'other') && t.n > 2) { const el = M.panel(t.id, { span: 6 }); if (el) g.appendChild(el); } });
      const small = A.ds.types.filter(function (t) { return t.n && t.n <= 2 && ['body', 'vitals', 'mind', 'events', 'other', 'nutrition', 'cycle'].indexOf(t.def.dom) >= 0; });
      if (small.length) {
        const sec2 = UI.section('只有一两条的记录', '数量太少画不成图，直接列出来。'); v.appendChild(sec2.el);
        const rows = []; small.forEach(function (t) { for (let i = 0; i < t.n; i++) rows.push({ t: t, i: i }); });
        sec2.body.appendChild(UI.table([{ k: 'n', label: '类型', fmt: function (x) { return x.t.def.name; } }, { k: 'v', label: '数值', n: true, fmt: function (x) { return x.t.kind === 'c' ? A.catLabel(x.t, x.t.v[x.i]) : M.withUnit(x.t, A.val(x.t, x.i)); } }, { k: 'ts', label: '时间', fmt: function (x) { return T.dtFull(x.t.s[x.i]); } }, { k: 's', label: '来源', muted: true, fmt: function (x) { return A.ds.sources[x.t.src[x.i]].name; } }], rows, { scroll: false }));
      }
      if (A.ds.vision.length) {
        const sec3 = UI.section('视力处方'); v.appendChild(sec3.el);
        sec3.body.appendChild(UI.table([{ k: 'i', label: '开具日期', fmt: function (x) { return x.issued; } }, { k: 'b', label: '品牌', fmt: function (x) { return x.brand || '—'; } }, { k: 'r', label: '右眼', fmt: function (x) { return x.right ? Object.keys(x.right).filter(function (k) { return !/Unit$/.test(k); }).map(function (k) { return k + ' ' + x.right[k]; }).join('，') : '—'; } }, { k: 'l', label: '左眼', fmt: function (x) { return x.left ? Object.keys(x.left).filter(function (k) { return !/Unit$/.test(k); }).map(function (k) { return k + ' ' + x.left[k]; }).join('，') : '—'; } }], A.ds.vision, { scroll: false }));
      }
    }
  };

  // =============== 心电图 ===============
  P.ecg = {
    title: '心电图', icon: 'ecg', color: D.heart.color,
    available: function () { return A.ds.ecgs.length > 0; },
    count: function () { return String(A.ds.ecgs.length); },
    sub: function () { return 'Apple Watch 单导联心电图的原始波形（每秒 512 个点）'; },
    noFilters: true,
    render: function (v, params) {
      const list = A.ds.ecgs.filter(function (e) { return e.samples && e.samples.length; }).sort(function (a, b) { return b.t - a.t; });
      const cls = {}; list.forEach(function (e) { cls[e.classification] = (cls[e.classification] || 0) + 1; });
      v.appendChild(UI.readouts([
        { k: '记录份数', v: list.length, fmt: N.int, u: '份', s: T.date(list[list.length - 1].t) + ' – ' + T.date(list[0].t) },
        (function () { const keys = Object.keys(cls).sort(function (a, b) { return cls[b] - cls[a]; }); return { k: keys[0] || '分类', v: cls[keys[0]] || 0, fmt: N.int, u: '份', s: keys.slice(1).map(function (k) { return k + ' ' + cls[k]; }).join(' · ') || '全部同一分类' }; })(),
        { k: '平均心率（由波形计算）', v: S.mean(list.map(function (e) { return e.hr; })), fmt: N.int, u: '次/分', s: '范围 ' + N.int(Math.min.apply(null, list.map(function (e) { return e.hr; }))) + '–' + N.int(Math.max.apply(null, list.map(function (e) { return e.hr; }))) },
        (function () { // 型号放大显示，尺寸（如「42 毫米」）放到下面的小字里，免得型号被挤得太小
          const names = Array.from(new Set(list.map(function (e) { return CAT.HARDWARE_CN[e.device] || e.device; })));
          const sizes = names.map(function (n) { const m = /（([^）]+)）$/.exec(n); return m ? m[1] : ''; }).filter(Boolean);
          return { k: '设备', text: names.map(function (n) { return n.replace(/（[^）]+）$/, ''); }).join('、'),
            s: (sizes.length ? sizes.join('、') + ' · ' : '') + '硬件标识 ' + Array.from(new Set(list.map(function (e) { return e.device; }))).join('、') + ' · 软件版本 ' + Array.from(new Set(list.map(function (e) { return e.software; }))).join('、') };
        })()
      ]));
      const g = UI.grid(); g.style.marginTop = '18px'; v.appendChild(g);
      const left = h('div', { class: 'c3' }), right = h('div', { class: 'c9', style: { gridColumn: 'span 9' } });
      g.appendChild(left); g.appendChild(right);
      const lst = h('div', { class: 'ecg-list' }); left.appendChild(lst);
      let cur = params.i ? +params.i : 0;
      const btns = list.map(function (e, i) {
        const b = h('button', { type: 'button' }, h('span', { class: 'd', text: T.date(e.t, { noYear: false }) + ' ' + T.hm(e.t) }), h('span', { class: 'h' }, N.int(e.hr), h('small', { text: '次/分' })), h('span', { class: 'c' }, UI.tag(e.classification || '未分类', /窦性/.test(e.classification) ? '#0ca30c' : /颤|心率过|高心率|低心率/.test(e.classification) ? '#fab219' : '#9aa9bc')));
        b.addEventListener('click', function () { cur = i; show(); });
        lst.appendChild(b); return b;
      });
      const show = function () {
        btns.forEach(function (b, i) { b.classList.toggle('on', i === cur); });
        CH.destroyAll(right); right.textContent = '';
        const e = list[cur];
        const p = UI.panel(T.date(e.t, { week: true }) + ' ' + T.hm(e.t), { color: D.heart.color, hint: e.classification + ' · ' + e.lead + ' · ' + e.rate + ' Hz · ' + N.fix(e.duration, 1) + ' 秒' }); right.appendChild(p.el);
        const rrs = Array.from(e.rr);
        let rmssd = NaN; if (rrs.length > 3) { let s = 0, c = 0; for (let k = 1; k < rrs.length; k++) { const d = rrs[k] - rrs[k - 1]; if (Math.abs(d) < 0.25 * rrs[k - 1]) { s += d * d; c++; } } rmssd = c ? Math.sqrt(s / c) : NaN; }
        p.body.appendChild(UI.readouts([
          { k: '心率', v: e.hr, fmt: N.int, u: '次/分', s: '由 ' + e.rPeaks.length + ' 个 R 波计算' },
          { k: 'RR 间期', text: N.int(S.mean(rrs)), u: '毫秒', s: '最短 ' + N.int(Math.min.apply(null, rrs)) + ' · 最长 ' + N.int(Math.max.apply(null, rrs)) },
          { k: 'RMSSD', v: rmssd, fmt: N.int, u: '毫秒', s: '这 30 秒的心率变异' },
          { k: '症状', text: e.symptoms || '未记录' }
        ], { tight: true }));
        const bx = UI.chartBox(); bx.style.marginTop = '14px'; p.body.appendChild(bx);
        new CH.ECG(bx, { samples: e.samples, rate: e.rate, peaks: e.rPeaks }, { duration: 4200 });
        p.body.appendChild(UI.note('按标准心电图纸绘制：走纸 25 毫米/秒，增益 10 毫米/毫伏，小格 1 毫米、大格 5 毫米。下方灰点是检测到的 R 波。这里的心率由程序从波形自动计算，可能与手表显示略有不同；分类结果来自 Apple 的心电图 App。此页面不能用于诊断。'));
        if (rrs.length > 3) {
          const p2 = UI.panel('逐拍心率', { hint: '每一跳换算成的瞬时心率' }); p2.el.style.marginTop = '16px'; right.appendChild(p2.el);
          const b2 = UI.chartBox(); p2.body.appendChild(b2);
          new CH.Bars(b2, { labels: rrs.map(function (_, i) { return String(i + 2); }), y: rrs.map(function (x) { return 60000 / x; }), color: D.heart.color, every: 5, fmt: function (x) { return N.int(x) + ' 次/分'; }, tip: function (i, el) { CH.tt.head(el, '第 ' + (i + 2) + ' 跳'); CH.tt.row(el, D.heart.color, N.int(60000 / rrs[i]) + ' 次/分', 'RR ' + N.int(rrs[i]) + ' 毫秒'); } }, { height: 160 });
        }
      };
      show();
      const sec = UI.section('每份心电图的心率', '按记录时间排列', { color: D.heart.color }); v.appendChild(sec.el);
      const asc = list.slice().reverse();
      const bx = UI.chartBox(); sec.body.appendChild(h('div', { class: 'panel' }, bx));
      new CH.Bars(bx, { labels: asc.map(function (e) { return T.md(e.t); }), y: asc.map(function (e) { return e.hr; }), color: D.heart.color, fmt: function (x) { return N.int(x) + ' 次/分'; }, valueLabels: true, tip: function (i, el) { CH.tt.head(el, T.dt(asc[i].t)); CH.tt.row(el, D.heart.color, N.int(asc[i].hr) + ' 次/分', asc[i].classification); } }, { height: 180 });
    }
  };
})();
