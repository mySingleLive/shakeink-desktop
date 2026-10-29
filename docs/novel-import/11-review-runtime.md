# 导入解析与运行时独立代码审核

日期：2026-10-26。范围：`desktop/main/novel-import-files.ts`、`desktop/main/index.ts` 导入接线、`desktop/service/index.ts` 导入 job/发布排空/维修生命周期、`desktop/shared/novel-import.ts`、`desktop/shared/ipc.ts` 及 `desktop/preload/index.ts`。本代理未实施这些模块；本轮只读审查，不重复执行已绿组，不运行全量测试。

初审发现2项阻断，均已即时报告并修复。**2026-10-26复审：2项代码阻断已关闭，当前审核范围内无遗留阻断。** 本轮不等价于真实原生选择器、安装包或 Windows 验收。

## 修复复审

| 初审项 | 代码与用例复核 |
| --- | --- |
| 1 位图正文＋页码 | `pdfText` 现于解析文本前检查本地 PDF.js 栅格绘制 operators，遇图像内容保守拒绝并明确要求转换/OCR。stopAtErrors:true 与 maxImageSize 配合，使超大位图也不会静默删除后只留下页码。NI-F04 已增加实际嵌入 PNG 并叠加可提取页码的合成 PDF，要求明确拒绝。关闭本项。 |
| 2 父目录身份 | ImportFile 新增私有持久 ancestors（path/dev/ino）；`readSourceChecked` 对照完整原祖先链，verify/redecode均必须提供该链且缺失即拒绝。扫描递归传递原始目录链，在进入子项、读取后及目录遍历后检查。NI-F07 已增加替换父目录但搬回原叶 inode 的 verify/redecode 拒绝断言，并覆盖搬回完整子树的场景。关闭本项。 |

源码复审保留初审经过如下。最终定向执行证据见本文件末尾；测试执行归属仍为主代理/解析器实施代理，本审核代理未重复运行。

## 初审阻断项（已关闭）

1. **[P1] 带少量可提取页码的扫描 PDF 会被当成完整文本页。** `desktop/main/novel-import-files.ts:245` 只提取文本，`249` 仅以 `pageText.trim()` 判定是否需 OCR。扫描正文作为位图、同时存在可提取页码/页眉时，这个判断会成功，仅导入页码而静默漏掉正文。02/08要求任何无法提取的页明确待处理、不得静默漏页。应对含栅格图像的页采取保守、可解释的待处理策略，要求转换/确认后才允许作为完整来源；NI-F04 增加“位图正文＋可提取页码”的合成 PDF。当前纯空页断言不能覆盖这一情形。

2. **[P1] 来源重验没有绑定最初原生授权目录的物理身份。** `scanNovelSources` 在递归目录 `89–94` 检查当时的父链，但后续子项递归未持续传递/复核这条原始链；`ImportFile.proof` 只保留叶文件身份（`104–105`）。`readSourceChecked`（`55`）每次重新采集目录身份，`verifyNovelSources`（`278`）只把叶 proof 带入。将原目录重命名→新建同路径目录→把原叶文件搬回（保持叶 inode/内容），重验会接受新父目录，尽管它已经不是原生授权的物理目录。应保存授权时的祖先/来源根目录身份，所有读取/重验与递归关键 await 后都比较该身份；NI-F07 增加保留原叶 inode 的父目录替换断言。现有测试中的父目录替换同时重新创建叶文件，只证明叶 proof 拒绝，未证明父目录身份被绑定。

## 已核验的修复与接线

