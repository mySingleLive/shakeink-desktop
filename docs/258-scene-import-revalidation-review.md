# 场景导入续验公开证据独立终审

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。范围：257续验记录、256新增续验段落、`requirements-traceability.json` 的 `novelImportSceneRepairAndPerformance.revalidation`、本轮发布集成测试公开日志及8项冻结构建身份。未读取小说原文、私有配置、Key或journal，未调用模型，未重建产品。

## 结论

**本轮公开证据与台账核对通过，未发现阻塞性不一致。真实整书全部场景导入、七分钟、发布及重开仍未通过验收。** 本轮32个不同定向用例由独立场景27项与主代理发布集成5项组成，不与历史293项相加。

## 实际核对

- 本审核使用明确路径 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`，实际执行5个场景专用测试文件：`novel-import-scene`、`scene-entity`、`scene-wire`、`scene-performance`、`scene-scheduling`，**27/27通过，fail/cancelled/skipped/todo均为0**，约27.7秒。覆盖可信控制元数据补缺省、显式错父级拒绝、四个原生资料字段与有效证据保留、有界纠错、31路并发及暂停排空。没有把这些合成用例计作实际供应商或整书验收。
- 前次默认shell实际为Node v20.20.2，超出项目 `>=24 <25` 要求；该环境SI-07a失败在Node v24.18.0复跑时通过。撤回前次对受支持运行时的P2判断，未为此修改产品或测试。257对此的表述与实际执行一致。
- 读取 `scene-import-verification/revalidation-publication-tests.txt`：五个发布集成用例均通过，最终汇总为tests5、pass5、fail0、cancelled0、skipped0、todo0。它们来自两个integration文件，与上述五个scene unit文件不同，因此本轮32项口径成立。本审核没有重复执行这5项；主代理报告使用Node24执行的结果与公开日志相符。
- TypeScript本轮exit0且无诊断按主代理执行报告记录；本审核未重复运行tsc，也不以空日志作为独立成功证据。独立执行 `git diff --check`，exit0。未运行全仓测试。
- 独立读取公开 `build-identity.json`，逐一重新计算其中8个实际文件的字节数及SHA256：3个业务源文件、2个验收脚本、main/service两个构建产物及Next BUILD_ID，**8/8均与冻结记录完全一致**。没有修改这些文件。该结果只证明构建身份未变，不证明实际模型可用或场景导入成功。

## 真实验收状态与授权边界

257及256新增段落明确区分本轮Electron启动受限、自动审批拒绝与实际模型调用结果。按主代理报告，本轮受限启动未进入导入；其后正常启动权限升级被自动审批拒绝，理由为小说内容发送至外部模型服务尚缺明确传输授权。已询问用户且尚未收到回复，没有通过其它路径绕过拒绝。以上两次启动结果均没有记为新模型结果或真实导入轮次。

本审核没有独立读取私有现场或重试网络。公开记录与台账均继续保留**最新实际供应商结果为R9 HTTP402**，没有宣称接口已经恢复，也没有新的完整场景计数、实际用时、发布或重开成绩。`revalidation.newRealModelResult` 为false，`realExecutionStatus` 为等待明确外部传输授权；`real` 中四项真实验收标志均为false，与文档一致。历史293项留在原local记录，本轮27/5另列revalidation，没有把重复回归累计成新增完成数。

授权及接口条件具备后，仍须按256用新session、完整原件/全章及全部本轮识别场景执行，核对候选/任务/资料ID集合、全部done、零失败跳过、父级与正文完整，再正常保存及重开逐项比较。本轮公开证据审核通过不能替代这些尚未取得的真实结果。
