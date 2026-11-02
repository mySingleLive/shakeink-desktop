# 场景复核全文索引引用方案

2026-10-31。R22场景阶段935/935完成、0失败，294014.56ms；后置第三包review经过既有两次生成后conflicts.4/5/6.evidence.0仍无效，driver2/app0、未发布。下一未完成包由原controller确定性重构：91单元、77390 UTF16字符、137资料及投影、935实体目录；与184已复核单元无重叠。私有checkpoint不变，重构不调用模型；缺少历史payloadHash，不能称逐字节匹配历史出站包。当前另有9项待作者处理冲突，不清除、不绕过保存门。

## 最小协议与范围

仅semanticVersion=1、phase=review、selectedTargets恰为scene、无conflict、无intent的普通场景复核包增加全文引用编码；作者解释复核、其它目标/组合、旧版协议及所有分析/修改阶段不变。共享纯scope谓词供payload、prompt、service使用。

模型可输出严格{unitIndex}，引用当前请求units数组的0-based索引；payload为每个完整单位副本显式增加unitIndex。应用在本次请求快照中恢复原unitId与完整unit.text，保留CRLF、空白、Unicode和超过512字符的全文，既不生成引文也不按内容跨单元匹配。重复文本依索引区分其ID；每个包索引重新从0开始。整单元是原有证据合同允许的真实连续引文，属于较粗出处，不代表已证明冲突的语义。原{unitId,quote}精确形式继续沿用原谓词；明确坏quote不得降级整单元，混合/多余键、undefined自身键、非整数/越界索引均整项拒绝，不能丢坏项。

索引只改变引用编码，不改变conflict或missingTarget其它字段；仍通过原base schema、原anchorEvidence、validateImportEvidence、投影/锁定/范围、唯一实体引用和最终模型授权/取消门。既有两次JSON纠错不增额，固定feedback不回显原文、ID、未知键或值。不增加provider回退、原生API切换、思考/容量/并发/模型设置变化。

场景复核使用独立固定prompt，保留原reviewProjection合同、所有本包原文/资料/目录/章节/锁定值、作者已确认决定和知识归属要求；只报告有据互斥事实，区分时序、回忆、传闻与实体歧义。无需其它类别的生成契约，不返回analyze/patch内容，不改正文、不自动解决冲突。完整payload和新增索引仍计原字符/单元/固定UTF8 wrapper预算，不能削减来源以凑预算。

## 验证与边界

独立方案审核→最小用例及独审→真实generateJSON桥RED/GREEN→独立代码审核→受影响定向回归/类型/构建→同包当前模型只读复测→新会话真实整书默认全选场景及全部复核、正常保存/重开完整材料核验。其它协议黄金prompt/payload不变；已有RA38项继续证明精确引文接受集合和末端门。

不伪造publication恢复正常关闭删除的草稿；R22保留为场景阶段通过、完整流程失败。持久化验证须显式核对5589工作单元和全部冻结reviewFacts任务，不能只看场景计数或UI绿色。并发复核作为独立后续方案，不是本正确性修复的前置条件，另行审核与TDD。
