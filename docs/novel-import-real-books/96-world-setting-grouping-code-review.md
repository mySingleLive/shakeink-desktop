# 世界与设定归属：独立代码审核

**当前整体结论：最终冻结版代码与限定用例PASS，WG-CR01/02均关闭，无剩余P1/P2。最终六SHA与独立执行见96-D；以下初审NOT PASS和分包记录完整保留。实际RB-WORLD-FIX01及文学验收不在本PASS内。**

## 96-A：冻结提示词 / A10 分包

**分包结论：PASS，无P1/P2。整体96尚待修复service、CLI和WR用例冻结后审核；本结论不代表数据修复或实际模型效果通过。**

日期：2026-10-27。绑定94最终方案 `b675a51d769ef0f29e07c16131698f7caeef5567493dabb37bd838ab65f55597`、95最终审核 `8f5b9db407c9fca102c173605336145dde906ce56f6389dd1b13524e1db448d4`。本次只读冻结的两份源文件、实际修改前副本及作者证据；未读取正在实施的修复service/CLI/WR或实际run、计划、数据库、原小说、journal，未操作应用或调用模型。CodeGraph工具不可用。

| 冻结文件 | SHA-256 |
| --- | --- |
| desktop/core/novel-import-ai-payload.ts | `87b9c0c12a73df06e22c9ccda4d9ccec272bd95baffb56e32c4c0baa953855d6` |
| tests/unit/novel-import-ai.test.ts | `401630f0fbef55ad0c4d7fed37d491c66e2d69050786a9ea94d2e14b898d2d28` |

执行前后两SHA相同。`/private/tmp/shakeink-a10-world-guidance-20261027/` 中原payload为 `239cac9bf2f40c7e1004ffb28cfc36ff834f98b549f6ae7326cfafb42187ab55`，原AI测试为 `663097fb08265b6467aafc43223724b88287cfcc6c27342c84716206cf9c9903`。逐字重建完整差异与作者 `world-guidance-a10-20261027-owned.diff` 相同（SHA `c77b92a8f0783e4f028845378c255c273017de3315eec95909578dc4d54610fe`）。去掉新增predicate、固定合同及其拼接即可恢复整份原payload；原测试53751字节整个前缀保持，A07–09断言与golden均未改。

### 生产差异与权限

- 固定合同仅进入sem1普通analyze/world、reconcile.targetIds实际指向world artifact、review.selectedTargets含world三个条件。修订以真实目标类别判定，旁带request.kind不代替目标；普通其它类别即使上下文和selectedTargets含world也不触发。classify、patch、legacy及无关修订/审核仍走原字节路径。
- 指导区分WORLD容器与SETTING/worldId/九类原生结构，要求同世界跨批复用ID；未命名单世界可用空介绍中性容器，不虚构事实。来源有据的独立、平行及父子世界保留，不强制一世界，不按书名、人物、标题、关键词或格式分型。新增固定串无实际小说、旧七条内容或oracle答案。
- reviewProjection、已有实体三元组及片外未验证范围仍明确；reconcile只改目标及允许字段，不能改锁、来源、正文或ID/kind/name。新增串在不可信数据封套外，不将自由指令提升为固定授权，也未新增review/reconcile的notFound权限。
- 完整payload、分类合同、73证据归属指导、82情绪指导、native合同、序列化和65536/16384预留保持。此差异没有改schema、晚门、预算或重试。合成产物保留独立/父子WORLD以及指向已有world ID的九类SETTING原值，证明既有结构未被转换或强并；不证明模型会正确归组。

### 独立定向执行

