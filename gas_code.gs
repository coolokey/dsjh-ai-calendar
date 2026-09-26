// ====================================================================
// 校園智慧行事曆 Agent (AI 會議協作與智慧排程系統) - Google Apps Script 後端
// 版本：3.5 (全面支援 Google Gemini 2.0/1.5 生成式 AI、完整 CRUD 與即時健康診斷)
// 授權：MIT License | 適用學校：桃園市立大溪國民中學 / 全國各級中小學
// ====================================================================

var SHEET_NAME = '會議資料';

// ── 取得或自動建立 Google 試算表資料庫 ─────────────────────────────────
function getSheet() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (spreadsheetId) {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('校園智慧行事曆資料庫 (AI Agent)');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    var header = ['ID', '標題', '日期', '開始時間', '結束時間', '地點',
                  '主辦單位/部門', '分類', '說明備註', '密碼(Hash)', '建立時間'];
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length)
         .setFontWeight('bold')
         .setBackground('#1e3a8a') // 沉穩海軍藍
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 11, 120);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(6, 160);
    sheet.setColumnWidth(9, 260);
  }
  return sheet;
}

// ── 日期與時間正規化工具 ─────────────────────────────────────────────
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var str = String(val).trim().replace(/^'/, '');
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  var cleanStr = str.replace(/\s*\([^)]*\)\s*$/, '');
  var d = new Date(cleanStr);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return str;
}

function formatTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'HH:mm');
  }
  var str = String(val).trim().replace(/^'/, '');
  var m = str.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    var hh = m[1].length === 1 ? '0' + m[1] : m[1];
    return hh + ':' + m[2];
  }
  var d = new Date('1970-01-01T' + str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'Asia/Taipei', 'HH:mm');
  }
  return str;
}

// ── SHA-256 密碼雜湊防誤刪機制 ────────────────────────────────────────
function hashPassword(password) {
  if (!password) return '';
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  var txtHash = '';
  for (var i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    var byteString = hashVal.toString(16);
    if (byteString.length == 1) byteString = '0' + byteString;
    txtHash += byteString;
  }
  return txtHash;
}

// ── 檢查地點與時段衝突 (支援排除指定 ID) ─────────────────────────────
function checkConflict(date, startTime, endTime, location, excludeId) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  var normDate = formatDate(date);
  var normStart = formatTime(startTime);
  var normEnd = formatTime(endTime);
  var normLoc = String(location || '').trim().toLowerCase();
  if (!normLoc) return null;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowId = String(row[0]);
    if (excludeId && rowId === String(excludeId)) continue;

    var rDate = formatDate(row[2]);
    var rStart = formatTime(row[3]);
    var rEnd = formatTime(row[4]);
    var rLoc = String(row[5] || '').trim().toLowerCase();

    // 同日期、同地點且時段重疊：startA < endB && endA > startB
    if (rDate === normDate && rLoc === normLoc && normLoc !== '') {
      if (normStart < rEnd && normEnd > rStart) {
        return {
          conflict: true,
          conflictingEvent: {
            id: row[0],
            title: row[1],
            date: rDate,
            startTime: rStart,
            endTime: rEnd,
            location: row[5],
            department: row[6]
          }
        };
      }
    }
  }
  return null;
}

// ── 取得所有會議事件清單 ─────────────────────────────────────────────
function getEvents() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var events = [];
  if (data.length <= 1) return events;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    events.push({
      id: String(row[0]),
      title: String(row[1]),
      date: formatDate(row[2]),
      startTime: formatTime(row[3]),
      endTime: formatTime(row[4]),
      location: String(row[5] || ''),
      department: String(row[6] || ''),
      category: String(row[7] || '全校會議'),
      description: String(row[8] || ''),
      createdAt: row[10] ? formatDate(row[10]) : ''
    });
  }
  return events;
}

