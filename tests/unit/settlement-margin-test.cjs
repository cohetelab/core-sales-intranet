const { load } = require("../support/run.cjs");
const m = load("settlement-margin");
let fail = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "✓" : "✗"} ${n}${x ? "  " + x : ""}`); if (!c) fail++; };

// 한 건: 계약대금 2,000,000 · 지급 800,000 → 순수익 1,200,000 → 60%
const one = m.marginOf([{ amount: 800000, contractAmount: 2000000 }]);
ok("한 건: 순수익 1,200,000 · 마진율 60%", one.profit === 1200000 && one.rate === 60 && one.pricedCount === 1 && one.contract === 2000000 && one.cost === 800000, JSON.stringify(one));

// 여러 건: 합계로 계산(건별 마진율의 평균이 아니다)
const many = m.marginOf([{ amount: 800000, contractAmount: 2000000 }, { amount: 600000, contractAmount: 1000000 }, { amount: 1000000, contractAmount: 800000 }]);
ok("여러 건: 순수익 1,400,000 ÷ 계약대금 3,800,000 = 36.8%", many.profit === 1400000 && many.contract === 3800000 && many.rate === 36.8, JSON.stringify(many));
ok("가중 평균: 건별 마진율(60·40·-25)의 단순 평균(25%)이 아님", many.rate !== 25);

// 계약대금을 입력하지 않은 건은 제외
const mixed = m.marginOf([{ amount: 800000, contractAmount: 2000000 }, { amount: 500000 }]);
ok("계약대금 없는 건은 지급액이 있어도 제외(60% 유지) · 입력 건수 1", mixed.rate === 60 && mixed.pricedCount === 1 && mixed.cost === 800000, JSON.stringify(mixed));

// 손실
const loss = m.marginOf([{ amount: 1000000, contractAmount: 800000 }]);
ok("지급이 계약대금보다 크면 음수 마진율(-25%)", loss.profit === -200000 && loss.rate === -25);

// 계산할 수 없는 경우
ok("한 건도 입력하지 않으면 마진율 null · 순수익 0", (() => { const r = m.marginOf([{ amount: 100 }]); return r.rate === null && r.profit === 0 && r.pricedCount === 0; })());
ok("빈 목록도 null", m.marginOf([]).rate === null);
ok("계약대금이 0원이면 마진율 null(0으로 나누지 않음) · 순수익은 음수", (() => { const r = m.marginOf([{ amount: 500000, contractAmount: 0 }]); return r.rate === null && r.profit === -500000 && r.pricedCount === 1; })());
ok("지급액 0원이면 마진율 100%", m.marginOf([{ amount: 0, contractAmount: 100000 }]).rate === 100);

// 반올림: 소수 첫째 자리
ok("소수 첫째 자리 반올림(1/3 → 33.3%, 2/3 → 66.7%)", m.marginRate(1, 3) === 33.3 && m.marginRate(2, 3) === 66.7);
ok("marginRate: 계약대금 0 이하면 null", m.marginRate(5, 0) === null && m.marginRate(5, -10) === null);

// 표기
ok("표기: 퍼센트 · 음수 · 정수는 소수점 없이 · 계산 불가는 —", m.formatMargin(36.8) === "36.8%" && m.formatMargin(-25) === "-25%" && m.formatMargin(60) === "60%" && m.formatMargin(0) === "0%" && m.formatMargin(null) === "—");

// 같은 입력이면 같은 결과 · 입력을 바꾸지 않음
const input = [{ amount: 1, contractAmount: 3 }];
const copy = JSON.stringify(input);
m.marginOf(input);
ok("입력을 바꾸지 않음", JSON.stringify(input) === copy);

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