仅执行批准命令一次：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A(07|08|09|10):' tests/unit/novel-import-ai.test.ts
```

**exit0，16/16通过，fail0、skip0、cancel0**（4个顶层组及12个子项）。独立独占日志：`evidence/world-guidance-a10-independent-a07-a10.txt`；机器元数据：`evidence/world-guidance-a10-independent-review.json`。未运行其它测试或独立类型检查；作者专用类型检查不能充作本人的执行结果。

A10通过真实runImportAi依赖注入捕获普通分析、实际world目标修订、含world审核和空artifact审核的生成prompt，检查原request/raw不变、原模型/role/同一AbortSignal、不可信封套和精确payload。九组无关分支使用修改前捕获的prompt/payload字面SHA，73/82/native固定段也按原SHA保护。长非BMP、引号、反斜杠、换行输入仍接受原预算检查。负例确实拒绝投影hash不匹配、锁覆盖、目标外编辑、身份额外键、未知world外键、空native结构及修订/审核notFound；普通world缺项原notFound仍可用。

这些DI用例没有接模型或真实作品；短语断言与合成多世界产物不是文学质量、跨批真实模型行为或实际七条数据修复的证据。

### RED与交付边界

已核作者保留的初RED、干净RED和GREEN。初RED额外含新增未知worldId错误正则误期望，单独保留而未冒充生产缺陷；仅修新A10正则后、生产仍为旧版的干净RED为14通过/2失败（一个子项缺固定合同及其父组失败），A07–09和其余新增子项通过。最小payload修改后作者16/16，本次独立复验亦16/16。未改旧golden制造绿色。

WG-TR01/02/03的数据引用矩阵、租约/迁移准入、提交/导出/恢复与实际RB-WORLD-FIX01不属于本分包结论，仍待后续独审。旧小说文学FAIL、S02草稿及其它原真实目标状态不因本分包PASS变化。

## 96-B：CLI候选静态初审，暂不通过

本轮冻结候选：`scripts/repair-real-novel-world-structure.ts` SHA `916f63f7fbf176f5b70c4ded77ce135cea723f17d244c12aa29d89cd080d9378`；`desktop/service/workspaces.ts` SHA `0ccaf52eef376457a207340783a050167bfe7e051a9c26bba5b3ebfd236da4b6`。只静态审核CLI及必要既有品牌、存储、迁移、adapter/租约接点；修复service仅以其公开schema/API界限作为接线依据，其业务和WR尚未冻结，不形成审查结论。未执行CLI或任何新增测试，未打开实际目录、计划或数据库。

**CLI候选静态结论：NOT PASS，WG-CR01（P1）须修复；A10分包PASS保留，整体96仍待审。**

### WG-CR01：启动失败不能凭缺失实例释放writer租约

候选第156行仅在`await PGlite.create(...)`成功返回后赋给engine；第169行却将`!engine`当成可安全释放租约的条件。锁定`@electric-sql/pglite` 0.5.8的真实`static create`先构造实例，再等待其waitReady，无失败自动close；启动可在文件系统/模块初始化甚至PG激活后的异步初始化环节拒绝。于是CLI失去已构造实例，finally可能释放writer租约并报告cleanup closed，无法证明原引擎已退出。这违反94明确的“引擎可能活跃则不删除租约”边界。

最小修复：构造后立即持有实例再等waitReady，或等价记录不能误判为空的启动生命周期；启动拒绝/close失败只有确证closed才释放，无法确认须保留租约且cleanup failed，不进入repair service。在原WR02内增加真实入口的精确启动拒绝/不释放/不service断言。若采用窄引擎构造DI，先审核合同，正式main固定真实PGlite且不得绕过身份/ledger；不能以泛mock替代实际CLI正准入。已即时通知主代理并获接受，等待修复再冻结；本轮没有自行更改源或测试。

### 其余静态范围与仍待执行的证据

- workspaces反向移除唯一export可恢复完整`22f0bbe491cb80c3b2524e68364f4ad0581482c863e6f4b9e557f1769124f541`基线；lease函数体及正常连接路径未改。CLI在lease后解析既存active pointer，storage.resolve不调用initialize/activate/markRequired；数据库/PG_VERSION和控制文件持续pin，缺/变即拒绝。
- argv无数据库路径/根目录入口，main固定唯一run；strict有界计划与冻结run/checkpoint、源字节hash、catalog、ready品牌/目标目录身份结合。输入采用regular/nlink1/O_NOFOLLOW、有界read和前后dev/inode/size/mtimeNs/ctimeNs、祖先目录守卫，计划及新ID/完整基线通过公开strict schema。上述结论只评接线，不能替代service事务/CAS审查。
- 未调用Workspaces.initialize/run/connect或migrateDatabase；已有引擎首次业务准入前仅在只读事务SELECT完整迁移账本，精确核对本地已校验loadMigrations集合，缺/多/错拒绝。LocalPGliteAdapter按事务准入/commit持续复验身份/lease。引擎启动和lease本身可写磁盘，不称物理只读。
- 证据输出限run内新label目录，before/preview/after/ack采用独占创建、0600、sync及identity pin。service已知committed-export-failed时CLI保留结果；无法确认apply/rollback结果时报acknowledgement-unknown，cleanup失败另报，不冒称业务回滚。业务服务如何产生这些状态仍待其冻结后独审。
- `--app-closed`仅是CLI显式确认，不能自行证明应用已关闭；94要求的实际CUA inventory/时间戳与执行前核对仍由主代理实际执行阶段提供。WR02真实CLI正/反准入、startup与lease、控制/迁移变化及wx/提交失败证据均待冻结后执行，本次不提前标通过。

原候选hash、锁定库create摘录及旧export字节核对记录于`evidence/world-repair-cli-independent-static-v1.json`。除WG-CR01，目前静态未发现另一明确P1/P2；不扩大测试矩阵。

### WG-CR01最小修复合同审查（尚非代码关闭）

主代理接受上述P1，并明确授权窄启动故障注入合同；本合同技术/限定用例PASS，无新增必修：`runWorldRepairCli`仅增加可选第三参`testOnly?: {constructEngine(options): PGlite}`同步factory，正式main仍只传两参，缺省固定真实`new PGlite`。argv、环境与plan不能启用该factory，不改变路径/品牌/lease/ledger/guard/service或证据权限。

`startupAttempted`在构造调用前置true；同步构造throw与waitReady拒绝均不得因engine缺失释放lease。已持有实例只有确证closed才可释放；无法确证/close失败则保留lease、cleanup failed、零service。原WR02内分别验证同步throw、waitReady拒绝后已关闭、waitReady拒绝后close失败；fake实例仅证明启动故障分支，不冒充实际PGlite/迁移准入成功。完整CLI正准入仍需真实隔离PGlite。

尚未读取或执行修复中的候选，WG-CR01代码状态仍open，等待新freeze及批准WR复验。记录旧候选原文时源已发生变化，没有生成原916f63全文副本，也不从当前源反造历史；已保留首次读取的hash、源码接点与锁定库证据。

### WG-CR01冻结增量：静态代码侧关闭，执行证据待审

新CLI SHA **`cb15724745989cd70f0a74b7a425826c53e2a05385bcc293c5cef28a1c167005`**。作者现提供真实原候选副本`/private/tmp/world-repair-cli-96-baseline.ts`，独立核得原SHA `916f63f7fbf176f5b70c4ded77ce135cea723f17d244c12aa29d89cd080d9378`，无需反造历史；完整差异逐字等于`evidence/world-setting-repair-cli-startup-delta.diff`（SHA `178020ceee5ed030ae352af9fe91cccad39ac36473fd6a371ded925ec001aa9f`）。workspaces仍为唯一export版`0ccaf52eef376457a207340783a050167bfe7e051a9c26bba5b3ebfd236da4b6`。

**增量静态PASS，无新增P1/P2；WG-CR01代码侧关闭。WR02三类故障与真实准入矩阵尚未冻结/独立执行，整体96仍PENDING。** 首轮P1及NOT PASS记录保持，不以静态关闭冒充执行通过。

本次差异只含已批准同步构造factory/可选第三参和启动清理状态。startupAttempted在构造前设置；生产立即持有`new PGlite`实例，再等待其waitReady。构造同步throw时仍知已尝试，不能以缺engine释放租约。waitReady拒绝后，finally尝试关闭所持实例，只有`engine.closed===true`确证才可解锁；未知/关闭抛错保lease并标cleanup failed，前置错误不进入ledger或repair service。启动尚未尝试的文件/身份拒绝可以正常释放已取得的lease。

testOnly仅接受同步constructEngine，argv/env/plan不新增入口；正式main整个字节段与原候选相同，只传原两参，缺省固定真实PGlite。其余路径/品牌/active pointer/完整账本、adapter准入/commit守卫、service调用及证据实现均为原候选字节。此次没有执行任何测试、CLI或类型检查，也没有读取实际数据；作者owned tsc结果不作本人的执行结果。后续仅在WR冻结后按原批准命令核对真实正路径及三故障隔离证据，不增suite。

独立静态metadata：`evidence/world-repair-cli-independent-static-v2.json`。

## 96-C：首次整体冻结独审，暂不通过（WG-CR02）

**本轮整体结论：NOT PASS，WG-CR02为P1。A10通过；WG-CR01静态及执行侧均关闭。现有两条命令绿色不覆盖新发现的回执一致性缺口，不授权实际修复。**

首次完整冻结身份：service `8015c04938d27802b2691a5ff2050fe4f2f7a572c58cf15ffefa2d4c2fa658bb`，WR测试 `0deedd3507e7eef5c49e97b11b504e66d88ded4b2879486082200c969c880dd2`，CLI `15971f7374aa2cf45426d5795cf61fedaf2e2dae93c2c75831618dd80b7e2a27`；其它workspaces/payload/AI测试维持前述SHA。六根文件在本轮开始全部匹配授权冻结清单。完整新增service和WR源逐项阅读；仅批准新增文件与已审分包，未通过git空差异推造历史。

### WG-CR02（P1）：restored重放必须使用真实恢复回执

service的preflight.previous.rollback分支把原apply回执`previous.receipt`展开后只改status为restored，而后将当前已恢复的七World行送入emitCommitted。因此重复rollback、rollback后重放apply时，after.json中的rows确实已恢复，但其result.operationId/snapshotId/beforeHash/afterHash仍指原apply；afterHash为“一World七Setting”而非导出的已恢复rows。不能把改变状态字面当作专属恢复审计，ack也不能继续指错快照和方向。

最小修复：使用已保存且校验的rollback.result解析为真正restored receipt，保留其rollbackOperationId、恢复快照和before/after方向，再导出当前已恢复行；不更改历史apply回执。原WR01/02增加repeat rollback与apply-after-rollback的实际回执绑定、afterHash等于导出rows hash、before/after方向及原审计不变断言。主代理已接受P1并仅授权service/WR在原编号内真实RED→最小修复，CLI等其余冻结源不动；等待两份新SHA再定向复验。

### 其余已审实现

strict计划限制完整七根World基线/日期、稳定新ID、两类operation、映射和预算，canonical hash绑定计划。owner、原NOVEL_IMPORT快照/回执、七行完整集合与保护hash先核对；写事务采用Serializable，operation锁、world-tree锁、novel/World/Setting行锁后复读。apply创建中性根和七Setting并逐字保留name/description；删除精确novel+七ID+根节点，校验count7。rollback只接受精确after、原ID空闲、无新增依赖，精确删除七Setting/根后恢复原ID和日期。非本次数据不靠Cascade删除。

封闭矩阵包含跨作品FK/targetId入边的count/必要元数据，历史chapterId、无novelId的有限targetId、planning类型化worldId、保守StoryArtifactLink key命中及本novel任何SopPlan/CascadeJob阻断。rollback排除本次七Setting的已知合法worldId入边，仍检查其它新增入边。正文、卷章、角色/地点/物品/主题/伏笔/情绪、原Setting、完整planning两线和原导入审计均参与保护hash；没有导出其它作品正文或ChatWriteEffect receipt。

before/preview由CLI独占写并sync后才开始业务写事务，事务内再次CAS。完整before/after仅专属ContentVersion，ContentMutation为<=16384字节的有限hash/快照指针/ID映射。after/ack导出失败保留committed-export-failed；实际commit确认丢失先尝试同operation回执，若准入不能确认则acknowledgement-unknown，不能称回滚。上述提交路径未见新增明确P1/P2，但restored重放须修WG-CR02。

最终CLI相较cb157只增加纯worldRepairCliExitCode及main调用：仅closed且dry-run/committed/restored为0，acknowledgement-unknown/committed-export-failed/未来状态或cleanup失败均2。正式main原真实roots与两参调用不变；未打开实际应用或目录验证关闭状态。

### 独立限定执行与证据

仅执行以下两条，每条一次，均exit0、fail0、skip0：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-WR0[12]:' tests/integration/novel-import-world-repair.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM-P01:' tests/integration/novel-import-semantic-publish.test.ts
```

