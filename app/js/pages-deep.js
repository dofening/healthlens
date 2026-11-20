/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 页面：洞察、纪录与最值、年度回顾、设备与来源、全部数据 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, S = HL.S, C = HL.C, A = HL.A, CH = HL.CH, UI = HL.UI, CAT = HL.CAT, M = HL.M, INS = HL.INS;
  const DAY = 86400000;
  const P = HL.pages;
  const D = CAT.DOMAINS;
  const Q = function (s) { return A.Q(s); };

  // =============== 洞察 ===============
  P.insights = {
    title: '洞察', icon: 'insights', color: '#7fd6a8',
    sub: function () { return '把不同数据放在一起比较：关联、变化、规律、异常'; },
    render: function (v) {
      const r = A.range;
      const list = INS.generate(r.d0, r.d1);
      const sec = UI.section('发现', '每条都给出了样本量和相关系数。相关不等于因果：两件事一起变，可能是第三件事（比如考试周、生病、天气）同时影响了它们。', { color: '#7fd6a8' });
      v.appendChild(sec.el);
      if (!list.length) sec.body.appendChild(UI.empty('这个时间范围的数据太少，还找不出可靠的规律。试试把时间范围放宽。'));
      const wrap = h('div', { class: 'insights' }); sec.body.appendChild(wrap);
      list.forEach(function (it) { wrap.appendChild(INS.card(it, true)); });
      // 相关矩阵
      const tb = INS.table();
      const keys = tb.defs.filter(function (d) { let c = 0; const a = tb.vals[d.key]; for (let k = r.d0; k <= r.d1; k++) if (a[k - A.day0] === a[k - A.day0]) c++; return c >= 20; });
      if (keys.length >= 3) {
        const sec2 = UI.section('所有指标两两之间的关系', '格子越红：一个高的日子另一个也高；越蓝：一个高另一个就低。数字是 Spearman 相关系数，太弱或样本太少的格子不显示数字。', { color: '#7fd6a8' });
        v.appendChild(sec2.el);
        let lag = 0;
        const holder = h('div', { class: 'panel' }); sec2.body.appendChild(holder);
        const draw = function () {
          CH.destroyAll(holder); holder.textContent = '';
          const n = keys.length, M2 = [];
          for (let i = 0; i < n; i++) { M2.push([]); for (let j = 0; j < n; j++) {
            if (i === j && !lag) { M2[i].push({ r: 1, n: 0 }); continue; }
            const xa = [], xb = []; for (let d = r.d0; d <= r.d1; d++) { xa.push(tb.vals[keys[i].key][d - A.day0]); const k2 = d - A.day0 + lag; xb.push(k2 < A.nDays ? tb.vals[keys[j].key][k2] : NaN); }
            M2[i].push(S.spearman(xa, xb));
          } }
          const bx = UI.chartBox(); holder.appendChild(bx);
          new CH.Matrix(bx, { rows: keys.map(function (k) { return k.name; }), cols: keys.map(function (k) { return k.name; }), top: 108, cellH: 26, rowW: 92,
            get: function (ri, ci) { const x = M2[ri][ci]; return x && x.n >= 20 || (ri === ci && !lag) ? x.r : NaN; },
            color: function (x) { return C.diverging(x); },
            text: function (x, ri, ci) { const c = M2[ri][ci]; return ri === ci && !lag ? '' : (Math.abs(x) >= 0.2 && c.p < 0.05 ? N.fix(x, 2).replace('0.', '.') : ''); },
            headOf: function (ri, ci) { return keys[ri].name + (lag ? '（当天）' : '') + ' × ' + keys[ci].name + (lag ? '（第二天）' : ''); },
            tip: function (ri, ci, x, el) { const c = M2[ri][ci]; if (ri === ci && !lag) { CH.tt.row(el, null, '自己和自己', ''); return; } if (!(c.n >= 20)) { CH.tt.row(el, null, '配对数据不足', c.n + ' 天'); return; } CH.tt.row(el, C.diverging(c.r), N.fix(c.r, 2), '相关系数'); CH.tt.note(el, c.n + ' 天配对，p ' + (c.p < 0.001 ? '< 0.001' : '= ' + N.fix(c.p, 3)) + (c.p < 0.05 ? '' : '（不显著）')); },
            onPick: function () { } }, { duration: 900 });
          // 列标签旋转绘制
          const cv = bx.querySelector('canvas');
          const ch = Array.from(CH.live).find(function (x) { return x.cv === cv; });
          if (ch) { const orig = ch.draw; ch.draw = function (c, p) { const d = this.d; const save = d.cols; d.cols = d.cols.map(function () { return ''; }); orig.call(this, c, p); d.cols = save; c.save(); c.font = '11px ' + CH.FCN; c.fillStyle = CH.COL.ink3; c.textAlign = 'left'; c.textBaseline = 'middle'; for (let k = 0; k < save.length; k++) { c.save(); c.translate(this.L + k * this.cw + this.cw / 2, this.Tp - 8); c.rotate(-Math.PI / 3); c.fillText(save[k], 0, 0); c.restore(); } c.restore(); }; ch.render(); }
        };
        sec2.acts.appendChild(UI.seg([{ v: 0, label: '同一天' }, { v: 1, label: '今天 → 第二天' }], 0, function (x) { lag = x; draw(); }, 'sm'));
        draw();
      }
      // 没有发现关系的假设
      const cs = INS.correlations(r.d0, r.d1).filter(function (c) { return !(c.p < 0.05 && Math.abs(c.r) >= 0.15); });
      if (cs.length) {
        const sec3 = UI.section('检验过、但没看出明显关系的', '这些常见说法在你这段时间的数据里不成立（或者数据还不够多）。', { color: '#7fd6a8' });
        v.appendChild(sec3.el);
        sec3.body.appendChild(UI.table([{ k: 'q', label: '假设', fmt: function (c) { return c.pa + ' → ' + c.pb; } }, { k: 'r', label: '相关系数', n: true, fmt: function (c) { return N.fix(c.r, 2); }, sort: function (c) { return Math.abs(c.r); } }, { k: 'n', label: '配对天数', n: true, fmt: function (c) { return c.n; } }, { k: 'p', label: 'p 值', n: true, fmt: function (c) { return c.p < 0.001 ? '< 0.001' : N.fix(c.p, 3); } }], cs, { scroll: false, sortK: 'r' }));
      }
      // 星期 & 月份规律
      const sec4 = UI.section('星期几与月份的规律', '每格把这个指标在该星期/月份的平均值，和它自己的整体平均比较：偏红高于平时，偏蓝低于平时（按标准差计）。', { color: '#7fd6a8' });
      v.appendChild(sec4.el);
      const g = UI.grid(); sec4.body.appendChild(g);
      const zMatrix = function (groupOf, nG) {
        return keys.map(function (k) {
          const a = tb.vals[k.key]; const all = [], sums = new Array(nG).fill(0), cnt = new Array(nG).fill(0);
          for (let d = r.d0; d <= r.d1; d++) { const x = a[d - A.day0]; if (x === x) { all.push(x); const gi = groupOf(d); sums[gi] += x; cnt[gi]++; } }
          const m = S.mean(all), s = S.std(all);
          return sums.map(function (sm, i) { return cnt[i] >= 3 && s > 0 ? { z: (sm / cnt[i] - m) / s, mean: sm / cnt[i], n: cnt[i] } : null; });
        });
      };
      if (keys.length) {
        const wkM = zMatrix(function (d) { return T.weekdayIdx(d); }, 7);
        const p1 = UI.panel('星期几', { span: 5 }); g.appendChild(p1.el); const b1 = UI.chartBox(); p1.body.appendChild(b1);
        new CH.Matrix(b1, { rows: keys.map(function (k) { return k.name; }), cols: T.WEEK_MON.map(function (w) { return w.slice(1); }), cellH: 22, rowW: 92, get: function (ri, ci) { const c = wkM[ri][ci]; return c ? c.z : NaN; }, color: function (x) { return C.diverging(Math.max(-1, Math.min(1, x / 1))); }, headOf: function (ri, ci) { return keys[ri].name + ' · ' + T.WEEK_MON[ci]; }, tip: function (ri, ci, x, el) { const c = wkM[ri][ci]; if (!c) { CH.tt.row(el, null, '数据不足', ''); return; } CH.tt.row(el, C.diverging(Math.max(-1, Math.min(1, c.z))), INS.fmtV(keys[ri], c.mean), '平均（' + c.n + ' 天）'); CH.tt.note(el, '比整体平均' + (c.z >= 0 ? '高 ' : '低 ') + N.fix(Math.abs(c.z), 2) + ' 个标准差'); } });
        const nMonths = (r.d1 - r.d0) / 30;
        if (nMonths >= 6) {
          const moM = zMatrix(function (d) { return new Date(d * DAY).getUTCMonth(); }, 12);
          const p2 = UI.panel('月份（跨年合并）', { span: 7 }); g.appendChild(p2.el); const b2 = UI.chartBox(); p2.body.appendChild(b2);
          new CH.Matrix(b2, { rows: keys.map(function (k) { return k.name; }), cols: Array.from({ length: 12 }, function (_, i) { return (i + 1) + '月'; }), cellH: 22, rowW: 92, get: function (ri, ci) { const c = moM[ri][ci]; return c ? c.z : NaN; }, color: function (x) { return C.diverging(Math.max(-1, Math.min(1, x))); }, headOf: function (ri, ci) { return keys[ri].name + ' · ' + (ci + 1) + '月'; }, tip: function (ri, ci, x, el) { const c = moM[ri][ci]; if (!c) { CH.tt.row(el, null, '数据不足', ''); return; } CH.tt.row(el, C.diverging(Math.max(-1, Math.min(1, c.z))), INS.fmtV(keys[ri], c.mean), '平均（' + c.n + ' 天）'); CH.tt.note(el, '比整体平均' + (c.z >= 0 ? '高 ' : '低 ') + N.fix(Math.abs(c.z), 2) + ' 个标准差'); } });
        }
      }
    }
  };

  // =============== 纪录与最值 ===============
  P.records = {
    title: '纪录与最值', icon: 'records', color: '#e8c547',
    sub: function () { return '每一项数据的最高、最低，以及发生的时间'; },
    render: function (v) {
      const r = A.range;
      const sec = UI.section('个人纪录', '在当前时间范围内', { color: '#e8c547' }); v.appendChild(sec.el);
      const facts = [];
      const sumRec = function (s, name, unit, f) { const id = Q(s); if (!A.has(id)) return; const st = A.stats(id); if (!st.days) return; facts.push({ k: name + '最多的一天', v: (f || N.int)(st.max.v), u: unit, w: T.date(st.max.day * DAY, { week: true }) }); if (st.bestWeek) facts.push({ k: name + '最多的一周', v: (f || N.int)(st.bestWeek.v), u: unit, w: T.date(st.bestWeek.day * DAY) + ' 起' }); };
      const maxRec = function (s, label, unit, f, minLabel) { const id = Q(s); if (!A.has(id)) return; const st = A.stats(id); if (!st.n) return; if (label) facts.push({ k: label, v: (f || N.auto)(st.max.v), u: unit, w: T.dtFull(st.max.t) }); if (minLabel) facts.push({ k: minLabel, v: (f || N.auto)(st.min.v), u: unit, w: T.dtFull(st.min.t) }); };
      sumRec('StepCount', '步数', '步'); sumRec('DistanceWalkingRunning', '距离', '公里', function (x) { return N.fix(x, 1); }); sumRec('FlightsClimbed', '爬楼', '层');
      const rs = A.ringStats(r.d0, r.d1); if (rs.moveStreak.best) facts.push({ k: '活动环最长连续闭合', v: rs.moveStreak.best, u: '天', w: T.date(rs.moveStreak.bestStart * DAY) + ' – ' + T.date(rs.moveStreak.bestEnd * DAY) });
      const sd = A.dailyValues(Q('StepCount')); const stk = A.streaks(sd, Float64Array.from(sd, function (x) { return x === x ? 1 : 0; }), A.settings.stepGoal, r.d0, r.d1);
      if (stk.best) facts.push({ k: '连续 ' + N.int(A.settings.stepGoal) + ' 步以上', v: stk.best, u: '天', w: T.date(stk.bestStart * DAY) + ' 起；共达标 ' + stk.hit + ' 天' });
      maxRec('HeartRate', '最高心率', '次/分', N.int, '最低心率'); maxRec('RestingHeartRate', null, '次/分', N.int, '最低静息心率'); maxRec('HeartRateVariabilitySDNN', '最高 HRV', '毫秒', N.int);
      maxRec('VO2Max', '最高最大摄氧量', 'mL/kg/min', function (x) { return N.fix(x, 1); });
      maxRec('WalkingSpeed', '最快步行速度', 'km/h', function (x) { return N.fix(x, 2); }); maxRec('WalkingStepLength', '最大步长', '厘米', N.int);
      maxRec('HeadphoneAudioExposure', '耳机最响的一次', 'dB', function (x) { return N.fix(x, 1); }); maxRec('EnvironmentalAudioExposure', '最吵的环境', 'dB', function (x) { return N.fix(x, 1); });
      maxRec('OxygenSaturation', null, '%', N.int, '最低血氧'); maxRec('AppleSleepingWristTemperature', '最高手腕温度', '°C', function (x) { return N.fix(x, 2); }, '最低手腕温度');
      maxRec('RespiratoryRate', '最高呼吸频率', '次/分', function (x) { return N.fix(x, 1); }, '最低呼吸频率');
      const ss = A.sleepStats(r.d0, r.d1);
      if (ss.longest) { facts.push({ k: '睡得最久', v: T.dur(ss.longest.asleep), w: T.date(ss.longest.day * DAY) + (ss.longest.kind === 'inbed' ? '（在床）' : '') }); facts.push({ k: '睡得最晚', v: T.hm(ss.latestBed.start), w: T.date((ss.latestBed.day - 1) * DAY) + ' 晚' }); facts.push({ k: '醒得最早', v: T.hm(ss.earliestWake.end), w: T.date(ss.earliestWake.day * DAY) }); }
      const wk = A.workoutsIn(r.d0, r.d1);
      if (wk.length) { const lng = wk.reduce(function (b, w) { return !b || w.durMin > b.durMin ? w : b; }, null); facts.push({ k: '最长的体能训练', v: T.dur(lng.durMin * 60), w: lng.name + ' · ' + T.date(lng.s) }); const far = wk.reduce(function (b, w) { return w.distKm > 0 && (!b || w.distKm > b.distKm) ? w : b; }, null); if (far) facts.push({ k: '最远的体能训练', v: N.fix(far.distKm, 2), u: '公里', w: far.name + ' · ' + T.date(far.s) }); }
      sec.body.appendChild(UI.facts(facts));
      // 全部类型表
      const sec2 = UI.section('每种数据的最值和时间', '测量类给出单次最高/最低；累计类给出单日最多/最少。点一行查看全部细节。'); v.appendChild(sec2.el);
      const rows = [];
      A.ds.types.forEach(function (t) {
        if (!t.n || t.def.kind === 'sleep') return;
        const st = A.stats(t.id); if (!st.records) return;
        const f = M.fmt(t), u = M.unit(t), k = t.def.kind;
        let maxS = '—', minS = '—', maxT = '', minT = '', mid = '—';
        if (k === 'sum' || k === 'stand') { if (st.days) { maxS = f(st.max.v); maxT = T.date(st.max.day * DAY); minS = f(st.min.v); minT = T.date(st.min.day * DAY); mid = '日均 ' + f(st.perDay); } }
        else if (k === 'event') { mid = st.count + ' 次'; maxS = st.maxSecs ? T.dur(st.maxSecs, { sec: true }) : '—'; minS = st.minSecs ? T.dur(st.minSecs, { sec: true }) : '—'; maxT = '最长一次'; minT = '最短一次'; }
        else if (k === 'audio') { maxS = f(st.maxSample.v); maxT = T.dt(st.maxSample.t); minS = f(st.min.v); minT = T.dt(st.min.t); mid = '能量平均 ' + N.fix(st.laeq, 1); }
        else if (st.n) { maxS = f(st.max.v); maxT = T.dt(st.max.t); minS = f(st.min.v); minT = T.dt(st.min.t); mid = '平均 ' + f(st.mean); }
        rows.push({ t: t, name: t.def.name, dom: t.def.dom, n: st.records, maxS: maxS, maxT: maxT, minS: minS, minT: minT, mid: mid, u: k === 'event' ? '' : u, first: st.firstT, last: st.lastT });
      });
      sec2.body.appendChild(UI.table([
        { k: 'name', label: '数据', fmt: function (x) { return h('span', null, h('span', { class: 'tag' }, h('i', { style: { '--c': (D[x.dom] || D.other).color } }), x.name)); }, sort: function (x) { return x.name; } },
        { k: 'n', label: '条数', n: true, fmt: function (x) { return N.int(x.n); }, sort: function (x) { return x.n; } },
        { k: 'mid', label: '整体', fmt: function (x) { return x.mid + (x.u && x.mid !== '—' && x.mid.indexOf('次') < 0 ? ' ' + x.u : ''); } },
        { k: 'max', label: '最高', n: true, fmt: function (x) { return x.maxS + (x.u && x.maxS !== '—' ? ' ' + x.u : ''); } },
        { k: 'maxT', label: '最高出现在', muted: true, fmt: function (x) { return x.maxT; } },
        { k: 'min', label: '最低', n: true, fmt: function (x) { return x.minS + (x.u && x.minS !== '—' ? ' ' + x.u : ''); } },
        { k: 'minT', label: '最低出现在', muted: true, fmt: function (x) { return x.minT; } },
        { k: 'span', label: '时间跨度', muted: true, fmt: function (x) { return T.date(x.first) + ' – ' + T.date(x.last); }, sort: function (x) { return x.first; } }
      ], rows, { sortK: 'n', maxH: 760, onClick: function (x) { HL.App.go('explore', { type: x.t.id }); } }));
    }
  };

  // =============== 年度回顾 ===============
  P.year = {
    title: '年度回顾', icon: 'year', color: '#ff8aa5', noFilters: true,
    sub: function () { return '每一年的你，用数字讲一遍'; },
    render: function (v, params) {
      const y0 = T.year(A.day0 * DAY), y1 = T.year(A.day1 * DAY);
      let year = params.y ? +params.y : y1;
      if (year === y1 && (A.day1 - T.day(Date.UTC(y1, 0, 1))) < 60 && y1 > y0) year = y1 - 1;
      const opts = []; for (let y = y1; y >= y0; y--) opts.push({ v: y, label: y + '' });
      const bar = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' } }, UI.seg(opts, year, function (y) { HL.App.go('year', { y: y }); }));
      v.appendChild(bar);
      const d0 = Math.max(A.day0, T.day(Date.UTC(year, 0, 1))), d1 = Math.min(A.day1, T.day(Date.UTC(year, 11, 31)));
      const story = h('div', { class: 'story' }); v.appendChild(story);
      const card = function (color, parts) { const c = h('div', { class: 'card', style: { '--c': color } }, h('div', { class: 'glow' })); parts.forEach(function (p) { if (p) c.appendChild(p); }); story.appendChild(c); return c; };
      const big = function (val, unit) { return h('div', { class: 'big' }, val, unit ? h('small', { text: unit }) : null); };
      const lead = function (t) { return h('p', { class: 'lead', text: t }); };
      const prevD0 = T.day(Date.UTC(year - 1, 0, 1)), prevD1 = T.day(Date.UTC(year - 1, 11, 31));
      const cmp = function (cur, prev) { if (!(prev > 0) || !(cur === cur)) return ''; const d = cur / prev - 1; return '，日均比 ' + (year - 1) + ' 年' + (d >= 0 ? '多 ' : '少 ') + N.pct(Math.abs(d)); };
      const span = d1 - d0 + 1;
      card('#ff8aa5', [h('div', { class: 'yr-hero', text: String(year) }), lead(span < 365 ? '这一年里有 ' + span + ' 天在数据范围内（' + T.date(d0 * DAY) + ' – ' + T.date(d1 * DAY) + '）。' : '完整的一年，365 天的数据。'), lead('这一年记下了 ' + N.int(A.ds.types.reduce(function (s, t) { const ab = A.idxRange(t, d0 * DAY, (d1 + 1) * DAY); return s + ab[1] - ab[0]; }, 0)) + ' 条健康数据。')]);
      if (A.has(Q('StepCount'))) {
        const st = A.stats(Q('StepCount'), d0, d1), pv = A.day0 <= prevD1 ? A.stats(Q('StepCount'), Math.max(A.day0, prevD0), prevD1) : null;
        if (st.days) {
          const c = card(D.activity.color, [h('div', { class: 'note', text: '这一年你走了' }), big(N.int(st.total), '步'), lead('平均每天 ' + N.int(st.perDay) + ' 步' + (pv && pv.days ? cmp(st.perDay, pv.perDay) : '') + '。走得最多的是 ' + T.date(st.max.day * DAY, { week: true }) + '，那天 ' + N.int(st.max.v) + ' 步。')]);
          const bx = UI.chartBox(); bx.style.marginTop = '14px'; c.appendChild(bx);
          const ro = A.rollup(A.dailyValues(Q('StepCount')), d0, d1, 'month', 'avg');
          new CH.TimeChart(bx, { x: ro.x, gran: 'month', series: [{ name: '日均步数', color: D.activity.color, type: 'bar', y: ro.y }], fmt: N.int, markMax: true }, { height: 180 });
        }
      }
      if (A.has(Q('DistanceWalkingRunning'))) { const st = A.stats(Q('DistanceWalkingRunning'), d0, d1); if (st.days) card(D.activity.color, [h('div', { class: 'note', text: '走过的路' }), big(N.fix(st.total, 0), '公里'), lead('差不多是 ' + N.fix(st.total / 42.195, 1) + ' 个马拉松。最远的一天走了 ' + N.fix(st.max.v, 1) + ' 公里（' + T.date(st.max.day * DAY) + '）。')]); }
      const ss = A.sleepStats(d0, d1);
      if (ss.nights) card(D.sleep.color, [h('div', { class: 'note', text: ss.measured ? '睡眠' : '在床时间（iPhone 记录）' }), big(T.dur(ss.asleep), '每晚平均'), lead(ss.nights + ' 晚有记录' + (ss.measured ? '，其中 ' + ss.measured + ' 晚是手表测的' : '') + '。通常 ' + T.clock(ss.bed + 1080) + ' 睡着、' + T.clock(ss.wake) + ' 醒来。' + (ss.latestBed ? '最晚的一次 ' + T.hm(ss.latestBed.start) + ' 才睡（' + T.date((ss.latestBed.day - 1) * DAY) + ' 晚）。' : ''))]);
      if (A.has(Q('HeartRate'))) { const st = A.stats(Q('HeartRate'), d0, d1); if (st.n) { const hb = A.heartbeats(d0, d1); card(D.heart.color, [h('div', { class: 'note', text: '心脏' }), big(N.cn(hb.beats, 1), '次心跳被记录'), lead('平均心率 ' + N.int(st.mean) + ' 次/分。最高 ' + N.int(st.max.v) + '（' + T.dt(st.max.t) + '），最低 ' + N.int(st.min.v) + '（' + T.dt(st.min.t) + '）。' + (A.has(Q('RestingHeartRate')) ? '静息心率平均 ' + N.int(A.stats(Q('RestingHeartRate'), d0, d1).mean || NaN) + '。' : ''))]); } }
      const wk = A.workoutsIn(d0, d1);
      if (wk.length) { const tot = S.sum(wk.map(function (w) { return w.durMin; })); const types = {}; wk.forEach(function (w) { types[w.name] = (types[w.name] || 0) + 1; }); card(D.activity.color, [h('div', { class: 'note', text: '体能训练' }), big(String(wk.length), '次'), lead('一共练了 ' + T.dur(tot * 60) + '：' + Object.keys(types).map(function (k) { return k + ' ' + types[k] + ' 次'; }).join('、') + '。')]); }
      if (A.has(Q('HeadphoneAudioExposure'))) { const st = A.stats(Q('HeadphoneAudioExposure'), d0, d1); if (st.secs) card(D.hearing.color, [h('div', { class: 'note', text: '戴着耳机的时间' }), big(N.int(st.secs / 3600), '小时'), lead('平均每天 ' + T.dur(st.perDaySecs) + '，平均音量 ' + N.fix(st.laeq, 0) + ' dB。最响的一次 ' + N.fix(st.max.v, 0) + ' dB（' + T.dt(st.max.t) + '）。')]); }
      const rs = A.ringStats(d0, d1);
      if (rs.days) card('#ff3b6b', [h('div', { class: 'note', text: '活动圆环' }), big(N.pct(rs.moveClosed / rs.days), '天数闭合了活动环'), lead(rs.moveClosed + ' / ' + rs.days + ' 天。最长连续闭合 ' + rs.moveStreak.best + ' 天。这一年一共消耗活动能量 ' + N.int(rs.moveSum) + ' 千卡。')]);
      const devs = HL.devGroups().filter(function (g) { return g.last >= d0 * DAY && g.first <= (d1 + 1) * DAY; });
      card('#9aa9bc', [h('div', { class: 'note', text: '陪你记录的设备' }), big(String(devs.length), '台'), lead(devs.slice(0, 6).map(function (g) { return Array.from(g.names.keys())[0] + (g.label ? '（' + g.label + '）' : ''); }).join('、') + (devs.length > 6 ? ' 等' : '') + '。')]);
    }
  };

  // =============== 设备与来源 ===============
  P.devices = {
    title: '设备与来源', icon: 'devices', color: D.other.color, noFilters: true,
    sub: function () { return '每台设备、每个来源 App、系统版本变化、数据质量'; },
    render: function (v) {
      const ds = A.ds;
      const groups = HL.devGroups();
      const sec = UI.section('设备', '同一款设备的多个连接标识已合并。名字以导出文件为准。', { color: D.other.color }); v.appendChild(sec.el);
      const list = h('div'); sec.body.appendChild(list);
      groups.forEach(function (g) {
        const names = Array.from(g.names.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
        const types = Array.from(g.types.entries()).sort(function (a, b) { return b[1] - a[1]; });
        const sw = Array.from(g.software.entries()).sort(function (a, b) { return a[1].first - b[1].first; });
        const fw = Array.from(g.firmware.entries()).sort(function (a, b) { return a[1].first - b[1].first; });
        const sub = [g.label || (g.hardware ? g.hardware : (g.model && !/^0x/.test(g.model) ? g.model : '')), g.hardware && g.label ? '硬件标识 ' + g.hardware : '', !g.hardware && /^0x/.test(g.model || '') ? '蓝牙型号代码 ' + g.model : '', g.manufacturer && !/^0x/.test(g.manufacturer) ? g.manufacturer : ''].filter(Boolean).join(' · ');
        const meta = h('div', { class: 'meta' });
        types.slice(0, 8).forEach(function (tp) { meta.appendChild(UI.tag(HL.typeName(tp[0]) + ' ' + N.int(tp[1]), (D[CAT.type(tp[0]).dom] || D.other).color)); });
        if (types.length > 8) meta.appendChild(UI.tag('另 ' + (types.length - 8) + ' 种'));
        const ver = sw.length ? (g.kind === 'watch' ? 'watchOS ' : g.kind === 'phone' ? 'iOS ' : '系统 ') + sw[0][0] + (sw.length > 1 ? ' → ' + sw[sw.length - 1][0] + '（' + sw.length + ' 个版本）' : '') : fw.length ? '固件 ' + fw[0][0] + (fw.length > 1 ? ' → ' + fw[fw.length - 1][0] : '') : '';
        list.appendChild(h('div', { class: 'devcard' },
          h('div', { class: 'ic' }, UI.icon(g.kind === 'watch' ? 'watch' : g.kind === 'phone' ? 'phone' : g.kind === 'tablet' ? 'tablet' : g.kind === 'audio' ? 'audio' : 'app')),
          h('div', null, h('h4', { text: names.join(' / ') }), h('div', { class: 'sub', text: [sub, T.date(g.first) + ' – ' + T.date(g.last), ver, g.ids.length > 1 ? g.ids.length + ' 个连接标识' : ''].filter(Boolean).join('　') }), meta),
          h('div', { class: 'cnt' }, N.int(g.n), h('small', { text: '条记录' }))));
      });
      sec.body.appendChild(UI.note('iPhone、Apple Watch 的型号是根据硬件标识（如 iPhone14,5）对照得出；耳机等蓝牙设备只有型号代码，无法确定的不做猜测。'));
      // 时间线
      const top = groups.filter(function (g) { return g.n >= 10; }).slice(0, 14);
      if (top.length) {
        const sec2 = UI.section('设备使用时间线', '从第一条到最后一条记录。竖线是系统或固件版本更新的时间点，悬停可以看到版本号。', { color: D.other.color }); v.appendChild(sec2.el);
        const bx = UI.chartBox(); sec2.body.appendChild(h('div', { class: 'panel' }, bx));
        const kc = { phone: '#3987e5', watch: '#f2557a', audio: '#2ec4b6', tablet: '#9085e9', other: '#9aa9bc' };
        new CH.Gantt(bx, { t0: A.day0 * DAY, t1: (A.day1 + 1) * DAY, rows: top.map(function (g) { const vers = Array.from((g.software.size ? g.software : g.firmware).entries()).sort(function (a, b) { return a[1].first - b[1].first; }); return { name: Array.from(g.names.keys())[0], sub: (g.label || g.hardware || g.model || '') + ' · ' + N.int(g.n) + ' 条', color: kc[g.kind], spans: [[g.first, g.last]], ticks: vers.map(function (e) { return { t: e[1].first, label: e[0] }; }) }; }) });
      }
      // 系统版本
      const os = groups.filter(function (g) { return g.software.size > 1; });
      if (os.length) {
        const sec3 = UI.section('系统版本记录', '每个版本第一次和最后一次出现在数据里的时间，大致就是你升级系统的时间。', { color: D.other.color }); v.appendChild(sec3.el);
        const g3 = UI.grid(); sec3.body.appendChild(g3);
        os.forEach(function (g) {
          const p = UI.panel(Array.from(g.names.keys())[0] + (g.label ? ' · ' + g.label : ''), { span: 6, hint: g.software.size + ' 个版本' }); g3.appendChild(p.el);
          const rows = Array.from(g.software.entries()).map(function (e) { return { v: e[0], n: e[1].n, first: e[1].first, last: e[1].last }; }).sort(function (a, b) { return a.first - b.first; });
          p.body.appendChild(UI.table([{ k: 'v', label: '版本', fmt: function (x) { return (g.kind === 'watch' ? 'watchOS ' : 'iOS ') + x.v; } }, { k: 'first', label: '首次出现', fmt: function (x) { return T.date(x.first); }, sort: function (x) { return x.first; } }, { k: 'last', label: '最后出现', muted: true, fmt: function (x) { return T.date(x.last); } }, { k: 'n', label: '记录', n: true, fmt: function (x) { return N.int(x.n); }, sort: function (x) { return x.n; } }], rows, { sortK: 'first', dir: 1, maxH: 360 }));
        });
      }
      // 来源
      const sec4 = UI.section('数据来源', '写入「健康」的 App 或设备，以及它们写了什么。', { color: D.other.color }); v.appendChild(sec4.el);
      const q = INS.quality();
      const srows = ds.sources.map(function (s, i) { return { s: s, i: i, dup: q.dupBySrc[i] || 0, ue: (q.ueSources.find(function (x) { return x[0] === s.name; }) || [0, 0])[1] }; });
      sec4.body.appendChild(UI.table([
        { k: 'name', label: '来源', fmt: function (x) { return x.s.name; }, sort: function (x) { return x.s.name; } },
        { k: 'cls', label: '类别', muted: true, fmt: function (x) { return A.SRC_CLASS[x.s.cls]; } },
        { k: 'n', label: '记录', n: true, fmt: function (x) { return N.int(x.s.n); }, sort: function (x) { return x.s.n; } },
        { k: 'types', label: '数据种类', n: true, fmt: function (x) { return x.s.types.length; }, sort: function (x) { return x.s.types.length; } },
        { k: 'span', label: '时间', muted: true, fmt: function (x) { return T.date(x.s.first) + ' – ' + T.date(x.s.last); }, sort: function (x) { return x.s.first; } },
        { k: 'ver', label: '版本', muted: true, fmt: function (x) { return x.s.versions.length ? x.s.versions[0][0] + (x.s.versions.length > 1 ? ' … ' + x.s.versions[x.s.versions.length - 1][0] + '（' + x.s.versions.length + ' 个）' : '') : '—'; } },
        { k: 'dup', label: '重复', n: true, fmt: function (x) { return x.dup ? N.int(x.dup) : '—'; }, sort: function (x) { return x.dup; } },
        { k: 'ue', label: '手动录入', n: true, fmt: function (x) { return x.ue ? N.int(x.ue) : '—'; }, sort: function (x) { return x.ue; } }
      ], srows, { sortK: 'n', scroll: false, onClick: function (x) { openSource(x.i); } }));
      sec4.body.appendChild(UI.note('点一行可以看到这个来源写入的每一种数据。'));
      // 每月数据量
      const sec5 = UI.section('每个月写入了多少数据', '按来源堆叠（前 5 个来源，其余合并为「其他」）。', { color: D.other.color }); v.appendChild(sec5.el);
      const topSrc = ds.sources.map(function (s, i) { return [i, s.n]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5).map(function (x) { return x[0]; });
      const perSrc = topSrc.map(function () { return new Float64Array(A.nDays); }), other = new Float64Array(A.nDays);
      ds.types.forEach(function (t) { for (let i = 0; i < t.n; i++) { const di = Math.floor(t.s[i] / DAY) - A.day0; if (di < 0 || di >= A.nDays) continue; const k = topSrc.indexOf(t.src[i]); if (k >= 0) perSrc[k][di]++; else other[di]++; } });
      const series = perSrc.map(function (arr, k) { const ro = A.rollup(arr, A.day0, A.day1, 'month', 'sum'); return { name: ds.sources[topSrc[k]].name, color: CH.PAL[k], type: 'bar', stack: true, y: ro.y, x: ro.x }; });
      const roO = A.rollup(other, A.day0, A.day1, 'month', 'sum'); series.push({ name: '其他', color: '#556279', type: 'bar', stack: true, y: roO.y });
      const bx5 = UI.chartBox(); const p5 = h('div', { class: 'panel' }, bx5); sec5.body.appendChild(p5);
      new CH.TimeChart(bx5, { x: series[0].x, gran: 'month', series: series, fmt: function (x) { return N.int(x) + ' 条'; } }, { height: 240 });
      p5.appendChild(UI.legend(series.map(function (s) { return { name: s.name, color: s.color, box: true }; })));
      // 数据质量
      const sec6 = UI.section('数据质量', '手机上的「健康」App 不会告诉你这些。', { color: D.other.color }); v.appendChild(sec6.el);
      const stp = A.has(Q('StepCount')) ? A.stats(Q('StepCount'), A.day0, A.day1) : null;
      sec6.body.appendChild(UI.facts([
        { k: '完全重复的记录', v: N.int(q.dupRecords), u: '条', w: q.topDupSources.map(function (x) { return x[0] + ' ' + N.int(x[1]); }).join('、') || '没有' },
        { k: '重复的体能训练', v: N.int(q.dupWorkouts), u: '条', w: '同一来源、同一起止时间' },
        { k: '手动录入的记录', v: N.int(q.userEntered), u: '条', w: q.ueSources.map(function (x) { return x[0] + ' ' + N.int(x[1]); }).join('、') || '没有' },
        stp ? { k: '步数：直接相加 vs 去重后', v: N.cn(S.sum(stp.rawBySrc) + stp.dupTotal + stp.ueTotal) + ' → ' + N.cn(stp.total), w: '去掉了重复 ' + N.cn(stp.dupTotal) + '、手动录入 ' + N.cn(stp.ueTotal) + '，并合并了 iPhone 与手表重叠的时段' } : null,
        { k: '活动能量校验', v: (function () { const t = A.sumDaily(Q('ActiveEnergyBurned')); const R = A.rings; const e = []; for (let i = 0; i < A.nDays; i++) if (R.has[i] && R.move[i] > 20 && t.has[i]) e.push(Math.abs(t.daily[i] - R.move[i]) / R.move[i]); return e.length ? N.pct(S.q(e.sort(function (a, b) { return a - b; }), 0.5), 1) : '—'; })(), w: '去重后的每日活动能量与 Apple 圆环数值的中位误差' }
      ]));
      // 导出文件清单
      const sec7 = UI.section('导出包里的文件', A.ds.fileName + ' · ' + N.fix(A.ds.fileSize / 1048576, 1) + ' MB'); v.appendChild(sec7.el);
      const kinds = { xml: '主数据', cda: '临床文档格式（与主数据内容重复，未重复读取）', ecg: '心电图', route: 'GPS 轨迹', clinical: '临床记录', other: '其他' };
      const agg = {}; ds.files.forEach(function (f) { const o = agg[f.kind] || (agg[f.kind] = { kind: f.kind, n: 0, size: 0, comp: 0, names: [] }); o.n++; o.size += f.size; o.comp += f.comp; if (o.names.length < 3) o.names.push(f.name.split('/').pop()); });
      sec7.body.appendChild(UI.table([{ k: 'k', label: '内容', fmt: function (x) { return kinds[x.kind] || x.kind; } }, { k: 'n', label: '文件数', n: true, fmt: function (x) { return x.n; } }, { k: 's', label: '解压后', n: true, fmt: function (x) { return N.fix(x.size / 1048576, 1) + ' MB'; }, sort: function (x) { return x.size; } }, { k: 'c', label: '压缩后', n: true, fmt: function (x) { return N.fix(x.comp / 1048576, 1) + ' MB'; } }, { k: 'e', label: '示例', muted: true, fmt: function (x) { return x.names.join('、') + (x.n > 3 ? ' …' : ''); } }], Object.values(agg), { scroll: false, sortK: 's' }));
      sec7.body.appendChild(UI.note('共解析 ' + N.int(ds.counts.lines) + ' 行、' + N.int(ds.counts.records) + ' 条记录、' + N.int(ds.counts.meta) + ' 条元数据，用时 ' + N.fix(ds.parseMs / 1000, 1) + ' 秒。'));
    }
  };
  function openSource(i) {
    const s = A.ds.sources[i];
    UI.drawer(s.name, function (body) {
      body.appendChild(UI.readouts([{ k: '记录', v: s.n, fmt: N.int, u: '条' }, { k: '类别', text: A.SRC_CLASS[s.cls] }, { k: '时间', text: T.date(s.first) + ' – ' + T.date(s.last) }, { k: '版本', text: String(s.versions.length) + ' 个' }], { tight: true }));
      const p = UI.panel('写入的数据', { hint: s.types.length + ' 种' }); p.el.style.marginTop = '16px'; body.appendChild(p.el);
      p.body.appendChild(UI.barList(s.types.slice().sort(function (a, b) { return b[1] - a[1]; }).map(function (tp) { const def = CAT.type(tp[0]); return { name: HL.typeName(tp[0]), v: tp[1], text: N.int(tp[1]), unit: '条', color: (D[def.dom] || D.other).color, onClick: /^HK/.test(tp[0]) ? function () { UI.closeDrawer(); HL.App.go('explore', { type: tp[0] }); } : null }; })));
      if (s.versions.length) { const p2 = UI.panel('版本'); p2.el.style.marginTop = '16px'; body.appendChild(p2.el); p2.body.appendChild(UI.table([{ k: 'v', label: '版本', fmt: function (x) { return x[0]; } }, { k: 'n', label: '记录', n: true, fmt: function (x) { return N.int(x[1]); } }, { k: 'f', label: '首次', fmt: function (x) { return T.date(x[2]); } }, { k: 'l', label: '最后', muted: true, fmt: function (x) { return T.date(x[3]); } }], s.versions, { maxH: 400 })); }
    });
  }

  // =============== 全部数据 ===============
  P.explore = {
    title: '全部数据', icon: 'all', color: '#c6d0dd',
    count: function () { return String(A.ds.types.filter(function (t) { return t.n; }).length); },
    sub: function () { return '导出包里每一种数据：完整统计、图表、极值、元数据和原始记录'; },
    render: function (v, params) {
      const types = A.ds.types.filter(function (t) { return t.n; });
      let cur = params.type && A.t(params.type) ? params.type : (A.has(Q('StepCount')) ? Q('StepCount') : types[0].id);
      const split = h('div', { class: 'split' }); v.appendChild(split);
      const left = h('div', { class: 'typelist' }), right = h('div', { style: { minWidth: 0 } });
      split.appendChild(left); split.appendChild(right);
      const search = h('input', { class: 'search', type: 'search', placeholder: '搜索数据类型…', 'aria-label': '搜索数据类型' });
      left.appendChild(search);
      const listEl = h('div'); left.appendChild(listEl);
      const fill = function () {
        listEl.textContent = '';
        const q = search.value.trim().toLowerCase();
        Object.keys(D).forEach(function (dk) {
          const ts = types.filter(function (t) { return t.def.dom === dk && (!q || t.def.name.toLowerCase().indexOf(q) >= 0 || t.id.toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return b.n - a.n; });
          if (!ts.length) return;
          listEl.appendChild(h('div', { class: 'grp', style: { '--c': D[dk].color } }, h('i'), D[dk].name));
          ts.forEach(function (t) { const b = h('button', { type: 'button', class: t.id === cur ? 'on' : '' }, h('span', { text: t.def.name }), h('span', { text: t.n >= 1e4 ? N.cn(t.n, 0) : N.int(t.n) })); b.addEventListener('click', function () { cur = t.id; history.replaceState(null, '', '#/explore?type=' + encodeURIComponent(cur)); fill(); show(); }); listEl.appendChild(b); });
        });
      };
      search.addEventListener('input', fill);
      const show = function () { CH.destroyAll(right); right.textContent = ''; M.full(right, cur); right.classList.remove('view-enter'); void right.offsetWidth; right.classList.add('view-enter'); };
      fill(); show();
    }
  };
})();
