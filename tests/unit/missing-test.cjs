const { load } = require("../support/run.cjs");
const { parseInquirySheet } = load("lead-sheet");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const ALL = ["날짜", "상호명", "연락처", "이메일", "단계", "서비스 구분", "유입 경로", "예산", "문의", "문의 종류", "담당자", "가능성", "최근 연락일", "리터치 일정", "1차 상담 내용", "다음 액션 플랜", "계약 금액", "메모"];
const csv = (header) => [header.join(","), "2026-11-01 10:00,상호,010-1111-0001"].join("\n");
const run = (header) => parseInquirySheet(csv(header));

let r = run(ALL);
ok("모든 칸이 있으면 누락 없음", r.ok && r.missing.length === 0, JSON.stringify(r.missing));

r = run(ALL.filter((h) => h !== "계약 금액"));
ok("계약 금액이 없으면 그 칸만 누락", r.ok && r.missing.length === 1 && r.missing[0].key === "contract" && r.missing[0].label === "계약 금액", JSON.stringify(r.missing.map((m) => m.key)));
ok("누락 안내에 영향과 알아보는 이름이 담김", r.missing[0].impact.includes("계약") && r.missing[0].accepts.includes("계약금액"));

r = run(ALL.map((h) => (h === "단계" ? "상태" : h)));
ok("열 이름이 바뀌면(단계→상태) 단계가 누락", r.missing.length === 1 && r.missing[0].key === "stage");

r = run(ALL.map((h) => (h === "상호명" ? "회사명" : h === "연락처" ? "전화번호" : h)));
ok("허용된 다른 이름(회사명·전화번호)은 누락이 아님", r.ok && r.missing.length === 0, JSON.stringify(r.missing.map((m) => m.key)));

r = run(ALL.map((h) => (h === "1차 상담 내용" ? "1차상담내용" : h === "리터치 일정" ? " 리터치  일정 " : h)));
ok("공백이 달라도 같은 칸으로 읽음", r.ok && r.missing.length === 0, JSON.stringify(r.missing.map((m) => m.key)));

r = run(ALL.filter((h) => !["이메일", "예산", "문의", "문의 종류"].includes(h)));
ok("없어도 되는 칸(이메일·예산·문의·문의 종류)은 알리지 않음", r.ok && r.missing.length === 0, JSON.stringify(r.missing.map((m) => m.key)));

r = run(ALL.filter((h) => !["계약 금액", "담당자", "단계", "메모"].includes(h)));
ok("여러 칸 누락: 4개", r.ok && r.missing.length === 4 && ["contract", "owner", "stage", "memo"].every((k) => r.missing.some((m) => m.key === k)), JSON.stringify(r.missing.map((m) => m.key)));

r = run(["상호명", "연락처"]);
ok("상호명·연락처만 있는 시트도 읽힘(나머지는 누락으로 알림)", r.ok && r.missing.length >= 10 && !r.missing.some((m) => m.key === "company"));
r = parseInquirySheet("이름,번호\n가,나");
ok("상호명이 없으면 기존처럼 오류", r.ok === false);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