WR01/02 **23/23**，SEM-P01 **1/1**；独占原始日志分别为`evidence/world-setting-repair-independent-wr01-wr02.txt`、`evidence/world-setting-repair-independent-sem-p01.txt`。A10同冻结SHA沿用本报告96-A的独立16/16，不重复执行。未执行其它测试、独立类型检查、真实CLI main、实际模型/数据库或原run访问。

WR的业务矩阵用真实内存PGlite，CLI正路径用真实/tmp磁盘PGlite及完整来源/品牌/catalog/账本准入，完成dry-run/apply/replay/rollback；中途写和提交前拒绝实际回滚，原业务与导入审计保持。14类历史/依赖、planning/来源边、源/品牌/指针/迁移checksum、活租约、软硬链接/父目录别名/identity与wx拒绝有定向证据。原SEM-P01验证当前typed发布及九类原生设定，不冒充旧作品修正结果。

WG-CR01三故障在完整CLI准入后才启用批准factory：waitReady拒绝时实际租约在close未完成前仍在；确认closed后释放；同步构造throw与close失败均保留原租约、cleanup failed、queries0且后续入口仍受租约阻断。fake仅启动故障证据，不能替代前述实际PGlite正路径。该缺陷代码及执行侧均关闭。

原WR对restored仅检查status和业务rows，未校验恢复回执/导出的afterHash，故本轮23/23仍有WG-CR02覆盖缺口。报告不将绿色用例当作整体PASS。收到P1后主代理授权作者新增RED断言，记录本轮结果时WR源已开始合法漂移；没有对漂移版重跑或把新断言冒充本次旧冻结结果。首轮执行身份与后续状态分别留在`evidence/world-setting-repair-independent-initial-review.json`。

