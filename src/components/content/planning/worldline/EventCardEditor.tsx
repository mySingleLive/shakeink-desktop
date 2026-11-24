"use client";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { EVENT_CATEGORIES, type PlanningData, type PlanningEvent } from "@/lib/planning/domain";
import type { Calendar } from "@/lib/planning/timeline";
import { CATEGORY_VAR, type CalendarAdapter } from "@/lib/planning/worldline-layout";
import { EventTimePicker } from "./EventTimePicker";
import { useFitPopover } from "./popover-fit";
import { ParagraphEditor } from "./ParagraphEditor";
import { IMPORTANCE_LABELS, WorldlineCardContext, timeText } from "./EventCard";
import s from "./worldline.module.css";

/** docs/599 §2: what the editing card needs from PlanningWorkspace (draft owner). */
export interface EventEditorValue {
  draft: PlanningEvent;
  setDraft(update: (d: PlanningEvent) => PlanningEvent): void;
  units: { start: number; duration: number; endMode: boolean };
  setUnits(p: Partial<{ start: number; duration: number; endMode: boolean }>): void;
  /** Validation / save error, shown in the save bar. */
  message: string;
  /** A note shown in the save bar (docs/599 §12.4: an unplaced child). */
  note: string;
  busy: boolean;
  anchors: readonly { id: string; title: string }[];
  calendar: Calendar;
  data: PlanningData;
  adapter: CalendarAdapter;
  characters: readonly { id: string; name: string; avatarUrl: string | null }[];
  /** Picker open in this card ("cat" | "imp" | "time" | "add" | "swap:<i>" | "who:<i>"), or null. */
  picker: string | null;
  setPicker(p: string | null): void;
  /** Card root (focus on entering edit; outside-click "inside"). */
  cardRef: RefObject<HTMLElement | null>;
  /** Select the title once after mount (a new child / event). */
  selectTitle: boolean;
  onSave(): void;
  onCancel(): void;
}

/** The head title as a same-size textarea (docs/599 §3; R4: line height and font from the h3). */
export function EditorTitle({ editor }: { editor: EventEditorValue }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!editor.selectTitle) return;
    const t = ref.current;
    t?.focus({ preventScroll: true });
    t?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={s.edTitle}
      aria-label="事件标题"
      placeholder="事件名称"
      value={editor.draft.title}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault(); }}
      onChange={(e) => { const title = e.target.value.replace(/\r?\n/g, " "); editor.setDraft((d) => ({ ...d, title })); }}
    />
  );
}

