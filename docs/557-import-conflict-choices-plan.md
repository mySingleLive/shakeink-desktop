# 557 · 导入校验冲突的展示与解决方案 技术方案

需求（用户 2026-11-12，附截图）：

1. 「核对冲突」界面没有讲清冲突点，用户看不懂；应给出多个解决方案让用户选。
2. 用户选任何一个方案都必须能解决冲突、顺利通过核对，并能成功导入和保存作品。方案只是做法不同，没有对错。

## 现状（截图对应的路径）

- 截图是向导第 21 步「校验」点「处理矛盾」后打开的 `ConflictScreen`（`src/components/desktop/NovelImportDialog.tsx:119-141`）。冲突来自分章复核 `reviewChapterPackets`（`desktop/main/novel-import.ts:1450-1470`）。
- 复核契约要求模型返回 `type:"setting-body"`（`desktop/core/novel-import-ai-payload.ts:150-154`），但 `normalizeReviewReply` 保留模型给的任何合法 type（`desktop/service/novel-import-ai.ts:1257`）。截图中的冲突被模型标成 `body-body`，`source.artifactId` 指向推断出的金手指资料「灰雾之上的神秘空间」，`field` 为 `trigger`。
- 主进程把 `source.text/value` 改写为资料当前值（`novel-import.ts:1465`），所以「正文片段 A」实际是**现有设定**，「正文片段 B」是**模型按正文给出的值**。界面标签与事实不符。
- 界面显示原始字段键（`trigger`）、原始单位 ID（`working-0:437070:438070`），没有说明哪里不一致，也没有标出两段文字的差别。另一份隔离会话里，`entity` 甚至是实体 ID（`c-5748ee71bd9617af`）。
- 选项按 type 固定（`conflictChoices`，`desktop/core/novel-import.ts:360`）：
  - `body-body`：「保留正文并补充解释」（必填解释，并要求审核模型复核解释）和「修改正文导入副本」。后者在向导里会清空冲突并从第 9 步重新导入（`wizardApplyPatches`，`novel-import.ts` 中 `s.conflicts=[]` 后 `resetLaterSteps`），既慢又不保证通过。
  - `setting-body`：「坚持导入原设定」（必填解释）、「使用正文推断的设定」、「保持原设定，但修改正文」。「使用推断」在候选值不合法时（例如 `roleType` 候选为「地点/山脉，非角色」）会在提交时报错，用户无路可走。
- 自动修复只处理 `setting-body`（`autoRepairable`，`novel-import.ts:1482`），所以被标成 `body-body` 的冲突一定留给人工。
- 已决定的冲突可能被重新打开：`addConflicts` 在语义版本下遇到同 hash 的已解决冲突，会把它改回 `pending`（`novel-import.ts:2490`）。[修复] 重跑失败的复核包时可能触发。

## 方案

只改向导分章复核（`wizardChapterReview(s)` 为真）在第 21 步的冲突。非向导导入和仅场景目标的 `runVerify` 路径不变。

### 1. 复核结果入库时规范冲突（`reviewChapterPackets` 的映射，`novel-import.ts:1465`）

- 引用了本包资料的冲突，`type` 一律改为 `setting-body`，`entity` 改为资料名称，`kind` 取资料的 kind（已有）。复核材料只含推断资料（`reviewMaterials` 跳过 `origin==='source'`），所以不会误改来源冲突。
- 没有 `source.artifactId` 的冲突不对应任何可导入资料，丢弃并计入 `droppedConflicts`（界面已有「复核丢弃 N 条格式无效的矛盾」提示）。
- 作者已决定（有锁）的 `artifactId+field` 的冲突直接丢弃，不计数。这保证作者决定不会被后续复核重新打开。

### 2. 复核契约增加 `reason`

- `ImportConflict` 增加可选 `reason?:string`（≤300 字）。服务端 `conflict` zod 增加 `reason:z.string().max(300).optional()`；`normalizeReviewReply` 保留字符串 `reason`（截到 300 字）。
- 向导复核契约补一句：`reason用一句中文说明资料与本段原文哪里不一致（例如“资料写需默念咒文，原文只写逆走四步”）`。
- 旧会话或模型未给 `reason` 时，界面不显示该行，其他信息照常显示。

### 3. 冲突详情由主进程计算（`ImportView.conflictDetail`）

`publicView` 在「向导第 21 步、复核未运行、有待处理冲突」时，为第一条待处理冲突（与界面显示的是同一条）附加：

```ts
interface ImportConflictDetail {
  conflictId:string; index:number; total:number          // 第 index / total 处
  entity:string; kindLabel:string; fieldLabel:string      // 「灰雾之上的神秘空间」· 金手指 · 触发条件
  reason?:string
  current:string; proposed:string                         // 现有设定 / 按正文应为（ID 换成名称）
  evidence:{quote:string;location:string}[]               // 位置为「卷名 · 章名」或来源文件名
  choices:{choice:'inferred'|'source'|'merge';available:boolean;reason?:string}[]
}
```

