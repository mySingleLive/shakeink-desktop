# 608 · 删除作品时询问是否删除磁盘文件 代码评审

评审范围：未提交改动 `desktop/service/workspaces.ts`、`dispatcher.ts`、`work-creation-reservations.ts`、`index.ts`、`src/components/layout/SidebarTree.tsx`，以及 `tests/integration/work-delete-files.test.ts`、`tests/unit/work-delete-files.test.ts`、`tests/browser/works-loading.test.ts`、`tests/integration/faulted-work-removal.test.ts`。依据 `docs/608-work-delete-files-plan.md`（§6 优先）。

## 已执行

- `node --import tsx --test tests/unit/work-delete-files.test.ts tests/integration/work-delete-files.test.ts tests/integration/faulted-work-removal.test.ts`（Node v24.18.0）：29 项，29 通过，0 失败，用时 318 s。
- 浏览器用例 `tests/browser/works-loading.test.ts` 未运行，只读代码。
- 高 1 用临时脚本（放在 `tests/.scratch-608/`，运行后已删除，未改源码）实测复现，结果见下。

## 结论：修改后通过

删除路径的边界检查（符号链接、硬链接、跨设备、身份/清单核对、应用数据根、嵌套作品、锁）整体正确，提交前失败都会回滚，提交后失败只报 `kept`。但带 `deleteFiles` 时，忙检查和 `forgotten.add` 之间多出了异步预检，破坏了“忙检查与守卫同步设置”这一原有不变量，正在使用的作品会被关闭并删除（高 1）。修复高 1、中 1 后可合入，中 2、中 3 建议同时处理。

## 高

### 高 1：预检插在忙检查与 `forgotten.add` 之间，预检期间开始的任务会被强行关闭，目录随后被删除

- 位置：`desktop/service/workspaces.ts:493-499`。`:494` 做忙检查，`:495` `await this.inspectDeletion(...)`（多次 `lstat/readdir/realpath`，还有 `creationReservations.records()`，后者会经 `run('inbox')` 访问数据库），`:496` 才 `forgotten.add(id)`。`:479` 的注释写明守卫必须与忙检查同步设置，`retireStaleWorks`（`:457`）也按此实现。
- 失败场景：作者在已打开章节的作品上选“是”。预检期间，自动保存或 `GET /api/novels`（会对每个作品 `run(row.id, …)`）调用 `run(work.id)`。此时 `forgotten` 里还没有这个作品，`run` 新建连接并把 `active` 加到 1。预检结束后 `:498` 不再检查 `active`，直接 `slots.delete(id)` 并 `retire`，正在执行的事务被断开；锁由本连接释放，`assertLockReleased` 通过；提交后整个目录被删除。
- 实测：用一个钩子让 `records()` 等待，期间启动 `works.run(work.id, …)` 并保持运行。结果 `removeWork` 返回 `files: 'removed'`，目录已不存在，任务随后报 `ENOENT … lstat`。“作品仍有任务在运行”（`WORK_BUSY`）的保证失效，也违背“不删除仍在使用的目录”。
- 修改：预检移到忙检查之前；或者预检完成后在同一同步块内重新检查 `active` 并 `forgotten.add(id)`。`await this.retiring.get(id)` 也应放在预检之后，或者在预检后再等一次。补一条集成用例：预检期间启动任务，期望 409 `WORK_BUSY`，目录与 catalog 不变（可以像上面那样给 `records()` 挂钩子）。

## 中

### 中 1：锁只在提交前检查一次，删除时先删数据库、最后才删锁，中间被其他进程拿到的锁会被直接删掉

