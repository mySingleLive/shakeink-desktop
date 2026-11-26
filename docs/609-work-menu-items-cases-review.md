# 609 · 作品菜单增加编辑、创建、导出项 测试用例 · 独立审核

审核对象：`docs/609-work-menu-items-cases.md`（下称“用例”）。对照：`docs/609-work-menu-items-plan.md`（下称“方案”）、`docs/609-work-menu-items-plan-review.md`（下称“评审”）、`AGENTS.md`。只读审核，未改源码和测试。

核对过的夹具与代码：`tests/browser/works-loading.test.ts`、`tests/browser/file-export.test.ts`、`tests/helpers/sidebar-navigation-fixture.ts`、`tests/browser/text-selection-cards.test.ts`、`src/stores/scene-ui.ts`、`src/stores/tabs.ts`、`src/components/content/scene/SceneWorkspace.tsx`、`src/components/content/ForeshadowPanel.tsx`、`src/components/layout/SidebarTree.tsx`、`src/components/layout/OutlineTreeMenu.tsx`、`src/lib/desktop/export.ts`、`scripts/verify-work-delete-files.mjs`、`scripts/verify-faulted-work-nodes.mjs`。

## 一、覆盖核对

| 来源 | 用例 | 结论 |
|---|---|---|
| 需求 编辑 | WM-01 | 已覆盖 |
| 需求 创建角色/物品 | WM-02、03、04、05 | 有覆盖。夹具不支持，见高2；失败与防重复只测了角色/物品，见中3、中4 |
| 需求 创建场景 | WM-06a–d | works-loading 里无法断言对话框，见高1 |
| 需求 创建情景 | WM-07 | 可实现。只测了一条打开路径，见低2 |
| 需求 创建世界 | WM-08 | 夹具的 `/worlds` 回复会让它崩溃，见高2 |
| 需求 创建伏笔 | WM-09、10 | works-loading 里无法断言“选中”，见高1；守卫失败的路径没有用例，见中5 |
| 需求 导出两类 × 四种格式 | WM-11、WME-01、02 | 只实际导出了两种组合，见低3 |
| 评审 高-1 删除/切换目录时取消 | WME-04、05 | 期望可能在功能坏掉时也通过，见高3；缺“删别的作品不取消”，见中6 |
| 评审 中-1 SH-04 | SH-04（改） | 已覆盖 |
| 评审 中-2 WN-56' | WN-56'（改） | 已覆盖。另有一个真实目标脚本会失败，用例和方案都没提，见中1 |
| 评审 中-3 场景请求残留 | WM-06d | 断言只能靠 store；缺守卫挂起的两种时序，见中2 |
| 评审 中-4 `cancel()` 语义、文案按参数计算 | WME-04（恢复可用）、EXB16-05 | 被删作品的菜单已不存在，“恢复可用”无从断言；卷导出没有用例，见中7 |
| 评审 低-1 右键子菜单鼠标/键盘 | WME-01、02 | WME-01 实际走 `…`，右键鼠标路径缺失；键盘路径步骤不精确，见中8 |
| 评审 低-2 `ensureQueryData` | WM-09 | 没有断言“缓存命中不再 GET / 未缓存时先 GET”，见低4 |
| 评审 低-3 已知行为、提示差异 | WM-09 | 提示已断言；面板 `+` 仍不提示没有回归，见低5 |
| 评审 低-4 重复点击 | WM-05 | 只测角色，见中4 |
| 评审 低-5 焦点回到作品行 | WM-07 | 只测一条路径，见低2 |
| 评审 低-6 导出禁用范围 | WME-03 | 与 `saveDesktopExport` 的全局单任务锁冲突，见中9 |
| 测试缺口 9 真实目标两处导出并截图 | WMR-05 | 有。证据路径、保存对话框桩、章节数据来源没有写，见高4 |
| 方案 §5 台账 | 无 | 见低7 |

## 二、问题

### 高1：works-loading 的面板桩让 WM-06a/b/c、WM-09、WM-10 无法按写法断言

- 证据：`works-loading.test.ts:30-32` 的 esbuild 插件把 `@/components/content/registry` 换成 `renderTabContent=()=>null`。`ContentTabs` 通过 `renderTabContent(tab)` 渲染面板（`src/components/layout/ContentTabs.tsx:27`），所以“场景”tab 和“伏笔”tab 的正文都是空的。
  - “创建根场景”对话框由 `SceneWorkspace` 自己渲染（`SceneWorkspace.tsx:69`），请求也由它消费（`SceneWorkspace.tsx:46-49`）。WM-06a/b/c 期望“弹出创建根场景对话框”（用例 23-25 行），在该夹具里永远不会出现。
  - 伏笔选中由 `ForeshadowPanel` 消费 `panelFocus` 后 `setSelectedId`（`ForeshadowPanel.tsx:470-472`）。WM-09/10 期望“新伏笔被选中”（用例 29-30 行），同样看不到。
  - 退而只断言 store 也不行：面板没挂载时，`useSceneUiStore.action` 和 `useTabsStore.panelFocus` 不会被消费，会一直留在 store 里。只断言“请求已写入”，即使真正的消费逻辑坏了（例如 `sceneId: null` 被 `SceneWorkspace` 拒收），用例仍会通过。
