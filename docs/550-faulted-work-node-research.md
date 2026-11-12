# 550 · 异常作品统一导航节点 调研

## 1. 需求（用户 2026-11-10）

- 无法正常加载的作品（截图：卡片“诡秘之主 / 作品目录暂不可用，请检查目录后重新加载。”+ 独立“重新加载作品”按钮）改为与正常作品一致的导航节点。
- 异常作品图标为“作品目录 + 红色感叹号”合成图标。
- 右键或 `…` 菜单提供对应的处理项（重新加载作品、修复作品锁等）；任何异常都必须有“删除”，且任何作品（正常或异常）都能删除成功。
- 产物顺序：调研 → UI 设计稿（HTML，用户审核）→ 代码实现 → 测试。

本文件取代 `docs/548`、`docs/549` 中“在卡片内加删除按钮”的界面部分；548 服务端删除语义及其两份审核意见（548-review、549-review）继续作为输入。

## 2. 现状

### 2.1 数据来源

- `GET /api/novels`（`desktop/service/dispatcher.ts:85-95`）对 `catalog.json` 中每条记录执行 `works.run(id, novel.findMany)`；失败的记录进入 `unavailableWorks`。
- `UnavailableWork`（`desktop/shared/work-list.ts`）只有 `reason: 'stale-lease' | 'unavailable'`。只有 `ContentError('WORK_LEASE_STALE')` 归为 `stale-lease`，其他原因一律为 `unavailable`。
- `Workspaces.run`（`desktop/service/workspaces.ts:329-401`）可能抛出的失败：

| 来源 | 文案或错误码 | 当前 reason | 用户可做的处理 |
|---|---|---|---|
| `lockDirectory`，本机已退出进程留下的锁 | `WORK_LEASE_STALE` | stale-lease | 修复作品锁（已有，`desktop:work-lease` IPC） |
| `lockDirectory`，锁属于存活进程或其他设备 | “作品已在其他进程（或设备）打开” | unavailable | 关闭另一处后重新加载 |
| `identity(row.path)` ENOENT/ENOTDIR | 目录被移动、改名或删除 | unavailable | 恢复目录后重新加载，或删除 |
| inode 或 realpath 不一致 | “作品目录发生变化，请重新关联” | unavailable | 删除后重新打开目录 |
| 清单 id、novelId、phase 不符 | “作品目录身份不匹配” | unavailable | 删除 |
| 数据库缺失、迁移失败、PGlite 打不开 | “作品数据库缺失…”等 | unavailable | 删除，或恢复备份后重新加载 |
| `failedRetirements` / `closing` | 临时状态 | unavailable | 重新加载 |

### 2.2 界面

- `UnavailableWorks`（`src/components/desktop/UnavailableWorks.tsx`）：
  - 在“作品”视图中，每个异常作品渲染为带边框的卡片（标题 + 原因 + stale-lease 时的“修复作品锁”按钮），列表底部有一个全局“重新加载作品”按钮。这是截图里的样子，与正常作品节点（`TreeNode`，`SidebarTree.tsx:1827`）不一致。
  - 在设定、角色、正文、对话视图中，借用 `NavigationWorkGroup` 标题，但正文仍是卡片详情，标题图标是普通文件夹，看不出异常。
- 正常作品节点：`TreeNode` + `FolderOpen/FolderClosed` 图标（`--icon-work` 色）+ 悬停 `…` 菜单（重命名、删除）+ 悬停卡片 `NovelHoverCard`。**没有右键菜单。**
- 全局 `contextmenu` 监听只处理文本源（`src/lib/desktop/text-context-menu.ts`、`input-commands.ts`）。`tree-row` 为 `select-none`，`textContextSourceAt` 返回 null，不会拦截导航行的右键，所以可以在导航行上加自己的菜单。
- 项目依赖 `@base-ui/react` 1.6，内含 `context-menu`，与现有 `DropdownMenu`（Base UI `menu`）同源，可共用菜单项样式。

### 2.3 删除能力

- 正常作品：`DELETE /api/novels/[id]` 把作品库内 novel 标为 `DELETED`（`desktop/handlers/novels/[id]/route.ts:129`）；目录索引保留，列表读取时过滤，作品消失。依赖作品库可以打开。
- 异常作品：作品库打不开，上面的路径不可用。**目前没有任何删除入口。**
- 会话账本（inbox `systemConfig`）中未删除的会话位置如果指向打不开的作品，`GET /api/chat/conversations` 会整体报错（`dispatcher.ts:104`）。所以异常作品删除必须同时处理关联会话，只改索引不够（548 §2）。

## 3. 关键结论