- 位置：`workspaces.ts:503`（`assertLockReleased`）与 `:509`（`deleteWorkFolder`）之间隔着 `beforeCommit()`（会话台账写入）和 `catalog.update`。`deleteWorkFolder`（`:85-93`）先删除除清单、锁以外的所有条目，包括 `database/`，再对锁目录 `removeTreeOnDevice`，不看 `owner.json` 是谁写的。
- 失败场景：另一个进程在这段时间里打开同一目录并 `mkdir` 锁，例如另一套数据根下的玄印写作或旧品牌应用。删除会清掉它正在使用的 `database/`，再删掉它的锁。`guard()` 只核对根目录身份和清单，发现不了新出现的锁。
- 修改：`deleteWorkFolder` 开始前，以及每个顶层条目前的 `guard()` 里，重新确认锁目录不存在，或仍是提交前看到的同一个遗留锁（dev/ino 与 `owner.json` 内容都一致）；否则停止，返回 `kept`。单元测试可以在第一个 `unlink` 后创建锁，期望 `database` 之外的条目保留。

### 中 2：方案说“残留目录靠清单继续受保护”，实际靠的是创建预留记录，用“打开”加入的作品没有这层保护

- 位置：`workspaces.ts:227-230` `protectedDirectories()` 只取 catalog 路径和创建预留路径。提交后 catalog 里已没有这一行（`:505`）。
- 失败场景：WD-17 用 `create()` 建作品，创建预留记录一直保留，所以 `protectedDirectories()` 仍含该路径，用例通过。若作品是通过 `open()` 加入的（例如从另一台机器拷来的目录），没有预留记录；部分删除得到 `kept` 后，残留目录（清单仍在）不再受保护，主进程的文件导出 / 配置写入（`desktop/main/index.ts:273,395` 的 `workRoots`）可以写进去。方案 §6.2 第 6 点的说法不成立。
- 修改：要么在方案里改写这项保证，要么让 `protectedDirectories` 记住本进程 `kept` 的路径，或者扫描残留清单。WD-17 应补一个 `open()` 加入作品的变体。

### 中 3：删除之前，已在列表中的作品从“删除小说”改成了 `removeWork`，语义变化需要在台账中明确

- 位置：`SidebarTree.tsx` 删除了 `deleteMutation`（原 `DELETE /api/novels/[id]`，只把 novel 标记为 `DELETED`）。健康作品现在走 `DELETE /api/works/[id]`：从 catalog 移除并删除关联对话（`transfers.forgetWorkspace`）。
- 这符合用户确认的“否 = 从列表移除并删除关联对话”，但它是对现有行为的改变：以前选“确认删除”，对话仍留在数据库里；现在选“否”，对话会被删除。用例 WDB-03 覆盖了请求体，但 `docs/requirements-traceability.json` 尚未新增 WD-608（方案 §5 要求），也没有记录旧条目被取代。需要补台账；`desktop/handlers/novels/[id]/route.ts` 的 DELETE 已无界面调用方，要写明保留还是删除。

## 低

### 低 1：健康作品读取路径失败后，“否”和“是”都不能点，只能取消，也没有重试

- 位置：`SidebarTree.tsx:2295`。健康作品没有 `workId`，“否”只在 `workLocation.state === "ready"` 时可用。
- 场景：`/api/works/location` 返回 500 或 404 时（例如 catalog 与 novel 列表暂时不一致），对话框显示“无法读取作品目录位置”，作者没有办法删除，只能关闭后重开。可以加一个“重试”按钮，或在文案里说明需要关闭后重试。目前没有浏览器用例覆盖健康作品的这一状态（WDB-06/07 只测了不可用作品）。

### 低 2：`deletionRefusal` 只拒绝 `/`、主目录及其祖先，不拒绝“文稿/桌面/下载”等常用目录

- 位置：`workspaces.ts:60-66`。
- 场景：作者当初在空的 `~/Desktop` 上创建了作品，后来桌面上堆满了其他文件；选“是”会把整个桌面永久删除。对话框里虽然显示了路径，但按钮只写“是，删除文件”。主进程已有常用目录列表（`desktop/main/index.ts:156-160`），建议把这些目录也拒绝，或者在对话框中额外警告。

### 低 3：`removeTreeOnDevice` 按路径递归，存在常见的“目录换成符号链接”竞态