- 修复：给这几条用例换一个渲染真实面板的夹具，并在用例文档里写明。两种做法任选：
  1. 推荐：新建 `tests/browser/work-menu-items.test.ts`。插件只把 registry 换成“`scenes` → 真实 `ScenesPanel`，`foreshadow` → 真实 `ForeshadowPanel`，其他 → null”。`text-selection-cards.test.ts:26` 已经在浏览器夹具里打包真实 `SceneWorkspace`，可以照搬。用 `query.setQueryData(['scenes',id],{scenes:[]})`、`['scene-factions',id]`、`['foreshadows',id]`、`['outline',id]` 预置数据（写法见 `text-selection-cards.test.ts:46-50`）。
  2. 在 works-loading 的插件里按同样方式放行这两个面板，并在夹具上暴露 `useSceneUiStore`、`registerSceneLeaveGuard`。
- 断言改为界面加 store 两层：
  - WM-06a/b/c：`getByRole('dialog',{name:'创建根场景'})` 出现，`DialogDescription` 为“根场景可包含任意层级的子场景”（没有“上级：”）；`activeTabId === 'scenes:healthy'`；对话框出现后 `useSceneUiStore.getState().action === null`（已消费）。
  - WM-09/10：新伏笔的列表项带 `bg-selected-surface`（`ForeshadowPanel.tsx` 列表 `selected?.id === f.id` 分支），详情区显示“未命名伏笔 2”；`useTabsStore.getState().panelFocus === null`。WM-10 先点选另一条，确认它被选中后再从菜单创建。

### 高2：works-loading 夹具的通用回复会让各创建用例在 onSuccess 中抛错

- 证据：`works-loading.test.ts:22-25` 的 `window.fetch` 只特殊处理 `/api/novels`、`/api/works/*`、`/conversations` 和 `/worlds`。其他路径一律返回 `{novel:…,characters:[],…}`。
  - `POST /api/novels/healthy/characters` 会拿到没有 `character` 字段的对象。面板里的 onSuccess 写的是 `character.name`（`CharactersPanel.tsx:50-53`），会抛 TypeError。物品、伏笔同理（`res.foreshadow.id`）。
  - `POST …/worlds` 命中 `path.includes('/worlds')`，返回 `{worlds:[]}`，而 `createWorldMutation` 读的是 `world.name`（`SidebarTree.tsx:1614-1615`）。
  - 夹具也没有失败开关和挂起闸门（现在只有 `setRemove/holdRemove`、`setLocation/holdLocation`），WM-04、WM-05 无法实现。
  - 夹具只有一个健康作品（`summary`），无法测试“作品 A 进行中，作品 B 的同名项仍可用”。
- 修复：用例文档增加“夹具改动”一节，逐项列出：
  - 为 `POST /characters|items|foreshadows|worlds` 返回 `{character|item|foreshadow|world:{id,name/title…}}`，并记录请求体。
  - 按路径提供 `fail(path,{status,error})` 和 `hold(path)/release(path)`。
  - `GET /foreshadows` 返回可配置的列表。
  - 增加第二个健康作品。
  - 在 `worksFixture` 上暴露 `activeTabId`、`useSceneUiStore`、`panelFocus`。

### 高3：WME-04/05 的“不写文件”在取消逻辑缺失时也会通过

- 证据：`file-export.test.ts:42-43` 的 `chooseSave` 在 `control.hold` 时返回 `control.gate.promise`。只要测试不 resolve 这个闸门，就永远不会写文件。收尾时 `finally` 用 `null` resolve（`file-export.test.ts:50`），这表示“用户取消”，同样不写文件。所以如果只断言“目录为空”，就算 `cancel(novelId)` 根本没有被调用，WME-04、WME-05 也会通过。EXB16-07 的写法才是正确的：先断言 `control.cancelled.length === 1`，再 `control.gate.resolve(join(root,'late.md'))`，`flush()` 后断言 `readdir(root)` 为空（`file-export.test.ts:90-91`）。
- 修复：WME-04、05 的期望改为：
  1. 等待 `control.paths.length === 1`。
  2. 删除作品或改变 scope。
  3. `waitFor(() => control.cancelled.length === 1)`。
  4. `control.gate.resolve(join(root,'late.md'))`，然后 `await control.service.flush()`。
  5. `readdir(root)` 为 `[]`；页面上没有“导出文件已保存”，`正在导出整书…` 的 loading 提示已消失。
