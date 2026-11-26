# 609 · 作品菜单增加编辑、创建、导出项 技术方案

## 1. 需求（用户 2026-11-26）

作品行菜单（`…` 按钮和右键菜单，两处内容相同）当前只有「重命名」「删除」。在两者之间加入：

1. 「编辑」：在右侧面板区打开该作品的编辑面板。用户确认：打开现有「主题」面板（书名、封面、简介、频道、篇幅、题材、标签、核心卖点、目标受众、参考案例都在这里编辑，自动保存），不新建面板。
2. 创建类：「创建角色」「创建物品」「创建场景」「创建情景」，用户确认再加「创建世界」「创建伏笔」。
3. 导出类：「导出大纲」「导出正文」，各有子菜单选择格式。用户确认格式与正文树整书导出相同：TXT 文本 (.txt)、Markdown (.md)、Word (.docx)、PDF (.pdf)。范围是整书。

创建角色/物品的行为用户确认“与面板按钮相同”。

菜单结构（分隔栏把功能分组，与 `OutlineTreeMenu` 的写法一致）：

```
重命名
编辑
────────
创建角色
创建物品
创建场景
创建情景
创建世界
创建伏笔
────────
导出大纲 ▸  TXT 文本 (.txt) / Markdown (.md) / Word (.docx) / PDF (.pdf)
导出正文 ▸  同上
────────
删除
```

不可用作品（`FaultedWorkMenuItems`）菜单不变：它没有可读的作品数据。

## 2. 现状

- `src/components/layout/SidebarTree.tsx` 的 `novelMenuItems(novel)` 同时供 `…` 下拉菜单（`NavigationMenuContent`）和右键菜单（`RowContextMenu` → `ContextMenuContent`）使用。只有“作品”视图的作品行使用它；设定/角色/正文/对话视图的分组标题有各自的菜单，本次不改。
- 主题面板：`openSimpleTab("theme", novel, "主题")`（侧栏“主题”节点同一调用）。
- 角色：`CharactersPanel` 的「新建角色」`POST /api/novels/:id/characters {name:"新角色", roleType:"PROTAGONIST"}`，成功后刷新 `["characters",id]`、`["novels"]`、`["novels",id]`，打开角色 tab，提示“已创建角色「新角色」，点击编辑资料”。
- 物品：`ItemsPanel` 的「新建物品」`POST /api/novels/:id/items {name:"新物品"}`，刷新 `["items",id]`，打开物品 tab，提示“已创建物品「新物品」，点击编辑资料”。
- 场景：需要输入名称。侧栏场景树的“创建”动作（`GlobalSceneTree`）调用 `useSceneUiStore.requestAction(novelId, sceneId, "create")` 后 `openAllScenes(novelId)`，`SceneWorkspace` 在自己成为活动 tab 时消费该请求并打开“创建子场景/根场景”对话框。
- 情景：侧栏“情景试验场”节点的 `+` 调用 `openScenario(novel, "create", launcher)`，打开 `ScenarioLibraryDialog` 的创建模式。
- 世界：侧栏“世界观”节点的 `+` 调用 `openTitleDialog({type:"world-create", novel})`，输入名称后创建并打开世界 tab。
- 伏笔：`ForeshadowPanel` 的 `+` 以“未命名伏笔 n”（取未占用的最小 n）`POST /api/novels/:id/foreshadows {title}`，成功后刷新 `["foreshadows",id]` 并选中新伏笔。
- 整书导出：`OutlineTreeMenu.exportCollection(format, kind)`，不传 `volume` 时 `GET /api/novels/:id/manuscript?kind=content|outline`，用编辑器中未保存的草稿替换章节文本（同一章多个草稿不同则报错），再 `createCollectionExport` + `downloadManuscript`（桌面走原生保存对话框）。同一时间只允许一个导出任务；组件卸载时取消。

## 3. 方案

### 3.1 编辑

`编辑` → `openSimpleTab("theme", novel, "主题")`。图标 `SquarePen`（与重命名的 `Pencil` 区分）。

### 3.2 创建

在 `SidebarTree` 中新增与面板一致的调用，不改面板界面：

| 菜单项 | 动作 |
|---|---|
| 创建角色 | 与面板相同的 POST、刷新、打开 tab、提示 |
| 创建物品 | 与面板相同的 POST、刷新、打开 tab、提示 |
| 创建场景 | 与场景工作区目录的“创建根场景”相同（审核中3）：设置 `openAllScenes` 同样的 pref，`await openTabForNavigation(scenesTab, signal)`；返回 `true`（场景 tab 已成为活动 tab）后才 `requestAction(novel.id, null, "create")`。离开守卫失败时返回 `false`，不写入请求，因此不会残留。`scene-ui` 中 `action.sceneId` 类型放宽为 `string \| null`（`SceneWorkspace.startCreate` 本就接受 `null`；`SceneEditor` 忽略 `create` 类型） |
| 创建情景 | `openScenario(novel, "create", 作品行)`；作品行元素从菜单触发点 `closest(".tree-row")` 取得（右键时取 `RowContextMenu` 包裹的行），关闭后焦点回到该行（审核低5） |
| 创建世界 | `openTitleDialog({type:"world-create", novel})` |
| 创建伏笔 | `ensureQueryData` 读 `["foreshadows",id]`（queryFn 与面板相同，返回 `{ foreshadows }`），按面板同样规则取名，POST，刷新列表；`await openTabForNavigation(foreshadowTab)` 返回 `true` 后才 `requestPanelFocus(tabId, "", undefined, foreshadow.id)`。提示“已创建伏笔「未命名伏笔 n」”——面板的 `+` 没有提示，因为新条目就出现在用户眼前；菜单触发时用户可能看不到面板，所以加提示（与面板的有意差异） |

