"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { resolveTime, type PlanningEvent } from "@/lib/planning/domain";
import { dayKnownAllowed, fitStrip, moveStrip, stripEnds, stripStep, timeUnits, wholeUnit, windowFromSentence, windowSentence, type StripEnds } from "@/lib/planning/event-time-strip";
import type { EventEditorValue } from "./EventCardEditor";
import { useFitPopover } from "./popover-fit";
import s from "./worldline.module.css";

/** docs/599 §4: time picker (review rounds 4–6). Two questions — 开始, 结束 (only for a known start) — each a choice and
 * one sentence; a live preview with a draggable strip on top. Same field rules as the old editor
 * (PlanningWorkspace renderEventEditor before docs/599), only the controls changed. Changes apply at once. */
const num = (v: number) => +v.toPrecision(12);
type StartKind = "exact" | "day" | "window" | "unknown";
const startKind = (d: PlanningEvent): StartKind => (d.time.kind === "window" && d.time.label === "仅同日" ? "day" : d.time.kind);
type EndKind = "point" | "duration" | "end" | "open" | "ongoing";
const endKind = (d: PlanningEvent, endMode: boolean): EndKind =>
  endMode && d.duration !== null && d.duration !== 0 ? "end" : d.ongoing ? "ongoing" : d.duration === null ? "open" : d.duration === 0 ? "point" : "duration";

/** docs/599 §4.4: themed number field; the native spin buttons are hidden (they covered the digits). */
export function NumberStepper({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange(v: number): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ value, onChange });
  live.current = { value, onChange };
  const step = (dir: number) => {
    const next = num((live.current.value || 0) + dir);
    live.current.onChange(min === undefined ? next : Math.max(min, next));
  };
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  const hold = (dir: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    ref.current?.focus({ preventScroll: true });
    step(dir);
    const tick = () => { step(dir); timer.current = setTimeout(tick, 60); };
    timer.current = setTimeout(tick, 400);
  };
  return (
    <span className={s.stepper}>
      <input ref={ref} type="number" inputMode="decimal" aria-label={label} min={min} value={Number.isFinite(value) ? num(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)); } }} />
      <span className={s.stepperSpin} aria-hidden>
        <button type="button" tabIndex={-1} onPointerDown={hold(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}><ChevronUp size={9} strokeWidth={3} /></button>
        <button type="button" tabIndex={-1} disabled={min !== undefined && value <= min} onPointerDown={hold(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}><ChevronDown size={9} strokeWidth={3} /></button>
      </span>
    </span>
  );
}

function UnitSelect({ label, value, units, onChange }: { label: string; value: number; units: { label: string; value: number }[]; onChange(v: number): void }) {
  return (
    <select className={s.edField} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {units.map((u) => <option key={u.label} value={u.value}>{u.label}</option>)}
    </select>
  );
}

