const { load } = require("../support/run.cjs");
const r = load("lead-retouch");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

const NOW = Date.parse("2026-11-23T03:00:00Z"); // KST 12:00
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString();
const stamp = (d) => { const k = new Date(NOW - d * 86_400_000 + 9 * 3_600_000).toISOString(); return `[${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)} Ian]`; };
let n = 0;
const mk = (o = {}) => ({
  id: `lead-${++n}`, company: o.company ?? `고객${n}`, category: o.category ?? "숏폼", website: "-", stage: o.stage ?? "lead", dealValueMonthly: 0, source: "inbound",
  owner: o.owner ?? "미배정", manager: "", email: "", phone: "", createdAt: o.createdAt ?? ago(90), lastActivityAt: o.lastActivityAt ?? o.createdAt ?? ago(90),
  nextStepDue: o.nextStepDue, contacts: [], activities: o.activities ?? [], tags: o.tags ?? ["문의DB", "홈페이지"], operationStatus: "not_started",
});
const closed = (reason, extra = {}) => mk({ ...extra, tags: ["문의DB", "홈페이지", "실패/종료"], activities: reason ? [{ type: "note", summary: "1차 상담 내용", detail: `${stamp(60)} (메모) 종료 사유: ${reason}`, at: ago(60) }] : [] });
const names = (rows) => rows.map((x) => x.customer.company).sort();
const F = r.DEFAULT_RETOUCH_FILTER;
const pool = (customers, over = {}) => r.retouchPool(customers, { ...F, ...over }, NOW);

// 기본: 60일 이상 · 마지막 움직임 30일 이상
const base = [
  mk({ company: "옛고객", createdAt: ago(90) }),
  mk({ company: "한달전고객", createdAt: ago(40) }),
  mk({ company: "방금고객", createdAt: ago(2) }),
];
ok("기본 조건: 문의 60일 이상만(90일 전 1건)", names(pool(base)).join() === "옛고객", names(pool(base)).join());
ok("문의 30일 이상으로 넓히면 40일 전 고객도", names(pool(base, { minAgeDays: 30 })).join() === "옛고객,한달전고객");
ok("최대 경과일: 60~120일 사이만", names(pool([mk({ company: "A", createdAt: ago(70) }), mk({ company: "B", createdAt: ago(200) })], { maxAgeDays: 120 })).join() === "A");

// 계약된 고객 · 진행 중인 고객 제외
ok("계약(성사)된 고객은 제외", pool([mk({ stage: "won" })]).length === 0);
ok("최근에 움직인 고객(문의는 옛날이어도 재문의·기록)은 제외", pool([mk({ createdAt: ago(100), lastActivityAt: ago(5) })]).length === 0);
ok("최근에 상담 기록이 남은 고객도 제외(방치 기간 기준)", pool([mk({ createdAt: ago(100), activities: [{ type: "note", summary: "1차 상담 내용", detail: `${stamp(3)} (전화) 통화`, at: ago(3) }] })]).length === 0);
ok("앞으로 리터치 일정이 잡힌 고객은 이미 진행 중이라 제외", pool([mk({ nextStepDue: new Date(NOW + 5 * 86_400_000).toISOString() })]).length === 0);
ok("지난 일정은 제외하지 않음", pool([mk({ nextStepDue: new Date(NOW - 20 * 86_400_000).toISOString() })]).length === 1);

// 종료 건: 포함 여부 · 사유별 제외
const cs = [closed("무응답", { company: "무응답종료" }), closed("시기", { company: "시기종료" }), closed("가격", { company: "가격종료" }), closed("경쟁사", { company: "경쟁사종료" }), closed(null, { company: "사유없음종료" }), closed("기타", { company: "기타종료" })];
ok("종료 건 포함: 가격·경쟁사 사유는 기본 제외(COLD 대신), 나머지와 사유 없는 건은 포함", names(pool(cs)).join() === "기타종료,사유없음종료,시기종료,무응답종료".split(",").sort().join(), names(pool(cs)).join());
ok("제외 사유를 비우면 가격·경쟁사도 포함", pool(cs, { excludeReasons: [] }).length === 6);
ok("종료 건 포함을 끄면 종료 건은 전부 빠짐", pool([...cs, mk({ company: "진행중" })], { includeClosed: false }).map((x) => x.customer.company).join() === "진행중");
const row = pool(cs).find((x) => x.customer.company === "시기종료");
ok("종료 건은 closed·reason이 채워짐", row.closed === true && row.reason === "시기");
ok("진행 중인 건은 closed=false · reason=null", pool(base)[0].closed === false && pool(base)[0].reason === null);
ok("종료 건은 리터치 일정이 남아 있어도 풀에 남김(일정은 종료 전의 것)", pool([closed("시기", { nextStepDue: new Date(NOW + 5 * 86_400_000).toISOString() })]).length === 1);

// 가능성
const pr = (p, c) => mk({ company: c, tags: ["문의DB", "홈페이지", ...(p === null ? [] : [`가능성 ${p}%`])] });
const ps = [pr(5, "낮음"), pr(40, "중간"), pr(80, "높음"), pr(null, "미기재")];
ok("가능성 하한 30%: 낮음 제외, 미기재는 유지", names(pool(ps, { minProbability: 30 })).join() === "높음,미기재,중간");
ok("가능성 하한이 없으면 전부", pool(ps).length === 4);
ok("probabilityOf: 태그에서 읽음 / 없으면 null", r.probabilityOf(pr(40, "x")) === 40 && r.probabilityOf(pr(null, "y")) === null);

// 서비스 · 미배정
const sv = [mk({ company: "숏폼고객", category: "숏폼" }), mk({ company: "인플고객", category: "인플루언서" }), mk({ company: "분류없음", category: "미분류" })];
ok("서비스 필터", names(pool(sv, { service: "인플루언서" })).join() === "인플고객" && names(pool(sv, { service: "미분류" })).join() === "분류없음");
const ow = [mk({ company: "배정됨", owner: "이익재(Ian)" }), mk({ company: "미배정고객", owner: "미배정" })];
ok("미배정만 보기", names(pool(ow, { unassignedOnly: true })).join() === "미배정고객" && pool(ow).length === 2);

// 정렬 · 계산값
const sorted = pool([mk({ company: "오래됨", createdAt: ago(200) }), mk({ company: "덜오래됨", createdAt: ago(70) })]);
ok("최근에 들어온 순으로 정렬", sorted.map((x) => x.customer.company).join() === "덜오래됨,오래됨");
ok("경과일 계산", sorted[0].ageDays === 70 && sorted[1].ageDays === 200);

// 문구
ok("리터치 문구: 상호·서비스를 넣음", r.retouchMessage("테스트컴퍼니", ["숏폼", "인플루언서"]) === "안녕하세요, 테스트컴퍼니 담당자님. 이전에 숏폼·인플루언서 관련해서 한 번 문의 주셔서 연락드렸었는데, 현재 필요하신 서비스는 없으실까요?");
ok("리터치 문구: 상호 미기재면 담당자님", r.retouchMessage("상호 미기재", []).startsWith("안녕하세요, 담당자님. 이전에 한 번 문의"));
ok("기본 필터: 가격·경쟁사 제외, 60일, 움직임 30일", F.minAgeDays === 60 && F.idleMinDays === 30 && F.excludeReasons.join() === "가격,경쟁사" && F.includeClosed === true);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
