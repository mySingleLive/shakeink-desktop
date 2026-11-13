# 569 删除作品后重用已清空目录导入 · 代码审核

日期：2026-11-13。审核对象：未提交的 `desktop/service/workspaces.ts` 改动（`git diff desktop/service/workspaces.ts`：新增 `holdsWorkStorage`，重写 `protectedDirectories`）。对照：`docs/567-reused-empty-import-target-plan.md` 及其评审、`docs/568-reused-empty-import-target-cases.md` 及其评审、`tests/unit/reused-import-target.test.ts`。`desktop/main/novel-import.ts` 中的未提交改动属于其他任务，不在本次范围内。本次没有修改任何源文件或测试文件。

## 一、实测

Node 24.18.0，单独运行 `node --import tsx --test tests/unit/reused-import-target.test.ts`：12 项全部通过，0 失败，0 跳过，耗时约 129 s（当前用户不是 root，RT-10 实际执行了）。

## 二、与方案逐条核对

| 方案要求 | 实现（`workspaces.ts`） | 结论 |
|---|---|---|
| 列表中的作品路径始终受保护 | `:178` 先取 `listed`，`:181` 无条件并入结果 | 符合（RT-04、RT-04b） |
| 不在列表中的预留路径，仅在仍含存储内容时受保护 | `:179` 去重并排除 `known`，`:180` 逐个调用 `holdsWorkStorage` | 符合 |
| 前缀 `/^\.?(shakeink|xuanxiang)-/u`，`database`、`assets`，`/^\.[0-9a-f-]{36}\.tmp$/u` | `:40` 三个常量与方案原文一致 | 符合 |
| `ENOENT`/`ENOTDIR` 视为不受保护，其它读取错误视为受保护 | `:44` `return !(code==='ENOENT'||code==='ENOTDIR')` | 符合，失败封闭 |
| `.DS_Store` 和用户文件不算存储内容 | `:45` 只匹配上述三类 | 符合（RT-03、RT-13） |
| 每个预留只读一次顶层目录，并发读取，不递归 | 一次 `readdir`，`Promise.all` | 符合 |
| 预留记录不删除、不修改 | 只读 `creationReservations.directories()` | 符合（RT-07b 断言 R1 预留仍在） |

## 三、存储条目覆盖核对

逐一核对了应用写入作品目录顶层的条目：

| 来源 | 顶层名称 | 是否命中 |
|---|---|---|
| `shared/brand-names.ts` 两族 | `*-work.json`、`*-storage.json`、`*-storage-required.json`、`*-app.json` | 前缀规则（不带点） |
| 同上 | `.*-lock`、`.*-lease-recovery.json`、`.*-restores`、`.*-preserved` | 前缀规则（带点） |
| `core/work-lease-recovery.ts:224` | `` `${leaseTemporaryPrefix}${randomUUID()}.tmp` `` | 前缀规则 |
| `core/data-root.ts` | `migrationStagePrefix*`、`rootRecoveryPrefix*` | 前缀规则 |
| `main/startup-recovery.ts:140,177` | 应用标记隔离后的名称 `shakeink-app.json.corrupt-<时间>.json` | 前缀规则 |
| `database/application-restore.ts:26` | `.xuanxiang-application-candidate.json` | 前缀规则 |
| `workspaces.ts:249,433`，`workspace-assets.ts:24` | `assets`、`database` | 名称集合 |
| `core/versioned-store.ts:26` `atomicWrite` | `` join(dirname(path), `.${randomUUID()}.tmp`) `` | 见下 |

`atomicWrite` 的临时文件名是 `.` + `crypto.randomUUID()` + `.tmp`。Node 的 `randomUUID()` 输出 36 个字符的小写 8-4-4-4-12 十六进制串，字符集只有 `[0-9a-f-]`，所以 `ATOMIC_TEMPORARY` 一定能匹配。这个正则还会接受连字符位置不同的串，但多匹配只会让目录多受保护，属于安全方向。作品目录中经 `atomicWrite` 写入的文件有清单（`:262`）、`storage`（`work-storage.ts:52,69`）和 `storageRequired`（`workspace-storage.ts:20`），临时文件都在作品目录顶层，因此都能被识别。`discardImportCreation` 的 `:304` 用的是同一个正则。