- 另外，file-export 夹具现在不能挂载 `SidebarTree`。它只挂 `TemplateManagementDialog`、`OutlineTreeMenu`、`ChapterContentPanel`（`file-export.test.ts:33`）。它的 `window.fetch` 遇到未列出的 `/api/` 路径会直接 `throw`（`file-export.test.ts:29`）。`window.desktop` 只有 `exportFile/cancelFileExport`（`file-export.test.ts:30`）。没有 `useDesktopStore` 的 bootstrap，所以 `scope` 无法改变。WME 系列需要新增一个 `mode==='sidebar'`，并补上：
  - `/api/novels`、`/conversations`、`/worlds`、`/api/works/location`、`DELETE /api/works/:id` 的回复；
  - `window.desktop` 的 `command/onEvent/showTextContextMenu` 等桩（参照 `works-loading.test.ts:26`）；
  - `useDesktopStore.setState({bootstrap:{dataRoot}})` 和一个 `setRoot`。

  用例文档应写明这些改动，否则 WME-01 到 05 都没有可运行的宿主。

### 高4：真实目标 WMR 没有写证据路径、保存对话框桩和数据来源

- 证据：方案 §4 要求截图存到 `docs/609-work-menu-items-evidence/`，用例 44-54 行没有提到。参照脚本 `verify-work-delete-files.mjs` 做了这些事：
  - 第 11 行：`mkdtemp` 隔离目录；
  - 第 12 行：`WD_EVIDENCE` 环境变量和默认证据目录；
  - 第 14、90 行：`scrub` 去掉隔离路径，输出 `real-target-report.json`；
  - 第 23 行：断言 `SHAKEINK_TEST_ROOT` 生效；
  - 第 25 行：只替换原生对话框；
  - 第 92 行：`finally` 中清理。
- 导出在主进程走 `dialog.showSaveDialog`（`desktop/main/index.ts:393`）。WMR-05 写的是“原生保存对话框替换为写入隔离目录”，但没有指明桩的写法。按参照脚本应写成：`app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:globalThis.__savePath})})`，`__savePath` 指向隔离目录。
- WMR-05 要求“内容含作品章节”。但经 `POST /api/novels` 新建的作品没有卷章，用例没写章节从哪里来。需要在 `page.evaluate` 中直接 `fetch` 真实接口：
  - `POST /api/novels/:id/outline/volumes`；
  - `POST …/volumes/:vid/chapters`；
  - 写入正文和大纲。

  这里要用直接 `fetch`，因为渲染端的 `apiSend` 会把 `PATCH chapters` 暂存（`src/lib/staged-save.ts:225`）。写完后先读回确认内容已入库，再导出。导出的文件必须含这段唯一文本（例如“WMR 第一章终点”）。WMR-05 的大纲导出还要断言内容是大纲文本，不能是正文。
- 修复：在 WMR 段加上以下要求：
  - 证据目录：默认 `docs/609-work-menu-items-evidence/`，可由 `WM_EVIDENCE` 覆盖；
  - 报告 `real-target-report.json`，内容经 `scrub` 去掉隔离路径；
  - 每项一个 `record(id, ok, details)`；
  - 截图：`wmr-01-dots-menu.png`、`wmr-01-context-menu.png`、`wmr-05-export-submenu.png`；
  - 零模型：在设置或 `/api` 中读到模型列表为空，并写进报告；
  - 隔离：断言 `SHAKEINK_TEST_ROOT` 生效；
  - 结束时删除隔离目录。

## 中

### 中1：`scripts/verify-faulted-work-nodes.mjs` 的期望会随 609 失效

- 证据：`scripts/verify-faulted-work-nodes.mjs:99` 断言健康作品右键菜单为 `['重命名', '删除']`。这个真实目标脚本以后重跑一定失败。方案 §4/§5 和用例都只提到 WN-56'。
- 修复：增加一条用例或待办，把该脚本第 99 行改为新的 11 项列表。同时在台账中注明它与 WN-56' 一样“期望随 609 改变，不计为新通过”。

### 中2：WM-06d 只覆盖守卫立即失败，缺少守卫挂起的两种时序和失败提示

