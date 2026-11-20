/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 本地存储：解析结果存进 IndexedDB（只在这台电脑上），下次打开秒开 */
(function () {
  'use strict';
  const HL = window.HL;
  const DB = 'healthlens', STORE = 'kv', VER = 1;
  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('这个浏览器不支持本地数据库')); return; }
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        const t = db.transaction(STORE, mode); const st = t.objectStore(STORE);
        let out; const req = fn(st);
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { db.close(); res(out); };
        t.onerror = function () { db.close(); rej(t.error); };
        t.onabort = function () { db.close(); rej(t.error || new Error('写入被中止（可能是磁盘空间不足）')); };
      });
    });
  }
  HL.store = {
    save: function (ds) { return tx('readwrite', function (st) { st.put(ds, 'dataset'); st.put({ savedAt: Date.now(), exportDate: ds.exportDate, records: ds.counts.records, fileName: ds.fileName }, 'meta'); }); },
    load: function () { return tx('readonly', function (st) { return st.get('dataset'); }); },
    meta: function () { return tx('readonly', function (st) { return st.get('meta'); }); },
    clear: function () { return tx('readwrite', function (st) { st.clear(); }); },
    settings: {
      get: function () { try { return JSON.parse(localStorage.getItem('hl.settings') || '{}'); } catch (e) { return {}; } },
      set: function (o) { try { localStorage.setItem('hl.settings', JSON.stringify(o)); } catch (e) { /* 无痕窗口等情况下忽略 */ } }
    },
    ui: {
      get: function (k, d) { try { const v = localStorage.getItem('hl.ui.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { localStorage.setItem('hl.ui.' + k, JSON.stringify(v)); } catch (e) { } }
    }
  };
})();
