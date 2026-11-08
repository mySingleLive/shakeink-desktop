"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { AppPrompt } from "@desktop/shared/prompt"

export interface PromptHostBridge { prompts(): Promise<AppPrompt[]>; replyPrompt(id: string, value: string): Promise<boolean>; subscribe(listener: (prompts: AppPrompt[]) => void): () => void }

/** Renders main-process questions (close, lock repair, migration…) as app dialogs instead of native message boxes. */
export function DesktopPromptHost({ bridge, onOpenChange, themeClass }: { bridge: PromptHostBridge | null; onOpenChange?(open: boolean): void; themeClass?: string }) {
  const [prompts, setPrompts] = useState<AppPrompt[]>([])
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const defaultButton = useRef<HTMLButtonElement | null>(null)
  const sent = useRef(new Set<string>())
  useEffect(() => {
    if (!bridge) return
    let alive = true, pushed = false
    const receive = (next: AppPrompt[]) => { if (!alive) return; pushed = true; setPrompts(next); setAnswered(current => new Set([...current].filter(id => next.some(prompt => prompt.id === id)))) }
    const unsubscribe = bridge.subscribe(receive)
    // Prompts raised before this document subscribed are only available by pulling.
    void bridge.prompts().then(next => { if (alive && !pushed) receive(next) }, () => undefined)
    return () => { alive = false; unsubscribe() }
  }, [bridge])
  const visible = prompts.filter(prompt => !answered.has(prompt.id))
  const prompt = visible.at(-1)
  const open = !!prompt
  useEffect(() => { onOpenChange?.(open) }, [open, onOpenChange])
  const answer = (target: AppPrompt, value: string) => {
    // A ref, not state: a double click lands before React re-renders.
    if (!bridge || sent.current.has(target.id)) return
    sent.current.add(target.id)
    setAnswered(current => new Set(current).add(target.id))
    // If main did not take the answer, show the prompt again rather than leaving it pending unseen.
    const retry = () => { sent.current.delete(target.id); setAnswered(current => { const next = new Set(current); next.delete(target.id); return next }) }
    void bridge.replyPrompt(target.id, value).then(accepted => { if (!accepted) retry() }, retry)
  }
  const answerRef = useRef(answer); answerRef.current = answer
  const promptRef = useRef(prompt); promptRef.current = prompt
  useEffect(() => {
    if (!open) return
    // Every base-ui dialog listens for Escape on document; answer here first so a window below is not dismissed too.
    const escape = (event: KeyboardEvent) => {
      const current = promptRef.current
      if (event.key !== "Escape" || !current) return
      event.preventDefault(); event.stopImmediatePropagation()
      // A held key must not also cancel the prompt that replaces this one; IME composition owns its Escape.
      if (event.repeat || event.isComposing) return
      answerRef.current(current, current.cancelValue)
    }
    window.addEventListener("keydown", escape, true)
    return () => window.removeEventListener("keydown", escape, true)
  }, [open])
  return <Dialog open={open} disablePointerDismissal onOpenChange={() => {}}>
    {prompt && <DialogContent key={prompt.id} className={themeClass ? `desktop-prompt ${themeClass}` : "desktop-prompt"} showCloseButton={false} data-tone={prompt.tone} initialFocus={() => defaultButton.current}>
      <DialogHeader><DialogTitle>{prompt.title}</DialogTitle><DialogDescription>{prompt.message}</DialogDescription></DialogHeader>
      {prompt.detail && <p className="desktop-prompt-detail">{prompt.detail}</p>}
      <DialogFooter>{prompt.buttons.map(button => <Button key={button.value} ref={button.value === prompt.defaultValue ? defaultButton : undefined} variant={button.variant} data-variant={button.variant} onClick={() => answer(prompt, button.value)}>{button.label}</Button>)}</DialogFooter>
    </DialogContent>}
  </Dialog>
}
