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
test('minutes without notes never fabricate decisions or invoke AI', () => {
  const ctx = backend();
  ctx.callGeminiAPI = () => { throw new Error('AI must not be called'); };
  const result = ctx.aiGenerateMinutes({title:'校務會議'}, '');
  assert.equal(result.status, 'success');
  assert.match(JSON.stringify(result.data), /待補/);
  assert.doesNotMatch(JSON.stringify(result.data), /照案通過|達成共識/);
});
test('sensitive input is rejected before an external model call', () => {
  const ctx = backend();
  let called = false;
  ctx.callGeminiAPI = () => {called = true; return '{}';};
  const result = ctx.aiExtractEvent('學生身分證 A123456789，下週开會');
  assert.equal(result.status, 'error');
  assert.equal(called, false);
});
test('schedule model receives only occupied time slots, not descriptions or titles', () => {
  const ctx = backend();
  ctx.getEvents = () => [{date:'2026-10-03', startTime:'09:00',endTime:'10:00',location:'A', title:'秘密姓名', description:'個案健康資料'}];
  let sent;
  ctx.callGeminiAPI = p => {sent = p; return '{"reply":"待確認"}';};
  assert.equal(ctx.aiChatSchedule('有空檔嗎').status, 'success');
  assert.doesNotMatch(sent, /秘密姓名|個案健康資料/);
  assert.match(sent, /09:00/);
});
