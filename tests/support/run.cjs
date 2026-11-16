// lib/*.ts를 typescript API로 변환해 메모리에서 실행한다(저장소에 아무것도 쓰지 않음). 단위 테스트가 쓴다.
const path = require("path");
const fs = require("fs");
const ts = require("typescript");

const lib = path.join(__dirname, "../../lib");
const cache = {};

function load(name) {
  if (cache[name]) return cache[name].exports;
  const src = fs.readFileSync(path.join(lib, name + ".ts"), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  cache[name] = m;
  const req = (p) => (p.startsWith("./") ? load(p.slice(2)) : require(p));
  new Function("require", "module", "exports", out)(req, m, m.exports);
  return m.exports;
}

module.exports = { load };
