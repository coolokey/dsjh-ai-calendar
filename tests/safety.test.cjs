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
});

