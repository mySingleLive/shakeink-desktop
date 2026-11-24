"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/components/content/api";
import type { CharacterRecord } from "@/components/content/types";
import { characterHoverInfo } from "@/components/chat/use-entity-index";
import s from "./worldline.module.css";

/** docs/599 R18 / §12.8: a person pill on an open card, hovered for 400ms, shows the character's short card (same fields
 * and timing as the chat EntityHoverCard). The state lives in this module's store, so showing or hiding it never
 * renders PlanningWorkspace or any card (WU-56c). */
const SHOW_MS = 400, HIDE_MS = 200, WIDTH = 264;
type State = { id: string; rect: DOMRect } | null;
let state: State = null, showTimer: ReturnType<typeof setTimeout> | null = null, hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const clear = () => { if (showTimer) clearTimeout(showTimer); if (hideTimer) clearTimeout(hideTimer); showTimer = hideTimer = null; };
export const characterHover = {
  enter(id: string, el: HTMLElement) {
    // No hover while the canvas pans (middle button / Space) or a drag runs.
    if (el.closest("[data-panning],[data-space]") || el.ownerDocument.querySelector("[data-panning]")) return;
    clear();
    showTimer = setTimeout(() => { state = { id, rect: el.getBoundingClientRect() }; emit(); }, SHOW_MS);
  },
  leave() { if (showTimer) clearTimeout(showTimer); showTimer = null; if (state) hideTimer = setTimeout(characterHover.close, HIDE_MS); },
  keep() { if (hideTimer) clearTimeout(hideTimer); hideTimer = null; },
  close() { clear(); if (state) { state = null; emit(); } },
  isOpen: () => !!state,
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function CharacterHoverCard({ novelId, onOpen }: { novelId: string; onOpen(id: string, name: string): void }) {
  const open = useSyncExternalStore(subscribe, () => state, () => null);
  // Loaded on the first hover only (§13.9), sharing CharactersPanel's query key.
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (open) setWanted(true); }, [open]);
  const q = useQuery({
    queryKey: ["characters", novelId],
    queryFn: () => apiGet<{ characters: CharacterRecord[] }>(`/api/novels/${novelId}/characters`, "加载角色失败"),
    enabled: wanted && !!novelId,
  });
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const h = ref.current.offsetHeight, r = open.rect;
    const below = r.bottom + 8;
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - WIDTH - 20)), top: below + h > innerHeight - 8 ? Math.max(8, r.top - 8 - h) : below });
  }, [open, q.data]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-character-pill]")) characterHover.close(); };
    const close = () => characterHover.close();
    document.addEventListener("pointerdown", down, true);
    addEventListener("scroll", close, true);
    addEventListener("wheel", close, { capture: true, passive: true });
    addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", down, true); removeEventListener("scroll", close, true); removeEventListener("wheel", close, true); removeEventListener("resize", close); };
  }, [open]);
  if (!open) return null;
  const rec = q.data?.characters.find((c) => c.id === open.id);
  const info = rec ? characterHoverInfo(rec) : null;
  // docs/599 acceptance 1: the content drawer is translated (DashboardShell / useSidebarDrawer), which makes it the
  // containing block of position: fixed; the card is rendered in <body> so viewport coordinates hold.
  return createPortal(
    <div ref={ref} role="tooltip" data-character-hover={open.id} className={s.charHover}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onPointerEnter={() => characterHover.keep()} onPointerLeave={() => characterHover.leave()}>
      {info ? (
        <>
          <div className={s.charHoverTop}>
            <span className={s.charHoverAvatar}>{info.avatarUrl ? <img src={info.avatarUrl} alt="" /> : info.name.slice(0, 1)}</span>
            <div className={s.charHoverText}><div className={s.charHoverName}>{info.name}</div><div className={s.charHoverRole}>{info.role}</div></div>
          </div>
          {info.blurb && <p className={s.charHoverBlurb}>{info.blurb}</p>}
          <button type="button" className={s.charHoverOpen} onClick={() => { characterHover.close(); onOpen(open.id, info.name); }}>打开角色卡 ›</button>
        </>
      ) : <span className={s.charHoverRole}>{q.isError ? "角色信息加载失败" : "加载中…"}</span>}
    </div>,
    document.body,
  );
}