- 证据：`openTabForNavigation` 会等待守卫（`tabs.ts:302-315`）。守卫抛错时 `awaitNavigationGuard` 会 reject（`tabs.ts:257-268`），不会返回 `false`。守卫挂起期间如果用户切到别的 tab，`activationNonce` 改变，函数返回 `false`（`tabs.ts:308`）。方案只写了“返回 `false` 时不写入”，没有写 reject 如何处理。
- 修复：
  - WM-06d 增加两条断言：页面出现守卫的错误文案提示（夹具守卫 reject 的是 `Error('隔离场景草稿尚未保存')`，写法见 `tests/helpers/sidebar-navigation-fixture.ts` 的 `guard('reject')`）；没有 `pageerror`（`scenario` 已断言 `errors` 为空，未捕获的 reject 会让它失败）。
  - 新增 WM-06e：守卫挂起，然后放行。期望先没有对话框，放行后场景 tab 激活并弹出“创建根场景”。
  - 新增 WM-06f：守卫挂起，用户点击另一个 tab，然后放行。期望不切到场景 tab，`action === null`，之后手动打开场景 tab 也不弹对话框。
  - 守卫注册写法：先 `useTabsStore.setState` 放入一个 `scene:healthy-s1` 活动 tab，再 `registerSceneLeaveGuard(activeTabId, …)`（`scene-ui.ts:35`）。这在面板桩下也能用，因为守卫按 tabId 查找，与 `SceneEditor` 是否挂载无关。

### 中3：失败用例只覆盖角色/物品，且没有要求断言“服务端文案”本身

- 证据：方案 3.2 写“失败一律 `toast.error(服务端文案)`，不打开 tab”。WM-04（用例 21 行）只测角色和物品的 500。面板的兜底文案是“创建角色失败”“新建伏笔失败”（`CharactersPanel.tsx:47`、`ForeshadowPanel.tsx:499`）。如果夹具返回的错误文案与兜底文案相同，或者断言只匹配“失败”，那么实现忽略服务端文案时用例也会通过。
- 修复：WM-04 改成按项展开：
  - 角色、物品、伏笔 POST，世界 POST：都返回 `{error:'隔离服务端拒绝-<项>'}` 和 500。断言提示文字等于这个字符串，`tabs()` 与操作前完全相同，`activeTabId` 不变。
  - 伏笔的 `ensureQueryData` GET 失败：提示 GET 的错误文案，并且没有发出 POST。
  - `fetch` 直接 reject：提示兜底文案，没有路径或堆栈。

### 中4：防重复只测“创建角色”

- 证据：评审低-4 指出伏笔有“两次请求算出同一个名字”的风险。WM-05（用例 22 行）只测角色。
- 修复：WM-05 改为对角色、物品、伏笔、世界各测一次挂起请求。断言：
  - 再次打开同一作品菜单时该项 `isDisabled()`（参照 WN-54' 的写法，`works-loading.test.ts:318-325`；不要对禁用项 `click()`，否则会等到超时）；
  - 第二个健康作品菜单中的同一项可用；
  - 放行后恢复可用；
  - 只发出一次 POST。

### 中5：伏笔创建后导航失败的路径没有用例

- 证据：方案 3.2 写伏笔“`openTabForNavigation` 返回 `true` 后才 `requestPanelFocus`”。这时 POST 已经成功，但 tab 没有打开（守卫失败或被抢先导航）。用例没有覆盖这种情况。按 `afterSceneLeave` 的模式，失败后的提示和请求残留都需要断言。
- 修复：新增 WM-10b。当前活动 tab 是带拒绝守卫的场景页时，从菜单创建伏笔。期望：
  - POST 只发一次；
  - 活动 tab 不变；
  - `panelFocus === null`（没有残留）；
  - 有守卫错误提示；
  - 之后手动打开伏笔 tab，默认选中第一项，而不是被残留请求改到新伏笔。

  同时请方案明确这时是否仍提示“已创建伏笔”。

### 中6：缺少“删除别的作品不取消导出”和“删除失败不取消”

- 证据：方案 3.3 写的是 `cancel(work.novelId)`，只取消属于被删作品的任务。WME-04 只测了删除正在导出的作品。如果实现错写成无参的 `cancel()`，或者在 `onMutate` 时就取消，WME-04 仍会通过。
- 修复：新增两条用例。
  - WME-04b：作品 A 导出挂起时删除作品 B。期望 `control.cancelled` 为空；放行后 A 的文件写出，并提示“导出文件已保存”。
  - WME-04c：删除 A 返回 500。期望任务不取消；放行后文件写出。

  这两条需要 sidebar 夹具里有两个健康作品。

### 中7：WME-04 的“格式项恢复可用”无法在被删作品上断言；卷导出和卸载取消没有回归

- 证据：
  - 删除成功后，被删作品的行会从列表中移除（`SidebarTree.tsx:1537-1540`），它的菜单已不存在。因为“导出中所有作品菜单的格式项禁用”，`cancel()` 后的 `setExporting(false)` 只能在另一个作品的菜单上观察到。
  - 抽 hook 时，`volume` 改由参数传入，`&volumeId=` 和“本卷”文案由参数计算（`OutlineTreeMenu.tsx:38, 108`）。现有 EXB16-05 只测整书（`file-export.test.ts:84-86`），卷导出没有任何用例。
  - 原来卸载时由 cleanup abort（`OutlineTreeMenu.tsx:34`），改成 hook 后卸载取消也没有用例。