- 位置：`workspaces.ts:50-58`。在 `again` 的 `lstat` 和对子项 `join(path, name)` 的 `unlink` 之间，如果有进程把 `path` 换成指向外部的符号链接，`unlink` 会穿过链接，删掉外部文件。这需要本机有进程配合时机去做，与现有 `removeTree` 是同一类问题。可以在每个子项操作前重新对父目录做 `lstat` 并比较身份来收窄窗口（Node 没有 `unlinkat`，无法彻底消除）。

### 低 4：预检和删除都在 `serialize` 队列里完整遍历目录树，没有上限

- 位置：`workspaces.ts:535-546`、`:85-93`。目录很大时（例如作者放了大量素材），会长时间阻塞所有 `open/create/removeWork`。可以考虑加条目数上限，超出时拒绝并提示。

### 低 5：界面细节

- `SidebarTree.tsx` 的 `mutationFn` 用 `data.files in DELETE_OUTCOME_TOAST` 判断结果，`in` 会把原型上的键（如 `toString`）也算进去，应改用 `Object.hasOwn`。服务端可信，实际影响很小。
- 选“是”时，未知的 `files` 值会被当成 `kept-by-choice`，提示“作品已从列表中删除”，可能让作者以为文件还在或已删。建议改成 `kept` 那条警告文案。
- 世界删除对话框里留下了只剩一个分支的三元表达式（`SidebarTree.tsx:2253` `: ""`），可以简化。

## 测试缺口（错误实现仍能通过）

1. 高 1 的竞态没有用例。WD-18 只在请求发出前持有任务，把忙检查放在预检之后的正确实现与当前实现都能通过。
2. 中 1：没有用例在提交后、删除前创建新锁。
3. WD-17 只用 `create()` 加入的作品，靠预留记录通过（中 2）。
4. WD-22/23 第二段 `void reopened`，没有断言 `open()` 的结果，也没检查目录是否被删；只要 catalog 里的行都还有目录就能通过。应断言两种合法顺序之一：删除先完成时 `open` 失败且目录不在；`open` 先完成时删除得到 409 或 404。
5. 浏览器用例没有覆盖 `WORK_PATH_CHANGED`，也没有覆盖健康作品路径读取失败（低 1）。
6. WDU-01 只验证遇到其他设备时停止，没有验证 `deleteWorkFolder` 在这种情况下得到 `kept`，并且清单保留。

## 已确认无问题

- `GET /api/works/location` 精确匹配，放在 `[id]` 路由之前；参数校验严格；`GET /api/novels` 和错误文案里不含路径（WD-19/20、WDB-11）。
- 请求体：空体兼容旧行为；严格 schema，未知字段返回 400；路径不一致返回 409，catalog 不变（WD-04/05）。
- `deleteFiles=false` 时 `options.deleteFiles ? await … : null` 不产生 `await`，忙检查与守卫仍是同步的，与原 `forget()` 行为一致（WN-10 只多了 `files` 字段）。
- 锁判定：本进程 pid 一律视为在用，覆盖了 Worker 与主进程同 pid、同进程另一个 `Workspaces` 实例（WD-14b）；他机锁、存活进程、符号链接锁、内容损坏的锁都会被拒绝。
- 关闭失败（`retire` 返回 false 或 `failedRetirements` 有残留）时，在 `beforeCommit` 之前就拒绝，并回滚 `forgotten`；随后选“否”仍能完成（WD-16）。
- 提交后的异常只返回 `kept`，不回滚、不抛出；清单和锁最后删除（WDU-02/03）。
- 符号链接、硬链接只删除链接本身，外部内容不变（WD-03）；目录跨设备时预检拒绝，删除时也会停止。
- 界面：`locationRequest` 计数挡住了迟到的路径响应（WDB-13）；`removeFlight` 保证只发一次请求；进行中三个按钮都禁用，对话框不能关闭（WDB-08）。

## 复审

