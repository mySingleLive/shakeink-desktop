# 全书角色导入五分钟性能方案

日期：2026-10-30。用户新增硬指标：《诡秘之主》全书所有角色的导入总时长不得超过 5 分钟。242–245 的正确性要求全部继续有效。

## 问题澄清与第一性原理分解

- 目标/成功标准：指定原件完整 1402 章、默认全选所有识别角色、零失败/跳过、资料与全部关系/ID 完整；真实 macOS Electron/真实模型总计 ≤300 秒。保守计时从第 6 步“允许分析并导入”到最后角色完成（含角色识别与自动确认列表等待），另记第 10 步导入时长；只让第 10 步低于 300 秒不足以通过本轮总计标准。
- 现状：r4 原件实测 556 个全选角色，788,509 ms 完成 22 个、零失败，尚未完成整批。私有基线元数据 `/private/tmp/shakeink-character-import-20261030/r4-performance-baseline.json`。已停止该慢速基线，不算全角色通过。
- 决策范围：调整角色专属生成策略与有界调度，不改用户保存的模型配置、Key、正文、已选范围、字段/证据/引用/授权门、每角色独立 task、暂停取消语义；本轮短期实现并真实验证，不缩减任务或伪造输出。

| 假设 | 属性 | 结论 |
|---|---|---|
| 每次角色资料抽取必须继承模型 high 思考 | 惯例 | 可使用已有名称清单的轻量生成策略；事实仍由真实模型从原文提取，全部严格门保留 |
| 导入必须与聊天共享 2 个长任务名额 | 惯例 | 导入已有独立调度器，可像 roster 一样在 runInsideLongTask 中执行，由本阶段限制并发 |
| 所有实体类型必须同一并发 4 | 惯例 | 只为 character 建立 15 路上限；其他实体和图片保留原上限 |
| 可以靠少导入角色、丢字段/关系来达标 | 硬约束 | 不允许；任务/记录 ID、关系、证据与全文完整性必须同时通过 |
| 模型与网络耗时可以仅凭估算宣称达标 | 外部物理/服务条件 | 不允许；以完整真实运行计时判定，不通过就继续优化 |

基本吞吐要求：556/300≈1.85 角色/秒；当前实际约 22/788.509≈0.028。源码 `LongTaskQueue.limit=2`，角色 workers=4，但真实生成仍排队为 2；roster 已证明独立 15 路可在同一模型/原书上稳定执行。若 15 路，每项均摊耗时须低于约 8 秒（还须给识别与最终校验留余量）。这是可测目标，不是已实现性能承诺。

## 首轮实现路径

1. `WIZARD_CHARACTER_CONCURRENCY=15`，保留通用实体 4、图片 2、运行时证据在途上限 16；不扩大证据协议。只在 runEntities(kind=character) 使用 15 路。角色源校验仍按既有 30 秒/16 项合并检查，所有完成结果按原批次保存，不改目标粒度。
2. 服务端复用既有 `importRosterModel` 的供应商兼容轻量策略，仅扩展到 semantic v1/analyze/entity/character。DeepSeek OpenAI 协议关闭思考；Anthropic 协议与其他供应商遵守已有兼容处理/最低显式档位。普通 analyze、scene/item/world、review/reconcile/patch 均不改。
3. 同一精确范围用 `runInsideLongTask` 避开聊天队列，真正并发受主进程 15 路约束。严格响应 schema、有限纠错、每次模型/授权检查与取消信号照旧。最终 default.generate 仍直接返回 generateImportAiJson，保留 NI-J01 契约。
4. 先不缩减正文/相关材料，也不改导入字段与引用格式。已有 workingUnits 缓存直接复用，不增加未经实测需要的缓存。若真实全书仍超时，再依据调用耗时/CPU/写盘证据收敛下一轮，不能拿局部抽样或估算充抵。
5. 驱动 `LOTM_CHARACTERS_ONLY` 记录授权开始、导入按钮开始、下一步骤观察时刻；以 ≤1 秒观察间隔避免原 15 秒轮询误差。完成后先保存全部正确性与时间结果，超时明确 fail；不在 300 秒时把未完成项算成功。

## 审核与验证顺序

独立方案审核 → 性能用例与独审 → RED/GREEN → 独立代码审查 → 定向回归、构建、指定原件全量真实计时。测试须覆盖实际 15 路、全局队列不阻塞角色而普通阶段仍受限、供应商选项/信号/授权不变、暂停取消全部在途请求、迟到结果不提交、重试仅未完成项、运行时证据完整、原正确性用例不回归。