function usePickerTrigger(editor: EventEditorValue, key: string) {
  const ref = useRef<HTMLButtonElement>(null);
  const open = editor.picker === key;
  return {
    ref, open,
    toggle: () => editor.setPicker(open ? null : key),
    /** Close and give focus back to the trigger before the option unmounts (docs/599 §13.1). */
    close: () => { ref.current?.focus({ preventScroll: true }); editor.setPicker(null); },
  };
}
const Caret = () => <ChevronDown className={s.edCaret} aria-hidden />;
function Pop({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useFitPopover<HTMLDivElement>();
  return <div ref={ref} className={className} {...rest}>{children}</div>;
}

function CategoryPick({ editor }: { editor: EventEditorValue }) {
  const t = usePickerTrigger(editor, "cat");
  return (
    <span className={s.edPickHost}>
      <button ref={t.ref} type="button" data-card-tag="" className={`${s.tag} ${s.edPick}`} aria-label="事件类型" aria-haspopup="true" aria-expanded={t.open} onClick={t.toggle}>
        {editor.draft.category}<Caret />
      </button>
      {t.open && (
        <Pop role="listbox" aria-label="事件类型" className={s.edPop}>
          {EVENT_CATEGORIES.map((c) => (
            <button key={c} type="button" role="option" aria-selected={editor.draft.category === c} className={s.edItem}
              style={{ "--c": `var(${CATEGORY_VAR[c]})` } as React.CSSProperties}
              onClick={() => { editor.setDraft((d) => ({ ...d, category: c })); t.close(); }}>
              <i className={s.edSwatch} />{c}{editor.draft.category === c && <span className={s.edCheck}>✓</span>}
            </button>
          ))}
        </Pop>
      )}
    </span>
  );
}
function ImportancePick({ editor }: { editor: EventEditorValue }) {
  const t = usePickerTrigger(editor, "imp");
  return (
    <span className={s.edPickHost}>
      <button ref={t.ref} type="button" className={`${s.edPick} ${s.edPlain}`} aria-label="重要程度" aria-haspopup="true" aria-expanded={t.open} onClick={t.toggle}>
        {IMPORTANCE_LABELS[editor.draft.importance - 1]}<Caret />
      </button>
      {t.open && (
        <Pop role="radiogroup" aria-label="重要程度" className={s.edPop}>
          {IMPORTANCE_LABELS.map((l, i) => (
            <button key={l} type="button" role="radio" aria-checked={editor.draft.importance === i + 1} className={s.edItem}
              onClick={() => { editor.setDraft((d) => ({ ...d, importance: i + 1 })); t.close(); }}>
              <span className={s.edDotBox}><span className={`${s.dot} ${s[`i${i + 1}`]}`} /></span>{l}
              {editor.draft.importance === i + 1 && <span className={s.edCheck}>✓</span>}
            </button>
          ))}
        </Pop>
      )}
    </span>
  );
}
function TimePick({ editor }: { editor: EventEditorValue }) {
  const t = usePickerTrigger(editor, "time");
  const ctx = useContext(WorldlineCardContext)!;
  const text = timeText(editor.draft, { data: editor.data, adapter: editor.adapter, frozen: ctx.frozen });
  return (
    <span className={`${s.edPickHost} ${s.edWhenHost}`}>
      <button ref={t.ref} type="button" className={`${s.edPick} ${s.edWhen}`} aria-label="事件时间" title={text} aria-haspopup="true" aria-expanded={t.open} onClick={t.toggle}>
        <small data-card-time="" className={s.when}>{text}</small>
      </button>
      {t.open && <EventTimePicker editor={editor} preview={text} onDone={t.close} />}
    </span>
  );
}

/** A searchable character list (add, swap, key-change character). */
function CharacterList({ editor, label, current, taken, onPick }: { editor: EventEditorValue; label: string; current?: string; taken: ReadonlySet<string>; onPick(id: string): void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const rows = editor.characters.filter((c) => !q.trim() || c.name.includes(q.trim()));
  return (
    <Pop role="group" aria-label={label} className={`${s.edPop} ${s.edPopWide}`}>
      <input ref={ref} className={s.edSearch} aria-label="搜索角色" placeholder="搜索角色" value={q} onChange={(e) => setQ(e.target.value)} />
      <div role="listbox" aria-label={label}>
        {rows.map((c) => {
          const isCur = c.id === current, used = !isCur && taken.has(c.id);
          return (
            <button key={c.id} type="button" role="option" aria-selected={isCur} disabled={isCur || used} className={s.edItem} onClick={() => onPick(c.id)}>
              <span className={s.edAvatar}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</span>{c.name}
              {isCur && <span className={s.edCheck}>✓</span>}{used && <span className={s.edNote}>已参与</span>}
            </button>
          );
        })}
        {!rows.length && <div className={s.edEmpty}>没有可选的角色</div>}
      </div>
    </Pop>
  );
}

const newChange = (character: string) => ({ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), character, dimension: "境界", before: "", after: "", at: "end" as const });

/** docs/599 §3: the editing card body. Same boxes and classes as the open body (EventCard.tsx); every editable box
 * cancels its own padding so nothing moves (R4); ×, row-end buttons, pickers and the save bar are out of the flow. */
export function EventCardEditor({ editor, variant, renderRefs }: { editor: EventEditorValue; variant: "table" | "timeline"; renderRefs(): ReactNode }) {
  const d = editor.draft;
  const [factOpen, setFactOpen] = useState(false);
  const people = d.people.map((id) => editor.characters.find((c) => c.id === id) ?? { id, name: "未知角色", avatarUrl: null });
  const missing = { people: !d.people.length, change: !d.changes.length, fact: !d.fact && !factOpen };
  const addT = usePickerTrigger(editor, "add");
  const addPeopleT = usePickerTrigger(editor, "people");
  const first = editor.characters[0]?.id;
  return (
    <div className={`${s.body} ${s.edBody}`} data-variant={variant}>
      <div className={s.meta}>
        <CategoryPick editor={editor} />
        <TimePick editor={editor} />
        <ImportancePick editor={editor} />
        {(missing.people || missing.change || missing.fact) && (
          <span className={s.edPickHost}>
            <button ref={addT.ref} type="button" className={s.edAddMeta} aria-label="添加" aria-haspopup="true" aria-expanded={addT.open} onClick={addT.toggle}>
              <Plus size={11} strokeWidth={2.5} aria-hidden />
            </button>
            {addT.open && (
              <Pop role="group" aria-label="添加" className={`${s.edPop} ${s.edPopWide}`}>
                {missing.people && (
                  <>
                    <div className={s.edCap}>参与角色</div>
                    {editor.characters.map((c) => (
                      <button key={c.id} type="button" className={s.edItem} onClick={() => { editor.setDraft((x) => ({ ...x, people: [...new Set([...x.people, c.id])] })); addT.close(); }}>
                        <span className={s.edAvatar}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</span>{c.name}
                      </button>
                    ))}
                  </>
                )}
                {missing.people && (missing.change || missing.fact) && <div className={s.edSep} />}
                {missing.change && (
                  <button type="button" className={s.edItem} disabled={!first} onClick={() => { editor.setDraft((x) => ({ ...x, changes: [...x.changes, newChange(first!)] })); addT.close(); }}>＋ 角色转变</button>
                )}
                {missing.fact && <button type="button" className={s.edItem} onClick={() => { addT.close(); setFactOpen(true); }}>＋ 正文</button>}
              </Pop>
            )}
          </span>
        )}
      </div>
      {(d.fact || factOpen) && (
        <div className={s.fact}>
          {factOpen ? (
            <ParagraphEditor value={d.fact} onChange={(fact) => editor.setDraft((x) => ({ ...x, fact }))} onLeave={() => setFactOpen(false)} />
          ) : (
            <div data-markdown-preview="" role="textbox" aria-label="事实正文" tabIndex={0} className={s.edFactView}
              onClick={() => setFactOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); setFactOpen(true); } }}>
              <MarkdownPreview source={d.fact} />
            </div>
          )}
        </div>
      )}
      {people.length > 0 && (
        <div data-people="" className={s.people}>
          {people.map((c, i) => {
            const key = `swap:${i}`, open = editor.picker === key;
            return (
              <span key={c.id} className={`${s.who} ${s.edWho}`}>
                <button type="button" className={s.edWhoBtn} aria-label={`更换角色 ${c.name}`} aria-haspopup="true" aria-expanded={open}
                  onClick={() => editor.setPicker(open ? null : key)}>
                  <i>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</i>{c.name}
                </button>
                <button type="button" className={s.edX} aria-label={`移除${c.name}`} onClick={() => editor.setDraft((x) => ({ ...x, people: x.people.filter((p) => p !== c.id) }))}>
                  <X size={9} strokeWidth={2.5} aria-hidden />
                </button>
                {open && <CharacterList editor={editor} label="更换角色" current={c.id} taken={new Set(d.people)} onPick={(id) => { editor.setDraft((x) => ({ ...x, people: x.people.map((p, j) => (j === i ? id : p)) })); editor.setPicker(null); }} />}
              </span>
            );
          })}
          <span className={s.edPickHost}>
            <button ref={addPeopleT.ref} type="button" className={`${s.who} ${s.edAddWho}`} aria-label="添加参与角色" title="添加参与角色" aria-haspopup="true" aria-expanded={addPeopleT.open} onClick={addPeopleT.toggle}>
              <Plus size={12} strokeWidth={2.25} aria-hidden />
            </button>
            {addPeopleT.open && <CharacterList editor={editor} label="添加参与角色" taken={new Set(d.people)} onPick={(id) => { editor.setDraft((x) => ({ ...x, people: [...x.people, id] })); addPeopleT.close(); }} />}
          </span>
        </div>
      )}
      {d.changes.map((c, i) => {
        const last = i === d.changes.length - 1, key = `who:${i}`, open = editor.picker === key;
        const name = editor.characters.find((x) => x.id === c.character)?.name ?? "未知角色";
        const set = (patch: Partial<typeof c>) => editor.setDraft((x) => ({ ...x, changes: x.changes.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
        return (
          <div key={c.id} className={`${s.change} ${s.edChange} ${last ? s.edChangeLast : ""}`} data-change-row={i}>
            <span className={s.edPickHost}>
              <button type="button" className={s.edChangeWho} aria-label="变化角色" aria-haspopup="true" aria-expanded={open} onClick={() => editor.setPicker(open ? null : key)}>{name}</button>
              {open && <CharacterList editor={editor} label="变化角色" current={c.character} taken={new Set()} onPick={(id) => { set({ character: id }); editor.setPicker(null); }} />}
            </span>
            <input className={s.edInline} aria-label="维度" placeholder="维度" value={c.dimension} onChange={(e) => set({ dimension: e.target.value })} />
            <input className={s.edInline} aria-label="变化前" placeholder="变化前" value={c.before} onChange={(e) => set({ before: e.target.value })} />→
            <input className={s.edInline} aria-label="变化后" placeholder="变化后" value={c.after} onChange={(e) => set({ after: e.target.value })} />
            <span className={s.edTail}>
              <button type="button" aria-label="生效时机" onClick={() => set({ at: c.at === "start" ? "end" : "start" })}>{c.at === "start" ? "开始时" : "结束时"} ⇄</button>
              <button type="button" aria-label="移除角色转变" onClick={() => editor.setDraft((x) => ({ ...x, changes: x.changes.filter((_, j) => j !== i) }))}><X size={10} strokeWidth={2.5} aria-hidden /></button>
            </span>
            {last && (
              <button type="button" className={s.edAddChange} aria-label="新增角色转变" title="新增角色转变" disabled={!first}
                onClick={() => editor.setDraft((x) => ({ ...x, changes: [...x.changes, newChange(first!)] }))}>
                <Plus size={11} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </div>
        );
      })}
      {renderRefs()}
      <div className={s.edSaveBar}>
        {(editor.message || editor.note) && <span className={editor.message ? s.edMsg : s.edNoteMsg} role={editor.message ? "alert" : "status"}>{editor.message || editor.note}</span>}
        <button type="button" className={s.edGhost} onClick={editor.onCancel}>取消</button>
        <button type="button" className={s.edPrimary} disabled={editor.busy} onClick={editor.onSave}>保存</button>
      </div>
    </div>
  );
}