已核作者初始0/2为缺模块真实RED，不冒称业务反例；新增fixture enum/必填/decoder容忍错误及实施后启动/commit故障注入均独立保留。实际RB-WORLD-FIX01、CUA关闭证明、具体dry-run与真实UI复开仍未执行；旧文学FAIL及S02草稿不因这些隔离命令升级状态。

## 96-D：WG-CR02增量复审与最终整体PASS

**最终结论：技术实现及94/95限定用例PASS，无剩余P1/P2。WG-CR01和WG-CR02均已关闭。** 结论仅绑定以下最终六份源，不将未来漂移版本或实际旧作品修复预记通过。

| 文件 | 最终SHA-256 |
| --- | --- |
| desktop/service/novel-import-world-repair.ts | `c3b560ead06b156875e464230c3eadad82f9ce16d1096664f9ee233ec75bd5f9` |
| tests/integration/novel-import-world-repair.test.ts | `076b5400db9dfcaf9dbedd6915e7dafb79e3c831fca31f8b6978469382f6dee1` |
| scripts/repair-real-novel-world-structure.ts | `15971f7374aa2cf45426d5795cf61fedaf2e2dae93c2c75831618dd80b7e2a27` |
| desktop/service/workspaces.ts | `0ccaf52eef376457a207340783a050167bfe7e051a9c26bba5b3ebfd236da4b6` |
| desktop/core/novel-import-ai-payload.ts | `87b9c0c12a73df06e22c9ccda4d9ccec272bd95baffb56e32c4c0baa953855d6` |
| tests/unit/novel-import-ai.test.ts | `401630f0fbef55ad0c4d7fed37d491c66e2d69050786a9ea94d2e14b898d2d28` |

