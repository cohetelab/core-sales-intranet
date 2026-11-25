#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { createBridge } = require('./deepseek-bridge-core.cjs');
const port = Number(process.env.DEEPSEEK_BRIDGE_PORT || 4743);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bridge port');
const { server, token } = createBridge({ token: process.env.DEEPSEEK_BRIDGE_TOKEN || undefined });
server.listen(port, '127.0.0.1', () => {
  console.log(`DeepSeek bridge: http://127.0.0.1:${port}`);
  console.log(`연결 코드: ${token}`);
  console.log('에이전트 → 루틴에서 연결 코드를 입력하세요. 종료하면 일회용 코드가 무효화됩니다.');
});
server.on('error', error => { console.error(`연결 서비스를 시작하지 못했습니다 (${error.code || 'error'}). 포트 사용 여부를 확인하세요.`); process.exitCode = 1; });