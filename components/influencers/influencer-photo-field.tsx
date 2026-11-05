"use client";

import * as React from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfluencerAvatar } from "@/components/influencers/influencer-avatar";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function isValidPhotoSource(value: string) {
  if (!value) return true;
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function resizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일을 선택해 주세요.");
  if (file.size > MAX_FILE_BYTES) throw new Error("5MB 이하 이미지를 선택해 주세요.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256
    );
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 200_000) throw new Error("저장할 이미지가 너무 큽니다. 다른 사진을 선택해 주세요.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function InfluencerPhotoField({
  id,
  handle,
  value,
  onChange,
}: {
  id: string;
  handle: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await resizePhoto(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진을 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>프로필 사진</Label>
      <div className="flex items-center gap-3">
        <InfluencerAvatar influencer={{ handle: handle || "?", profileImageUrl: isValidPhotoSource(value) ? value : "" }} className="size-12" />
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <Input
            id={id}
            type="url"
            className="min-w-40 flex-1"
            placeholder="https://... 사진 URL"
            value={value.startsWith("data:") ? "" : value}
            onChange={(event) => {
              setError("");
              onChange(event.target.value);
            }}
          />
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={selectFile} aria-label="프로필 사진 파일 선택" />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-4" /> {busy ? "처리 중" : "파일 선택"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="icon" aria-label="프로필 사진 제거" onClick={() => { onChange(""); setError(""); }}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {value.startsWith("data:") && <p className="text-xs text-muted-foreground">선택한 사진 파일이 저장됩니다.</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
