# 609 · 作品菜单增加编辑、创建、导出项 测试用例

依据 `docs/609-work-menu-items-plan.md`（已按 `docs/609-work-menu-items-plan-review.md` 修订）。第二版、第三版按 `docs/609-work-menu-items-cases-review.md`（含复审）修订。

下文“菜单项列表”指：重命名、编辑、创建角色、创建物品、创建场景、创建情景、创建世界、创建伏笔、导出大纲、导出正文、删除。

## 0. 夹具

### 0.1 新建 `tests/browser/work-menu-items.test.ts`（审核高1、高2）

- 挂载真实 `SidebarTree`、`ContentTabs`、`Toaster`。esbuild 插件只替换 `@/components/content/registry`：`scenes` → 真实 `ScenesPanel`，`foreshadow` → 真实 `ForeshadowPanel`，其他 tab → `null`；`StagedSaveSurface` 等照 works-loading 桩掉。
- 两个健康作品：`work-a`（可用作品甲）、`work-b`（可用作品乙）；无不可用作品。
- QueryClient `staleTime: Infinity`；预置 `['scenes',id]={scenes:[]}`、`['scene-factions',id]={factions:[]}`。伏笔列表按用例决定是否预置（WM-09c/d）。
- `window.fetch` 回复：
  - `GET /api/novels` → 两个作品；`/conversations` → `[]`；`GET …/worlds` → `{worlds:[]}`。
  - `POST …/characters|items|foreshadows|worlds` → `{character|item|foreshadow|world:{id:'<类>-<序号>', name/title:请求体中的名称}}`，记录请求体；成功的 POST 把新记录追加到该作品对应列表，之后的 GET 返回追加后的列表（复审新2）。
  - `GET …/foreshadows` → 可配置列表（默认 `[{id:'f-1',title:'未命名伏笔 1',…}]`）。
  - `fail(pathPattern, {status, error})`、`hold(pathPattern)` / `release(pathPattern)`、`reject(pathPattern)`（fetch 直接抛错）。
- `window.desktop`：照 works-loading 的桩（`command/onEvent/showTextContextMenu/…`）。
- 暴露：`requests`、`tabs()`、`activeTabId()`、`sceneAction()`（`useSceneUiStore.getState().action`）、`panelFocus()`、`guard(tabId, mode)`（`registerSceneLeaveGuard`：`'reject'` 立即抛 `Error('隔离场景草稿尚未保存')`；`'hold'` 时所有调用共用同一个挂起 promise，`releaseGuard()` 一次放行全部调用，并暴露 `guardCalls()` 计数，复审新3）、`setActive(tab)`、`reads()`（`GET /api/novels` 次数）。
- `scenario` 照 works-loading：`pageerror` 为空才通过。

### 0.2 `tests/browser/file-export.test.ts` 新增 `mode==='sidebar'`（审核高3）

- 挂载真实 `SidebarTree` + `Toaster`，两个作品 `work-a`、`work-b`，另挂一个 `OutlineTreeMenu novel=work-a kind=content`（外包 `<div data-testid="standalone-outline">`，WME-03 的定位限定在该容器内，避免与侧栏内同名按钮冲突）。
- 另新增 `mode==='volume'`：只挂 `OutlineTreeMenu novel=work-a volume={id:'v1',index:1,title:'第一卷',…} kind=content`，供 EXB16-05b。
- fetch 增加 `/api/novels`、`/conversations`、`/worlds`、`/api/works/location`、`DELETE /api/works/:id`（可设 500）、`/api/novels/:id/manuscript?kind=…`（按 `kind` 返回不同文本：正文含“第一章终点”，大纲含“第一章大纲终点”；可设 500）。
- `window.desktop` 补 `command/onEvent/showTextContextMenu/cancelTextContextMenu/readClipboardText/writeClipboardText`。
- `useDesktopStore.setState({bootstrap:{platform:'darwin',dataRoot:'root-a',…}})`，暴露 `setRoot(value)`。
- 取消断言写法统一（EXB16-07 模式）：`waitFor(paths.length===n)` → 触发取消 → `waitFor(cancelled.length===1)` → `gate.resolve(join(root,'late.md'))` → `flush()` → `readdir(root)` 为 `[]`，页面无“导出文件已保存”，loading 提示消失。

## 1. 单元