### WG-CR02关闭依据

真实原8015/0dee副本位于`/private/tmp/world-repair-wg-cr02-baseline/`，两份原SHA均独立核对；作者先前完整新增文件delta（SHA `3425890feaf38136cb1523c9699434b2b06a7fb2778e19641d73b48b7e018e3d`）亦可逐字恢复这两原文件并验证SHA，不从漂移源猜造历史。完整当前增量为`evidence/world-setting-repair-wg-cr02-delta.diff`（SHA `2f9d5c236c1697789074bec796c36b64ca00ffb511ee46410693148af4c9dd30`）。

生产仅一行：已恢复时改为`parseReceipt(previous.rollback.result, plan, true)`，沿用原严格校验和真实rollback operation/snapshot/hash；未修改原apply回执。重复rollback及恢复后重放apply现在都导出真正的restored回执，after.rows及ack与其afterHash相符。原CAS/owner/引用矩阵、审计、提交确认、CLI准入/租约和其它分支保持；不扩大计划或重试。

新增WR01断言保留全部旧前缀，验证首次恢复的独立operation/snapshot、beforeHash等于apply.afterHash、afterHash等于apply.beforeHash；读取实际恢复ContentVersion核对两侧内容hash；repeat rollback与apply-after-restore逐项完整等于首次真实rollback回执，每次仅导出after/ack、rows hash与回执afterHash相等，业务精确恢复且两类审计数量仍各2。