1. **reason 需要细分。** 只有两类时，界面无法给出“另一处正在使用”与“目录缺失”等不同的说明和菜单项。建议在服务端按错误归类，仍不暴露路径或原始错误：
   - `stale-lease`：异常退出留下的锁（警告）
   - `in-use`：其他进程或设备正在使用（警告）
   - `missing`：目录缺失、被移动或改名（错误）
   - `changed`：目录身份或清单不匹配（错误）
   - `damaged`：数据库缺失或无法打开（错误）
   - `unavailable`：其他和临时原因（错误，兜底）
   `src/lib/novel-list.ts` 需容忍未知 reason，统一按 `unavailable` 处理，避免 Web 与桌面版本不一致时报错。
2. **异常作品的“删除”= 从作品列表移除。** 只移除索引记录及其关联会话，不读写、不删除目录内任何文件（目录可能缺失或被另一进程锁住，删用户磁盘文件不可逆）。这与 548 §3 一致。
3. **“任何作品都能删除”需要去掉 548 中的健康探测拒绝。** 548 方案在作品可打开时返回 409 `WORK_AVAILABLE`，审核意见 1 还指出探测会误判。按本次约束，异常节点上的删除应当总能成功：
   - 不再探测；在 `serialize` 内，先退役该 id 的连接槽和 `failedRetirements`（对应 548-review 第 2 条），再清理会话，最后改写索引。
   - 如果用户删除时作品其实已经恢复，结果也只是“从列表移除”，文件仍在，可重新打开。对话框文案说明这一点。
   - 正常节点继续走现有 `DELETE /api/novels/[id]`，不改。
4. **stale-lease 删除后的重新加入**（548-review 第 3 条）：删除后锁修复入口随索引消失，再次打开目录会被锁拒绝。对话框需对 stale-lease 写明“建议先修复作品锁；删除后如需重新加入，需要手动移除目录中的锁文件夹”。菜单中“修复作品锁”排在“删除”之前。
5. **会话账本**：沿用 548 的 `ConversationTransfers.forgetWorkspace`；transfers 未配置时拒绝删除（549-review blocker 2），避免留下会话故障。
6. **全局“重新加载作品”按钮**：改为每个异常节点菜单内的“重新加载作品”（重新请求整个列表，行为与现在相同）。列表请求整体失败（`isError`）时的全局错误块保持不变，它不属于某个作品。

## 4. 节点交互建议（交给设计稿确认）

| 项 | 正常作品 | 异常作品 |
|---|---|---|
| 行组件 | `TreeNode` depth 0 | 同一 `TreeNode` depth 0 |
| 图标 | `FolderClosed/FolderOpen`（`--icon-work`） | 合成图标：`FolderClosed` + 右下角感叹号徽标；错误类为 `--destructive` 红色，锁类可选 `--warning` 琥珀色 |
| 标题文字 | 前景色 | 用户 2026-11-10 补充：错误类柔和红（玄墨 `#e08a80` / 宣纸 `#a3463c`），警告类柔和黄（玄墨 `#d9b45f` / 宣纸 `#7e621c`），对侧栏底色对比度均 ≥ 4.5 |
| 展开 | 可展开子树 | 不可展开（箭头位置留空），没有可显示的子树 |
| 单击 | 打开作品 tab | 打开操作菜单（与 `…` 相同） |
| 悬停卡片 | 作品概况 | 异常原因与建议处理（无路径） |
| `…` / 右键 | 重命名、删除（用户 2026-11-10 补充：内容与现在完全相同，不改） | 按 reason 的处理项 + 分隔线 + 删除 |
| 其他视图 | `NavigationWorkGroup` | 同组件，标题用合成图标，正文一行原因 |

菜单项（按 reason）：

| reason | 处理项 |
|---|---|
| stale-lease | 修复作品锁、重新加载作品 |
| in-use | 重新加载作品 |
| missing / changed / damaged / unavailable | 重新加载作品 |
| 全部 | 删除（分隔线后，destructive） |

“重新关联目录”“在访达中显示”不在本次范围：前者需要新的主进程授权流程（`open()` 对路径不同的同一作品会拒绝），后者对缺失目录无意义。

## 5. 风险与开放问题

- **锁类的颜色。** 用户要求的是红色感叹号；锁类（数据完整，可恢复）用琥珀色能区分严重程度。设计稿同时展示两种方案，请用户选择。
- **右键菜单是否也加到正常作品节点。** “统一节点形式”倾向于加；它是正常节点的新增行为。设计稿默认加上（菜单内容与 `…` 相同）。
- **删除与锁修复交接并发**：界面互斥；服务端交接会因索引缺失得到 `WORK_LEASE_NOT_REGISTERED` 失败，数据不丢（548-review 第 7 条）。
- **验收**：真实目标系统需制造“目录缺失 + 关联会话”和“stale-lease”两个作品，在安装版中删除，并检查会话列表可打开、目录字节不变。

## 6. 下一步

设计稿：`design/faulted-work-node/index.html`（合成数据，离线静态页面）。用户批准后再写技术方案、测试用例，并按 AGENTS.md 流程做独立审核和 TDD 实现。
