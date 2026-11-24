#!/usr/bin/env node
// Core Sales 인트라넷 자동 테스트 실행기.
//   node tests/run-all.cjs            전부(단위 + 브라우저)
//   node tests/run-all.cjs --unit     단위 테스트만(서버·브라우저 없이 몇 초)
//   node tests/run-all.cjs --e2e      브라우저 테스트만
//   node tests/run-all.cjs --only mine  이름에 'mine'이 들어간 테스트만
//
// 브라우저 테스트는 가짜 Apps Script 시트 서버(포트 4020)와 개발 서버(3010)를 직접 띄우고, 테스트마다 가짜 시트를 새로 만든다.
// 진짜 구글 시트·진짜 Slack에는 아무것도 보내지 않는다. 자세한 내용은 tests/README.md.
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const T = (...p) => path.join(__dirname, ...p);
const PORT = { app: 3010, sheet: 4020, slack: 4030, supa: 4040 };
const APP = `http://localhost:${PORT.app}`;
// 팀 공용 화면 설정은 테스트에서 파일에 저장한다(운영은 Supabase Storage). 테스트마다 비운다.
const CONFIG_FILE = T("out", "workspace-config.json");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const wantUnit = !flag("--e2e");
const wantE2e = !flag("--unit");

// ── 프로세스 도우미 ──
const children = new Set();
function start(script, env = {}, scriptArgs = []) {
  const p = spawn(process.execPath, [script, ...scriptArgs], { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore", windowsHide: true });
  children.add(p);
  p.on("exit", () => children.delete(p));
  return p;
}
function kill(p) {
  if (!p || p.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try { process.kill(-p.pid); } catch { try { p.kill(); } catch { /* 이미 종료 */ } }
  }
}
process.on("exit", () => children.forEach(kill));
process.on("SIGINT", () => process.exit(130));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portBusy = (port) => new Promise((ok) => { const s = net.connect(port, "127.0.0.1"); s.on("connect", () => { s.destroy(); ok(true); }); s.on("error", () => ok(false)); });
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* 아직 */ } await sleep(400); } return false; }

// ── 가짜 서버 ──
let sheetProc = null;
async function resetSheet() {
  fs.rmSync(CONFIG_FILE, { force: true, recursive: true });
  kill(sheetProc);
  await waitFor(async () => !(await portBusy(PORT.sheet)), 8000);
  sheetProc = start(T("support/fake-sheet-server.cjs"));
  if (!(await waitFor(() => fetch(`http://127.0.0.1:${PORT.sheet}/admin/dump`, { method: "POST", body: "{}" }).then((r) => r.ok), 15000))) throw new Error("가짜 시트 서버가 뜨지 않았습니다");
}
let slackProc = null;
let supaProc = null;
async function resetSupabase() {
  kill(supaProc);
  await waitFor(async () => !(await portBusy(PORT.supa)), 8000);
  supaProc = start(T("support/fake-supabase.cjs"));
  if (!(await waitFor(() => fetch(`http://127.0.0.1:${PORT.supa}/_log`).then((r) => r.ok), 15000))) throw new Error("가짜 Supabase 서버가 뜨지 않았습니다");
}
async function startSlack() {
  kill(slackProc);
  await waitFor(async () => !(await portBusy(PORT.slack)), 8000);
  slackProc = start(T("support/fake-slack.cjs"));
  if (!(await waitFor(() => fetch(`http://127.0.0.1:${PORT.slack}/_posts`).then((r) => r.ok), 15000))) throw new Error("가짜 Slack 서버가 뜨지 않았습니다");
}

// ── 개발 서버 ──
let appProc = null;
async function startApp(env, warm) {
  kill(appProc);
  await waitFor(async () => !(await portBusy(PORT.app)), 10000);
  appProc = start(path.join(ROOT, "node_modules/next/dist/bin/next"), env, ["dev", "-p", String(PORT.app)]);
  if (!(await waitFor(() => fetch(`${APP}/api/leads/session`).then((r) => r.ok), 120000))) throw new Error("개발 서버가 뜨지 않았습니다");
  for (const u of warm) await fetch(`${APP}${u}`).catch(() => {}); // 처음 열 때 컴파일이 오래 걸려 테스트가 흔들리지 않게 미리 연다
}

