"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { captureDOMTextContext } from "@/lib/desktop/text-context-selection";
import { registerTextContextAdapter } from "@/lib/desktop/text-context-adapters";
import { nativeTextEdits } from "@/lib/desktop/native-text-edits";
import s from "./worldline.module.css";

/** docs/599 §3.1 / §12.6 / §13.7: the event body as paragraph blocks, one `<p>` per Markdown paragraph, source text
 * shown as typed (the 8px paragraph gap of the open card is kept, R4). React never renders its children: the DOM is
 * written once on mount, then only the browser (through execCommand) changes it, so undo, IME and the caret stay
 * native. Serialization tolerates bare text, `<br>` and `<div>`. */
export function serializeParagraphs(root: HTMLElement): string {
  const blocks: string[] = [];
  let loose = "";
  const flush = () => { if (loose) { blocks.push(loose); loose = ""; } };
  for (const n of [...root.childNodes]) {
    if (n.nodeType === Node.TEXT_NODE) { loose += n.textContent ?? ""; continue; }
    if (!(n instanceof HTMLElement)) continue;
    if (n.tagName === "BR") { loose += "\n"; continue; }
    flush();
    blocks.push(n.innerText.replace(/\n$/, ""));
  }
  flush();
  return blocks.join("\n\n").replace(/\s+$/, "");
}
function writeParagraphs(root: HTMLElement, value: string) {
  root.replaceChildren(...(value ? value.split(/\n{2,}/) : [""]).map((t) => {
    const p = root.ownerDocument.createElement("p");
    if (t) p.textContent = t; else p.append(root.ownerDocument.createElement("br"));
    return p;
  }));
}
/** Paste plain text: blank lines start new paragraphs, single newlines stay line breaks. All through execCommand. */
export function pasteParagraphs(doc: Document, text: string) {
  const paras = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  paras.forEach((para, i) => {
    if (i > 0) doc.execCommand("insertParagraph");
    para.split("\n").forEach((line, j) => {
      if (j > 0) doc.execCommand("insertLineBreak");
      if (line) doc.execCommand("insertText", false, line);
    });
  });
}

export function ParagraphEditor({ value, onChange, onLeave }: { value: string; onChange(v: string): void; onLeave(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cleanups = useRef<(() => void)[]>([]);
  useEffect(() => () => { for (const c of cleanups.current.splice(0)) c(); }, []);
  const change = useRef(onChange);
  change.current = onChange;
  useLayoutEffect(() => {
    const root = ref.current!;
    writeParagraphs(root, value);
    root.toggleAttribute("data-empty", !value);
    root.ownerDocument.execCommand("defaultParagraphSeparator", false, "p");
    root.focus({ preventScroll: true });
    // Cmd+B / Cmd+I would write <b> / <i>; the body is Markdown source text (React's onBeforeInput is textInput only).
    const noFormat = (e: InputEvent) => { if (e.inputType.startsWith("format")) e.preventDefault(); };
    root.addEventListener("beforeinput", noFormat);
    cleanups.current.push(() => root.removeEventListener("beforeinput", noFormat));
    const sel = root.ownerDocument.getSelection();
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root.lastElementChild ?? root);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // docs/598 text commands: only paste is ours (paragraph split); copy, cut, select all, undo and redo stay default.
  useEffect(() => {
    const edits = nativeTextEdits(document, () => window.desktop!.readClipboardText());
    const remove = registerTextContextAdapter({
      capture(target) {
        const root = ref.current;
        if (!root || !root.contains(target)) return null;
        const base = captureDOMTextContext(root, {
          readText: () => window.desktop!.readClipboardText(),
          writeText: (t) => window.desktop!.writeClipboardText(t),
          nativeEdit: edits.run,
        });
        return {
          ...base,
          async execute(id, assertCurrent) {
            if (id !== "text.paste" && id !== "text.pastePlain") return base.execute(id, assertCurrent);
            assertCurrent();
            const text = await window.desktop!.readClipboardText();
            base.restore();
            assertCurrent();
            pasteParagraphs(document, text);
          },
        };
      },
    });
    return () => { remove(); edits.dispose(); };
  }, []);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="事实正文"
      data-paragraph-editor=""
      data-placeholder="客观发生的事实"
      className={s.edParagraphs}
      onInput={(e) => { const root = e.currentTarget, v = serializeParagraphs(root); root.toggleAttribute("data-empty", !v); change.current(v); }}
      onPaste={(e) => { e.preventDefault(); pasteParagraphs(document, e.clipboardData.getData("text/plain")); }}
      onDrop={(e) => { e.preventDefault(); const t = e.dataTransfer.getData("text/plain"); if (t) pasteParagraphs(document, t); }}
      // Leaving for a button of the same card (保存, a picker) keeps the editor until that click is done; otherwise the
      // body re-renders as Markdown, the card height changes and the click lands elsewhere.
      onBlur={(e) => {
        const to = e.relatedTarget as Element | null, root = e.currentTarget;
        if (root.contains(to)) return;
        if (to && root.closest("[data-editing]")?.contains(to)) { to.addEventListener("click", () => setTimeout(() => { if (!root.contains(document.activeElement)) onLeave(); }), { once: true }); return; }
        onLeave();
      }}
    />
  );
}