只出现在应用根或引导目录、不会写进作品目录的名称有：`catalog.json`、`inbox`、`backups`、`session`、`novel-imports`、`.root-relocation-<uuid>.tmp`（写在 `bootstrap.path`）、`data-root.corrupt-*`。旧应用根总带 `*-app.json` 或其隔离名，前缀规则可以覆盖。RT-05 的条目列表是遍历 `BRAND_NAMES` 生成的，以后品牌族新增字段时，测试会自动纳入。

覆盖完整，没有发现遗漏。

## 四、调用者影响

`protectedDirectories` 只在 Service 中通过 `protected-directories` RPC 暴露（`service/index.ts:146`）。主进程的调用者如下：

- `main/index.ts:163`，来源选择器 `protectedRoots`：选择器的 `io()` 带超时（`novel-import-source-picker.ts:114`），如果读目录卡住，选择器报“读取此位置超时”，不会无限等待。已清空的旧目录可以被选作来源，之后如果把它选作保存目录，`chooseTarget` 中的 `s.files.some(within…)` 会拒绝。
- `main/index.ts:273,395`，文件导出 `guardFileExportTarget`：`workRoots` 只拦作品内部文件名（`file-export-target.ts:4,10`），同时会沿祖先目录检查 `workManifest`/`appMarker`。旧目录只要还有清单就照样受保护，与本次改动无关。
- `main/index.ts:386`，配置文件导出：整棵子树受保护。放宽后可以把配置写进已清空的旧目录。这个影响在方案中已经接受，那些目录里没有作品数据。
- `main/index.ts:399` 到 `novel-import.ts:1928,2025,2049,2054`（扫描、`readChosen`、`chooseTarget`）：`chooseTarget` 依次做重叠检查、空目录检查（只忽略 `.DS_Store`）、`restoring` 豁免。行为与 RT-11、RT-12、RT-13、RT-04b 一致。处于 `restoring` 的原会话目录里仍有清单，所以仍受保护并由 `sameTarget` 豁免，逻辑不变。

调用者没有依赖返回顺序或返回集合在两次调用之间不变，没有发现会被这次改动破坏的调用者。

## 五、问题（按严重程度）

没有高或中级问题。

### 低1：`protectedDirectories` 第一次在主路径上引入文件系统 I/O，挂起的卷会拖住选目录和导出

位置：`workspaces.ts:180`，调用点 `main/index.ts:273,386,395,399`。

改动前，这个函数只查一次数据库。现在每个“已不在列表中”的预留都要做一次 `readdir`。预留只增不减，如果某个旧预留位于已挂起的网络卷或 SMB 卷上，`readdir` 可能长时间不返回。来源选择器有 `io()` 超时，但 `chooseTarget`、文件导出守卫和配置导出没有超时，界面会一直停在等待中。卷已卸载时通常很快返回 `ENOENT`，不受影响；`EACCES`、`EIO`、`EMFILE` 都按受保护处理，属于安全方向。数据不会受损，所以定为低。可选的处理是给单个 `readdir` 设超时并在超时时按受保护处理，可以另开任务，不必阻塞本次合入。

### 低2：插入位置使 `removeTree` 的文档注释脱离了函数

位置：`workspaces.ts:36-41`。

新代码插在原有注释 `/** Remove a directory tree without following symbolic links. */` 和 `removeTree` 之间。于是 `:36` 的注释后面紧跟另一段 JSDoc，成了孤立注释；`:37-39` 的说明挂到了常量 `WORK_STORAGE_ENTRY` 上，而 `holdsWorkStorage` 本身没有注释。不影响行为。要求：把 `:36` 那一行移回 `removeTree` 正上方。

### 低3：临时文件正则重复定义

位置：`workspaces.ts:40` 的 `ATOMIC_TEMPORARY` 和 `:304` 的局部常量 `temporary`。

两处正则相同，以后如果 `atomicWrite` 改了命名，可能只改到一处。建议 `:304` 直接引用 `ATOMIC_TEMPORARY`。可以顺手改，也可以留到以后。

### 提示1：用户自己的 `assets`/`database` 目录会让提示变成“重叠”

如果作品删除后，用户在旧目录里放了一个自己的 `assets` 文件夹（常见名字），目录会继续受保护，提示是“保存目录不能与来源或应用目录重叠”，而不是“请选择空目录”。两种情况下目录都不能使用，结果失败封闭，只是提示不够准确。方案明确接受“预留目录中这两项只视为本应用写入”，记录在这里，不要求修改。

