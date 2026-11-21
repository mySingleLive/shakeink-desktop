# 世界观设定归属修复：方案与限定用例

2026-10-26。针对用户截图的新修复要求；待独立技术/用例审核，尚未编码或改写作品。

## 已证实的问题

截图七个名称逐一对应早期测试作品 `RB-S01-20261026-0355` 的七个 `world` 产物。冻结检查点 `执行证据/S01-20261026-0355/latest-checkpoint.json` 无 semanticVersion，phase completed，requestId `ef97e681-df26-420b-a7ff-2c42758548b1`，workId `6d6d3c82-bc69-4641-b710-5efdba574200`，novelId `cmvobvvvt000loo6vdretjykm`。其旧发布分支逐条 `tx.world.create`，实际把社会/习俗等条目当成独立世界。不是只改 SidebarTree 缩进可以修正的问题。

当前 semanticVersion1 已支持 WORLD 容器与 SETTING/worldId/type/content 分开保存；S02 当前只有一个 WORLD 和三个 SETTING。不能把所有作品强制合为一个世界，也不能把旧错误条目改成“子世界”继续冒充正确分类。

用户本次明确要求修正图中归属，构成对21方案“旧发布不重新投影”的限定例外：只修正这一份已确认的旧测试作品，不改旧 NOVEL_IMPORT 快照、回执、journal、原文件和历史验收结果，不扫描或自动迁移别的作品。旧 S01 文学验收仍 FAIL，修层级不能升级成整书 PASS。S02 草稿保留；93已通过的叙事修复仍待实际恢复，原目录选择阶段未点击新的分析同意。

## 预防新导入再误分

仅在 `desktop/core/novel-import-ai-payload.ts` semanticVersion1 的普通 world 分析、明确 world 修订目标、selectedTargets 含 world 的审核加入固定 `<world-setting-grouping-contract>`。区分独立世界与同一世界的社会、习俗、经济、地理等设定；单一世界未命名时用一个中性容器，不虚构介绍；同世界跨批沿用已有 world ID，设定采用 SETTING/worldId/已有九类原生结构；来源支持的独立/平行/上下层世界继续保留，禁止无依据合并。审核遵守 reviewProjection，不因上下文未展示而判全书缺失，修订遵守目标、锁和字段边界，不能靠稀疏编辑改变 ID/kind/name。

不按具体小说、人名、条目标题、关键词或来源格式强制分型；不改分类阶段、legacy、无关 kind、预算、重试、权限、正文或已有严格 native/图校验。已有73归属、82情绪和91叙事规则保持。只修改 payload 和新增 NI-A10；原 A07–09 不改断言。若出现旧 byte hash 冲突，先保留真实结果并说明影响，未经新批准不改旧预期。

## 图中旧作品的有限修正

新增独立修复服务及专用 CLI（不接通自动启动或后台迁移）。CLI 只接受命名 run、显式计划、dry-run/apply/rollback 三种模式，默认 dry-run；不得用数据库路径随意打开其他作品。沿用现有 Workspaces/brand/catalog/迁移指纹和独占租约，只在应用已关闭、已有 ready 应用与已有 ready 目标作品身份全部核对后进入该 work context。只读/改目标 novel 的业务行；不读 User/AIModel/Usage 或其他作品，不调用模型。

先生成带 hash 的实际 dry-run：核对旧 NOVEL_IMPORT request/hash 与冻结版本、七个 WORLD 的 ID/name/description/parentId/updatedAt、所属 novel、无子世界或附属世界级 Setting、无其他引用这七个世界的业务记录或用户编辑历史。未知引用/附属内容/基线漂移必须阻断，不能凭名字猜配或级联删除。只有七行逐一与冻结产物 name/text 唯一匹配才允许此特例。先保留实际修正前完整快照和预览；路径只写本次 run，wx 不覆盖证据。

计划创建一个空介绍的中性“小说世界”容器，并把七行原 name/description 无损转成同 worldId 下的文本 Setting `{text: 原description}`。类型由本次可审核计划明确给出：格局与温酒习俗、人文取笑氛围归 CULTURE；顾客分层、消费酒价、伙计分工记账、科举处境、地方权势归 SOCIETY。分类仅在本次外部计划中声明，通用服务不硬编码这些书名、标题或类型推断，不补写新背景事实。原 facts/证据完整保留在不可变的导入记录里。

