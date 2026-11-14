"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

export const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function KnowledgeEditor({ content, onChange, linkRequest }: { content: JSONContent; onChange: (body: JSONContent, text: string) => void; linkRequest?: { text: string; sequence: number } | null }) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), TaskList, TaskItem.configure({ nested: true })],
    content,
    immediatelyRender: false,
    editorProps: { attributes: { class: "knowledge-prose min-h-[400px] outline-none" } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON(), current.getText()),
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);
  useEffect(() => {
    if (editor && linkRequest) editor.chain().focus().insertContent({ type: "text", text: linkRequest.text }).run();
  }, [editor, linkRequest]);
  if (!editor) return null;
  const button = (label: string, action: () => void, active = false) => <button type="button" onClick={action} className={`rounded-md px-2 py-1 text-sm ${active ? "bg-violet-100 text-violet-800" : "hover:bg-neutral-100"}`}>{label}</button>;
  return <div className="rounded-xl border border-neutral-200 bg-white">
    <div className="flex flex-wrap gap-1 border-b border-neutral-200 p-2">
      {button("본문", () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph"))}
      {button("제목", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading"))}
      {button("• 목록", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {button("1. 목록", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {button("☑ 체크", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}
      {button("굵게", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {button("기울임", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {button("링크", () => {
        const url = window.prompt("링크 주소를 입력하세요", editor.getAttributes("link").href || "https://");
        if (url === null) return;
        if (!url.trim()) editor.chain().focus().unsetLink().run();
        else if (/^https?:\/\//i.test(url)) editor.chain().focus().setLink({ href: url }).run();
        else window.alert("http:// 또는 https:// 주소를 입력하세요.");
      }, editor.isActive("link"))}
    </div>
    <EditorContent editor={editor} className="px-5 py-6" />
  </div>;
}
