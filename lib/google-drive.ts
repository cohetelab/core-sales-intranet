import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const SESSION_COOKIE = "core-sales-google-drive";
export const STATE_COOKIE = "core-sales-google-drive-state";
export const SESSION_AGE = 60 * 60 * 24 * 30;

export function driveConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REDIRECT_URI &&
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID &&
    /^[a-f0-9]{64}$/i.test(process.env.GOOGLE_DRIVE_TOKEN_KEY ?? "") &&
    safeDriveId(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "") &&
    supabaseAdmin()
  );
}

export function driveRootId() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function tokenKey() {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("Invalid Google Drive token key");
  return Buffer.from(raw, "hex");
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function driveSession() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("google_drive_sessions")
    .select("id,email,refresh_token_ciphertext,expires_at")
    .eq("id", id).single();
  if (error || !data || Date.parse(data.expires_at) <= Date.now()) return null;
  return data as { id: string; email: string; refresh_token_ciphertext: string; expires_at: string };
}

export async function driveAccessToken() {
  const session = await driveSession();
  if (!session) return null;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
        refresh_token: decryptToken(session.refresh_token_ciphertext),
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const result = await response.json() as { access_token?: string };
    return result.access_token ?? null;
  } catch {
    return null;
  }
}

export function safeDriveId(value: string) {
  return /^[A-Za-z0-9_-]{10,256}$/.test(value);
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

export async function driveFile(token: string, id: string): Promise<DriveFile | null> {
  if (!safeDriveId(id)) return null;
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", "id,name,mimeType,parents,webViewLink,modifiedTime");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<DriveFile>;
}

export async function folderPath(token: string, folderId: string) {
  const root = driveRootId();
  if (!safeDriveId(root) || !safeDriveId(folderId)) return null;
  const reversed: DriveFile[] = [];
  const seen = new Set<string>();
  let id = folderId;
  for (let depth = 0; depth < 32; depth++) {
    if (seen.has(id)) return null;
    seen.add(id);
    const file = await driveFile(token, id);
    if (!file || file.mimeType !== "application/vnd.google-apps.folder") return null;
    reversed.push(file);
    if (id === root) return reversed.reverse();
    id = file.parents?.[0] ?? "";
    if (!safeDriveId(id)) return null;
  }
  return null;
}