apply 在单一事务内核对 owner、全量基线 hash、树锁、operation 锁、计划 hash 与无外部引用前提；写新容器和七条 Setting 后才移除七条被替代 World。任何失败全部回滚，不能留下双份或部分转换。新 ContentVersion/ContentMutation 记录修复专属类型、完整 before/after、原导入 request/hash、稳定 ID 对照及恢复所需数据；原 NOVEL_IMPORT 记录逐对象及 hash 不变。重复同 operation/计划返回同回执，不重复建世界或覆盖后续编辑；operation 改计划拒绝。

rollback 只针对这次修复回执且当前目标结构与已提交 after 精确一致时可执行，恢复原七行 ID/name/description/parent/dates，并原子移除仅本次生成的 Setting/容器。若用户已编辑、添加子项或已有引用则拒绝回滚并保留现状。恢复也另记回执，不改原始审计历史。无需新 UI 或修改 Web 真实组件：重开现有世界观面板，应只见一个世界，其社会/人文设定可正常读取、编辑；真实多世界结构不受影响。

本次移除是已明确要求的数据类型纠正的一部分，且有事务、完整前快照及专用恢复路径；完成具体预览、独立代码审核及定向检查后执行，不额外请求泛化确认。若 dry-run 发现未授权新增数据或需要放宽边界，停止这份数据写入，继续不依赖它的修复并说明实际阻断。

## 限定测试与顺序

先方案/用例独审，再 TDD 和独立代码审核。新增测试必须先在原代码或缺实现时取得真实 RED，保留夹具错误和修正，不能改旧预期制造通过。

| 用例 | 范围与验收 |
| --- | --- |
| NI-A10 | 真实 runImportAi DI 捕获三类 world 固定指导；不因上下文偶含 world 或普通其他 kind 触发；单世界复用/多世界保留/九类型规则/投影和锁；payload、raw、角色/signal、65536/16384 预算及所有旧固定段不变，合成数据不含本书答案。 |
| NI-WR01 | 隔离真实 PGlite：七旧条目 dry-run 零业务写入，apply 一世界七 Setting、text 逐字含 CRLF/非BMP，其他业务正文/角色/设定/两线和原导入快照回执不变；同计划幂等、不同计划拒绝。 |
| NI-WR02 | 基线漂移/错作品/缺 owner/子世界/附属 Setting/用户编辑历史或其他引用阻断；事务中途抛错完全回滚；rollback 精确恢复原七行且不删除其他数据，后续编辑/附属内容阻断 rollback；CLI 默认 dry-run、路径/身份/lease/证据 wx 保护。 |
| NI-SEM-P01 | 只复跑已有这个用例，确认当前 typed 发布仍支持一个主世界、真实子世界和世界级 Setting。不得把它当实际旧作品修复证据。 |
| RB-WORLD-FIX01 | 对上述唯一 run 先 dry-run/保留计划与前快照，再 apply/只读比对 own work：1 World、7 Setting 共用 worldId，原七 name/text 严格保留；原正文/其他业务及旧导入记录不变。重启真实当前构建查看该作品世界面板及社会/人文内容；只在实际证据具备时记通过。 |

预期修改范围：payload、新修复 service、新 CLI、AI 测试新增 A10、新 integration world-repair 测试和本次文档/证据/台账。main/service AI(schema20b80)、core semantics、原 publisher 与 SidebarTree 保持不动。通用修复服务只处理显式 typed 计划，不能自动合并真实多个 WORLD。

仅以下精准命令，必要类型/构建另记；禁止全量测试：

```sh
node --import tsx --test --test-name-pattern='^NI-A(07|08|09|10):' tests/unit/novel-import-ai.test.ts
node --import tsx --test --test-name-pattern='^NI-WR0[12]:' tests/integration/novel-import-world-repair.test.ts
node --import tsx --test --test-name-pattern='^NI-SEM-P01:' tests/integration/novel-import-semantic-publish.test.ts
```

修复当前截图后恢复真实小说原任务；其余小说、整书文学验收与正式 LIFE 仍未通过，不能用本次归属修复代替。