逐项对照当前未提交代码核对，没有沿用修复说明。中 3（台账）另行处理，本节不涉及。

已执行（Node v24.18.0）：
- `node --import tsx --test tests/unit/work-delete-files.test.ts tests/integration/work-delete-files.test.ts tests/integration/faulted-work-removal.test.ts`：33 项，33 通过，0 失败，用时 72 s。
- `node --import tsx --test tests/browser/works-loading.test.ts`：33 项，33 通过，0 失败，用时 48 s。

### 逐项结论

- **高 1：已修复。** `desktop/service/workspaces.ts:516` 先做一次忙检查，`:519` 预检，`:520` 预检后再等 `retiring`，`:521` 再做一次忙检查，`:522` 紧接着 `forgotten.add`。`:521-522` 之间没有 `await`。`run()` 在第一个 `await` 之前就同步完成 `slots.set` 和 `active++`（`:643-683`），所以预检期间开始的任务一定会被 `:521` 拦下。`tests/integration/work-delete-files.test.ts:370` 的 WD-24 在 `records()` 里启动任务，断言 409 `WORK_BUSY`、catalog、目录、对话都不变；任务结束后再删除得到 `removed`。按旧代码（预检后不再检查），这条用例会得到 `removed`，所以它能发现原缺陷。另外 `:525` 与 `:528` 在关闭失败时拒绝删除文件。
- **中 1：已修复。** `:530` 把提交前看到的锁快照存进 `target.lock`。`deleteWorkFolder`（`:98-112`）在开始时、每个顶层条目之前、删锁之前都通过 `guard()`（`:100-103`）用 `sameLock`（`:95`）比较 dev/ino 和 `owner.json` 内容。删完锁后 `:109` 要求锁不存在，然后才删清单。`tests/unit/work-delete-files.test.ts:84` 的 WDU-06 覆盖了“提交后新出现的锁”和“`owner.json` 被改写”两种情况，都断言 `database` 与清单保留。遗留：在 `database/` 内部递归时不再检查锁，窗口只剩一个顶层条目的删除时间，可以接受。
- **中 2：已修复（仅限本进程）。** `:186` 新增 `keptDeletions`，`:536` 在提交后删除失败时记下路径，`:250` 并入 `protectedDirectories()`，再经 `holdsWorkStorage` 过滤（残留清单 `shakeink-work.json` 能匹配 `:39` 的规则）。`tests/integration/work-delete-files.test.ts:389` 的 WD-17b 用另一个数据根创建、在本数据根 `open()` 加入，确认本数据根没有预留记录，得到 `kept`，并断言路径仍受保护。遗留：`keptDeletions` 只存在内存中，应用重启后，用 `open()` 加入的作品的残留目录就不再受保护。`docs/608-work-delete-files-plan.md:116`“清单仍在，`protectedDirectories` 继续保护残留目录”的说法没有改，建议补一句“限本次运行”，或者改为启动时扫描残留清单。
- **低 1：已修复。** `src/components/layout/SidebarTree.tsx:2295` 在路径读取失败时显示“重试”按钮，点击后调用 `openDeleteWork` 重新读取，删除进行中按钮禁用。`tests/browser/works-loading.test.ts:410` 的 WDB-07b/09b 覆盖了健康作品读取失败时“是/否”都禁用、重试后出现路径，以及 `WORK_PATH_CHANGED` 留在对话框内。
- **低 2：已修复。** `workspaces.ts:64` 拒绝主目录下的 Desktop、Documents、Downloads、Library、Movies、Music、Pictures、Public 等，只拒绝目录本身，子目录仍可删除。WDU-04/05（`tests/unit/work-delete-files.test.ts:73`）覆盖了 Desktop、Documents、Downloads，以及 `Documents/作品` 可以删除。小问题：列表里的 `iCloud Drive` 在 macOS 上实际不在 `~` 下，这一项不起作用，但无害。
- **低 5：已修复。** `SidebarTree.tsx:1526` 改用 `Object.hasOwn`。选“是”时未知的 `files` 值落到 `"kept"`，显示警告文案；选“否”时仍是 `kept-by-choice`。`:2259` 的单分支三元表达式改成了 `&&`。
- **测试缺口 4：已修复。** `tests/integration/work-delete-files.test.ts:347-367` 按 `files` 分两支断言：删除先完成时 `open` 失败、目录不存在、不在列表中；`open` 先完成时作品在列表中、目录保留。注意：DELETE 路由在进入 `removeWork` 前没有 `await`，删除总是先进入 `serialize` 队列，所以实际只会走第一支。断言是正确的，只是第二支没有被执行到。
- **测试缺口 6：已修复。** `tests/unit/work-delete-files.test.ts:104` 的 WDU-01b 让 `database` 看起来在另一台设备上，断言 `deleteWorkFolder` 报“其他磁盘”，清单和 `database/PG_VERSION` 都保留。缺口 1、2、3、5 分别由 WD-24、WDU-06、WD-17b、WDB-07b/09b 补上。

