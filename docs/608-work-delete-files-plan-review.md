# 608 删除作品时询问是否删除磁盘文件：技术方案独立审核

审核对象：`docs/608-work-delete-files-plan.md`。对照的代码是当前工作区的 `desktop/service/workspaces.ts`、`desktop/service/dispatcher.ts`、`desktop/service/conversation-transfer.ts`、`desktop/core/brand-names.ts`、`desktop/core/root-ownership.ts`、`desktop/main/index.ts`、`desktop/main/novel-import.ts`、`src/components/layout/SidebarTree.tsx`、`src/components/desktop/UnavailableWorks.tsx`，以及 docs/548、docs/567 和两份相关测试。本次审核只写了这一份文件，没有运行代码。文案和“是=永久删除、否=只移出列表”的语义由用户选定，本审核不再讨论。

## 结论摘要

- 统一走 `DELETE /api/works/[workId]` 并复用 `forget()` 的方向正确。“预检在修改前、删文件在 catalog 提交后”的顺序也合理。
- 永久删除这一步还有几个会误删数据的缺口，必须在实现前补进方案：嵌套作品（问题 1）、跨文件系统的子目录（问题 2）、连接关闭失败却继续删除（问题 3）、提交后的异常走进旧的回滚分支（问题 4）、删除时根目录身份未逐步核对（问题 5）。
- 结论：**修改后通过**。

## 问题

### 1.【高】作品目录可以嵌套，删除外层作品会连带删掉内层作品

证据：

- 新建作品只检查目录为空、并且不与应用数据根重叠：`main/index.ts:788-797` 直接把原生选择交给 `create-work`，`workspaces.ts:202` 只调 `assertWorkDataBoundary`，`workspaces.ts:160-171` 只比较 `this.root`。打开作品同样只做这项检查（`workspaces.ts:354`）。
- 只有导入流程会拿 `protectedDirectories` 排除已登记的作品目录（`novel-import.ts:2190`）。
- 所以作品 A 目录下的一个空子目录可以新建或打开为作品 B。对 A 选“是”，`removeTree` 会删掉 B 的数据库和资源，而 B 仍留在 catalog 中，变成“目录缺失”的不可用作品。

修正：预检增加一项：catalog 中其他记录的 `path`，以及 `creationReservations.directories()` 中的目录，只要位于 `record.path` 之内（`within(other, record.path)`），就报 `WORK_FILES_UNSAFE`，文案例如“作品目录中包含其他作品，无法删除文件”。反方向（本作品位于别的作品之内）不影响删除，不必拒绝。删除前在同一个队列里再查一次。

### 2.【高】`removeTree` 会进入挂载点，删除别的磁盘上的内容

证据：`workspaces.ts:47-56` 只比较同一层两次 `lstat` 的 dev/ino，不比较子目录与作品根的 `dev`。作品目录里如果有挂载的磁盘映像、网络卷或 bind mount，就会被递归清空。作品根本身是卷根时（例如 `/Volumes/U盘` 被“打开作品”加入），卷里的内容会全部被删掉，最后 `rmdir` 才失败。

修正：

- 为删除作品单独写一个带期望身份的删除函数，不要直接复用 `removeTree`。遇到 `dev` 与作品根不同的子目录就停止，报 `kept`，与 `rm -x` 的做法相同。
- 预检时，如果作品根的 `dev` 与父目录不同（作品根就是挂载点），直接拒绝删除文件。

### 3.【高】连接关闭失败时，`forget()` 仍会提交；方案第 5 步随后会在可能还活着的引擎下删除数据库

证据：

- `workspaces.ts:441-442`：空闲连接交给 `retire()` 处理。`retire()` 吞掉关闭错误，把连接放进 `failedRetirements`（`:451-454`）。
- 紧接着的 `stranded` 分支再关一次，失败也吞掉（`:443-444` 的 `() => undefined`），然后照常执行 `beforeCommit` 和 `catalog.update`。
- 只移出列表时这样处理问题不大。要删文件时，引擎可能还没关，锁也可能仍由本进程持有。方案第 3 步“pid 是本进程即可，第 4 步会关闭”的前提就不成立了。
- 另外，`process.pid` 相等不能证明锁属于这个 `Workspaces` 的连接。服务跑在 `worker_threads` 里（`main/index.ts:325`），主进程和所有 Worker 共用同一个 pid。

修正：

