import { NextResponse } from "next/server";
import { driveAccessToken, driveConfigured, driveRootId, folderPath, safeDriveId, type DriveFile } from "@/lib/google-drive";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!driveConfigured()) return NextResponse.json({ error: "setup" }, { status: 503, headers });
  const token = await driveAccessToken();
  if (!token) return NextResponse.json({ error: "connect" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const folderId = params.get("folder") || driveRootId();
  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const pageToken = params.get("pageToken") ?? "";
  if (!safeDriveId(folderId) || pageToken.length > 2048) return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  const path = await folderPath(token, folderId);
  if (!path) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });

  const driveUrl = new URL("https://www.googleapis.com/drive/v3/files");
  const escapedId = folderId.replaceAll("'", "\\'");
  const escapedQuery = query.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  driveUrl.searchParams.set("q", `'${escapedId}' in parents and trashed = false${query ? ` and name contains '${escapedQuery}'` : ""}`);
  driveUrl.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)");
  driveUrl.searchParams.set("pageSize", "100");
  driveUrl.searchParams.set("orderBy", "name");
  driveUrl.searchParams.set("supportsAllDrives", "true");
  driveUrl.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) driveUrl.searchParams.set("pageToken", pageToken);
  let response: Response;
  try {
    response = await fetch(driveUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502, headers });
  }
  if (!response.ok) return NextResponse.json({ error: response.status === 403 ? "forbidden" : "upstream" }, { status: response.status === 403 ? 403 : 502, headers });
  const result = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
  return NextResponse.json({
    path: path.map((file) => ({ id: file.id, name: file.name })),
    files: (result.files ?? []).sort((a, b) => Number(b.mimeType === "application/vnd.google-apps.folder") - Number(a.mimeType === "application/vnd.google-apps.folder")),
    nextPageToken: result.nextPageToken ?? null,
  }, { headers });
}
