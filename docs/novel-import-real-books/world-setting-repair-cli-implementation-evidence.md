# 世界设定修复 CLI 实施证据

2026-10-27（Asia/Shanghai）。依据94最终 `b675a51d…55597` 和95最终PASS `8f5b9db4…b448d4`，分文件实施。当前为候选冻结，WR01/02完整集成及96独立代码审核仍待完成，不能据此执行真实数据修正或宣称通过。

## 范围

- 新增 `scripts/repair-real-novel-world-structure.ts`。
- `desktop/service/workspaces.ts` 只给现有 `lockDirectory` 声明增加 `export`，函数体和正常连接路径逐字不变。原文件备份 `/private/tmp/world-repair-cli-94-baseline-workspaces.ts`，SHA `22f0bbe491cb80c3b2524e68364f4ad0581482c863e6f4b9e557f1769124f541`；反向移除唯一export已恢复整文件原字节。
- 未修改 service业务/schema、payload、测试、publisher、Sidebar 或其它产品文件。未访问实际run、用户数据库、模型、Key或应用。

CLI与service分工：service拥有严格计划、owner/引用矩阵、事务/CAS、幂等与专属DB回执；CLI只提供显式文件/目录准入、全周期租约、既存数据库连接和 `writeEvidence`。公开可隔离入口 `runWorldRepairCli(argv,{repoRoot,corpusRoot,appRoot,authorizedRun})` 供批准WR02测试；正式main固定授权run和真实根，argv不能指定数据库或根目录。

## 已实施边界

1. 严格argv仅run/plan/label/mode/app-closed；mode缺省dry-run。缺关闭确认或错误run在任何文件/引擎操作前拒绝。plan必须在该run证据目录内，为8MiB以内strict schema文件；recorded run/checkpoint/source hash与显式计划一致。
2. 所有输入经祖先目录dev/inode和realpath固定，regular/nlink1/O_NOFOLLOW、有界读取、打开前后dev/inode/size/mtimeNs/ctimeNs校验。run metadata、checkpoint、原文件、catalog、品牌及active存储控制均保持身份守卫；不是只验证叶文件。
3. 旧checkpoint只接受completed且无semanticVersion；publication、work/novel/request/importHash、标题、单一源文件及七世界artifact/name/text完整绑定。catalog只选唯一work，manifest只接受ready，device/inode/applicationId/author均核对；目标只能是该run预期作品目录。
4. 复用原writer lease，活锁或残留锁均拒绝，不恢复/偷锁。`workspaceStorage.resolve`只读解析原始或恢复代数据库，不initialize/activate/markRequired。已有database/PG_VERSION通过后才打开PGlite；无loadDataDir、create、seed、inbox、global、Workspaces.initialize/run/connect或migrateDatabase调用。
5. 每个migration.sql与根部已有regular迁移资源固定身份；迁移fingerprint严格按 `{id,checksum,fileSha256}` 数组canonical hash。引擎打开后首先在只读事务SELECT既存 `_desktop_migrations`，完整id/checksum集合精确匹配才创建Prisma适配器进行业务操作，缺/多/错/缺表均拒绝，无DDL。
6. 所有Prisma admission/commit复验lease、品牌、目录、所有固定输入。证据只在该run内新建唯一label目录；before/preview/after/ack都wx、0600、fsync并复验身份，绝不覆盖已有文件。首个输出后也固定其身份，数据库提交期间替换前快照会阻断。
7. service已知提交但after/ack导出失败，保留其committed-export-failed结果；未能确认apply/rollback结果时CLI只报acknowledgement-unknown，不声称回滚。finally先disconnect/close引擎再释放本进程租约；引擎仍可能活跃或控制已改变时不删除租约。清理失败附cleanupStatus，不能抹去已知DB结果。

启动/WAL和lease可能写磁盘，dry-run只承诺无业务写，不冒称物理只读。

## TDD与类型记录

主实施者已先保存批准WR01/02真实初始RED：`evidence/world-setting-repair-initial-red.txt`，分别缺service/CLI模块；这只是功能尚不存在，尚不证明业务/准入反例通过。收到该RED通知后才落CLI最小实现。WR02真实隔离数据库正准入和负例由主实施者在唯一测试文件整合，当前未以“缺flag即拒绝”冒充完整通过。