- 字段名用新的共享表 `desktop/shared/novel-import-field-labels.ts`（覆盖 `IMPORT_SEMANTIC_FACT_FIELDS` 与 v2 字段，`text` 为「内容」）；表中没有的键显示为「其他字段（键名）」。
- 值为已导入资料 ID（`/^[a-z]{1,2}-[0-9a-f]{16}$/`）时显示资料名称。
- 位置：工作正文单位按 `unit.start` 找所在章节；来源文件单位显示文件名；都找不到时显示「原文」。
- 选项可用性在服务端用与提交相同的函数预检（见 §4），所以界面上可选的方案提交一定成功。

### 4. 三种解决方案（`resolve` 动作，向导第 21 步走新分支 `wizardDecision`）

| 选择 | 界面文案 | 结果 | 可用条件 |
|---|---|---|---|
| `inferred` | 以正文为准：把设定改成正文的说法 | 字段改为候选值（去掉知识标注），合并证据 | 候选值非空、与现值不同，且通过下述校验 |
| `source` | 保留现有设定，不改动 | 字段保持现值 | 始终可用 |
| `merge` | 自己填写这一项 | 字段改为作者填写的值（预填现值） | 非结构字段（不在 `WIZARD_REVIEW_STRUCTURAL`）；提交时校验，失败给出可改正的提示 |

补充解释在三种方案中都是选填，不再要求审核模型复核解释。

`wizardDecision(s,action,c)`（在原 `resolveConflict` 的类型/解释检查之前分流）：

1. 前置：`w.step==='verify'`、`stepState.verify!=='running'`、冲突待处理、资料存在。否则报「冲突决定已过期」。
2. 在克隆上写入新值（`source` 不改值），然后执行 `validateImportSemanticArtifact(next)` 与 `importNativeMappings(替换后的全部资料)`。失败时：`inferred` 报「正文给出的值不能作为「字段」保存」（预检已排除，正常不会出现）；`merge` 报「填写的内容不能保存为「字段」：原因」。会话不变。
3. 提交：替换资料；该冲突及同一资料同一字段的其他待处理冲突都标为 `resolved`（`resolution` 为所选方案），写入 decision；锁 `{artifactId,field,value}`；`semanticState=createImportSemanticState(s,locks)`；同一资料其他字段的待处理冲突刷新 `source.text/value`（与自动修复相同）；从 `deferredConflicts` 移除。
4. 重算校验行：`fixStructure` 后 `finishWizardChecks`。还有待处理冲突则 `phase='conflicts'`，否则 `phase='select'`，`stepState.verify` 保持 `waiting`。**不发起模型请求。**

为什么每个方案都能通过核对并保存：

- 一致性行只看待处理冲突与失败复核包（`finishWizardChecks`）。决定后该冲突不再待处理；§1 的锁过滤保证它不会被重新打开；`autoRepairable` 已跳过锁定字段。
- 保存路径不变：`wizardNext('verify')` → `keepForSave`（保留与现值一致的锁）→ `importNativeMappings` → `publish`。提交前已对新值跑过同样的 `importNativeMappings`，所以不会在保存时因该值失败。`assertPlan` 要求的「冲突全部 resolved」「锁与资料一致」都满足。
- 若 `fixStructure` 之后因其他原因丢掉了这份资料，`keepForSave` 会去掉对应锁，保存仍可进行（与现状相同）。

### 5. 界面（`ConflictScreen` 在 `view.conflictDetail` 存在时渲染新版）

- 标题：「第 1 / 3 处矛盾」；主句：「灰雾之上的神秘空间」（金手指）的「触发条件」与正文说法不一致。
- `reason` 存在时显示「矛盾点：……」。
- 两栏「现在的设定」「按正文应为」，用 `diffChars`（`diff` 包，已在依赖中）标出删去和新增的文字；文字相同部分正常显示。
- 原文依据：引文 + 「卷名 · 章名」，不再显示单位 ID。
- 「选择处理方式」：三个单选，每个带一行说明。不可用的方案置灰并显示原因（例如「正文给出的值不是有效的角色类型」）。`merge` 选中时出现预填现值的文本框。
- 底部：「返回校验」（回到第 21 步页面）、「确认并处理下一处」/最后一处为「确认」。提交后无需等待复核。
- 非向导会话与没有 `conflictDetail` 的情况保持现有界面。

## 不改的部分

- 非向导导入、`runVerify`（仅场景）、自动修复与 [修复] 的次数规则、`keepForSave` 的「保存时保留导入结果」。
- `resolve` 动作的 schema（`source/inferred/merge` 已存在）。
- 「修改正文导入副本」不在向导第 21 步提供（它会从第 9 步重来，不满足「顺利通过核对」）。非向导路径保留。

## 风险

