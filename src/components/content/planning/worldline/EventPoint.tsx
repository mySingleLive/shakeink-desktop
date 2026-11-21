"use client";
import { memo } from "react";
import type { PlanningEvent } from "@/lib/planning/domain";
import { useFade } from "./EventCard";
import s from "./worldline.module.css";

/** docs/592 R3 / R7: a low-importance event zoomed out to a point: the card's importance dot, the date and a short title
 * (its end fades), on one line with no card or border. No role / tabIndex (review round 1 #8): a press leaves focus to
 * the timeline, so Delete and the arrow keys keep working once the point turns into a card. Selection, double click
 * and box select go through the lane (EventTimeline). */
export const EventPoint = memo(function EventPoint({ event, date, kids, hot, dimmed, selected }: {
  event: PlanningEvent;
  /** The card stamp's start (docs/585), so a point reads the same date as its card. */
  date: string;
  kids: number;
  hot: boolean;
  dimmed: boolean;
  selected: boolean;
}) {
  const fade = useFade<HTMLSpanElement>(event.title);
  return (
    <div
      data-event-point=""
      data-event-id={event.id}
      data-importance={event.importance}
      {...(hot ? { "data-hot": "" } : {})}
      aria-label={`${event.title} ${date}`}
      title={event.title}
      {...(selected ? { "data-selected": "" } : {})}
      className={`${s.tpoint} ${hot ? s.hot : ""} ${dimmed ? s.dim : ""}`}
    >
      <span className={s.pdot}><span className={`${s.dot} ${s[`i${event.importance}`]}`} aria-hidden /></span>
      <time data-point-time="">{date}</time>
      <span data-point-title="" ref={fade}>{event.title}</span>
      {kids > 0 && <b>▸ {kids}</b>}
    </div>
  );
});
