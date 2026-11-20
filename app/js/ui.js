/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 界面组件 */
(function () {
  'use strict';
  const HL = window.HL;
  const h = HL.h, T = HL.T, N = HL.N, CH = HL.CH, ease = HL.ease;
  const UI = HL.UI = {};

  // 线性图标（程序内置的静态 SVG）
  const I = {
    overview: '<path d="M4 13h4l2.5-6 3 12 2.5-8H20"/><circle cx="12" cy="12" r="9.5" opacity=".35"/>',
    activity: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    sleep: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    workout: '<circle cx="14.5" cy="4.8" r="1.8"/><path d="M8 21l3-6 3 2v4M6.5 11.5l3.5-3 4 1.5 2 3h3M11 15l1.5-5"/>',
    mobility: '<path d="M8.5 3.5c1.6 0 2.3 2 2.3 4.2s-.7 4-2.3 4-2.3-1.8-2.3-4 .7-4.2 2.3-4.2zM7 14.2h3.2l-.3 2.6a1.5 1.5 0 0 1-2.6 0zM15.5 8c1.6 0 2.3 2 2.3 4.2s-.7 4-2.3 4-2.3-1.8-2.3-4 .7-4.2 2.3-4.2zM14 18.7h3.2l-.3 2a1.5 1.5 0 0 1-2.6 0z"/>',
    resp: '<path d="M12 4v8M12 12c-1.5 0-3-2-4.5-4S4 6 4 9.5V17a3 3 0 0 0 3 3c2 0 4-1.5 5-4M12 12c1.5 0 3-2 4.5-4S20 6 20 9.5V17a3 3 0 0 1-3 3c-2 0-4-1.5-5-4"/>',
    hearing: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.6"/><rect x="17" y="14" width="4" height="6" rx="1.6"/>',
    body: '<circle cx="12" cy="4.8" r="2"/><path d="M5 8.5h14M12 8.5v6M9 21l3-6.5 3 6.5"/>',
    ecg: '<path d="M2.5 12h4l1.5-3 2.5 8 3-13 2.5 8h5.5"/>',
    devices: '<rect x="4" y="3" width="9" height="18" rx="2"/><rect x="15" y="8" width="6" height="9" rx="2"/><path d="M8 18h1"/>',
    records: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17.5h5v3h-5z"/>',
    insights: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    all: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    year: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    watch: '<rect x="6" y="6" width="12" height="12" rx="3.5"/><path d="M9 6l.7-3h4.6l.7 3M9 18l.7 3h4.6l.7-3"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    tablet: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M11 18h2"/>',
    audio: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.6"/><rect x="17" y="14" width="4" height="6" rx="1.6"/>',
    app: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 12h6M12 9v6"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>'
  };
  UI.icon = function (name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = I[name] || I.app;
    return s;
  };
  UI.logo = function () {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8aa5"/><stop offset=".55" stop-color="#f2557a"/><stop offset="1" stop-color="#8b80f0"/></linearGradient></defs>' +
      '<circle cx="24" cy="24" r="20" fill="none" stroke="url(#lg)" stroke-width="3" opacity=".9"/><circle cx="24" cy="24" r="13" fill="none" stroke="url(#lg)" stroke-width="1.6" opacity=".45"/>' +
      '<path d="M6 25h9l3-7 5 15 4-13 3 5h12" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return s;
  };

  // ---------- 区块 ----------
  UI.section = function (title, desc, opt) {
    opt = opt || {};
    const acts = h('div', { class: 'acts' });
    const head = h('div', { class: 'sec-head' }, h('div', null, h('h2', null, opt.color ? h('span', { class: 'sw', style: { '--c': opt.color } }) : null, title), desc ? h('p', { text: desc }) : null), acts);
    const body = h('div', { class: 'sec-body' });
    const el = h('section', { class: 'sec', id: opt.id || null }, head, body);
    return { el: el, body: body, acts: acts, head: head };
  };
  UI.panel = function (title, opt) {
    opt = opt || {};
    const acts = h('div', { class: 'acts' });
    const head = title ? h('div', { class: 'panel-h' }, h('h3', null, opt.color ? h('span', { class: 'sw', style: { '--c': opt.color } }) : null, title), opt.hint ? h('span', { class: 'hint', text: opt.hint }) : null, acts) : null;
    const body = h('div', { class: 'panel-b' });
    const el = h('div', { class: 'panel' + (opt.cls ? ' ' + opt.cls : '') }, head, opt.desc ? h('p', { class: 'desc', text: opt.desc }) : null, body);
    if (opt.span) el.classList.add('c' + opt.span);
    return { el: el, body: body, acts: acts };
  };
  UI.grid = function () { return h('div', { class: 'grid' }); };
  UI.empty = function (msg) { return h('div', { class: 'empty', text: msg || '这里还没有数据' }); };
  UI.note = function (text) { return h('p', { class: 'note', text: text }); };

  // ---------- 读数 ----------
  // items: [{k, v(数值), fmt(v), u, s, sNode, spark:[...], color, big, delta:{v, good, text}}]
  UI.readouts = function (items, opt) {
    const el = h('div', { class: 'readouts' + (opt && opt.tight ? ' tight' : '') });
    items.forEach(function (it) {
      if (!it) return;
      const v = h('div', { class: 'v' });
      const ro = h('div', { class: 'ro' + (it.big ? ' big' : '') }, h('div', { class: 'k', text: it.k, title: it.k }), v);
      const valNode = h('span'); v.appendChild(valNode);
      if (it.u) v.appendChild(h('span', { class: 'u', text: it.u }));
      const finalText = it.text !== undefined ? String(it.text) : (typeof it.v === 'number' ? (it.fmt ? it.fmt(it.v) : N.auto(it.v)) : (it.v == null ? '—' : String(it.v)));
      if (typeof it.v === 'number' && isFinite(it.v) && it.fmt) UI.countUp(valNode, it.v, it.fmt);
      else valNode.textContent = finalText;
      v._final = finalText; if (fitObserver) fitObserver.observe(v);
      v._unitOptional = !!(opt && opt.unitInHint && it.u === opt.unitInHint); // 面板标题旁已写明单位时，窄格子里可以省掉单位
      if (it.delta) { const d = it.delta; const cls = !(d.v === d.v) || Math.abs(d.v) < 1e-9 ? 'flat' : ((d.v > 0) === (d.good !== false) ? 'up' : 'down'); ro.appendChild(h('div', { class: 's' }, h('span', { class: 'delta ' + cls, text: d.text }), d.label ? ' ' + d.label : '')); }
      if (it.s || it.sNode) ro.appendChild(h('div', { class: 's', title: typeof it.s === 'string' ? it.s : '' }, it.sNode || it.s));
      if (it.spark && it.spark.length > 1) { const cv = h('canvas', { class: 'spark' }); ro.appendChild(cv); requestAnimationFrame(function () { CH.spark(cv, it.spark, it.color); }); }
      el.appendChild(ro);
    });
    return el;
  };
  // 读数字号自适应：按最终数值测量，放不下就逐级缩小（窗口变宽变窄时重新计算），不再截断成「6小时12…」
  const fitObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(function (es) {
    const todo = [];
    es.forEach(function (e) { const w = Math.round(e.contentRect.width); if (w > 0 && w !== e.target._fitW) { e.target._fitW = w; todo.push(e.target); } });
    if (todo.length) requestAnimationFrame(function () { todo.forEach(UI.fitValue); }); // 放到下一帧改字号，避免 ResizeObserver 循环告警
  });
  UI.fitValue = function (v) {
    if (!v.isConnected || v._final == null || !v.firstChild) return;
    const span = v.firstChild, unit = span.nextSibling, shown = span.textContent;
    span.textContent = v._final; v.style.fontSize = ''; v.style.lineHeight = ''; if (unit) unit.style.display = '';
    const cs = getComputedStyle(v), base = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || base * 1.25;
    v.style.textOverflow = 'clip'; // 量的是完整文字宽度（scrollWidth 取整，差零点几像素也会出现省略号，所以用 Range 精确量）
    const range = document.createRange(); range.selectNodeContents(v);
    const shrink = function () {
      let fs = base; v.style.fontSize = '';
      const tooWide = function () { return range.getBoundingClientRect().width > v.getBoundingClientRect().width - 1; };
      while (tooWide() && fs > 13) { fs -= 1; v.style.fontSize = fs + 'px'; }
      return fs;
    };
    let fs = shrink();
    if (fs < 20 && unit && v._unitOptional) { unit.style.display = 'none'; v.title = v._final + ' ' + unit.textContent; fs = shrink(); }
    if (fs < base) v.style.lineHeight = lh + 'px'; // 行高不变，同一排读数的高度保持一致
    v.style.textOverflow = ''; span.textContent = shown;
  };
  UI.countUp = function (node, to, fmt, dur) {
    if (HL.reduceMotion || !isFinite(to)) { node.textContent = fmt(to); return; }
    const d = dur || 1100;
    node.textContent = fmt(0);
    const run = function () {
      let start = null;
      const step = function (now) { if (start === null) start = now; const k = Math.max(0, Math.min(1, (now - start) / d)); node.textContent = k < 1 ? fmt(to * ease.outExpo(k)) : fmt(to); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
      setTimeout(function () { node.textContent = fmt(to); }, d + 400); // 兜底：保证最终显示正确数值
    };
    requestAnimationFrame(function () { if (node.isConnected) CH.onReveal(node, run); else node.textContent = fmt(to); });
  };
  UI.facts = function (items) {
    const el = h('div', { class: 'facts' });
    items.forEach(function (it) { if (!it) return; el.appendChild(h('div', { class: 'fact' }, h('div', { class: 'k', text: it.k }), h('div', { class: 'v' }, it.v == null ? '—' : String(it.v), it.u ? h('span', { class: 'u', text: it.u }) : null), it.w ? h('div', { class: 'w', text: it.w }) : null)); });
    return el;
  };

  // ---------- 分段控件 ----------
  UI.seg = function (opts, value, onChange, cls) {
    const el = h('div', { class: 'seg' + (cls ? ' ' + cls : ''), role: 'tablist' });
    const pill = h('span', { class: 'pill' }); el.appendChild(pill);
    const btns = opts.map(function (o) {
      const b = h('button', { type: 'button', role: 'tab', text: o.label, title: o.title || null });
      b.addEventListener('click', function () { if (o.v === el._v) return; set(o.v); onChange(o.v); });
      el.appendChild(b); return b;
    });
    function set(v) {
      el._v = v;
      btns.forEach(function (b, i) { const on = opts[i].v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) requestAnimationFrame(function () { pill.style.left = b.offsetLeft + 'px'; pill.style.width = b.offsetWidth + 'px'; }); });
    }
    set(value);
    el.set = set;
    new ResizeObserver(function () { set(el._v); }).observe(el);
    return el;
  };
  UI.select = function (opts, value, onChange) {
    const s = h('select', { class: 'sel' });
    opts.forEach(function (o) { const op = h('option', { value: o.v, text: o.label }); if (o.v === value) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  };

  // ---------- 条形列表 ----------
  // rows: [{name, sub, v, text, color, onClick}]
  UI.barList = function (rows, opt) {
    opt = opt || {};
    const el = h('div', { class: 'barlist' });
    const max = opt.max || Math.max.apply(null, rows.map(function (r) { return r.v || 0; }).concat([1e-9]));
    const fills = [];
    rows.forEach(function (r) {
      const fill = h('div', { class: 'fill', style: { '--c': r.color || opt.color || '#a8b4c5' } });
      const row = h('div', { class: 'row', title: r.title || null }, h('div', { class: 'name' }, r.name, r.sub ? h('small', { text: r.sub }) : null), h('div', { class: 'track' }, fill), h('div', { class: 'val' }, r.text || N.auto(r.v), r.unit ? h('small', { text: r.unit }) : null));
      if (r.onClick) { row.style.cursor = 'pointer'; row.addEventListener('click', r.onClick); }
      el.appendChild(row); fills.push([fill, Math.max(0, r.v) / max]);
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { fills.forEach(function (f) { f[0].style.width = (Math.max(0.004, f[1]) * 100) + '%'; }); }); });
    return el;
  };
  // 分段条：parts [{name, v, color, text}]
  UI.segBar = function (parts, opt) {
    opt = opt || {};
    const tot = parts.reduce(function (s, p) { return s + (p.v > 0 ? p.v : 0); }, 0) || 1;
    const bar = h('div', { class: 'segbar' + (opt.thin ? ' thin' : ''), role: 'img', 'aria-label': parts.map(function (p) { return p.name + ' ' + N.pct(p.v / tot); }).join('，') });
    const blocks = [];
    parts.forEach(function (p) {
      if (!(p.v > 0)) return;
      const b = h('div', { style: { background: p.color, flexGrow: 0.0001, flexBasis: 0 } });
      if (!opt.thin) { b.textContent = p.text !== undefined ? p.text : N.pct(p.v / tot); if (p.dark) b.style.color = '#0b0b0b'; }
      b.addEventListener('pointermove', function (e) { CH.TT.show(e.clientX, e.clientY, function (el) { CH.tt.head(el, p.name); CH.tt.row(el, p.color, p.valText || N.auto(p.v), N.pct(p.v / tot, 1)); }); });
      b.addEventListener('pointerleave', function () { CH.TT.hide(); });
      bar.appendChild(b); blocks.push([b, p.v / tot]);
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { blocks.forEach(function (x) { x[0].style.flexGrow = x[1]; }); requestAnimationFrame(function () { blocks.forEach(function (x) { if (x[0].scrollWidth > x[0].clientWidth + 1) x[0].textContent = ''; }); }); }); });
    const wrap = h('div', null, bar);
    if (opt.legend !== false) wrap.appendChild(UI.legend(parts.filter(function (p) { return p.v > 0; }).map(function (p) { return { name: p.name + (opt.legendVal ? ' ' + opt.legendVal(p) : ''), color: p.color, box: true }; })));
    return wrap;
  };
  UI.legend = function (items) {
    const el = h('div', { class: 'legend' });
    items.forEach(function (it) { el.appendChild(h('span', null, h('i', { class: it.box ? 'box' : '', style: { '--c': it.color } }), it.name)); });
    return el;
  };
  UI.tag = function (text, color, cls) { return h('span', { class: 'tag' + (cls ? ' ' + cls : '') }, color ? h('i', { style: { '--c': color } }) : null, text); };

  // ---------- 表格 ----------
  // cols: [{k, label, n(数字列), fmt(row), sort(row)->value, w}]
  UI.table = function (cols, rows, opt) {
    opt = opt || {};
    let sortK = opt.sortK || null, dir = opt.dir || -1;
    const tbl = h('table', { class: 'tbl' });
    const thead = h('thead'), tbody = h('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);
    const tr = h('tr');
    cols.forEach(function (c) {
      const th = h('th', { class: (c.n ? 'n ' : '') + (c.sort ? 'sortable' : ''), style: c.w ? { width: c.w } : null }, c.label);
      if (c.sort) th.addEventListener('click', function () { if (sortK === c.k) dir = -dir; else { sortK = c.k; dir = -1; } render(); });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    function render() {
      let rs = rows.slice();
      const col = cols.find(function (c) { return c.k === sortK; });
      if (col && col.sort) rs.sort(function (a, b) { const x = col.sort(a), y = col.sort(b); return ((x > y) - (x < y)) * dir; });
      tbody.textContent = '';
      const lim = opt.limit ? Math.min(rs.length, opt.limit) : rs.length;
      for (let i = 0; i < lim; i++) {
        const r = rs[i]; const row = h('tr', { class: opt.onClick ? 'click' : '' });
        cols.forEach(function (c) { const v = c.fmt ? c.fmt(r) : r[c.k]; const td = h('td', { class: (c.n ? 'n' : '') + (c.muted ? ' muted' : '') }); if (v && v.nodeType) td.appendChild(v); else td.textContent = v == null ? '—' : String(v); row.appendChild(td); });
        if (opt.onClick) row.addEventListener('click', function () { opt.onClick(r); });
        tbody.appendChild(row);
      }
      thead.querySelectorAll('th').forEach(function (th, i) { const old = th.querySelector('.arr'); if (old) old.remove(); if (cols[i].k === sortK) th.appendChild(h('span', { class: 'arr', text: dir < 0 ? '↓' : '↑' })); });
    }
    render();
    const wrap = h('div', { class: opt.scroll === false ? '' : 'tbl-scroll', style: opt.maxH ? { maxHeight: opt.maxH + 'px' } : null }, tbl);
    wrap.rerender = render;
    return wrap;
  };
  // 虚拟滚动表格：大量原始记录
  UI.vtable = function (cols, count, getRow, opt) {
    opt = opt || {};
    const rowH = 34, height = opt.height || 460;
    const wrap = h('div', { class: 'vlist', style: { height: height + 'px', border: '1px solid var(--line)', borderRadius: '12px' } });
    const tbl = h('table', { class: 'tbl', style: { tableLayout: 'fixed' } });
    const thead = h('thead'), tr = h('tr');
    cols.forEach(function (c) { tr.appendChild(h('th', { class: c.n ? 'n' : '', style: c.w ? { width: c.w } : null, text: c.label })); });
    thead.appendChild(tr); tbl.appendChild(thead);
    const tbody = h('tbody'); tbl.appendChild(tbody);
    const spacer = h('div', { style: { height: (count * rowH + 40) + 'px', position: 'relative' } });
    tbl.style.position = 'absolute'; tbl.style.top = '0'; tbl.style.left = '0'; tbl.style.right = '0';
    spacer.appendChild(tbl); wrap.appendChild(spacer);
    let last = -1;
    function render() {
      const top = wrap.scrollTop, first = Math.max(0, Math.floor(top / rowH) - 5), n = Math.ceil(height / rowH) + 10;
      if (first === last) return; last = first;
      tbl.style.transform = 'translateY(' + (first * rowH) + 'px)';
      thead.style.visibility = first === 0 ? 'visible' : 'hidden';
      tbody.textContent = '';
      for (let i = first; i < Math.min(count, first + n); i++) {
        const r = getRow(i), row = h('tr', { style: { height: rowH + 'px' } });
        cols.forEach(function (c, j) { row.appendChild(h('td', { class: c.n ? 'n' : '', text: r[j] == null ? '—' : String(r[j]), style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } })); });
        tbody.appendChild(row);
      }
    }
    wrap.addEventListener('scroll', render);
    requestAnimationFrame(render);
    const head2 = h('div', { style: { display: 'grid', gridTemplateColumns: cols.map(function (c) { return c.w || '1fr'; }).join(' '), fontSize: '12px', color: 'var(--ink-3)', padding: '0 10px 6px' } });
    cols.forEach(function (c) { head2.appendChild(h('div', { style: { textAlign: c.n ? 'right' : 'left', padding: '0 10px' }, text: c.label })); });
    return h('div', null, head2, wrap);
  };

  // ---------- 抽屉、弹窗、提示 ----------
  UI.drawer = function (title, build) {
    UI.closeDrawer();
    const mask = h('div', { class: 'drawer-mask' });
    const close = h('button', { class: 'btn ghost', type: 'button', 'aria-label': '关闭' }, UI.icon('close'));
    const body = h('div', { class: 'drawer-b' });
    const titleEl = h('h3', null, title);
    const dr = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'drawer-h' }, titleEl, close), body);
    document.body.appendChild(mask); document.body.appendChild(dr);
    const done = function () { UI.closeDrawer(); };
    mask.addEventListener('click', done); close.addEventListener('click', done);
    UI._drawer = { mask: mask, dr: dr, body: body };
    requestAnimationFrame(function () { mask.classList.add('on'); dr.classList.add('on'); });
    setTimeout(function () { build(body, titleEl); }, 60);
    return body;
  };
  UI.closeDrawer = function () {
    const d = UI._drawer; if (!d) return; UI._drawer = null;
    CH.destroyAll(d.body);
    d.mask.classList.remove('on'); d.dr.classList.remove('on');
    setTimeout(function () { d.mask.remove(); d.dr.remove(); }, 450);
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { UI.closeDrawer(); UI.closeModal(); } });
  UI.modal = function (title, build) {
    UI.closeModal();
    const mask = h('div', { class: 'drawer-mask' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('h3', { text: title }));
    build(box);
    document.body.appendChild(mask); document.body.appendChild(box);
    mask.addEventListener('click', UI.closeModal);
    UI._modal = { mask: mask, box: box };
    requestAnimationFrame(function () { mask.classList.add('on'); box.classList.add('on'); });
    return box;
  };
  UI.closeModal = function () { const m = UI._modal; if (!m) return; UI._modal = null; m.mask.classList.remove('on'); m.box.classList.remove('on'); setTimeout(function () { m.mask.remove(); m.box.remove(); }, 350); };
  UI.toast = function (msg) {
    const t = h('div', { class: 'toast', text: msg }); document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 400); }, 2600);
  };

  // ---------- 数值显示 ----------
  UI.fmtType = function (t) { // 返回该类型数值的格式化函数
    const dec = t.def.dec === undefined ? 1 : t.def.dec;
    return function (v) { if (!(v === v)) return '—'; if (Math.abs(v) >= 10000 && dec === 0) return N.int(v); return N.fix(v, dec); };
  };
  UI.unitOf = function (t) { return t.disp.unit || ''; };
  UI.download = function (name, text, mime) {
    const blob = new Blob(['﻿' + text], { type: mime || 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  UI.csvCell = function (v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  UI.chartBox = function (cls) { return h('div', { class: 'chart' + (cls ? ' ' + cls : '') }); };
})();