- `conflict` zod 增加可选字段，旧回复不受影响；hash 计算会包含 `reason`，只影响新冲突的 ID。
- `publicView` 在第 21 步等待时每次跑一次 `importNativeMappings`（实测 800–900 份资料约 35–50 ms）。按 `revision+conflictId` 缓存，同一修订只算一次。
- 模型给的 `reason` 是不可信文本，界面按纯文本渲染，长度截到 300 字。

## 审核后修订（对应 `557-import-conflict-choices-plan-review.md`）

以下条目优先于上文。

- **R2（must-fix）锁定字段校验用完整字段表。** `validateSemanticRequest` 的锁检查（`desktop/service/novel-import-ai.ts:939`）改用 `importFactFields(a.kind,a.schema)`。否则对 v2 字段（`backstory`、`appearance` 等）的决定会让之后的复核请求全部报「语义锁定字段或基础版本无效」。分片字段检查（`:937`）不在本次范围。
- **R3（must-fix）长字段不提供「以正文为准」。** 资料 `text` 超过 `WIZARD_REVIEW_TEXT`（2000）或事实值超过 `WIZARD_REVIEW_FACT`（1500）时，复核只看到片段，候选值不能覆盖全文。`inferred` 置灰，原因「这项设定较长，复核只核对了前一部分，请选择保留或自己填写」。
- **R4 锁在 `fixStructure` 之后写。** `wizardDecision` 在克隆上：写值 → `fixStructure` → 资料仍存在且字段值未被改写时才加锁 → `createImportSemanticState`。资料被 `fixStructure` 丢弃或改写时不加锁，冲突照样记为已解决。
- **R5 不清空 `coverage.review`。** 决定不触发复核，`coverage` 保持不变，之后的 [修复] 只重跑失败包。
- **R6 锁过滤放进 `addConflicts`。** 向导会话（`wizardVersion===1`）中，`source.artifactId+field` 已锁定的冲突不加入、也不重新打开。分章复核、细纲补全、[修复] 都经过这里。
- **R7 交换两侧而不是丢弃。** 入库前，`source` 没有本包资料 ID、`candidate.artifactId` 指向本包资料时，交换 `source` 与 `candidate`，再按资料当前值改写 `source`。两侧都没有资料 ID 的仍丢弃并计数。
- **R8** 改为 `setting-body` 后，这类冲突也会先经过自动修复（以正文为准，3 次），只有修不了的才交给作者。这是预期行为，测试中注明。
- **R9 其他来源的冲突。** 第 21 步也会有前面步骤留下的冲突（`body-body`/`source-source`，ID 可能在任一侧）。统一取 `artifactId = source.artifactId ?? candidate.artifactId` 作为要修改的资料，「现在的设定」取该资料的实时值，「按正文应为」取另一侧的值。完全不对应资料的冲突只提供「保留现有设定」（仅记为已解决）。同字段的其他待处理冲突一并解决时，每条各写一条 decision。
- **R10** 服务端在第 21 步仍接受 `rewrite`（NIW-C19/F2 不变），界面不再显示。NIW-C60 改为断言 `source` 决定不发模型请求。复核契约增加的 `reason` 句子同步更新 `novel-import-verify-review.test.ts` 的期望。
- **R11 详情计算。** 「现在的设定」取资料实时值；与 `conflictBases` 不一致时视为过期，不提供 `inferred`。只在字段是引用或 JSON 字段时才跑 `importNativeMappings`，其他字段只跑 `validateImportSemanticArtifact`；结果按 `revision` 缓存。展示文字中所有已导入资料 ID（包括 JSON 内部的）都换成名称。
- **R12 结构字段。** 引用字段（`parentId/sceneId/characterId/itemId/worldId/eventId/lineId`）的候选值等于资料自身 ID 时，不提供 `inferred`。`merge` 只对 `text` 和不在 `WIZARD_REVIEW_STRUCTURAL` 中、且当前值不是 JSON 的字段提供。`source` 始终可用，所以每条冲突至少有一个方案能直接通过。

## 代码审核后修订（对应 `559-import-conflict-choices-code-review.md`）

- **559-1（must-fix）**：`assertFieldValue` 对 `chapterIndex` 要求是已有章节的十进制序号，细纲不能与其他细纲同章；细纲字段变更时在副本上运行保存时的 `projectDetailedOutlines`/`validateDetailedOutlines`。CC-32 覆盖「第3章」、已占用的章、越界三种值。
- **559-2**：差异只在两段值变化时计算一次（`useMemo`），合计超过 4000 字或 50 ms 超时则显示原文不标差异。
- **559-3**：自己填写失败时显示校验原因（短且不含路径时原样，否则「格式不符合这一项的要求」），不再经 `safeError` 变成模型配置提示。CC-33 覆盖。
- **559-4**：台账新增 `NIC-01`，其他条目不变。
- **559-5**：忙碌时两个文本框禁用；已选方案变为不可用时取消选中，填写框随之隐藏。
