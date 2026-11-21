# 五分钟角色导入定向用例

日期：2026-10-30。方案 246（独审通过），继承 CI-01–09 与全部严格字段/证据/关系门。全部夹具为合成文本，真实书仅在隔离系统测试使用。

| ID | 操作 | 必须断言 |
|---|---|---|
| CP-01 | ≥32 个已选角色，阻塞初始请求直至池饱和，然后放行；同时观察 runtime.json | 实际峰值恰为 15，不超过 16 证据容量；全部独立 task done、候选/任务/artifact ID 相等、关系保留。不能只检查常量。后续 ≥8 个 scene 实体实际峰值仍为 4 |
| CP-02 | 真实服务端所用生成策略 helper，遍历语义角色 entity/roster 与普通角色 analyze、scene/item/world entity、review/reconcile/patch、legacy | 只有合法语义 analyze/roster 与 analyze/entity/character 获得轻量选项；DeepSeek OpenAI thinking disabled，DeepSeek Anthropic 不被误发 DeepSeek 开关，其他供应商按已有最低档规则；store:false/原选项、model对象、快照不变 |
| CP-03 | 先占满真实 longTaskQueue 的两个名额，再经生产所用 lane helper 调用 acquireLongTask | 角色 entity 不排入聊天队列可立即完成；普通阶段实际等待释放名额。取消信号仍交给 work；不以假队列或只读源码替代运行验证 |
| CP-04 | ≥32 个角色，先完成并提交 8 个，再让实际 15 个请求在途，执行正式 pause→resume | 暂停取消的 operationId 集合恰等于当时在途集合；proof drained 且 calls=15、pending/operation/jobs=0；暂停后无迟到写入；恢复不重做已完成 8 个，剩余全部 done |
| CP-05 | CI-01–09、NIW-C29/C30/33/38/40/41/46/47/49/50 与 AI/request-schema/roster/prompt/runtime-proof/语义/发布定向回归 | 原有错误不得回归；旧“实体并发4”用例必须按角色15与其他实体4分开实测，不删除断言迁就实现；严格非法单位、伪造引文/ID、字段/授权/模型变更仍拒绝 |
| CP-REAL | 当前构建、真实 Electron/真实模型、指定原件完整1402章、默认全选全部角色；自动正常点击向导 | 从“允许分析并导入”到所有角色完成总计 ≤300000ms（含识别、自动确认等待及全部纠错）；另报第10步时长。全部候选/任务/artifact一一对应、zero failed/skipped/dropped、关系ID全部解析、原件与工作正文hash不变、零页面错误。受控选择器标明。时间超标也必须保存结果并标FAIL，不把未完成项算成功 |

## 确定性测试实现约束

- CP-01/04 使用有界同步门，不依赖随机 sleep 碰巧达到峰值；等待初始15个请求与后续提交均有短超时，finally 放行/中止以防 RED 挂起。
- CP-03 使用真实 acquireLongTask(signal,2) 的显式限制避免依赖测试数据库/配置；所有占用名额 finally 释放并恢复队列原 limit。通过默认生成实际使用的 helper 验证，防止只测试未接线工具。
- CP-04 取消必须使实际 pending Promise settle；完成后再比较 artifact/任务快照。恢复时按 candidateId 对照请求次数，不能只断言最终总数。
- CP-REAL 观察间隔 ≤1 秒，记录起止 ISO 时间及两种 duration，不能在角色开始后重置计时，不能把 paused/restart 当成计时豁免。观测调用样本保持观测口径，不声称原始生成次数无遗漏。
- 不运行全仓测试；不改原书、不预写业务数据、不替换真实模型响应、不省略角色或合法事实来满足五分钟。若首轮真实不达标，以证据推进下一轮方案与独审。

## r5 引用复制与重复目录补充

- CP-06：合成 30 个分布在不同正文单元的角色；当前角色请求保留原有 units 集合与完整可信 entities，但自由 instruction 目录只含当前材料出现的名称/别名和目标，无关角色不重复传入。相关别名命中仍在目录中，候选顺序稳定。
- CP-07：controller 生成的 evidenceOptions 每条 unitId 属于本次 units、quote 为该单元原样连续片段，最多 8 条、可跨首尾材料且 Unicode 不断字符；无真实匹配不制造。服务生成前拒绝 foreign unitId、不实 quote、空白 quote、越界容量；不能先请求再拒绝。合法模板不限制模型引用其它真实原文。
- CP-08：正式 controller→runImportAi→generateImportAiJson 链，前两次真实 no-match 错误后第三次逐字复制合法选项可恢复；两请求三生成，最终资料/关系/证据完整。持续 no-match 四生成后仍失败；其它固定三种原因同样仅有一次有限纠错，未知 reason/标签不得重试或转发。普通 RB 未知单位/虚构引文仍严格拒绝。
- CP-REAL：修复后原件重新完整执行、默认全选，role 总时长包含识别与全部纠错；不能只因局部提速就判五分钟通过。记录 r5 首次真实错误及下一轮完整结果。

- CP-09：真实 runImportAi→generateImportAiJson→controller 链（只控制 generateText）返回合法 v2 全套角色字段：abilities/backstory/motivations/personalityTags/beliefs/bigFive/arcStages 与关系。断言服务/生成 schema 接受、controller 赋 schema:2 后所有字段逐字不丢、原生 profile 全量可读。分别用错误 motivations/bigFive/arcStages 结构作首次返回，第二轮修正；持续非法必须拒绝，普通 analyze 仍拒绝 v2 字段。固定 entity 提示列出真实业务字段及结构、未知不猜默认；普通阶段 hash 不回归。