/** docs/599 code review P2-2: Esc during a strip drag restores the values from before it (Escape layer 1). */
let activeStripDrag: (() => void) | null = null;
export const stripDrag = { active: () => !!activeStripDrag, cancel: () => { const c = activeStripDrag; activeStripDrag = null; c?.(); } };
/** The draggable strip (§4.3). The range is fixed while dragging and refits when the kind changes or a value leaves it. */
function TimeStrip({ editor }: { editor: EventEditorValue }) {
  const d = editor.draft, cal = editor.calendar;
  const ends = stripEnds(d, cal);
  const key = `${startKind(d)}/${endKind(d, editor.units.endMode)}`;
  const view = useRef<{ key: string; range: [number, number] } | null>(null);
  const drag = useRef<{ h: "s" | "e" | "m"; x: number; w: number; o: StripEnds; range: [number, number] } | null>(null);
  const [active, setActive] = useState<"s" | "e" | "m" | null>(null);
  const swallow = useRef(false);
  if (!ends) return <div className={s.strip}><span className={s.stripQ}>开始时间未定</span></div>;
  const v0 = view.current;
  if (!drag.current && (!v0 || v0.key !== key || ends.a < v0.range[0] || ends.b > v0.range[1])) view.current = { key, range: fitStrip(ends, cal) };
  const r = view.current!.range;
  const stepH = stripStep(r, cal, ends.kind);
  const pct = (v: number) => `${((v - r[0]) / (r[1] - r[0])) * 100}%`;
  const label = (v: number) => editor.adapter.label(v, stepH, stepH >= (timeUnits(cal)[1]?.value ?? Infinity) ? "day" : undefined);
  const apply = (patch: ReturnType<typeof moveStrip>) => {
    editor.setDraft((x) => ({
      ...x,
      time: { ...x.time, ...(patch.value !== undefined ? { value: patch.value } : {}), ...(patch.end !== undefined ? { end: patch.end } : {}) },
      ...(patch.duration !== undefined ? { duration: patch.duration } : {}),
    }));
    const v = patch.value ?? d.time.value;
    editor.setUnits({ start: wholeUnit(v, cal, editor.units.start), ...(patch.duration ? { duration: wholeUnit(patch.duration, cal, editor.units.duration) } : {}) });
  };
  const down = (h: "s" | "e" | "m") => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const strip = e.currentTarget.closest<HTMLElement>("[data-time-strip]")!;
    strip.setPointerCapture(e.pointerId);
    drag.current = { h, x: e.clientX, w: strip.getBoundingClientRect().width, o: ends, range: r };
    const before = { time: d.time, duration: d.duration }, units0 = { start: editor.units.start, duration: editor.units.duration };
    activeStripDrag = () => {
      drag.current = null;
      setActive(null);
      try { strip.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      editor.setDraft((x) => ({ ...x, time: before.time, duration: before.duration }));
      editor.setUnits(units0);
    };
    setActive(h);
  };
  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    apply(moveStrip(g.h, g.o, ((e.clientX - g.x) / g.w) * (g.range[1] - g.range[0]), stripStep(g.range, cal, g.o.kind)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    activeStripDrag = null;
    setActive(null);
    // The click that follows a drag must not close the picker or count as a click outside (§12.2).
    swallow.current = true;
    setTimeout(() => { swallow.current = false; });
  };
  const dot = (h: "s" | "e", v: number, name: string) => (
    <span role="slider" tabIndex={0} aria-label={name} aria-valuetext={label(v)} aria-valuenow={v}
      className={`${s.stripDot} ${active === h ? s.stripOn : ""}`} style={{ left: pct(v) }} onPointerDown={down(h)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        apply(moveStrip(h, ends, (e.key === "ArrowLeft" ? -1 : 1) * stepH * (e.shiftKey ? 10 : 1), stepH));
      }} />
  );
  const k = ends.kind;
  const tip = active ? (active === "e" ? ends.b : ends.a) : null;
  return (
    <div data-time-strip="" className={`${s.strip} ${active ? s.stripDrag : ""}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClickCapture={(e) => { if (swallow.current) { e.stopPropagation(); e.preventDefault(); } }}>
      <div className={s.stripAxis} />
      {(k === "window" || k === "day") && <div className={`${s.stripWin} ${s.stripMove}`} style={{ left: pct(ends.a), width: `calc(${pct(ends.b)} - ${pct(ends.a)})` }} onPointerDown={down("m")} title={k === "day" ? "拖动换一天" : "拖动整体移动"} />}
      {k === "span" && <div className={`${s.stripBar} ${s.stripMove}`} style={{ left: pct(ends.a), width: `calc(${pct(ends.b)} - ${pct(ends.a)})` }} onPointerDown={down("m")} title="拖动整体移动" />}
      {k === "open" && <div className={`${s.stripBar} ${s.stripFade}`} style={{ left: pct(ends.a), width: "40%" }} />}
      {k === "ongoing" && <div className={`${s.stripBar} ${s.stripArrow}`} style={{ left: pct(ends.a), right: 6 }} />}
      {k === "window" && <>{dot("s", ends.a, "时间窗口开始")}{dot("e", ends.b, "时间窗口结束")}</>}
      {k === "span" && <>{dot("s", ends.a, "开始时间")}{dot("e", ends.b, "结束时间")}</>}
      {k === "point" && dot("s", ends.a, "发生时间")}
      {(k === "open" || k === "ongoing") && dot("s", ends.a, "开始时间")}
      {tip === null ? (
        <><span className={`${s.stripLabel} ${s.stripL}`}>{label(Math.ceil(r[0] / stepH) * stepH)}</span><span className={`${s.stripLabel} ${s.stripR}`}>{label(Math.floor(r[1] / stepH) * stepH)}</span></>
      ) : (
        <span className={`${s.stripLabel} ${s.stripTip}`} style={{ left: pct(tip) }}>{active === "m" && ends.b > ends.a ? `${label(ends.a)} – ${label(ends.b)}` : label(tip)}</span>
      )}
    </div>
  );
}

export function EventTimePicker({ editor, preview, onDone }: { editor: EventEditorValue; preview: string; onDone(): void }) {
  const d = editor.draft, cal = editor.calendar, units = timeUnits(cal);
  // docs/599 acceptance 1: 取消 puts back the time (and the unit choices) from when the picker opened.
  const opened = useRef({ time: d.time, duration: d.duration, ongoing: d.ongoing, units: { ...editor.units } });
  const fit = useFitPopover<HTMLDivElement>();
  const cancel = () => {
    const o = opened.current;
    editor.setDraft((x) => ({ ...x, time: o.time, duration: o.duration, ongoing: o.ongoing }));
    editor.setUnits(o.units);
    onDone();
  };
  const sk = startKind(d), ek = endKind(d, editor.units.endMode);
  const set = (fn: (x: PlanningEvent) => PlanningEvent) => editor.setDraft(fn);
  const su = editor.units.start, du = editor.units.duration;
  const sign: 1 | -1 = d.time.value < 0 || (d.time.value === 0 && (d.time.end ?? 0) < 0) ? -1 : 1;
  const dayOk = dayKnownAllowed(cal);
  // Same rule as the old editor's updateTime: in 结束于 mode a new start keeps the end where it was.
  const setStartValue = (value: number) => set((x) => {
    const oldEnd = resolveTime(editor.data, x).end, next = { ...x, time: { ...x.time, value } };
    const start = resolveTime(editor.data, next).start;
    return editor.units.endMode && oldEnd !== null && start !== null ? { ...next, duration: oldEnd - start } : next;
  });
  const chooseStart = (k: StartKind) => {
    if (k === "day" && units[1] && !units.slice(1).some((u) => u.value === su)) editor.setUnits({ start: units[1].value });
    set((x) => ({
    ...x,
    time: { ...x.time, kind: k === "day" ? "window" : k, precision: k === "day" ? "day" : "hour", label: k === "day" ? "仅同日" : "",
      end: k === "window" || k === "day" ? x.time.value + (cal.hoursPerDay ?? 1) : null },
    }));
  };
  const chooseEnd = (g: "point" | "span" | "open") => {
    editor.setUnits({ endMode: false });
    set((x) => ({ ...x, ongoing: false, duration: g === "point" ? 0 : g === "open" ? null : x.duration || 1 }));
  };
  const anchorTitle = d.time.anchor ? editor.anchors.find((a) => a.id === d.time.anchor)?.title ?? "" : "";
  const epoch = cal.epoch || "故事开始";
  const anchor = (
    <>
      <select className={`${s.edField} ${s.edAnchor}`} aria-label="时间参考" value={d.time.anchor ?? ""} onChange={(e) => set((x) => ({ ...x, time: { ...x.time, anchor: e.target.value || null } }))}>
        <option value="">{epoch}</option>
        {editor.anchors.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select>
      {d.time.anchor && (
        <select className={s.edField} aria-label="参考边界" value={d.time.boundary} onChange={(e) => set((x) => ({ ...x, time: { ...x.time, boundary: e.target.value as "start" | "end" } }))}>
          <option value="start">开始</option><option value="end">结束</option>
        </select>
      )}
    </>
  );
  const flip = () => {
    if (sk === "window") { const w = windowSentence(d.time, su); set((x) => ({ ...x, time: { ...x.time, ...windowFromSentence((-w.sign) as 1 | -1, w.from, w.to, su) } })); }
    else setStartValue(-d.time.value);
  };
  const signBtn = <button type="button" className={s.edToggle} aria-label="之前或之后" onClick={flip}>{sign < 0 ? "前" : "后"}</button>;
  const startUnits = sk === "day" ? units.slice(1) : units;
  const unitSel = <UnitSelect label="开始时间单位" value={su} units={startUnits} onChange={(v) => editor.setUnits({ start: v })} />;
  let startBody: React.ReactNode;
  if (sk === "unknown") startBody = <p className={s.edHint}>还不知道什么时候发生，时间线上显示为“待定位”。</p>;
  else if (sk === "window") {
    const w = windowSentence(d.time, su);
    startBody = (<>
      <div className={s.edSay}>{anchor}{signBtn}
        <NumberStepper label="开始时间偏移" min={0} value={w.from} onChange={(v) => set((x) => ({ ...x, time: { ...x.time, ...windowFromSentence(w.sign, v, w.to, su) } }))} />至
        <NumberStepper label="窗口结束" min={0} value={w.to} onChange={(v) => set((x) => ({ ...x, time: { ...x.time, ...windowFromSentence(w.sign, w.from, v, su) } }))} />{unitSel}
      </div>
      <p className={s.edHint}>在这段时间内的某一刻发生，具体时刻不确定。</p>
    </>);
  } else startBody = (<>
    <div className={s.edSay}>{anchor}{signBtn}
      <NumberStepper label="开始时间偏移" min={0} value={Math.abs(d.time.value) / su} onChange={(v) => {
        const value = sign * Math.abs(v) * su;
        if (sk === "day") set((x) => ({ ...x, time: { ...x.time, value, end: value + (cal.hoursPerDay ?? 1) } }));
        else setStartValue(value);
      }} />{unitSel}
    </div>
    {sk === "day" && <p className={s.edHint}>只知道是哪一天，当天的具体时刻未知。</p>}
  </>);
  const endBase = d.time.anchor ? `${anchorTitle}${d.time.boundary === "end" ? "结束" : "开始"}` : epoch;
  const unitName = units.find((u) => u.value === su)?.label ?? "小时";
  return (
    <div ref={fit} role="group" aria-label="事件时间" className={`${s.edPop} ${s.timePop}`}>
      <div className={s.timePreview}>
        <div className={s.timePreviewRow}><b>{preview}</b>{sk !== "unknown" && <small>拖动圆点或线段修改</small>}</div>
        <TimeStrip editor={editor} />
      </div>
      <div className={s.timeSec}>
        <div className={s.timeHead}><b>开始</b>
          <div className={s.edSeg} role="radiogroup" aria-label="开始时间类型">
            {([["exact", "确定"], ["day", "只知道哪天"], ["window", "某段时间内"], ["unknown", "未定"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={sk === v} disabled={v === "day" && !dayOk} title={v === "day" ? "具体时刻未知" : undefined} onClick={() => chooseStart(v)}>{l}</button>
            ))}
          </div>
        </div>
        {startBody}
      </div>
      {sk === "exact" && (
        <div className={s.timeSec}>
          <div className={s.timeHead}><b>结束</b>
            <div className={s.edSeg} role="radiogroup" aria-label="事件持续类型">
              {([["point", "瞬间"], ["span", "持续一段时间"], ["open", "未定"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={(v === "span" && (ek === "duration" || ek === "end")) || (v === "open" && (ek === "open" || ek === "ongoing")) || v === ek} onClick={() => chooseEnd(v)}>{l}</button>
              ))}
            </div>
          </div>
          {ek === "point" && <p className={s.edHint}>一瞬间发生，没有持续时间。</p>}
          {ek === "duration" && (
            <div className={s.edSay}>持续
              <NumberStepper label="事件时长" min={0} value={(d.duration ?? 0) / du} onChange={(v) => set((x) => ({ ...x, duration: v * du }))} />
              <UnitSelect label="持续时间单位" value={du} units={units} onChange={(v) => editor.setUnits({ duration: v })} />
              <button type="button" className={s.edLink} onClick={() => editor.setUnits({ endMode: true })}>改填结束时间</button>
            </div>
          )}
          {ek === "end" && (
            <div className={s.edSay}>到 {endBase}{sign < 0 ? "前" : "后"}
              <NumberStepper label="结束时间点" value={Math.abs(d.time.value + (d.duration ?? 0)) / su} onChange={(v) => set((x) => ({ ...x, ongoing: false, duration: sign * v * su - x.time.value }))} />
              {unitName} 结束
              <button type="button" className={s.edLink} onClick={() => editor.setUnits({ endMode: false })}>改填时长</button>
            </div>
          )}
          {(ek === "open" || ek === "ongoing") && (<>
            <label className={s.edCheckRow}><input type="checkbox" checked={ek === "ongoing"} onChange={(e) => set((x) => ({ ...x, duration: null, ongoing: e.target.checked }))} /> 至今仍在持续</label>
            <p className={s.edHint}>{ek === "ongoing" ? "时间线上的长度延伸到当前，仅供阅读。" : "结束时间不确定，时间线上的长度仅供阅读。"}</p>
          </>)}
        </div>
      )}
      <div className={s.timeFoot}>
        <button type="button" className={s.timeCancel} onClick={cancel}>取消</button>
        <button type="button" onClick={onDone}>完成</button>
      </div>
    </div>
  );
}