作者`world-setting-repair-wg-cr02-red.txt`是原8015生产+新增断言的干净22通过/1失败：直接显示旧apply operation/snapshot与反向hash错误，原WR02全绿；不是夹具错误或缺模块RED。一行修复后作者23/23，本人对最终冻结再执行原批准WR命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-WR0[12]:' tests/integration/novel-import-world-repair.test.ts
```

**独立最终23/23，exit0、fail0、skip0、cancel0。** 独占日志`evidence/world-setting-repair-independent-wg-cr02-final.txt`。两根与其它四根执行后再次核对最终SHA匹配，WG-CR02关闭。

### 最终执行信用与范围

| 批准命令范围 | 独立结果 | 最终信用 |
| --- | --- | --- |
| A07–10 | 16/16，exit0，skip0 | 96-A同payload/AI测试SHA，沿用，不重复运行。 |
| WR01/02 | 初轮23/23；WG-CR02修复后再23/23，均exit0/skip0 | 后者绑定最终c3b56/076b，覆盖恢复回执增量及全部原矩阵/启动故障。 |
| SEM-P01 | 1/1，exit0，skip0 | 原publisher/core/AI service未变，沿用同一独立执行，不重复运行。 |

WG-CR01已由同步持实例/构造前启动标记/确证关闭才释放的代码以及三条受控启动故障实际入口断言关闭。CLI对unknown/导出失败/cleanup失败和未来状态均非零；正常CLI成功路径另由真实隔离PGlite执行，不把启动fake当数据库成功证据。世界归组提示词只证明通用合同接线和原门保持，不证明模型文学效果。

原AI service `20b80…dc1ea`、main `fee199…543d`、J请求schema测试 `448561…bbfa6`、publisher `790c360…2dde`、core `6a11e1…71ef`完整SHA均复核未改；本修复没有把SidebarTree/UI或原publisher换成特殊迁移路径。workspaces只加export，租约函数体不变。

最终独立机器记录为`evidence/world-setting-repair-independent-final-review.json`，保留原始日志hash、两项P1关闭及前后身份。本人未运行其它suite、独立类型/构建、实际CLI main或实际应用/模型/原run/用户库。主代理另行报告最终组合类型和build出口0（`world-setting-repair-wg-cr02-root-build.json`，SHA `bc4ec31c673c71f67f7ad86b114366597a7748bba26a852bbe2e60795165973b`），该结果按主代理证据归属，不冒作本人执行；旧pre-WG-CR02 build不是新服务验证。

本PASS允许按94/95进入唯一已授权旧作品的具体dry-run准入；仍须实际关闭证明、源/身份精确核对、wx前快照与预览，随后按已审事务执行/复核及真实面板重开。实际RB-WORLD-FIX01尚未在本审核执行，旧NOVEL_IMPORT/文学FAIL、原小说、S02草稿及其它作品不因代码PASS改变。
