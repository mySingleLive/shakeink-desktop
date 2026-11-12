"use client"
import { openAllScenes } from "@/components/content/scene/SceneWorkspace"
import { worldDisplayName } from "@/lib/world-schema"
import { worldForest } from "@/lib/world-tree"
import { useDesktopCommands } from "@/lib/desktop/use-command-target"
import { useNovelList } from "@/lib/novel-list"
import { FaultedWorkMenuItems, faultInfo, repairStatus, useWorkLeaseRepair, type WorkLeaseRepair } from "@/components/desktop/UnavailableWorks"
import { FaultedWorkIcon, type FaultTone } from "@/components/desktop/FaultedWorkIcon"
import { ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import type { UnavailableWork } from "@desktop/shared/work-list"
import {NovelImportTaskButton} from '@/components/desktop/NovelImportDialog'
import {requestNovelImport} from '@/lib/desktop/novel-import'

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  BookOpen,
  BookOpenText,
  ChartNoAxesGantt,
  ChevronRight,
  CircleHelp,
  CircleQuestionMark,
  ClipboardCheck,
  Eye,
  FileText,
  FolderClosed,
  FolderOpen,
  Flag,
  FlaskConical,
  Ghost,
  Globe,
  Heart,
  Lightbulb,
  ListTree,
  Loader2,
  MapPin,
  MessageSquare,
  MessageCirclePlus,
  MessageSquareWarning,
  MoreHorizontal,
  TriangleAlert,
  Package,
  Palette,
  Pencil,
  Plus,
  Pointer,
  NotebookPen,
  FileInput,
  RefreshCw,
  Settings,
  Settings2,
  Trash2,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import { SidebarWindowControls } from "@/components/desktop/WindowControls"
import { updateDesktopSettings, useDesktopStore } from "@/stores/desktop"

import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { isTentativeNovelTitle } from "@/lib/novel-title"
import { TentativeBadge } from "@/components/ui/tentative-badge"
import { manuscriptTitle } from "@/lib/manuscript-export"
import { useChatStore } from "@/stores/chat"
import {
  buildTabId,
  getTabIcon,
  useTabsStore,
  type TabType,
} from "@/stores/tabs"
import type { CharacterRoleType, SettingType } from "@/generated/prisma/enums"

import { buildCharacterChip, startChipDrag } from "../chat/chip-drag"
import type { ChipData } from "../chat/composer-editor"
import {
  CHAPTER_STATUS_LABELS,
  CHARACTER_ROLE_LABELS,
  NOVEL_SETTING_TYPE_ORDER,
  SETTING_TYPE_LABELS,
} from "../content/labels"
import { firstSentence } from "../chat/use-entity-index"
import { CHAPTER_STATUS_ICONS } from "../content/chapter-status"
import { CroppedImage } from "../content/CroppedImage"
import { CreateNovelDialog } from "./CreateNovelDialog"
import { OutlineTreeMenu } from "./OutlineTreeMenu"
import {
  CharactersHeaderHoverCard,
  HOVER_SHOW_MS,
  NovelHoverCard,
  SettingTypeHoverCard,
  SidebarHoverCard,
  SidebarHoverProvider,
  ThemeHoverCard,
  staticHoverCard,
  useSidebarHover,
} from "./SidebarHoverCard"
import { Seal } from "../marketing/seal"
import { NavigationLabel } from "./NavigationLabel"
import { ScenarioLibraryDialog, type ScenarioLibrarySession } from "./ScenarioLibraryDialog"
import { NAVIGATION_LABELS, NAVIGATION_VIEWS, ROLE_TAGS, ROLE_TONES, NavigationContextMenu, NavigationMenu, NavigationMenuContent, NavigationTransientBoundary, settingTone, useNavigationScroll, useNavigationTransient, type NavigationTone, type NavigationView } from "./sidebar-navigation-state"
import {
  normalizeCrop,
  type CharacterRecord,
  type NovelDetail,
  type NovelSummary,
  type WorldRecord,
} from "../content/types"

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? fallback
  } catch {
    return fallback
  }
}

interface TreeNodeProps {
  icon: LucideIcon
  label: string
  depth: number
  active?: boolean
  expandable?: boolean
  expanded?: boolean
  dimmed?: boolean
  onToggle?: () => void
  onClick?: () => void
  iconTone?: NavigationTone
  roleType?: CharacterRoleType | "FORESHADOW"
  accessibleLabel?: string
  /** Exact row element used as a modal return-focus target. */
  onActivate?: (element: HTMLElement) => void
  /** 名字后的小标记（如主角「主」签） */
  tag?: React.ReactNode
  /** 替换默认图标的自定义节点（如角色头像缩略图） */
  avatar?: React.ReactNode
  action?: React.ReactNode
  /**
   * 悬停简介卡（2026-09）：惰性渲染函数，悬停 ≥400ms 稳定后才挂载——
   * 需要取数的卡片（NovelHoverCard 等）借此延迟到真正悬停时才发查询。
   */
  hoverCard?: () => React.ReactNode
  /** 提供即整行可拖拽：拖入对话输入框插入对应引用芯片 */
  dragChip?: ChipData
  /** Faulted work row: tints the title and announces the row's menu. */
  fault?: FaultTone
  menuOpen?: boolean
}

function TreeNode({
  icon: Icon,
  label,
  depth,
  active,
  expandable,
  expanded,
  dimmed,
  onToggle,
  onClick,
  onActivate,
  iconTone,
  roleType,
  accessibleLabel,
  tag,
  avatar,
  action,
  hoverCard,
  dragChip,
  fault,
  menuOpen,
}: TreeNodeProps) {
  const hover = useSidebarHover()
  const { paused, epoch } = useNavigationTransient()
  const ownerRef = useRef<symbol>(Symbol())
  const rowRef = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载：清待定展示；若卡片正属于本行（树折叠等）一并收起
  useEffect(() => {
    const owner = ownerRef.current
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current)
      hover?.hideNow(owner)
    }
  }, [hover, paused, epoch])

  const showNow = () => {
    if (paused) return
    const rect = rowRef.current?.getBoundingClientRect()
    if (rect && hoverCard) {
      hover?.show(ownerRef.current, hoverCard, { x: rect.right + 8, y: rect.top })
    }
  }
  const onRowEnter = () => {
    if (paused || !hoverCard || !hover) return
    if (hover.ownsCurrent(ownerRef.current)) return
    // 卡片已在别处打开：零延迟原位切换（无「先收再弹」过渡）
    if (hover.isOpen()) {
      showNow()
      return
    }
    if (showTimer.current) return
    showTimer.current = setTimeout(() => {
      showTimer.current = null
      showNow()
    }, HOVER_SHOW_MS)
  }
  const onRowLeave = () => {
    if (!hoverCard || !hover) return
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    hover.scheduleHide(ownerRef.current)
  }

  return (
    <div
      ref={rowRef}
      role="button"
      aria-label={accessibleLabel ?? label}
      aria-expanded={expandable ? expanded : fault ? !!menuOpen : undefined}
      aria-haspopup={fault ? "menu" : undefined}
      data-fault={fault}
      data-icon-tone={iconTone}
      data-role={roleType}
      tabIndex={0}
      draggable={!!dragChip}
      onDragStart={dragChip ? (e) => startChipDrag(e, dragChip) : undefined}
      title={dragChip ? "可拖拽到对话输入框引用" : undefined}
      onClick={(event) => {
        hover?.hideNow(ownerRef.current)
        onActivate?.(event.currentTarget)
        onClick?.()
      }}
      onMouseEnter={onRowEnter}
      onMouseLeave={onRowLeave}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onActivate?.(e.currentTarget)
          onClick?.()
        }
      }}
      className={cn(
        "tree-row group relative flex h-7 cursor-pointer items-center gap-[5px] rounded-[5px] pr-1.5 text-[13px] select-none",
        active
          ? "bg-active-wash font-medium text-primary"
          : "hover:bg-hover-wash",
        dimmed && "text-muted-foreground"
      )}
      style={{ paddingLeft: `${depth * 14 + 6}px`, ...(iconTone ? { "--node-icon-color": `var(--icon-${iconTone})` } : {}) } as CSSProperties}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "收起" : "展开"}
          onClick={(e) => {
            e.stopPropagation()
            onToggle?.()
          }}
          className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
        >
          <ChevronRight
            className={cn("size-3 transition-transform", expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      {avatar ?? (
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0",
            iconTone ? "nav-node-icon" : active ? "text-primary" : "text-muted-foreground"
          )}
        />
      )}
      {roleType && tag ? <span className="role-name-group flex min-w-0 flex-1 items-center gap-1.5"><NavigationLabel>{label}</NavigationLabel>{tag}</span> : <><NavigationLabel className="flex-1">{label}</NavigationLabel>{tag}</>}
      {action && <span
        className="flex shrink-0"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        onMouseEnter={() => {
          if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
          hover?.hideNow(ownerRef.current)
        }}
      >{action}</span>}
    </div>
  )
}

/** GET /api/novels/[id]/foreshadow-characters 列表项 */
interface ForeshadowCharacterRecord {
  id: string
  novelId: string
  name: string
  note: string
  avatarUrl: string | null
  revealedCharacterId: string | null
}

