const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function backend() {
  const ctx = vm.createContext({console, Utilities: {formatDate: () => '2026-10-03'}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas_code.gs'), 'utf8'), ctx);
  return ctx;
}

test('minutes draft provides structured template and avoids false unanimous claims when notes are omitted', () => {
  const ctx = backend();
  ctx.callGeminiAPI = () => '{"minutes":"【桃園市立大溪國民中學 會議紀錄草案】\\n決議：【提請討論審議，具體決議待承辦處室核定】"}';
  const result = ctx.aiGenerateMinutes({title:'校務會議'}, '');
  assert.equal(result.status, 'success');
  assert.match(JSON.stringify(result.data), /大溪國民中學/);
  assert.doesNotMatch(JSON.stringify(result.data), /全體無異議通過|達成高度共識/);
});

test('sensitive input is rejected before an external model call', () => {
  const ctx = backend();
  let called = false;
  ctx.callGeminiAPI = () => {called = true; return '{}';};
  const result = ctx.aiExtractEvent('學生身分證 A123456789，下週開會');
  assert.equal(result.status, 'error');
  assert.equal(called, false);
});

test('normal school meetings are not falsely blocked by sensitive check', () => {
  const ctx = backend();
  let called = false;
  ctx.callGeminiAPI = () => {called = true; return '{"title":"高關懷個案輔導會議"}';};
  const result = ctx.aiExtractEvent('主旨：召開高關懷個案輔導會議，下週三下午第二節於教師研習中心。');
  assert.equal(result.status, 'success');
  assert.equal(called, true);
});

test('schedule model receives occupied time slots and department context, but not private event descriptions', () => {
  const ctx = backend();
  ctx.getEvents = () => [{date:'2026-10-03', startTime:'09:00', endTime:'10:00', location:'視聽教室', department:'教務處', category:'處室會議', title:'校務發展研習', description:'個案健康敏感資料'}];
  let sent;
  ctx.callGeminiAPI = p => {sent = p; return '{"reply":"教務處已有排定研習"}';};
  assert.equal(ctx.aiChatSchedule('教務處有排會嗎').status, 'success');
  assert.doesNotMatch(sent, /個案健康敏感資料/);
  assert.match(sent, /教務處/);
  assert.match(sent, /09:00/);
});

test('callGeminiAPI prioritizes gemini-2.5-flash and falls back to gemini-2.0-flash', () => {
  const requestedUrls = [];
  const ctx = vm.createContext({
    console,
    Utilities: {formatDate: () => '2026-11-15'},
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'GEMINI_API_KEY' ? 'test-key' : null)
      })
    },
    UrlFetchApp: {
      fetch: (url) => {
        requestedUrls.push(url);
        if (requestedUrls.length === 1) {
          return {getResponseCode: () => 503, getContentText: () => 'overloaded'};
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({candidates: [{content: {parts: [{text: '{"ok":true}'}]}}]})
        };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas_code.gs'), 'utf8'), ctx);
  const res = ctx.callGeminiAPI('hello', 'system');
  assert.equal(res, '{"ok":true}');
  assert.match(requestedUrls[0], /gemini-2\.5-flash/);
  assert.match(requestedUrls[1], /gemini-2\.0-flash/);
});

test('index.html has valid JS syntax, matching DOM IDs, no demo banner/mode fallback, and working calendar helpers', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.doesNotMatch(html, /demoNoticeBanner|getInitialMockEvents|展示模式|resetToDemoMode/);
  assert.doesNotMatch(html, /\b(?:alert|prompt|confirm)\s*\(/);

  const ids = new Set([...html.matchAll(/\sid=['"]([^'"]+)['"]/g)].map(m => m[1]));
  const usedIds = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  const missingIds = [...new Set(usedIds.filter(id => !ids.has(id)))];
  assert.deepEqual(missingIds, []);
  assert.equal(ids.has('radarDot'), true);
  assert.equal(ids.has('radarText'), true);

  const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const appScript = scriptBlocks[scriptBlocks.length - 1][1];
  const makeEl = (extra = {}) => ({
    value: '',
    innerText: '',
    innerHTML: '',
    disabled: false,
    required: false,
    options: [{value: ''}, {value: '圖書館'}, {value: '教務處'}, {value: '其他'}],
    classList: {
      items: new Set(),
      add(...c) { c.forEach(x => this.items.add(x)); },
      remove(...c) { c.forEach(x => this.items.delete(x)); },
      toggle(c, f) { f ? this.items.add(c) : this.items.delete(c); },
      contains(c) { return this.items.has(c); }
    },
    dataset: {},
    focus() {},
    reset() {},
    appendChild() {},
    remove() {},
    addEventListener() {},
    ...extra
  });
  const elements = new Map();
  for (const id of ids) elements.set(id, makeEl());
  const storage = new Map([['DSJH_GAS_API_URL', 'DEMO_MODE']]);
  const winListeners = {};
  const ctx = vm.createContext({
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => fn(),
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k)
    },
    navigator: {clipboard: {writeText: async () => {}}},
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => makeEl()
    },
    window: {
      addEventListener: (ev, fn) => { winListeners[ev] = fn; }
    }
  });
  ctx.window.document = ctx.document;
  vm.runInContext(appScript, ctx);

  // Stale DEMO_MODE in localStorage must auto-clean and return DEFAULT_GAS_URL
  assert.match(ctx.getActiveGasUrl(), /^https:\/\/script\.google\.com\//);
  assert.equal(storage.has('DSJH_GAS_API_URL'), false);

  // quickAddDate preserves chosen date and checks conflict radar cleanly
  vm.runInContext(`eventsData.push({
    id: 'evt-1',
    title: '既定會議',
    date: '2026-11-25',
    startTime: '09:00',
    endTime: '10:00',
    location: '圖書館',
    department: '教務處',
    category: '處室會議'
  });`, ctx);
  ctx.quickAddDate('2026-11-25');
  assert.equal(elements.get('formDate').value, '2026-11-25');
  elements.get('formLocation').value = '圖書館';
  ctx.checkLiveConflict();
  assert.match(elements.get('radarText').innerHTML, /場地衝突預警/);
  assert.equal(elements.get('btnAutoRecommend').classList.contains('hidden'), false);
  ctx.recommendAvailableSlot();
  assert.equal(elements.get('formStartTime').value, '10:30');
  assert.equal(elements.get('formEndTime').value, '11:30');
  assert.match(elements.get('radarText').innerHTML, /時段空閒可用/);
  assert.equal(elements.get('btnAutoRecommend').classList.contains('hidden'), true);

  // Chronological sort helper keeps earlier startTime first
  const sorted = ctx.sortEventsChronological([
    {date: '2026-11-25', startTime: '14:00', endTime: '15:00'},
    {date: '2026-11-25', startTime: '08:30', endTime: '09:30'}
  ]);
  assert.equal(sorted[0].startTime, '08:30');

  // Backend Google Sheet metadata hydrates Header link & Setup Modal card safely
  ctx.applyBackendSheetPayload(ctx.getActiveGasUrl(), {
    status: 'success',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet/edit',
    spreadsheetName: '校園智慧行事曆資料庫 (AI Agent)',
    sheetName: '會議資料',
    auditSheetName: '異動紀錄',
    eventCount: 1
  });
  assert.equal(elements.get('headerSheetLink').href, 'https://docs.google.com/spreadsheets/d/test-sheet/edit');
  assert.equal(elements.get('setupSheetOpenBtn').href, 'https://docs.google.com/spreadsheets/d/test-sheet/edit');
  assert.equal(elements.get('btnCopySheetUrl').disabled, false);
  assert.match(elements.get('backendSheetName').innerText, /校園智慧行事曆資料庫/);
  assert.match(elements.get('backendSheetMetaText').innerText, /會議資料.*異動紀錄/);
});