- **DOCX 文本框与连续 parts。** `xmlText`（文件 `151–160`）用 textboxDepth 区分普通内容和 txbxContent；`docxText`（`216–218`）对每个 XML 单独收集文本框附件。`sections` 把插入的分隔空白归给下一 part，使范围从0连续覆盖。NI-F03 的断言检查正文不含文本框、附件只出现一次、parts首尾与相邻边界连续。DOC 脚注/尾注/批注/页眉/页脚/正文与页眉文本框也分开保留。XML/HTML用惰性 Parser，不执行宏、脚本、外链；ZIP声明/实际膨胀、CRC、路径、条目数有边界。
- **真正的原生授权和严格入口。** `trusted`（main `139`）限定当前窗口的 mainFrame 与 `shakeink://app`；导入 handler（`445–451`）先解析严格 discriminated schema，检查工作台 ready/owner、关闭、quitting、gate、迁移、锁维修互斥。请求只含语义动作/ID/revision，schema没有renderer路径字段。文件与文件夹分别使用原生 picker；保存目录通过 DirectoryAuthority 的 purpose/owner 发行并消费，回执后再次核对 owner；renderer不能提供任意 worker 方法。
- **后台 job 与发布排空。** service `125–135` 在返回前登记 AI job/发布 Promise；task-status `151` 包含两者；stop-tasks `152–170` 取消AI并等待done，发布等待确定结果；close `190` 在关闭 Workspaces 前等待两类导入任务。main closeData先等待 controller关闭/检查点，再关闭并排空 BusinessGate，最后关 DB；stopTasks同样先暂停controller再停模型/worker，避免先关gate造成等待死锁。
- **维修与迁移/退出互斥。** repair-target 是唯一绕过常规 businessGate.run 的导入动作，以便自身关闭gate。维修中禁止并发导入/迁移/其他锁维修，退出意图排队至finally。维修需要原目标重新原生授权、精确 path/dev/ino、无活动worker/model/response、既有reservation证明；短暂全局DB查证后再次close，才准备和确认物理锁恢复。普通Worker中断时 repair分支记录 serviceLost，finally检测 lost/exited/threadId=-1，保持业务关闭；restoreBusiness也拒绝死worker，因此不会恢复到断开的服务。
- **PDF离线资源路径。** pdfjs以包内package.json定位本地worker、cmaps、standard_fonts与wasm，useWorkerFetch=false/useSystemFonts=false，不使用CDN；main构建保留真正的CJS import.meta URL shim，动态依赖由runtime manifest记录，打包 asar=false，保留依赖整个包而非只留JS入口。源码路径成立；当前审查没有执行安装包中的PDF解析，不能据此宣称安装版资源实际通过。

## 证据与限制

已读现有定向用例源码：NI-F01–F08、NI-L01–L04、严格bridge契约。NI-L用实际源码提取闭包加受控依赖验证接线，并明确区分物理选择器/真实PGlite；不能把它记成实际Electron原生验收。NI-L04还覆盖repair中worker断开时不重新开放gate。已有完整安装运行和真实端点证据应由主代理按NI-B/NI-N另行归档。

本轮运行时审查未运行任何测试、构建或全仓回归，也未更改被审运行时源码。UI 的另行定向修订与证据列在 `evidence/ui-validation.txt`，不作为本运行时审核的执行证明。

复审已实际读取解析器代理归档的 [files-integration-engine-final-green.txt](evidence/files-integration-engine-final-green.txt)：限定的 AI、domain、files、integration、session 五文件合计33项通过、0失败、0跳过，约3.43秒，包含新增F04/F07及NI-L生命周期断言。已读取 [files-integration-typecheck.txt](evidence/files-integration-typecheck.txt)：main/service/preload、解析器与接线测试入口的定向typecheck退出0，日志附实际tsconfig范围。执行归属为解析器代理，本审核代理没有重复运行。

据当前源码与上述对应证据，**本次解析/接线/生命周期代码审核通过**。实际Electron物理原生选择、完整安装产物PDF资源、Windows及真实模型供应商仍由NI-B/NI-N验收，不由本静态与受控定向结果替代。

## 构建依赖补充审核（2026-10-26）

