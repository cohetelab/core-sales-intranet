// 상담 히스토리: 시트의 '1차 상담 내용' 칸에 이어서 쌓이는 기록을 타임라인으로 나눈다.
// 한 기록은 "[11.06 14:30 Ian] (전화) 내용" 줄로 시작하고, 다음 기록 줄이 나오기 전까지의 줄은 같은 기록이다.
// 차수(1차·2차…)는 시트에 저장하지 않고 기록 순서로 계산한다. 그래서 기록을 지우지 않고 쌓기만 한다.

export const HISTORY_TYPES = ["전화", "이메일", "미팅", "메모"] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

export type HistoryEntry = {
  n: number; // 1부터, 기록 순서
  month: string;
  day: string;
  time: string; // HH:mm
  author: string;
  type: HistoryType | null;
  text: string;
};

export type History = {
  legacy: string; // 시각 표시가 붙기 전에 시트에 직접 적은 내용
  entries: HistoryEntry[];
};

const HEAD = /^\[(\d{2})\.(\d{2}) (\d{2}):(\d{2}) ([^\]\n]{1,40})\][ \t]?(.*)$/;
const TYPE = new RegExp(`^\\((${HISTORY_TYPES.join("|")})\\)\\s*`);

export function parseHistory(consult: string | undefined): History {
  const legacy: string[] = [];
  const raw: { month: string; day: string; time: string; author: string; lines: string[] }[] = [];

  for (const line of (consult ?? "").replace(/\r/g, "").split("\n")) {
    const m = line.match(HEAD);
    if (m) {
      raw.push({ month: m[1], day: m[2], time: `${m[3]}:${m[4]}`, author: m[5].trim(), lines: [m[6]] });
    } else if (raw.length) {
      raw[raw.length - 1].lines.push(line);
    } else {
      legacy.push(line);
    }
  }

  const entries: HistoryEntry[] = raw.map((r, i) => {
    let text = r.lines.join("\n").trim();
    const t = text.match(TYPE);
    if (t) text = text.slice(t[0].length);
    return { n: i + 1, month: r.month, day: r.day, time: r.time, author: r.author, type: t ? (t[1] as HistoryType) : null, text };
  });
  return { legacy: legacy.join("\n").trim(), entries };
}