### 提示2：并发数没有上限

`Promise.all` 对所有预留同时发起 `readdir`。按实际使用量（几十到几百个预留）不会有问题。即使触发 `EMFILE`，也会按受保护处理，属于安全方向。

## 六、正确性和并发补充

- `protectedDirectories` 不经过 `this.serialize`，所以不会阻塞 `create` 或 `discard`。它读到的是某一时刻的快照，“检查后才选择”之间的竞争在方案评审低2中已经接受：后到的请求在 `create` 时读到对方的清单，报 `REQUEST_CONFLICT`，不改动文件（RT-07b、RT-09 已验证）。
- 预留路径是规范路径，与列表中的 `record.path` 用字符串比较。两者来自同一个 `canonical`，比较可靠。
- 如果预留路径被替换成指向其他目录的符号链接，`readdir` 会跟随链接读取目标。结果只决定这个路径是否受保护；`chooseTarget` 之后仍会做 `identity` 校验、空目录检查和 `create` 的清单校验，不会造成写入越界。

## 七、结论

**通过。** 实现与方案 567（评审后版本）逐条一致。存储条目覆盖了应用写入作品目录的全部顶层名称，`ATOMIC_TEMPORARY` 与 `atomicWrite` 实际生成的 `.${randomUUID()}.tmp` 相符。读取错误除 `ENOENT`/`ENOTDIR` 外一律失败封闭。各调用者没有受损。12 项用例全部通过。低2（注释错位）建议合入前顺手修正。低1、低3 可以留到后续处理，不阻塞合入。

## 补充审核 2R

日期：2026-11-13。审核对象：`git diff desktop/service/workspaces.ts desktop/service/conversation-runtime.ts` 中 2R 新增部分（`create()` 的 `ownsFolder`/`stale`/`restoreStale`、`retireStaleWorks`、`staleWorkHook` 及其在 `configureConversationTransfers` 中的接线）。对照 `docs/567-reused-empty-import-target-plan.md` 末尾“补充 2R”。未修改任何源文件或测试文件。

### 实测

Node 24.18.0，单独运行 `node --import tsx --test tests/unit/reused-import-target.test.ts`：16 项全部通过，0 失败，0 跳过，耗时约 158 s。

### 中1：多条同路径旧记录时，忙碌检查与 `forgotten.add` 之间有空档

位置：`workspaces.ts:394-396`。

第一轮循环逐条 `await this.retiring.get(row.id)` 后检查 `active`，第二轮才 `forgotten.add`。只有一条旧记录时，最后一次检查与 `forgotten.add` 之间没有 `await`，是安全的。若有两条及以上（同一目录被重复登记过的历史列表，或此前普通建书绕过向导直接在已清空目录建书），检查完第 1 条后，`await retiring.get(第2条)` 让出执行权，此时 `run(第1条)` 可以通过 `forgotten` 检查并 `active++`；随后第二轮把这个正在使用的槽从 `slots` 删掉并 `disconnect`，正在运行的任务会被关库。`forget()`（`:408` 起）只有单条记录，没有这个问题。

要求：先 `await Promise.all(rows.map(r=>this.retiring.get(r.id)))`，再在同一段同步代码里完成全部忙碌检查和 `forgotten.add`。建议补一条两条同路径记录的用例。

### 中2：`open()` 没有同步 2R 规则，恢复路径会产生同目录两条记录

位置：`workspaces.ts:362`、`:383`。

`create()` 在钩子失败、`catalog.update` 冲突等情况下会留下“目录中已是新作品（phase=ready）、但未登记”的状态。`discardImportCreation` 对这种目录返回“目录中的作品已完成建库，尚未登记到作品列表；请用‘打开作品目录’找回”（`:326`）。用户照做后，`open()` 的 `previous` 只按 `id`/`novelId` 匹配，旧记录（同一 `path`、同一 inode）不会被移除，`catalog.update` 只追加新记录。结果是侧边栏出现同目录两部作品，旧的一条每次 `run()` 都因清单 id 不符报“作品目录身份不匹配”（`:527`）。这正是 2R 想避免的情况。方案写了“`open()` 不变”，但没有考虑这条恢复路径。

