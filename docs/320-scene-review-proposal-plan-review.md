# 场景复核提案分阶段方案独立审核

2026-11-01，独立审核者 `scene_hierarchy_review`。只读320、既有service/schema/投影/main遗漏门及主代理指定的私有标量audit；仅新增本文，未修改产品/测试、运行App或调用API，未读取历史缺失reply或把当前复测充作历史重放。

**批准最小阶段A设计，可立即另写最小用例并独审后进入TDD。320的阶段B和聚合/ledger尚不批准实现。** 不能因B边界未定拖住A，也不能把A通过写成候选完整性、重复提案或实体混聚均已解决。

## 阶段A：既有遗漏门进入原两代纠错

仅原普通scene-only review纯scope：semantic1、review、selectedTargets恰为scene、无conflict/intent。原作者解释RA分支不收窄，其它目标/组合/阶段保持原路径。A不新增proposalVersion、wire字段、遗漏索引、候选编译器、分组或main状态迁移。

把当前request能证明的既有missingTargets门，前移到同一响应schema的校验阶段：

- selectedTargets与unitIds本包范围；原三元组形状/非空/唯一性规则保持。
- 直接复用assertImportMissingProjection及原semanticLocks：来源/目标kind、完整projection语义hash、合法字段、source原资料禁改、作者锁定、text全范围及facts字段是否完整展示等原条件。
- 直接复用原anchorEvidence、validateImportEvidence及unitIds与evidence单位的双向覆盖校验。校验使用局部副本/返回值，不把排版恢复后的quote提前写回raw，不采用analyze跨单位rebind，不删除坏项、补unitId或猜baseHash。

原末端函数继续执行；main当前完整owner/hash/来源/锁定、模型授权与取消/epoch门不得搬走或以早校验成功代替。完整owner尚未在request中提供的判断不能由fragment hash假冒，片外字段不能猜空。请求自己的可信投影/版本结构无效仍应在生成前拒绝，不能把坏请求当作模型能修的结果重试。

新增schema issue只给固定、有限、≤250字符的范围/字段/完整引用指导，静态路径和索引不夹原文、名称/ID、hash、未知键或cause。只使用现有generateJSON两次生成及原外层次数，没有新retry、fallback、模型/thinking/额度/网络/7分钟门变化。A改变的是拒绝时机，不放宽最终接受集合。

必要用例应有原正控、首坏后合法的真实JSON桥恢复、持续非法恰两生成且无可提交结果；涵盖已证8类的代表性矩阵及原投影/锁/完整性边界。原raw排版恢复、UR/RA作者分支、完整metadata预算、末端撤权/取消仍应通过。不能仅测一个独立helper或根据prompt关键词返回成功。

## 证据强度与错误映射

已读取私有`r27-review-validation-gap-audit-scalars.json`：12组合成响应在重建request上验证，3个正控bridge/service/main均过，duplicate-unit-ids已在原schema两代拒绝；其余8类bridge接受而service末端拒绝，main未取得service成功结果。未发现service-final接受而main拒绝的该组样例。

另读取`r27-review-validation-gap-safe-error-scalars.json`，8个末端固定错误均被旧safeError映成通用提示。因此A有真实可复现的纠错时机缺口依据，但**历史坏reply未保存，77单元当前接口与main复测均过，历史root cause仍未复现**。不把baseHash等某一类猜作历史根因。A也不授权扩大全局错误消息直通；若单独改善UI分类，只能另行明确固定白名单及净化边界。

## 阶段B：方向合理，尚须定稿的边界

仅提示candidate.value写完整、增加长度/比例阈值，不能机械保证未误删其它事实。精确局部quote/replacement编译完整值可保留编辑范围外字符，是合理下一方向；但只能证明机械保留，不能证明替换区内删掉的每个事实都应该删除。

B首轮应与A分开。至少先明确：显式版本由应用何处冻结/持久化、旧会话如何保留原合同、wire严格分支与raw拒绝、不完整字段defer、完整base快照及Unicode/CRLF安全坐标、无空quote插入、no-op/冲突编辑规则、全部编译值的原native/引用/知识/预算门。不能从片段构造虚假的完整artifact做验证。

引用可进一步收窄为显式typed index或已合法ID，先不做typed-name解析，从而减少消歧范围。若保留name，须明确规范名唯一性及实际provider可见目录、typed池序号/metadata怎样生成；不能到未发送全书目录为名称补ID，也不能混用artifactIndex与引用池索引。parentId自指由原循环/PLACE门拒绝；sceneId等其它自关联须对照原业务合同，不能凭“无业务意义”一词泛禁（现原typed门并不普遍禁止sceneId指自身）。unset无法通过旧作者决定/原native合同则保持拒绝，不扩大可选字段含义。

单轮每field只返回一项的更小限制能减少同包重复，但不能解决跨packet/wave的同base重复；故不能据此宣称全部提案完整性已完成。跨field普遍stale没有实测依据，不做全量hash rebase。

## 同field聚合：实际必要，但元数据/历史/容量未定

当前canonical hash包含理由和证据，完整candidate值相同也可能形成不同hash；同base不同非重叠修正也确有一次编译的需求。不能只改conflictBases或把旧source.value强绑新base。阶段B若不含安全聚合，必须明确留下这一已知限制，而非暗清旧pending。

聚合准入至少需要应用可信的source artifact/field、完整source.value与semanticHash、working/decision版本、kind/type、锁定范围、编译器版本及成员精确证据一致。仅完整candidate值精确相等，或同一原base上可证明非重叠/严格相同操作可合并；不能从两个长canonical字符串猜原编辑范围，不能跨base、相异引用ID或冲突replacement拼接。

尚未定稿、因此不批准实现的项目：

- ledger/sidecar由何处生成与严格校验、RPC/持久化结构、main如何对当前完整owner重验；模型不能声明“已验证”。
- 稳定group identity与内容hash的区别、跨wave扩组/重试/暂停恢复及重复成员幂等，成员ID/hash/全部理由与精确证据如何完整保存并在原UI可审阅。
- 已resolved/作者已决定历史不得并入、删除或改写；新base、新决定或旧成员再现时如何显式保持未决而不伪造用户选择。不能把不同理由hash的历史默认为同一决定。
- 组数量、成员、编辑/理由/证据及ledger字节的实际上限和预算/持久化原子性。超限固定拒绝并保留已有材料/credit，不截断、取首或提高原修订容量。

以上须先独审定稿，再编写对应最小用例。现有记录不足以凭承诺批准一个无界聚合器，也不证明需扩大整个旧作者决定流程。

## 后续顺序

A用例独审→真实JSON桥RED/GREEN→独立代码审核→受影响定向/类型/构建→原配置单项及完整新会话。B/聚合各自完成边界和独审后才进入TDD；原内容建议仍私有未执行，不是自动作者批准。全部正文/冻结facts、真实作者决定、正常发布/退出/重开与完整资料仍必须实际通过。