- `deleteFiles` 时，第 4 步关闭连接之后、`beforeCommit` 之前再核对两件事：`failedRetirements`、`slots`、`retiring` 中都没有这个 id；锁目录已经不存在，或者锁属于一个已结束的本机进程。任何一项不满足都抛 `WORK_FILES_UNSAFE`，此时列表还没改。
- 预检中“pid 是本进程”只在本实例确实持有这个 id 的连接时才放行，不要单凭 pid 判断。
- 锁的读取沿用 `discardImportCreation`（`workspaces.ts:335-339`）的严格规则：锁必须是目录且不是符号链接，里面恰好只有 `owner.json`，用 `readMetadata(…, 4096)` 读取。

### 4.【高】提交之后的异常会走进 `forget()` 原有的 catch

证据：`workspaces.ts:440-448` 的 `try` 包住了提交，`catch` 会执行 `forgotten.delete(id)` 并重新抛出。dispatcher 把非 `ContentError` 的错误映射成 500 “暂时无法删除作品，原数据已保留”（`dispatcher.ts:151`）。如果第 5 步写在这个 `try` 里，并且有任何未捕获的异常（身份复核失败、`readdir` 报错），就会出现三个后果：作品已经移出列表，`forgotten` 却被撤销；文件可能已删掉一部分；界面还告诉作者“原数据已保留”。

修正：方案写明文件删除放在 `catalog.update` 所在的 `try` 之外，用一个独立的 `try/catch` 包住全部删除代码，任何异常都只转成 `files='kept'`。单元测试要覆盖“提交后删除抛错”这种情况。

### 5.【高】第 5 步复核身份之后才进入 `removeTree`，删除过程中没有逐步复核作品根

证据：`removeTree` 只比较同一层前后两次 `lstat`，从不对照 `record.identity`（`workspaces.ts:47-56`）。方案中“再次核对 → 调用 `removeTree(record.path)`”之间存在时间窗口：在这期间父路径中某一层被换成符号链接，或者作品目录被改名后在原位置放了另一个目录，删除就会作用到别的目录上。

修正：参照 `discardImportCreation` 的 `guard()`（`workspaces.ts:341-346`）：

- 删除每个顶层条目之前，都执行 `assertDirectory(root)`（root 是预检得到的 `RootIdentity`）和 `brand.assertCurrent()`。
- 最后才删除作品清单和锁目录，再 `rmdir` 根目录。这样中途失败时，残留目录仍有清单，`holdsWorkStorage` 会继续保护它。方案 §4 的风险说明正是依赖这一点，但没有规定删除顺序。

建议同时考虑：在删除期间用 `lockDirectory` 自己持有一份锁，最后再删除锁，防止另一个进程（第二个应用实例、另一台设备经网络卷）在预检之后打开这个目录。如果因为锁已陈旧而无法获得，就按“陈旧锁由已结束进程留下”的规则，保持原方案的处理。

### 6.【中】lstat 返回 `ENOENT` 时显示“作品目录已不存在”，在外置盘拔出时会误导作者

证据：方案第 3 步把 `ENOENT/ENOTDIR` 记为 `missing`，toast 写的是“作品已删除，作品目录已不存在”。外置盘或网络卷断开时也会得到 `ENOENT`，文件其实还在。作者会以为文件已经没了，不再去处理盘上的目录。

修正：

- `missing` 的文案改为“作品已删除，未找到作品目录，没有删除任何文件”。
- `EACCES`、`EPERM` 等其他错误一律按 `WORK_FILES_UNSAFE` 处理，不能落到 `missing`。

### 7.【中】路径第一次发给渲染进程，这是对现有约束的有意修改，需要写进方案并同步测试

证据：`UnavailableWorks.tsx:10` 注明“Never includes paths”。`works-loading.test.ts:171` 等断言页面中不出现 `private-native-path-key`。docs/548 §36 也规定 500 响应不泄露路径。

修正：

- 方案写明：只有 `GET /api/works/location` 返回路径；所有错误响应（包括 `WORK_FILES_UNSAFE` 和 `kept` 的原因）都不能含路径。
- React Query 不缓存这次读取：用 `staleTime: 0` 或直接 `fetch`，对话框关闭后丢弃。
- 新增浏览器测试，断言除了对话框中的路径那一行，toast、alert 和侧栏都不出现路径。

### 8.【中】路由特判的位置和测试

证据：`dispatcher.ts:119-120` 的正则 `^/api/works/([^/]+)$` 只在 `DELETE` 时生效。`faulted-work-removal.test.ts:208-211` 断言 `GET /api/works/<uuid>` 返回 404 “本地命令不存在”。