// ── 新增會議事件 ───────────────────────────────────────────────────
function addEvent(payload) {
  var title = String(payload.title || '').trim();
  var date = formatDate(payload.date);
  var startTime = formatTime(payload.startTime);
  var endTime = formatTime(payload.endTime);
  var location = String(payload.location || '').trim();
  var department = String(payload.department || '').trim();
  var category = String(payload.category || '全校會議').trim();
  var description = String(payload.description || '').trim();
  var password = String(payload.password || '').trim();

  if (!title || !date || !startTime || !endTime) {
    return { status: 'error', message: '標題、日期、開始時間與結束時間為必填欄位。' };
  }
  if (startTime >= endTime) {
    return { status: 'error', message: '開始時間必須早於結束時間。' };
  }

  // 衝突檢查
  var conflict = checkConflict(date, startTime, endTime, location, null);
  if (conflict) {
    return {
      status: 'conflict',
      message: '【場地時段衝突】' + location + ' 在該時段已有會議：' +
               conflict.conflictingEvent.title + ' (' +
               conflict.conflictingEvent.startTime + '~' +
               conflict.conflictingEvent.endTime + ' ' +
               conflict.conflictingEvent.department + ')',
      conflictDetails: conflict.conflictingEvent
    };
  }

  var id = Utilities.getUuid().substring(0, 8);
  var pwdHash = hashPassword(password);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

  var sheet = getSheet();
  sheet.appendRow([
    id,
    title,
    "'" + date,
    "'" + startTime,
    "'" + endTime,
    location,
    department,
    category,
    description,
    pwdHash,
    nowStr
  ]);

  return { status: 'success', message: '會議已成功登記！', id: id };
}

// ── 更新/修改會議事件 (支援密碼驗證) ──────────────────────────────────
function updateEvent(payload) {
  var id = String(payload.id || '').trim();
  var password = String(payload.password || '').trim();
  if (!id) return { status: 'error', message: '請指定欲修改的會議 ID。' };

  var title = String(payload.title || '').trim();
  var date = formatDate(payload.date);
  var startTime = formatTime(payload.startTime);
  var endTime = formatTime(payload.endTime);
  var location = String(payload.location || '').trim();
  var department = String(payload.department || '').trim();
  var category = String(payload.category || '全校會議').trim();
  var description = String(payload.description || '').trim();

  if (!title || !date || !startTime || !endTime) {
    return { status: 'error', message: '標題、日期、開始時間與結束時間為必填欄位。' };
  }
  if (startTime >= endTime) {
    return { status: 'error', message: '開始時間必須早於結束時間。' };
  }

  // 衝突檢查 (排除本筆 ID)
  var conflict = checkConflict(date, startTime, endTime, location, id);
  if (conflict) {
    return {
      status: 'conflict',
      message: '【場地時段衝突】' + location + ' 在該時段已有會議：' +
               conflict.conflictingEvent.title + ' (' +
               conflict.conflictingEvent.startTime + '~' +
               conflict.conflictingEvent.endTime + ' ' +
               conflict.conflictingEvent.department + ')',
      conflictDetails: conflict.conflictingEvent
    };
  }

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      var storedHash = String(data[i][9]);
      var inputHash = hashPassword(password);

      // 若原設定密碼則需檢核
      if (storedHash && storedHash !== inputHash) {
        return { status: 'error', message: '驗證密碼不正確，無法修改此筆會議。' };
      }

      var rowIdx = i + 1;
      sheet.getRange(rowIdx, 2).setValue(title);
      sheet.getRange(rowIdx, 3).setValue("'" + date);
      sheet.getRange(rowIdx, 4).setValue("'" + startTime);
      sheet.getRange(rowIdx, 5).setValue("'" + endTime);
      sheet.getRange(rowIdx, 6).setValue(location);
      sheet.getRange(rowIdx, 7).setValue(department);
      sheet.getRange(rowIdx, 8).setValue(category);
      sheet.getRange(rowIdx, 9).setValue(description);

      return { status: 'success', message: '會議已成功更新！' };
    }
  }
  return { status: 'error', message: '找不到該筆會議紀錄。' };
}

