/**
 * 코어 세일즈 인트라넷 ↔ 구글 시트 브리지 (Apps Script 웹 앱)
 *
 * 인트라넷 서버가 이 웹 앱을 호출해서 문의 시트를 읽고, 영업이 수기로 적는 칸에만 값을 쓴다.
 * 설정 방법은 같은 폴더의 README.md 를 본다.
 *
 * 안전장치
 *  - 모든 요청은 스크립트 속성 TOKEN 과 같은 토큰이 있어야 한다.
 *  - 쓰기는 WRITABLE 에 있는 수기 칸만 가능하다. 날짜·상호명·연락처 같은 자동 입력 칸은 쓰지 않는다.
 *  - 쓰기 직전에 그 행의 '날짜'와 '연락처'가 요청과 같은지, 칸의 현재 값이 요청이 알던 값과 같은지 확인한다.
 *    (누가 시트를 정렬하거나 행을 지우거나 같은 칸을 먼저 고친 경우에는 쓰지 않고 이유를 돌려준다)
 *  - 수식이 들어 있는 칸은 덮어쓰지 않는다.
 *  - 바꾼 내용은 '인트라넷_기록' 탭에 쌓는다.
 */

var LOG_SHEET = '인트라넷_기록';
var WRITABLE = ['담당자', '단계', '가능성', '최근연락일', '리터치일정', '1차상담내용', '다음액션플랜', '계약금액', '메모'];
var MAX_UPDATES = 1000;
var MAX_VALUE_LENGTH = 5000; // 상담 내용을 이어 붙여 쌓는 칸이 있어서 넉넉하게

function norm_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
}

