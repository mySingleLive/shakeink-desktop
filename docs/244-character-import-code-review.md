# 导入角色引用修复独立代码审核

日期：2026-10-30。审核者：独立子代理 `character_review`。范围：`desktop/main/novel-import.ts` 的 `requestSnapshot` 改动、`tests/unit/novel-import-character-references.test.ts`、`scripts/run-lotm-wizard-import.mjs` 的角色定向分支和重试逻辑。未读取真实书稿、模型配置、密钥或真实 journal。

## 结论

**三阶段最终复审通过，可继续定向真实验证。** 第二阶段三项遗漏及第三阶段字段标签白名单均已修正并经独立运行确认。调用记录明确为观测值；此记录不声明真实整书角色导入通过。

## 实际运行

使用 Node v24.18.0 运行：

`node --import tsx --test tests/unit/novel-import-character-references.test.ts`

结果：3 tests / 3 pass / 0 fail，约 5.0 秒。另读取 `/private/tmp/character-import-red.txt`：CI-01 修复前有 13 个任务报“导入实体引用类型或归属无效”并停留 import-char；CI-02 显式目录同样在 `requestSnapshot → importNativeMappings → prune/drop` 失败。RED 证据与当前根因一致。

## 已确认

- `request.entities ?? (() => 默认目录)()` 的惰性分支正确，显式空数组也不会误走默认目录；无目录请求保留原来的严格 mapping 校验。单位筛选、审核投影和锁处理未改动。
- 已选目录源于 controller；`importEntity` 的证据与返回项身份、服务层新对象语义与链接类型、`resolveWizardReferences` 的完整集合校验及后续发布门均保留。不制造占位角色、不剥除合法前向关系。
- CI-01 用 24 个角色及 journal 中间提交门，通过真正的 `runImportAi` 返回校验层；最终全部 task done、ID 集合相等、每条关系保留并可解析、无 dropped/skipped。CI-02/03 覆盖默认目录严格性、显式空目录、未知/错类型关系 ID 和正确前向关系正例。CI-03 的负例断言现位于 controller catch 外，能够向测试框架传播失败。
- 真实验收分支只在 detect-scene 成功停止；字符 artifacts 与全选候选 ID 集合相等、角色 tasks 全 done、skipped 为空、原生映射数量及关系目标有效、源件和工作正文 hash 不变、1402 章与零页面错误均有断言。它的 failed:0 是最终状态而不是“历史从未失败”，应连同已保留的重试记录解释。选择器受控在 launch 证据中明确记录。

## 已修正：定向驱动的重试类别

初审时 `fresh=failed.filter(t=>charactersOnly ? retries<3 : …)` 对任意角色失败都重试，包括结构、引用、身份或授权等确定性产品错误。与 `docs/243-character-import-cases.md` 不符。

修正后复审：`transientCharacterError` 使用首尾锚定的精确白名单，仅允许“模型服务返回请求频率限制/服务器错误/服务过载提示，请稍后重试”三类文案，与 `safeError` 的三个明确供应商映射一致；每项仍最多三次。未知错误及结构/引用/身份/授权错误不会进入可重试集合，已有失败清单和截图保留，最终不能通过验收。通过。

补充 `observedCharacterCalls` 按 operationId 汇总实际采样到的角色 entity 调用，成功摘要名为 `observedEntityCalls`，未将它等同于无遗漏的调用总数。部分采样可能只观察到 pending 状态，解释证据时应保持该限定。通过。

另执行 `node --check scripts/run-lotm-wizard-import.mjs`：通过。该检查未执行应用或访问真实数据。

## 非阻塞建议

1. CI-REAL 的调用统计采用已新增的 `observedEntityCalls`，仅能声称采样观察到的数量；runtime 文件只保留有限条最近调用，不声称完整 500+ 项调用总数。
2. 成功摘要可再断言 task 的 candidateId 集合与候选集合相等，并记录实际 `state` 分布，避免将手工写死的 failed/skipped:0 误用为未检查状态的证据。现有任务总数、done 和 artifacts ID 断言在正常产品生成的任务结构下已足够。

## 第二阶段代码复审：结构化 entityTarget