独立复核 `scripts/runtime-dependencies.mjs:116–135` 的单点改动：`require.resolve.paths(name + '/package.json')` 仅查询 Node 搜索路径，避免 `string_decoder` 等与 builtin 同名的 npm 依赖因 builtin 的 null 搜索路径被误判缺失；它没有通过 `require.resolve` 解析 metadata，因此不会要求包额外开放 package.json exports。

候选目录的 appRoot 内部边界、lstat/realpath 无符号链接、metadata普通文件和包名 identity 检查均原样保留。搜索结果即使含应用外祖先目录，也仍在 `inside(appRoot, candidate)` 被跳过；缺必需包继续抛出 no-parent-fallback，不扩大运行时授权范围。

已读取 NI-B01 最小真实依赖树 fixture（`tests/unit/novel-import-integration.test.ts:16`），它建立实际 readable-stream→string_decoder 依赖目录、构建 manifest 后调用正式 verifyRuntimeDependencies，并检查 npm string_decoder 被保留。实际 [红灯](evidence/runtime-dependency-red.txt) 在该包处报告缺失；[绿灯](evidence/runtime-dependency-green.txt) 为1项通过、0失败、0跳过。本代理未执行或重复运行测试。**补充代码审核通过，无新增阻断。** 此结论仅覆盖依赖收集修复，不代表完整安装产物已验证。

## 导入日志根迁移补充审核（2026-10-26）

独立复核 `desktop/core/root-inventory-paths.ts:8–9` 与 `desktop/core/root-ownership.ts:30/51` 的小范围修改。共享分类器只允许 `novel-imports` 容器、其下一层通过 `z.uuid()` 的会话目录，以及该目录下精确的 `.owner`、`session.json` 两类已提交文件；不允许嵌套子目录、临时文件、备份后缀、邻居文件、伪UUID或路径穿越。inventory 与 managed ownership 使用同一白名单，避免只搬移目录却漏掉恢复日志。分类器仅依赖 node:path、zod 和品牌常量，没有引回 root-ownership 的循环依赖。

`allowedManagedFile/Directory` 仍先执行 safeRelative；实际 `collectClosedRootFiles` 仍执行 closed/root身份检查、managedPath逐级父目录检查、lstat类型和符号链接/硬链接限制。未知项进入 preserved，不因新增目录白名单而被接管、复制或删除。

已核读新增 NI-L04 两项源码及实际 [红灯](evidence/import-journal-migration-red.txt)（2项失败）→[绿灯](evidence/import-journal-migration-green.txt)（2/2通过、0跳过，约1.18秒）。第二项使用真实 Controller 创建并关闭日志，经正式 inventory 与 DataRootManager 迁移；新root的 `.owner/session.json` 与原文相等，旧root已提交日志移除，新root Controller恢复同一session ID/paused状态及文本计数。临时文件、未知嵌套与伪UUID资料只留旧root；cleanup-pending的pending列表严格等于preserved，不把未知项描述为已迁移。测试选择/AI/发布回调为受控依赖，未运行原生迁移菜单或AI流程。

**导入日志迁移补充审核通过，无新增阻断。** 本代理没有重跑测试或全量用例，也未更改生产代码；实际执行证据归属为解析器代理。

## 原材料读取路由登记补充审核（2026-10-26）

独立审核者：解析器/接线代理；未编写本次 migration map、记录 handler、生成器或 dispatcher 接合测试。范围限定为本次修复，不修改领域/发布核心，也未运行全量测试。