### 删除后的缓存清理（`SidebarTree.tsx:1534-1545`）：未发现回归

- `setQueryData<NovelList>(["novels"], current => current && {...})` 按 `novelId` 同时过滤 `novels` 和 `unavailableWorks`。缓存为空时返回 `undefined`，不会写入任何数据。随后的 `invalidateNovels()` 会用服务端结果覆盖。
- `cancelQueries` 和 `removeQueries` 的判断条件 `query.queryKey.includes(work.novelId)` 只做顶层严格相等。`src` 中涉及作品的 key 都是 `[类别, novelId, …]` 这种形式，没有把 `novelId` 嵌在对象里的 key（已 grep `queryKey: [ … { … novelId`），所以不会漏删。`novelId` 是 UUID，不会误删别的查询。`chat-conversations` 不含 `novelId`，仍靠后面的 `invalidateQueries` 刷新。
- 执行顺序是：先 `closeAllTabsOfNovel`，再从列表中移除该行，最后删除查询，所以面板在下一次渲染时就会卸载。删除查询时仍挂着的观察者只会存活到这次渲染，不会长期重新请求。“未找到”（`not-found`）分支也走同一套清理，结果正确。
- 测试缺口（新问题，低）：没有浏览器用例断言删除后 `["novels", novelId]`、`["characters", novelId]` 等查询已被移除，也没有断言不会重新请求到“作品未关联到本地目录”。如果把这段代码删掉，现有 33 项浏览器用例仍会全部通过。建议在 WDB-05/10 里补一条 `getQueryCache().findAll()` 断言。

### 结论：通过

高 1、中 1、中 2、低 1、低 2、低 5 以及测试缺口 1–6 都已修复，并有用例覆盖，相关用例全部通过。剩下两项都是低级别、不阻塞合入：一是 `keptDeletions` 重启后失效，方案 §6.2 的说法需要同步修改；二是缓存清理没有用例覆盖。中 3 等台账处理完成后再一并验收。

## 中 3 验收（2026-11-26）

- **已处理。** `docs/requirements-traceability.json` 新增 WD-608 条目：需求、来源、实现、用例、真实目标证据和限制。`verificationLimits` 写明正常作品原“删除小说”（`DELETE /api/novels/[id]`，只标记 `DELETED`，对话保留）已被本流程取代，选“删除”会删除关联对话；Web 路由保留，桌面界面已无调用方；以前用它删除的作品仍留在 catalog 中，本次不处理。
- 按钮改名（用户 2026-11-26：取消/删除/删除，不保留文件）已同步到方案、用例和台账。
- 复跑（Node v24.18.0）：`tests/unit/work-delete-files.test.ts`、`tests/integration/work-delete-files.test.ts`、`tests/integration/faulted-work-removal.test.ts`、`tests/browser/works-loading.test.ts` 共 66 项，66 通过，0 失败，用时 72 s。