| 编号 | 场景 | 期望 |
|---|---|---|
| WMU-01 | `nextForeshadowTitle` | `[]`→“未命名伏笔 1”；`["未命名伏笔 1","未命名伏笔 3"]`→“未命名伏笔 2”；`["未命名伏笔 2"]`→“未命名伏笔 1”；`["未命名伏笔 1","未命名伏笔 2"]`→“未命名伏笔 3”；`["未命名伏笔1","未命名伏笔 01","其他"]`→“未命名伏笔 1” |
| SH-04（改） | 账号菜单顺序 | 从 `command("app.settings")` 之后查找 `<DropdownMenuSub>`；仍断言 设置 → 帮助子菜单 → 问题反馈 |

## 2. 浏览器：菜单结构（`tests/browser/works-loading.test.ts`）

| 编号 | 场景 | 期望 |
|---|---|---|
| WN-56'（改） | 健康作品 `…` 与右键菜单 | 两者 menuitem 文本都等于菜单项列表；各有 3 个分隔栏，分隔栏前一项依次为“编辑”“创建伏笔”“导出正文”；只有“导出大纲”“导出正文”带 `aria-haspopup="menu"`；左键仍打开作品 tab |
| WN-42'/43'（不变） | 作品视图不可用作品菜单 | 仍为 重新加载作品、删除 |
| WN-55（不变） | 其他视图分组菜单 | 不变 |

## 3. 浏览器：各项行为（`tests/browser/work-menu-items.test.ts`）

| 编号 | 场景 | 期望 |
|---|---|---|
| WM-01 | `…` → 编辑 | `activeTabId()==='theme:work-a'`，tab 标题“主题”；再点一次编辑，`tabs()` 中只有一个 `theme:work-a` |
| WM-02 | 创建角色 | POST `/api/novels/work-a/characters` 体 `{name:"新角色",roleType:"PROTAGONIST"}`；`activeTabId()==='character:character-1'`；提示“已创建角色「新角色」，点击编辑资料”；`reads()` 增加 |
| WM-03 | 创建物品 | POST `…/items` 体 `{name:"新物品"}`；`activeTabId()==='item:item-1'`；提示“已创建物品「新物品」，点击编辑资料” |
| WM-04 | 各创建项失败（角色、物品、伏笔 POST、世界 POST） | 夹具返回 500 `{error:'隔离服务端拒绝-<项>'}`；提示文字等于该字符串；`tabs()` 与 `activeTabId()` 不变 |
| WM-04b | 创建伏笔时 GET 伏笔列表失败 | 提示 GET 的错误文案；无 POST |
| WM-04c | 创建角色 fetch 直接 reject `Error('隔离网络失败')` | 与面板相同（`apiSend` 不包装 fetch 异常）：提示“隔离网络失败”；无新 tab（复审新1：保持面板行为） |
| WM-05 | 角色、物品、伏笔、世界 POST 各挂起一次 | 再次打开 work-a 菜单该项 `isDisabled()`（不点击禁用项）；work-b 菜单同项可用；放行后恢复可用；只发出一次 POST |
| WM-05b（代码审核中1） | 甲、乙同时挂起同一创建项（角色、物品、伏笔） | 两者菜单同项都禁用；放行甲后甲恢复、乙仍禁用；每个作品各 1 次 POST |
| WM-06a | 创建场景，场景 tab 未打开 | 出现对话框“创建根场景”，描述“根场景可包含任意层级的子场景”；`activeTabId()==='scenes:work-a'`；对话框出现后 `sceneAction()===null` |
| WM-06b | 场景 tab 已打开未激活 | 同 WM-06a |
| WM-06c | 场景 tab 已是活动 tab | 同 WM-06a |
| WM-06d | 活动 tab 为 `scene:work-a:s1`，`guard('reject')` | 不切换；无对话框；提示“隔离场景草稿尚未保存”；`sceneAction()===null`；之后手动打开 `scenes:work-a` 不弹对话框 |
| WM-06e | `guard('hold')`，然后放行 | 放行前无对话框、活动 tab 不变；放行后同 WM-06a |
| WM-06f | `guard('hold')`；菜单创建场景后，用户点击 ContentTabs 中另一个已打开 tab 的真实标签（再次经过守卫）；`guardCalls()===2` 后 `releaseGuard()` | 活动 tab 为用户点击的 tab，不是场景 tab；`sceneAction()===null`；之后手动打开场景 tab 不弹对话框 |
| WM-06g（回归） | `sceneId` 放宽为 `string \| null` | `npx tsc --noEmit` 通过；SceneEditor 对 move/delete 请求的既有用例（`tests/browser` 中场景编辑相关用例）照常通过（复审低6：`GlobalSceneTree` 无调用方，不另写界面用例） |
| WM-07a | `…` → 创建情景 | 出现“情景试验场”对话框创建模式；Esc 关闭后 `document.activeElement` 是可用作品甲的 `.tree-row` |
| WM-07b | 右键 → 创建情景 | 同 WM-07a |
| WM-08 | 创建世界 | 对话框“新建世界”；输入“隔离世界”提交，POST `…/worlds` 体 `{name:"隔离世界",parentId:null}`；`activeTabId()` 为该世界 tab |
| WM-09a | 创建伏笔，列表已有“未命名伏笔 1” | POST `…/foreshadows` 体 `{title:"未命名伏笔 2"}`；伏笔 tab 激活，新条目列表项为选中状态，详情标题“未命名伏笔 2”；提示“已创建伏笔「未命名伏笔 2」”；`panelFocus()===null` |
| WM-09b | 伏笔 tab 已打开并选中“未命名伏笔 1” | 菜单创建后新条目被选中 |
| WM-09c | 伏笔列表已在缓存 | 只发 POST，无 `GET …/foreshadows`（创建后刷新的 GET 除外，按时间顺序区分） |
| WM-09d | 伏笔列表未缓存 | 先 GET 一次，再 POST，名称基于 GET 结果 |
| WM-10 | 活动 tab 为带 `guard('reject')` 的场景页时创建伏笔（列表已有“未命名伏笔 1”） | POST 一次；提示“已创建伏笔「未命名伏笔 2」”与守卫错误；活动 tab 不变；`panelFocus()===null`；之后手动打开伏笔 tab，选中“未命名伏笔 1”（列表首项），而新伏笔在列表中存在但未选中 |
| WM-10b | 同 WM-10 但 `guard('hold')`，用户点击另一个 tab 后 `releaseGuard()`（导航返回 `false`） | POST 一次；提示“已创建伏笔「未命名伏笔 2」”；无守卫错误；活动 tab 为用户点击的 tab；`panelFocus()===null`；之后打开伏笔 tab 选中首项 |
| WM-11（回归） | 伏笔面板自带 `+` | 名称为 `nextForeshadowTitle` 结果；无“已创建伏笔”提示 |
| WM-12 | 导出大纲/导出正文子菜单 | 悬停后各显示 TXT 文本 (.txt)、Markdown (.md)、Word (.docx)、PDF (.pdf) |