- CP-10：仅角色 entity 线格式可省略 sourceUnitIds；用缺省/空数组/foreign ID/实体 ID 声明，必须由严格定位证据确定有效来源集合，保留其它合法来源 ID，结果 facts/text/relationships/evidence 原值不变。生成桥与最终解析一致，controller 接收的始终完整规范结构。分别对缺失证据、foreign evidence.unitId、虚构 quote、无法唯一重定位的 quote、错误数组类型/容量断言拒绝；不能因为 sourceUnitIds 有合法值就代替证据。普通 analyze/其它 entity 的缺省或 foreign sourceUnitIds 仍拒绝。引用重定位的真实目标 ID 必须补入索引；旧阶段 RB 返回保持不变。固定角色契约不再让模型重复填写机械索引。
- CP-11：有已核验选项的角色 entity 可返回严格 optionIndex 引用，生成桥/最终解析/controller 均还原为同一真实 unitId/quote 并派生来源索引，资料/关系不变；parse 幂等。越界、负数、小数、字符串、额外字段、`optionIndex+坏quote/unitId` 混合项全部拒绝；无选项、普通分析、其它 entity 不开放此形式。合法普通原文引用仍保留原行为，不会搜索未提供材料或任意选择歧义片段。模型看到的每项索引与当前请求数组位置一致。


## r7专属提示及容量补充

- CP-12：正式单角色生成提示包含作者确认ID/类型、全部现有schema2字段及结构、人物关系/可靠性/知识归属、不改正文与不执行资料指令；有选项明确仅生成严格optionIndex，无选项保留直接引用。其它phase/kind/legacy指纹不变，units及可信完整目录不减少。正式生成链首次两轮坏quote后第三轮索引恢复，反馈含固定编号操作说明、不含坏quote；四轮持续无效仍拒绝。其它阶段anchor消息与reason保持不变。
- CP-13a：合成≥64个角色，阻塞至实际31个请求在途，峰值恰31；全部独立任务/资料/关系完整。scene仍实际4路，roster仍15。不能只检查常量。
- CP-13b：完成并落盘8项后让31个实际请求在途，正式pause取消集合恰等于31项，proof完整drained、calls=31、零剩余；迟到不提交；resume只重做未完成项。原CP04按31池扩大夹具，保留逐ID次数及精确操作集合比较。
- CP-13c：真实tracker可容纳32个合法在途调用，33拒绝；逐条settle后容量释放，完整32项暂停proof可parse/保存/恢复；32KiB整体和1024单条超限仍拒绝，较小自定义预算仍有效，旧16项proof可读取，未知键/ID混用/非零remaining/时序错误仍拒绝。主进程encodeImportJournal完整保存31项proof，重开不丢证明。
- CP-REAL仍使用完整原件、新隔离session、全部全选角色，以完整ID/事实/关系/来源和≤300000ms同时验收。报告r7失败、最终总时长与第10步时长。


- CP-14：三个以上已选不同角色ID，模型有据aliases包含另一候选的名称，返回值有不同完整facts/text、相互引用；正式controller→runImportAi链全部done后，候选ID=任务ID映射=artifactID集合，逐ID事实/文本/别名与原返回完全相等，所有关系characterId原样保留，zero dropped/skipped。旧实现应真实复现记录被别名合并而任务done的缺口。普通mergeImportArtifacts的别名归并继续原语义，不全局改sameEntity。
- CP-14b：完整已完成角色会话合成删除一个角色资料，或该ID改成其它kind/name，再调用阶段末引用处理；必须在删除关系外键前拒绝且原关系和dropped列表不变。正常完整结果无误；作者主动skipped的目标仍按原规则保留名字并移除外键。源资料复制及其它实体/设置/冲突回归继续通过。


- CP-15：进程内缓存真实接入角色ai调用路径，合成≥64角色实际31在途/逐批提交时，完整scopeHash只计算一次且每条runtime记录恰等于直接importScopeHash结果；每请求payloadHash仍独立。利用私有cache方法包装compute计数，不能只测未接线helper。相同session+grant+epoch+workingRevision命中；分别换session对象/id、epoch、workingRevision、grant对象或hash必须重新计算，首次结果不等grant.hash须拒绝且不缓存。非角色或verified=false路径不使用缓存。
- CP-15恢复与失效：暂停/resume新epoch重新计算，原已完成项不重做；来源变动仍中止所有在途、模型或授权改变仍拒绝；patch/重开新会话不沿用旧cache。缓存不写journal/payload，不更改hash值、请求材料或业务数据。保留NI-RT身份/时序与CP13完整证明回归。最终原件仍以真实完整总表和≤300000ms判定。


- CP-16a：≥64角色真实31在途，放行8个并阻塞第一次真实session保存，推进Date.now使旧lastSave超过2秒，再放行同批其余23个模型返回；新任务继续阻塞。释放首个保存后，持久化done31时至多两次真实save（8+23），旧实现应实际出现逐项排队放大；全部64完成后逐ID资料/事实/关系仍完整。最终force会保存不足8项缓冲，不以时间或条数门漏结果。finally恢复时钟、释放AI与IO门。
- CP-16b：同一慢保存窗口中正常pause，暂停须等待已开始的真实IO、取消全部真实在途AI，停止后无迟到写入/零pending；resume不重做已落盘项，完整ID与取消proof保留。保存拒绝不得继续调度或标全部成功；原持久化失败及来源变化测试仍通过。其它scene/item/world/settings行为不改变。
- CP-REAL完成顺序：所有角色断言和真实计时结果先写独立元数据，再请求下一阶段pause/关闭；保存原始私有journal，标明后置UI停止受控动作。后置竞态不重置计时，不绕过任一角色断言，也不把超时判为通过。