## 首轮审核补充：WG-TR01/02/03

首轮三项 P1 均接受，未编码/未写实际数据。以下具体边界优先于上文简述，待95复审通过。

### WG-TR01：封闭引用矩阵与删除条件

服务显式接收已归属单一 work 的 Prisma client/事务，不使用全局 prisma。只有 novel.id/userId 与计划和导入回执均一致才进入。apply 用 Serializable 事务，先 operation 锁、既有 world-tree 锁，锁定该 novel 及七行 World，再在事务内重读基线与以下矩阵；不只信 dry-run。七行必须根节点且该作品完整 World 集恰是这七行（有限特例）；任何未知记录都拒绝，绝不“顺便”修正。

| 引用或编辑来源 | 封闭核对 |
| --- | --- |
| World / Setting | World.parentId 指向待移除 ID 的行必须0（含跨 novel 非法入边）；Setting.worldId 指向七 ID 的行必须0；rollback 时另核 Setting.parentId/World.parentId 指向新建 ID 的非本次行0。不得依赖 Cascade。 |
| PlanningDocument | 仅本 novel 的 data 先经现有 validatePlanning；worlds[].worldId 不能含七 ID；整体规划前后 hash 保持。解析失败阻断。 |
| StoryArtifactLink | 仅本 novel 的 sourceKey/targetKey；只要包含任一七 ID 就拒绝（保守匹配，不猜 key 形态，也不重写链接）。 |
| Review、TextComment、PreparedTextChange、SubAgentRun、SopNodeRun、ForeshadowReference、ChatWriteEffect | 显式 targetId 命中七 ID 一律阻断，不因类型字符串未知而略过；有 novelId 的表同时检归属，跨 novel 入边只计数阻断、不导出其他作品内容；ChatWriteEffect 只读 targetId 命中行的 id/targetModel/operation，不能读取聊天正文。 |
| ContentCandidate / ContentImprovementRun | chapterId 命中七 ID 即拒绝；兼容历史把目标 ID 放在该列的情况，不读其稿件全文。 |
| ContentVersion / ContentMutation / TargetTextRevision | targetId 限七 ID；ContentVersion/TargetTextRevision 无 novelId，使用有限 ID 条件，禁止全表扫描导出。任何命中说明存在编辑/历史，拒绝；原 NOVEL_IMPORT targetId 是 novel，单独验证但不改。 |
| SopPlan / CascadeJob | 保守阻断：本 novel 只要存在任一记录即不做这份有限转换，避免遗漏 tasks/affectedItems 等 JSON 中的业务关联；不扫描 Message/AIModel/Usage 等无关或敏感表。 |

修复前后分别对正文/卷章、角色、地点、物品、主题、伏笔、爽点/泪点、已有 Setting、规划、原 NOVEL_IMPORT 快照和回执做 own-novel 精确 hash 比对。仅新容器、新 Setting 与七旧 World 的移除及专属修复审计可变化。deleteMany 限 novelId+确切七 ID，并 assert count===7；事务中途注入失败不得提交部分转换。rollback 同样事务锁/CAS和整矩阵，检查新容器/七 Setting 完整 after、无后续版本/编辑/入边，精确删除计数后恢复原七行。没有任意 JSON 文字替换或按名字改世界。

### WG-TR02：只打开既存作品，不迁移或初始化

CLI 严格 zod 计划：schemaVersion1、UUID operationId/workId/importRequestId、受限 novelId、64位十六进制 importHash/sourceHash/migrationHash、有限的 root 名称和恰七个唯一 artifactId/type 映射（本修复只允许六种文本型世界 Setting）；不接受用户指定数据库路径、任意SQL、附加键或无限条目。run/label 只允许有界标识符，run 必须等于指定冻结测试目录且 work/novel/request/hash 与 run.json、checkpoint、catalog 和 work brand 五方一致。原小说 manifest/原件 hash 也校验，不能把同名别作套进来。实际类型映射留在本次外部显式计划；通用实现没有七标题或本书正文。

