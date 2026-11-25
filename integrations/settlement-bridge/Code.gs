/**
 * 코어 세일즈 인트라넷 ↔ 정산 시트 브리지 (Apps Script 웹 앱) — 읽기 전용
 *
 * 인트라넷 서버가 이 웹 앱을 호출해서 정산 시트의 한 탭을 읽는다. 시트에 쓰는 동작은 아예 없다(쓰기는 나중에 필요해지면 따로 만든다).
 * 시트 링크 공유를 "제한됨"으로 바꿔도 이 스크립트를 배포한 계정이 시트에 접근할 수 있으면 읽힌다.
 * 문의 시트 브리지(integrations/sheet-bridge)와 별개의 프로젝트에 붙이고, 토큰도 따로 쓴다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)
 *  - BRIDGE_SPREADSHEET_ID : 정산 시트 주소의 /d/ 와 /edit 사이 값 (필수)
 *  - BRIDGE_SHEET_NAME     : 읽을 탭 이름(없으면 첫 번째 탭)
 *  - BRIDGE_TOKEN          : setupToken 함수를 한 번 실행하면 만들어진다. 같은 값을 Vercel 의 SETTLEMENT_SCRIPT_TOKEN 에 넣는다.
 */

var MAX_ROWS = 20000;

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

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('BRIDGE_SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('시트를 찾지 못했습니다. 스크립트 속성 BRIDGE_SPREADSHEET_ID 에 시트 주소의 /d/ 와 /edit 사이 값을 넣어 주세요');
  return ss;
}

function getDataSheet_(ss) {
  var name = PropertiesService.getScriptProperties().getProperty('BRIDGE_SHEET_NAME');
  var sheet = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  if (!sheet) throw new Error('데이터 탭을 찾지 못했습니다');
  return sheet;
}

/**
 * 설정 도우미: 편집기에서 이 함수를 실행하면 임의의 긴 토큰을 만들어 스크립트 속성 BRIDGE_TOKEN 에 저장하고
 * 실행 로그에 보여 준다. 이미 있으면 새로 만들지 않고 그대로 보여 준다. 이 값을 Vercel 의 SETTLEMENT_SCRIPT_TOKEN 에 똑같이 넣는다.
 */
function setupToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BRIDGE_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('BRIDGE_TOKEN', token);
  }
  Logger.log('SETTLEMENT_SCRIPT_TOKEN 에 넣을 값 = ' + token);
  return token;
}

function doGet() {
  return json_({ ok: true, service: 'settlement-bridge' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('BRIDGE_TOKEN');
    if (!token || !safeEqual_(String(body.token || ''), token)) return json_({ ok: false, error: 'unauthorized' });
    if (body.action !== 'read') return json_({ ok: false, error: 'bad_action' });

    var ss = getSpreadsheet_();
    var sheet = getDataSheet_(ss);
    var values = sheet.getDataRange().getDisplayValues();
    if (values.length > MAX_ROWS) return json_({ ok: false, error: 'too_many_rows' });
    return json_({
      ok: true,
      values: values,
      sheetName: sheet.getName(),
      sheetUrl: ss.getUrl(),
      gid: sheet.getSheetId(),
      readAt: new Date().toISOString()
    });
  } catch (err) {
    var where = String((err && err.stack) || '').split('\n')[1] || '';
    return json_({ ok: false, error: 'server_error', message: (String((err && err.message) || err).slice(0, 140) + ' @' + where.trim()).slice(0, 200) });
  }
}

// Apps Script 에서는 module 이 없어서 무시된다. 로컬 테스트에서만 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { doGet: doGet, doPost: doPost, setupToken: setupToken };
}