function digits_(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 토큰 비교는 길이가 같을 때 모든 글자를 끝까지 비교한다.
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function columnLetter_(index) {
  var n = index + 1;
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 시트에 문자열을 쓸 때 '='로 시작하면 수식이 되어 버리므로 앞에 작은따옴표를 붙여 글자로 저장한다.
function safeText_(v) {
  var s = String(v == null ? '' : v);
  return s.charAt(0) === '=' ? "'" + s : s;
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getDataSheet_(ss) {
  var name = PropertiesService.getScriptProperties().getProperty('SHEET_NAME');
  var sheet = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  if (!sheet) throw new Error('데이터 탭을 찾지 못했습니다');
  return sheet;
}

// '상호명'과 ('연락처' 또는 '날짜')가 있는 첫 행을 헤더로 본다. 맨 위의 메모·연도 구분 행은 건너뛴다.
function findHeader_(data) {
  for (var r = 0; r < data.length; r++) {
    var cells = data[r].map(norm_);
    if (cells.indexOf('상호명') >= 0 && (cells.indexOf('연락처') >= 0 || cells.indexOf('날짜') >= 0)) {
      var cols = {};
      cells.forEach(function (name, c) {
        if (name && cols[name] === undefined) cols[name] = c;
      });
      return { row: r + 1, cols: cols };
    }
  }
  return null;
}

/**
 * 설정 도우미: 편집기에서 이 함수를 실행하면 임의의 긴 토큰을 만들어 스크립트 속성 TOKEN 에 저장하고
 * 실행 로그에 보여 준다. 이미 있으면 새로 만들지 않고 그대로 보여 준다(잃어버렸을 때도 다시 실행하면 된다).
 * 이 값을 Vercel 의 SHEET_SCRIPT_TOKEN 에 똑같이 넣는다.
 */
function setupToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('TOKEN = ' + token);
  return token;
}

function doGet() {
  return json_({ ok: true, service: 'sheet-bridge' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || !safeEqual_(String(body.token || ''), token)) return json_({ ok: false, error: 'unauthorized' });

    var ss = getSpreadsheet_();
    var sheet = getDataSheet_(ss);
    if (body.action === 'read') return json_(read_(ss, sheet));
    if (body.action === 'update') return json_(update_(ss, sheet, body));
    return json_({ ok: false, error: 'bad_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String((err && err.message) || err).slice(0, 200) });
  }
}

function read_(ss, sheet) {
  return {
    ok: true,
    values: sheet.getDataRange().getDisplayValues(),
    sheetName: sheet.getName(),
    sheetUrl: ss.getUrl(),
    gid: sheet.getSheetId(),
    readAt: new Date().toISOString()
  };
}

function update_(ss, sheet, body) {
  var updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > MAX_UPDATES) return { ok: false, error: 'bad_updates' };
  var user = String(body.user || '').slice(0, 60);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = sheet.getDataRange().getDisplayValues();
    var header = findHeader_(data);
    if (!header) return { ok: false, error: 'no_header' };
    var cols = header.cols;
    var stampCol = cols[norm_('날짜')];
    var phoneCol = cols[norm_('연락처')];
    if (stampCol === undefined || phoneCol === undefined) return { ok: false, error: 'no_key_columns' };

    var formulaCache = {};
    function formulaAt(col, row) {
      if (!formulaCache[col]) formulaCache[col] = sheet.getRange(1, col + 1, data.length, 1).getFormulas();
      return String((formulaCache[col][row - 1] || [''])[0] || '');
    }

    var results = [];
    var groups = {}; // '칸|새 값' -> 같은 값으로 쓸 셀들
    var seen = {};
    var logs = [];

    updates.forEach(function (u, index) {
      var fail = function (reason) {
        results.push({ index: index, ok: false, reason: reason });
        logs.push([user, u && u.row, u && u.stamp, u && u.col, u && u.expect, u && u.value, reason]);
      };
      if (!u || typeof u !== 'object') return fail('bad_update');
      var colName = norm_(u.col);
      if (WRITABLE.map(norm_).indexOf(colName) < 0) return fail('not_writable');
      var col = cols[colName];
      if (col === undefined) return fail('no_column');
      var row = Number(u.row);
      if (!isFinite(row) || row % 1 !== 0 || row <= header.row || row > data.length) return fail('bad_row');
      var value = String(u.value == null ? '' : u.value);
      if (value.length > MAX_VALUE_LENGTH) return fail('too_long');

      var cells = data[row - 1];
      if (String(cells[stampCol]).trim() !== String(u.stamp == null ? '' : u.stamp).trim() || digits_(cells[phoneCol]) !== digits_(u.phone)) return fail('row_moved');
      if (String(cells[col]).trim() !== String(u.expect == null ? '' : u.expect).trim()) return fail('conflict');
      if (formulaAt(col, row).charAt(0) === '=') return fail('formula');
      var dup = colName + '|' + row;
      if (seen[dup]) return fail('duplicate');
      seen[dup] = true;

      var key = col + '|' + value;
      if (!groups[key]) groups[key] = { col: col, value: value, rows: [] };
      groups[key].rows.push(row);
      results.push({ index: index, ok: true });
      logs.push([user, row, String(cells[stampCol]), u.col, String(cells[col]), value, 'ok']);
    });

    // 같은 칸에 같은 값으로 쓰는 셀들은 한 번에 쓴다(담당자 일괄 배정이 빠르다).
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var a1 = g.rows.map(function (row) { return columnLetter_(g.col) + row; });
      sheet.getRangeList(a1).setValue(safeText_(g.value));
    });

    appendLog_(ss, logs);
    return { ok: true, results: results };
  } finally {
    lock.releaseLock();
  }
}

function appendLog_(ss, logs) {
  if (!logs.length) return;
  var sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.getRange(1, 1, 1, 8).setValues([['시각', '사용자', '행', '날짜', '칸', '이전 값', '새 값', '결과']]);
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var rows = logs.map(function (l) {
    return [now, safeText_(l[0]), l[1] == null ? '' : l[1], safeText_(l[2]), safeText_(l[3]), safeText_(l[4]), safeText_(l[5]), l[6]];
  });
  var start = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(start, 1, rows.length, 8).setValues(rows);
}

// Apps Script 에서는 module 이 없어서 무시된다. 로컬 테스트에서만 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { doGet: doGet, doPost: doPost, setupToken: setupToken, findHeader_: findHeader_, columnLetter_: columnLetter_ };
}