首个纯API版本owned类型检查exit0；CLI末版再检时exit2仅来自正在实施的service三项TS18048（parsed/previous可能undefined），CLI及workspaces无诊断。已通知主实施者，未改其文件；最终类型须在全部冻结后重验，当前不称整体类型通过。真实metadata在 `evidence/world-setting-repair-cli-initial-metadata.json`。

候选SHA：CLI `916f63f7fbf176f5b70c4ded77ce135cea723f17d244c12aa29d89cd080d9378`；workspaces `0ccaf52eef376457a207340783a050167bfe7e051a9c26bba5b3ebfd236da4b6`。后续若集成发现问题，将追加修改、限定验证和新freeze，不覆盖历史。

## 96静态审查 WG-CR01：启动失败的实例与租约

首个候选的 `engine=await PGlite.create(...)` 存在实际生命周期缺口：锁定依赖0.5.8在内部先构造实例，再等待waitReady；等待拒绝时调用者还没拿到engine，而旧finally会把undefined视为安全释放租约。该P1成立，不能以“未取得实例”宣称数据库已关闭。

按root及96明确批准，当前改为在构造前标记startupAttempted，立即保有 `new PGlite(options)` 返回的实例，再await其waitReady。即使构造同步抛错，也保守视为启动状态未知。finally只有未尝试启动，或已对实际实例执行close并明确读取closed===true，才释放原writer lease；close失败、closed不确证或句柄未知都保租约并标cleanupStatus=failed，服务未被调用，不能误报closed。

批准的唯一测试缝为第三个同步 `testOnly.constructEngine(options)` 参数。正式main始终两参，argv/env/plan不含此项；路径、身份、原件、迁移、租约、service、证据等守门全部原样。作者在原WR02内加入同步构造拒绝、waitReady拒绝但close成功、waitReady拒绝且close失败三分支；fake只用于启动故障证明，不替代真实业务或准入测试。

修复冻结CLI SHA `cb15724745989cd70f0a74b7a425826c53e2a05385bcc293c5cef28a1c167005`；owned类型检查session91200 exit0。`evidence/world-setting-repair-cli-startup-delta.diff` SHA `178020ceee5ed030ae352af9fe91cccad39ac36473fd6a371ded925ec001aa9f`；逐项逆变换已恢复完整原916f候选字节，基线wx保存 `/private/tmp/world-repair-cli-96-baseline.ts`，没有把复现改写成另一份未证明的基线。

此处记录静态P1及落实，三故障用例实际执行仍由作者在批准WR02中整合；未执行或读取真实run/数据库，未据类型通过宣称整个CLI或归属修复验收通过。前候选、初始RED和中途类型记录保留。

## WG-TR03增量：未知确认状态不得shell成功

service结果增加既定的acknowledgement-unknown后，旧main仅对cleanup失败或committed-export-failed设置非0，会使“未知确认、引擎已关闭”错误退出0。root明确授权只补退出策略：新增纯 `worldRepairCliExitCode({status,cleanupStatus})`，只在cleanupStatus严格为closed且status严格为dry-run/committed/restored时返回0，所有其它值返回2。main统一使用该函数，原异常catch退出1及固定两参真实入口保持。

新CLI冻结SHA `15971f7374aa2cf45426d5795cf61fedaf2e2dae93c2c75831618dd80b7e2a27`；owned类型检查58420 exit0。`evidence/world-setting-repair-cli-exit-code-delta.diff` SHA `90aed13f017a19dc1329c8d9d7032e0211251a2bfa0ace0f3aeda6bc7003288e`，逆向移除该纯函数并还原main一处调用后，全文件精确恢复cb157基线。旧基线wx保存 `/private/tmp/world-repair-cli-exit-code-baseline.ts`，metadata同prefix另存。

作者在原WR02内验证已知/未知结果与cleanup状态的纯函数组合，无需运行正式main；本子任务未复跑漂移测试或读取实际数据，最终执行结果由主实施者和96独立审核记录。