要求二选一：(a) `open()` 登记时同样移除 `path===canonical && id!==record.id` 的记录（走同一套 `retireStaleWorks` + 钩子）；(b) 若坚持不改 `open()`，在方案中明确记录此行为，并让失败提示引导用户用原请求重试（同请求重试已由 RT-15 证明可行），而不是“打开作品目录”。

### 中3：会话删除不可回滚，与“旧记录复原”不对称

位置：`workspaces.ts:283-285`，`conversation-transfer.ts:109-117`。

钩子在 `catalog.update` 之前执行，`forgetWorkspace` 会逐条把旧作品的会话在全局账本中标为删除。以下情况会出现“旧记录复原、但会话已删除”：
- 有多条会话时，删到一半某条 `gate.transfer` 失败（例如该会话正在转移，`conversation-phase.ts:33` 直接抛 `CONVERSATION_TRANSFER_BUSY`）；
- 钩子全部成功，但随后 `catalog.update` 因版本冲突或 `assertRegistration` 失败。

`forget()` 的 `beforeCommit` 也是这个顺序，但那是用户明确删除作品；这里是建新作品时的隐式清理，用户不会预期旧作品的会话消失。另外，如果用户只是把旧作品文件手动搬到别处（目录因此变空），旧记录被移除后可以用“打开作品目录”重新登记，但会话已在账本中删除，找不回来。

建议：要么接受并在方案中写明（会话随列表记录一起丢失，与侧边栏异常作品删除一致），要么把钩子挪到 `catalog.update` 成功之后、以可重试的方式执行（`forgetWorkspace` 是幂等的）。RT-15 只测了钩子第一次调用就抛错的情况，没有覆盖部分成功。

### 低1：吞掉 `disconnect` 错误会泄漏 PGlite 实例，但不会写入新作品

位置：`workspaces.ts:401`、`:579-582`。

`disconnect()` 依次执行 `$disconnect`、`engine.close`、`unlock`。正常情况下旧锁目录已随目录清空消失，`unlock` 必然失败，吞掉这一步是对的。但如果 `$disconnect` 本身抛错，`engine.close()` 根本不会执行；槽同时已从 `slots` 和 `failedRetirements` 删除，`close()` 也不会再重试，这个 PGlite 实例会一直留在内存里直到进程退出。

对写入安全的核对结论：
- 不会删除新作品的锁。退役发生在新作品 `connect()` 之前（`:238` 对比 `:271`），此时目录中没有锁；旧 `release` 先做 `assertHeld`，会校验锁目录的设备号/inode 和 `owner.json` 中的 token（`:83`、`:91-98`）。即使以后再调用，新锁的 token 也不同，会直接抛错。旧槽退役后不再被任何 Map 引用，不会再次 release。
- 旧引擎不能经 Prisma 写入：`LocalPGliteAdapter` 每次操作都调用 `assertLease`（`:455`、`:480`），token 不符时拒绝。
- 旧引擎的 `dataDir` 与新作品的数据库路径相同（都是 `canonical/database`）。没有调用 `engine.close()`，就不会触发关闭检查点，也没有人持有这个连接（忙碌检查已排除运行中任务），所以不会写入。同请求续建时，旧引擎在第一次尝试中已经退役，后续 `run(old)` 会在 `readWorkBrand` 的 id 校验处失败（`:527`），不会打开本请求的半成品数据库。

建议：`$disconnect` 失败时仍尝试 `engine.close()`（只跳过 `unlock`）；若仍失败，把槽放进单独的列表，由 `close()` 重试关引擎。不阻塞合入。

### 低2：在 `serialize()` 内调用 `forgetWorkspace` 没有死锁，但会阻塞队列，也可能直接失败

位置：`workspaces.ts:283`，`conversation-transfer.ts:113`，`conversation-phase.ts:30-48`。

核对结论：`gate.transfer` 会等待该会话上所有进行中的 `gate.run`。现有 `gate.run` 的操作（`conversation-transfer.ts:59`、`:70`，`conversation-runtime.ts:27`）都只走 `works.run`/`runWithGlobal`，不进 `serialize` 队列；`run(old)` 在 `forgotten.add` 之后会立即抛错。账本和预留记录用的 `works.run('inbox')` 也不经过队列，`inbox` 不会进入 `forgotten`。因此目前找不到死锁。代价有两个：等待期间整个 `Workspaces` 队列被阻塞（等待没有超时，最长到某个 DB 短事务结束，例如 `remove` 的 60 s 事务）；如果旧作品某条会话正在转移，会立即抛 `CONVERSATION_TRANSFER_BUSY`，导致建书失败（见中3）。今后如果有 `gate.run` 内的操作调用 `create`/`open`/`forget`/`discardImportCreation`，就会形成死锁，建议在 `staleWorkHook` 注释里写明这一约束。