日期：2026-10-30。范围：结构化目标类型、序列化/固定提示、服务请求校验/响应 schema、controller 目标构造、`novel-import-entity-target.test.ts` 及真实驱动的及时暂停和 ID 对应断言。未读取真实书稿、模型配置、密钥或 journal。

独立运行 Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-entity-target.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-wizard-prompt.test.ts`

结果 **35/35 通过**，约 2.7 秒，包含既有普通阶段 payload/prompt 精确 hash。源码未修改通用 `generateJSON` 的两次生成上限，target 的 schema 工厂同时用于生成桥和最后解析，已有 ID/name/数量拒绝会进入有限结构纠错。未知可选资料未由本地补造，证据与引用验证门仍保留。目标强制进入相关目录的实现正确；controller 从已选候选构造目标，最终 artifact 的作者确认类型仍由 controller 防御性覆盖。驱动已增加 tasks.candidateId 与候选 ID 的精确集合比较。

### 初审发现（最终修正见下节）

1. **entity 的固定阶段契约仍明确提供 notFound 选项。** 新 `<entity-target-contract>` 在开头要求一个目标，后面的 `<phase-output-contract>` 却仍来自普通 analyze 分支，含“未找到用artifacts:[]与notFound:true”。这保留了本阶段修复所针对的批量/单项冲突。应给 intent=entity 单独的固定阶段输出契约，明确恰好一个目标且不提供 notFound；普通阶段字符串不变。新增测试当前只检查 entity-target-contract 含关键词，未检查固定阶段契约中这一矛盾。
2. **确认角色类型尚未绑定响应 schema。** selected 分支只检查数量、ID/name，`facts.roleType` 缺失或为另一合法类型仍能通过 schema。独立合成探针实际输出：`wrongConfirmedRoleAccepted:true`、`missingConfirmedRoleAccepted:true`。controller 对另一合法类型最终会覆盖，故并非最终数据篡改；但缺失类型可能在之后的原生校验才失败，不进入本次要建立的早期纠错。请在同一 schema 中校验角色 roleType 等于 entityTarget 确认值，并增加缺失/错值负例及首轮错误后纠正正例；不要为了成功替换其它未知字段。
3. **补充测试的上限断言与已审合同不一致。** CI-07 持续非法使用 `calls>=2&&calls<=4`，而真实生成器恰好两次；请断言 `calls===2`，不能让将来的四次生成回归通过。CI-05 当前只对 runImportAi 测请求前拒绝，还应对直接响应 schema 工厂及直接生成桥的非法目标进行零生成断言（两者产品实现看起来已通过 schema 工厂调用实现，缺的是回归保护）。

上述探针只使用内存合成数据，同时确认 `entityPhaseStillOffersNotFound:true`，没有读写真实资料。

### 驱动现场证据补强

运行中非瞬时失败分支已经能及时识别失败并调用暂停，优于等待全批结束。但它先保存私有快照，再点击暂停，未等 `phase=paused` 或排空后再次保存；Playwright 的 click 完成不等于异步暂停动作已完成。建议保留当前“首次观察”证据，暂停后等待真实状态确认，再另存 drained 快照，供验收区分“观察时仍运行”与“已暂停排空”。暂停等待应有明确超时；超时据实失败，不声称已排空。

### 第二阶段最终复审

日期：2026-10-30。同一独立审核者复看修正后的 diff，再运行：

`node --import tsx --test tests/unit/novel-import-entity-target.test.ts tests/unit/novel-import-character-references.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-wizard-prompt.test.ts`

Node v24.18.0，结果 **38/38 通过**，约 5.1 秒。

- entity 现在有独立 `<phase-output-contract>`，明确恰好一个已选目标、精确 ID/name/kind、确认角色类型、不允许 notFound:true；普通 analyze 的原字符串保持原样，既有普通阶段精确 hash 全部通过。初审第 1 项关闭。
- 同一 response schema 已检查 character `facts.roleType === entityTarget.roleType`，缺失和另一合法值均拒绝；新增负例通过。生成阶段与最后解析都使用该 schema，不再依赖 controller 之后的类型覆盖作为唯一保护。初审第 2 项关闭。
- CI-05a 已覆盖直接 schema 工厂及直接生成桥非法目标的零生成前置拒绝；CI-07 持续非法断言收紧为 `calls===2`，取消前置零解析与网络/授权异常一次生成最终拒绝均通过。初审第 3 项关闭。
- CI-03 的正确样例显式提供确认角色类型，未知/错类型关系负例因此仍在测关系门，而不会被新增类型规则提前替代。原 CI-01/02/03 全部通过。

最终未发现阻塞产品实现或新建整书角色真实验证的问题。上面的暂停排空快照补强仍为证据表述建议：当前失败副本只能称为首次观察到的现场，不应声称它已证明排空；该建议不妨碍真实运行中及时停止并修复错误。真实结果由后续独立记录提供，本审核未认证任何真实角色计数。

## 第三阶段代码复审：服务层结构错误的有限纠错

日期：2026-10-30。只审核本轮 `importEntity` try 边界、entity 专属固定提示与 CI-08/09；未读取真实资料、密钥或 journal。

Node v24.18.0 独立运行：

`node --import tsx --test tests/unit/novel-import-character-references.test.ts tests/unit/novel-import-entity-target.test.ts tests/unit/novel-import-evidence-rebind.test.ts`

**19/19 通过**，约 15.9 秒。CI-08 确实经过 controller → runImportAi → generateImportAiJson → generateJSON，按目标统计恢复为 2 请求/3 生成、持续非法为 2 请求/4 生成；CI-09 五类错误从 controller 的 AI 边界注入，未发现额外请求；RB03/RB04/RB14 未知单位/短引文等拒绝语义仍保持。CI-09 证明的是错误分类边界，不等同于真实磁盘写入故障或供应商断网的系统验收。

已确认：try 扩大后 `received` 仅在 `ai` 成功返回后设置；catch 先检查 current epoch，取消及过期工作不能继续；第二请求不被同一 catch 循环包裹，保留有限上限。第二请求仍经过完整 ai/schema/证据/引用门。提示只扩展 entity 分支的 reliability 省略/合法值与 units[].id 命名空间，没有新增本地坏数据清洗。

### 第三阶段初审发现：括号字段仍是任意文本（已修正）

获取响应前的白名单正则目前允许 `字段结构无效（[^（）\r\n]{1,160}）`，并非已审方案所要求的**固定字段标签**白名单。之后 `this.safeError(error)` 对以“模型”开头的短消息原样返回，故未知括号内容会被拼入第二次请求。

使用内存合成 fixture 实际注入 `模型返回的角色字段结构无效（SYNTHETIC_SECRET），请核对后重试`，观测结果：`unknownLabelRetried:true`、`unknownLabelCopiedIntoPrompt:true`。探针没有读取或发送真实数据，完整注入仅存在本地受控 AI handler。

请将括号内容按 `、` 拆分并逐项验证为服务层的固定字段标签（数量按最多六条诊断限制），或仅允许有限固定消息且反馈采用固定无标签说明；含未知标签/额外文本的消息直接抛出，不重试、不反射进新提示。CI-09 增加上述合成哨兵反例，并断言没有第二个请求及新提示中没有该哨兵。其它核心边界未发现阻塞问题，标签收紧后可复审继续真实验证。

### 第三阶段最终复审

日期：2026-10-30。复看新增 `entitySchemaFeedback`：26 个固定字段标签的 Set、最多六项、去重检查与逐项成员检查；只有两种精确固定消息或合法标签列表产生反馈。返回值由固定文字和已匹配标签重新拼装；已收到响应后的原生失败也采用固定通用说明，不再拼接异常正文。该处理符合已审方案。

独立重跑同上三文件：Node v24.18.0，**19/19 通过**，约 18.2 秒。CI-09 已包含未知合成标签不增加请求的反例。另重新执行与初审相同的合成哨兵探针，结果：`requestsForUnknownLabel:1`、`unknownLabelCopiedIntoPrompt:false`。未知字段标签不再触发纠错，未被反射进新提示，初审问题关闭。

保留前述 CI-08 的 2 请求/3 生成恢复及 2 请求/4 生成拒绝、权限/网络/取消/预算/持久化错误排除、严格 RB 证据拒绝结论。最终未发现本轮实现的阻塞性问题，可继续使用指定原件、默认全选角色的新隔离真实运行。真实运行是否完整成功仍须由后续结果证明，本审核未以合成测试替代真实验收。