- 修复：
  - WME-04 的“恢复可用”改为在作品 B 的菜单上断言。
  - 新增 EXB16-05b：`collection` 模式传入 `volume`，选择“导出本卷正文 → TXT”。断言请求带 `volumeId=v1`，loading 文案为“正在导出本卷正文…”。
  - 新增 EXB16-05c：`OutlineTreeMenu` 导出挂起时 `f.unmount()`。断言 `cancelled.length === 1`；放行闸门后不写文件。
  - 新增 WME-06：作品菜单导出被用户在保存对话框取消（`control.cancel = true`），或者 `manuscript` GET 返回 500。断言没有文件，没有成功提示，格式项重新可用；500 时提示服务端文案。

### 中8：右键子菜单的鼠标路径缺失，键盘路径步骤不精确

- 证据：
  - WME-01（用例 38 行）走 `…` 菜单，WME-02（39 行）走右键加键盘。评审低-1 要求的“右键 → 悬停导出正文 → 点击 Markdown”没有用例。`NavigationContextMenu` 是受控的，点击子菜单项后两级菜单能否都关闭，正是这条路径要验证的。
  - 右键打开时焦点留在行上（WN-57b 的前提，`works-loading.test.ts:401-406`）。所以第一次 ArrowDown 是否进入菜单、按几次能到“导出大纲”，都不确定。“导出大纲”是第 9 个 menuitem，分隔栏不占位。
- 修复：
  - 新增 WME-01b：右键打开菜单，鼠标悬停“导出正文”，点击 “Markdown (.md)”。
  - WME-02 写明步骤：右键打开；连续按 ArrowDown，直到 `[role=menuitem][data-highlighted]` 的文本为“导出大纲”（每步断言，最多 11 次）；按 ArrowRight 后断言子菜单出现，且第一项高亮；按 Enter。
  - 两条路径都断言：`document.querySelectorAll('[role=menu]').length === 0`；焦点回到该作品的 `.tree-row`；请求为 `kind=outline` 或 `kind=content`，且不带 `volumeId`。

### 中9：WME-03 的“正文树菜单仍可用”与桌面保存的全局单任务锁冲突

- 证据：`saveDesktopExport` 按 bridge 只允许一个保存任务。已有任务时会抛出“已有文件正在保存，请稍后重试”（`src/lib/desktop/export.ts:18`）。作品菜单导出停在原生保存对话框时，正文树菜单的格式项虽然可用，但点下去必然报这个错。方案说的“互不影响”只在按钮状态上成立。WME-03 只断言“仍可用”，这一层面能通过，但没有记录实际结果。
- 修复：WME-03 补一步。点击正文树菜单的 TXT，期望提示“已有文件正在保存，请稍后重试”；没有第二次 `chooseSave`（`control.paths.length === 1`）；作品菜单的任务不受影响，放行后正常写出。同时请方案在 3.3 注明这一行为。

## 低

### 低1：WN-56' 应同时比较右键菜单的分隔栏，并标出子菜单触发器

`items()` 只取 `menuitem` 文本（`works-loading.test.ts:54`）。分隔栏放错位置时，项目顺序断言仍能通过。建议：

- `…` 菜单和右键菜单都断言分隔栏为 3 个；
- 断言每个分隔栏前一项依次是“编辑”“创建伏笔”“导出正文”；
- 断言“导出大纲”“导出正文”带 `aria-haspopup="menu"`，其他项不带。

另外，用例 17 行把 WN-55 写成“不可用作品菜单”，但 WN-55 测的是其他视图的分组菜单（`works-loading.test.ts:327-338`）。作品视图中不可用作品的菜单项由 WN-42'/43' 断言（`works-loading.test.ts:79-100`）。建议两者都列为“不变”。

### 低2：WM-07 只测一条入口

方案说作品行元素“右键时取 `RowContextMenu` 包裹的行”，所以 `…` 和右键是两条不同的取值路径。WM-07 应两条都测，并断言 `document.activeElement` 是 `aria-label` 为“可用作品”的 `.tree-row`，不是“作品”视图标签（`SidebarTree.tsx:2326` 的 fallback）。

### 低3：导出只实际跑了两种组合

`ManuscriptExportItems` 复用了原组件，转换器由 EXB16-02 覆盖，所以不必跑满 8 种组合。但至少应各跑一次 `kind=content` 和 `kind=outline` 的 docx 或 pdf，以确认 `format` 参数确实传进了 hook。建议在 WME-01 加一条 docx：用 JSZip 打开文件，断言含“第一章终点”。

### 低4：WM-09 没有断言 `ensureQueryData` 的读法

