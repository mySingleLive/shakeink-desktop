# 场景识别与完整导入修复方案

日期：2026-10-31。目标：修复第11步“场景识别失败／模型返回结构不完整（）”，用用户指定《诡秘之主》原件验证全文场景识别及默认全选场景导入。只运行本任务及受影响定向组。

## 已有源码证据

- `desktop/core/novel-import-ai-payload.ts` 的 roster 虽声明仅返回名称列表，仍拼接所有类别的 `semantic-native-contract`，包含 Scene/entityType、facts、parentId 等不同阶段字段；场景 roster 实际 schema 只接受 name/aliases/parent/evidence。存在相互混杂的格式指令。
- `desktop/service/novel-import-ai.ts` 的 roster 顶层为严格 `{roster}`；`src/lib/ai/generate.ts` 把根级错误路径空串直接呈现为 `（）`，无法指出实际格式。场景没有角色专有的安全字段标签。
- 独立预审确认 `desktop/core/novel-import.ts` 的 semantic scene 合并使用 `importSemanticIdentity`，不按角色别名合并。没有已证实的场景吞并缺陷，不更改提交算法。完整场景仍用 ID 集合核对，不能只看 done 数。

## 实施

1. 给 semantic/analyze/roster/scene 独立短提示，明确顶层只能 `{roster:[...]}`；条目仅 name、aliases、可选 parent，上级未知省略，不能用 null/空串/parentId 或 artifacts；保留原文名称、别名、实际地点语义和不执行来源指令。不放宽严格 schema、不吞错误、不造场景。其它阶段提示保持字节不变。
2. 对 scene roster 结构失败提供有限、静态白名单字段标签（响应结构／场景清单／名称／别名／上级／来源单元／引文）；不显示模型值、未知键、原文反馈或任意供应商信息。使用既有 generateJSON 两轮纠错，不增加无界重试。
3. 通过 controller/service 多批场景测试核对全部 ID、字段与父引用，验证已有原生引用/循环校验和容量门。没有失败证据不更改提交算法或其它类别，不放开证据校验。
4. 独立审核方案 → 用例及独立审核 → RED → 最小实现 → GREEN → 独立代码审核。新发现的真实问题保留现场并补充方案和用例后修复。

## 真实验收

新隔离 `/private/tmp/shakeink-scene-import-20261031`，使用原件只读、真实 macOS Electron 和用户已有加密模型配置。场景定向模式在内容选择正常只选 scene 推断，全部1402章保持选中；不调用“跳过场景”，不注入成功状态或替换模型响应。受控文件/目录选择器明确记录。全文 roster 覆盖每一工作单元、全部候选默认全选、tasks/candidates/artifacts ID 精确相等、全部 done、零 failed/skipped/dropped、父 ID 可解析且无循环、native 全部可映射、零页面错误、源文件与工作正文 hash 不变，之后进入正常校验并在隔离作品库保存，重开验证持久化场景和层级。选择其它类别不在本轮完成声明中。

仓库仅保存计数、hash、源码/产物身份和脱敏结果。原文、完整 journal、配置/密钥留在私有隔离目录；不输出密钥。当前工具未暴露 CodeGraph；`.codegraph` 存在，不重建索引，读取已定位源码。

## R3真实反馈：上级地点结构错误

R3新会话全1402章，已覆盖3901/5589单元、保留2226条地点stash时，严格校验连续两次失败，净化消息为“上级地点”；未计成功。先补安全诊断：只将最终 `StructuredGenerationError.feedback` 中与已验证 `roster.<索引>.parent` 路径完全相等的三条已知Zod固定消息映射为“为空值／为空字符串／名称过长”，不回显任何原消息、值或未知键；无匹配仍显示原静态字段。相比观察模型对象，不接触响应值也不新增计数/状态。schema、提示及重试仍不变。取得类型证据后再决定可选值兼容，不猜测实际返回。

## R4真实确认：未知上级返回null

R4使用同一原件新会话，最终固定错误明确为“上级地点为空值”，由已验证路径及Zod固定 `expected string, received null` 精确匹配产生；未读取/回显响应值。两轮生成后仍如此，单靠“未知上级省略键”的提示不能稳定避免。

修订最初“完全不变更wire接受集合”的实现选择：**仅scene roster的可选parent允许JSON null代表未提供上级，规范化为省略键**。这是可选关系的空值表示兼容，不删除任何有效名称或有据父关系；已有非空字符串逐字保留（既有trim继续），所有其它字段、额外键、null名称/aliases、数字/对象/空串上级、伪造证据及父级类型/循环仍严格拒绝。最终规范清单与journal格式保持parent?:string，不扩散至world/character/entity或一般资料分析。不新增重试、不把非法有值parent清空、不吞失败批次。

