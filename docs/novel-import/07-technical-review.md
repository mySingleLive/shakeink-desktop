# 导入作品技术方案独立审核

审核日期：2026-10-25（Asia/Shanghai）。审核者：独立子代理 `import_technical_review`。范围：[技术方案](06-technical-plan.md)、[产品文档](02-product.md)、[已批准 UI 设计](04-ui-design.md)，以及下文明确引用的现有源码。

初审历史结论：**有条件通过；TR-01 至 TR-03 为实施前需修订的方案接点。** 主体架构与用户目标一致，修订后针对三项复审即可，不要求扩展为无关重构。本审核没有修改生产代码，没有运行产品或全量测试，没有创建其他代理。当前最终结论见本文末尾。

## TR-01 · P1 · 导入载荷尚未绑定到建书恢复分支

位置：方案“新作品事务与原文记录”；`desktop/service/workspaces.ts` 的 `create`、`desktop/service/work-creation-reservations.ts`、`src/lib/services/novel-create.ts`。

现有 `Workspaces.create` 的 fingerprint 只有 title 与 position，reservation、manifest、catalog 都围绕该 fingerprint 恢复。catalog 已有同 requestId 的 `previous` 分支验证目录身份后直接返回，不会执行新增初始化回调。仅在回调中写 `ContentMutation`，不能让这个提前返回分支验证“此完成作品确实来自当前导入来源、选择、决定与结果”。

因此同一导入请求在失败/未知结果后若工作载荷改变，可能仅因书名/目录一致就得到旧作品成功回执；ready-before-catalog 的恢复也需要区分原初始化已完成和待初始化，不能盲目执行或跳过回调。

建议在内部导入创建选项中明确引入服务器计算的稳定 import fingerprint，并绑定最终选定原文、工作正文版本、目标、已决实体/规划与决定。该指纹须进入创建 reservation/manifest/canonical recovery 校验；在普通创建路径保持原语义。至少定义初始化及完成验证两个内部接点：未完成时按同一请求幂等执行事务，已完成/previous 返回前核对 `NOVEL_IMPORT` 回执和指纹。不可让 renderer 传入任意可信 hash 或初始化 callback。

正式定向用例应覆盖：事务前失败、事务提交后 manifest 写失败、ready 后 catalog 写失败、catalog 成功但返回丢失；同载荷重试只得到同一本书，改变导入载荷必须拒绝而非返回旧成功。

## TR-02 · P1 · 未登记导入目录不能直接复用现有作品锁修复入口

位置：方案“草稿、状态机与并发”及末段恢复说明；`desktop/service/closed-work-lease-target.ts`、`desktop/service/workspaces.ts` 的 `lockDirectory`。

现有 `closedWorkLeaseTarget` 通过 workId 查询 catalog，要求恰好一条已登记记录，并校验 manifest.phase 为 ready。没有 catalog 记录的 creating 导入目录、以及 ready 已写但 catalog 尚未写入的目录，都会以 `WORK_LEASE_NOT_REGISTERED` 拒绝。`lockDirectory` 对已死进程的原锁只报告 `WORK_LEASE_STALE`，不会自行夺锁。

方案目前写“通过原请求重试与现有锁修复语义恢复”，但缺少上述未登记状态的实际恢复入口；进程恰在这些发布窗口崩溃后，单纯重试将停在无法打开又无法修复的目录。

建议明确一个只服务本导入原请求的窄恢复分支：从可信 import session 与原 creation reservation 取得候选，要求原生目录重新授权与 dev/ino/manifest/requestId/import fingerprint 全部匹配，先按现有维护协议关闭/排空 worker，再验证失效租约和原进程已死。复用既有 lease repair 的安全操作可以，但不能把普通 open 改成自动夺锁，也不能仅凭路径或同名文件删除锁。恢复后继续同一 requestId，而非创建第二本书。

定向故障用例应包含 creating 阶段和 ready-before-catalog 阶段的异常退出；确认可以通过上述重新授权恢复，活进程/外来主机锁、身份替换及错误原请求仍拒绝。

## TR-03 · P1 · 新增 AI RPC 必须纳入 worker 的停止和排空协议

位置：方案模块5及“草稿、状态机与并发”；`desktop/service/index.ts` 的 `task-status`、`stop-tasks`、`close`；`src/lib/long-task.ts`；`desktop/service/context.ts`。

当前 worker 的状态/停止逻辑只统计聊天 `localAttemptCount` 和 `responses` / `starting` / `pendingStarts`。独立 `novel-import-ai` RPC 若只接一个取消信号，并不会自动进入这些集合。`generateJSON` 的 long-task 名额能保留数据库，但现有 `stop-tasks` 不会因它自动找到新增请求并取消；随后 `works.close()` 可能因仍有 active 数据库任务而失败，或者导入任务在关闭/根切换后继续回执。

建议方案明确：为导入 AI 与发布调用建立 worker 内部 requestId→AbortController/promise 的任务登记；main 以白名单 cancel RPC 传递请求ID，worker 本地产生 AbortSignal，不依赖跨线程直接传递 signal 对象。导入 active/pending 纳入 `task-status`、`stop-tasks`、`close` 和 root-maintenance closed 断言，关闭先阻止新任务、取消/等待在途请求及最终用量写入，再关闭数据库。调用需进入明确的 inbox/global 数据库上下文并持有任务租约；主进程仍检查 owner/root/epoch 和模型授权。

