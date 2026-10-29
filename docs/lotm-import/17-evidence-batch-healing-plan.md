# 真实大纲证据失败的定向治愈方案及用例

日期：2026-10-27。状态：待独审；尚未实施。本书真实B1首批大纲连续两次失败，每次均已经过 generateJSON 内置一次纠错重生成；rev14、rev19均零artifact/coverage。两次错误路径均是 artifacts.N.evidence.M，源码此位置的自定义校验是精确来源锚定。不能靠关闭补全、清空资料、放宽引文匹配或手改结果通过。

## 范围与最小方案

范围仅 `desktop/service/novel-import-ai.ts`、`desktop/main/novel-import.ts`、必要的新定向单测；不改模型配置、预算策略、source/working units、正文、review/reconcile合同或数据库。正式应用重建后经产品重新授权继续同一完整输入，不复用过期进程授权。

1. 只把可证明的证据错误变成安全、固定的诊断：generateImportAiJson 捕获 StructuredGenerationError(invalid_schema)，所有有效错误路径/feedback均能对应本地 evidence 自定义校验时，转为既有4种固定reason（unknown-unit/too-short/ambiguous/no-match）。不把模型文本、quote、unitId、供应商原始消息或凭证写入错误/日志。混有其它字段错误时保持原错误，不猜成证据问题。现有 late anchorEvidence 同样用这些固定reason。
2. 当前 semanticVersion1 的普通 analyze 目标中，当且仅当收到固定证据校验失败，且本请求还有至少两个原来源单元，按原始单元顺序二分失败请求。每个子请求重建当前上下文，仍走 stageRequests 的完整payload/固定预留预算、同一冻结模型、同一analysisGrant/epoch、this.ai及全部响应/证据/native/锁校验。
3. 子请求分别通过原有验证和原子checkpoint后，才合并artifact/冲突并累计其确实处理的unit IDs。任一子请求失败、暂停/取消、授权失效或出现冲突，立即按既有路径停止；不得把未处理的兄弟单元计为完成。后一个子请求能看到前一个已提交子请求的上下文，不在RAM把全部结果拼成伪原子成功。
4. 仅在整单元边界二分，不切单元文本、不换ID/offset、不删元数据、不扩大授权范围。单个单元仍失败则报错保留，不无限重试；每次二分严格减少单元数，最坏有限二叉树。其它schema错误、网络/配额/认证/预算错误、review/reconcile/classify不走此新回退。
5. 不新增或篡改冻结budgetPolicy/工作单元几何，coverage仍逐ID证明。恢复继续仅选择原本未覆盖单元；不要求跨进程记住临时二分队列，也不宣称失败请求已成功。旧legacy流程原样；chapterVersion2及其hash/卷章修复不变。

这是一项缩小失败分析上下文的执行策略，不保证模型必定成功，也不证明失败原因是上下文长度。精确证据门和八类语义标准保持；若缩到单单元仍失败，必须据实报告和继续定位，不降级通过。

## 定向用例（先实际RED）

- LOTM-E01：实际 generateImportAiJson→generateJSON→schema 路径，模拟有证据自定义错误的生成，内置两轮后得到固定reason；混合错误/未知feedback/未知路径不能误触发；错误中无原文和秘密。
- LOTM-E02：真实临时controller中大请求固定证据失败，二分子请求成功。所有子请求仍经过完整ai验证、unit对象/顺序/内容/模型/授权不变；产物和coverage恰好覆盖全部来源一次，无跳过。
- LOTM-E03：左半成功checkpoint、右半失败或暂停/迟到响应；只保留成功左半coverage及artifact，未处理右半不计完成；正常重开重新授权仅发送未覆盖ID，已成功项不重发。
- LOTM-E04：子请求产生冲突后不得继续兄弟或下一目标/发布；所有决定仍走真实冲突路径。未知/单单元证据失败、网络/认证/配额/其它schema错误不拆分，递归有明确终止。
- LOTM-E05：子请求上下文纳入刚提交的实体/锁；重新封包仍验证payload完整预算，不能重用父包里的过期目录或丢事实来塞入。
- LOTM-E06：legacy会话、classify/review/reconcile不启用回退；既有精准证据、UTF-16、跨单元拒绝、修订范围和取消/授权门定向回归保持。

顺序：独立方案/用例审核 → RED → 最小实现 → 同一组GREEN/静态 → 独立代码审核 → 重建并保存追加构建身份 → 正常重开B1、重新授权 → 同一完整1394章再次实际运行。原两次模型失败和旧构建身份保留，不更新旧run或把定向合成测试算作全书通过。

## 初审后的识别与执行规则

- 不依赖被generateJSON截断到前6项的feedback。保持两生产文件范围，在generateImportAiJson构造的本地schema上使用Zod公开的preprocess+check观察钩子：每次实际schema解析先清空分类状态，最后check只观察完整issues集合，不改变value或issues、不放宽schema。仅全体issues均为custom、完整合法的artifacts/安全整数/evidence/安全整数路径、message逐字等于本地四种固定证据message时产生固定reason。类型错误导致check不运行时保留undefined；未知/混合/第7项非证据错误不得触发；成功解析清空分类。仅当前调用抛出invalid_schema且该解析具有上述完整分类时转换错误，不从前轮/前候选借状态。若无法用公开钩子证明这一点，退回18给出的1–5条保守规则，不为真实失败强行放宽。
- 已以当前安装Zod的纯合成检查确认：8个custom问题的最后check能看到完整8项；7个custom+1个字段类型错误时check不运行；8个custom+根extra时check看到全部9项（含unrecognized_keys）。这只是公开钩子行为调研，尚未实现产品治愈或跑E01。
- service RpcPeer仅保留message，main严格完整匹配4个固定消息，不依赖跨RPC的instanceof/自定义属性，不用contains/近似匹配。E01/E02加入真实RpcPeer合成往返，以及末尾额外字符/未知reason的负例。
- 每个子包均按原阶段合同验证；若普通analyze响应带越权conflicts等，仍走已有拒绝，不把测试注入的越权结果算成功。合法merge检测出的冲突立即停止后续兄弟。
- 同一目标本次执行可在RAM记住失败后缩小的单元数上限，让后续待处理包继续使用该更小上限，避免每包重复尝试已失败的大规模；上限严格不大于冻结profile.maxUnits且每次失败至少减半，仍经完整stageRequests封包预算。该缓存只属于当前session/目标/源scope，失效/重授权/新进程可丢弃；不进入冻结预算、scope/plan或coverage，也不承诺跨进程复用。E02/E05核对后续不会反复扩大，恢复即使丢缓存也不能重发已覆盖ID。