- 取名规则从 `ForeshadowPanel` 抽出为导出函数 `nextForeshadowTitle(titles)`，面板与菜单共用，行为不变。
- 已知行为（与面板 `+` 相同）：伏笔 tab 中当前条目有未保存修改时，选中新伏笔会丢弃这些修改。
- 失败一律 `toast.error(服务端文案)`，不打开 tab。
- 防重复（审核低4）：每个创建 mutation 进行中时，该作品菜单中对应项禁用。
- 导航（场景、伏笔）用 `openTabForNavigation(tab, new AbortController().signal)`：
  - 返回 `false`（守卫挂起期间用户切到别的 tab）：不写场景请求/伏笔聚焦，不提示。
  - reject（守卫失败）：`toast.error(错误文案 ?? "草稿尚未保存，请重试或明确放弃")`，与 `afterSceneLeave` 相同；不写请求。
  - 伏笔：POST 已成功，导航失败时仍提示“已创建伏笔「…」”（记录确实已创建），只是不打开、不选中。

### 3.3 导出

把 `OutlineTreeMenu` 中的 `exportCollection` 与 `exporting/exportJob` 抽成同文件导出的 hook `useCollectionExport()`：

- 返回 `{ exporting, exportingNovelId, exportCollection(novel, format, kind, volume?), cancel(novelId?) }`。`prefix` 与“整书/本卷”文案改由参数计算（审核中4）。
- `cancel(novelId?)`：未传或等于当前任务的作品 id 时，依次 `abort`、ref 置空、`setExporting(false)`。卸载时只 `abort` 并置空 ref，不调用 setState。
- `OutlineTreeMenu` 改用它，保留“`novel.id`、`volume.id`、`kind` 变化时取消”的 effect（调用 `cancel()`）；EXB16-05 作为不回归用例。
- 作品菜单：菜单弹层关闭即卸载，任务不能放在菜单内容里。`SidebarTree` 顶层持有一个 `useCollectionExport()`，`novelMenuItems(novel)` 的两个子菜单调用它（不传 `volume`，即整书），子菜单内容复用 `ManuscriptExportItems`。
- 作品菜单同一时间只允许一个整书导出任务，导出中所有作品菜单的格式项禁用；与正文树菜单的任务互不影响（审核低6）。
- 取消（审核高1）：删除作品成功时 `cancel(work.novelId)`；`scope`（数据目录）变化的 `useLayoutEffect` 中 `cancel()`。取消后 `downloadManuscript` 收到 abort，不写文件。
- 桌面保存全局只允许一个任务（`src/lib/desktop/export.ts:18`）：作品菜单导出停在保存对话框时，正文树菜单格式项虽可点，点下去提示“已有文件正在保存，请稍后重试”。这是现有行为，不改。
- 子菜单写成 `<DropdownMenuSub key=…>`；同时把 SH-04 改为从 `app.settings` 位置之后查找 `<DropdownMenuSub>`（审核中1）。

### 3.4 不改

- 面板组件（Characters/Items/Scene/Scenario/Theme）的界面与行为；ForeshadowPanel 只抽出取名函数。
- 设定/角色/正文/对话视图的分组菜单、不可用作品菜单。
- 服务端接口。

## 4. 测试

- 单元：`nextForeshadowTitle` 取未占用的最小 n；SH-04 改查找起点。
- 浏览器：`tests/browser/works-loading.test.ts` 只改 WN-56'（菜单结构）；各项行为放在新文件 `tests/browser/work-menu-items.test.ts`（渲染真实场景/伏笔面板）；导出放在 `tests/browser/file-export.test.ts` 新增的 `sidebar`、`volume` 模式。场景创建覆盖 WM-06a–g 共七种情况。
- 失败提示与面板相同：`apiSend` 不包装 `fetch` 本身抛出的异常，菜单也不另加兜底文案。
- 期望随 609 改变的已有检查（不计为新通过）：WN-56'、SH-04、`scripts/verify-faulted-work-nodes.mjs:99`（健康作品右键菜单改为新的 11 项）。
- 用例细节与夹具改动见 `docs/609-work-menu-items-cases.md`。
- 真实目标：构建版 Electron、隔离 `SHAKEINK_TEST_ROOT`、零模型，逐项点击作品菜单验证，`…` 与右键各导出一次（截图存 `docs/609-work-menu-items-evidence/`）。

## 5. 台账

`docs/requirements-traceability.json` 新增 WM-609；注明 WN-56' 的期望随 609 改变，不计为新增通过的用例。