## 4. 浏览器：导出（`tests/browser/file-export.test.ts` sidebar 模式）

| 编号 | 场景 | 期望 |
|---|---|---|
| EXB16-05（不变） | 正文树整书导出 | 不变 |
| EXB16-05b | `volume` 模式：卷菜单 → 导出本卷正文 → TXT，`control.hold=true` | 请求带 `volumeId=v1`；挂起期间可见 loading 文案“正在导出本卷正文…”；放行后文件写出 |
| EXB16-05d（代码审核低2） | `volume` 模式导出挂起时把卷 id 从 v1 换成 v2（组件不卸载） | `cancelled.length===1`；不写文件；loading 提示消失；格式项重新可用 |
| EXB16-05c | 正文树导出挂起时卸载组件 | `cancelled.length===1`；放行后不写文件 |
| WME-01 | `…` → 导出正文 → Markdown | 请求 `/api/novels/work-a/manuscript?kind=content`，无 `volumeId`；文件含“第一章终点”；提示“导出文件已保存”；`[role=menu]` 数为 0 |
| WME-01b | 右键 → 悬停导出正文 → 点击 Markdown | 同 WME-01；两级菜单都关闭 |
| WME-01c | `…` → 导出大纲 → Word | JSZip 打开文件，文档含“第一章大纲终点”，不含“第一章终点” |
| WME-02 | 右键 → 键盘 | 连续 ArrowDown，每步读 `[role=menuitem][data-highlighted]`，直到“导出大纲”（最多 11 次）；ArrowRight 后子菜单出现且首项高亮；Enter 选 TXT；请求 `kind=outline`，文件含“第一章大纲终点”；`[role=menu]` 数为 0；焦点回到作品行 |
| WME-03 | 作品菜单导出挂起时 | 再开 work-a、work-b 菜单，格式项禁用；正文树菜单格式项可用，点 TXT 提示“已有文件正在保存，请稍后重试”，`paths.length` 仍为 1；放行后作品菜单的文件写出 |
| WME-04 | work-a 导出挂起时删除 work-a（删除对话框选“删除”） | 取消断言（0.2）成立；work-b 菜单格式项恢复可用 |
| WME-04b | work-a 导出挂起时删除 work-b | `cancelled` 为空；放行后 work-a 文件写出，提示“导出文件已保存” |
| WME-04c | work-a 导出挂起时删除 work-a 返回 409（对话框显示服务端文案） | `cancelled` 为空；放行后文件写出 |
| WME-05 | 导出挂起时 `setRoot('root-b')` | 取消断言（0.2）成立 |
| WME-06 | 保存对话框取消（`control.cancel=true`）；或 manuscript GET 500 | 无文件；无成功提示；格式项重新可用；500 时提示服务端文案 |