test('backend spreadsheet organizes tabs cleanly and records full audit history on add, update, and delete', () => {
  const makeMockSheet = (name, initialRows = []) => {
    const rows = initialRows.map(r => [...r]);
    const sheetObj = {
      _name: name,
      getName: () => sheetObj._name,
      setName: (n) => { sheetObj._name = n; },
      getParent: () => ss,
      getLastRow: () => rows.length,
      appendRow: (r) => rows.push([...r]),
      getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
      deleteRow: (rowIdx) => { rows.splice(rowIdx - 1, 1); },
      getRange: (rowIdx, colIdx) => {
        const rangeObj = {
          setValue: (v) => { rows[rowIdx - 1][colIdx - 1] = v; },
          setFontWeight: () => rangeObj,
          setBackground: () => rangeObj,
          setFontColor: () => rangeObj
        };
        return rangeObj;
      },
      setFrozenRows: () => {},
      setColumnWidths: () => {},
      setColumnWidth: () => {},
      _rows: rows
    };
    return sheetObj;
  };

  let sheets = [
    makeMockSheet('工作表1', []),
    makeMockSheet('會議資料', [['ID', '標題', '日期', '開始時間', '結束時間', '地點', '主辦單位/部門', '分類', '說明備註', '密碼(Hash)', '建立時間']])
  ];
  let activeSheet = sheets[0];
  const ss = {
    getId: () => 'sheet-id-1',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit',
    getName: () => '校園智慧行事曆資料庫 (AI Agent)',
    getSheets: () => [...sheets],
    getSheetByName: (name) => sheets.find(s => s.getName() === name) || null,
    insertSheet: (name) => {
      const s = makeMockSheet(name, []);
      sheets.push(s);
      return s;
    },
    setActiveSheet: (s) => { activeSheet = s; },
    moveActiveSheet: (pos) => {
      sheets = sheets.filter(s => s !== activeSheet);
      sheets.splice(pos - 1, 0, activeSheet);
    },
    deleteSheet: (target) => {
      sheets = sheets.filter(s => s !== target);
    }
  };

  const propsMap = new Map([['SPREADSHEET_ID', 'sheet-id-1'], ['GEMINI_API_KEY', 'k']]);
  let pingPayload = '';
  const ctx = vm.createContext({
    console,
    Utilities: {
      getUuid: () => 'abcd1234-5678-90ef',
      formatDate: () => '2026-11-15 23:00:00',
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: () => []
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propsMap.has(k) ? propsMap.get(k) : null),
        setProperty: (k, v) => propsMap.set(k, v)
      })
    },
    SpreadsheetApp: {
      openById: (id) => (id === 'sheet-id-1' ? ss : null),
      create: () => ss,
      flush: () => {}
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        setMimeType: () => { pingPayload = txt; return txt; }
      })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas_code.gs'), 'utf8'), ctx);

  // Initializing sheet moves 會議資料 first, creates 異動紀錄, and deletes blank 工作表1
  const mainSheet = ctx.getSheet();
  assert.deepEqual(sheets.map(s => s.getName()), ['會議資料', '異動紀錄']);

  // Create -> Update -> Delete flow logs every operation to 異動紀錄
  const addRes = ctx.addEvent({
    title: '校務發展會議',
    date: '2026-11-20',
    startTime: '09:00',
    endTime: '10:30',
    location: '第二會議室',
    department: '教務處',
    category: '處室會議',
    description: '討論期中評量',
    password: ''
  });
  assert.equal(addRes.status, 'success');
  assert.equal(mainSheet._rows.length, 2);

  const updRes = ctx.updateEvent({
    id: addRes.id,
    title: '校務發展會議（改期）',
    date: '2026-11-21',
    startTime: '10:00',
    endTime: '11:30',
    location: '第二會議室',
    department: '教務處',
    category: '處室會議',
    description: '改為週六上午',
    password: ''
  });
  assert.equal(updRes.status, 'success');
  assert.equal(mainSheet._rows[1][1], '校務發展會議（改期）');

  const delRes = ctx.deleteEvent({ id: addRes.id, password: '' });
  assert.equal(delRes.status, 'success');
  assert.equal(mainSheet._rows.length, 1);

  const auditSheet = ss.getSheetByName('異動紀錄');
  assert.equal(auditSheet._rows.length, 4);
  assert.deepEqual(auditSheet._rows.slice(1).map(r => r[1]), ['新增預約', '修改排程', '刪除排程']);
  assert.equal(auditSheet._rows[2][3], '校務發展會議（改期）');

  // ping reports spreadsheet URL, name, sheet names, and current count
  ctx.doGet({ parameter: { action: 'ping' } });
  const ping = JSON.parse(pingPayload);
  assert.equal(ping.status, 'success');
  assert.equal(ping.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit');
  assert.equal(ping.sheetName, '會議資料');
  assert.equal(ping.auditSheetName, '異動紀錄');
  assert.equal(ping.eventCount, 0);
});

