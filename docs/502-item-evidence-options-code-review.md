# 502 物品引文选项（docs/500）代码审核

范围：docs/500 §2R 与 501（含修订节）对应的未提交改动。490/493/497 只在与 500 交互处检查。

## 结论：通过

没有阻断或需修订问题。以下按严重度列出观察项。

## 发现

### 低

1. **物品提示仍带角色 roleType 通用句。** 物品 entity 提示（有无选项都一样）仍含“角色roleType使用entityTarget中作者已确认的值”（共用 `entityContract`）和语义契约中的“角色roleType必须有源文叙事功能依据…”。这两句在 500 之前就存在，场景和世界提示同样含有，§2R 第2条只要求去掉输出契约里的“角色roleType必须等于entityTarget.roleType”，这一点已做到（`desktop/core/novel-import-ai-payload.ts:142`）。IE-05 的注释也说明了这一点。不需修改，记录在案。
2. **单字物品名的选项可能落在无关词里。** `characterEvidenceOptions`（`desktop/main/novel-import.ts:88-96`）用 `unit.text.includes(name)` 选单元，名称/别名按长度降序匹配，每单元取一段（前12字、后20字，含代理对边界修正），最多均匀抽 8 段。物品名常比人名短（如单字“笛”“眼”），可能命中无关复合词。引文本身仍是真实连续原文，服务端还会逐项核验（`desktop/service/novel-import-ai.ts:817`），所以不会伪造证据，最多给出关联较弱的选项。角色路径有同样特性，`hits` 的单元选择也用同一匹配。别名会参与匹配，长名优先，这对物品是合适的。不需修改。

### 信息

- IE-03 回退生产改动后失败这一点，我没有独立重做（不允许改源文件），采信调用方的说明。测试结构本身能证明这一点：第一轮控制器请求的两次生成都 no-match，并且经过真实的 `generateImportAiJson`；第二轮带 `evidenceOptions` 返回 `{optionIndex:0}`，断言结果 evidence 等于选项、sourceUnitIds 等于选项 unitId。如果没有 500 的服务端改动，`{optionIndex:0}` 会被严格 schema 拒绝。

## 逐项核对

| 检查项 | 结果 |
|---|---|
| `indexedEntityRequest`（`service:375`）各用处 | `:480` 场景 facts、`:512` 场景 superRefine、`:616`、`:864`、`:882` 场景链接纠错都另带 `kind==='scene'`，仍只用于场景。`:494` 选项解析、`:502` `indexedArtifact`（sourceUnitIds 可选并由已核验 evidence 派生；`canonicalFacts` 补 PLACE/parentId 只用于场景）、`:933` 反馈对物品生效，符合方案。 |
| 497 物品 superRefine 是否仍可达 | 分支顺序是 `characterEntityRequest`（`:509`）→ `indexed&&scene`（`:512`）→ `itemEntityRequest`（`:515`）。物品不满足前两项，进入 `:515` 并包裹 `indexedArtifact`，所以物品面板字段校验和 `IMPORT_ITEM_FACT_GUIDANCE` 保留。IC-03/IC-07 通过。 |
| `semanticResultArtifact`（`:382`） | 只剩 `indexedEntityRequest`，对物品等价于原来的 `||itemEntityRequest`；`validateIdentityLinks`/`validateSemanticLinks`（`:851`、`:871`）对物品仍按 schema 2 校验。 |
| `importEvidenceFeedback`（`:933-934`） | 场景/物品/角色三分支；角色和场景文案逐字不变。IE-08 覆盖。 |
| 载荷编号（`payload:32`） | item 加入编号条件；IE-01 断言 `optionIndex===i`。 |
| 提示 `indexedEvidence`（`payload:118/121/142/148`） | `itemEntity` 带 `semanticVersion===1`，`characterEntity` 不带，与原条件一致，所以角色提示不变。物品分支放在 `entityOutputContract` 的最前面，不含 roleType 句；角色分支和非角色分支逐字未动。`if(characterEntity){…}` 专用提示未改。我实际生成了物品有选项和无选项两种提示，内容符合方案。 |
| 7 个 sha256 基线 | 测试中的值与 `/private/tmp/shakeink-item-493/prompt-baseline-500.txt` 逐一一致（IC-04/05 五个，IE-05 两个），测试通过。 |
| 控制器 `indexed`（`main:1036`） | 加入 item 后，`trimmed` 已删除，`grep trimmed` 在源码中无结果。`relevant` 裁剪（`:1038`）行为与 493 相同；`:1039` 的父级补全仍只在 `kind==='scene'` 时执行；`evidenceOptions`（`:1040`）对场景仍优先 `memberships`。`entitySchemaFeedback(error,indexed,kind==='scene')`（`:1058`）只对物品打开四类引文错误的反馈，`allowScene` 仍只给场景。 |
| 纠错次数上限 | 控制器仍是一次 try 加一次纠错（`:1054-1063`）；服务端生成重试次数未改（CP-11b `calls===2`）。没有提高上限。IE-03 持续失败分支断言请求恰为 2 次，任务 failed，错误为 no-match。 |
| 测试反转 | CP-11b（`tests/unit/novel-import-character-source-index.test.ts:65-67`）改为正向断言，其余负例保留；IP-06（`tests/unit/novel-import-item-performance.test.ts:98-101`）改为断言“sourceUnitIds由应用计算”，并要求每个请求带 1–8 个含名称或别名的真实选项；IE-04 覆盖越界、小数、字符串、混用和伪造引文。 |

## 本地复核

- `tests/unit/novel-import-item-profile`、`item-performance`、`character-source-index`、`scene-performance`、`character-performance` 共 31 个用例，30 个通过；唯一失败是 CP-13a，与 `/private/tmp/shakeink-item-493/cp13a-baseline.txt` 记录的 HEAD 既有失败相同（`confirmRoster` 报“识别失败”）。
- `tsc --noEmit` 通过。build:desktop 未重跑，采信调用方结果。
- 没有启动 Electron，也没有访问 `/private/tmp/shakeink-scene-import-486`。
