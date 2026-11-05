// Apps Script(Code.gs)를 Node에서 그대로 실행하기 위한 가짜 구글 환경. 실행: node test/gas-test.cjs
const vm = require("vm"), fs = require("fs");
const CODE = require("path").join(__dirname, "..", "Code.gs");

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getFormulas() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => (this.sheet.formulas[`${this.r + i},${this.c + j}`] || ""))); }
  getDisplayValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.get(this.r + i, this.c + j))); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sheet.set(this.r + i, this.c + j, x))); }
}
class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows.map(r => r.slice()); this.formulas = {}; this.calls = { rangeList: 0, setValue: 0 }; this.raw = {}; }
  get(r, c) { return (this.rows[r - 1] && this.rows[r - 1][c - 1]) ?? ""; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(""); row[c - 1] = String(v).startsWith("'") ? String(v).slice(1) : String(v); }
  getName() { return this.name; }
  getSheetId() { return 42; }
  getLastRow() { return this.rows.length; }
  getDataRange() { const w = Math.max(...this.rows.map(r => r.length), 0); return new FakeRange(this, 1, 1, this.rows.length, w); }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  getRangeList(a1s) {
    this.calls.rangeList++;
    const sheet = this;
    return {
      setValue(v) {
        sheet.calls.setValue += a1s.length;
        for (const a1 of a1s) {
          const m = a1.match(/^([A-Z]+)(\d+)$/);
          let col = 0;
          for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
          sheet.set(Number(m[2]), col, v);
          sheet.raw[a1] = v;
        }
      },
    };
  }
}
function makeEnv(rows, { token = "secret-token", activeNull = false, spreadsheetId = null } = {}) {
  const data = new FakeSheet("문의", rows);
  const sheets = [data];
  let locks = 0;
  let active = data;
  const ss = {
    getSheets: () => sheets,
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: (n, idx) => { const s = new FakeSheet(n, []); sheets.splice(idx ?? sheets.length, 0, s); active = s; return s; }, // 실제 구글처럼 새 탭이 활성 시트가 된다
    getActiveSheet: () => active,
    setActiveSheet: s => { active = s; return s; },
    getUrl: () => "https://docs.google.com/spreadsheets/d/FAKE/edit",
  };
  const ctx = {
    module: { exports: {} }, console,
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === "BRIDGE_TOKEN" ? token : k === "BRIDGE_SPREADSHEET_ID" ? spreadsheetId : null), setProperty: (k, v) => { if (k === "BRIDGE_TOKEN") token = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() {} }) },
    Utilities: { formatDate: () => "2026-11-06 10:00:00", getUuid: () => require("crypto").randomUUID() },
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => (activeNull ? null : ss), openById: () => ss }, // activeNull: 시트에 붙지 않은 독립 프로젝트
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, "utf8"), ctx);
  const call = body => JSON.parse(ctx.module.exports.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }).text);
  return { data, ss, sheets, call, locks: () => locks, active: () => active, exports: ctx.module.exports, doPost: ctx.module.exports.doPost };
}

// 실제 시트와 같은 모양: 메모 행, 연도 행, 헤더, 데이터(중간에 빈 행)
const HEADER = ["날짜", "상호명", "연락처", "이메일", "단계", "서비스 구분", "유입 경로", "예산", "문의", "문의 종류", "담당자", "가능성", "최근 연락일", "리터치 일정", "1차 상담 내용", "다음 액션 플랜", "계약 금액", "메모"];
function fixture(n = 6) {
  const rows = [["", "ㅂ부재중", ...Array(16).fill("")], ["2026", ...Array(17).fill("")], HEADER];
  for (let i = 0; i < n; i++) {
    const d = 1 + (i % 28);
    rows.push([`2026-03-${String(d).padStart(2, "0")} 10:${String(i % 60).padStart(2, "0")}`, `가짜브랜드${i}`, `010-1000-${String(2000 + i)}`, `f${i}@example.com`, "", "영상 제작", "홈페이지", "#N/A", "", "", i % 2 ? "김유진(Luna)" : "", "", "", "", "", "", "", ""]);
    if (i === 2) rows.push(Array(18).fill(""));   // 중간 빈 행
  }
  return rows;
}
module.exports = { makeEnv, fixture, HEADER };