// ── 刪除會議事件 (需密碼驗證) ──────────────────────────────────────
function deleteEvent(payload) {
  var id = String(payload.id || '').trim();
  var password = String(payload.password || '').trim();

  if (!id) return { status: 'error', message: '請指定欲刪除的會議 ID。' };

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      var storedHash = String(data[i][9]);
      var inputHash = hashPassword(password);

      if (storedHash && storedHash !== inputHash) {
        return { status: 'error', message: '刪除密碼不正確，無法刪除此筆會議。' };
      }

      sheet.deleteRow(i + 1);
      return { status: 'success', message: '會議已成功刪除。' };
    }
  }
  return { status: 'error', message: '找不到該筆會議紀錄。' };
}


// ====================================================================
// ── GEMINI 生成式 AI 整合模組 ────────────────────────────────────────
// ====================================================================

function getGeminiApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  return key ? key.trim() : '';
}

function callGeminiAPI(prompt, systemInstruction) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('未設定 GEMINI_API_KEY。請至 Apps Script「專案設定」→「指令碼屬性」新增 GEMINI_API_KEY。');
  }

  // 支援的模型清單（優先使用 1.5-flash 或 2.0-flash）
  var models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
  var preferredModel = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || models[0];

  var payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var lastError = '';
  // 嘗試指定或備援模型呼叫
  var testModels = [preferredModel];
  for (var m = 0; m < models.length; m++) {
    if (models[m] !== preferredModel) testModels.push(models[m]);
  }

  for (var k = 0; k < testModels.length; k++) {
    var curModel = testModels[k];
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + curModel + ':generateContent?key=' + apiKey;
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var resText = response.getContentText();

    if (code === 200) {
      var result = JSON.parse(resText);
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        var rawText = result.candidates[0].content.parts[0].text;
        // 清除可能的 markdown 包裹
        var cleanText = rawText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        return cleanText;
      }
    } else {
      lastError = 'HTTP ' + code + ': ' + resText;
    }
  }

  throw new Error('Gemini API 呼叫失敗：' + lastError);
}

