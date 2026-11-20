/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 解析引擎
 * 读取 iPhone「健康」导出的 zip（或解压后的 导出.xml / export.xml），流式解压 + 流式扫描，
 * 把 110 万级记录压成按类型分列的 TypedArray，交给界面层分析。
 * 整个函数会被转成字符串放进 Blob Worker 里运行（file:// 下不能直接 new Worker('x.js')），
 * 也可以在 Node 里 require 后直接调用（用于测试）。
 * 时间约定：所有时间都存成“本地墙钟时间当作 UTC”的毫秒数（pseudo-UTC），
 * 这样取日期/小时只要用 getUTC*，不受运行电脑时区影响。
 */
function __healthParserModule() {
  /*! 健康透镜 HealthLens 解析引擎 © 2026 dofen */
  'use strict';

  // ---------- 可增长的 TypedArray 列 ----------
  function Col(T, cap) { this.T = T; this.a = new T(cap || 256); this.n = 0; }
  Col.prototype.push = function (v) {
    if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  };
  Col.prototype.done = function () { return this.a.slice(0, this.n); };

  // ---------- 小工具 ----------
  function unesc(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      if (e[1] === 'x' || e[1] === 'X') return String.fromCodePoint(parseInt(e.slice(2), 16));
      return String.fromCodePoint(parseInt(e.slice(1), 10));
    });
  }
  // 在一行里取属性值；name 形如 ' type="'（带前导空格，避免误匹配 workoutActivityType）
  function at(line, name) {
    const k = line.indexOf(name);
    if (k < 0) return null;
    const vs = k + name.length;
    const ve = line.indexOf('"', vs);
    return ve < 0 ? null : line.substring(vs, ve);
  }
  const dayCache = new Map();
  // 'YYYY-MM-DD HH:MM:SS +0800' -> 本地墙钟毫秒（当作 UTC）
  function pd(str) {
    if (!str || str.length < 19) return NaN;
    const dk = str.substring(0, 10);
    let base = dayCache.get(dk);
    if (base === undefined) {
      base = Date.UTC(+str.substring(0, 4), +str.substring(5, 7) - 1, +str.substring(8, 10));
      dayCache.set(dk, base);
    }
    const c = str.charCodeAt.bind(str);
    return base + ((c(11) - 48) * 10 + (c(12) - 48)) * 3600000 + ((c(14) - 48) * 10 + (c(15) - 48)) * 60000 + ((c(17) - 48) * 10 + (c(18) - 48)) * 1000;
  }
  function tzOffsetMin(str) { // '... +0800' -> 480
    const m = /([+-])(\d\d):?(\d\d)\s*$/.exec(str || '');
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  }
  function num(s) { if (s == null) return NaN; const v = parseFloat(s); return v; }

  // ---------- ZIP 读取（含 ZIP64，文件名按 UTF-8，失败再按 GBK） ----------
  async function readBytes(file, start, len) {
    return new Uint8Array(await file.slice(start, start + len).arrayBuffer());
  }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function u64(b, o) { return u32(b, o) + u32(b, o + 4) * 4294967296; }
  const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
  let gbk = null; try { gbk = new TextDecoder('gbk'); } catch (e) { gbk = null; }
  function decodeName(bytes, flags) {
    try { return utf8Fatal.decode(bytes); } catch (e) {
      if (gbk) return gbk.decode(bytes);
      return new TextDecoder('latin1').decode(bytes);
    }
  }
  async function zipEntries(file) {
    const size = file.size;
    const tailLen = Math.min(size, 65536 + 22);
    const tail = await readBytes(file, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip 文件（找不到目录结构）');
    let count = u16(tail, eocd + 10), cdSize = u32(tail, eocd + 12), cdOff = u32(tail, eocd + 16);
    // ZIP64
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
      const loc = eocd - 20;
      if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
        const z64off = u64(tail, loc + 8);
        const z = await readBytes(file, z64off, 56);
        if (u32(z, 0) === 0x06064b50) { count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48); }
      }
    }
    const cd = await readBytes(file, cdOff, cdSize);
    const out = [];
    let p = 0;
    for (let k = 0; k < count && p + 46 <= cd.length; k++) {
      if (u32(cd, p) !== 0x02014b50) break;
      const flags = u16(cd, p + 8), method = u16(cd, p + 10);
      let comp = u32(cd, p + 20), unc = u32(cd, p + 24);
      const nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
      let lho = u32(cd, p + 42);
      const name = decodeName(cd.subarray(p + 46, p + 46 + nl), flags);
      // zip64 extra
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = u16(cd, x), sz = u16(cd, x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (unc === 0xffffffff) { unc = u64(cd, q); q += 8; }
          if (comp === 0xffffffff) { comp = u64(cd, q); q += 8; }
          if (lho === 0xffffffff) { lho = u64(cd, q); q += 8; }
        }
        x += 4 + sz;
      }
      out.push({ name: name, method: method, comp: comp, size: unc, lho: lho, dir: name.endsWith('/') });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function entryDataStart(file, e) {
    const h = await readBytes(file, e.lho, 30);
    if (u32(h, 0) !== 0x04034b50) throw new Error('zip 内文件头损坏：' + e.name);
    return e.lho + 30 + u16(h, 26) + u16(h, 28);
  }
  // 返回一个字节流（已解压）。onBytes(n) 汇报读取的压缩字节数
  async function entryStream(file, e, onBytes) {
    const start = await entryDataStart(file, e);
    let raw = file.slice(start, start + e.comp).stream();
    if (onBytes) {
      raw = raw.pipeThrough(new TransformStream({ transform(chunk, ctl) { onBytes(chunk.byteLength); ctl.enqueue(chunk); } }));
    }
    if (e.method === 0) return raw;
    if (e.method === 8) return raw.pipeThrough(new DecompressionStream('deflate-raw'));
    throw new Error('不支持的压缩方式 ' + e.method + '：' + e.name);
  }
  async function entryText(file, e) {
    const s = await entryStream(file, e, null);
    return await new Response(s).text();
  }

  // ---------- 主解析器 ----------
  const SLEEP_CODES = {
    HKCategoryValueSleepAnalysisInBed: 0, HKCategoryValueSleepAnalysisAsleepUnspecified: 1, HKCategoryValueSleepAnalysisAsleep: 1,
    HKCategoryValueSleepAnalysisAwake: 2, HKCategoryValueSleepAnalysisAsleepCore: 3, HKCategoryValueSleepAnalysisAsleepDeep: 4, HKCategoryValueSleepAnalysisAsleepREM: 5
  };
  // 某些类型要额外保存一个元数据数值到 m 列
  const META_TO_M = {
    HKQuantityTypeIdentifierOxygenSaturation: 'HKMetadataKeyBarometricPressure',
    HKQuantityTypeIdentifierTimeInDaylight: 'HKMetadataKeyMaximumLightIntensity',
    HKCategoryTypeIdentifierAudioExposureEvent: 'HKMetadataKeyAudioExposureLevel',
    HKCategoryTypeIdentifierHeadphoneAudioExposureEvent: 'HKMetadataKeyAudioExposureLevel',
    HKCategoryTypeIdentifierEnvironmentalAudioExposureEvent: 'HKMetadataKeyAudioExposureLevel',
    HKQuantityTypeIdentifierWalkingAsymmetryPercentage: 'HKMetadataKeyDevicePlacementSide',
    HKQuantityTypeIdentifierPhysicalEffort: 'HKActivityType',
    HKQuantityTypeIdentifierVO2Max: 'HKVO2MaxTestType',
    HKCategoryTypeIdentifierHighHeartRateEvent: 'HKHeartRateEventThreshold',
    HKCategoryTypeIdentifierLowHeartRateEvent: 'HKHeartRateEventThreshold',
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'HKAlgorithmVersion',
    HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: 'HKMetadataKeyHeartRateRecoveryMaxObservedRecoveryHeartRate',
    HKQuantityTypeIdentifierAppleWalkingSteadiness: 'HKAlgorithmVersion'
  };
  const DEVICE_KEYS = ['name', 'manufacturer', 'model', 'hardware', 'firmware', 'software', 'localIdentifier', 'bluetoothIdentifier', 'UDIDeviceIdentifier', 'FDAUDI', 'creation date'];
  const DEVICE_SPLIT = new RegExp(', (?=(?:' + DEVICE_KEYS.join('|') + '):)');

  function Parser(onProgress) {
    this.onProgress = onProgress;
    this.types = []; this.typeIdx = new Map();
    this.sources = []; this.srcIdx = new Map();
    this.devices = []; this.devKey = new Map(); this.devRaw = new Map();
    this.srcVer = new Map();
    this.workouts = []; this.activity = []; this.audiograms = []; this.clinical = []; this.vision = []; this.correlations = [];
    this.me = {}; this.exportDate = null; this.locale = null;
    this.beatT = new Col(Float32Array, 1 << 16); this.beatB = new Col(Uint8Array, 1 << 16);
    this.nRecords = 0; this.nMeta = 0; this.nLines = 0;
    // 解析上下文
    this.ctx = []; // 'Record' | 'Workout' | 'Correlation' | 'Audiogram' | 'WorkoutRoute' | 'WorkoutEvent' | 'WorkoutActivity' | 'WorkoutZoneGroup' | 'HRV' | 'VisionPrescription'
    this.lastT = null; this.lastI = -1; this.curWorkout = null; this.curAudio = null; this.curCorr = null; this.curZone = null; this.curVision = null;
    this.curHrvBase = 0; this.curHrvStartSec = 0; this.curHrvDayShift = 0;
  }
  Parser.prototype.typeStore = function (id) {
    let i = this.typeIdx.get(id);
    if (i !== undefined) return this.types[i];
    const kind = id.indexOf('HKCategoryTypeIdentifier') === 0 ? 'c' : 'q';
    const t = {
      id: id, kind: kind, n: 0,
      s: new Col(Float64Array), d: new Col(Float32Array), v: new Col(Float32Array),
      src: new Col(Uint16Array), dev: new Col(Uint16Array), fl: new Col(Uint8Array), m: new Col(Float32Array),
      units: new Map(), catCodes: new Map(), catNames: [], metaKeys: new Map(),
      metaM: META_TO_M[id] || null, hrv: id === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' ? { b0: new Col(Int32Array), bn: new Col(Uint16Array) } : null
    };
    if (id === 'HKCategoryTypeIdentifierSleepAnalysis') {
      t.catNames = ['InBed', 'AsleepUnspecified', 'Awake', 'AsleepCore', 'AsleepDeep', 'AsleepREM'];
    }
    this.typeIdx.set(id, this.types.length);
    this.types.push(t);
    return t;
  };
  Parser.prototype.source = function (raw, ms, typeId) {
    let i = this.srcIdx.get(raw);
    let s;
    if (i === undefined) {
      i = this.sources.length;
      s = { name: unesc(raw), n: 0, first: Infinity, last: -Infinity, types: new Map(), devModels: new Map() };
      this.sources.push(s); this.srcIdx.set(raw, i);
    } else s = this.sources[i];
    s.n++;
    if (ms < s.first) s.first = ms; if (ms > s.last) s.last = ms;
    s.types.set(typeId, (s.types.get(typeId) || 0) + 1);
    return i;
  };
  Parser.prototype.srcVersion = function (si, ver, ms) {
    if (ver == null) return;
    const k = si + '\u0001' + ver;
    let r = this.srcVer.get(k);
    if (!r) { r = { si: si, ver: ver, n: 0, first: Infinity, last: -Infinity }; this.srcVer.set(k, r); }
    r.n++; if (ms < r.first) r.first = ms; if (ms > r.last) r.last = ms;
  };
  Parser.prototype.device = function (raw, ms, typeId, si) {
    if (raw == null) return 0;
    let info = this.devRaw.get(raw);
    if (!info) {
      const txt = unesc(raw);
      let body = txt.replace(/^<<HKDevice:[^>]*>,?\s*/, '').replace(/>\s*$/, '');
      const f = {};
      body.split(DEVICE_SPLIT).forEach(function (part) {
        const c = part.indexOf(':');
        if (c > 0) f[part.substring(0, c).trim()] = part.substring(c + 1).trim();
      });
      const key = [f.name || '', f.manufacturer || '', f.model || '', f.hardware || '', f.localIdentifier || f.bluetoothIdentifier || ''].join('|');
      let di = this.devKey.get(key);
      if (di === undefined) {
        di = this.devices.length + 1; // 0 = 无设备
        this.devices.push({ name: f.name || '', manufacturer: f.manufacturer || '', model: f.model || '', hardware: f.hardware || '',
          localIdentifier: f.localIdentifier || '', bluetoothIdentifier: f.bluetoothIdentifier || '', udi: f.UDIDeviceIdentifier || '',
          firmware: new Map(), software: new Map(), n: 0, first: Infinity, last: -Infinity, types: new Map(), sources: new Map(), created: f['creation date'] || '' });
        this.devKey.set(key, di);
      }
      info = { di: di, sw: f.software || '', fw: f.firmware || '' };
      this.devRaw.set(raw, info);
    }
    const d = this.devices[info.di - 1];
    d.n++; if (ms < d.first) d.first = ms; if (ms > d.last) d.last = ms;
    d.types.set(typeId, (d.types.get(typeId) || 0) + 1);
    d.sources.set(si, (d.sources.get(si) || 0) + 1);
    if (info.sw) { let r = d.software.get(info.sw); if (!r) { r = { n: 0, first: Infinity, last: -Infinity }; d.software.set(info.sw, r); } r.n++; if (ms < r.first) r.first = ms; if (ms > r.last) r.last = ms; }
    if (info.fw) { let r = d.firmware.get(info.fw); if (!r) { r = { n: 0, first: Infinity, last: -Infinity }; d.firmware.set(info.fw, r); } r.n++; if (ms < r.first) r.first = ms; if (ms > r.last) r.last = ms; }
    const sm = this.sources[si].devModels; const mk = d.model || d.name; sm.set(mk, (sm.get(mk) || 0) + 1);
    return info.di;
  };

  Parser.prototype.lineRecord = function (line) {
    const inParent = this.ctx.length > 0 && (this.ctx[this.ctx.length - 1] === 'Workout' || this.ctx[this.ctx.length - 1] === 'Correlation' || this.ctx[this.ctx.length - 1] === 'WorkoutActivity');
    const type = at(line, ' type="');
    const selfClose = line.charCodeAt(line.length - 2) === 47 /* / */ || line.endsWith('/>');
    if (inParent) {
      // 子记录在顶层还会再出现一次：这里只记关联，不重复入库
      const val = num(at(line, ' value="'));
      if (this.curWorkout) { this.curWorkout.childRecords.push({ type: type, value: val, unit: at(line, ' unit="') }); }
      if (this.curCorr) { this.curCorr.records.push({ type: type, value: val, unit: at(line, ' unit="') }); }
      if (!selfClose) this.ctx.push('ChildRecord');
      return;
    }
    const t = this.typeStore(type);
    const s = pd(at(line, ' startDate="'));
    const e = pd(at(line, ' endDate="'));
    const si = this.source(at(line, ' sourceName="') || '?', s, type);
    this.srcVersion(si, at(line, ' sourceVersion="'), s);
    const di = this.device(at(line, ' device="'), s, type, si);
    const unit = at(line, ' unit="');
    if (unit != null) t.units.set(unit, (t.units.get(unit) || 0) + 1);
    const vs = at(line, ' value="');
    let v = NaN;
    if (vs != null) {
      if (t.kind === 'c') {
        let code = t.catCodes.get(vs);
        if (code === undefined) {
          if (type === 'HKCategoryTypeIdentifierSleepAnalysis' && SLEEP_CODES[vs] !== undefined) code = SLEEP_CODES[vs];
          else {
            const vn = parseFloat(vs);
            if (!isNaN(vn) && String(vn) === vs) code = vn; // 有些类别本身就是数字
            else { code = 100 + t.catNames.length; t.catNames.push(vs); }
          }
          t.catCodes.set(vs, code);
        }
        v = code;
      } else v = parseFloat(vs);
    }
    t.s.push(s); t.d.push((e - s) / 1000); t.v.push(v); t.src.push(si); t.dev.push(di); t.fl.push(0); t.m.push(NaN);
    if (t.hrv) { t.hrv.b0.push(this.beatT.n); t.hrv.bn.push(0); }
    t.n++; this.nRecords++;
    this.lastT = t; this.lastI = t.n - 1;
    if (!selfClose) {
      this.ctx.push('Record');
      if (t.hrv) { this.curHrvBase = s; }
    }
  };
  Parser.prototype.lineMeta = function (line) {
    this.nMeta++;
    const key = at(line, ' key="'); const val = at(line, ' value="');
    const top = this.ctx[this.ctx.length - 1];
    if (top === 'Record' && this.lastT) {
      const t = this.lastT, i = this.lastI;
      let mk = t.metaKeys.get(key);
      if (!mk) { mk = { n: 0, ex: [] }; t.metaKeys.set(key, mk); }
      mk.n++;
      if (mk.ex.length < 6 && val != null) { const uv = unesc(val); if (mk.ex.indexOf(uv) < 0) mk.ex.push(uv); }
      if (key === 'HKWasUserEntered') { if (val === '1') t.fl.a[i] |= 1; }
      else if (key === 'HKMetadataKeyHeartRateMotionContext') { const c = (+val) & 3; t.fl.a[i] = (t.fl.a[i] & ~12) | (c << 2); }
      else if (key === 'HKMetadataKeyQuantityClampedToLowerBound') { if (val === '1') t.fl.a[i] |= 16; }
      else if (key === 'HKMetadataKeyQuantityClampedToUpperBound') { if (val === '1') t.fl.a[i] |= 32; }
      if (t.metaM === key) { const fv = parseFloat(val); if (!isNaN(fv)) t.m.a[i] = fv; }
      return;
    }
    if ((top === 'Workout' || top === 'WorkoutActivity') && this.curWorkout) {
      const tgt = top === 'Workout' ? this.curWorkout.meta : (this.curWorkout.activities.length ? this.curWorkout.activities[this.curWorkout.activities.length - 1].meta : this.curWorkout.meta);
      tgt[key] = val == null ? '' : unesc(val);
      return;
    }
    if (top === 'WorkoutRoute' && this.curWorkout) { const r = this.curWorkout.routes[this.curWorkout.routes.length - 1]; if (r) r.meta[key] = val; return; }
    if (top === 'WorkoutEvent' && this.curWorkout) { const ev = this.curWorkout.events[this.curWorkout.events.length - 1]; if (ev) ev.meta[key] = val; return; }
    if (top === 'Audiogram' && this.curAudio) { this.curAudio.meta[key] = val; return; }
    if (top === 'Correlation' && this.curCorr) { this.curCorr.meta[key] = val; return; }
    if (top === 'VisionPrescription' && this.curVision) { this.curVision.meta[key] = val; return; }
  };
  Parser.prototype.lineBeat = function (line) {
    const bpm = +at(line, ' bpm="');
    const tm = at(line, ' time="'); // 'HH:MM:SS.ss' 或 'h:mm:ss.ss PM'
    if (!tm || !this.lastT || !this.lastT.hrv) return;
    let h, m, sec;
    const mm = /^(\d{1,2}):(\d{2}):(\d{2}(?:[.,]\d+)?)\s*(AM|PM|上午|下午)?/i.exec(tm);
    if (!mm) return;
    h = +mm[1]; m = +mm[2]; sec = parseFloat(mm[3].replace(',', '.'));
    const ap = mm[4];
    if (ap) { const pm = /PM|下午/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    const base = this.curHrvBase; // 记录开始的本地毫秒
    const dayStart = Math.floor(base / 86400000) * 86400000;
    let ms = dayStart + (h * 3600 + m * 60 + sec) * 1000;
    if (ms < base - 6 * 3600000) ms += 86400000; // 跨零点
    const t = this.lastT;
    this.beatT.push((ms - base) / 1000);
    this.beatB.push(bpm > 255 ? 255 : bpm);
    t.hrv.bn.a[this.lastI]++;
  };
  Parser.prototype.lineWorkout = function (line) {
    const s = pd(at(line, ' startDate="')), e = pd(at(line, ' endDate="'));
    const srcRaw = at(line, ' sourceName="') || '?';
    const type = at(line, ' workoutActivityType="');
    const si = this.source(srcRaw, s, 'Workout:' + type);
    this.srcVersion(si, at(line, ' sourceVersion="'), s);
    const di = this.device(at(line, ' device="'), s, 'Workout:' + type, si);
    const w = {
      type: type, s: s, e: e, duration: num(at(line, ' duration="')), durationUnit: at(line, ' durationUnit="'),
      totalDistance: num(at(line, ' totalDistance="')), totalDistanceUnit: at(line, ' totalDistanceUnit="'),
      totalEnergy: num(at(line, ' totalEnergyBurned="')), totalEnergyUnit: at(line, ' totalEnergyBurnedUnit="'),
      src: si, dev: di, created: pd(at(line, ' creationDate="')), sourceVersion: at(line, ' sourceVersion="'),
      meta: {}, stats: {}, events: [], routes: [], zones: [], activities: [], childRecords: []
    };
    this.workouts.push(w);
    this.curWorkout = w;
    if (!line.endsWith('/>')) this.ctx.push('Workout'); else this.curWorkout = null;
  };
  Parser.prototype.feedLine = function (line) {
    // line 已去掉首尾空白
    const c1 = line.charCodeAt(1);
    if (line.charCodeAt(0) !== 60 /* < */) return;
    if (c1 === 82 /* R */) {
      if (line.startsWith('<Record ')) return this.lineRecord(line);
      if (line.startsWith('<RightEye') && this.curVision) { this.curVision.right = attrsAll(line); return; }
      return;
    }
    if (c1 === 73 /* I */) { if (line.startsWith('<InstantaneousBeatsPerMinute')) this.lineBeat(line); return; }
    if (c1 === 77 /* M */) {
      if (line.startsWith('<MetadataEntry')) return this.lineMeta(line);
      if (line.startsWith('<Me ')) { this.me = attrsAll(line); }
      return;
    }
    if (c1 === 47 /* / */) {
      const top = this.ctx[this.ctx.length - 1];
      if (line.startsWith('</Record')) { if (top === 'Record' || top === 'ChildRecord') this.ctx.pop(); return; }
      if (line.startsWith('</HeartRateVariabilityMetadataList')) { if (top === 'HRV') this.ctx.pop(); return; }
      if (line.startsWith('</Workout>')) { while (this.ctx.length && this.ctx.pop() !== 'Workout') { } this.curWorkout = null; return; }
      if (line.startsWith('</WorkoutActivity')) { if (top === 'WorkoutActivity') this.ctx.pop(); return; }
      if (line.startsWith('</WorkoutEvent')) { if (top === 'WorkoutEvent') this.ctx.pop(); return; }
      if (line.startsWith('</WorkoutRoute')) { if (top === 'WorkoutRoute') this.ctx.pop(); return; }
      if (line.startsWith('</WorkoutZoneGroup')) { if (top === 'WorkoutZoneGroup') this.ctx.pop(); this.curZone = null; return; }
      if (line.startsWith('</Correlation')) { if (top === 'Correlation') this.ctx.pop(); this.curCorr = null; return; }
      if (line.startsWith('</Audiogram')) { if (top === 'Audiogram') this.ctx.pop(); this.curAudio = null; return; }
      if (line.startsWith('</VisionPrescription')) { if (top === 'VisionPrescription') this.ctx.pop(); this.curVision = null; return; }
      return;
    }
    if (c1 === 72 /* H */) {
      if (line.startsWith('<HeartRateVariabilityMetadataList')) { if (!line.endsWith('/>')) this.ctx.push('HRV'); return; }
      if (line.startsWith('<HealthData')) { this.locale = at(line, ' locale="'); }
      return;
    }
    if (c1 === 87 /* W */) {
      if (line.startsWith('<Workout ')) return this.lineWorkout(line);
      const w = this.curWorkout;
      if (line.startsWith('<WorkoutStatistics')) {
        if (!w) return;
        const st = { type: at(line, ' type="'), s: pd(at(line, ' startDate="')), e: pd(at(line, ' endDate="')), sum: num(at(line, ' sum="')), avg: num(at(line, ' average="')), min: num(at(line, ' minimum="')), max: num(at(line, ' maximum="')), unit: at(line, ' unit="') };
        const tgt = (this.ctx[this.ctx.length - 1] === 'WorkoutActivity' && w.activities.length) ? w.activities[w.activities.length - 1].stats : w.stats;
        tgt[st.type] = st;
        return;
      }
      if (line.startsWith('<WorkoutEvent')) {
        if (w) w.events.push({ type: at(line, ' type="'), t: pd(at(line, ' date="')), duration: num(at(line, ' duration="')), durationUnit: at(line, ' durationUnit="'), meta: {} });
        if (!line.endsWith('/>')) this.ctx.push('WorkoutEvent');
        return;
      }
      if (line.startsWith('<WorkoutRoute')) {
        if (w) w.routes.push({ s: pd(at(line, ' startDate="')), e: pd(at(line, ' endDate="')), path: null, meta: {} });
        if (!line.endsWith('/>')) this.ctx.push('WorkoutRoute');
        return;
      }
      if (line.startsWith('<WorkoutZoneGroup')) {
        if (w) { this.curZone = { type: at(line, ' type="'), source: at(line, ' source="'), unit: at(line, ' unit="'), zones: [] }; w.zones.push(this.curZone); }
        if (!line.endsWith('/>')) this.ctx.push('WorkoutZoneGroup');
        return;
      }
      if (line.startsWith('<WorkoutZone ')) {
        if (this.curZone) this.curZone.zones.push({ min: num(at(line, ' minimum="')), max: num(at(line, ' maximum="')), duration: num(at(line, ' duration="')), unit: at(line, ' durationUnit="') });
        return;
      }
      if (line.startsWith('<WorkoutActivity')) {
        if (w) w.activities.push({ uuid: at(line, ' uuid="'), s: pd(at(line, ' startDate="')), e: pd(at(line, ' endDate="')), duration: num(at(line, ' duration="')), durationUnit: at(line, ' durationUnit="'), meta: {}, stats: {} });
        if (!line.endsWith('/>')) this.ctx.push('WorkoutActivity');
        return;
      }
      return;
    }
    if (c1 === 70 /* F */) {
      if (line.startsWith('<FileReference') && this.curWorkout) {
        const r = this.curWorkout.routes[this.curWorkout.routes.length - 1];
        if (r) r.path = unesc(at(line, ' path="') || '');
      }
      return;
    }
    if (c1 === 65 /* A */) {
      if (line.startsWith('<ActivitySummary')) {
        this.activity.push({
          date: at(line, ' dateComponents="'), move: num(at(line, ' activeEnergyBurned="')), moveGoal: num(at(line, ' activeEnergyBurnedGoal="')), unit: at(line, ' activeEnergyBurnedUnit="'),
          moveTime: num(at(line, ' appleMoveTime="')), moveTimeGoal: num(at(line, ' appleMoveTimeGoal="')),
          exercise: num(at(line, ' appleExerciseTime="')), exerciseGoal: num(at(line, ' appleExerciseTimeGoal="')),
          stand: num(at(line, ' appleStandHours="')), standGoal: num(at(line, ' appleStandHoursGoal="'))
        });
        return;
      }
      if (line.startsWith('<Audiogram')) {
        const s = pd(at(line, ' startDate="'));
        const si = this.source(at(line, ' sourceName="') || '?', s, 'Audiogram');
        const di = this.device(at(line, ' device="'), s, 'Audiogram', si);
        this.curAudio = { type: at(line, ' type="'), s: s, e: pd(at(line, ' endDate="')), src: si, dev: di, points: [], meta: {} };
        this.audiograms.push(this.curAudio);
        if (!line.endsWith('/>')) this.ctx.push('Audiogram');
        return;
      }
      return;
    }
    if (c1 === 83 /* S */) {
      if (line.startsWith('<SensitivityPoint') && this.curAudio) {
        this.curAudio.points.push({
          f: num(at(line, ' frequencyValue="')), l: num(at(line, ' leftEarValue="')), r: num(at(line, ' rightEarValue="')),
          lm: at(line, ' leftEarMasked="'), rm: at(line, ' rightEarMasked="'), unit: at(line, ' leftEarUnit="') || at(line, ' rightEarUnit="')
        });
      }
      return;
    }
    if (c1 === 67 /* C */) {
      if (line.startsWith('<Correlation')) {
        const s = pd(at(line, ' startDate="'));
        const si = this.source(at(line, ' sourceName="') || '?', s, 'Correlation');
        this.curCorr = { type: at(line, ' type="'), s: s, e: pd(at(line, ' endDate="')), src: si, records: [], meta: {} };
        this.correlations.push(this.curCorr);
        if (!line.endsWith('/>')) this.ctx.push('Correlation');
        return;
      }
      if (line.startsWith('<ClinicalRecord')) {
        this.clinical.push({ type: at(line, ' type="'), identifier: at(line, ' identifier="'), source: unesc(at(line, ' sourceName="') || ''), fhirVersion: at(line, ' fhirVersion="'), received: pd(at(line, ' receivedDate="')), path: at(line, ' resourceFilePath="') });
      }
      return;
    }
    if (c1 === 69 /* E */) { if (line.startsWith('<ExportDate')) this.exportDate = at(line, ' value="'); return; }
    if (c1 === 86 /* V */) {
      if (line.startsWith('<VisionPrescription')) {
        this.curVision = { type: at(line, ' type="'), issued: at(line, ' dateIssued="'), expires: at(line, ' expirationDate="'), brand: unesc(at(line, ' brand="') || ''), meta: {} };
        this.vision.push(this.curVision);
        if (!line.endsWith('/>')) this.ctx.push('VisionPrescription');
      }
      return;
    }
    if (c1 === 76 /* L */) { if (line.startsWith('<LeftEye') && this.curVision) this.curVision.left = attrsAll(line); return; }
  };
  function attrsAll(line) {
    const o = {}; const re = /(\w+)="([^"]*)"/g; let m;
    while ((m = re.exec(line))) o[m[1]] = unesc(m[2]);
    return o;
  }

  // 流式读取文本：把字节流切成行
  async function scanXml(stream, parser, onChunk) {
    const reader = stream.pipeThrough(new TextDecoderStream('utf-8')).getReader();
    let carry = '';
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      let text = carry.length ? carry + r.value : r.value;
      let pos = 0;
      const n = text.length;
      for (;;) {
        const nl = text.indexOf('\n', pos);
        if (nl < 0) break;
        let a = pos, b = nl;
        while (a < b && text.charCodeAt(a) <= 32) a++;
        while (b > a && text.charCodeAt(b - 1) <= 32) b--;
        if (b > a) parser.feedLine(text.substring(a, b));
        parser.nLines++;
        pos = nl + 1;
      }
      carry = pos < n ? text.substring(pos) : '';
      if (onChunk) onChunk();
    }
    if (carry.trim()) parser.feedLine(carry.trim());
  }

  // ---------- 心电图 CSV ----------
  const ECG_KEYS = {
    '姓名': 'name', 'Name': 'name', '出生日期': 'dob', 'Date of Birth': 'dob', '记录日期': 'date', 'Recorded Date': 'date',
    '分类': 'classification', 'Classification': 'classification', '症状': 'symptoms', 'Symptoms': 'symptoms',
    '软件版本': 'software', 'Software Version': 'software', '设备': 'device', 'Device': 'device',
    '采样速率': 'rate', 'Sample Rate': 'rate', '导联': 'lead', 'Lead': 'lead', '单位': 'unit', 'Unit': 'unit'
  };
  function parseEcg(text, fileName) {
    const lines = text.split(/\r?\n/);
    const info = { file: fileName };
    const vals = [];
    let headerDone = false;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i].trim();
      if (!L) continue;
      if (!headerDone) {
        const c = L.indexOf(',');
        const k = c > 0 ? L.substring(0, c).replace(/^"|"$/g, '').trim() : L;
        if (ECG_KEYS[k] !== undefined) { info[ECG_KEYS[k]] = c > 0 ? L.substring(c + 1).replace(/^"|"$/g, '').trim() : ''; continue; }
        if (/^-?[\d.,]+$/.test(L.replace(/^"|"$/g, ''))) headerDone = true; else { info['x_' + k] = c > 0 ? L.substring(c + 1) : ''; continue; }
      }
      let s = L.replace(/^"|"$/g, '');
      if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
      const v = parseFloat(s);
      if (!isNaN(v)) vals.push(v);
    }
    const rate = parseFloat(String(info.rate || '512').replace(/[^\d.]/g, '')) || 512;
    const samples = Float32Array.from(vals);
    const t = pd(info.date || '');
    const r = analyzeEcg(samples, rate);
    return { file: fileName, t: t, classification: info.classification || '', symptoms: info.symptoms || '', software: info.software || '', device: info.device || '',
      rate: rate, lead: info.lead || '', unit: info.unit || 'µV', samples: samples, rPeaks: r.peaks, hr: r.hr, rr: r.rr, duration: samples.length / rate };
  }
  // 简化版 Pan–Tompkins：带通（差分+平滑）、平方、积分、自适应阈值
  function analyzeEcg(x, fs) {
    const n = x.length;
    if (n < fs * 3) return { peaks: new Int32Array(0), hr: NaN, rr: new Float32Array(0) };
    // 去基线：减去 0.6s 滑动平均
    const w = Math.round(fs * 0.6);
    const hp = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += x[i]; if (i >= w) acc -= x[i - w]; hp[i] = x[i] - acc / Math.min(i + 1, w); }
    // 差分平方
    const sq = new Float32Array(n);
    for (let i = 2; i < n - 2; i++) { const d = (2 * hp[i + 2] + hp[i + 1] - hp[i - 1] - 2 * hp[i - 2]) / 8; sq[i] = d * d; }
    // 150ms 积分
    const wi = Math.round(fs * 0.15);
    const integ = new Float32Array(n); acc = 0;
    for (let i = 0; i < n; i++) { acc += sq[i]; if (i >= wi) acc -= sq[i - wi]; integ[i] = acc / wi; }
    // 阈值：以 2s 之后的分位数估计
    const sorted = Array.from(integ.subarray(Math.round(fs * 1))).sort(function (a, b) { return a - b; });
    const thr = sorted[Math.floor(sorted.length * 0.98)] * 0.3;
    const refr = Math.round(fs * 0.25);
    const peaks = [];
    let i = Math.round(fs * 0.5);
    while (i < n) {
      if (integ[i] > thr) {
        let j = i, best = i, bv = -Infinity;
        const end = Math.min(n, i + Math.round(fs * 0.2));
        for (; j < end; j++) if (integ[j] > bv) { bv = integ[j]; best = j; }
        // 在原信号附近找 |hp| 最大的位置作为 R 峰
        let rp = best, rv = -Infinity;
        for (let k = Math.max(0, best - wi); k < Math.min(n, best + 4); k++) { const a = Math.abs(hp[k]); if (a > rv) { rv = a; rp = k; } }
        if (!peaks.length || rp - peaks[peaks.length - 1] > refr) peaks.push(rp);
        i = best + refr;
      } else i++;
    }
    const rr = [];
    for (let k = 1; k < peaks.length; k++) { const v = (peaks[k] - peaks[k - 1]) / fs * 1000; if (v > 300 && v < 2200) rr.push(v); }
    const mean = rr.length ? rr.reduce(function (a, b) { return a + b; }, 0) / rr.length : NaN;
    return { peaks: Int32Array.from(peaks), rr: Float32Array.from(rr), hr: rr.length ? 60000 / mean : NaN };
  }

  // ---------- GPX 轨迹 ----------
  function parseGpx(text, fileName, offMin) {
    const lat = [], lon = [], ele = [], tm = [], spd = [], hacc = [], crs = [];
    const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
    let m;
    while ((m = re.exec(text))) {
      const a = m[1], body = m[2];
      const la = /lat="([^"]+)"/.exec(a), lo = /lon="([^"]+)"/.exec(a);
      if (!la || !lo) continue;
      lat.push(+la[1]); lon.push(+lo[1]);
      const e = /<ele>([^<]+)<\/ele>/.exec(body); ele.push(e ? +e[1] : NaN);
      const t = /<time>([^<]+)<\/time>/.exec(body); tm.push(t ? Date.parse(t[1]) + offMin * 60000 : NaN);
      const s = /<speed>([^<]+)<\/speed>/.exec(body); spd.push(s ? +s[1] : NaN);
      const h = /<hAcc>([^<]+)<\/hAcc>/.exec(body); hacc.push(h ? +h[1] : NaN);
      const c = /<course>([^<]+)<\/course>/.exec(body); crs.push(c ? +c[1] : NaN);
    }
    const name = (/<name>([^<]*)<\/name>/.exec(text) || [])[1] || fileName;
    return { file: fileName, name: unesc(name), lat: Float64Array.from(lat), lon: Float64Array.from(lon), ele: Float32Array.from(ele), t: Float64Array.from(tm), speed: Float32Array.from(spd), hAcc: Float32Array.from(hacc), course: Float32Array.from(crs) };
  }

  // ---------- 收尾：排序、标记重复、打包 ----------
  function finalizeType(t) {
    const n = t.n;
    let s = t.s.done(), d = t.d.done(), v = t.v.done(), src = t.src.done(), dev = t.dev.done(), fl = t.fl.done(), m = t.m.done();
    let b0 = t.hrv ? t.hrv.b0.done() : null, bn = t.hrv ? t.hrv.bn.done() : null;
    // 是否已经有序
    let sortedAlready = true;
    for (let i = 1; i < n; i++) if (s[i] < s[i - 1]) { sortedAlready = false; break; }
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (a, b) { return (s[a] - s[b]) || (d[a] - d[b]) || (src[a] - src[b]) || ((v[a] - v[b]) || 0); });
    let identity = true;
    for (let i = 0; i < n; i++) if (idx[i] !== i) { identity = false; break; }
    if (!identity) {
      const perm = function (arr) { const o = new arr.constructor(n); for (let i = 0; i < n; i++) o[i] = arr[idx[i]]; return o; };
      s = perm(s); d = perm(d); v = perm(v); src = perm(src); dev = perm(dev); fl = perm(fl); m = perm(m);
      if (b0) { b0 = perm(b0); bn = perm(bn); }
    }
    // 完全重复（同来源、同起止、同数值）
    let dup = 0, ue = 0;
    const dupBySrc = {}, ueBySrc = {};
    for (let i = 0; i < n; i++) {
      if (fl[i] & 1) { ue++; ueBySrc[src[i]] = (ueBySrc[src[i]] || 0) + 1; }
      // 往回看同一开始时间的记录
      for (let j = i - 1; j >= 0 && s[j] === s[i]; j--) {
        if (d[j] === d[i] && src[j] === src[i] && (v[j] === v[i] || (v[j] !== v[j] && v[i] !== v[i]))) {
          fl[i] |= 2; dup++; dupBySrc[src[i]] = (dupBySrc[src[i]] || 0) + 1; break;
        }
      }
    }
    const units = Array.from(t.units.entries()).sort(function (a, b) { return b[1] - a[1]; });
    const metaKeys = Array.from(t.metaKeys.entries()).map(function (e) { return [e[0], e[1].n, e[1].ex]; });
    const out = { id: t.id, kind: t.kind, n: n, unit: units.length ? units[0][0] : '', units: units, s: s, d: d, v: v, src: src, dev: dev, fl: fl, m: m,
      catNames: t.catNames, catCodes: Array.from(t.catCodes.entries()), metaKeys: metaKeys, metaM: t.metaM, dup: dup, userEntered: ue, dupBySrc: dupBySrc, ueBySrc: ueBySrc, sorted: sortedAlready };
    if (b0) out.hrv = { b0: b0, bn: bn };
    return out;
  }

  async function parseExport(file, post) {
    const t0 = Date.now();
    const report = post || function () { };
    let lastReport = 0;
    const parser = new Parser();
    const files = [];
    let mainEntry = null, isZip = false, entries = [];
    const head = await readBytes(file, 0, 4);
    isZip = head[0] === 0x50 && head[1] === 0x4b;
    let totalBytes = file.size, doneBytes = 0;
    const tick = function (phase, force) {
      const now = Date.now();
      if (!force && now - lastReport < 120) return;
      lastReport = now;
      const live = [];
      for (let i = 0; i < parser.types.length; i++) live.push([parser.types[i].id, parser.types[i].n]);
      report({ type: 'progress', phase: phase, done: doneBytes, total: totalBytes, records: parser.nRecords, meta: parser.nMeta, beats: parser.beatT.n,
        workouts: parser.workouts.length, activity: parser.activity.length, sources: parser.sources.length, devices: parser.devices.length, live: live, elapsed: now - t0 });
    };
    if (isZip) {
      entries = await zipEntries(file);
      for (const e of entries) {
        if (e.dir) continue;
        const lower = e.name.toLowerCase();
        let kind = 'other';
        if (/electrocardiograms\/[^/]+\.csv$/.test(lower)) kind = 'ecg';
        else if (/workout-routes\/[^/]+\.gpx$/.test(lower)) kind = 'route';
        else if (/clinical-records\//.test(lower)) kind = 'clinical';
        else if (/\.xml$/.test(lower)) kind = /_cda\.xml$|cda/.test(lower) ? 'cda' : 'xml';
        files.push({ name: e.name, size: e.size, comp: e.comp, kind: kind });
        if (kind === 'xml' && (!mainEntry || e.size > mainEntry.size)) mainEntry = e;
      }
      if (!mainEntry) throw new Error('压缩包里没有找到「导出.xml / export.xml」。请确认选的是「健康」App 导出的压缩包。');
      totalBytes = mainEntry.comp;
      const stream = await entryStream(file, mainEntry, function (n) { doneBytes += n; });
      await scanXml(stream, parser, function () { tick('xml'); });
    } else {
      files.push({ name: file.name, size: file.size, comp: file.size, kind: 'xml' });
      let consumed = 0;
      const counted = file.stream().pipeThrough(new TransformStream({ transform(c, ctl) { consumed += c.byteLength; doneBytes = consumed; ctl.enqueue(c); } }));
      await scanXml(counted, parser, function () { tick('xml'); });
    }
    if (!parser.exportDate && parser.nRecords === 0) throw new Error('文件里没有找到健康数据记录。');
    tick('xml', true);
    const offMin = tzOffsetMin(parser.exportDate);

    // 心电图与轨迹
    const ecgs = [], routes = [];
    if (isZip) {
      const ecgE = entries.filter(function (e) { return /electrocardiograms\/[^/]+\.csv$/i.test(e.name); });
      const gpxE = entries.filter(function (e) { return /workout-routes\/[^/]+\.gpx$/i.test(e.name); });
      let k = 0;
      for (const e of ecgE) {
        try { ecgs.push(parseEcg(await entryText(file, e), e.name.split('/').pop())); } catch (err) { ecgs.push({ file: e.name, error: String(err) }); }
        k++; report({ type: 'progress', phase: 'ecg', done: k, total: ecgE.length, records: parser.nRecords, elapsed: Date.now() - t0 });
      }
      k = 0;
      for (const e of gpxE) {
        try { routes.push(parseGpx(await entryText(file, e), e.name.split('/').pop(), offMin)); } catch (err) { routes.push({ file: e.name, error: String(err) }); }
        k++; report({ type: 'progress', phase: 'route', done: k, total: gpxE.length, records: parser.nRecords, elapsed: Date.now() - t0 });
      }
    }
    report({ type: 'progress', phase: 'finalize', done: 0, total: 1, records: parser.nRecords, elapsed: Date.now() - t0 });

    const types = parser.types.map(finalizeType);
    const sources = parser.sources.map(function (s, i) {
      const vers = [];
      parser.srcVer.forEach(function (r) { if (r.si === i) vers.push([r.ver, r.n, r.first, r.last]); });
      vers.sort(function (a, b) { return a[2] - b[2]; });
      return { name: s.name, n: s.n, first: s.first, last: s.last, types: Array.from(s.types.entries()), versions: vers, devModels: Array.from(s.devModels.entries()) };
    });
    const mapToArr = function (mp) { return Array.from(mp.entries()).map(function (e) { return [e[0], e[1].n, e[1].first, e[1].last]; }).sort(function (a, b) { return a[2] - b[2]; }); };
    const devices = parser.devices.map(function (d) {
      return { name: d.name, manufacturer: d.manufacturer, model: d.model, hardware: d.hardware, localIdentifier: d.localIdentifier, bluetoothIdentifier: d.bluetoothIdentifier, udi: d.udi,
        firmware: mapToArr(d.firmware), software: mapToArr(d.software), n: d.n, first: d.first, last: d.last, types: Array.from(d.types.entries()), sources: Array.from(d.sources.entries()), created: d.created };
    });
    // 体能训练：标记重复（同类型、同起止、同来源）
    const wkKey = new Map(); let wkDup = 0;
    parser.workouts.sort(function (a, b) { return a.s - b.s || a.e - b.e || (a.created - b.created); });
    parser.workouts.forEach(function (w) {
      const k = w.type + '|' + w.s + '|' + w.e + '|' + w.src;
      if (wkKey.has(k)) { w.dupOf = wkKey.get(k); wkDup++; } else wkKey.set(k, w);
      w.dupOf = w.dupOf ? 1 : 0;
    });
    const out = {
      format: 'healthlens-1', parsedAt: Date.now(), parseMs: Date.now() - t0, fileName: file.name, fileSize: file.size,
      exportDate: parser.exportDate, exportOffsetMin: offMin, locale: parser.locale, me: parser.me, files: files,
      types: types, sources: sources, devices: devices, workouts: parser.workouts, workoutDup: wkDup, activity: parser.activity,
      audiograms: parser.audiograms, clinical: parser.clinical, vision: parser.vision, correlations: parser.correlations,
      ecgs: ecgs, routes: routes, beats: { t: parser.beatT.done(), bpm: parser.beatB.done() },
      counts: { records: parser.nRecords, meta: parser.nMeta, lines: parser.nLines }
    };
    return out;
  }

  function transferList(ds) {
    const list = [];
    const add = function (a) { if (a && a.buffer && list.indexOf(a.buffer) < 0) list.push(a.buffer); };
    ds.types.forEach(function (t) { add(t.s); add(t.d); add(t.v); add(t.src); add(t.dev); add(t.fl); add(t.m); if (t.hrv) { add(t.hrv.b0); add(t.hrv.bn); } });
    ds.ecgs.forEach(function (e) { add(e.samples); add(e.rPeaks); add(e.rr); });
    ds.routes.forEach(function (r) { add(r.lat); add(r.lon); add(r.ele); add(r.t); add(r.speed); add(r.hAcc); add(r.course); });
    add(ds.beats.t); add(ds.beats.bpm);
    return list;
  }

  const api = { parseExport: parseExport, transferList: transferList, zipEntries: zipEntries, parseEcg: parseEcg, parseGpx: parseGpx };
  if (typeof importScripts === 'function' && typeof self !== 'undefined') {
    self.onmessage = async function (ev) {
      const msg = ev.data;
      if (msg && msg.cmd === 'parse') {
        try {
          const ds = await parseExport(msg.file, function (p) { self.postMessage(p); });
          self.postMessage({ type: 'done', data: ds }, transferList(ds));
        } catch (err) {
          self.postMessage({ type: 'error', message: (err && err.message) || String(err) });
        }
      }
    };
  }
  return api;
}
if (typeof module !== 'undefined' && module.exports) module.exports = __healthParserModule();