SI-06先独审用例、取得RED：schema、真实生成桥及runImportAi的parent:null都恢复为无parent，合法父级、名称/别名/证据不变；数字/对象/空串/过长上级仍失败。再最小实现→GREEN→独立code review→新会话全文重测，不把R3/R4失败改写成成功。

## R5执行调度补充

R5已完成5589/5589全文识别，默认全选1005个场景。实际模型样本14–47秒/请求；场景4个worker还占用默认2个聊天长任务槽，几分钟仅完成十余项。为完成整批并保留现有模型能力，**不降低场景模型thinking、不减少材料、字段、候选或校验**，只调整执行调度：scene entity使用独立导入长任务通道（与轻量模型策略分离，`importGenerationModel(scene)`仍原对象），worker上限复用既有32项runtime proof预算减一的31路；其它entity仍4路、图片2路不变。将已验证角色的慢写合批/写失败停止门同时应用于scene，场景的原identity合并算法不变。不扩大runtime容量，不改全局聊天配置。

先独审SI07：饱和2聊天槽时scene受导入调度而非聊天槽阻塞；模型options逐值不变；至少64个场景实际并发达到且不超过31，全部ID/父级/证据保留；慢写期间合并保存、暂停排空、写失败停止新增调用沿用相同真实保存barrier测试扩展至scene。RED/GREEN和独立审核后再以新会话完成整书，R5中途运行不能当作整批通过。

## R5资料结构反馈

R5默认全选1005个场景，11项资料完成后有1项服务层两轮结构失败“artifacts”，驱动保留私有现场并停止，没有跳过。根级artifacts标签不足以区分“没有恰好一个目标”和“实体/父级身份冲突”，不据此猜测实际值。

源码可直接确认scene entity仍复用多类别semantic提示，甚至单实体输出串无条件要求角色roleType。补充SI08：给semantic/analyze/entity/scene独立契约，明确一个目标的id/name/kind、PLACE及**父级必须严格匹配该目标entities目录项的parentId，有则原样复制、无则省略**，字段仅既有scene原生合同，不添加roleType或其它类别规则；未知资料省略，有据正文与证据必须保留。维持当前严格sourceUnitIds/直接引文形式与两轮纠错，不改变业务schema/材料/模型thinking。其它阶段提示继续冻结。该专用提示修复的是明确的格式混杂；真实R5具体非法值未存储，不宣称已证明其内容。

同时仅scene entity invalid_schema最终错误，将三个已知固定结构反馈（缺单目标、身份/上级冲突、字段格式）映射为静态说明，绝不回显未知键/值/反馈。SI08先独审→RED：固定提示无角色/世界/时间线合同，目标parent说明明确；原schema拒绝漏/错父级、错ID、多项及notFound，首轮错误第二轮有效能恢复且全部资料保持；持续错误保留有限上限和静态诊断→实现/独立代码审核→完整新会话再验证。

## R6资料字段反馈与最终场景传输合同

R6全文识别1057场景，21项完成后1项固定“场景字段格式”失败，停止并保留现场。该标签不能证明具体坏值，不把它武断归为某个字段。

SI09将角色已经验证的单实体机械引用协议有界复用于scene entity：controller从本次真实输入截取并核验evidenceOptions；wire允许严格optionIndex引用或既有直接{unitId,quote}，最终都走原定位器；sourceUnitIds由已核验evidence确定，保留合法已声明单位，仅过滤不属于本次输入的机械声明。坏quote/越界索引/混合字段/歧义/外部引用仍拒绝，不能替换坏引文制造成功。仅scene entity增加当前编辑器已有四个schema2文本字段（exteriorDescription/interiorDescription/backstory/entryMethod），在同一生成schema中运行完整原生校验；未知字段仍拒绝且进入已有两轮纠错。早期及最终验证共用schema2，不能本地虚构值或清空有据资料；单目标、PLACE和可信父级仍严格绑定。

场景专用提示同步给出上述已有字段及机械引用形式，输入材料、目录、thinking与31上限不变。与角色一样，将本来已有的一次entity字段纠错仅扩至已净化的三类scene结构错误和固定四类anchor错误，最多2个请求/每个2次生成；授权/取消/网络/预算/持久化失败不重试。不扩大任何其它阶段wire接受集合。

先独审SI09用例→RED：controller→真实服务生成桥对编号/直接引文及schema2完整字段正确恢复；未知/实体source ID配真实证据可归一、坏证据仍拒绝；错父级/目标/未知native字段纠正或有限失败；前三轮非法第四轮仍不合法必须失败，第三轮有效可恢复；网络/授权/取消及磁盘类错误一次。其它阶段hash、wire与模型options不变。再实现/独立code review/新会话整书。新增诊断仅静态白名单字段标签，不输出任何真实值。