// ── AI 功能 1：公文 / 通知文字一鍵智能解析為會議排程 ────────────────
function aiExtractEvent(text) {
  if (!text || String(text).trim() === '') {
    return { status: 'error', message: '請提供欲解析的公文或通知文字內容。' };
  }

  var todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var dayOfWeek = Utilities.formatDate(new Date(), 'Asia/Taipei', 'EEEE');

  var systemPrompt = 
    "你是一位台灣中小學的校園智慧行政秘書。\n" +
    "你的任務是從第一線教師或承辦人提供的非結構化公文、Email、校園Line通知或處室報告文字中，精準擷取會議排程資訊。\n" +
    "今天是 " + todayStr + " (" + dayOfWeek + ")。如果是相對日期（例如「下週三」、「明天」），請換算成精確的 YYYY-MM-DD。\n" +
    "時間若只有時段（例如「第2節」約為 09:10~10:00；「第5節/下午第1節」約為 13:15~14:05；「下午2點」為 14:00），請自動轉換為標準 24 小時制 HH:mm。\n" +
    "若文字未載明結束時間，預設會議時長為 1 小時。\n" +
    "請以 JSON 物件輸出，嚴格符合下列鍵名：\n" +
    "{\n" +
    '  "title": "會議精簡標題",\n' +
    '  "date": "YYYY-MM-DD",\n' +
    '  "startTime": "HH:mm",\n' +
    '  "endTime": "HH:mm",\n' +
    '  "location": "會議地點（如：二樓第一會議室、三樓研討室、圖書館視聽教室、活動中心等）",\n' +
    '  "department": "主辦處室或召集人（如：教務處、學務處、輔導室、總務處等）",\n' +
    '  "category": "分類（可選：全校會議、處室會議、教學研討、重大活動、其他）",\n' +
    '  "description": "摘要重點、待辦事項或需攜帶資料",\n' +
    '  "confidence": "high/medium/low",\n' +
    '  "notes": "解析補充提醒（如有缺漏時提醒使用者手動確認）"\n' +
    "}";

  try {
    var jsonText = callGeminiAPI(text, systemPrompt);
    var parsed = JSON.parse(jsonText);
    return { status: 'success', data: parsed };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ── AI 功能 2：會議通知文案與議程範本自動生成 ────────────────────────
function aiGenerateAgenda(meetingData) {
  var systemPrompt = 
    "你是一位專業的學校行政秘書。根據所提供的會議詳細資料，產出兩份實用文件：\n" +
    "1. Line / 校園推播通知稿（親切、重點清晰、含時間地點出席人員、emoji適度點綴）\n" +
    "2. 標準校內會議議程草稿（含主席致詞、業務報告、提案討論、臨時動議等標準結構）\n" +
    "請以 JSON 物件輸出：\n" +
    "{\n" +
    '  "pushMessage": "完整推播訊息文字",\n' +
    '  "agendaDraft": "完整議程規劃草案文字"\n' +
    "}";

  var userPrompt = JSON.stringify(meetingData);

  try {
    var jsonText = callGeminiAPI(userPrompt, systemPrompt);
    var parsed = JSON.parse(jsonText);
    return { status: 'success', data: parsed };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ── AI 功能 3：智慧排程對話助手 (詢問空檔或建議場地) ────────────────
function aiChatSchedule(userMessage) {
  var events = getEvents();
  var todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');

  var systemPrompt = 
    "你是一位校園行事曆 AI 智慧排程顧問。\n" +
    "今天是 " + todayStr + "。你手上有目前學校行事曆所有既定會議清單。\n" +
    "請根據使用者的提問，分析空檔、判斷衝突或提供排程建議。\n" +
    "請輸出 JSON 物件：\n" +
    "{\n" +
    '  "reply": "給使用者的白話回覆，語氣親切專業",\n' +
    '  "suggestedSlot": { "date": "YYYY-MM-DD", "startTime": "HH:mm", "endTime": "HH:mm", "location": "建議場地" } (若無建議則為 null),\n' +
    '  "hasConflict": true/false\n' +
    "}";

  var prompt = "現有會議清單：\n" + JSON.stringify(events) + "\n\n使用者提問：" + userMessage;

  try {
    var jsonText = callGeminiAPI(prompt, systemPrompt);
    var parsed = JSON.parse(jsonText);
    return { status: 'success', data: parsed };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ====================================================================
// ── Web App 請求入口 (GET / POST) ──────────────────────────────────
// ====================================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getEvents';
  var responseData;

  try {
    if (action === 'getEvents') {
      responseData = { status: 'success', data: getEvents() };
    } else if (action === 'checkConflict') {
      var c = checkConflict(
        e.parameter.date,
        e.parameter.startTime,
        e.parameter.endTime,
        e.parameter.location,
        e.parameter.excludeId
      );
      responseData = { status: 'success', data: c };
    } else if (action === 'ping') {
      var hasApiKey = Boolean(getGeminiApiKey());
      var sheet = getSheet();
      var ssUrl = sheet.getParent() ? sheet.getParent().getUrl() : '';
      responseData = {
        status: 'success',
        message: '校園智慧行事曆後端服務運行正常',
        hasGeminiApiKey: hasApiKey,
        spreadsheetUrl: ssUrl,
        eventCount: Math.max(0, sheet.getLastRow() - 1)
      };
    } else {
      responseData = { status: 'error', message: '未知 action 請求: ' + action };
    }
  } catch (err) {
    responseData = { status: 'error', message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var responseData;

  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    var action = payload.action || 'addEvent';

    if (action === 'addEvent') {
      responseData = addEvent(payload);
    } else if (action === 'updateEvent') {
      responseData = updateEvent(payload);
    } else if (action === 'deleteEvent') {
      responseData = deleteEvent(payload);
    } else if (action === 'aiExtractEvent') {
      responseData = aiExtractEvent(payload.text);
    } else if (action === 'aiGenerateAgenda') {
      responseData = aiGenerateAgenda(payload.meetingData);
    } else if (action === 'aiChatSchedule') {
      responseData = aiChatSchedule(payload.message);
    } else {
      responseData = { status: 'error', message: '未知 action 操作: ' + action };
    }
  } catch (err) {
    responseData = { status: 'error', message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
                       .setMimeType(ContentService.MimeType.JSON);
}
