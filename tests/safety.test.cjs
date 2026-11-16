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

test('index.html has valid JS syntax, matching DOM IDs, no demo banner/mode fallback, and working calendar helpers', async () => {
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
    checked: false,
    style: {},
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
    removeAttribute(k) { delete this[k]; },
    addEventListener() {},
    ...extra
  });
  const elements = new Map();
  for (const id of ids) elements.set(id, makeEl());
  const storage = new Map([['DSJH_GAS_API_URL', 'DEMO_MODE']]);
  const winListeners = {};
  const fetchCalls = [];
  const ctx = vm.createContext({
    console,
    AbortController,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => fn(),
    fetch: async (url, opts = {}) => {
      fetchCalls.push({ url, opts });
      if (String(url).includes('action=getEvents')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: 'success',
            data: [{
              id: 'dec-evt-1',
              title: '12月份期末籌備會',
              date: '2026/12/2',
              startTime: '12:40',
              endTime: '13:05',
              periods: '自訂時間',
              location: '圖書館',
              department: '教務處',
              participants: '教務處',
              category: '行政',
              categoryBg: '#fde2d3',
              categoryText: '#ed0c2e',
              description: '',
              hasPassword: true
            }]
          })
        };
      }
      if (opts && opts.method === 'POST') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'success', id: 'dec-evt-1' })
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'success' }) };
    },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k)
    },
    navigator: {clipboard: {writeText: async () => {}}},
    document: {
      activeElement: {},
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

  // quickAddDate preserves chosen date, requires password on add, and checks period + conflict radar cleanly
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
  assert.equal(elements.get('formPassword').required, true);
  assert.equal(elements.get('formStartTime').value, '');
  assert.equal(elements.get('formEndTime').value, '');

  // Select 第1節 (08:30-09:15) + 第2節 (09:25-10:10) -> auto-computes 08:30~10:10 & triggers conflict radar
  elements.get('formLocation').value = '圖書館';
  elements.get('periodOpt1').checked = true;
  elements.get('periodOpt2').checked = true;
  ctx.handlePeriodSelectionChange();
  assert.equal(elements.get('formStartTime').value, '08:30');
  assert.equal(elements.get('formEndTime').value, '10:10');
  assert.equal(elements.get('periodGapWarning').classList.contains('hidden'), true);
  assert.match(elements.get('radarText').innerHTML, /場地衝突預警/);
  assert.equal(elements.get('btnAutoRecommend').classList.contains('hidden'), false);

  // recommendAvailableSlot skips conflicting 第1節/第2節 and picks 第3節 (10:20-11:05)
  ctx.recommendAvailableSlot();
  assert.equal(elements.get('periodOpt3').checked, true);
  assert.equal(elements.get('formStartTime').value, '10:20');
  assert.equal(elements.get('formEndTime').value, '11:05');
  assert.match(elements.get('radarText').innerHTML, /時段空閒可用/);
  assert.equal(elements.get('btnAutoRecommend').classList.contains('hidden'), true);

  // Non-contiguous periods show gap warning
  elements.get('periodOpt3').checked = false;
  elements.get('periodOpt1').checked = true;
  elements.get('periodOpt6').checked = true;
  ctx.handlePeriodSelectionChange();
  assert.equal(elements.get('periodGapWarning').classList.contains('hidden'), false);
  assert.equal(elements.get('formStartTime').value, '08:30');
  assert.equal(elements.get('formEndTime').value, '13:55');

  // Custom time checkbox reveals manual inputs and marks them required
  elements.get('periodOpt1').checked = false;
  elements.get('periodOpt6').checked = false;
  elements.get('periodCustomCheckbox').checked = true;
  ctx.handlePeriodSelectionChange();
  assert.equal(elements.get('customTimeWrap').classList.contains('hidden'), false);
  assert.equal(elements.get('formStartTime').required, true);

  // Custom category color preview + dynamic category legend + participant helper
  ctx.applyCategoryPreset('親師', '#ffe4e6', '#9f1239');
  assert.equal(elements.get('formCategory').value, '親師');
  assert.equal(elements.get('colorPreviewLabel').innerText, '親師');
  assert.equal(elements.get('colorPreviewPill').style.backgroundColor, '#ffe4e6');
  elements.get('partOpt0').checked = true;
  elements.get('partOpt6').checked = true;
  elements.get('partOtherCheckbox').checked = true;
  elements.get('formParticipantsOther').value = '家長會, 志工隊';
  assert.equal(ctx.getFormParticipants(), '教務處、七年級導師、家長會、志工隊');
  ctx.buildDynamicCategoryLegend();
  assert.match(elements.get('legendFilterBar').innerHTML, /處室會議/);

  // AI screenshot attach / clear helpers toggle preview box and clear input cleanly
  ctx.setAiAttachedImage({
    dataUrl: 'data:image/png;base64,iVBORw0K',
    mimeType: 'image/png',
    base64: 'iVBORw0K',
    fileName: '開會通知.png',
    width: 800,
    height: 600,
    kb: 12
  });
  assert.equal(elements.get('aiImagePreviewBox').classList.contains('hidden'), false);
  assert.equal(elements.get('aiImageEmptyState').classList.contains('hidden'), true);
  assert.match(elements.get('aiImageMeta').innerText, /開會通知\.png/);
  elements.get('aiRawInput').value = '補充備註';
  ctx.clearAiExtractInput();
  assert.equal(elements.get('aiRawInput').value, '');
  assert.equal(elements.get('aiImagePreviewBox').classList.contains('hidden'), true);
  assert.equal(elements.get('aiImageEmptyState').classList.contains('hidden'), false);

  // Date normalization handles slash/unpadded/ISO formats cleanly across client and backend
  assert.equal(ctx.normalizeClientDateStr('2026/12/2'), '2026-12-02');
  assert.equal(ctx.normalizeClientDateStr('2026-12-2'), '2026-12-02');
  assert.equal(ctx.normalizeClientDateStr('2026-12-02T00:00:00.000Z'), '2026-12-02');

  // Chronological sort helper keeps earlier startTime first
  const sorted = ctx.sortEventsChronological([
    {date: '2026-11-25', startTime: '14:00', endTime: '15:00'},
    {date: '2026-11-25', startTime: '08:30', endTime: '09:30'}
  ]);
  assert.equal(sorted[0].startTime, '08:30');

  // Unauthenticated public status keeps Sheet URL & protected panels hidden, showing only safe badges
  ctx.syncAdminConfigUi();
  ctx.applyBackendSheetPayload(ctx.getActiveGasUrl(), {
    status: 'success',
    sheetName: '會議資料',
    auditSheetName: '異動紀錄',
    adminSheetName: '管理者名單',
    configSheetName: '系統設定',
    hasGeminiApiKey: true,
    geminiModel: 'gemini-2.5-flash',
    isDefaultAdminPassword: true,
    eventCount: 1
  });
  assert.equal(elements.get('headerSheetLink').classList.contains('hidden'), true);
  assert.equal(elements.get('headerSheetLink').href, '#');
  assert.equal(elements.get('adminProtectedContent').classList.contains('hidden'), true);
  assert.equal(elements.get('adminLoginBox').classList.contains('hidden'), false);
  assert.equal(elements.get('setupSheetOpenBtn').href, '#');
  assert.equal(elements.get('btnCopySheetUrl').disabled, true);
  assert.match(elements.get('backendSheetMetaText').innerText, /會議資料.*異動紀錄.*管理者名單.*系統設定/);
  assert.match(elements.get('adminConfigKeyBadge').innerText, /AI 金鑰就緒/);
  assert.match(elements.get('adminConfigPwdBadge').innerText, /admin888/);

  // After non-default admin login, Header Sheet link & protected settings unlock; logout re-locks immediately
  vm.runInContext(`adminSession = { token: 'custom-admin-tok', isDefault: false };`, ctx);
  ctx.applyBackendSheetPayload(ctx.getActiveGasUrl(), {
    status: 'success',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet/edit',
    spreadsheetName: '校園智慧行事曆資料庫 (AI Agent)',
    sheetName: '會議資料',
    auditSheetName: '異動紀錄',
    adminSheetName: '管理者名單',
    configSheetName: '系統設定',
    hasGeminiApiKey: true,
    geminiModel: 'gemini-2.5-flash',
    isDefaultAdminPassword: false,
    eventCount: 1
  });
  assert.equal(elements.get('adminProtectedContent').classList.contains('hidden'), false);
  assert.equal(elements.get('adminLoginBox').classList.contains('hidden'), true);
  assert.equal(elements.get('headerSheetLink').classList.contains('hidden'), false);
  assert.equal(elements.get('headerSheetLink').href, 'https://docs.google.com/spreadsheets/d/test-sheet/edit');
  assert.equal(elements.get('setupSheetOpenBtn').href, 'https://docs.google.com/spreadsheets/d/test-sheet/edit');
  assert.equal(elements.get('btnCopySheetUrl').disabled, false);
  assert.match(elements.get('backendSheetName').innerText, /校園智慧行事曆資料庫/);

  ctx.logoutCalendarAdmin();
  assert.equal(elements.get('adminProtectedContent').classList.contains('hidden'), true);
  assert.equal(elements.get('headerSheetLink').classList.contains('hidden'), true);
  assert.equal(elements.get('headerSheetLink').href, '#');
  assert.equal(elements.get('setupSheetOpenBtn').href, '#');
  assert.equal(elements.get('btnCopySheetUrl').disabled, true);

  // Submitting a December event while viewing November + another category filter switches straight to December and renders it cleanly
  vm.runInContext(`currentDate = new Date(2026, 10, 16); currentCategory = '教學研討'; currentView = 'month';`, ctx);
  ctx.openAddModal('2026-12-02');
  elements.get('formTitle').value = '12月份期末籌備會';
  elements.get('formDate').value = '2026-12-02';
  elements.get('formLocation').value = '圖書館';
  elements.get('formDepartment').value = '教務處';
  elements.get('periodCustomCheckbox').checked = true;
  ctx.handlePeriodSelectionChange();
  elements.get('formStartTime').value = '12:40';
  elements.get('formEndTime').value = '13:05';
  ctx.applyCategoryPreset('行政', '#fde2d3', '#ed0c2e');
  elements.get('formPassword').value = 'decPass1';
  await ctx.submitAddEvent({ preventDefault() {} });

  assert.equal(elements.get('currentPeriodLabel').innerText, '2026 年 12 月');
  assert.equal(vm.runInContext('currentCategory', ctx), 'ALL');
  assert.match(elements.get('calendarContainer').innerHTML, /12月份期末籌備會/);
  const getEvCall = fetchCalls.find(c => String(c.url).includes('action=getEvents'));
  assert.ok(getEvCall);
  assert.match(getEvCall.url, /_ts=\d+/);
  assert.equal(getEvCall.opts.cache, undefined);

  // Autofill protection: searchInput is isolated as type="search" and every password input uses autocomplete="new-password"
  const pwdInputs = [...html.matchAll(/<input\b[^>]*type=['"]password['"][^>]*>/g)].map(m => m[0]);
  assert.ok(pwdInputs.length >= 9);
  for (const tag of pwdInputs) {
    assert.match(tag, /autocomplete=['"]new-password['"]/);
  }
  const searchTag = html.match(/<input\b[^>]*id=['"]searchInput['"][^>]*>/)?.[0] || '';
  assert.match(searchTag, /type=['"]search['"]/);
  assert.match(searchTag, /autocomplete=['"]off['"]/);

  // Silent browser autofill (e.g., saved GitHub username "coolokey") is stripped automatically
  const searchEl = elements.get('searchInput');
  searchEl.value = 'coolokey';
  ctx.onSearchBoxInput(searchEl);
  assert.equal(searchEl.value, '');
  assert.match(elements.get('calendarContainer').innerHTML, /12月份期末籌備會/);

  // Real user search shows active filter banner and clearAllFilters restores visibility
  ctx.markSearchInputActivated();
  searchEl.value = '不存在的關鍵字';
  ctx.onSearchBoxInput(searchEl);
  assert.match(elements.get('calendarContainer').innerHTML, /顯示全部會議/);
  ctx.clearAllFilters();
  assert.equal(searchEl.value, '');
  assert.match(elements.get('calendarContainer').innerHTML, /12月份期末籌備會/);

  // Cloud loading overlay modal appears during initial/manual sync and hides reliably afterwards
  elements.get('cloudLoadingModal').classList.add('hidden');
  let overlayWasVisibleDuringFetch = false;
  const origFetch = ctx.fetch;
  ctx.fetch = async (url, opts) => {
    overlayWasVisibleDuringFetch = !elements.get('cloudLoadingModal').classList.contains('hidden');
    return origFetch(url, opts);
  };
  vm.runInContext(`eventsData = [];`, ctx);
  await ctx.fetchLiveEvents();
  assert.equal(overlayWasVisibleDuringFetch, true);
  assert.equal(elements.get('cloudLoadingModal').classList.contains('hidden'), true);
  assert.match(elements.get('cloudLoadingTitle').innerText, /資料載入中/);
});

function createGasMockHarness(initialProps = [['SPREADSHEET_ID', 'sheet-id-1'], ['GEMINI_API_KEY', 'seed-key-123']]) {
  const makeMockSheet = (name, initialRows = []) => {
    const rows = initialRows.map(r => [...r]);
    const formats = new Map();
    const sheetObj = {
      _name: name,
      _formats: formats,
      getName: () => sheetObj._name,
      setName: (n) => { sheetObj._name = n; },
      getParent: () => ss,
      getLastRow: () => rows.length,
      appendRow: (r) => rows.push([...r]),
      getDataRange: () => ({
        getValues: () => rows.map(r => [...r]),
        getDisplayValues: () => rows.map(r => r.map(v => (v === undefined || v === null ? '' : String(v))))
      }),
      deleteRow: (rowIdx) => { rows.splice(rowIdx - 1, 1); },
      getRange: (rowIdx, colIdx) => {
        const rangeObj = {
          setValue: (v) => {
            while (rows[rowIdx - 1].length < colIdx - 1) rows[rowIdx - 1].push('');
            rows[rowIdx - 1][colIdx - 1] = v;
          },
          setNumberFormat: (fmt) => { formats.set(`${rowIdx}:${colIdx}`, fmt); return rangeObj; },
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

  const propsMap = new Map(initialProps);
  const cacheMap = new Map();
  let uuidCounter = 0;
  let lastHttpJson = '';
  const ctx = vm.createContext({
    console,
    Utilities: {
      getUuid: () => `uuid-${++uuidCounter}-abcd1234`,
      formatDate: () => '2026-11-15 23:00:00',
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, str) => {
        if (!str) return [];
        return [...Buffer.from(String(str), 'utf8')].map(b => (b > 127 ? b - 256 : b));
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propsMap.has(k) ? propsMap.get(k) : null),
        setProperty: (k, v) => propsMap.set(k, v),
        deleteProperty: (k) => propsMap.delete(k)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheMap.has(k) ? cacheMap.get(k) : null),
        put: (k, v) => cacheMap.set(k, String(v)),
        remove: (k) => cacheMap.delete(k)
      })
    },
    SpreadsheetApp: {
      openById: (id) => (id === 'sheet-id-1' ? ss : null),
      getActiveSpreadsheet: () => null,
      create: () => ss,
      flush: () => {}
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        setMimeType: () => { lastHttpJson = txt; return txt; }
      })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas_code.gs'), 'utf8'), ctx);
  return { ctx, ss, propsMap, getSheets: () => sheets, getLastHttpJson: () => JSON.parse(lastHttpJson) };
}

test('backend spreadsheet organizes tabs cleanly and records full audit history on add, update, and delete', () => {
  const { ctx, ss, getSheets, getLastHttpJson } = createGasMockHarness();

  // Initializing sheet moves 會議資料 first, creates 異動紀錄/管理者名單/系統設定, and deletes blank 工作表1
  const mainSheet = ctx.getSheet();
  assert.deepEqual(getSheets().map(s => s.getName()), ['會議資料', '異動紀錄', '管理者名單', '系統設定']);

  // Missing password must be rejected on addEvent
  const missingPassRes = ctx.addEvent({
    title: '未設密碼會議',
    date: '2026-11-20',
    startTime: '09:00',
    endTime: '10:30',
    location: '第二會議室',
    department: '教務處',
    category: '親師',
    password: ''
  });
  assert.equal(missingPassRes.status, 'error');
  assert.equal(mainSheet._rows.length, 1);

  // Create -> Update -> Delete flow logs every operation to 異動紀錄 & persists 15-col metadata
  const addRes = ctx.addEvent({
    title: '校務發展會議',
    date: '2026-11-20',
    startTime: '09:25',
    endTime: '11:05',
    periods: '第2節、第3節',
    location: '第二會議室',
    department: '教務處',
    participants: '教務處、七年級導師',
    category: '親師',
    categoryBg: '#ffe4e6',
    categoryText: '#9f1239',
    description: '討論期中評量',
    password: 'meetPass1'
  });
  assert.equal(addRes.status, 'success');
  assert.equal(mainSheet._rows.length, 2);
  assert.equal(mainSheet._rows[0].length, 15);
  assert.equal(mainSheet._rows[1].length, 15);

  const fetchedEvents = ctx.getEvents();
  assert.equal(fetchedEvents.length, 1);
  assert.equal(fetchedEvents[0].periods, '第2節、第3節');
  assert.equal(fetchedEvents[0].participants, '教務處、七年級導師');
  assert.equal(fetchedEvents[0].categoryBg, '#ffe4e6');
  assert.equal(fetchedEvents[0].categoryText, '#9f1239');
  assert.equal(fetchedEvents[0].hasPassword, true);

  // Wrong password cannot update or delete
  const wrongUpdRes = ctx.updateEvent({
    id: addRes.id,
    title: '校務發展會議（偷改）',
    date: '2026-11-21',
    startTime: '10:20',
    endTime: '12:00',
    location: '第二會議室',
    department: '教務處',
    category: '親師',
    password: 'wrong'
  });
  assert.equal(wrongUpdRes.status, 'error');

  const updRes = ctx.updateEvent({
    id: addRes.id,
    title: '校務發展會議（改期）',
    date: '2026-11-21',
    startTime: '10:20',
    endTime: '12:00',
    periods: '第3節、第4節',
    location: '第二會議室',
    department: '教務處',
    participants: '教務處、八年級導師',
    category: '親師',
    categoryBg: '#ffe4e6',
    categoryText: '#9f1239',
    description: '改為週六上午',
    password: 'meetPass1'
  });
  assert.equal(updRes.status, 'success');
  assert.equal(mainSheet._rows[1][1], '校務發展會議（改期）');
  assert.equal(mainSheet._rows[1][11], '第3節、第4節');
  assert.equal(mainSheet._rows[1][12], '教務處、八年級導師');

  const wrongDelRes = ctx.deleteEvent({ id: addRes.id, password: '' });
  assert.equal(wrongDelRes.status, 'error');

  const delRes = ctx.deleteEvent({ id: addRes.id, password: 'meetPass1' });
  assert.equal(delRes.status, 'success');
  assert.equal(mainSheet._rows.length, 1);

  const auditSheet = ss.getSheetByName('異動紀錄');
  assert.equal(auditSheet._rows.length, 4);
  assert.equal(auditSheet._rows[0].length, 13);
  assert.deepEqual(auditSheet._rows.slice(1).map(r => r[1]), ['新增預約', '修改排程', '刪除排程']);
  assert.equal(auditSheet._rows[2][3], '校務發展會議（改期）');
  assert.equal(auditSheet._rows[2][11], '第3節、第4節');

  // public ping reports sheet names, key/password readiness flags & current count WITHOUT leaking spreadsheetUrl or secrets
  ctx.doGet({ parameter: { action: 'ping' } });
  const ping = getLastHttpJson();
  assert.equal(ping.status, 'success');
  assert.equal(ping.spreadsheetUrl, undefined);
  assert.equal(ping.spreadsheetName, undefined);
  assert.equal(ping.sheetName, '會議資料');
  assert.equal(ping.auditSheetName, '異動紀錄');
  assert.equal(ping.adminSheetName, '管理者名單');
  assert.equal(ping.configSheetName, '系統設定');
  assert.equal(ping.hasGeminiApiKey, true);
  assert.equal(ping.isDefaultAdminPassword, true);
  assert.equal(ping.eventCount, 0);
  assert.doesNotMatch(JSON.stringify(ping), /seed-key-123|admin888|docs\.google\.com\/spreadsheets/);
});

test('admin credentials and Gemini API key sync bidirectionally with spreadsheet and protect sensitive settings', () => {
  const { ctx, ss, propsMap, getLastHttpJson } = createGasMockHarness([['SPREADSHEET_ID', 'sheet-id-1'], ['GEMINI_API_KEY', 'seed-key-123']]);
  ctx.getSheet();

  const adminSheet = ss.getSheetByName('管理者名單');
  const cfgSheet = ss.getSheetByName('系統設定');
  assert.equal(adminSheet._rows[1][0], 'admin');
  assert.equal(adminSheet._rows[1][2], 'admin888');
  assert.equal(adminSheet._formats.get('2:3'), '@');
  assert.deepEqual(cfgSheet._rows.slice(1).map(r => r[0]), ['ADMIN_PASSWORD', 'GEMINI_API_KEY', 'GEMINI_MODEL']);
  assert.equal(cfgSheet._rows[2][1], 'seed-key-123');
  assert.equal(ctx.getGeminiApiKey(), 'seed-key-123');

  // Editing API key directly in Google Sheet 系統設定 takes immediate precedence
  cfgSheet._rows[2][1] = 'AIzaDirectSheetEdit999';
  assert.equal(ctx.getGeminiApiKey(), 'AIzaDirectSheetEdit999');

  // Login with default admin888 succeeds with isDefault=true, omits spreadsheetUrl & blocks API/settings changes before changing password
  const loginRes = ctx.loginAdmin('admin888');
  assert.equal(loginRes.status, 'success');
  assert.equal(loginRes.isDefault, true);
  assert.equal(loginRes.spreadsheetUrl, undefined);
  assert.equal(ctx.getAdminSettings(loginRes.token).status, 'error');
  const blockedSave = ctx.saveAdminSettings(loginRes.token, { geminiApiKey: 'AIzaShouldFail' });
  assert.equal(blockedSave.status, 'error');
  assert.match(blockedSave.message, /預設密碼/);

  // Changing admin password writes to 管理者名單, 系統設定, and ScriptProperties, and unlocks spreadsheetUrl
  const pwdRes = ctx.changeAdminPassword(loginRes.token, 'admin888', 'DaxiAdmin2026');
  assert.equal(pwdRes.status, 'success');
  assert.equal(pwdRes.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit');
  assert.equal(adminSheet._rows[1][2], 'DaxiAdmin2026');
  assert.equal(cfgSheet._rows[1][1], 'DaxiAdmin2026');
  assert.equal(propsMap.get('ADMIN_PASSWORD'), 'DaxiAdmin2026');

  // Re-logging in with custom password returns spreadsheetUrl & isDefault=false
  const customLogin = ctx.loginAdmin('DaxiAdmin2026');
  assert.equal(customLogin.status, 'success');
  assert.equal(customLogin.isDefault, false);
  assert.equal(customLogin.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit');

  // After changing password, admin can update GEMINI_API_KEY & GEMINI_MODEL and clear key securely
  const saveRes = ctx.saveAdminSettings(loginRes.token, { geminiApiKey: 'AIzaUpdatedFromUI777', geminiModel: 'gemini-2.0-flash' });
  assert.equal(saveRes.status, 'success');
  assert.equal(cfgSheet._rows[2][1], 'AIzaUpdatedFromUI777');
  assert.equal(cfgSheet._rows[3][1], 'gemini-2.0-flash');
  assert.equal(ctx.getGeminiApiKey(), 'AIzaUpdatedFromUI777');

  // getAdminSettings returns spreadsheetUrl after custom auth and never leaks raw key or password
  ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getAdminSettings', token: loginRes.token }) } });
  const adminStatus = getLastHttpJson();
  assert.equal(adminStatus.status, 'success');
  assert.equal(adminStatus.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/sheet-id-1/edit');
  assert.equal(adminStatus.hasGeminiApiKey, true);
  assert.equal(adminStatus.isDefaultAdminPassword, false);
  assert.doesNotMatch(JSON.stringify(adminStatus), /AIzaUpdatedFromUI777|DaxiAdmin2026/);

  // Custom admin password can delete a password-protected event and log admin override
  const lockedAdd = ctx.addEvent({
    title: '加密測試會議',
    date: '2026-12-01',
    startTime: '09:00',
    endTime: '10:00',
    location: '圖書館',
    department: '教務處',
    category: '處室會議',
    description: '',
    password: 'eventSecret1'
  });
  assert.equal(ctx.deleteEvent({ id: lockedAdd.id, password: 'wrong' }).status, 'error');
  assert.equal(ctx.deleteEvent({ id: lockedAdd.id, password: 'DaxiAdmin2026' }).status, 'success');
  const auditRows = ss.getSheetByName('異動紀錄')._rows;
  assert.equal(auditRows[auditRows.length - 1][1], '刪除排程 (管理者)');

  // 5 wrong login attempts trigger rate lock
  for (let i = 0; i < 5; i++) ctx.loginAdmin('bad-pass');
  const lockedLogin = ctx.loginAdmin('DaxiAdmin2026');
  assert.equal(lockedLogin.status, 'error');
  assert.match(lockedLogin.message, /暫時鎖定|15 分鐘/);
});

test('aiExtractEvent and callGeminiAPI support multimodal meeting screenshot extraction safely', () => {
  const fetchPayloads = [];
  const ctx = vm.createContext({
    console,
    Utilities: {formatDate: () => '2026-11-16'},
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'GEMINI_API_KEY' ? 'test-vision-key' : null)
      })
    },
    UrlFetchApp: {
      fetch: (_url, opts) => {
        fetchPayloads.push(JSON.parse(opts.payload));
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: '{"title":"期末課發會","date":"2026-11-25","startTime":"13:10","endTime":"14:50","periods":["第5節","第6節"],"location":"行政大樓3F教師研習中心","department":"教務處","participants":["教務處"],"category":"教學研討","confidence":"high"}'
                }]
              }
            }]
          })
        };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas_code.gs'), 'utf8'), ctx);

  // Image-only notice screenshot extraction strips data URL prefix and sends inlineData
  const imgOnlyRes = ctx.aiExtractEvent({
    text: '',
    imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    imageMimeType: ''
  });
  assert.equal(imgOnlyRes.status, 'success');
  assert.equal(imgOnlyRes.data.title, '期末課發會');
  assert.equal(fetchPayloads.length, 1);
  assert.equal(fetchPayloads[0].contents[0].parts.length, 2);
  assert.equal(fetchPayloads[0].contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.match(fetchPayloads[0].contents[0].parts[1].inlineData.data, /^iVBORw0K/);

  // Unsupported MIME type and sensitive text are rejected without calling Gemini
  const badMimeRes = ctx.aiExtractEvent({ text: '', imageBase64: 'QUJD', imageMimeType: 'application/pdf' });
  assert.equal(badMimeRes.status, 'error');
  assert.equal(fetchPayloads.length, 1);

  const sensitiveImgRes = ctx.aiExtractEvent({
    text: '學生身分證 A123456789 會議',
    imageBase64: 'QUJD',
    imageMimeType: 'image/jpeg'
  });
  assert.equal(sensitiveImgRes.status, 'error');
  assert.equal(fetchPayloads.length, 1);

  // formatDate handles slash, unpadded ISO, and ROC date formats consistently
  assert.equal(ctx.formatDate('2026/12/2'), '2026-12-02');
  assert.equal(ctx.formatDate('2026-12-2'), '2026-12-02');
  assert.equal(ctx.formatDate('115年12月2日'), '2026-12-02');
  assert.equal(ctx.formatDate('115/12/02'), '2026-12-02');
});

