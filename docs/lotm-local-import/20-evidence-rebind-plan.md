# 证据唯一逐字改挂自愈方案与定向用例

日期：2026-10-29。状态：用户已选择“唯一逐字改挂”方向；本文待独立审核，尚未实施。

## 问题证据

- r4、r6真实整书分析均在首个character批次终止，artifacts=0、coverage={}，正文hash不变。
- r6锚点诊断：`noMatch=11, otherUnitUnique=11`，即11条quote均逐字唯一存在于本次请求的另一单元，仅`evidence.unitId`配错。控制器的定位纠错重发又返回非证据类结构错误，不进入二分即终止。
- r4失败请求只读重放两次，一次no-match、一次成功，说明为模型配对不稳定，不是正文或章界缺陷。

## 规则变更（仅此一条）

旧规则（方案26）：诊断分类不自动修复或重定向证据。新规则：仅当以下条件全部成立时，把该条证据的`unitId`改挂到唯一命中单元，并把该单元id追加到所属artifact的`sourceUnitIds`（去重、保持原顺序）：

1. 请求为`semanticVersion===1`、`phase==='analyze'`、`intent!=='reconcile'`的普通分析；对象是`result.artifacts[*].evidence[*]`。artifactEdits、missingTargets、conflicts及classify/structure/review一律不改挂。
2. 声明的`unitId`存在于本次请求，但quote在该单元既非逐字子串，也无法通过现有排版恢复唯一定位，即原因为`no-match`。`unknown-unit`、`too-short`、`ambiguous`保持原样失败，防止模型编造ID或任选位置。
3. quote非空白字符数≥8，且作为**逐字子串**在本次请求所有其它单元中合计恰好出现1次（1个单元内1个位置）。不做排版恢复、模糊匹配、补字、删字或跨单元拼接；跨相邻单元边界的命中不算。
4. 改挂后的quote原样保留，随后仍走现有`validateImportEvidence`和控制器的来源/证据校验。

## 落点

只改`desktop/service/novel-import-ai.ts`：

- 新增纯函数`uniqueLiteralOwner(quote, units, declaredId)`，返回唯一命中单元id或undefined。
- schema阶段的`requestedEvidence`检查：当`anchorEvidence`报`no-match`且唯一命中单元存在时不加issue（让生成成功而不触发纠错重发）。其余原因的反馈文字、诊断计数、错误类型不变。
- `runImportAi`的晚期接纳（现第336行）：对普通analyze的artifact，先按条件3改挂并补`sourceUnitIds`，再执行原`anchorEvidence`与`validateImportEvidence`。

不改控制器二分白名单、预算、批次顺序、提示词、模型、章界、正文、发布或诊断日志格式。

## 定向用例

| ID | 条件 | 预期 |
|---|---|---|
| RB01 | 普通character分析，声明单元A存在，quote逐字唯一在B | 首次生成即成功（generateText仅1次）；evidence.unitId=B；sourceUnitIds含原值及B，无重复；quote不变 |
| RB02 | quote在B、C各一次，或在B内两次 | 仍失败`no-match`，不改挂 |
| RB03 | 声明unitId不在请求中（unknown-unit），quote唯一在B | 仍失败`unknown-unit` |
| RB04 | quote非空白<8且在B唯一 | 仍失败`too-short` |
| RB05 | quote仅在B中去除换行后可匹配（需排版恢复） | 仍失败`no-match` |
| RB06 | quote跨A/B相邻边界唯一 | 仍失败，不改挂 |
| RB07 | phase=review、intent=reconcile、classify、missingTargets/conflicts中同类错配 | 行为与改前一致 |
| RB08 | 控制器端到端：一批中某artifact证据错配到同批另一单元 | 该批提交，coverage记录整批，validateImportEvidence通过，无二分 |
| RB09 | 回归 | 现有anchor诊断（DIAG01–05，其中“唯一其它单元”分类改用unknown-unit构造，因no-match唯一命中已被接纳）、evidence-batches、request-schema、ai单测全部通过；typecheck、build:desktop通过 |

## 验收

单测先RED后GREEN；独立代码复核；然后以r7在同一真实session恢复整书分析，继续按原驱动的完成断言验收。合成GREEN不抵扣真实整书结果。

## 21独审后的冻结补充

- 阻断1：早期schema检查与晚期接纳只调用同一函数`rebindEvidence(entry,units)`：先执行原`anchorEvidence([entry])`；成功即返回原结果；仅当错误原因恰为`no-match`时才查找唯一逐字归属单元，找到则返回`{unitId:B,quote}`，否则原样抛出。晚期`sourceUnitIds`在得到改挂结果后按原顺序追加去重。
- 阻断2：遗漏补全请求（`semanticPending`，`desktop/main/novel-import.ts:647-651`）同为普通analyze、同样执行请求单元范围与`validateImportEvidence`检查，**接受**同一改挂规则，补控制器用例RB15。
- 唯一性计数包括重叠出现（与诊断`novel-import-ai.ts:95`同口径）；声明单元A有意保留在`sourceUnitIds`中（它仍属模型判定的来源范围，且已在请求内）；改挂后同一artifact内`unitId+quote`完全相同的证据去重。
- 改后r7诊断中`no-match`条目的`otherUnitUnique`应恒为0，按此口径解读。
- 增补用例：RB10排版恢复可在A唯一定位且逐字唯一在B→保持A；RB11同artifact一条可改挂一条真实no-match→整体失败；RB12多条改挂到不同单元，顺序与去重；RB13 B内重叠两次→不改挂；RB14非空白恰8可改挂、7为too-short；RB15遗漏补全端到端；RB16旧版请求及worldline/narrative；RB17原始request/units不被修改。