## 5. 真实目标：`scripts/verify-work-menu-items.mjs`（审核高4）

照 `scripts/verify-work-delete-files.mjs`：

- `mkdtemp` 隔离目录，`SHAKEINK_TEST_ROOT` 指向其中的 `data`；断言主进程中该变量生效。
- 断言零模型：读 `/api/models`（或设置中的模型列表）为空，写入报告。
- 作品经真实 `POST /api/novels` 创建（只替换 `dialog.showOpenDialog` 返回隔离目录）。
- 章节数据：`page.evaluate` 中直接 `fetch` 真实接口创建一卷一章，写入正文“WMR 第一章终点”、大纲“WMR 第一章大纲终点”，读回确认已入库。
- 导出：`dialog.showSaveDialog=async()=>({canceled:false,filePath:globalThis.__savePath})`，`__savePath` 指向隔离目录。
- 证据目录默认 `docs/609-work-menu-items-evidence/`，可由 `WM_EVIDENCE` 覆盖；`real-target-report.json` 经 `scrub` 去掉隔离路径；每项 `record(id, ok, details)`；`finally` 删除隔离目录。运行期间不构建。

| 编号 | 场景 | 期望 |
|---|---|---|
| WMR-01 | `…` 菜单与右键菜单（含窗口底部的作品行） | 都等于菜单项列表；菜单矩形完全在窗口内（11 项比原来高，浏览器夹具页面可滚动时右键菜单会越出视口，需在真实窗口确认）；截图 `wmr-01-dots-menu.png`、`wmr-01-context-menu.png` |
| WMR-02 | 编辑 | 主题 tab 激活 |
| WMR-03 | 创建角色、物品、伏笔 | 各自 tab 激活；再 GET 列表确认记录存在 |
| WMR-04 | 创建场景、世界（输入名称提交）；创建情景（出现对话框后取消） | 场景/世界记录存在且 tab 激活；情景对话框出现并关闭 |
| WMR-05 | `…` → 导出正文 → Markdown；右键 → 导出大纲 → TXT | 文件分别含“WMR 第一章终点”和“WMR 第一章大纲终点”，大纲文件不含正文终点；截图 `wmr-05-dots-export-submenu.png`、`wmr-05-context-export-submenu.png` |
| WMR-06 | `scripts/verify-faulted-work-nodes.mjs:99` 改为菜单项列表 | 该脚本仍通过（期望随 609 改变，不计为新通过） |

## 6. 台账映射（`docs/requirements-traceability.json` WM-609，只追加）

| 需求 | 用例 |
|---|---|
| 菜单结构与顺序 | WN-56'（改）、WMR-01 |
| 编辑 | WM-01、WMR-02 |
| 创建角色/物品 | WM-02、03、04、04c、05、WMR-03 |
| 创建场景 | WM-06a–g、WMR-04 |
| 创建情景 | WM-07a/b、WMR-04 |
| 创建世界 | WM-04、05、08、WMR-04 |
| 创建伏笔 | WMU-01、WM-04、04b、05、09a–d、10、10b、11、WMR-03 |
| 导出大纲/正文 | WM-12、WME-01–06、EXB16-05/05b/05c、WMR-05 |

期望修改、不计为新通过：WN-56'、SH-04、`verify-faulted-work-nodes.mjs:99`。
