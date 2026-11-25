// 크리에이터 정산의 마진율. 순수익 = 계약대금 − 지급 예정액(기타 비용 제외), 마진율 = 순수익 ÷ 계약대금.
// 계약대금을 입력한 건만 계산하고(입력 안 한 건은 지급액이 있어도 빼서 마진율이 부풀거나 줄지 않게 한다), 계약대금 합계가 0이면 마진율은 계산하지 않는다(null).

export type MarginRow = { amount: number; contractAmount?: number };

export type Margin = {
  pricedCount: number; // 계약대금을 입력한 건수
  contract: number; // 그 건들의 계약대금 합계
  cost: number; // 그 건들의 지급 예정액 합계
  profit: number; // 순수익 = contract − cost
  rate: number | null; // 마진율(%), 소수 첫째 자리까지. 계산할 수 없으면 null
};

export function marginOf(rows: readonly MarginRow[]): Margin {
  let pricedCount = 0;
  let contract = 0;
  let cost = 0;
  for (const r of rows) {
    if (r.contractAmount === undefined) continue;
    pricedCount++;
    contract += r.contractAmount;
    cost += r.amount;
  }
  const profit = contract - cost;
  return { pricedCount, contract, cost, profit, rate: contract > 0 ? Math.round((profit / contract) * 1000) / 10 : null };
}

export const marginRate = (profit: number, contract: number): number | null => (contract > 0 ? Math.round((profit / contract) * 1000) / 10 : null);

// 화면 표기: 38.1% · -12.5% · 계산할 수 없으면 —
export const formatMargin = (rate: number | null) => (rate === null ? "—" : `${rate.toLocaleString("ko-KR")}%`);
