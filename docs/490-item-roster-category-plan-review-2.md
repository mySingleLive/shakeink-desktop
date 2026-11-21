# 490 方案第二轮独立审核

审核对象是 `docs/490-item-roster-category-plan.md` 第 2R 节，对照第一轮审核和源码逐项核对。我没有修改任何文件。按要求忽略了 `desktop/main/novel-import.ts` 的未提交改动和那个未跟踪的测试文件。

## 1. 第一轮 7 项必改的落实情况

| # | 第一轮要求 | 结论 | 依据 |
|---|---|---|---|
| 1 | 改为跨批计票，在 core 判定 | 已解决 | 2R-1 把落点放在 `mergeWizardRoster` 和 `buildWizardCandidates`。`runImportAi` 不再丢弃条目，`locatedRoster` 用 `...entry` 展开（`service/novel-import-ai.ts:948-953`），category 会自然透传。 |
| 2 | 控制器测试改到能测到的层 | 部分解决 | 2R-4 的写法正确：fixture 的 `ai` 结果直接进入暂存（`tests/helpers/novel-import-wizard-fixture.ts:38`），测的就是 core。但第 4 节没有标记为作废，仍写着“schema 拒绝缺失 category；非 item 条目被丢弃且返回项不含 category”。这两句和 2R 直接矛盾。 |
| 3 | 单批纠错失败导致整步失败的处理 | 部分解决 | 缺省 category 已改为允许。非法值（包括 `null`、`"Item"`）两轮纠错仍失败时，`stop()` 会让整个第13步失败（`main/novel-import.ts:584`）。第 3 节只写了“记录失败批次数”，没有明确写“接受这个风险”。 |
| 4 | `taken` 排除 sceneExcluded/unresolved，明确未勾选角色的取舍，补测试 | 规则已解决，测试未落 | 跳过步骤、称号别名两条用例没有出现在第 4 节。 |
| 5 | 旧草稿生效路径，补中途恢复测试 | 说明已解决，测试未落 | 2R-3 的生效路径与 `main/novel-import.ts:1126-1136` 一致。“暂存缺 category 时恢复”的用例不在第 4 节。 |
| 6 | 更新 RA-07、WP-01，新增提示逐字相等测试，避开 WP-04 禁用词 | 已解决 | 拟用的物品定义文案不含 `evidence`、`quote`、`逐字`。category 改为可选后，RA-07（`tests/unit/novel-import-roster-ai.test.ts:42-43`）不会失败，但仍应补上透传断言。 |
| 7 | 台账 | 已解决 | 台账现有最大编号为 NI-09，新增 NI-10 正确。 |

## 2. 计票规则（`core/novel-import-wizard.ts:95-118`）

- **按条目计票基本成立。** 每个暂存条目来自一个批次，所以一个条目就是一个批次的一票。平票排除、未知不计票、全未知时保留（退化为现状），这些规则都自洽。
- **问题 A：方案没处理 `itemType`。** 现在的代码是 `g.itemType??=e.itemType`（`:109`），取最先出现的那一批。方案只把 `important` 限制为“item 或未知的条目”，`itemType` 没有同样限制。结果是：一个组即使计票后判为物品，标签仍可能来自某个判为 character 的批次，显示成“角色”。截图里的问题就是这个标签（`NovelImportWizard.tsx:129`）。`itemType` 必须用和 `important` 相同的过滤。
- **问题 B：计票字段会漏进候选。** 如果 `mergeWizardRoster` 在返回值里加上 `itemVotes`、`otherVotes` 或 rejected 标记，`buildWizardCandidates` 目前只剥掉 `important` 和 `names`（`core/novel-import-wizard-roster.ts:62`），其余字段经 `...rest` 进入候选。候选 schema 是 `.strict()`（`core/novel-import-wizard-state.ts:44`），`encodeImportJournal` 保存时会校验（`main/novel-import.ts:171`）。这会导致保存失败，整步变为 failed。方案必须写明计票字段要剥离或不放进返回值，并加一条“生成的候选能通过 `importWizardStateSchema`”的测试。
- **问题 C：别名合并会把不同实体的票算在一起。** 组的划分沿用角色的别名强链接规则（`:98-99`）。只要一个物品条目和一个人物条目通过别名强链接合并，两边的票就混在一组里。这种情况概率低，但方案应写明这一点，并补一条“别名合并后票型混合”的用例。也可以考虑先按每个条目自身名称计票，再合并。
- **`important` 的计法：** “任一 item 或未知条目为 true 即为 true”可以接受，和现有 `||=` 规则以及产品文档 02-product.md:84 一致。这一点需要用例锁定：判为 character 的条目写了 `important:true`，不能因此保留该组。

## 3. schema 可选与提示必填（`service/novel-import-ai.ts:362-368`）

- 可行。条目 schema 是 strict 对象，`z.enum(...).optional()` 接受缺省，拒绝未知值。代码库已有先例：`itemType` 在 schema 里有 `.default('')`（`:367`），schema 比提示宽松。主进程阶段白名单只检查顶层 `roster` 字段，不受影响。
- 要补的一点：模型常把字段写成 `category:null`。按方案，`null` 会被拒绝并进入纠错，持续失败就会让整步失败。建议用 `.nullable().optional()`，并把 `null` 视为未知，和 scene 的 `parent` 处理一致（`:366`）。至少要在方案里写明 `null` 的处理。
- 字段错误标签表只覆盖角色清单（`:783`），item 出错时显示“角色清单”。这是现状，不是回归。

