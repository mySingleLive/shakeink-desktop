# 492 · 识别物品类别修复独立 code review

**范围**：只审了指定的未提交改动。`desktop/main/novel-import.ts` 只看了 :33、:576、:598 三处；其中 :1033 的 `picked` 改动属于他人，未审。

**验证**：
- Node 24 下跑了 `tests/unit/novel-import-item-category.test.ts`、`novel-import-roster-ai.test.ts`、`novel-import-wizard-prompt.test.ts`，共 34 项，全部通过。
- `npx tsc --noEmit` 退出码为 0。
- 仓库没有 `eslint.config.*`，lint 无法运行，因此没有 lint 结果。

## 对照 2R2 逐项核对（全部符合）

- **计票**：`desktop/core/novel-import-wizard.ts:115-116`。category 为 item 时 `itemVotes++`，为其余五类时 `otherVotes++`，缺省不计票。
- **判定**：`novel-import-wizard.ts:135`，即 `otherVotes>0&&otherVotes>=itemVotes`。平票排除，全为未知时保留。A9 判定表与之一致。
- **itemType 与 important 同源（2R2-1）**：`novel-import-wizard.ts:116`，只取 category 为 item 或缺省的条目。`parent` 仍取首个条目，与旧行为相同。
- **内部字段剥离（2R2-2/7）**：`desktop/core/novel-import-wizard-roster.ts:56`，`names`、`primaries`、`itemVotes`、`otherVotes`、`important` 都被剥离。A8、E2 断言草稿 schema 通过。
- **taken 只比物品自身名称（2R2-4）**：`novel-import-wizard-roster.ts:54` 用 `c.primaries`，它取自 `g.primaries` 的键，已规范化，与 taken 的规范化方式一致。
- **taken 的构造**：`novel-import-wizard.ts:138-141`。取已勾选的角色，以及已勾选且非 unresolved 的场景，名称加别名。作者重新勾选的 `sceneExcluded` 场景也计入，符合 2R2-4。
- **资料来源豁免**：`novel-import-wizard-roster.ts:54` 的 `!hits.length` 条件同时作用于计票和 taken 两条排除规则。资料来源条目进入合并时不带 category，不参与计票。
- **null 处理（2R2-3）**：`desktop/service/novel-import-ai.ts:368`，`.nullable().optional()` 加 transform 去掉该键，写法与 scene `parent` 相同。F2/F3/F4 覆盖了缺省、null、非法值。
- **运行中计数**：`desktop/core/novel-import.ts:407` 只对 item 过滤，其它类别不变。
- **暂存**：`main/novel-import.ts:576` 复制 category；`desktop/core/novel-import-wizard-state.ts:33,65` 中 category 为可选，旧草稿仍合法。
- **主进程调用点**：`main/novel-import.ts:598`。`buildWizardCandidates` 全仓只有这一处调用，`revise` 和 `wizard-redetect` 都经过这里，没有遗漏的调用点。

## 非物品类别没有回归

- character、scene、world 的 strict schema 不接受 category（F5 验证了 character）。因此对这三类，`!e.category` 恒为真，itemType、important、parent 的合并结果与旧版相同，票数恒为 0。
- 计票过滤和 taken 都只在 `kind==='item'` 时生效。
- `buildWorlds` 不调用 `mergeWizardRoster`，不受影响。
- G2 用 sha256 证明 character、scene、world 三份提示与 `b26975f` 逐字相同。

## 类型与 zod

- item schema 加了 `.transform` 后变成 `ZodPipe`。`service/novel-import-ai.ts:451` 的 `z.array(entry)` 在 zod 4 中接受 pipe，而且 scene 已有同样的写法，tsc 也通过。
- 校验失败时 issue 路径仍是 `['roster',i,'category']`。该文件里按路径改写报错文案的逻辑只针对 scene roster 和 context.label，item 不经过这些逻辑，现有的报错标签路径不受影响。
- `locatedRoster` 用 `{...entry}` 原样保留 category，RA-07 验证了这一点。

## 发现（按严重度排序）

**中**
1. **台账没有 NI-10**：`docs/requirements-traceability.json` 未修改。方案 §2R-4 和用例 H1b 都要求新增 NI-10，并且 AGENTS.md 规定该文件是验收台账。如果这一项是安排在实现之后的验收阶段补，请确认已列入后续步骤。
2. **提示词对“魔药”这类泛称没有约束**：`desktop/core/novel-import-ai-payload.ts:136`。用户截图要求“魔药”不进清单，但提示把“药剂”列在 item 示例里，又没有说明“类名或泛称不算具体物件”，模型可能仍把“魔药”判为 item。同理，“神祇及其他有意识个体为character”可能让模型把有意识的封印物判成 character。措辞与方案 2.1 完全一致，不属于实现偏差，但需要在 H2 真实验证中重点核对这两点。可以考虑补一句“物品的泛称或类名（如单独的“魔药”）为concept”。

**低**
3. **重复 import**：`main/novel-import.ts:33` 单独写了 `import {itemRosterTaken} from '../core/novel-import-wizard'`，而 :29 已经从同一模块导入。按文件的紧凑风格，应并入 :29。
4. **类别枚举重复定义 5 处**：`ITEM_ROSTER_CATEGORIES`（`novel-import-wizard.ts:81`）导出后实际只被用作类型。同一组字面量另外在 `novel-import-semantics.ts:40`、`novel-import-wizard-state.ts:33` 与 `:65`、`service/novel-import-ai.ts:368` 各写了一遍。方案 2R-1 写的是 `z.enum(ITEM_ROSTER_CATEGORIES)`，至少两处 zod schema 可以改为引用该常量，避免以后改一处漏一处。
5. **提示句式略绕**：“category必填：物品指……具体物件（……），为item；” 中“为item”离主语太远。建议改为“……具体物件为item”。WP-04 禁用的 `evidence`、`quote`、`逐字` 都没有出现在新文案中。

## 结论：通过

代码完整实现了 2R2，非物品类别行为不变，类型安全，目标测试全部通过。以下是建议，不阻塞合并：
1. 在验收阶段补上台账 NI-10。
2. H2 真实验证时重点核对“魔药”和有意识封印物的分类，必要时补一句泛称说明。
3. 把 `main/novel-import.ts:33` 的 import 并入 :29。
4. 让 zod 的 category 枚举引用 `ITEM_ROSTER_CATEGORIES`。
5. 微调提示句式“具体物件为item”。
