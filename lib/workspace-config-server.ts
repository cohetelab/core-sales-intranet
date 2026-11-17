import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeConfig, type TeamDoc } from "@/lib/workspace-config";

// 팀 공용 화면 설정을 저장한다. Supabase Storage의 비공개 버킷에 JSON 파일 하나로 두어서, 테이블을 따로 만들 필요가 없다
// (서버용 키는 Storage 접근 정책을 모두 우회하므로 이 서버에서만 읽고 쓴다). 버킷은 처음 쓸 때 자동으로 만든다.
// 개발·테스트에서는 WORKSPACE_CONFIG_FILE 로 파일에 저장할 수 있다(운영에서는 쓰지 않는다).

const BUCKET = "core-sales-config";
const OBJECT = "workspace-config.json";

export type Backend = "supabase" | "file" | "none";

export function backendKind(): Backend {
  if (process.env.NODE_ENV !== "production" && process.env.WORKSPACE_CONFIG_FILE) return "file";
  return supabaseAdmin() ? "supabase" : "none";
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

// 저장된 값이 우리 모양인지 확인하고, 설정은 다시 검증해서(깨진 값·모르는 카드 제거) 돌려준다.
function parseDoc(text: string): TeamDoc | null {
  try {
    const d = JSON.parse(text) as Partial<TeamDoc>;
    if (!d || typeof d.version !== "number" || !Number.isFinite(d.version) || d.version < 1 || !d.config) return null;
    return { version: Math.floor(d.version), updatedAt: String(d.updatedAt ?? ""), updatedBy: String(d.updatedBy ?? ""), config: normalizeConfig(d.config) };
  } catch {
    return null;
  }
}

let bucketReady = false;
async function ensureBucket(sb: NonNullable<ReturnType<typeof supabaseAdmin>>) {
  if (bucketReady) return;
  const { error } = await sb.storage.createBucket(BUCKET, { public: false });
  // 이미 있으면 오류가 나므로 그대로 쓴다(오류 모양은 문서에 없어서 메시지·상태 코드를 느슨하게 본다).
  const msg = `${error?.message ?? ""} ${(error as { statusCode?: string } | null)?.statusCode ?? ""}`;
  if (!error || /already exists|duplicate|409/i.test(msg)) bucketReady = true;
}

export async function readDoc(): Promise<TeamDoc | null> {
  const kind = backendKind();
  if (kind === "file") {
    try {
      return parseDoc(await fs.readFile(process.env.WORKSPACE_CONFIG_FILE as string, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StoreError("read_failed");
    }
  }
  const sb = supabaseAdmin();
  if (!sb) throw new StoreError("not_configured");
  await ensureBucket(sb);
  const { data, error } = await sb.storage.from(BUCKET).download(OBJECT);
  if (error) {
    const msg = `${error.message ?? ""} ${(error as { statusCode?: string }).statusCode ?? ""}`;
    if (/not.?found|does not exist|404/i.test(msg)) return null; // 아직 저장된 적 없음
    throw new StoreError("read_failed");
  }
  return parseDoc(await data.text());
}

export async function writeDoc(doc: TeamDoc): Promise<void> {
  const kind = backendKind();
  const json = JSON.stringify(doc);
  if (kind === "file") {
    const file = process.env.WORKSPACE_CONFIG_FILE as string;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, json, "utf8");
    return;
  }
  const sb = supabaseAdmin();
  if (!sb) throw new StoreError("not_configured");
  await ensureBucket(sb);
  const { error } = await sb.storage.from(BUCKET).upload(OBJECT, Buffer.from(json, "utf8"), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new StoreError("write_failed");
}