## 4. rosterStash、journal 与 hash

- 在 `core/novel-import-wizard-state.ts:33` 的类型和 `:65` 的 strict schema 里给条目加 `category:z.enum(...).optional()`，旧草稿没有这个字段，仍能通过校验。加载路径（`validJournal`，`main/novel-import.ts:394`）、保存路径（`encodeImportJournal`，`:171`）和发布路径（`service/novel-import-publish.ts:48`）用的都是同一个 schema，三处一致。
- 各项 hash 不受影响：
  - `wizardSelectionHash` 只覆盖已勾选候选的 `id`、`roleType`、`aliases` 和 `images`（`core/novel-import.ts:371-374`），不含暂存。
  - `importScopeHash` 中 wizard 部分只包含 `structureHash` 和 `grantedChapters`（`:370`）。
  - `wizardView` 不输出 `rosterStash`（`:415`，`shared/novel-import.ts:165`）。
  - 主进程的 journal 没有整份校验和。`AUDIT_CHANGED` 属于 work-lease 文件（`core/work-lease-recovery.ts:87-107`），与此无关。
- 一个小风险：识别进行中、暂存里已带 category 的草稿，如果被旧版本打开，strict schema 会拒绝，`validJournal` 返回 false，该草稿在启动时被跳过（`main/novel-import.ts:379`）。不用修复，写进风险一节即可。
- 暂存拷贝（`main/novel-import.ts:575`）需要按现有写法补一项 `...(e.category?{category:e.category}:{})`。方案已列出这一处。

## 5. `taken` 集合规则

- 只用已勾选角色，加上已勾选、非 `sceneExcluded`、非 unresolved 的场景，这个方向正确。`sceneExcluded` 的场景默认不勾选，除非作者在 `authorKept` 中重新勾选（`core/novel-import-scene-identity.ts:11`）。
- **问题 D：比对用的名称范围过宽。** 方案用物品组的“任一合并名称（`c.names`）”去比对，而 `c.names` 包含模型给物品写的别名。模型给物品写一个人名或地名作别名时（例如把“黑夜女神”写成圣徽的别名），真实物品会被排除。建议只用物品组自身的名称（primaries）比对。角色一侧可以继续带别名，已知的称号冲突风险保持不变。
- 作者重新勾选的 `sceneExcluded` 场景，其实是作者确认的地点，可以纳入 `taken`。这一点影响很小，在方案里写明取舍即可。
- 回到第9或第11步修改选择时，item 候选会被删除（`main/novel-import.ts:1126,1135`），所以不存在 `taken` 过期的问题。

## 6. `wizardRosterFound`（`core/novel-import.ts:405-408`）

- 对 item 使用同一个计票判定可以做到，但需要在 `novel-import-wizard.ts` 导出一个公共判定，供 core 和 roster 共用。
- 这个计数不会和最终清单完全一致。现在它就不经过 `keepWizardItem`（≥3 章或重要），也不经过 `taken` 和资料来源合并。“避免不一致”应改写为“排除被判非物品的组，计数仍是上限”，并加一条用例。另外要注意：有资料来源的组在运行中计数里会被排除，最终清单里却会保留。

## 7. 测试计划缺口

第 4 节需要按 2R 重写，至少包括以下用例：

- 计票：
  - 1:1 平票时排除；2:1（item 多）时保留；全未知时保留。
  - 只有 1 票 other、其余未知时排除，并把这条写明为预期行为。
  - 判为 character 的条目的 `important` 和 `itemType` 不生效。
  - 别名合并后票型混合。
  - 有资料来源的组被判非物品后仍保留。
- schema：
  - category 缺省时允许，非法值拒绝，`null` 的处理。
  - 暂存带 category 能通过 `validateImportWizardState`，旧暂存不带 category 也能通过，暂存里的非法 category 被拒绝。
  - 生成的候选不含计票字段，并能通过保存校验。
- 中途恢复：旧批次没有 category，新批次带 category，两者混合计票。
- `taken`：
  - 未勾选角色不参与比对。
  - `sceneExcluded`、unresolved、`authorKept` 三类场景。
  - 角色或场景步骤被跳过。
  - 角色称号别名与物品同名。
  - 物品别名等于人名（对应问题 D）。
  - 有资料来源的物品豁免。
- `rosterFound`：item 计数排除被判非物品的组。
- 真实目标验证：照 2R 执行（《诡秘之主》第一卷《小丑》），记录 category 缺省比例和失败批次数。

## 结论：需修订

1. 第 4 节按 2R 重写，删除“schema 拒绝缺失 category”和“返回项不含 category”这两条已被推翻的用例，并补入第 7 节列出的用例。
2. `mergeWizardRoster` 中 `itemType` 也只取 category 为 item 或未知的条目，加用例。
3. 写明计票字段不能经 `...rest` 进入候选（`core/novel-import-wizard-roster.ts:62` 与 `core/novel-import-wizard-state.ts:44` 的 strict 候选 schema），加一条保存校验用例。
4. 明确非法 category（含 `null`）的处理：建议把 `null` 视为未知；其余非法值持续失败导致整步失败的风险，要写明为已接受。
5. `taken` 比对只用物品组自身的名称，不用物品别名，或在方案里写明取舍和对应风险。同时写明 `authorKept` 场景的取舍。
6. 改写 `wizardRosterFound` 的一致性表述，说明计数是排除非物品组后的上限，并加用例。
7. 风险一节补两条：别名合并后票型混合；新草稿被旧版本打开时会被跳过。