记录采样观察到的模型调用（明确观测口径，不冒充无遗漏总调用）、结果状态、role 总时长与第 10 步时长、全部 task/artifact/关系一致性、原件/正文 hash 和页面错误。不预设角色必须恰好 556（真实识别存在不同列表），但必须把本轮全选候选全部导入。Key/原文/完整 journal 不进仓库；最终报告不把其他类别或整书发布算作本任务验收。

## r5 真实反馈：引用复制与重复目录

首轮提速构建真实运行，551 个全选角色，15 路实际在途；8 项完成后观察到“模型证据无法定位（no-match）”，及时暂停，退出码 2。没有完整成功或五分钟达标结论。原始元数据在私有运行 `characters-r5-performance`，不将真实资料写入仓库。

补充两项同范围优化，先独审再用例/TDD：

1. 从**不变的本次已选输入 units** 中为目标名称/别名寻找真实连续上下文，最多 8 个分布于输入范围的 `entityTarget.evidenceOptions:{unitId,quote}[]`。这是可供模型逐字复制的真实引用选项，不替代模型的资料提取、不强制只引用这些选项；所有返回证据仍通过原严格定位器。服务端在生成前验证每个选项的 unitId 属于当前 units 且 quote 为同单元原样连续片段；非法模板不能进入生成。没有真实匹配时不制造选项。
2. 现有一次 controller 纠错还允许四种固定的证据错误（unknown-unit/too-short/ambiguous/no-match），反馈只使用固定中文标签并提示复制真实选项；任意其他 reason/文本不能进入。总计仍最多两请求/四生成，持续无效仍失败。RB 原始输入严格拒绝行为不改，不把错误引文归一化/替换成成功。
3. 角色 instruction 不再重复整书全部角色别名目录，只包含目标及当前输入单元中出现任一名称/别名的候选。当前材料原样不缩减；服务端可信 entities **仍是完整已选清单**，可继续验证全部引用。其他实体/普通阶段的 instruction 与序列化不变。相关目录按固定候选顺序筛选，与并发返回先后无关。

验收补强：真实生成链前两轮 no-match、第三轮复制合法选项可恢复且资料/关系保留；持续四轮无效失败；非法选项生成前拒绝；未知错误标签不重试；小范围角色请求不重复无关整书目录，但服务端完整目录和全部正文材料仍在。再重新构建并用原书全文、全部角色真实完整计时。

## 完整性补强：绑定当前角色业务字段

源码直接证据：controller `importEntity` 在接收结果后赋 `schema:2`；但 AI 固定允许字段表只使用 `IMPORT_SEMANTIC_FACT_FIELDS.character`（旧字段），服务端 `validateIdentityLinks`/`validateSemanticLinks` 验证未绑定 schema 的模型结果。`importFactFields(character,undefined)` 排除 abilities/backstory/motivations/arcStages 等现有角色业务字段。结果不是这些字段不存在，而是正式模型链没有正确的写入契约；只在 controller 注入结果的 NIW-C41 无法发现。

仅 semantic/analyze/entity/character 按目标业务版本校验：提示允许字段表使用 `importFactFields('character',2)`，并明确 personalityTags/motivations/beliefs/bigFive/arcStages 的既有 JSON 字符串结构与取值边界；未知省略，不生成默认数字或占位内容。服务端响应 schema、早期身份/原生验证、最终引用验证均用带 schema:2 的**私有验证副本**，返回值不增改 schema/text/facts/evidence。controller 仍执行既有 schema:2 的最终验证。普通 analyze、其它实体、review/reconcile/patch 仍保持原字节/行为。

新增真链用例：合法全套 v2 资料（含能力/背景/动机/弧线/关系）经 runImportAi→controller 后与原值完全相等，并可原生映射；非法数组结构先纠错，持续非法失败；普通角色 analyze 仍不接受未授权 v2 字段，其他阶段指纹不变。不得为了性能移除这些字段。补充独审与 RED/GREEN 后再构建实测。

## r6 真实反馈：程序派生来源索引

r6 原件 579 个全选角色，25 项完成后持续“模型返回的角色字段结构无效（来源单元）”，驱动及时暂停并保留私有现场；未全批成功，也不判五分钟通过。所有模型输出字段/引文已连续经过校验，剩余错误来自让模型重复抄写机械 `sourceUnitIds` 索引。

仅 character entity 的模型线格式将 sourceUnitIds 改为**应用派生的元数据**，固定阶段契约不再要求模型输出它。为兼容旧返回，允许可选字符串数组，但其中值不具有来源授权：服务端保留当前 units 内的合法声明 ID，并补入严格定位后的每个 evidence.unitId，排除不属于输入的声明 ID；缺省/空数组可从已核验 evidence 得到非空索引。资料 text/facts/relationships、原始 evidence 不增删改。引用缺失、未知单元、虚构/歧义引文仍先由现有严格定位器拒绝，**不能**仅凭来源索引替换或修复引文。非字符串数组/超容量声明仍拒绝。