/** A filter heading controls navigation visibility, never a content Tab. */
function NavigationWorkGroup({ id, title, view, collapsed, onToggle, action, children, fault, contextMenu }: { id: string; title: string; view: NavigationView; collapsed: boolean; onToggle(): void; action?: React.ReactNode; children: React.ReactNode; fault?: FaultTone; contextMenu?: React.ReactNode }) {
  const hover = useSidebarHover(), hoverHideAll = () => hover?.hideAll()
  const bodyId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const toggleGroup = () => {
    if (!collapsed && body.current?.contains(document.activeElement)) button.current?.focus()
    onToggle()
  }
  return <div className="nav-work-group" data-work-id={id} data-view={view} data-icon-tone="work" style={{ "--node-icon-color": "var(--icon-work)" } as CSSProperties}>
    {(() => {
      const heading = <div className="nav-group-heading group flex min-w-0 items-center">
        <button ref={button} type="button" data-fault={fault} className="nav-group-toggle flex h-7 min-w-0 flex-1 items-center gap-[5px] rounded-[5px] px-1.5 text-left text-[13px] hover:bg-hover-wash" aria-label={title} aria-expanded={!collapsed} aria-controls={bodyId} onClick={toggleGroup}>
          <ChevronRight aria-hidden="true" className={cn("nav-group-chevron size-3 shrink-0 text-muted-foreground", !collapsed && "rotate-90")} />
          {fault ? <FaultedWorkIcon tone={fault} open={!collapsed} /> : collapsed ? <FolderClosed aria-hidden="true" className="nav-node-icon size-3.5 shrink-0" /> : <FolderOpen aria-hidden="true" className="nav-node-icon size-3.5 shrink-0" />}
          <NavigationLabel className="flex-1">{title}</NavigationLabel>
        </button>
        {action}
      </div>
      return contextMenu ? <NavigationContextMenu onShow={hoverHideAll}><ContextMenuTrigger render={heading} /><ContextMenuContent>{contextMenu}</ContextMenuContent></NavigationContextMenu> : heading
    })()}
    <NavigationTransientBoundary paused={collapsed}>
      <div ref={body} id={bodyId} className="nav-group-body" hidden={collapsed} inert={collapsed}>{children}</div>
    </NavigationTransientBoundary>
  </div>
}

