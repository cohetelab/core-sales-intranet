const { load } = require("../support/run.cjs");
const r = load("lead-response");
let fail = 0;
const ok = (n, cond, x = "") => { console.log(`${cond ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!cond) fail++; };

const kst = (s) => Date.parse(`${s}:00+09:00`); // "2026-11-10T09:00"
const NOW = kst("2026-11-10T18:00");
const iso = (s) => new Date(kst(s)).toISOString();
const act = (detail, o = {}) => ({ type: "note", summary: "1차 상담 내용", detail, ...o });
const mk = (o) => ({ id: "x", company: "x", owner: "이익재(Ian)", tags: [], activities: [], createdAt: iso("2026-11-10T09:00"), ...o });

// 시각 해석
let s = r.parseNoteStamps("[11.10 09:30 Ian] 통화", iso("2026-11-10T09:00"), NOW);
ok("기록 줄의 시각을 읽는다(09:30)", s.length === 1 && s[0] === kst("2026-11-10T09:30"));
s = r.parseNoteStamps("[11.10 09:30 Ian] a\n[11.10 10:15 Ian] b", iso("2026-11-10T09:00"), NOW);
ok("여러 줄 모두", s.length === 2);
s = r.parseNoteStamps("[01.02 10:00 Ian] 통화", iso("2026-12-30T09:00"), kst("2027-02-01T00:00"));
ok("연말 문의 → 연초 기록은 다음 해로 해석", s.length === 1 && s[0] === kst("2027-01-02T10:00"));
s = r.parseNoteStamps("[11.09 10:00 Ian] 통화", iso("2026-11-10T09:00"), NOW);
ok("문의보다 이른 기록은 (다음 해로 가도 미래라서) 버림", s.length === 0);
s = r.parseNoteStamps("[02.30 10:00 Ian] 통화", iso("2026-02-01T09:00"), kst("2026-03-01T00:00"));
ok("달력에 없는 날짜는 버림", s.length === 0);
s = r.parseNoteStamps("그냥 메모 11.10 09:30 [참고] 내용", iso("2026-11-10T09:00"), NOW);
ok("형식이 다르면 무시", s.length === 0);
s = r.parseNoteStamps("[11.10 09:30 Ian] a", "이상한값", NOW);
ok("문의 시각이 이상하면 빈 결과(안 터짐)", s.length === 0);

// 고객 단위
ok("첫 기록까지 30분", r.firstResponseMs(mk({ activities: [act("[11.10 09:30 Ian] 통화")] }), NOW) === 30 * 60000);
ok("가장 이른 기록을 쓴다", r.firstResponseMs(mk({ activities: [act("[11.10 12:00 Ian] b\n[11.10 09:10 Ian] a")] }), NOW) === 10 * 60000);
ok("기록 없음 → null", r.firstResponseMs(mk({}), NOW) === null);
ok("메모(상담 내용 아님)는 세지 않음", r.firstResponseMs(mk({ activities: [act("[11.10 09:30 Ian] 메모", { summary: "메모" })] }), NOW) === null);
ok("문의 접수(system)는 세지 않음", r.firstResponseMs(mk({ activities: [{ type: "system", summary: "문의 접수", detail: "[11.10 09:30 Ian]" }] }), NOW) === null);

// 통계
const list = [
  mk({ id: "a", activities: [act("[11.10 09:20 Ian] x")] }), // 20분
  mk({ id: "b", activities: [act("[11.10 11:00 Ian] x")] }), // 2시간
  mk({ id: "c", owner: "김세현(Connor)", activities: [act("[11.10 09:50 Connor] x")] }), // 50분
  mk({ id: "d", owner: "미배정", createdAt: iso("2026-11-08T09:00") }), // 기록 없음, 24시간 넘음
  mk({ id: "e", owner: "미배정", createdAt: iso("2026-11-10T17:00") }), // 기록 없음, 1시간 전
  mk({ id: "f", createdAt: iso("2026-08-01T09:00"), activities: [act("[08.01 09:05 Ian] x")] }), // 30일 밖
  mk({ id: "g", tags: ["실패/종료"], activities: [act("[11.10 09:05 Ian] x")] }), // 제외
];
const st = r.responseStats(list, NOW);
ok("최근 30일 문의 5건(30일 밖·실패 제외)", st.total === 5, String(st.total));
ok("측정 3건", st.measured === 3, String(st.measured));
ok("중앙값 50분", st.medianMs === 50 * 60000, String(st.medianMs));
ok("1시간 이내 2건 · 24시간 이내 3건", st.within1h === 2 && st.within24h === 3);
ok("24시간 넘게 첫 기록 없음 1건(d)", st.waiting24h === 1);
ok("담당별: Ian 2건(중앙값 70분) · Connor 1건 50분", st.byOwner.find((o) => o.owner === "이익재(Ian)").measured === 2 && st.byOwner.find((o) => o.owner === "이익재(Ian)").medianMs === 70 * 60000 && st.byOwner.find((o) => o.owner === "김세현(Connor)").medianMs === 50 * 60000, JSON.stringify(st.byOwner));
const empty = r.responseStats([], NOW);
ok("고객이 없으면 0·null(안 터짐)", empty.total === 0 && empty.medianMs === null && empty.byOwner.length === 0);

// 표기
ok("표기: 5분 · 1시간 · 2시간 10분 · 2일 · 1일 3시간 · -", ["5분", "1시간", "2시간 10분", "2일", "1일 3시간", "-"].join() === [5 * 60000, 3600000, 130 * 60000, 48 * 3600000, 27 * 3600000, null].map(r.formatDuration).join());
ok("hasStampedNote", r.hasStampedNote("[11.10 09:30 Ian] a") === true && r.hasStampedNote("그냥 메모") === false && r.hasStampedNote(undefined) === false);
ok("hasStampedNote 연속 호출에도 같은 결과(정규식 상태 없음)", r.hasStampedNote("[11.10 09:30 Ian] a") === true && r.hasStampedNote("[11.10 09:30 Ian] a") === true);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
