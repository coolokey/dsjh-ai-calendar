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