### 低3：`ownsFolder` 只要求“本请求的清单存在”，不要求其余条目也属于本请求

位置：`workspaces.ts:233-235`。

正常流程中不会有问题：本请求的清单只会写进空目录（`:257`），双品牌清单并存时 `readWorkBrand` 抛错，被当作 `false` 处理。只有用户在续建前把旧作品的 `database/` 等文件手动拷回目录时，旧记录才会在数据仍在目录内的情况下被移除；之后 `connect()` 会把这些文件当成本请求的数据库。这属于人为构造的情况，记录在这里，不要求修改。

### 提示：作品仍为 ACTIVE、但目录被手动清空

旧记录会被移除，会话被标为删除。按用户 2R 决定（列表路径只在目录仍含作品存储时受保护），这种情况可以接受：数据已不在目录中，旧记录本来就只能报“缺失/已变化”。会话丢失的问题见中3。

### 其他核对（无问题）

- `restoreStale` 与 catch：只要重读的列表仍包含旧 id 就复原 `forgotten`（`:294-295`）。`catalog.update` 成功后（`catalog-committed` 阶段抛错、`creationReservations.complete` 失败）列表已不含旧记录，不会复原，与磁盘一致；之后用同一请求重试会走 `previous` 分支返回新记录。读列表失败时退回 `before` 并复原，结果只是 `run(old)` 从“不在索引”变成在 `list()` 时报同样的错，无害。
- 复原后旧槽已关闭，`run(old)` 会重新连接，但会在清单 id 校验处失败（`:527`），不会接触新目录内容。
- 退役后的内容复查（`:239-240`）只比较名称集合，足以发现退役期间目录被改动。
- `previous` 分支（旧请求重放）在 `ownsFolder` 之前执行：旧记录仍在列表时，`manifest.id!==previous.id` 抛“作品目录身份不匹配”；旧记录已移除时走普通分支，报 `REQUEST_CONFLICT`（RT-08/09、RT-07b）。两种情况都不写文件。
- `conversation-runtime.ts:34-35` 的钩子接线与 `active` 的恢复条件一致；`index.ts:60` 只配置一次。

### 测试质量

- RT-14 覆盖面最好：普通侧边栏删除（软删除）路径、旧作品有空闲连接（先 `run(old)`，因此实际走到了“锁已消失”的退役分支）、钩子参数、`run(old)` 被拒、新作品重新受保护。
- RT-15 覆盖钩子失败和同请求续建（第二次 `create` 走“本请求清单”分支）。缺少的检查：失败后 `run(old)` 的行为、`forgotten` 是否已复原。
- RT-16 覆盖单条记录的 `WORK_BUSY`，没有覆盖中1的多条记录竞争。
- RT-17、RT-04b 断言清楚。
- 缺少的用例：(1) 列表中的作品目录只含外来文件时，旧记录保留并报“需要空目录”（RT-13 只用了已 `forget` 的记录）；(2) 退役期间目录内容变化，报“所选目录内容已变化”并复原；(3) `catalog.update` 成功后失败（例如 `initializer.phase('catalog-committed')` 抛错），旧记录不复原；(4) 中2 的 `open()` 恢复路径；(5) 两条同路径旧记录；(6) 通过 `configureConversationTransfers` 的真实接线，验证旧作品的会话在账本中被标为删除，且其他作品的会话不受影响。

### 结论（2R）

**有条件通过。** 没有高危问题：退役不会删除新作品的锁，旧引擎不能写入新作品，`serialize` 内调用钩子目前没有死锁。合入前需要处理中1（把检查和 `forgotten.add` 放进同一段同步代码，改动很小）和中2（修改 `open()`，或修改恢复提示并在方案中记录）。中3 需要用户或方案作者确认是否接受“会话不可回滚”；低1–低3 可以留到后续处理。建议补上述缺失用例中的 (1)(2)(3)(6)。