定向用例至少覆盖：AI 在首字节前等待、生成中、用量落库中时暂停/退出/迁移；停止返回时没有导入任务或数据库写入残留，迟到回执不能推进已取消会话。

## 需要在定向用例中显式约束的细节

以下不要求改变总体架构，但不能在实现中含糊处理：

- **纯拷贝模式审核**：方案已经声明仅本地分类/只拷贝不调用模型。最终审核应明确分为本地覆盖/结构/明确来源矛盾检查，与正文分析模式的审核模型调用。用“无模型、无正文”和“有正文但补全全关”证明完整路径零模型调用，不能在最终一步才隐式要求审核模型。
- **正文 patch 的两个版本**：不可变来源单元与用户批准后的工作正文需要独立 hash/版本。长度改变或多处 patch 后要有可验证的位置映射，后续证据引用当前工作正文，原始来源保留；不能把原始 offset 直接用于已改写正文，也不能复用失效决定。相同模型和已批准修改的重新分析授权继承/失效规则应明确，避免新的正文版本绕过源范围约束。
- **DOCX 文字覆盖**：只读取 `word/document.xml` 不涵盖脚注/尾注等独立部件。实现应纳入其文字及定位，或对存在但未提取的文本部件明确报告并要求用户处理，不能通过“提取结果已全覆盖”的单元台账掩盖解析时已遗漏的内容。对照真实合成 DOCX 的脚注、表格、文本框和修订夹具核对。

## 已成立的关键约束

- 保持来源与补全分别选择，13类来源/12项补全、金手指与爽点泪点/文风独立；正文不允许由模型生成替代。
- 双模型发送确认前置，模型角色/端点/authRevision 绑定，既有主进程密钥出口复用，没有新增平台后备。
- 全文稳定单元ID、逐批精确覆盖、原文 quote 校验与未归类门控，不能只读前几章就完成。
- 有正文按逆向顺序处理，无正文只拷贝；三类冲突决策无默认，正文变更逐处匹配并经二次批准，未决阻止发布。
- 选择现有 ContentVersion/ContentMutation 保存只读导入审计可行；查询先做所有权校验、全文分页，不返回绝对源路径或Key。原始大纲在原大纲面板可访问，不被规划投影覆盖。
- 文件/目录各用原生选择器，所有七种扩展名有明确本地提取路径，依赖与 PDF 资源进入生产包、最终离线启动，不新增 HTTP 监听。
- 正式方案/用例/代码审核顺序、TDD 和本任务定向验证得到保留；明确禁止全量测试、mock 不冒充真实模型、浏览器外观不冒充目标平台。

复审只需核对 TR-01/02/03 方案修订与上述必要边界的明确化；技术审核通过仍不代表实现或验收完成。

## 最终针对性复审

日期：2026-10-25（Asia/Shanghai）。**技术方案独立审核通过；TR-01、TR-02、TR-03 全部关闭，可以进入08定向测试用例文档及其独立审核。**

本轮只重新读取当前06方案并核对上述修订，没有扩大探索或运行测试：

- **TR-01 已关闭**：内部创建初始化选项包含 `importHash`、初始化与已有回执验证；最终来源选择、工作正文、资料/规划、证据/决定进入指纹并绑定 reservation、manifest、catalog。creating、ready-before-catalog 以及 catalog previous 快速返回均校验同请求导入回执与 `NOVEL_IMPORT` 记录，变化拒绝，不以旧书名成功冒充当前载荷完成。publishing 锁定计划、未知结果查询原 requestId，以及四个发布故障窗口均明确。
- **TR-02 已关闭**：方案承认现有 `closedWorkLeaseTarget` 不能恢复未登记目录，新增的窄分支要求已有原会话/请求/指纹/reservation、原生重新授权同目标及 manifest/dev/ino 一致。只处理本机已退出进程的租约，不因创建新 reservation 获得修复权，不夺活/外机锁。短读 inbox 后再次关闭连接、worker 任务全部排空后修复的时序明确，之后恢复原请求。
- **TR-03 已关闭**：worker 新增 `importJobs` 的 operationId、AbortController、done 登记，纳入 task-status/stop-tasks/close；主进程后台 active 同样进入 CloseCoordinator。停止先发取消并等待/持久化检查点，再关闭业务gate和数据库；发布等待明确事务结果而不强行中断一半，断连/旧epoch回执不得写新根。

三项非阻塞细节也已明确：pure-copy 包括无正文路径最终审核零模型调用；不可变 source 与 working prose 的版本、patch before 匹配、位置映射及旧证据失效分开管理，新/扩大发送范围重新确认；DOCX 脚注/尾注/批注/页眉页脚、DOC附属文字单独提取并待归类/明确排除，不将缺失内容藏在已提取单元台账之外。

08的 RPC/生命周期契约用例仍须落实一个具体实现约束：跨线程传 operationId 等可校验数据，单任务取消 RPC 在 worker 内查找并 abort 对应控制器，AbortSignal 本体不跨线程序列化；暂停某次导入不能用全局停止误伤其他正常会话。此项已由 worker 内任务登记承载，不再阻塞方案。

本结论仅确认技术设计覆盖已批准产品/UI及上述源码边界，不表示解析器、模型、数据库、原生平台或安装包已经实现/通过。仍应按定向用例审核 → TDD → 独立代码审核 → 本任务定向真实目标验证推进，禁止全量测试。
