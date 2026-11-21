# RB-P01 只读业务落盘审计辅助脚本

脚本：`scripts/audit-real-novel-import.ts`。本轮仅准备代码并做静态检查，没有执行数据库审计，不代表 RB-P01 通过。后续由主代理正常退出应用、释放租约后实际执行，产物仍须独立复审。

先在发布所用的同一构建/同一迁移清单下取得源码迁移指纹。此命令只读取仓库 SQL，不打开应用或数据库：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-real-novel-import.ts --describe-schema
```

在应用已正常关闭、观察器已保存 **completed** 的 `latest-checkpoint.json` 后执行；将 `<迁移指纹>` 替换为上述 `migrationsSha256`。执行者必须确认该清单就是本次新作品发布时使用的清单、期间没有新增迁移。此指纹是源码身份确认，不能单独证明数据库已应用的版本。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-real-novel-import.ts \
  --run S01-20261026-0355 --label publication-01 \
  --app-closed --schema-sha256 '<迁移指纹>'
```

`--app-closed` 是执行者对正常退出的明确前置确认，不会替代操作系统进程检查，也不执行进程命令。若应用仍开着、同构建/无待迁移前提无法确认、租约异常或缺少既存数据，应停止并保留原状态；脚本不夺锁、不修复、不重试发布。不要删除租约后强行重跑。

脚本固定读取 `/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026/执行证据/<run>/` 的 `run.json`、`oracle-frozen.json`、`expected-body.txt`、`latest-checkpoint.json`，以及冻结指向的 `原始小说/` 单一原件；不读取私有 journal、Key、用户模型配置或用量表。当前冻结格式只支持单原件 run，多源目录导入会明确拒绝。run/label 只允许简单标识，作品名须为 `RB-<run>`，目标目录须精确为 `导入作品/run-<run>`，回执中的 session/request/work/novel 必须与既存索引、目标目录身份和 manifest 一致。

连接前确认应用根 marker 已 ready/inboxReady、catalog、inbox 和目标作品均真实既存。随后调用公开的 `Workspaces.initialize()` 加载迁移清单并检查该 ready 分支；该分支不打开 inbox 或其他作品数据库。只调用 `Workspaces.run(receipt.workId)`，通过 `getDatabaseContext().database` 开启 `REPEATABLE READ` 事务，首先执行 `SET TRANSACTION READ ONLY`。每条业务查询均限定本次 novelId；Chapter 用其 Volume 的 novelId 限定，ContentVersion 无 novelId 列，使用 `NOVEL_IMPORT + targetId=novelId`。不查询 User、AIModel、UsageRecord，不使用 inbox 或 global database，也不直接创建 PGlite 连接。

**只读承诺针对业务查询和业务记录。** 现有 Workspaces 的正常连接仍会获取/释放作品租约、进行 WAL/引擎元数据处理，并运行幂等迁移表检查。`migrateDatabase` 会执行 `CREATE TABLE IF NOT EXISTS`、验证已安装校验和，也具备应用缺失迁移的能力；因此严格依赖“同一构建刚发布、迁移清单未改变、无待应用迁移”的前提，不声称启动阶段文件系统零写入。缺校验和或校验和不一致会失败，脚本不会绕过该检查。`initialize()` 不能省略：未加载迁移时空清单会与已有迁移记录冲突。

导出范围为本次 Novel、Theme、Volume、按卷章顺序的 Chapter、Character、Scene、Item、World、Setting、Foreshadow、Trope、PlanningDocument、NOVEL_IMPORT ContentVersion 和 ContentMutation。断言包括 UTF-8 正文逐字等于事前 expected-body、原件 hash 前后不变、完整分析/全文复核/确定性设定任务覆盖、发布回执/原始材料归属、业务文本完整落盘、同作品外键及规划事件/叙事引用可解析。字段来自当前 `prisma/schema.prisma` 和现有发布契约。

长篇策略接入后，确定性设定任务键调用无IO的共用helper：有v2策略时读取已保存profile；legacy读取原执行几何绑定，旧快照未有绑定时仍使用其已保存角色快照的旧公式。不会按当前应用模型设置升级旧任务。observer仅条件复制 `budgetPolicy`/`legacyBudget`及既有workingUnits；v2发布快照的策略和工作单元manifest另有机械一致性断言。此增量未扩展DOCX生产map或多源目录支持，亦未改变任何查询范围。

全部完整业务记录仅写入外部 `<run>/<label>-audit/` 的 `business-records.json`，有序正文写 `ordered-body.txt`，逐项结论写 `assertions.json`；目录和文件均排他创建，文件使用 `wx`，不会覆盖已有证据。stdout 只给 counts/断言，错误只输出固定错误码，不打印数据库异常、正文、Key 或其他作品元数据。业务断言失败仍保留本次记录及失败结论并返回非零；预置身份校验/读取/连接失败返回非零，不改业务数据。

这些属于字节、归属、结构及落盘投影的机械检查。数量或与发布契约一致不能证明小说语义正确；独立冻结语义基线逐项核对、真实 UI 打开结果和正式生命周期验收仍需另行完成。