interface FaultedWorkActions { repair: WorkLeaseRepair; reloading: boolean; removing: boolean; reload(): void; remove(work: UnavailableWork): void }
function faultedHoverCard(work: UnavailableWork) {
  const info = faultInfo(work.reason)
  return () => <SidebarHoverCard data={{ title: work.title, subtitle: info.title, blurb: info.text, meta: [info.hint], icon: info.tone === "error" ? AlertCircle : TriangleAlert, tone: info.tone }} />
}
function FaultedWorkMenu({ work, actions, onOpenChange, returnFocus }: { work: UnavailableWork; actions: FaultedWorkActions; onOpenChange?(open: boolean): void; returnFocus?: React.RefObject<HTMLElement | null> }) {
  return <NavigationMenu onOpenChange={open => onOpenChange?.(open)}>
    <DropdownMenuTrigger render={<button type="button" aria-label="作品操作" onClick={event => event.stopPropagation()} className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 focus-visible:opacity-100 data-popup-open:opacity-100" />}>
      <MoreHorizontal className="size-4" />
    </DropdownMenuTrigger>
    <NavigationMenuContent align="start" className="w-auto min-w-36" finalFocus={returnFocus ? () => returnFocus.current?.querySelector<HTMLElement>(".tree-row") ?? true : undefined}><FaultedWorkMenuItems work={work} repair={actions.repair} reloading={actions.reloading} removing={actions.removing} onReload={actions.reload} onRemove={() => actions.remove(work)} /></NavigationMenuContent>
  </NavigationMenu>
}
/** Right-click entry for a healthy work row; items are the unchanged … menu items. */
function RowContextMenu({ items, children }: { items: React.ReactNode; children: React.ReactNode }) {
  const hover = useSidebarHover()
  return <NavigationContextMenu onShow={() => hover?.hideAll()}><ContextMenuTrigger render={<div />}>{children}</ContextMenuTrigger><ContextMenuContent className="w-auto min-w-28">{items}</ContextMenuContent></NavigationContextMenu>
}
function FaultedWorkContext({ work, actions, children }: { work: UnavailableWork; actions: FaultedWorkActions; children: React.ReactElement }) {
  const hover = useSidebarHover(), hoverHideAll = () => hover?.hideAll()
  return <NavigationContextMenu onShow={hoverHideAll}><ContextMenuTrigger render={children} /><ContextMenuContent className="w-auto min-w-36"><FaultedWorkMenuItems work={work} repair={actions.repair} reloading={actions.reloading} removing={actions.removing} onReload={actions.reload} onRemove={() => actions.remove(work)} /></ContextMenuContent></NavigationContextMenu>
}
/** A faulted work is an ordinary depth-0 navigation row whose activation opens its menu. */
function FaultedWorkRow({ work, actions }: { work: UnavailableWork; actions: FaultedWorkActions }) {
  const [open, setOpen] = useState(false), info = faultInfo(work.reason)
  const row = useRef<HTMLDivElement>(null)
  const status = actions.repair.workId === work.workId ? repairStatus(actions.repair.busy) : null
  // Activating the row presses the real … trigger, so Base UI owns open, focus and dismissal.
  const openMenu = () => row.current?.querySelector<HTMLButtonElement>('button[aria-label="作品操作"]')?.click()
  return <FaultedWorkContext work={work} actions={actions}><div ref={row}>
    <TreeNode icon={FolderClosed} avatar={<FaultedWorkIcon tone={info.tone} />} label={work.title} depth={0} fault={info.tone} menuOpen={open}
      tag={status ? <span className="fault-status">{status}</span> : undefined}
      hoverCard={faultedHoverCard(work)} onClick={openMenu}
      action={<FaultedWorkMenu work={work} actions={actions} onOpenChange={setOpen} returnFocus={row} />} />
  </div></FaultedWorkContext>
}
function FaultedWorkGroup({ work, view, collapsed, onToggle, actions }: { work: UnavailableWork; view: NavigationView; collapsed: boolean; onToggle(): void; actions: FaultedWorkActions }) {
  const info = faultInfo(work.reason)
  const status = actions.repair.workId === work.workId ? repairStatus(actions.repair.busy) : null
  const items = <FaultedWorkMenuItems work={work} repair={actions.repair} reloading={actions.reloading} removing={actions.removing} onReload={actions.reload} onRemove={() => actions.remove(work)} />
  return <NavigationWorkGroup id={work.workId} title={work.title} view={view} collapsed={collapsed} onToggle={onToggle} fault={info.tone} contextMenu={items}
    action={<FaultedWorkMenu work={work} actions={actions} />}>
    <p className="px-1.5 pb-1.5 pl-[31px] text-xs text-muted-foreground">{status ? `${info.title}，${status === "修复中" ? "正在准备修复作品锁。" : "修复交接待完成，应用将重新启动。"}` : `${info.title}，${info.hint}`}</p>
  </NavigationWorkGroup>
}

type DialogState =
  | { type: "rename"; novel: NovelSummary }
  | { type: "delete"; novel: NovelSummary }
  | { type: "world-create"; novel: NovelSummary; parentWorld?: WorldRecord }
  | { type: "world-rename"; novel: NovelSummary; world: WorldRecord }
  | { type: "world-delete"; novel: NovelSummary; world: WorldRecord }
  | { type: "remove-faulted"; work: UnavailableWork }
  | null

const CHARACTER_ROLE_ORDER: CharacterRoleType[] = [
  "PROTAGONIST",
  "SUPPORTING",
  "ANTAGONIST",
]

/** 「角色」分组展开后的真实角色子树：按角色类型分组，叶子节点打开角色 tab */
function CharacterSubtree({
  novel,
  expanded,
  toggle,
  flat = false,
}: {
  novel: NovelSummary
  expanded: Record<string, boolean>
  toggle: (key: string) => void
  flat?: boolean
}) {
  const openTab = useTabsStore((s) => s.openTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["characters", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}/characters`)
      if (!res.ok) throw new Error("加载角色失败")
      return (await res.json()) as { characters: CharacterRecord[] }
    },
  })
  const foreshadowQuery = useQuery({ queryKey: ["foreshadow-characters", novel.id], enabled: flat, queryFn: async () => {
    const response = await fetch(`/api/novels/${novel.id}/foreshadow-characters`)
    if (!response.ok) throw new Error("加载伏笔角色失败")
    return (await response.json()) as { foreshadowCharacters: ForeshadowCharacterRecord[] }
  } })

  if (isError) return <><div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button variant="outline" size="sm" onClick={() => void refetch()}>重试角色</Button></div><ForeshadowCharacterSection novel={novel} expanded={expanded} toggle={toggle} flat={flat} /></>

  if (isLoading) {
    return (
      <><div className="flex justify-center py-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>{flat && <ForeshadowCharacterSection novel={novel} expanded={expanded} toggle={toggle} flat />}</>
    )
  }

  const characters = data?.characters ?? []
  if (characters.length === 0) {
    return (
      <>
        {(!flat || (foreshadowQuery.isSuccess && !foreshadowQuery.data.foreshadowCharacters.length)) && <TreeNode icon={Users} iconTone="characters" label="暂无角色" depth={flat ? 1 : 2} dimmed />}
        <ForeshadowCharacterSection novel={novel} expanded={expanded} toggle={toggle} flat={flat} />
      </>
    )
  }

  return (
    <>
      {CHARACTER_ROLE_ORDER.map((roleType) => {
        const group = characters.filter((c) => c.roleType === roleType)
        if (group.length === 0) return null
        const groupKey = `${novel.id}:character:${roleType}`
        const groupExpanded = flat || (expanded[groupKey] ?? true)
        return (
          <div key={roleType}>
            {!flat && <TreeNode
              icon={Users}
              iconTone={ROLE_TONES[roleType]}
              label={`${CHARACTER_ROLE_LABELS[roleType]}（${group.length}）`}
              depth={2}
              expandable
              expanded={groupExpanded}
              onToggle={() => toggle(groupKey)}
              onClick={() => toggle(groupKey)}
              hoverCard={() => (
                <SidebarHoverCard
                  data={{
                    title: `${CHARACTER_ROLE_LABELS[roleType]}（${group.length}）`,
                    icon: Users,
                    blurb: group.map((c) => c.name).join("、"),
                  }}
                />
              )}
            />}
            {groupExpanded &&
              group.map((c) => (
                <TreeNode
                  key={c.id}
                  icon={UserRound}
                  iconTone={ROLE_TONES[roleType]}
                  roleType={roleType}
                  accessibleLabel={`${c.name} · ${CHARACTER_ROLE_LABELS[roleType]}`}
                  dragChip={buildCharacterChip({ name: c.name, avatarUrl: c.avatarUrl })}
                  avatar={
                    c.avatarUrl ? (
                      <span className="relative size-5 shrink-0 overflow-hidden rounded-full">
                        <CroppedImage
                          src={c.avatarUrl}
                          crop={normalizeCrop(c.avatarCrop)}
                          alt={c.name}
                        />
                      </span>
                    ) : undefined
                  }
                  label={c.name}
                  depth={flat ? 1 : 3}
                  active={
                    activeTabId === buildTabId("character", novel.id, { refId: c.id })
                  }
                  tag={
                    <span className="role-tag shrink-0 rounded-[3px] px-1 text-[9.5px] leading-[1.5]">{ROLE_TAGS[roleType]}</span>
                  }
                  hoverCard={() => (
                    <SidebarHoverCard
                      data={{
                        title: c.name,
                        subtitle: `角色 · ${CHARACTER_ROLE_LABELS[c.roleType]}`,
                        imageUrl: c.avatarUrl,
                        imageCrop: c.avatarCrop,
                        roundImage: true,
                        icon: UserRound,
                        blurb: firstSentence(c.bio || c.personality || c.appearance),
                        blurbIsPreview: true,
                        meta: [c.occupation, c.age, c.gender].filter((x) => !!x?.trim()),
                      }}
                    />
                  )}
                  onClick={() =>
                    openTab({
                      id: buildTabId("character", novel.id, { refId: c.id }),
                      type: "character",
                      novelId: novel.id,
                      refId: c.id,
                      title: c.name,
                    })
                  }
                />
              ))}
          </div>
        )
      })}
      <ForeshadowCharacterSection novel={novel} expanded={expanded} toggle={toggle} flat={flat} />
    </>
  )
}

/**
 * 「角色」分组内的伏笔角色栏：身份未明的小说级实体（「老者」），可在叙事线中引用。
 * 列表为空时不渲染该栏；叶子为虚线环首字符头像 + 「伏笔」角标，
 * 悬停菜单：重命名 / 转为正式角色 / 揭示为正式角色… / 删除。
 */
function ForeshadowCharacterSection({
  novel,
  expanded,
  toggle,
  flat = false,
}: {
  novel: NovelSummary
  expanded: Record<string, boolean>
  toggle: (key: string) => void
  flat?: boolean
}) {
  const queryClient = useQueryClient()
  const openTab = useTabsStore((s) => s.openTab)

  const [dialog, setDialog] = useState<
    | { type: "rename"; fc: ForeshadowCharacterRecord }
    | { type: "promote"; fc: ForeshadowCharacterRecord }
    | { type: "reveal"; fc: ForeshadowCharacterRecord }
    | { type: "delete"; fc: ForeshadowCharacterRecord }
    | null
  >(null)
  const [nameInput, setNameInput] = useState("")
  const [revealTargetId, setRevealTargetId] = useState("")

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["foreshadow-characters", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}/foreshadow-characters`)
      if (!res.ok) throw new Error("加载伏笔角色失败")
      return (await res.json()) as { foreshadowCharacters: ForeshadowCharacterRecord[] }
    },
  })

  // 揭示候选正式角色：与角色子树共享 ["characters", novelId] 缓存，命中零额外请求
  const { data: charactersData } = useQuery({
    queryKey: ["characters", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}/characters`)
      if (!res.ok) throw new Error("加载角色失败")
      return (await res.json()) as { characters: CharacterRecord[] }
    },
  })

  const invalidateForeshadows = () =>
    queryClient.invalidateQueries({ queryKey: ["foreshadow-characters", novel.id] })
  /** 转正/揭示后正式角色列表也会变化，两个 key 一起失效 */
  const invalidateCharactersAndForeshadows = () => {
    queryClient.invalidateQueries({ queryKey: ["characters", novel.id] })
    invalidateForeshadows()
  }

  const renameMutation = useMutation({
    mutationFn: async ({ fc, name }: { fc: ForeshadowCharacterRecord; name: string }) => {
      const res = await fetch(`/api/novels/${novel.id}/foreshadow-characters/${fc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await readError(res, "重命名失败"))
    },
    onSuccess: () => {
      toast.success("已重命名")
      invalidateForeshadows()
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const promoteMutation = useMutation({
    mutationFn: async (fc: ForeshadowCharacterRecord) => {
      const res = await fetch(`/api/novels/${novel.id}/foreshadow-characters/${fc.id}/promote`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(await readError(res, "转正失败"))
      return (await res.json()) as { character: CharacterRecord }
    },
    onSuccess: ({ character }, fc) => {
      toast.success(`「${fc.name}」已转为正式角色`)
      invalidateCharactersAndForeshadows()
      setDialog(null)
      openTab({
        id: buildTabId("character", novel.id, { refId: character.id }),
        type: "character",
        novelId: novel.id,
        refId: character.id,
        title: character.name,
      })
    },
    onError: (err) => toast.error(err.message),
  })

  const revealMutation = useMutation({
    mutationFn: async ({
      fc,
      characterId,
    }: {
      fc: ForeshadowCharacterRecord
      characterId: string
    }) => {
      const res = await fetch(`/api/novels/${novel.id}/foreshadow-characters/${fc.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      })
      if (!res.ok) throw new Error(await readError(res, "揭示失败"))
    },
    onSuccess: (_data, { fc }) => {
      toast.success(`「${fc.name}」已揭示为正式角色`)
      invalidateCharactersAndForeshadows()
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (fc: ForeshadowCharacterRecord) => {
      const res = await fetch(`/api/novels/${novel.id}/foreshadow-characters/${fc.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(await readError(res, "删除失败"))
    },
    onSuccess: (_data, fc) => {
      toast.success(`伏笔角色「${fc.name}」已删除`)
      invalidateForeshadows()
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const foreshadows = data?.foreshadowCharacters ?? []
  if (isError) return <div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button variant="outline" size="sm" onClick={() => void refetch()}>重试伏笔角色</Button></div>
  if (isLoading) return flat ? <p className="px-5 py-2 text-xs text-muted-foreground">伏笔角色加载中…</p> : null
  if (foreshadows.length === 0) return null

  const groupKey = `${novel.id}:character:foreshadow`
  const groupExpanded = flat || (expanded[groupKey] ?? true)
  const characters = charactersData?.characters ?? []
  const confirmPending =
    promoteMutation.isPending || revealMutation.isPending || deleteMutation.isPending

  return (
    <>
      {!flat && <TreeNode
        icon={Ghost}
        iconTone="foreshadow-character"
        label={`伏笔角色（${foreshadows.length}）`}
        depth={2}
        expandable
        expanded={groupExpanded}
        onToggle={() => toggle(groupKey)}
        onClick={() => toggle(groupKey)}
        hoverCard={() => (
          <SidebarHoverCard
            data={{
              title: `伏笔角色（${foreshadows.length}）`,
              icon: Ghost,
              blurb: "身份未明、先行登记的角色；揭示或转正后进入正式角色列表。",
              meta: [foreshadows.map((f) => f.name).join("、")],
            }}
          />
        )}
      />}
      {groupExpanded &&
        foreshadows.map((fc) => (
          <TreeNode
            key={fc.id}
            icon={UserRound}
            iconTone="foreshadow-character"
            roleType="FORESHADOW"
            accessibleLabel={`${fc.name} · 伏笔角色`}
            avatar={
              <span className="character-letter flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed text-[10px] leading-none select-none">
                {fc.name.slice(0, 1)}
              </span>
            }
            label={fc.name}
            depth={flat ? 1 : 3}
            hoverCard={() => (
              <SidebarHoverCard
                data={{
                  title: fc.name,
                  subtitle: "伏笔角色",
                  icon: Ghost,
                  blurb: firstSentence(fc.note),
                  blurbIsPreview: true,
                  meta: [fc.revealedCharacterId ? "已揭示" : "未揭示"],
                }}
              />
            )}
            tag={
              <span className="role-tag shrink-0 rounded-[3px] px-1 text-[9.5px] leading-[1.5]">
                伏笔
              </span>
            }
            action={
              <NavigationMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="伏笔角色操作"
                      onClick={(e) => e.stopPropagation()}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 data-popup-open:opacity-100"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <NavigationMenuContent align="start" className="w-auto min-w-36">
                  <DropdownMenuItem
                    onClick={() => {
                      setNameInput(fc.name)
                      setDialog({ type: "rename", fc })
                    }}
                  >
                    <Pencil />
                    重命名
                  </DropdownMenuItem>
                  {!fc.revealedCharacterId && (
                    <DropdownMenuItem onClick={() => setDialog({ type: "promote", fc })}>
                      <UserRound />
                      转为正式角色
                    </DropdownMenuItem>
                  )}
                  {!fc.revealedCharacterId && (
                    <DropdownMenuItem
                      onClick={() => {
                        setRevealTargetId("")
                        setDialog({ type: "reveal", fc })
                      }}
                    >
                      <Eye />
                      揭示为正式角色…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDialog({ type: "delete", fc })}
                  >
                    <Trash2 />
                    删除
                  </DropdownMenuItem>
                </NavigationMenuContent>
              </NavigationMenu>
            }
          />
        ))}

      {/* 重命名伏笔角色 */}
      <Dialog
        open={dialog?.type === "rename"}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名伏笔角色</DialogTitle>
            <DialogDescription>
              给这个伏笔角色起个新名字，各处的引用展示同步更新。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const name = nameInput.trim()
              if (dialog?.type === "rename" && name) {
                renameMutation.mutate({ fc: dialog.fc, name })
              }
            }}
            className="flex flex-col gap-4"
          >
            <Input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="如：老者、神秘人"
              maxLength={100}
            />
            <DialogFooter>
              <Button type="submit" disabled={!nameInput.trim() || renameMutation.isPending}>
                {renameMutation.isPending && <Loader2 className="animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 转为正式角色 / 揭示为正式角色 / 删除 的确认对话框 */}
      <Dialog
        open={
          dialog?.type === "promote" || dialog?.type === "reveal" || dialog?.type === "delete"
        }
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "promote"
                ? "转为正式角色"
                : dialog?.type === "reveal"
                  ? "揭示为正式角色"
                  : "删除伏笔角色"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === "promote"
                ? `将以「${dialog.fc.name}」新建一名正式角色（配角），各处伏笔引用同步归属该角色。`
                : dialog?.type === "reveal"
                  ? `选择「${dialog.fc.name}」的真实身份；揭示后各处伏笔引用将归属该角色。`
                  : dialog?.type === "delete"
                    ? `确定要删除伏笔角色「${dialog.fc.name}」吗？该操作不可撤销。`
                    : ""}
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "reveal" && (
            <Select
              value={revealTargetId || null}
              onValueChange={(v) => setRevealTargetId((v as string) ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择正式角色" />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              variant={dialog?.type === "delete" ? "destructive" : "default"}
              disabled={confirmPending || (dialog?.type === "reveal" && !revealTargetId)}
              onClick={() => {
                if (dialog?.type === "promote") promoteMutation.mutate(dialog.fc)
                if (dialog?.type === "reveal" && revealTargetId) {
                  revealMutation.mutate({ fc: dialog.fc, characterId: revealTargetId })
                }
                if (dialog?.type === "delete") deleteMutation.mutate(dialog.fc)
              }}
            >
              {confirmPending && <Loader2 className="animate-spin" />}
              {dialog?.type === "promote"
                ? "确认转正"
                : dialog?.type === "reveal"
                  ? "确认揭示"
                  : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * 「世界观」分组下的世界子树：多世界树形嵌套（大千世界 → 小千世界），
 * 点击世界节点打开 world tab；悬停菜单支持添加子世界/重命名/删除。
 */
function WorldSubtree({
  novel,
  expanded,
  toggle,
  onCreateChild,
  onRename,
  onDelete,
  depth = 3,
  pruneExpanded,
}: {
  novel: NovelSummary
  expanded: Record<string, boolean>
  toggle: (key: string) => void
  onCreateChild: (parent: WorldRecord) => void
  onRename: (world: WorldRecord) => void
  onDelete: (world: WorldRecord) => void
  depth?: number
  pruneExpanded?: (prefix: string, keys: string[]) => void
}) {
  const openTab = useTabsStore((s) => s.openTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["worlds", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}/worlds`)
      if (!res.ok) throw new Error("加载世界失败")
      return (await res.json()) as { worlds: WorldRecord[] }
    },
  })

  useEffect(() => { if (data) pruneExpanded?.(`${novel.id}:world:`, data.worlds.map(world => `${novel.id}:world:${world.id}`)) }, [data, novel.id, pruneExpanded])

  if (isError) return <div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button size="sm" variant="outline" onClick={() => void refetch()}>重试世界</Button></div>

  if (isLoading) {
    return (
      <div className="flex justify-center py-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  const worlds = data?.worlds ?? []
  if (worlds.length === 0) {
    return <TreeNode icon={Globe} iconTone="world" label="还没有世界，点上方 + 创建" depth={depth} dimmed />
  }

  const forest = worldForest(worlds)
  const childrenOf = (parentId: string | null) => forest.children.get(parentId) ?? []

  const renderWorld = (world: WorldRecord, depth: number): React.ReactNode => {
    const children = childrenOf(world.id)
    const key = `${novel.id}:world:${world.id}`
    const worldExpanded = expanded[key] ?? true
    const tabId = buildTabId("world", novel.id, { refId: world.id })
    return (
      <div key={world.id} data-world-id={world.id}>
        <TreeNode
          icon={Globe}
          iconTone="world"
          label={worldDisplayName(world.name)}
          depth={depth}
          hoverCard={() => (
            <SidebarHoverCard
              data={{
                title: worldDisplayName(world.name),
                subtitle: world.parentId ? "子世界" : "主世界",
                icon: Globe,
                blurb: firstSentence(world.description),
                blurbIsPreview: true,
                meta: [...(children.length > 0 ? [`${children.length} 个子世界`] : []), ...(forest.anomalies.has(world.id) ? ["名称或层级待核对，原记录已保留"] : [])],
              }}
            />
          )}
          expandable={children.length > 0}
          expanded={worldExpanded}
          active={activeTabId === tabId}
          onToggle={() => toggle(key)}
          onClick={() =>
            openTab({
              id: tabId,
              type: "world",
              novelId: novel.id,
              refId: world.id,
              title: worldDisplayName(world.name),
            })
          }
          action={
            <NavigationMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="世界操作"
                    onClick={(e) => e.stopPropagation()}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 data-popup-open:opacity-100"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <NavigationMenuContent align="start" className="w-auto min-w-28">
                <DropdownMenuItem onClick={() => onCreateChild(world)}>
                  <Plus />
                  添加子世界
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRename(world)}>
                  <Pencil />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(world)}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </NavigationMenuContent>
            </NavigationMenu>
          }
        />
        {worldExpanded && children.map((c) => renderWorld(c, depth + 1))}
      </div>
    )
  }

  return <>{forest.roots.map((w) => renderWorld(w, depth))}</>
}

/**
 * 「大纲」/「正文」分组的卷→章子树（复用小说详情查询，含卷章结构）。
 * kind=outline 时章节点打开 chapter-outline tab；kind=content 时打开 chapter-content tab。
 */
function OutlineSubtree({
  novel,
  kind,
  expanded,
  toggle,
  depth = 2,
  pruneExpanded,
}: {
  novel: NovelSummary
  kind: "outline" | "content"
  expanded: Record<string, boolean>
  toggle: (key: string) => void
  depth?: number
  pruneExpanded?: (prefix: string, keys: string[]) => void
}) {
  const openTab = useTabsStore((s) => s.openTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  const { data, isLoading, isError, error, refetch } = useQuery<{ novel: NovelDetail }>({
    queryKey: ["novels", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}`)
      if (!res.ok) throw new Error("加载小说详情失败")
      return res.json()
    },
  })
  useEffect(() => { if (data) pruneExpanded?.(`${novel.id}:${kind}:volume:`, data.novel.volumes.map(volume => `${novel.id}:${kind}:volume:${volume.id}`)) }, [data, novel.id, kind, pruneExpanded])
  if (isError) return <div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button variant="outline" size="sm" onClick={() => void refetch()}>重试正文</Button></div>

  if (isLoading) {
    return (
      <div className="flex justify-center py-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  const volumes = data?.novel.volumes ?? []
  if (volumes.length === 0) {
    if (kind === "content") return <TreeNode icon={FileText} iconTone="content" label="暂无正文" depth={depth} dimmed />
    return (
      <TreeNode
        icon={ListTree}
        label="暂无大纲，去生成"
        depth={depth}
        dimmed
        onClick={() =>
          openTab({
            id: buildTabId("outline", novel.id),
            type: "outline",
            novelId: novel.id,
            title: "大纲",
          })
        }
      />
    )
  }

  const tabType = kind === "outline" ? "chapter-outline" : "chapter-content"
  const volumeIcon = kind === "outline" ? ListTree : FileText
  return (
    <>
      {volumes.map((volume) => {
        const volumeKey = `${novel.id}:${kind}:volume:${volume.id}`
        const volumeExpanded = expanded[volumeKey] ?? true
        return (
          <div key={volume.id}>
            <TreeNode
              icon={volumeIcon}
              iconTone={kind === "content" ? "content" : "outline"}
              label={manuscriptTitle(volume.index, volume.title, "卷")}
              depth={depth}
              expandable
              expanded={volumeExpanded}
              onToggle={() => toggle(volumeKey)}
              onClick={() => toggle(volumeKey)}
              action={<OutlineTreeMenu novel={novel} volume={volume} kind={kind} />}
              hoverCard={() => {
                const words = volume.chapters.reduce((m, c) => m + c.wordCount, 0)
                return (
                  <SidebarHoverCard
                    data={{
                      title: manuscriptTitle(volume.index, volume.title, "卷"),
                      subtitle: kind === "outline" ? "卷大纲" : "卷正文",
                      icon: volumeIcon,
                      meta: [
                        `${volume.chapters.length} 章`,
                        ...(words > 0 ? [`共 ${words.toLocaleString()} 字`] : []),
                      ],
                    }}
                  />
                )
              }}
            />
            {volumeExpanded &&
              volume.chapters.map((chapter) => (
                <TreeNode
                  key={chapter.id}
                  icon={CHAPTER_STATUS_ICONS[chapter.status]}
                  label={manuscriptTitle(chapter.index, chapter.title)}
                  depth={depth + 1}
                  hoverCard={() => (
                    <SidebarHoverCard
                      data={{
                        title: manuscriptTitle(chapter.index, chapter.title),
                        subtitle: kind === "outline" ? "章大纲" : "章正文",
                        icon: CHAPTER_STATUS_ICONS[chapter.status],
                        meta: [
                          CHAPTER_STATUS_LABELS[chapter.status],
                          ...(chapter.wordCount > 0
                            ? [`${chapter.wordCount.toLocaleString()} 字`]
                            : []),
                        ],
                      }}
                    />
                  )}
                  active={
                    activeTabId === buildTabId(tabType, novel.id, { refId: chapter.id })
                  }
                  onClick={() =>
                    openTab({
                      id: buildTabId(tabType, novel.id, { refId: chapter.id }),
                      type: tabType,
                      novelId: novel.id,
                      refId: chapter.id,
                      title: chapter.title,
                    })
                  }
                />
              ))}
          </div>
        )
      })}
    </>
  )
}

/**
 * 「级联修订」节点：有待处理 CascadeJob（RUNNING / WAITING_CONFIRM）时显示红色角标计数。
 * 点击打开 cascade tab。独立组件以便每本小说各发一条 ["cascade", novelId] 查询。
 */
function CascadeNode({ novel }: { novel: NovelSummary }) {
  const openTab = useTabsStore((s) => s.openTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  const { data } = useQuery({
    queryKey: ["cascade", novel.id],
    queryFn: async () => {
      const res = await fetch(`/api/novels/${novel.id}/cascade`)
      if (!res.ok) throw new Error("加载级联任务失败")
      return (await res.json()) as { pendingCount: number }
    },
  })

  const pendingCount = data?.pendingCount ?? 0
  const tabId = buildTabId("cascade", novel.id)
  return (
    <TreeNode
      icon={RefreshCw}
      iconTone="cascade"
      label="级联修订"
      hoverCard={() => (
        <SidebarHoverCard
          data={{
            title: "级联修订",
            icon: RefreshCw,
            blurb: "上游设定/大纲变更向下游章节传播的修订任务。",
            meta: [pendingCount > 0 ? `${pendingCount} 项待处理` : "无待处理"],
          }}
        />
      )}
      depth={1}
      active={activeTabId === tabId}
      onClick={() =>
        openTab({ id: tabId, type: "cascade", novelId: novel.id, title: "级联修订" })
      }
      action={
        pendingCount > 0 ? (
          <span className="mr-1 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {pendingCount}
          </span>
        ) : undefined
      }
    />
  )
}

interface ConversationSummary {
  id: string
  title: string
  novelId: string | null
  updatedAt: string
}

async function fetchConversationSummaries(): Promise<ConversationSummary[]> {
  // A rejected local request carries native paths and raw causes; never display it.
  const res = await fetch("/api/chat/conversations").catch(() => { throw new Error("加载会话列表失败") })
  if (!res.ok) throw new Error("加载会话列表失败")
  const json = (await res.json()) as { conversations: ConversationSummary[] }
  return json.conversations
}

/**
 * 未绑定作品的脑洞会话（W8 延迟建档）：归入虚拟作品「小说创作指引」，
 * 作为作品阁顶部的可折叠分组展示，点击子会话回到共创；没有时不占位置。
 * 与小说内「对话」节点共享 ["chat-conversations"] 缓存。
 */
function UnboundConversations({ expanded: groupExpanded, onToggle }: { expanded: boolean; onToggle(): void }) {
  const conversationId = useChatStore((s) => s.conversationId)
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["chat-conversations"], queryFn: fetchConversationSummaries })
  if (isPending) return <p role="status" className="flex items-center gap-2 px-5 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />指引会话加载中…</p>
  if (isError) return <div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button size="sm" variant="outline" onClick={() => void refetch()}>重试指引会话</Button></div>
  const unbound = (data ?? []).filter((c) => c.novelId === null)
  if (!unbound.length) return null
  return (
    <div>
      <TreeNode
        icon={Lightbulb}
        iconTone="theme"
        label={`小说创作指引（${unbound.length}）`}
        depth={0}
        expandable
        expanded={groupExpanded}
        onToggle={onToggle}
        onClick={onToggle}
        hoverCard={() => (
          <SidebarHoverCard
            data={{
              title: "小说创作指引",
              subtitle: "虚拟作品",
              icon: Lightbulb,
              blurb: "未建档的脑洞会话归档于此；在会话中确立作品后，会话自动移入对应作品之下。",
            }}
          />
        )}
      />
      {groupExpanded &&
        unbound.map((c) => (
          <TreeNode
            key={c.id}
            icon={MessageSquare}
            iconTone="conversations"
            label={c.title || "未命名会话"}
            depth={1}
            hoverCard={() => (
              <SidebarHoverCard
                data={{
                  title: c.title || "未命名会话",
                  wrapTitle: true,
                  subtitle: "脑洞会话（未建档）",
                  icon: MessageSquare,
                  meta: [`更新于 ${c.updatedAt.slice(5, 10)}`],
                }}
              />
            )}
            active={c.id === conversationId}
            onClick={() => useChatStore.getState().requestConversation(c.id)}
          />
        ))}
    </div>
  )
}

/**
 * 「对话」节点：列出当前小说的历史 AI 会话（与 ChatPanel 共享 ["chat-conversations"] 缓存）。
 * 点击子节点通过 chat store 请求切换会话，ChatPanel 监听后加载。
 */
function ConversationsNode({
  novel,
  expanded,
  toggle,
  flat = false,
}: {
  novel: NovelSummary
  expanded: Record<string, boolean>
  toggle: (key: string) => void
  flat?: boolean
}) {
  const conversationId = useChatStore((s) => s.conversationId)
  const convKey = `${novel.id}:conversations`
  const convExpanded = flat || (expanded[convKey] ?? true)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: fetchConversationSummaries,
  })

  const conversations = (data ?? []).filter(
    (c) => c.novelId === novel.id
  )

  return (
    <>
      {!flat && <TreeNode
        icon={MessageSquare}
        iconTone="conversations"
        label="对话"
        depth={1}
        hoverCard={staticHoverCard("对话", MessageSquare, "与创作参谋的历史会话，点击切换接着聊。")}
        expandable
        expanded={convExpanded}
        onToggle={() => toggle(convKey)}
        onClick={() => toggle(convKey)}
      />}
      {convExpanded &&
        (isLoading ? (
          <div className="flex justify-center py-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
          </div>
        ) : isError ? <div role="alert" className="px-5 py-2 text-xs text-destructive">{error.message}<Button size="sm" variant="outline" onClick={() => void refetch()}>重试对话</Button></div> : conversations.length === 0 ? (
          <TreeNode icon={MessageSquare} iconTone="conversations" label={flat ? "暂无对话" : "暂无会话"} depth={flat ? 1 : 2} dimmed />
        ) : (
          conversations.map((c) => (
            <TreeNode
              key={c.id}
              icon={MessageSquare}
              iconTone="conversations"
              label={c.title || "未命名会话"}
              depth={flat ? 1 : 2}
              hoverCard={() => (
                <SidebarHoverCard
                  data={{
                    title: c.title || "未命名会话",
                    wrapTitle: true,
                    subtitle: "AI 会话",
                    icon: MessageSquare,
                    meta: [`更新于 ${c.updatedAt.slice(5, 10)}`],
                  }}
                />
              )}
              active={c.id === conversationId}
              onClick={() => useChatStore.getState().requestConversation(c.id)}
            />
          ))
        ))}
    </>
  )
}

interface SidebarTreeProps {
  user: { id: string; name: string; email: string; avatarUrl?: string }
  /** 隐藏左侧导航栏（顶栏右侧的折叠按钮） */
  onToggleSidebar?: () => void
  /** The fixed drawer remains mounted while moving or hidden. */
  interactionPaused?: boolean
}

export function SidebarTree({ user, onToggleSidebar, interactionPaused = false }: SidebarTreeProps) {
  const queryClient = useQueryClient()
  const openTab = useTabsStore((s) => s.openTab)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const activeTab = useTabsStore(s => s.tabs.find(tab => tab.id === s.activeTabId))
  const closeAllTabsOfNovel = useTabsStore((s) => s.closeAllTabsOfNovel)
  const closeWorldTab = useTabsStore((s) => s.closeWorldTab)
  const renameNovelTab = useTabsStore((s) => s.renameNovelTab)
  const renameWorldTab = useTabsStore((s) => s.renameWorldTab)

  const { theme } = useTheme()
  // SSR false、客户端 true，避免 hydration 不一致（与 ThemeSwitcher 同款守卫）
  const themeMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const dataRoot = useDesktopStore(state => state.bootstrap?.dataRoot ?? "")
  const scope = `${user.id}:${dataRoot}`
  const navigationId = useId()
  const [view, setView] = useState<NavigationView>("works")
  const [expandedByView, setExpandedByView] = useState<Partial<Record<NavigationView, Record<string, boolean>>>>({})
  const expanded = expandedByView[view] ?? {}
  const setExpanded = (update: (previous: Record<string, boolean>) => Record<string, boolean>) => setExpandedByView(previous => { const before = previous[view] ?? {}, after = update(before); return after === before ? previous : { ...previous, [view]: after } })
  const pruneExpanded = (prefix: string, keys: string[]) => {
    const valid = new Set(keys)
    setExpandedByView(previous => {
      let changed = false
      const next = Object.fromEntries(Object.entries(previous).map(([name, values]) => {
        const entries = Object.entries(values ?? {}).filter(([key]) => !key.startsWith(prefix) || valid.has(key))
        if (entries.length === Object.keys(values ?? {}).length) return [name, values]
        changed = true; return [name, Object.fromEntries(entries)]
      }))
      return changed ? next : previous
    })
  }
  const [collapsedByView, setCollapsedByView] = useState<Partial<Record<NavigationView, Record<string, boolean>>>>({})
  const collapsed = collapsedByView[view] ?? {}
  const [transientEpoch, setTransientEpoch] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastNavigationFocus = useRef<{ element: HTMLElement; workId?: string } | null>(null)
  const tabRefs = useRef<Record<NavigationView, HTMLButtonElement | null>>({ works: null, settings: null, characters: null, content: null, conversations: null })
  const scroll = useNavigationScroll(view, scope, scrollRef)
  const [scenarioSession, setScenarioSession] = useState<ScenarioLibrarySession | null>(null)
  const scenarioSequence = useRef(0)
  const openScenario = (novel: NovelSummary, initialMode: "library" | "create", launcher: HTMLElement) => setScenarioSession({ id: ++scenarioSequence.current, novel, initialMode, launcher })
  const chooseView = (next: NavigationView) => { scroll.capture(); setTransientEpoch(value => value + 1); setView(next) }
  const toggleGroup = (id: string) => setCollapsedByView(previous => ({ ...previous, [view]: { ...previous[view], [id]: !previous[view]?.[id] } }))
  useLayoutEffect(() => {
    setView("works"); setExpandedByView({}); setCollapsedByView({}); setScenarioSession(null); setDialog(null); setCreateOpen(false); setTransientEpoch(value => value + 1)
  }, [scope])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [titleInput, setTitleInput] = useState("")
  /** 创建作品两步向导（书名 + 创作切入方式） */
  const [createOpen, setCreateOpen] = useState(false)
  useDesktopCommands({"file.new":()=>setCreateOpen(true),'file.import':()=>requestNovelImport().then(()=>{}),'file.import-folder':()=>requestNovelImport().then(()=>{})})

  const { data: novelList, isPending, isError, isFetching, refetch } = useNovelList()
  const novels = novelList?.novels
  const unavailableWorks = novelList?.unavailableWorks ?? []
  useLayoutEffect(() => {
    if (!novelList) return
    const ids = new Set([...novelList.novels.map(novel => novel.id), ...novelList.unavailableWorks.map(work => work.workId)])
    setCollapsedByView(previous => Object.fromEntries(Object.entries(previous).map(([key, values]) => [key, Object.fromEntries(Object.entries(values ?? {}).filter(([id]) => ids.has(id)))])))
    setExpandedByView(previous => Object.fromEntries(Object.entries(previous).map(([key, values]) => [key, Object.fromEntries(Object.entries(values ?? {}).filter(([id]) => id === "@unbound" || [...ids].some(owner => id === owner || id.startsWith(owner + ":"))))])))
    if (scenarioSession && !novelList.novels.some(novel => novel.id === scenarioSession.novel.id)) setScenarioSession(null)
  }, [novelList, scenarioSession])
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new MutationObserver(() => {
      const remembered = lastNavigationFocus.current
      if (!remembered || remembered.element.isConnected || (document.activeElement !== document.body && !document.activeElement?.closest("[hidden], [inert]"))) return
      const group = [...node.querySelectorAll<HTMLElement>(".nav-work-group")].find(element => element.dataset.workId === remembered.workId)
      const target = group?.querySelector<HTMLButtonElement>(".nav-group-toggle") ?? tabRefs.current[view]
      target?.focus()
    })
    observer.observe(node, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [view, scope])

  const invalidateNovels = () =>
    queryClient.invalidateQueries({ queryKey: ["novels"] })
  const leaseRepair = useWorkLeaseRepair(scope)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // isPending updates after render; a ref keeps two synchronous confirms single-flight.
  const removeFlight = useRef(false)
  const removeFaultedMutation = useMutation({
    mutationFn: async (work: UnavailableWork) => {
      const generic = "暂时无法删除作品，原数据已保留，请重试。"
      let res: Response
      try { res = await fetch(`/api/works/${work.workId}`, { method: "DELETE" }) } catch { throw new Error(generic) }
      if (res.ok) return
      const data = await res.json().catch(() => null) as { error?: string; code?: string } | null
      if (res.status === 404 && data?.code === "WORK_NOT_FOUND") return
      throw new Error(res.status >= 500 || !data?.error ? `${generic}关联对话可能已删除，请重试完成移除。` : data.error)
    },
    onMutate: () => setRemoveError(null),
    onSuccess: (_data, work) => {
      toast.success("作品已从列表中删除")
      closeAllTabsOfNovel(work.novelId)
      const chat = useChatStore.getState()
      if (chat.draftNovelId === work.novelId) chat.requestNewConversation()
      invalidateNovels()
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] })
      setDialog(null)
    },
    onError: (err) => setRemoveError(err.message),
    onSettled: () => { removeFlight.current = false },
  })
  const confirmRemove = (work: UnavailableWork) => {
    if (removeFlight.current) return
    removeFlight.current = true
    removeFaultedMutation.mutate(work)
  }
  const faultedActions: FaultedWorkActions = {
    repair: leaseRepair, reloading: isFetching, removing: removeFaultedMutation.isPending,
    reload: () => void refetch(), remove: work => { setRemoveError(null); setDialog({ type: "remove-faulted", work }) },
  }

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/novels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(await readError(res, "重命名失败"))
      return (await res.json()) as { novel: NovelSummary }
    },
    onSuccess: ({ novel }) => {
      toast.success("已重命名")
      renameNovelTab(novel.id, novel.title)
      invalidateNovels()
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/novels/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await readError(res, "删除失败"))
    },
    onSuccess: (_data, id) => {
      toast.success("小说已删除")
      closeAllTabsOfNovel(id)
      invalidateNovels()
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const invalidateWorlds = (novelId: string) =>
    queryClient.invalidateQueries({ queryKey: ["worlds", novelId] })

  const createWorldMutation = useMutation({
    mutationFn: async ({
      novel,
      parentWorld,
      name,
    }: {
      novel: NovelSummary
      parentWorld?: WorldRecord
      name: string
    }) => {
      const res = await fetch(`/api/novels/${novel.id}/worlds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: parentWorld?.id ?? null }),
      })
      if (!res.ok) throw new Error(await readError(res, "创建失败"))
      return (await res.json()) as { world: WorldRecord }
    },
    onSuccess: ({ world }, { novel, parentWorld }) => {
      toast.success(`世界「${world.name}」已创建`)
      invalidateWorlds(novel.id)
      setDialog(null)
      openTab({
        id: buildTabId("world", novel.id, { refId: world.id }),
        type: "world",
        novelId: novel.id,
        refId: world.id,
        title: world.name,
      })
      // 展开世界观分组与父世界节点，让新世界立即可见
      setExpanded((prev) => ({
        ...prev,
        [`${novel.id}:worlds`]: true,
        ...(parentWorld ? { [`${novel.id}:world:${parentWorld.id}`]: true } : {}),
      }))
    },
    onError: (err) => toast.error(err.message),
  })

  const renameWorldMutation = useMutation({
    mutationFn: async ({
      novel,
      world,
      name,
    }: {
      novel: NovelSummary
      world: WorldRecord
      name: string
    }) => {
      const res = await fetch(`/api/novels/${novel.id}/worlds/${world.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await readError(res, "重命名失败"))
      return (await res.json()) as { world: WorldRecord }
    },
    onSuccess: ({ world }, { novel }) => {
      toast.success("已重命名")
      renameWorldTab(world.id, world.name)
      invalidateWorlds(novel.id)
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteWorldMutation = useMutation({
    mutationFn: async ({ novel, world }: { novel: NovelSummary; world: WorldRecord }) => {
      const res = await fetch(`/api/novels/${novel.id}/worlds/${world.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(await readError(res, "删除失败"))
    },
    onSuccess: (_data, { novel, world }) => {
      toast.success(`世界「${world.name}」已删除`)
      // 关闭被删世界及其所有子孙世界的 tab（此时缓存仍是删除前的世界列表）
      const cached =
        queryClient.getQueryData<{ worlds: WorldRecord[] }>(["worlds", novel.id])?.worlds ??
        []
      const doomed = new Set([world.id])
      let grew = true
      while (grew) {
        grew = false
        for (const w of cached) {
          if (w.parentId && doomed.has(w.parentId) && !doomed.has(w.id)) {
            doomed.add(w.id)
            grew = true
          }
        }
      }
      doomed.forEach((id) => closeWorldTab(id))
      invalidateWorlds(novel.id)
      setDialog(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))

  const openNovelTab = (novel: NovelSummary) =>
    openTab({
      id: buildTabId("novel", novel.id),
      type: "novel",
      novelId: novel.id,
      title: novel.title,
    })

  const openSimpleTab = (type: TabType, novel: NovelSummary, title: string) =>
    openTab({ id: buildTabId(type, novel.id), type, novelId: novel.id, title })

  const openSettingTab = (novel: NovelSummary, settingType: SettingType) =>
    openTab({
      id: buildTabId("setting", novel.id, { settingType }),
      type: "setting",
      novelId: novel.id,
      settingType,
      title: SETTING_TYPE_LABELS[settingType],
    })

  const openTitleDialog = (
    state: DialogState & { type: "rename" | "world-create" | "world-rename" }
  ) => {
    setTitleInput(
      state.type === "rename"
        ? state.novel.title
        : state.type === "world-rename"
          ? state.world.name ?? ""
          : ""
    )
    setDialog(state)
  }

  const submitTitleDialog = () => {
    const title = titleInput.trim()
    if (!title) return
    if (dialog?.type === "rename") renameMutation.mutate({ id: dialog.novel.id, title })
    if (dialog?.type === "world-create") {
      createWorldMutation.mutate({ novel: dialog.novel, parentWorld: dialog.parentWorld, name: title })
    }
    if (dialog?.type === "world-rename") {
      renameWorldMutation.mutate({ novel: dialog.novel, world: dialog.world, name: title })
    }
  }

  const renderSettings = (novel: NovelSummary, depth: number) => <>
                        <TreeNode
                          icon={Lightbulb}
                          iconTone="theme"
                          label="主题"
                          depth={depth}
                          hoverCard={() => <ThemeHoverCard novel={novel} />}
                          active={activeTabId === buildTabId("theme", novel.id)}
                          onClick={() => openSimpleTab("theme", novel, "主题")}
                        />
                        {/* 文风是整书唯一的写作基调，紧跟主题展示；侧栏简称「文风」 */}
                        <TreeNode
                          icon={getTabIcon({ type: "setting", settingType: "STYLE" })}
                          iconTone="style"
                          label="文风"
                          depth={depth}
                          hoverCard={() => (
                            <SettingTypeHoverCard novel={novel} settingType="STYLE" />
                          )}
                          active={
                            activeTabId === buildTabId("setting", novel.id, { settingType: "STYLE" })
                          }
                          onClick={() => openSettingTab(novel, "STYLE")}
                        />
                        <TreeNode
                          icon={Globe}
                          iconTone="world"
                          label="世界观"
                          depth={depth}
                          hoverCard={staticHoverCard("世界观", Globe, "世界与子世界的树状容器，设定条目挂在具体世界之下。")}
                          expandable
                          expanded={expanded[`${novel.id}:worlds`] ?? true}
                          onToggle={() => toggle(`${novel.id}:worlds`)}
                          onClick={() => toggle(`${novel.id}:worlds`)}
                          action={
                            <button
                              type="button"
                              aria-label="创建世界"
                              title="创建世界"
                              onClick={(e) => {
                                e.stopPropagation()
                                openTitleDialog({ type: "world-create", novel })
                              }}
                              className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          }
                        />
                        {(expanded[`${novel.id}:worlds`] ?? true) && (
                          <WorldSubtree
                            depth={depth + 1}
                            pruneExpanded={pruneExpanded}
                            novel={novel}
                            expanded={expanded}
                            toggle={toggle}
                            onCreateChild={(parent) =>
                              openTitleDialog({ type: "world-create", novel, parentWorld: parent })
                            }
                            onRename={(world) =>
                              openTitleDialog({ type: "world-rename", novel, world })
                            }
                            onDelete={(world) => setDialog({ type: "world-delete", novel, world })}
                          />
                        )}
                        {NOVEL_SETTING_TYPE_ORDER.filter((t) => t !== "STYLE").map((settingType) => (
                          <TreeNode
                            key={settingType}
                            icon={settingType === "GOLD_FINGER" ? Pointer : getTabIcon({ type: "setting", settingType })}
                            iconTone={settingTone(settingType)}
                            label={SETTING_TYPE_LABELS[settingType]}
                            depth={depth}
                            hoverCard={() => (
                              <SettingTypeHoverCard novel={novel} settingType={settingType} />
                            )}
                            active={
                              activeTabId ===
                              buildTabId("setting", novel.id, { settingType })
                            }
                            onClick={() => openSettingTab(novel, settingType)}
                          />
                        ))}
                        {/* 伏笔：情节线索档案（金手指下方，埋入/提及/回收追踪） */}
                        <TreeNode
                          icon={Flag}
                          iconTone="foreshadow"
                          label="伏笔"
                          depth={depth}
                          hoverCard={staticHoverCard("伏笔", Flag, "情节线索档案：追踪每条伏笔的埋入、提及与回收位置，生成与评审时自动带入上下文。")}
                          active={activeTabId === buildTabId("foreshadow", novel.id)}
                          onClick={() => openSimpleTab("foreshadow", novel, "伏笔")}
                        />
                        <TreeNode
                          icon={Heart}
                          iconTone="trope"
                          label="爽点/泪点"
                          depth={depth}
                          hoverCard={staticHoverCard("爽点/泪点", Heart, "选中的爽点与泪点条目，生成大纲与正文时的情绪坐标。")}
                          active={activeTabId === buildTabId("trope", novel.id)}
                          onClick={() => openSimpleTab("trope", novel, "爽点/泪点")}
                        />


  </>
  const renderSettingExtras = (novel: NovelSummary) => <>
                    {/* 物品：纯入口（不再平铺物品子节点），点击打开管理面板；详情 tab 从面板卡片/芯片/悬停卡进入 */}
                    <TreeNode
                      icon={Package}
                      iconTone="items"
                      label="物品"
                      depth={1}
                      hoverCard={staticHoverCard("物品", Package, "道具、法宝、信物等物件档案，可在正文中按名引用。")}
                      active={activeTabId === buildTabId("items", novel.id)}
                      onClick={() => openSimpleTab("items", novel, "物品")}
                    />
                    <TreeNode icon={FlaskConical} iconTone="scenario" label="情景试验场" depth={1}
                      hoverCard={staticHoverCard("情景试验场", FlaskConical, "多代理跑一段假设剧情，验证设定与角色反应的试验台。")}
                      active={activeTab?.type === "scenario" && activeTab.novelId === novel.id}
                      onActivate={element => openScenario(novel, "library", element)}
                      action={<button type="button" aria-label="新建情景试验场" title="新建情景试验场" onClick={event => { event.stopPropagation(); openScenario(novel, "create", event.currentTarget) }} className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-muted-foreground/15"><Plus className="size-3.5" /></button>}
                    />
                    <TreeNode icon={MapPin} iconTone="scenes" label="场景" depth={1}
                      hoverCard={staticHoverCard("场景", MapPin, "反复出现的地点场景档案，供正文与对话引用。")}
                      active={!!activeTab && ["scenes", "scene", "scene-image"].includes(activeTab.type) && activeTab.novelId === novel.id}
                      onClick={() => openAllScenes(novel.id)}
                    />
                    <TreeNode icon={ChartNoAxesGantt} iconTone="worldline" label="世界线" depth={1} active={activeTabId === buildTabId("worldline", novel.id)} onClick={() => openSimpleTab("worldline", novel, "世界线")} />
                    <TreeNode icon={ListTree} iconTone="narrative" label="叙事线" depth={1} active={activeTabId === buildTabId("narrative", novel.id)} onClick={() => openSimpleTab("narrative", novel, "叙事线")} />
                    <TreeNode
                      icon={ListTree}
                      iconTone="outline"
                      label="大纲"
                      depth={1}
                      hoverCard={staticHoverCard("大纲", ListTree, "叙事线分卷定章后的只读投影，前往叙事线修改。")}
                      active={activeTabId === buildTabId("outline", novel.id)}
                      onClick={() => openSimpleTab("outline", novel, "大纲")}
                    />

  </>

  /** The exact original healthy-work menu, shared by … and right-click. */
  const novelMenuItems = (novel: NovelSummary) => <>
    <DropdownMenuItem
      onClick={() => openTitleDialog({ type: "rename", novel })}
    >
      <Pencil />
      重命名
    </DropdownMenuItem>
    <DropdownMenuItem
      variant="destructive"
      onClick={() => setDialog({ type: "delete", novel })}
    >
      <Trash2 />
      删除
    </DropdownMenuItem>
  </>

  const submitting =
    renameMutation.isPending ||
    createWorldMutation.isPending ||
    renameWorldMutation.isPending

  return (
    <NavigationTransientBoundary paused={interactionPaused} epoch={transientEpoch}><SidebarHoverProvider>
    <div className="sidebar-navigation flex h-full flex-col bg-sidebar text-sidebar-foreground" onFocusCapture={event => { if (event.currentTarget.contains(event.target)) lastNavigationFocus.current = { element: event.target, workId: event.target.closest<HTMLElement>(".nav-work-group")?.dataset.workId } }}>
      <SidebarWindowControls onToggleSidebar={onToggleSidebar} />
      <div className="sidebar-brand"><span aria-hidden="true"><Seal variant="mark" className="brand-logo size-[30px]" /></span><span className="brand-title">玄印写作</span></div>
      <div className="create-actions">
        <button type="button" className="create-action" onClick={() => setCreateOpen(true)}><NotebookPen aria-hidden="true" size={18} strokeWidth={1.7} /><NavigationLabel>创建作品</NavigationLabel></button>
        <button type="button" className="create-action" onClick={()=>void requestNovelImport()}><FileInput aria-hidden="true" size={18} strokeWidth={1.7}/><NavigationLabel>导入作品</NavigationLabel></button>
        <NovelImportTaskButton/>
        <button type="button" className="create-action" onClick={() => useChatStore.getState().requestNewConversation()}><MessageCirclePlus aria-hidden="true" size={18} strokeWidth={1.7} /><NavigationLabel>新对话</NavigationLabel></button>
      </div>
      <div role="tablist" aria-label="导航分类" className="nav-tabs">
        {NAVIGATION_VIEWS.map(item => <button key={item} ref={node => { tabRefs.current[item] = node }} id={navigationId + "-" + item} role="tab" type="button" aria-selected={view === item} aria-controls={navigationId + "-panel"} tabIndex={view === item ? 0 : -1} className="nav-tab" onClick={() => chooseView(item)} onKeyDown={event => { const index = NAVIGATION_VIEWS.indexOf(item); const next = event.key === "ArrowRight" ? (index + 1) % 5 : event.key === "ArrowLeft" ? (index + 4) % 5 : event.key === "Home" ? 0 : event.key === "End" ? 4 : -1; if (next >= 0) { event.preventDefault(); chooseView(NAVIGATION_VIEWS[next]); tabRefs.current[NAVIGATION_VIEWS[next]]?.focus() } }}><NavigationLabel>{NAVIGATION_LABELS[item]}</NavigationLabel></button>)}
      </div>

      <div ref={scrollRef} id={navigationId + "-panel"} role="tabpanel" aria-labelledby={navigationId + "-" + view} className="tree-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pt-0.5 pb-3">
        <div className="nav-panel-content">
        {(view === "works" || view === "conversations") && <UnboundConversations expanded={expanded["@unbound"] ?? true} onToggle={() => toggle("@unbound")} />}
        {!isError && unavailableWorks.map(work => view === "works"
          ? <FaultedWorkRow key={`${scope}:${work.workId}`} work={work} actions={faultedActions} />
          : <FaultedWorkGroup key={`${scope}:${work.workId}`} work={work} view={view} collapsed={!!collapsed[work.workId]} onToggle={() => toggleGroup(work.workId)} actions={faultedActions} />)}
        {isError && (
          <div role="alert" className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <AlertCircle className="size-6 text-destructive" />
            <p className="text-sm font-medium">作品加载失败</p>
            <p className="text-xs text-muted-foreground">
              暂时无法获取作品列表，请稍后重试。
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              {isFetching ? "正在重新加载…" : "重新加载作品"}
            </Button>
          </div>
        )}
        {isPending ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !isError && novels?.length === 0 && unavailableWorks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BookOpen className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              还没有小说
              <br />
              点击上方「创建作品」开始你的第一部作品吧
            </p>
          </div>
        ) : (
          novels?.map((novel) => {
            const novelExpanded = expanded[novel.id] ?? true
            const novelTabId = buildTabId("novel", novel.id)
            const settingKey = `${novel.id}:setting`
            const characterKey = `${novel.id}:character`
            const contentKey = `${novel.id}:content`
            if (view !== "works") return <NavigationWorkGroup key={`${scope}:${novel.id}`} id={novel.id} title={novel.title} view={view} collapsed={!!collapsed[novel.id]} onToggle={() => toggleGroup(novel.id)} action={view === "content" ? <OutlineTreeMenu novel={novel} kind="content" /> : undefined}>
              {view === "settings" ? <>{renderSettings(novel, 1)}{renderSettingExtras(novel)}</> : view === "characters" ? <CharacterSubtree novel={novel} expanded={expanded} toggle={toggle} flat /> : view === "content" ? <OutlineSubtree novel={novel} kind="content" expanded={expanded} toggle={toggle} depth={1} pruneExpanded={pruneExpanded} /> : <ConversationsNode novel={novel} expanded={expanded} toggle={toggle} flat />}
            </NavigationWorkGroup>
            return (
              <div key={`${scope}:${novel.id}`}>
                <RowContextMenu items={novelMenuItems(novel)}>
                <TreeNode
                  icon={novelExpanded ? FolderOpen : FolderClosed}
                  iconTone="work"
                  avatar={
                    novel.coverUrl ? (
                      <span className="relative aspect-[2/3] h-5 shrink-0 overflow-hidden rounded-[3px]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 本地封面缩略图 */}
                        <img
                          src={novel.coverUrl}
                          alt={novel.title}
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ) : undefined
                  }
                  label={novel.title}
                  tag={isTentativeNovelTitle(novel.title) ? <TentativeBadge /> : undefined}
                  hoverCard={() => <NovelHoverCard novel={novel} />}
                  depth={0}
                  expandable
                  expanded={novelExpanded}
                  active={activeTabId === novelTabId}
                  onToggle={() => toggle(novel.id)}
                  onClick={() => {
                    openNovelTab(novel)
                    if (!novelExpanded) toggle(novel.id)
                  }}
                  action={
                    <NavigationMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label="小说操作"
                            onClick={(e) => e.stopPropagation()}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 data-popup-open:opacity-100"
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <NavigationMenuContent align="start" className="w-auto min-w-28">
                        {novelMenuItems(novel)}
                      </NavigationMenuContent>
                    </NavigationMenu>
                  }
                />
                </RowContextMenu>

                {novelExpanded && (
                  <>
                    <TreeNode
                      icon={Settings2}
                      iconTone="settings"
                      label="设定"
                      depth={1}
                      hoverCard={staticHoverCard("设定", Settings2, "主题、世界观与金手指/文风等作品级设定的档案区。")}
                      expandable
                      expanded={expanded[settingKey] ?? true}
                      onToggle={() => toggle(settingKey)}
                      onClick={() => toggle(settingKey)}
                    />
                    {(expanded[settingKey] ?? true) && (
                      <>
                        {renderSettings(novel, 2)}
                      </>
                    )}
                    <TreeNode
                      icon={Users}
                      iconTone="characters"
                      label="角色"
                      depth={1}
                      hoverCard={() => <CharactersHeaderHoverCard novel={novel} />}
                      expandable
                      expanded={expanded[characterKey] ?? true}
                      active={activeTabId === buildTabId("characters", novel.id)}
                      onToggle={() => toggle(characterKey)}
                      onClick={() => {
                        openSimpleTab("characters", novel, "角色")
                        if (!(expanded[characterKey] ?? true)) toggle(characterKey)
                      }}
                    />
                    {(expanded[characterKey] ?? true) && (
                      <CharacterSubtree novel={novel} expanded={expanded} toggle={toggle} />
                    )}
                    {renderSettingExtras(novel)}
                    <TreeNode
                      icon={FileText}
                      iconTone="content"
                      label="正文"
                      depth={1}
                      hoverCard={staticHoverCard("正文", FileText, "章节正文写作区，含字数与写作/定稿状态。")}
                      expandable
                      expanded={expanded[contentKey] ?? true}
                      action={<OutlineTreeMenu novel={novel} kind="content" />}
                      onToggle={() => toggle(contentKey)}
                      onClick={() => toggle(contentKey)}
                    />
                    {(expanded[contentKey] ?? true) && (
                      <OutlineSubtree
                        novel={novel}
                        pruneExpanded={pruneExpanded}
                        kind="content"
                        expanded={expanded}
                        toggle={toggle}
                      />
                    )}
                    <TreeNode
                      icon={Workflow}
                      iconTone="progress"
                      label="创作进度"
                      depth={1}
                      hoverCard={staticHoverCard("创作进度", Workflow, "六环节进度、待审核产物与设定评审入口。")}
                      active={activeTabId === buildTabId("story-workflow", novel.id)}
                      onClick={() => openSimpleTab("story-workflow", novel, "创作进度")}
                    />
                    <TreeNode
                      icon={ClipboardCheck}
                      iconTone="review"
                      label="创作评审"
                      depth={1}
                      hoverCard={staticHoverCard("创作评审", ClipboardCheck, "全部创作检查点的评分与评审意见总览。")}
                      active={activeTabId === buildTabId("story-review", novel.id)}
                      onClick={() => openSimpleTab("story-review", novel, "创作评审")}
                    />
                    <CascadeNode novel={novel} />
                    <ConversationsNode novel={novel} expanded={expanded} toggle={toggle} />
                  </>
                )}
              </div>
            )
          })
        )}
        </div>
      </div>

      <div className="account-footer flex shrink-0 items-center justify-between gap-2 border-t border-sidebar-border">
        <NavigationMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`账号菜单：${user.name} ${user.email}`}
                className="account-button flex min-w-0 flex-1 items-center rounded-[7px] text-left transition-colors hover:bg-hover-wash"
              />
            }
          >
            <span className="avatar relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-active-wash text-[11px] font-semibold text-primary">
              {user.name.slice(0, 1).toUpperCase()}
              {user.avatarUrl && <img key={user.avatarUrl} src={user.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.hidden = true }} />}
            </span>
            <span className="account-text flex min-w-0 flex-1 flex-col">
              <NavigationLabel className="account-name font-medium">{user.name}</NavigationLabel>
              {user.email && <NavigationLabel className="account-email font-mono text-muted-foreground">{user.email}</NavigationLabel>}
            </span>
          </DropdownMenuTrigger>
          <NavigationMenuContent side="top" align="start">
            {/* 用户信息（Label 不可点击）：头像 + 用户名（大字）+ 邮箱（小字 muted） */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2">
                <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-active-wash text-[13px] font-semibold text-primary">
                  {user.name.slice(0, 1).toUpperCase()}
                  {user.avatarUrl && <img key={user.avatarUrl} src={user.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.hidden = true }} />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <NavigationLabel className="text-[15px] leading-[1.35] font-semibold text-foreground">{user.name}</NavigationLabel>
                  {user.email && <NavigationLabel className="font-mono text-[11px] leading-[1.4] text-muted-foreground">{user.email}</NavigationLabel>}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* 外观主题选择（宣纸 ⇄ 玄墨，switch 控件）：替代原顶栏主题按钮的入口 */}
            <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm select-none">
              <Palette className="size-4 text-muted-foreground" />
              <span>外观</span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                宣纸
                <Switch
                  size="sm"
                  aria-label="外观主题（宣纸 / 玄墨）"
                  checked={themeMounted ? theme === "ink" : false}
                  onCheckedChange={(checked) => { void updateDesktopSettings(settings => ({ ...settings, appearance: { ...settings.appearance, theme: checked ? "ink" : "paper" } })).catch(error => toast.error(error.message)) }}
                />
                玄墨
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { void window.desktop?.command("app.settings") }}>
              <Settings />
              设置
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CircleHelp />
                帮助
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => { void window.desktop?.command("help.website") }}>
                  <Globe />
                  官网
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { void window.desktop?.command("help.docs") }}>
                  <BookOpen />
                  产品介绍
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { void window.desktop?.command("help.guide") }}>
                  <BookOpenText />
                  用户指南
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { void window.desktop?.command("help.faq") }}>
                  <CircleQuestionMark />
                  常见问题
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => { void window.desktop?.command("help.feedback") }}>
              <MessageSquareWarning />
              问题反馈
            </DropdownMenuItem>
          </NavigationMenuContent>
        </NavigationMenu>

      </div>

      <Dialog
        open={
          dialog?.type === "rename" ||
          dialog?.type === "world-create" ||
          dialog?.type === "world-rename"
        }
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "rename"
                ? "重命名小说"
                : dialog?.type === "world-rename"
                  ? "重命名世界"
                  : dialog?.type === "world-create" && dialog.parentWorld
                    ? `新建子世界 · ${dialog.parentWorld.name}`
                    : "新建世界"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === "rename"
                ? "为你的小说起一个新名字。"
                : "为世界起一个名字；创建后先只有世界观介绍，可按需添加等级、力量体系、地图等设定。"}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitTitleDialog()
            }}
            className="flex flex-col gap-4"
          >
            <Input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={
                dialog?.type === "world-create" || dialog?.type === "world-rename"
                  ? "如：修真世界、现实世界、大千世界"
                  : "请输入书名"
              }
              maxLength={100}
            />
            <DialogFooter>
              <Button type="submit" disabled={!titleInput.trim() || submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {dialog?.type === "rename" || dialog?.type === "world-rename"
                  ? "保存"
                  : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.type === "delete" || dialog?.type === "world-delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "world-delete" ? "删除世界" : "删除小说"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === "world-delete"
                ? `确定要删除世界「${dialog.world.name}」吗？其下的子世界与全部设定将一并删除，该操作不可撤销。`
                : `确定要删除《${dialog?.type === "delete" ? dialog.novel.title : ""}》吗？删除后将不再显示在列表中。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || deleteWorldMutation.isPending}
              onClick={() => {
                if (dialog?.type === "delete") deleteMutation.mutate(dialog.novel.id)
                if (dialog?.type === "world-delete") {
                  deleteWorldMutation.mutate({ novel: dialog.novel, world: dialog.world })
                }
              }}
            >
              {(deleteMutation.isPending || deleteWorldMutation.isPending) && (
                <Loader2 className="animate-spin" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog?.type === "remove-faulted"}
        onOpenChange={(open) => { if (!open && !removeFaultedMutation.isPending) setDialog(null) }}
      >
        <DialogContent showCloseButton={!removeFaultedMutation.isPending}>
          <DialogHeader>
            <DialogTitle>删除作品</DialogTitle>
            <DialogDescription>
              {dialog?.type === "remove-faulted" ? `确定要从作品列表中删除《${dialog.work.title}》吗？与该作品关联的对话将一并删除。` : ""}
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "remove-faulted" && <div className="space-y-2 text-sm text-muted-foreground">
            <p>作品目录中的文件不会被改动。{dialog.work.reason === "stale-lease" ? "" : "目录恢复后，可通过“打开作品目录”重新加入。"}</p>
            {dialog.work.reason === "stale-lease" && <p className="flex gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-foreground"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />该作品只是留有异常退出的写入锁，建议先使用“修复作品锁”。删除后如需重新加入，需要先手动移除作品目录中的锁文件夹。</p>}
            {removeError && <p role="alert" className="text-xs text-destructive">{removeError}</p>}
          </div>}
          <DialogFooter>
            <Button variant="outline" disabled={removeFaultedMutation.isPending} onClick={() => setDialog(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={removeFaultedMutation.isPending}
              onClick={() => { if (dialog?.type === "remove-faulted") confirmRemove(dialog.work) }}
            >
              {removeFaultedMutation.isPending && <Loader2 className="animate-spin" />}
              {removeFaultedMutation.isPending ? "正在删除…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateNovelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        novels={novels ?? []}
      />

      <ScenarioLibraryDialog session={scenarioSession} scope={scope} onClose={() => setScenarioSession(null)} fallbackFocus={() => tabRefs.current[view]} />
    </div>
    </SidebarHoverProvider></NavigationTransientBoundary>
  )
}
