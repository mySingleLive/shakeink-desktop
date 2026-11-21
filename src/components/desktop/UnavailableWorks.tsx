"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { LockOpen, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { UnavailableWork, UnavailableWorkReason } from '@desktop/shared/work-list'
import type { FaultTone } from './FaultedWorkIcon'

export interface FaultInfo { tone: FaultTone; title: string; text: string; hint: string }
/** User-facing copy only. Never includes paths or raw errors (design v3). */
export const FAULT_INFO: Record<UnavailableWorkReason, FaultInfo> = {
  missing: { tone: 'error', title: '作品目录不可用', text: '作品目录已被移动、改名或删除，内容无法读取。', hint: '恢复目录后重新加载，或从作品列表中删除。' },
  'stale-lease': { tone: 'warning', title: '作品锁未释放', text: '上次异常退出留下了写入锁，作品内容已保留。', hint: '修复作品锁后即可正常打开。' },
  'in-use': { tone: 'warning', title: '作品正在别处使用', text: '该作品正被其他进程或设备打开。', hint: '在另一处关闭作品后重新加载。' },
  changed: { tone: 'error', title: '作品目录已变化', text: '目录身份与作品记录不一致，可能被替换或复制。', hint: '从作品列表删除后，用“打开作品目录”重新加入。' },
  damaged: { tone: 'error', title: '作品数据无法读取', text: '作品数据库缺失或无法打开，目录中的文件已保留。', hint: '恢复备份后重新加载，或从作品列表中删除。' },
  unavailable: { tone: 'error', title: '作品暂不可用', text: '作品暂时无法读取，原数据已保留。', hint: '稍后重新加载；仍无法打开时可从作品列表中删除。' },
}
export const faultInfo = (reason: UnavailableWorkReason) => FAULT_INFO[reason] ?? FAULT_INFO.unavailable

export type RepairBusy = 'repairing' | 'pending' | 'restarting' | null
export interface WorkLeaseRepair { busy: RepairBusy; workId: string | null; available: boolean; start(work: UnavailableWork): void }
const BUSY_LABEL: Record<Exclude<RepairBusy, null>, string> = { repairing: '正在准备修复…', pending: '修复交接待完成', restarting: '正在重新启动…' }
export const repairStatus = (busy: RepairBusy) => busy === 'repairing' ? '修复中' : busy ? '待重启' : null

/** One instance per sidebar: survives menu unmounts and view changes; scope resets it. */
export function useWorkLeaseRepair(scope: string): WorkLeaseRepair {
  const alive = useRef(false), flight = useRef(false)
  const currentScope = useRef(scope); currentScope.current = scope
  const [busy, setBusy] = useState<RepairBusy>(null)
  const [workId, setWorkId] = useState<string | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setBusy(null); setWorkId(null); flight.current = false }, [scope])
  const available = typeof window !== 'undefined' && !!window.desktop?.repairWorkLease
  const start = useCallback((work: UnavailableWork) => {
    const bridge = window.desktop
    if (flight.current || busy || work.reason !== 'stale-lease' || !bridge?.repairWorkLease) return
    flight.current = true; setBusy('repairing'); setWorkId(work.workId)
    const requestScope = currentScope.current
    void bridge.repairWorkLease({ type: 'start', workId: work.workId }).then(result => {
      if (alive.current && currentScope.current === requestScope) { setBusy(result === 'cancelled' ? null : result); if (result === 'cancelled') setWorkId(null) }
    }, () => {
      if (alive.current && currentScope.current === requestScope) { setBusy(null); setWorkId(null); toast.error('暂时无法开始锁修复，原文件已保留，请重试。') }
    }).finally(() => { if (currentScope.current === requestScope) flight.current = false })
  }, [busy])
  return { busy, workId, available, start }
}

/** Items for both the … menu and the right-click menu of a faulted work. */
export function FaultedWorkMenuItems({ work, repair, reloading, removing, onReload, onRemove }: { work: UnavailableWork; repair: WorkLeaseRepair; reloading: boolean; removing: boolean; onReload(): void; onRemove(): void }) {
  const info = faultInfo(work.reason), blocked = !!repair.busy || removing
  return <>
    <DropdownMenuGroup><DropdownMenuLabel>{info.title}</DropdownMenuLabel></DropdownMenuGroup>
    {work.reason === 'stale-lease' && repair.available && (repair.busy && repair.workId === work.workId
      ? <DropdownMenuItem disabled><LockOpen />{BUSY_LABEL[repair.busy]}</DropdownMenuItem>
      : <DropdownMenuItem disabled={blocked || reloading} onClick={() => repair.start(work)}><LockOpen />{repair.busy ? BUSY_LABEL[repair.busy] : '修复作品锁'}</DropdownMenuItem>)}
    <DropdownMenuItem disabled={blocked || reloading} onClick={onReload}><RefreshCw />{reloading ? '正在重新加载…' : '重新加载作品'}</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" disabled={blocked || reloading} onClick={onRemove}><Trash2 />删除</DropdownMenuItem>
  </>
}
