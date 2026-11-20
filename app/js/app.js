/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 应用外壳：导航、时间范围、导入流程、设置 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, A = HL.A, UI = HL.UI, CH = HL.CH, CAT = HL.CAT;
  const DAY = 86400000;
  const App = HL.App = HL.App || {};
  HL.pages = HL.pages || {};
  const NAV = [
    { group: null, items: ['overview'] },
    { group: '身体数据', items: ['activity', 'heart', 'sleep', 'workouts', 'mobility', 'resp', 'hearing', 'body', 'ecg'] },
    { group: '更深一层', items: ['insights', 'records', 'year', 'devices', 'explore'] }
  ];
  App.state = { page: 'overview', params: {}, preset: HL.store.ui.get('preset', 'all'), custom: null };

  // ---------- 外壳 ----------
  function shell() {
    const app = document.getElementById('app');
    app.textContent = '';
    const brand = h('div', { class: 'brand' }, UI.logo(), h('span', null, '健康透镜', h('small', { text: 'Apple 健康数据全景' })));
    const nav = h('nav', { id: 'nav', 'aria-label': '页面' });
    const foot = h('div', { class: 'rail-foot', id: 'railFoot' });
    app.appendChild(h('aside', { class: 'rail' }, brand, nav, foot));
    const main = h('main', { id: 'main' },
      h('header', { class: 'topbar' }, h('div', { class: 'page-head' }, h('h1', { id: 'pageTitle' }), h('p', { id: 'pageSub' })), h('div', { class: 'filters', id: 'filters' })),
      h('div', { id: 'view' }));
    app.appendChild(main);
  }
  function buildNav() {
    const nav = document.getElementById('nav'); nav.textContent = '';
    NAV.forEach(function (g) {
      if (g.group) nav.appendChild(h('div', { class: 'nav-group', text: g.group }));
      g.items.forEach(function (id) {
        const p = HL.pages[id]; if (!p) return;
        if (p.available && !p.available()) return;
        const b = h('button', { class: 'nav-item', type: 'button', 'data-page': id, style: { '--c': p.color || '#edf1f7' } }, UI.icon(p.icon), h('span', { text: p.title }), p.count ? h('span', { class: 'cnt', text: p.count() }) : null, h('span', { class: 'dot' }));
        b.addEventListener('click', function () { App.go(id); });
        nav.appendChild(b);
      });
    });
    const ds = A.ds, foot = document.getElementById('railFoot'); foot.textContent = '';
    foot.appendChild(h('div', { class: 'row' }, h('span', { text: '导出于' }), h('span', { text: ds.exportDate ? ds.exportDate.slice(0, 16) : '—' })));
    foot.appendChild(h('div', { class: 'row' }, h('span', { text: '记录' }), h('span', { class: 'num', text: N.int(ds.counts.records) + ' 条' })));
    const imp = h('button', { class: 'btn sm', type: 'button', title: '导入新的导出文件' }, UI.icon('upload'), '导入');
    imp.addEventListener('click', function () { showImporter(true); });
    const set = h('button', { class: 'btn sm', type: 'button' }, UI.icon('settings'), '设置');
    set.addEventListener('click', openSettings);
    foot.appendChild(h('div', { class: 'acts' }, imp, set));
    foot.appendChild(h('div', { class: 'copy', title: HL.about.name + ' ' + HL.about.en + '，版权所有 ' + HL.about.copyright + '，采用 MIT 许可证', text: HL.about.copyright }));
  }
  function markNav() { document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-page') === App.state.page); }); }

  // ---------- 时间范围 ----------
  function presetRange(p) {
    const end = A.day1;
    if (p === '365') return [end - 364, end];
    if (p === '90') return [end - 89, end];
    if (p === '30') return [end - 29, end];
    if (p === '7') return [end - 6, end];
    if (/^y\d{4}$/.test(p)) { const y = +p.slice(1); return [T.day(Date.UTC(y, 0, 1)), T.day(Date.UTC(y, 11, 31))]; }
    if (p === 'custom' && App.state.custom) return App.state.custom;
    return [A.day0, A.day1];
  }
  function applyRange() { const r = presetRange(App.state.preset); A.setRange(r[0], r[1]); }
  function buildFilters() {
    const f = document.getElementById('filters'); f.textContent = '';
    const page = HL.pages[App.state.page];
    if (page && page.noFilters) { f.style.display = 'none'; return; }
    f.style.display = '';
    const quick = [{ v: 'all', label: '全部' }, { v: '365', label: '近一年' }, { v: '90', label: '近 90 天' }, { v: '30', label: '近 30 天' }];
    const isQuick = quick.some(function (q) { return q.v === App.state.preset; });
    const seg = UI.seg(quick, isQuick ? App.state.preset : null, function (v) { setPreset(v); });
    f.appendChild(seg);
    const y0 = T.year(A.day0 * DAY), y1 = T.year(A.day1 * DAY);
    const years = [{ v: '', label: '按年份…' }]; for (let y = y1; y >= y0; y--) years.push({ v: 'y' + y, label: y + ' 年' });
    const ysel = UI.select(years, /^y\d{4}$/.test(App.state.preset) ? App.state.preset : '', function (v) { if (v) setPreset(v); });
    f.appendChild(ysel);
    const r = A.range;
    const di0 = h('input', { type: 'date', class: 'sel', value: T.ymd(r.d0 * DAY), min: T.ymd(A.day0 * DAY), max: T.ymd(A.day1 * DAY), 'aria-label': '开始日期' });
    const di1 = h('input', { type: 'date', class: 'sel', value: T.ymd(r.d1 * DAY), min: T.ymd(A.day0 * DAY), max: T.ymd(A.day1 * DAY), 'aria-label': '结束日期' });
    const onDate = function () { const a = Date.parse(di0.value + 'T00:00:00Z'), b = Date.parse(di1.value + 'T00:00:00Z'); if (isFinite(a) && isFinite(b) && b >= a) { App.state.custom = [T.day(a), T.day(b)]; setPreset('custom'); } };
    di0.addEventListener('change', onDate); di1.addEventListener('change', onDate);
    f.appendChild(di0); f.appendChild(h('span', { class: 'span-note', text: '至' })); f.appendChild(di1);
    f.appendChild(h('span', { class: 'span-note', text: '共 ' + N.int(r.d1 - r.d0 + 1) + ' 天' }));
  }
  function setPreset(p) { App.state.preset = p; HL.store.ui.set('preset', p === 'custom' ? 'all' : p); applyRange(); render(true); }
  App.setRangeDays = function (d0, d1) { App.state.custom = [d0, d1]; setPreset('custom'); };

  // ---------- 路由 ----------
  App.go = function (page, params) {
    const q = params ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
    const hash = '#/' + page + q;
    if (location.hash === hash) render(); else location.hash = hash;
  };
  function parseHash() {
    const m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash || '');
    const page = m && HL.pages[m[1]] ? m[1] : 'overview';
    const params = {};
    if (m && m[2]) m[2].split('&').forEach(function (kv) { const i = kv.indexOf('='); if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    return { page: page, params: params };
  }
  function render(keepScroll) {
    if (!A.ds) return;
    const r = parseHash();
    const changed = r.page !== App.state.page;
    App.state.page = r.page; App.state.params = r.params;
    const page = HL.pages[r.page];
    const view = document.getElementById('view'), main = document.getElementById('main');
    CH.destroyAll(view);
    UI.closeDrawer();
    view.textContent = '';
    view.classList.remove('view-enter');
    document.getElementById('pageTitle').textContent = page.title;
    document.getElementById('pageSub').textContent = page.sub ? page.sub() : '';
    document.title = page.title + ' · 健康透镜';
    buildFilters(); markNav();
    try { page.render(view, r.params); }
    catch (err) { console.error(err); view.appendChild(UI.empty('这个页面出错了：' + (err && err.message))); }
    void view.offsetWidth; view.classList.add('view-enter');
    if (changed || !keepScroll) main.scrollTop = 0;
  }
  App.render = render;
  window.addEventListener('hashchange', function () { render(); });

  // ---------- 设置 ----------
  function openSettings() {
    UI.modal('设置', function (box) {
      const st = A.settings;
      const dedup = UI.select([{ v: 'max', label: '每 15 分钟取各设备最大值（推荐）' }, { v: 'priority', label: '优先 Apple Watch，其次 iPhone' }, { v: 'sum', label: '不去重，全部相加' }], st.dedup, function (v) { save({ dedup: v }); });
      const ue = h('input', { type: 'checkbox' }); ue.checked = st.excludeUserEntered; ue.addEventListener('change', function () { save({ excludeUserEntered: ue.checked }); });
      const sg = h('input', { type: 'number', class: 'sel', min: 4, max: 12, step: 0.5, value: st.sleepGoalMin / 60, style: { width: '90px' } }); sg.addEventListener('change', function () { const v = parseFloat(sg.value); if (v >= 3 && v <= 14) save({ sleepGoalMin: Math.round(v * 60) }); });
      const pg = h('input', { type: 'number', class: 'sel', min: 1000, max: 50000, step: 500, value: st.stepGoal, style: { width: '110px' } }); pg.addEventListener('change', function () { const v = parseInt(pg.value, 10); if (v >= 500) save({ stepGoal: v }); });
      box.appendChild(h('div', { class: 'form-row' }, h('label', { text: '跨设备去重' }), dedup, h('div', { class: 'help', text: 'iPhone 和 Apple Watch 会同时计步。去重只影响步数、距离、能量这类累计数据。' })));
      box.appendChild(h('div', { class: 'form-row' }, h('label', { text: '手动录入' }), h('label', null, ue, ' 累计数据里不计入手动录入的记录'), h('div', { class: 'help', text: '例如第三方 App 写入的「3 万步」这类整块记录。' })));
      box.appendChild(h('div', { class: 'form-row' }, h('label', { text: '睡眠目标' }), h('span', null, sg, ' 小时')));
      box.appendChild(h('div', { class: 'form-row' }, h('label', { text: '步数目标' }), h('span', null, pg, ' 步')));
      const clr = h('button', { class: 'btn', type: 'button', text: '清除本机保存的数据' });
      let armed = false;
      clr.addEventListener('click', function () {
        if (!armed) { armed = true; clr.textContent = '再点一次确认清除'; clr.style.borderColor = 'rgba(208,59,59,.6)'; return; }
        HL.store.clear().then(function () { UI.closeModal(); UI.toast('已清除'); location.hash = ''; location.reload(); });
      });
      const close = h('button', { class: 'btn primary', type: 'button', text: '完成' }); close.addEventListener('click', UI.closeModal);
      box.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '18px', gap: '10px' } }, clr, close));
      box.appendChild(h('p', { class: 'note', style: { marginTop: '14px' }, text: '所有数据只在这台电脑上处理和保存，软件不联网。导入文件：' + (A.ds.fileName || '') + '，解析用时 ' + N.fix(A.ds.parseMs / 1000, 1) + ' 秒。' }));
      box.appendChild(h('p', { class: 'note', style: { marginTop: '6px' }, text: HL.about.name + ' ' + HL.about.en + '，版权所有 ' + HL.about.copyright + '，采用 MIT 许可证。' }));
    });
    function save(o) { A.setSettings(o); HL.store.settings.set(A.settings); render(true); }
  }

  // ---------- 导入 ----------
  let worker = null, trace = null, speed = 0.4;
  function importer() {
    const el = document.getElementById('importer'); el.textContent = '';
    const input = h('input', { type: 'file', accept: '.zip,.xml', style: { display: 'none' } });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button' },
      h('div', null, h('h2', { text: '把「导出.zip」拖到这里' }), h('p', { text: '或者点这里选择文件。支持 iPhone「健康」导出的压缩包，也支持解压后的 导出.xml / export.xml。' })),
      h('span', { class: 'btn primary' }, UI.icon('upload'), '选择文件'));
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { if (input.files[0]) parse(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); if (ev === 'dragleave' && e.target !== el && el.contains(e.relatedTarget)) return; drop.classList.remove('over'); }); });
    el.addEventListener('drop', function (e) { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) parse(f); });
    const cv = h('canvas');
    const close = A.ds ? h('button', { class: 'btn ghost', type: 'button', style: { position: 'absolute', right: '28px', top: '24px' } }, UI.icon('close'), '返回') : null;
    if (close) close.addEventListener('click', function () { showImporter(false); });
    const inner = h('div', { class: 'imp-inner' },
      h('div', { class: 'imp-brand' }, UI.logo(), h('div', null, h('h1', { text: '健康透镜' }), h('p', { text: '把 iPhone 和 Apple Watch 记下的一切，摊开来看。' }))),
      h('div', { class: 'imp-trace' }, cv),
      drop,
      h('div', { class: 'imp-help' },
        h('div', null, h('h4', { text: '怎样从 iPhone 导出' }), h('ol', null, h('li', { text: '打开「健康」App，点右上角头像' }), h('li', { text: '滑到最下面，点「导出所有健康数据」' }), h('li', { text: '等待生成后，用隔空投送、微信文件传输或数据线把「导出.zip」发到电脑' }))),
        h('div', null, h('h4', { text: '会读取哪些内容' }), h('p', { style: { margin: 0, lineHeight: 1.9 }, text: '全部记录与元数据、来源 App 和设备、体能训练与 GPS 轨迹、心电图原始波形、逐拍心跳、睡眠分期、活动圆环、听力图。数据只在这台电脑上处理，不会上传。' }))),
      h('div', { class: 'imp-progress' },
        h('div', { class: 'imp-bar' }, h('i', { id: 'impBar' })),
        h('div', { class: 'imp-stat' }, h('span', { id: 'impPhase', text: '正在读取…' }), h('span', null, h('b', { id: 'impCount', text: '0' }), ' 条记录 · ', h('span', { id: 'impTime', text: '0.0 秒' }))),
        h('div', { class: 'imp-live', id: 'impLive' })),
      h('div', { class: 'imp-err', id: 'impErr' }),
      h('p', { class: 'imp-privacy', text: '健康透镜在本机运行，不联网。解析结果保存在这台电脑上，下次打开不用重新导入。' }),
      h('p', { class: 'imp-copy', text: HL.about.name + ' ' + HL.about.copyright }));
    el.appendChild(inner); if (close) el.appendChild(close); el.appendChild(input);
    requestAnimationFrame(function () { if (trace) trace.stop(); trace = CH.traceLoop(cv, function () { return speed; }); });
  }
  function showImporter(on) {
    const el = document.getElementById('importer');
    if (on) { importer(); el.classList.remove('hide', 'busy'); }
    else { el.classList.add('hide'); setTimeout(function () { if (trace) { trace.stop(); trace = null; } }, 700); }
  }
  App.showImporter = showImporter;
  function parse(file) {
    const el = document.getElementById('importer'); el.classList.add('busy');
    const err = document.getElementById('impErr'); err.classList.remove('on');
    const seen = new Set(), live = document.getElementById('impLive');
    const t0 = performance.now();
    if (worker) worker.terminate();
    const src = '(' + __healthParserModule.toString() + ')()';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = function (ev) {
      const m = ev.data;
      if (m.type === 'progress') {
        const pct = m.phase === 'xml' ? (m.total ? m.done / m.total : 0) * 0.92 : m.phase === 'ecg' ? 0.92 + 0.03 * (m.done / Math.max(1, m.total)) : m.phase === 'route' ? 0.95 + 0.03 * (m.done / Math.max(1, m.total)) : 0.99;
        document.getElementById('impBar').style.width = (pct * 100).toFixed(1) + '%';
        document.getElementById('impCount').textContent = N.int(m.records);
        document.getElementById('impTime').textContent = N.fix((performance.now() - t0) / 1000, 1) + ' 秒';
        document.getElementById('impPhase').textContent = m.phase === 'xml' ? '正在解析记录（' + N.fix(m.done / 1048576, 0) + ' / ' + N.fix(m.total / 1048576, 0) + ' MB 压缩数据）' : m.phase === 'ecg' ? '正在读取心电图 ' + m.done + '/' + m.total : m.phase === 'route' ? '正在读取 GPS 轨迹 ' + m.done + '/' + m.total : '正在整理…';
        speed = Math.min(1.6, 0.4 + (m.records / Math.max(1, (performance.now() - t0) / 1000)) / 120000);
        if (m.live) m.live.sort(function (a, b) { return b[1] - a[1]; }).forEach(function (e) {
          let it = live.querySelector('[data-id="' + e[0] + '"]');
          if (!it) { if (seen.size > 40) return; seen.add(e[0]); it = h('div', { class: 'it', 'data-id': e[0] }, h('span', { text: CAT.type(e[0]).name }), h('b')); live.appendChild(it); }
          it.lastChild.textContent = N.int(e[1]);
        });
      } else if (m.type === 'done') {
        document.getElementById('impPhase').textContent = '解析完成，正在保存到本机…';
        document.getElementById('impBar').style.width = '100%';
        const ds = m.data;
        start(ds);
        HL.store.save(ds).then(function () { UI.toast('已保存到本机，下次打开会直接显示'); }).catch(function (e) { UI.toast('没能保存到本机：' + (e && e.message ? e.message : e) + '。本次仍可正常查看。'); });
        setTimeout(function () { showImporter(false); }, 350);
        worker.terminate(); worker = null;
      } else if (m.type === 'error') {
        el.classList.remove('busy');
        err.textContent = '没能读取这个文件：' + m.message;
        err.classList.add('on');
        worker.terminate(); worker = null;
      }
    };
    worker.onerror = function (e) { el.classList.remove('busy'); err.textContent = '解析出错：' + (e.message || '未知错误'); err.classList.add('on'); };
    worker.postMessage({ cmd: 'parse', file: file });
  }

  function start(ds) {
    A.init(ds, HL.store.settings.get());
    applyRange();
    buildNav();
    render();
  }
  App.start = start;

  // ---------- 启动 ----------
  function boot() {
    try { console.info('%c' + HL.about.name + ' ' + HL.about.en + '%c  Copyright ' + HL.about.copyright + '. Licensed under the MIT License.', 'color:#f2557a;font-weight:600', ''); } catch (e) { /* 控制台不可用时忽略 */ }
    shell();
    importer();
    HL.store.load().then(function (ds) {
      if (ds && ds.format === 'healthlens-1' && ds.types) { start(ds); showImporter(false); }
      else showImporter(true);
    }).catch(function () { showImporter(true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
