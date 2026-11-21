# 导入角色引用失败方案独立审核

日期：2026-10-30。审核者：独立子代理 `character_review`。审核范围：`docs/242-character-import-plan.md`、`desktop/main/novel-import.ts` 的 `runEntities` / `resolveWizardReferences` / `importEntity` / `requestSnapshot`、`desktop/service/novel-import-ai.ts` 的 `validateSemanticLinks`、`tests/unit/novel-import-wizard-session.test.ts` 的 NIW-C38。本次只读源码审核，未运行测试或应用，未读取真实书稿、模型配置或密钥。

## 结论

**方案通过，可编写定向用例；用例审核须落实下述批次条件。** 根因与最小修复成立，未发现必须修改产品方案的阻塞项。此结论不代表实现或真实整书验收通过。

1. `runEntities` 每累计 8 个结果或超过 2 秒就提交当前结果，而 `importEntity` 正确允许引用已选目录内尚未完成的角色；`resolveWizardReferences` 在步骤末才进行完整集合的 `importNativeMappings`。因此，临时 artifacts 集合允许存在前向引用。
2. `requestSnapshot` 在选择 `request.entities ?? 默认目录` 之前无条件调用 `importNativeMappings(s.artifacts)`。这会在后续任务发请求时校验临时集合，而不是该请求显式传入的完整已选目录，确实能导致截图中的错误。
3. 将 mapping 的求值放到生成默认目录的分支符合职责边界。显式目录来自主进程已选候选；服务层仍检查新 artifact 的字段结构、ID/类型/身份一致性、关系目标的目录类型、父级循环和作者锁定字段。步骤末与发布前的完整校验不应改动。无需制造占位 artifact 或剥除合法关系。
4. NIW-C38 只有三个候选且使用受控 AI 结果，未在一批提交后触发新的实体请求，因此现有通过不能否定该根因。

## 用例必须具体化

- “>6 个角色”不足以稳定触发：正常快响应下提交阈值为 **8**，7 个候选可能直到全部请求结束才提交。建议使用 24 个候选及确定性同步门，明确等待中途 journal 出现带前向引用的 artifact、其目标尚未提交，再释放或发起下一轮请求。须在修复前得到同一报错或非零失败任务，修复后全部 done，且不是依赖任意 sleep 碰巧触发。
- 至少一条回归走 `NovelImportController → runImportAi → 结构化返回 → controller`；`generate` 可在合成测试中受控，但服务层校验不能被 fixture 绕过。直接检查默认目录分支仍拒绝坏引用，显式目录下未知 ID/错类型也仍被服务层拒绝。
- 断言全部候选 ID 与 artifact ID 一一对应、最终关系 ID 全可解析，且合法前向/双向关系保留。单纯到达下一步骤或 task done 不足以证明关系没有丢失。
- 暂停恢复、失败后重试、跳过目标保留姓名关系沿用现有契约并定向回归。真实运行保持默认全选，不跳过；全书来源 hash 前后相同，到达下一步骤后停止，避免扩展为整书发布。

显式空数组也属于显式目录，应由 nullish 判断识别，不能用 `length` 将空目录回退为默认目录。

## 第二阶段：真实运行暴露的单实体目标契约

日期：2026-10-30。补充审核 `242` 的“真实运行补充：单实体目标契约”，对照 `novel-import-ai-payload.ts` 的序列化及 `semanticPrompt`、`novel-import-ai.ts` 的 `importAiResponseSchema` / `generateImportAiJson` / `validateSemanticRequest`、controller 的 `importEntity`，并读取 `src/lib/ai/generate.ts` 的 `generateJSON` 有限纠错实现。未读取真实失败 journal、原文或模型配置；真实失败计数仅采用主代理报告，不在本审核中独立认证。

**补充方案通过，可进入补充用例审核。** 源码确认当前 entity 请求只在自由 `instruction` 表达“只导入某 ID”，而固定阶段契约仍允许任意多项 artifacts 或 notFound；固定提示同时将自由指令声明为不可信。schema 尚未绑定特定 ID/name/数量，controller 的精确单项检查又在生成桥之后，因此一个按批量契约合法、却不符合当前单项任务的结果不会进入结构纠错。这是可由源码证实的契约缺口，但不能只凭两次真实错误断言供应商当时具体输出了哪一种错误结构。

结构化 `entityTarget` 使固定契约显式选择任务目标；生成和最终解析共用请求绑定的 schema，使错误 ID/多项/notFound 进入既有 **最多两次生成** 的结构纠错，而不扩展网络、授权或外层写入重试。该方向正确，不应直接在 controller 将缺失结果补成伪造资料。

实现与补充用例须落实：