// ── 테스트 실행 ──
const results = [];
function run(group, file, fileArgs = []) {
  const name = path.basename(file, ".cjs") + (fileArgs.length ? ` ${fileArgs.join(" ")}` : "");
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file, ...fileArgs], { cwd: ROOT, encoding: "utf8", timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
  const ok = r.status === 0;
  results.push({ group, name, ok, ms: Date.now() - t0 });
  console.log(`${ok ? "✓" : "✗"} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  if (!ok) {
    const out = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter(Boolean);
    const bad = out.filter((l) => /✗|FAIL|Error|ECONN|Timeout/.test(l));
    console.log("    " + (flag("--verbose") ? out.slice(-40) : bad.length ? bad.slice(0, 8) : out.slice(-8)).join("\n    "));
  }
}

const list = (dir, suffix) => fs.readdirSync(T(dir)).filter((f) => f.endsWith(suffix)).sort().map((f) => T(dir, f));

(async () => {
  if (wantUnit) {
    console.log("\n== 단위 테스트");
    for (const f of list("unit", "-test.cjs")) run("unit", f);
  }

  if (wantE2e) {
    for (const p of Object.values(PORT)) if (await portBusy(p)) { console.error(`포트 ${p}를 이미 쓰는 프로세스가 있습니다. 끄고 다시 실행해 주세요.`); process.exit(2); }

    const sheetEnv = { SHEET_SCRIPT_URL: `http://127.0.0.1:${PORT.sheet}/exec`, SHEET_SCRIPT_TOKEN: "secret-token", LEADS_PASSCODE: "lead-pass", WORKSPACE_CONFIG_FILE: CONFIG_FILE };
    const slackEnv = { ...sheetEnv, CRON_SECRET: "test-cron-secret-1234567890" };
    const warm = ["/api/leads/session", "/api/leads/digest", "/api/cron/digest", "/", "/leads", "/pipeline", "/reports"];
    const sheetSuites = ["workspace", "workspace-team", "home", "mine", "closed", "cleanup", "retouch", "target", "won", "former", "record", "history", "response", "pipeline", "reports", "checks", "missing", "kanban"].map((n) => T("browser", `${n}-ui.cjs`));

    const groups = [
      { title: "시트 연동 화면", env: sheetEnv, items: sheetSuites.map((f) => [f]), sheet: true },
      { title: "Slack 알림 — 연결됨", env: { ...slackEnv, SLACK_WEBHOOK_URL: `http://127.0.0.1:${PORT.slack}/services/T000/B000/XXXX` }, items: [[T("browser/digest-ui.cjs"), "configured"]], sheet: true, slack: true },
      { title: "Slack 알림 — 연결 안 됨", env: slackEnv, items: [[T("browser/digest-ui.cjs"), "unconfigured"]], sheet: true, slack: true },
      { title: "Slack 알림 — 허용되지 않는 주소", env: { ...slackEnv, SLACK_WEBHOOK_URL: "https://evil.example.com/hook" }, items: [[T("browser/digest-ui.cjs"), "evil"]], sheet: true, slack: true },
      { title: "팀 공용 설정 — Supabase Storage(가짜 서버)", env: { ...sheetEnv, WORKSPACE_CONFIG_FILE: "", SUPABASE_URL: `http://127.0.0.1:${PORT.supa}`, SUPABASE_SECRET_KEY: "fake-secret-key" }, items: [[T("browser/workspace-team-ui.cjs")]], sheet: true, supabase: true },
      { title: "시트 설정이 없는 화면(샘플 화면)", env: {}, items: [[T("browser/local-home.cjs")], [T("browser/local-reports.cjs")], [T("browser/local-workspace.cjs")], [T("browser/kanban-ui.cjs"), "local"]], sheet: false },
    ];

    for (const g of groups) {
      const items = g.items.filter(([f, ...a]) => !only || path.basename(f, ".cjs").includes(only) || a.join(" ").includes(only));
      if (items.length === 0) continue;
      console.log(`\n== ${g.title}`);
      await startApp(g.env, g.sheet ? warm : ["/", "/reports", "/pipeline"]);
      if (g.slack) await startSlack();
      for (const [file, ...fileArgs] of items) {
        if (g.sheet) await resetSheet();
        if (g.supabase) await resetSupabase();
        run(g.title, file, fileArgs);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? ` · 실패: ${failed.map((r) => r.name).join(", ")}` : ""}`);
  children.forEach(kill);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  children.forEach(kill);
  process.exit(2);
});