建议增加两条断言：

- 伏笔 tab 已打开、缓存已有列表时，创建只发 POST，没有 `GET /foreshadows`；
- 缓存为空时先发一次 GET，再 POST，取名基于 GET 返回的列表。

### 低5：面板行为不变缺少回归用例

方案 3.4 写面板界面与行为不变，ForeshadowPanel 只抽出取名函数。建议在真实面板夹具中加一条：点击面板的 `+`，名称为 `nextForeshadowTitle` 的结果，并且不出现“已创建伏笔”提示。WMU-01 也应补以下边界：

- `["未命名伏笔 1","未命名伏笔 2"]` → “未命名伏笔 3”；
- `["未命名伏笔1","未命名伏笔 01","其他"]` → “未命名伏笔 1”（只认精确格式）。

### 低6：`scene-ui` 的 `sceneId` 类型放宽后缺少回归

方案把 `action.sceneId` 放宽为 `string | null`。建议加一条：场景树（`GlobalSceneTree`）对某一行点“创建”，仍然弹出“创建子场景”，并显示“上级：…”。另外，`SceneEditor` 遇到 `type === "create"` 会直接返回（`SceneEditor.tsx:77`），所以场景编辑页是活动 tab 时，`sceneId: null` 的请求不会被它误消费。可以并入 WM-06d 断言。

### 低7：用例文档缺台账映射

方案 §5 要求新增 WM-609。用例文档应列出 `docs/requirements-traceability.json` 中各编号（WMU/WM/WME/WMR）与需求的对应关系，并注明 WN-56'、SH-04、`verify-faulted-work-nodes.mjs:99` 属于“期望修改”，不计为新通过。注意台账常有未提交条目，只能追加，不要整体回退。

### 低8：WM-01/02/03 的期望可以更具体

- WM-01：断言 `activeTabId === 'theme:healthy'`。主题 tab 已经打开时，再点“编辑”只激活它，`tabs()` 中不出现重复项。
- WM-02/03：断言 `activeTabId` 分别为 `character:<新 id>`、`item:<新 id>`（`tabs.ts:101, 105`）。角色创建后 `reads()` 增加（刷新了 `["novels"]`），说明执行了与面板相同的失效刷新。

## 三、结论

用例覆盖了方案和评审的大部分条目，但还不能直接进入 TDD。必须先补的是：

- 高1：场景对话框和伏笔选中需要一个渲染真实 `ScenesPanel`/`ForeshadowPanel` 的夹具；
- 高2：works-loading 夹具缺 POST 回复、失败/挂起开关和第二个健康作品；
- 高3：WME-04/05 必须先断言 `cancelled`，再用路径放行闸门，否则功能坏掉也能通过；file-export 需要新增可挂载 `SidebarTree` 的 sidebar 模式；
- 高4：WMR 缺证据目录、报告、`showSaveDialog` 桩和章节数据来源。

中级问题里，中1（真实目标脚本的旧期望）和中9（桌面保存全局锁）是方案本身也需要补写的事实。

## 复审（第二版用例与修订后方案）

复审对象：`docs/609-work-menu-items-cases.md` 第二版（下称“新用例”）、`docs/609-work-menu-items-plan.md`（§3.2 导航失败处理、§3.3 全局保存锁、§4 期望修改清单）。只读，未改源码和测试。

### 一、逐项结论