1. `entityTarget` 仅在 semanticVersion=1、phase=analyze、intent=entity 时接受；缺少 target、非法阶段、重复目标目录 ID、ID 不在目录及 kind 不符均在 model resolve/generate 前拒绝。直接调用响应 schema 工厂与生成桥也须有相同目标有效性前置检查，不能只依赖 `runImportAi` 外层。
2. id、aliases、roleType 来自 controller 已选清单，按现有字段预算限制大小和内容类型；响应 name 从唯一目录项取得，不把自由 instruction 的任何文字提升为授权。实体目标至少覆盖 character/scene/item/world，不能意外给 ordinary analyze 或其他阶段强加单项要求。
3. 序列化将目标加入 relevant 集合，并保留其必要世界/地点祖先；目标 canonical name 仅以别名出现时也必须可见。entityTarget 的缺省字段不得改变普通阶段 payload 的属性顺序或 prompt 字节，已有 hash 回归继续使用。
4. entity 响应严格要求恰好一项、ID/name/kind 精确等于目标、origin=inferred；notFound 不得规避任务。角色类型存在作者确认值时使用该值并校验一致，entity 固定提示必须明确其优先级，避免通用“roleType 必须模型从本批原文判断”的文字继续与确认值冲突。普通阶段该规则保持原样。
5. 只证明角色存在或关系的稀疏资料，允许仅保留有据简述及可选空字段；不能为凑满资料推断年龄、性别、能力或动机。若真实输入连该角色存在都无法支持，仍应报明确失败供排查，而不能制造一个占位对象换取“全部成功”。保留证据定位、全部引用、锁定字段、身份归属和步骤末完整映射门。
6. schema 纠错反馈使用固定描述和字段路径，不将未知模型值或原文拼入反馈/诊断。补充测试经真实 `generateJSON` 桥，分别覆盖首次错 ID、多项、notFound 后第二次成功、两次错误最终失败、取消及网络错误不被该结构重试捕获；断言最后只返回真实目标且关系和证据未丢失。

通过此补充方案不等于已实现或整批真实角色成功，须重新构建后按已审 CI-REAL 完整验证。

## 第三阶段：服务层字段错误的有限纠错

日期：2026-10-30。审核 `242` 新增“服务层字段错误的有限纠错”，对照当前 `importEntity` 的 try 边界、`generateImportAiJson` 的角色结构错误脱敏映射、`ai` 的模型/授权/取消门及 `safeError`。仅源码审核，未读取真实失败现场、正文或模型配置；r3 的计数和错误文本是主代理报告，不在本审核中独立认证。

**方案通过，可进入 CI-08/09 用例审核。** 当前 `accept(await this.ai(...))` 在 try 之外，现有的一次原生字段重试确实覆盖不到服务层完成两轮结构生成后抛出的固定角色 schema 错误。把一次外层纠错的边界扩大到“模型响应获取、目标接受、原生结构验证”能够覆盖这个缺口；不需要放宽可靠性、证据单元或引用的校验。

这次修复的上限须明确为 **最多两个 controller 请求，每个仍最多两次 generateText，总计最多四轮结构生成**；它不是上一阶段“生成桥恰好两轮”单次请求上限的放宽。单次生成桥 CI-07 仍须保持两轮，CI-08 才验证两个请求的组合上限。

实现与用例必须保持：

1. 获取响应前的错误只接受服务端已定义的精确结构错误白名单：固定“模型返回的角色结构无效”、固定“模型返回结构或类别无效”，以及受限角色字段标签构成的“角色字段结构无效”。不能使用 `includes('模型')`、任意 `结构` 子串或通配的错误前缀把授权、网络、配置、预算与运行时写盘错误纳入重试。
2. 只有 `this.ai` 已成功返回并完成其模型/授权校验后，`accept` 与原生验证中的结构性拒绝才可复用这一次纠错。`AbortError` 与取消/过期 epoch 即使在验证附近发生也必须原样传播；下一请求必须重新经过正常 scope、模型快照、预算、来源/运行时门，不能绕过 `ai` 直调供应商。
3. 第二次请求不再包裹一个会继续重试的 catch 循环；持续非法必须成为任务失败，首次非法结果从未提交为 artifact。不得把坏 reliability 改成默认枚举、把错 sourceUnitIds 猜成当前单元、删除有据关系或补占位数据。
4. 纠错提示使用固定说明与白名单字段标签，不直接拼接未知异常的 `.message`、JSON 解析原始片段、模型值、原文或任何凭证。角色服务错误已经有脱敏标签，可复用这些固定标签；未知异常直接失败。
5. entity 固定提示中 reliability 的四种合法值与 sourceUnitIds/evidence.unitId 的命名空间说明应位于可信固定契约中，仅作用于 entity；未知 reliability 可省略，不能默认猜成客观事实。既有枚举和单位精确匹配规则保持，普通阶段 payload/prompt hash 不变。
6. CI-08 必须走公开 controller action → runImportAi → generateImportAiJson → generateJSON，仅 generateText 受控。前两轮真实 schema 非法使第一个请求失败，第二个请求第三轮有效后只提交一项正确 artifact；断言请求数、生成次数、固定反馈、最终证据/关系。持续非法应恰好两个请求、四轮后失败，绝不五轮。
7. CI-09 在同一实体流程注入模型授权/配置变化、网络、取消、预算与运行时持久化错误，证明没有第二 controller 请求；生成次数按失败发生位置分别为零或一次，不能笼统给区间。对普通原生验证失败的一次既有重试保留定向回归。

第三阶段通过仅表明设计能提供有限的合法纠错机会，不意味着模型一定返回合法资料；仍须以指定全书、全选角色的实际完成结果验收，不能用自动化通过替代真实运行。