修正：

- `location` 特判必须是 `GET && pathname === "/api/works/location"`，放在 `workRoute` 之前。`GET /api/works/<uuid>` 仍要返回 404。`DELETE /api/works/location` 仍由 `removeWork` 返回 400 `INVALID_WORK_ID`。
- 两个查询参数只能给一个，`novelId` 和 `workId` 同时出现或都缺失时返回 400。`workId` 沿用小写 UUID 校验。
- `workspaceFor` 对未注册的路由返回 `inbox`（`dispatcher.ts:32-33`），不需要改动。
- 测试中补上以上几种情况。

### 9.【中】DELETE 请求体的处理

证据：`dispatcher.ts:120` 现在调用 `removeWork` 时没有传请求体。方案规定“缺省或解析失败按 false”。

修正：

- 没有请求体时按 `false` 处理，以兼容旧调用。
- 请求体存在但不是 `{deleteFiles: boolean}` 时返回 400，不要静默降级为 `false`。否则作者点了“是，删除文件”，界面却提示“作品已从列表中删除”，文件实际还在。
- 建议请求体同时带上对话框里显示的 `path`。服务端发现 `record.path` 与它不一致时返回 409，保证删掉的就是作者看到的那个目录。

### 10.【低】边界检查只覆盖了 `this.root`

`assertWorkDataBoundary` 不检查引导目录，而 Worker 通过 `workerData.bootstrap`（`service/index.ts:50`）是知道引导目录的。“不是 `/` 或用户主目录”的检查建议改为：不是任何卷根，也不包含引导目录。代价很小。

### 11.【低】成功后的 404 和 toast 文案

方案把 404 `WORK_NOT_FOUND` 视为已删除，但没有说明此时显示哪条 toast。选“是”时如果收到 404（另一个窗口已经用“否”删除了这个作品），不能显示“作品及其文件已删除”。建议统一显示“作品已从列表中删除”。

### 12.【低】旧路由留下的 `DELETED` 作品

在 `SidebarTree.tsx` 中，`DELETE /api/novels/[id]` 只在 `deleteMutation` 里调用（`:1556-1567`），其他界面没有调用方，移除这处使用不会影响别的功能。不过以前用旧路由删除的作品仍留在 catalog 中，列表里看不到，界面也无法再移除，它们的目录一直被 `protectedDirectories` 保护。本方案可以不处理，但应在 §3.4 记为“已知、不处理”。

### 13.【低】预检中的作品清单核对

除了 `id === record.id`，还应核对 `novelId === record.novelId`。清单的读取复用 `readWorkBrand` 返回的观察对象，后续步骤调用它的 `assertCurrent()`，配合问题 5。

## 测试要求（补进测试用例文档）

集成测试，放在临时目录：

- 选“否”时，目录摘要不变（沿用 `digest()`）。
- 选“是”的成功路径：目录被删除，catalog 和会话都已清理。
- 目录缺失（`missing`）。
- 作品根是符号链接，或者 dev/ino 不一致：返回 409，列表不变。
- 嵌套作品被拒绝（问题 1）。
- 锁属于外机，或属于一个存活的子进程：返回 409。
- 锁属于已结束的进程：可以删除。
- 关闭连接失败（例如对锁目录 `chmod`）：返回 409，列表不变（问题 3）。
- 子目录 `chmod 555` 导致删除失败：返回 `kept`，作品已移出列表，清单仍在，`protectedDirectories` 仍然包含该目录（问题 4、5）。
- 请求体非法时返回 400。
- `location` 路由的各种情况。

跨文件系统的情况（问题 2）很难在 CI 中挂载，可以给删除函数注入 `lstat`，用单元测试覆盖“子目录 dev 不同时停止删除”。

浏览器测试：

- 三个按钮。
- 路径读取中和读取失败两种状态，读取失败时“是”被禁用。
- 四种结果对应的 toast。
- 进行中对话框不能关闭，请求只发一次。
- 错误显示在 `role="alert"` 中，对话框保持打开。
- 路径不出现在对话框以外的任何位置。

真实应用验证要用隔离的测试根目录，不能指向作者的真实作品目录。

## 结论

**修改后通过。** 问题 1 到 5 必须写进方案并在实现中落实，问题 6 到 9 应同时修正，问题 10 到 13 可以在实现时顺手处理。
