# 场景识别、完整导入与七分钟验收记录

> 此页保留R9及此前历史结果；用户现已明确批准当前DeepSeek外部传输，后续R12—R14实测与新增修复的当前状态见[270续验记录](270-scene-structured-output-verification.md)。下文“最新R9/等待授权”仅描述当时状态。

日期：2026-10-31。**代码及本地验证完成；真实全场景导入、七分钟成绩、发布和重开验收尚未通过。** 最新R9在开始场景识别时被已配置DeepSeek接口以HTTP 402拒绝。用户选择处理DeepSeek后继续，等待接口恢复；不把该阻塞或任何历史部分进度计为成功。

本次用户再次请求后的续验见[257](257-scene-import-revalidation.md)：Node24下本轮32个定向用例通过，8项产品构建身份不变；真实启动的权限升级被自动审批以缺少外部模型传输明确授权拒绝，已询问用户。R9仍为最新实际模型结果，没有把启动受阻计作新的真实导入轮次。

## 已实施

- 场景识别与资料导入使用独立阶段契约，消除角色/其它类别字段混杂；错误显示净化后的具体类别，不再出现空括号诊断。场景清单可选parent:null仅规范化为缺省上级。
- 已确认PLACE/parentId仅在省略时由可信目标目录补全，模型显式错误值仍严格拒绝；源单位由核验引用派生，支持严格编号或直接引文。四个现有原生资料字段完整进入schema2早期及最终校验，全部有效正文、事实、证据与父级保留。
- 场景实体采用提取轻量模型策略、31路有界导入、同一授权范围指纹缓存和相关目录/父级闭包；完整可信目录、所有原输入units和资料字段不减少。模型保存设置、普通分析、复核及其它类别的策略保持原范围。
- 结构、引文、JSON及未完整结束仅进入固定上限纠错（最多2请求/4生成）；网络/授权/取消/预算/持久化失败不因此重试。慢写合批、写失败停止和31项取消排空门保留。
- 驱动只接受新session，计时从启动场景识别至全部已选场景完成并进入校验，包含等待、纠错与落盘；另记entity阶段。原始单调耗时严格≤420000ms才合格，超时/缺起点exit4且不发布，不能重置时钟或覆盖为成功。

方案/用例/代码审核：[250](250-scene-import-plan.md)、[251](251-scene-import-cases.md)、[252](252-scene-import-code-review.md)、[253](253-scene-performance-plan.md)、[254](254-scene-performance-cases.md)、[255](255-scene-performance-code-review.md)，对应独立方案与用例审核均在相邻文件。

## 本地结果

| 检查 | 实际结果 |
| --- | --- |
| 最终受影响导入/角色兼容/证据/授权/缓存/并发/落盘/语义/发布定向组 | **293/293通过，0失败** |
| TypeScript --noEmit | 通过 |
| 桌面构建 | 通过 |
| 两个验收脚本语法、git diff --check | 通过 |
| R9冻结的业务源/脚本/main与service产物/Next BUILD_ID | 8项hash均未改变 |
| 全仓测试 | 未运行，遵守本任务定向验证边界 |

定向组包含实际31场景pending/runtime/proof集合与排空、暂停后scope重新计算、错误grant零模型调用、别名单独出现和父级闭包、完整可信目录及材料不减、原生四字段与ID逐值保留、结构/anchor/JSON/incomplete有限恢复和持续失败、显式非法metadata与非法facts对象拒绝。独立子代理最终审核结果另见255。

证据：[293项结果](scene-import-verification/scoped-293-green.txt)、[类型检查](scene-import-verification/typecheck.txt)、[构建](scene-import-verification/desktop-build.txt)、[初始性能RED](scene-import-verification/performance-red.txt)、[控制字段/JSON RED](scene-import-verification/control-json-red.txt)、[构建身份](scene-import-verification/build-identity.json)、[本地检查汇总](scene-import-verification/validation.json)。这些是合成/本地检查，不能替代真实整书结果。

[公开证据与台账独立终审](256-scene-seven-minute-verification-review.md)通过：8项构建身份、293项日志汇总、全部真实未通过标记及HTTP 402阻塞一致；独立类型检查也通过。此审核没有认证真实七分钟或发布重开成功。

## 真实执行记录

原件只读：`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`，SHA256 `04e1a336e29d8437de3f2bd68ffe09f84befebe0748b8750e8f84caeebdd964e`。macOS真实Electron与已配置DeepSeek。场景定向流程保留全1402章、全文5589单元及默认全选场景；文件/目录选择器由驱动控制，不声明原生文件对话框验收。未替换模型输出或注入成功进度。

| 轮次 | 结果，保留原结论 |
| --- | --- |
| R3/R4 | 暴露上级结构问题；R4固定诊断确认null。未通过。 |
| R5 | 识别1005场景，11项完成后资料结构失败。未通过。 |
| R6 | 识别1057场景，21项完成后资料字段失败。未通过。 |
| R7性能基线 | 1013全选，419187ms时248done/0failed，438656ms仍处import-scene，超过七分钟仍未完成；已正常停止。未通过。 |
| R8 | 新轻量策略全1013场景，54done/2failed（JSON/身份关系）；据此修订缺省控制元数据与有限JSON纠错。未通过。 |
| R9最新构建 | 原件/1402章/5589单元就绪，识别阶段返回HTTP 402；无完整场景计数、无七分钟成绩、未发布或重开。被供应商阻断。 |

[R7基线](scene-import-verification/baseline.json)、[R9阻塞](scene-import-verification/provider-blocked.json)。最新检查原件hash不变。历史中途截图、完整journal、运行日志及配置仅在私有 `/private/tmp/shakeink-scene-import-20261031/`，未复制小说原文或Key到仓库证据。最初隔离目录缺初始化标记的启动尝试不计产品导入结果；后续用产品Workspaces初始化并正常运行。

## 待接口恢复后完成

以相同冻结构建启动新的R10（全原件、全章、全选场景，不恢复旧进度），`LOTM_SCENES_ONLY=1`、证据标签 `scenes-r10-seven-minute`、目标目录 `SCENES-R10`，继续运行 `scripts/run-lotm-wizard-import.mjs`。要求总耗时≤420000ms及候选/任务/资料ID集合逐项一致、全部done、零failed/skipped/dropped/映射警告、父级可解析、源与工作正文不变。

之后正常校验和保存，关闭应用，再运行 `scripts/verify-lotm-scenes-persistence.mjs`，传入R10的最终 `published-session-private.json`、隔离app root与新的私有重开证据目录。脚本重新启动真实Electron，经本地只读IPC逐项比较场景身份/层级、完整业务字段、全部卷章正文；只有全部检查及正常退出后才写成功证据。

当前不能宣称文学意义上所有地点已穷尽、全场景已导入、七分钟达标、发布或重开成功。全部候选完整导入与全文覆盖是本轮结构完整性的验收口径，不能拿非空数量代替逐事实语义正确性。