实际 `--plan` 同时必须提供完整 `expectedWorlds` 七行（id/novelId/name/description/parentId/createdAt/updatedAt，日期严格ISO），`expectedImportSnapshotHash`、`expectedProtectedRowsHash`、显式新 rootId 和七个 newSettingId，及上述 artifactId/type 一一对照。原七 ID、新八 ID各自唯一且互不相交，任何已被占用的新 ID或冲突名称都拒绝。计划 JSON 上限8MiB，description每条最多200000字符、名称最多100、ID最多160，条目/键数/字符串预算由 strict schema 限制；完整计划以同一 canonical hash 绑定 operation。主代理已有这份 run 的 `publication-01-audit/business-records.json`（旧隔离实表导出），可用其中七行准备明确基线；dry-run仍必须与当前单一作品实表精确重核，历史备份不能代替新核验，漂移则停止。计划不能只给名字或空基线让CLI自行猜选/补默认。

所有输入/证据采用现有审计脚本同等的 regular、非symlink、nlink1、O_NOFOLLOW、上限、realpath/祖先身份、打开前后 dev/inode/size/mtimeNs/ctimeNs 一致核对；before/preview/after/ack 均 wx 独占创建，不覆盖已有证据。输出只限这份 run 内预期文件，禁止通过路径逃逸或符号链接改别的文件。

关闭证明是实际 CUA app inventory 中写作应用与项目 Electron 均未运行的时间戳记录，加 CLI 显式 --app-closed；执行前再核对。安全互斥由既有 lockDirectory 的整个 open→preflight→transaction→export→disconnect/engine.close→unlock 周期提供，遇活锁/残留锁一律拒绝，不恢复/偷锁。允许唯一追加 `export` 到 workspaces.ts 的现有 lockDirectory 声明供维护入口复用，函数体/正常连接路径不改；此新增文件范围纳入95审核及96代码审。

**不得调用 Workspaces.initialize/run/connect、migrateDatabase、创建/seed/inbox/global DB。** CLI 在核验已有 ready app/catalog/work/control 和锁后，用现有 workspaceStorage.resolve 只读解析 active 存储（不调用 initialize/activate/markRequired），验证原有 database 目录与 PG_VERSION 后仅打开该既存 PGlite；启动/WAL和lease文件可能写入，不称物理只读。Prisma 使用现有 LocalPGliteAdapter，并每次事务 admission/commit 复验 lease/brand/目录身份。打开后先仅 SELECT 已存在 `_desktop_migrations` 的 id/checksum，与当前已校验 loadMigrations 的完整集合逐项精确相等（缺表/少项/额外/错checksum均关闭拒绝），才允许业务查询；不运行任何 CREATE/DDL/migration SQL。63条或任何数量都取真实集合，不写死数量或自修。测试覆盖缺失/漂移/活动lease/控制替换以及不调用 migrate/seed 的观测。

### WG-TR03：持久事实与外部证据不是一个事务

before 完整快照与 preview 成功 wx+fsync 落盘是进入业务写事务的先决条件，导出失败必须零业务写。事务内修复完整 before/after 放在 ContentVersion 的专属 targetType，ContentMutation 仅放有限 requestHash/beforeHash/afterHash、snapshotId 和稳定 ID 对照/有限结果；不把完整正文塞入回执。apply/rollback 使用不同且绑定同计划的有界 operationId，不能重用原 NOVEL_IMPORT 操作编号。

DB commit 是持久事实：提交后 after/ack wx 失败，或返回确认丢失时，不回写原结构、不另记假 failed/rollback；报告 committed-export-failed 或 acknowledgement-unknown，通过同 operationId 的专属 DB receipt 确认。重跑同计划先读回执：已提交只导出/确认已提交状态，不重新生成实体；若已 rollback 则明确 restored，不重新 apply；若用户后来编辑则只报告漂移，不覆写。不同计划复用 operationId 拒绝。after 导出恢复采用新 label wx，不覆盖失败留下的证据。

rollback 另建独立审计/回执，仅当前结构与原 after 及引用矩阵完全一致时允许；保留 apply 的历史与原 NOVEL_IMPORT。增加 WR02 断言：before导出失败无业务写、提交后导出/ack失败 DB receipt 仍在、恢复确认不重复、rollback后同 apply请求明确已恢复、after漂移拒绝、全周期lease释放/异常时不移除非本进程控制。