- `docs/migration-map.json` 现登记 desktop-only 的 `GET /api/novels/[id]/import-record`，明确本地 handler 与 NI-W02/NI-U07。`src/app/...` 是现有生成器使用的逻辑路由标识，实际 load 指向本仓库 `desktop/handlers/...`，没有引入上游目录或 HTTP 监听。
- `scripts/generate-routes.mjs` 从已审核 map 生成；`desktop/service/routes.generated.ts:119` 实际包含上述入口，方法仅 GET、scope 为 novel。该路径不会与更短的 `/api/novels/[id]` 混淆，匹配器要求完整段数相同。
- `LocalDispatcher.workspaceFor` 按 novelId 在已登记 Workspaces 中定位对应作品，未知作品不会降到 inbox 读取；正式 service 的既有 runWithGlobal 进入这一作用域后才调用 handler。handler 仍先执行 `getOwnedNovel`，读取服务再次校验 LOCAL_AUTHOR_ID 与未删除状态，分页参数继续走既有只读记录校验。登记修复没有新增写入/AI 能力或放宽作品权限。
- 新 NI-W02 接合用例使用实际 `matchRoute`、`LocalDispatcher`、已发布作品的真实 PGlite 数据：断言 novel scope、workspaceFor 得到实际 workId、正式 handler 返回200，并逐字回读含 CRLF/空白/emoji 的原始正文。它补上“直接调用读取函数通过，但正式路由未生成”的盲点。

已实际读取 [record-route-red.txt](evidence/record-route-red.txt)：单项因路由 scope 为 undefined 而失败；[record-route-green.txt](evidence/record-route-green.txt)：同一项1通过、0失败、0跳过，约3.98秒。执行归属主代理，本补充审核未重复运行已绿用例。

**本次路由登记接合修复审核通过，无新增阻断。** 本结论不把定向分发回读等同于修复后的 Electron 原生界面复验；native 完成页到原材料记录的后续实测仍由主代理继续记录。

## 导入草稿迁移归属接合修复交付（2026-10-26）

本节由解析器/接线实施者记录自检，**待主代理独立审核两处归属规则**，不冒称独立审核自己的改动。主代理组合检查发现 `novel-imports` 未纳入关闭数据根的归属清单，迁移会把已暂停导入留在旧根。实施者同时确认真实迁移还有 `root-ownership.ts` 的第二道独立路径边界；该文件经主代理追加授权，仅复用同一精确 helper，不修改其他规则。

- `root-inventory-paths.ts` 新增两个共享 helper，仅识别目录 `novel-imports`、`novel-imports/<z.uuid合法UUID>`，文件仅其下 `.owner` 与 `session.json`。
- `ownedRootFile/Directory` 与 `allowedManagedFile/Directory` 复用这两个 helper。后者仍先执行原有 `safeRelative`，未知文件、临时文件、非法UUID、嵌套用户目录与相似名称均不接管；helper依赖只有原有 path/zod/brand，没有新增运行时依赖环。
- 新增 NI-L04 精确分类与真实迁移两个场景：实际 `NovelImportController` 生成并暂停合成草稿，实际 `collectClosedRootFiles` 遍历，实际 `DataRootManager` 搬迁，最后新root重新初始化controller，恢复相同session及来源字符数。`.owner`/`session.json` 在新根逐字一致，旧根对应已知文件清理；临时文件、旧副本、非法UUID邻居及嵌套用户文件留在原位置，未复制到新根。
- 搬迁沿用既有未知项目语义：本场景已提交新root、release为 `new-root`，且新root可恢复导入；状态如实为 `cleanup-pending`，pending精确等于原inventory的preserved项目。没有把保留未知内容伪装成全部清理完成，也没有修改迁移核心来删除它们。

TDD [红灯](evidence/import-journal-migration-red.txt)：2项失败，分别证明目录未归属及实际inventory漏掉 `.owner`。限定以下命令的 [绿灯](evidence/import-journal-migration-green.txt)：2通过、0失败、0跳过，约1.1秒；[入口定向类型检查](evidence/import-journal-migration-typecheck.txt) exit0。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern 'NI-L04:.*(inventory ownership|closed-root migration)' tests/unit/novel-import-integration.test.ts
```

仅执行上述本目标用例与入口typecheck，未运行原迁移套件或全量测试。本场景是真实本地文件系统搬迁和controller恢复；原生Electron迁移界面的确认与重启仍由主代理验收。