生成 schema 与最终解析使用同一派生流程，向 controller 返回的仍是现有完整 ImportArtifact 结构；随后 validateImportEvidence、原生/引用/发布门照旧。sourceUnitIds 是程序对已获准输入的来源集合描述，不再作为模型声称读过外部资料的信任凭据；没有可验证原文证据绝不生成角色或索引。保留所有原有合法来源 ID，尤其允许合法但未逐项摘录的来源，不丢有效溯源；仅排除模型无权宣称的外部/实体 ID。其它阶段保持原 schema/prompt/语义。

需独审后 TDD：缺省、空数组、foreign/实体 ID 的机械声明配合有效引文时确定性生成正确来源集合；原有合法 ID 保留；缺失/伪造/未知/歧义证据依旧失败；facts 与完整关系逐值保留；非角色 entity/普通 analyze 不获得此兼容。实际整书再以全部角色+≤300 秒同时验收，不能把 r6 失败改写成通过。

同一控制面分离进一步用于已经观测到的 r5 引文抄写错误：只在角色 entity 且本次有经生成前核验的 evidenceOptions 时，允许模型把单项 evidence 写成严格的 `{optionIndex:0-based整数}`，应用仅按该索引取回本请求已有选项的 unitId/quote，再走原定位器。仍兼容严格的 `{unitId,quote}` 以引用其它真实材料；两种形式不可在同一项混用，混合坏引文、越界/小数/字符串索引一律拒绝，不会把坏 quote 替换成好 quote。无选项或其它阶段不开放索引形式。对外最终 artifact.evidence 仍为原形状，原文内容来自已有真实选项，text/facts/relationships 不变。索引在给模型的选项数据中显式标明以避免 UUID/换行重复抄写；请求端选项仍用现有严格结构校验，不接受模型改造选项。


## r7 反馈：单角色专属提示与32项运行时容量

r7从新隔离session完整识别549个角色，38项完成后因持续no-match暂停；没有全批或性能通过。固定编号虽然已支持，现有大段通用semantic提示仍保留多种非角色输出与引用指令，模型仍自行抄写引文。前40项实测吞吐不足目标，继续单纯15路无法据此声明≤300秒。

下一轮仍不减少units、目录、角色或任何合法资料字段：

1. 仅semantic/analyze/entity/character使用专属固定提示：复用已批准的目标、全套schema2字段、JSON编码、已核验选项、人物关系/可靠性与知识归属合同；不再夹入world/scene/worldline/narrative的无关输出字段。提供选项时本次生成明确要求evidence只输出严格optionIndex，不再抄写unitId/quote；无选项保留原直接引用。服务最终响应/标准结构继续兼容合法直接引文，严格证据接受集不缩减，坏quote仍不能清洗。其它阶段逐字不变。全部目标材料、事实/关系和原生字段校验继续执行。
2. 已提供选项的角色请求，其四类anchor纠错消息追加固定编号操作说明；响应schema与generateImportAiJson的reason溯源使用同一静态消息映射，仍精确匹配已知四类reason，不回显任意quote/错误文本，不扩大重试上限。验证前两轮坏引文、第三轮编号恢复；持续非法仍失败。
3. 角色池调整为31；roster15、其它实体4、图片2不变。为保证真实31项取消证据可完整容纳，明确把导入runtime proof的全局硬上限从16项/16KiB提升为32项/32KiB，每调用1024字节不变。所有parse、pause schema、tracker预检使用导出的相同常量；保持调用与proof的原version1字段/身份/hash/时序/零剩余校验，旧16项记录仍可读取。不截断在途集合，不只扩大worker而让proof丢项；自定义更小预算仍有效，超过32项/32KiB仍拒绝。

这次容量增加是为用户新增五分钟目标作出的明确方案修订，覆盖本轮最初“不扩大16项证据协议”的实施选择；严格身份与取消证明要求不变。先独审方案及CP12/13，再TDD/独立代码审核/本任务定向验证与全书新session真实计时。不得把r7失败修改为通过。


## r8 完整性反馈：已确认角色ID不能由别名重新合并

r8观察560/564个任务done、零失败时，私有快照只有550个角色记录，10个已完成候选ID缺少对应记录；该轮不算通过。源码直接原因：runEntities每次提交仍调用通用mergeImportArtifacts，sameEntity按名称/别名认作同一实体，保留先到者ID，却把后到任务标done。阶段末resolveWizardReferences还会把因此缺失的ID当作未导入角色删掉关系外键。这与已确认实体目录和逐任务ID完整性不一致。

