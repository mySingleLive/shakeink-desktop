# 场景复核来源版本绑定独立代码审核

2026-10-31，独立审核者 `scene_hierarchy_review`。依据已通过306/307，审核新`novel-import-review-bindings.ts`、payload、service、共享scene-review指导、新SV测试及UR03 metadata预期调整。未参与SV实现；仅新增本文，未改其产品/测试，未构建、启动App或调用API，未读真实小说、配置/Key、私有journal或模型响应。主代理另行实施中的main/PY不属于本次批准范围。

**通过，无遗留阻塞，可进入组合回归及新构建真实验证。** 新索引是显式来源编码；已知来源的坏raw值或本包不完整字段仍拒绝，不被规范化成当前值。原作者决定版本门没有改动，不能靠sourceRef曾经合法跳过之后的来源变化。

## 主要核对

- `sceneReviewArtifactBindings`与payload/service共用原296精确scope。绑定值只来自当前artifacts/facts/projection的值副本，不读owner或别包。当前数组顺序保留；facts仅本entry自身完整字符串且原业务字段表、projection.fields/fullFactKeys均确认时可绑定。缺省不补空；重复同ID值矛盾静态拒绝。
- 同ID身份比较包含id/kind/name/schema/origin，另检查semanticHash/fullTextLength/fullFactKeys一致。调用旧assertImportReviewProjection后仍显式比较schema，避免其原有未覆盖项。text在本包可信UTF-16范围连续完整覆盖时恢复，重叠逐字一致才合并；缺口/无range不能绑，即使缺省text为空也不冒充全文。完整明确空范围可保留真实空text。
- service的artifactIndex只允许一个自身键、有效安全整数及当前数组边界；混合raw、未知键和额外undefined键不strip。按根field取完整值，恢复artifactId/text/value后再pipe原conflict；原kind/type/status/hash与其它字段不推导。source-source candidate应用同一完整来源规则；setting-body及其它原提案侧保持raw，索引提案拒绝。
- 已知raw source及source-source已知raw candidate必须完整可核验且value逐字相等；text原说明保留，不强制改写。明确不等给固定指导，不自动修好。包外ID仍由原末端范围门拒绝；无artifact的纯正文形式、作者解释及原RA分支、missingTargets合同保持。
- payload只在原artifact副本增加artifactIndex/bindableFields；完整值不另复制，原单位、资料、证据、投影、目录、章节、锁定与已确认决定保留。专用prompt说明完整字段、根field、当前包索引、候选提案与真实来源分工。原完整预算包含新增metadata及固定说明；不扩大实际role容量、不改变模型/thinking/provider/两次生成或外层重试。
- 绑定结果仍走原base、证据/单位、投影/遗漏、实体/阶段及末端授权/取消门；原semanticDecision/source.value比较与conflictBases保护没有放宽。固定指导在真实纠错段完整存在且长度受250字符限制，未知键、坏值、原文/ID和cause不回显。

UR03的调整只剥离并断言两个新增metadata字段，再逐值比较原artifact与旧payload；原资料保真断言未被整体删除。作者解释黄金payload/prompt仍与先前固定hash一致，原RA38继续运行，不把范围收紧伪装成所有raw接受集合不变。

## 独立执行证据

```text
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-review-source-reference.test.ts tests/unit/novel-import-scene-review-unit-reference.test.ts tests/unit/novel-import-scene-review-anchors.test.ts
61 tests / 61 pass / 0 fail / 0 skipped，约2790ms，exit0
日志：/private/tmp/scene-review-source-version-independent.txt
```

其中SV12通过真实generateJSON桥及原controller.semanticDecision后置哨兵验证合法source/inferred、a/b分支；坏旧source.value仍在模型/决定写入前拒绝。完整长值/空值、同文异ID/跨包、缺字段、严格形状、完整一致重叠/缺口、schema身份及重复facts矛盾、完整预算、其它scope和末端撤权均有实际断言。UR11与RA38共同保留原引用及取消/范围门，不重复声称未执行的新组通过。

独审另补307所要求的“来源随后实际变化”边界，未修改冻结SV测试：运行纯合成私有脚本`/private/tmp/scene-source-version-late-change-independent.ts`（Node24/tsx，exit0）。合法sourceRef先经真实JSON桥产生canonical冲突，source/inferred两分支均通过原版本比较到达semanticRepairs fail-closed哨兵；随后只修改owner中该artifact的真实backstory，canonical冲突/ref及原元数据不改，再分别调用原semanticDecision，均在原固定版本门拒绝且不到后置哨兵。决定过程owner保持各自调用前快照，decision AI/业务writer计数均0；fixture及响应均为合成，未调用真实模型。私有静态结果日志：`/private/tmp/scene-source-version-late-change-independent.txt`，positiveSentinelReached=2、actualOwnerChangeVersionRejected=2、ownerPreserved=true、ai=0、writes=0。

指定SV文件及本文diff检查通过。本审核未重复执行主代理类型检查或宣称已构建/完成实际安装包验收；LF由另一代理独审，PY待独立结论，不能据本报告批准未冻结的其它main改动。

## 真实边界

R23原16来源值不一致/32个合法分支的固定版本拒绝由主代理实测，本审核未读取实际私有数据。R23精确事实复核失败是独立长fact piece尺寸门，308/309处理；924场景与5589正文单元已完成不等于完整facts、publish或reopen通过。SV不追改已有坏冲突、不清作者决定或coverage，也不把编码正确当作文学互斥判断正确。后续真实验证必须使用新构建身份、正常作者流程及全部事实/正文与材料保存重开结果。