| 项 | 结论 | 理由 |
|---|---|---|
| 高1 面板桩 | 已解决 | 新用例 0.1 新建 `work-menu-items.test.ts`，放行真实 `ScenesPanel`/`ForeshadowPanel`；WM-06a、WM-09a 同时断言界面与“请求已消费”（`sceneAction()===null`、`panelFocus()===null`） |
| 高2 夹具回复与开关 | 部分 | POST 回复、`fail/hold/reject`、两个作品都已写入 0.1；但 POST 后的 GET 列表是否包含新记录没有规定，见新-2 |
| 高3 取消断言与 sidebar 模式 | 已解决 | 0.2 统一为 EXB16-07 模式（先 `cancelled`，再用路径放行闸门，再断言目录为空），并列出 sidebar 模式需补的 fetch、`window.desktop`、`setRoot` |
| 高4 WMR 证据与数据 | 已解决 | 新用例第 5 节补了隔离断言、`/api/models` 零模型（路由存在，`desktop/service/routes.generated.ts:23`）、`showSaveDialog` 桩、直接 `fetch` 写章节并读回、证据目录与 `scrub` 报告。截图有一处小缺口，见新-8 |
| 中1 `verify-faulted-work-nodes.mjs:99` | 已解决 | 方案 §4、新用例 WMR-06 与第 6 节都列为“期望修改，不计为新通过” |
| 中2 守卫时序 | 部分 | WM-06d/e/f 已补，提示文案已断言；但 `hold` 的实现方式和“用户激活另一个 tab”的方式没写清，现写法可能让 WM-06f 在功能坏掉时也通过，见新-3 |
| 中3 失败文案 | 部分 | WM-04 已按项展开，用唯一文案断言；但 WM-04c 的期望与“与面板相同”矛盾，见新-1 |
| 中4 防重复 | 已解决 | WM-05 覆盖四项，用 `isDisabled()`，并对照 work-b |
| 中5 伏笔导航失败 | 部分 | 方案 §3.2 写明了 `false`/reject 两种处理；WM-10 只测 reject，`false`（守卫挂起期间切走）没有用例；且 WM-10 的“选中第一项”依赖新-2 |
| 中6 删别的作品/删除失败 | 已解决 | WME-04b、04c |
| 中7 恢复可用、卷导出、卸载取消 | 部分 | WME-04 改在 work-b 断言，EXB16-05c 已补；EXB16-05b 没有可挂载卷菜单的夹具模式，见新-6 |
| 中8 右键子菜单路径 | 已解决 | WME-01b 补鼠标路径，WME-02 写明逐步读 `data-highlighted` |
| 中9 全局保存锁 | 已解决 | 方案 §3.3 注明现有行为；WME-03 断言提示“已有文件正在保存，请稍后重试”且 `paths.length` 仍为 1。定位器有歧义，见新-7 |
| 低1 分隔栏与 haspopup | 已解决 | WN-56' 断言分隔栏位置与 `aria-haspopup`（Base UI 子菜单触发器继承 `aria-haspopup="menu"`，`node_modules/@base-ui/react/menu/root/MenuRoot.js:405,411`）；WN-55 改为“其他视图分组菜单”，另列 WN-42'/43' |
| 低2 情景两条入口 | 已解决 | WM-07a/b |
| 低3 导出格式 | 已解决 | WME-01c 用 docx 导大纲并区分正文 |
| 低4 `ensureQueryData` | 已解决 | WM-09c/d |
| 低5 面板 `+` 回归与取名边界 | 已解决 | WM-11、WMU-01 补边界 |
| 低6 `sceneId` 放宽回归 | 未解决 | WM-06g 选的路径不经过 store，测不到这次改动，见新-4 |
| 低7 台账映射 | 已解决 | 新用例第 6 节，注明只追加 |
| 低8 tab id 精确 | 部分 | WM-01 已精确；WM-02 写的 id 与 `buildTabId` 不符，WM-03 仍未写具体 id，见新-5 |

### 二、新问题

#### 中

**新-1 WM-04c 与“与面板相同”矛盾**

- 证据：`apiSend` 不捕获 `fetch` 抛出的错误（`src/components/content/api.ts:31-33`），面板的 onError 直接 `toast.error(err.message)`（`CharactersPanel.tsx:55`）。所以按“与面板相同”实现，fetch reject 时提示的就是原始错误文本。WM-04c 期望“提示不含路径或堆栈”，只有在菜单另外包一层兜底时才成立。另外，如果夹具 reject 的错误本身不含路径，这条断言怎样都会通过。
- 修复：先在方案 §3.2 决定。任选一种：(a) 菜单与面板一致，删掉 WM-04c 的“不含路径”期望；(b) 菜单对非 `ApiError` 改用兜底文案“创建角色失败”等，写成与面板的有意差异，WM-04c 让夹具 reject `Error('private-native-path-key /private/var/x')`，断言提示等于兜底文案且不含 `private-native-path-key`（写法同 `works-loading.test.ts:24, 412`）。

**新-2 夹具没有规定 POST 后列表回读包含新记录**

- 证据：0.1 只写了 POST 返回新记录、`GET …/foreshadows` 返回“可配置列表”。`ForeshadowPanel` 的选中项是 `items.find(f => f.id === selectedId) ?? items[0]`（`ForeshadowPanel.tsx:484`），列表来自 invalidate 后的 GET。如果 GET 不含新伏笔：WM-09a/b 会选中“未命名伏笔 1”而失败（夹具问题，不是功能问题）；WM-10 的“之后选中第一项而非新伏笔”则无论有没有残留聚焦都成立。
- 修复：0.1 写明 POST 把新记录追加到对应 GET 列表（伏笔、角色、物品、世界），并且新记录排在末尾。WM-10 增加前置断言：手动打开伏笔 tab 后，列表中确有新伏笔且不是第一项，再断言选中的是第一项。

**新-3 守卫 `hold` 与“用户激活另一个 tab”的写法会影响 WM-06e/f 的有效性**