仅在向导character实体任务提交时，候选ID已由结构化目标/服务/native验证，直接按该ID保留一份完整规范artifact（原数组去除相同ID后追加深副本），执行原总容量门；不再用别名或姓名合并两个已选ID。其它entity/settings及普通分析的通用merge语义不变。别名仍是保留的事实文本，不作为重写作者已确认ID的授权；不删角色、不删字段、不凭别名把事实搬到其它角色。角色任务只有其确切ID资料保存后才done。

在resolveWizardReferences处理关系之前，针对本阶段已选且done的character任务，检查该候选ID确有唯一character资料及确认name；若缺失或身份错配立即拒绝，不得作为skip悄悄移除其关系。作者主动跳过的旧行为仍保留。先独审CP14，再TDD与代码审核，保留r8的真实反例并以新session完整重测；不能把旧done计数当作全角色成功。


## r8性能反馈：复用同一授权阶段的范围指纹

r8全部564任务显示done首次观察为02:38:40.556Z；从授权开始02:32:57.054Z计343502ms，且资料ID/关系仍有错误，正确性和五分钟均未通过。91,449,108字节的私有journal仅作为性能本地输入；不进仓库。对同一会话、相同analyze范围连续计算importScopeHash五次实测129/107/100/98/104ms，均等于既有analysisGrant.hash。每个角色请求都重新散列未变化的全文授权范围，564次累计CPU约一分钟（仅耗时分析，不能当实际提速成绩）。

CP-15拟仅对verified=true、wizardVersion1、semanticVersion1、analyze/entity/character启用进程内范围指纹缓存；第一次仍完整调用importScopeHash并验证等于本次analysisGrant.hash。WeakMap按session对象保存，键还绑定session.id、epoch、workingRevision和analysisGrant对象身份/hash；任何一项变化都重新计算。其余阶段仍走原完整hash。候选选择仅收窄既有范围，源码wizardScope明确目录由wizardSelectionHash单独绑定；运行中正文/章范围/来源/预算改变必须走原失效epoch/grant或工作版本路径，外部文件变化仍由原批次verify检查并取消全部在途任务。

不缓存模型授权校验、请求payload/hash、单角色材料、结果或证据；不持久化缓存、不将grant.hash直接当作未经本次计算的当前指纹。runtime每次仍记录自身真实operationId/payloadHash/开始时刻及同一有效scopeHash。所有暂停重开、撤权、patch或model变更门保持。先独审CP15/TDD/代码审核，连同CP14重新构建并新session全书实测，不能把推算减法当作≤300秒通过。


## r9性能反馈：合并在途批量保存，避免整本草稿写放大

r9本轮546个默认全选角色全部done，546个资料全部可native映射，zero dropped及mappingWarnings；从授权到观察detect-scene为325228ms，故五分钟未通过。完成后的UI暂停按钮有竞态超时，驱动已保留私有完成现场；不能据此宣称正式全部验收通过。API样本的settle并不完整，故不把最后一次观察settle当作真实最后模型完成时间；但实时确有API pending=0而仍有14个任务等待提交的观测。

源码直接写放大根因：commit在等待serial/save之前splice results，lastSave只在写盘完成后更新。首批保存慢于2秒时，后续每个worker均看到过期lastSave，逐项splice并排队一次完整约91MB session保存；原有serial保证互斥写盘，却没有合并等待中的结果。

CP-16仅character阶段添加一个在途commit Promise：调用者先等待当前写完成，再重新检查force/8项/2秒条件并取得当前全部pending结果；保存中的其它结果继续留在缓冲区，写完成后按既有阈值一次合并。同一时刻只允许一个角色commit取得批次并排队，原serial/容量/owner/epoch检查、原子rename/fsync、失败停止、2秒进度窗口、终结force、作者skip与依赖规则均保留。其它entity/settings的保存路径不改变。不把任务提前标done，不省略保存，不改journal格式/正文/返回资料。

驱动在观察到角色阶段完成后，先完成并保存角色ID/关系/原件校验与计时，再处理下一阶段的暂停/关闭，避免后置UI按钮竞态丢掉已完成验收结果。下一阶段已转waiting时无需点暂停；仍running时用正常暂停按钮，受控关闭只在证据保存后进行。角色断言失败必须fail，后续收尾失败单独记录，不能冒充角色错误或时间通过。

独审CP16用例→TDD→独立代码审核→定向取消/落盘/源拷贝/发布回归→新session完整原件五分钟验证。r9资料完整性证据可保留，但其325秒结果不能改写成通过。