- 证据：现有夹具的 `guard('pending')` 每次调用新建一个 promise，并覆盖 `finishGuard`（`tests/helpers/sidebar-navigation-fixture.ts` 中 `new Promise(resolve=>finishGuard=resolve)`）。在 WM-06f 里，`openTabForNavigation` 先调用一次守卫（`tabs.ts:305-306`）；用户点击另一个 tab 时，`activateTab` 经 `afterSceneLeave` 又调用一次（`tabs.ts:249, 328`）。照搬这种写法，`releaseGuard()` 只会放行第二个 promise，第一个永远挂起。结果是菜单的导航永远不返回，“不切到场景 tab、`sceneAction()===null`”恒成立，即使实现在导航前就写入请求，只要请求恰好被别处清掉，也会通过；同时 `false` 分支实际没有执行。
- 修复：0.1 规定 `guard(tabId,'hold')` 返回同一个共享 promise，`releaseGuard()` 一次放行全部调用。WM-06f 写明用真实点击另一个 tab 的标签触发（两次守卫调用都等待同一个 promise，放行后 `activateTab` 的回调先执行并改变 `activationNonce`，菜单导航因 `tabs.ts:308` 返回 `false`）。断言：放行后活动 tab 是被点击的 tab；`tabs()` 中没有 `scenes:work-a`；`sceneAction()===null`。再加一个伏笔版本 WM-10b，覆盖中5 中缺的 `false` 分支：伏笔已创建，提示“已创建伏笔「…」”，`panelFocus()===null`，没有守卫错误提示。

#### 低

**新-4 WM-06g 测不到 `sceneId: null` 放宽**

`GlobalSceneTree` 在仓库中没有任何使用处（只有定义，`SceneWorkspace.tsx:72`）。场景目录树的“创建”走 `actionFor` 直接调用 `startCreate(row.id)`（`SceneWorkspace.tsx:50`），不经过 `requestAction`。而且夹具预置 `scenes:[]`，目录里没有可点的行。修复：预置一个场景 `s1`，在场景 tab 活动时执行 `requestAction('work-a','s1','create')`，断言弹出“创建子场景”且描述为“上级：<s1 名称>”；再让 `scene:s1` 成为活动 tab 并执行 `requestAction('work-a',null,'create')`，断言 `SceneEditor` 不弹框（`SceneEditor.tsx:77` 跳过 `create`），之后切到场景 tab 时由 `SceneWorkspace` 消费。

**新-5 WM-02/03 的 tab id**

`buildTabId("character", novelId, {refId})` 返回 `character:<refId>`（`tabs.ts:101`），所以应为 `character:character-1`，不是 `character:work-a:character-1`。WM-03 写成 `item:item-1`（`tabs.ts:105`）。去掉“实际 id 规则按 buildTabId”的含糊说法。

**新-6 EXB16-05b 没有宿主**

file-export 的 `collection` 模式只挂不带 `volume` 的 `OutlineTreeMenu`（`file-export.test.ts:33`），sidebar 模式里的正文树也需要先展开作品并有卷数据。请在 0.2 增加 `mode==='volume'`（传入 `volume={id:'v1',index:1,title:'第一卷',…}`），manuscript 回复检查 `volumeId=v1`。loading 文案只在任务进行中可见，用例需先 `control.hold = true`，读到“正在导出本卷正文…”后再放行。

**新-7 WME-03 的定位器可能冲突**

sidebar 模式里，作品展开后其“正文”节点自带一个 `OutlineTreeMenu`（`SidebarTree.tsx:2062`），按钮名同为“正文导航功能菜单”。再额外挂一个会让 `getByRole('button',{name:'正文导航功能菜单'})` 匹配多个元素。修复：不额外挂载，直接展开 work-a 后在其行内定位；或给额外挂载的那个包一层带 `data-testid` 的容器并在容器内定位。

**新-8 WMR 截图只有一张导出截图**

方案 §4 和评审缺口 9 要求 `…` 与右键各导出一次并截图。WMR-05 只有 `wmr-05-export-submenu.png`。建议改为 `wmr-05-dots-export-submenu.png` 和 `wmr-05-context-export-submenu.png` 两张。

**新-9 方案 §4 的测试清单已过时**

方案 §4 仍写“各创建项……在 `tests/browser/works-loading.test.ts`”，场景时序仍是“四种”。新用例已把它们移到 `work-menu-items.test.ts`，并扩展为 WM-06a–g。虽然 §4 写了“用例细节见 cases”，但文件位置不一致会误导实现者。建议把 §4 的文件名和时序数改成与新用例一致。

### 三、复审结论

高级问题已基本解决，夹具方案可以实施。进入 TDD 前需要先定下：

- 新-1：fetch reject 时菜单是否与面板一致（方案决策）；
- 新-2：夹具 POST 后列表回读包含新记录；
- 新-3：共享的 `hold` 守卫和真实点击，以及伏笔的 `false` 分支用例。

其余低级问题可以在写测试时一并修正。
