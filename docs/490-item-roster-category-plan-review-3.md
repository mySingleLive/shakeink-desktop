# 490 方案第三轮独立审核

我对照源码核对了 `docs/490-item-roster-category-plan.md` 的 2R2 节和重写后的第 3、4 节，没有修改任何文件。

## 1. 第二轮 7 项必改的落实情况

| # | 第二轮要求 | 结论 | 依据 |
|---|---|---|---|
| 1 | 第 4 节按 2R 重写，删除已被推翻的两条用例 | 已解决 | 第 4 节（plan:74-92）不再含“schema 拒绝缺失 category”和“返回项不含 category”。第二轮第 7 节列出的用例都已落入 plan:77-88。 |
| 2 | `itemType` 与 `important` 同源 | 已解决 | 规则见 2R2-1（plan:56），用例见 plan:77。现有写法 `g.itemType??=e.itemType` 在 `core/novel-import-wizard.ts:109`，加一个 category 判断即可。 |
| 3 | 计票字段不进候选 | 已解决 | 2R2-2（plan:57）写明在解构时剥离。剥离位置对应 `core/novel-import-wizard-roster.ts:53`，strict 候选 schema 的行号 `core/novel-import-wizard-state.ts:43` 引用正确。保存校验用例见 plan:78。 |
| 4 | `null` 与非法值 | 已解决 | 2R2-3（plan:58）沿用 scene `parent` 的 `.nullable().optional()` 加 transform 写法（`service/novel-import-ai.ts:366`），可以照搬到 `:367` 的 item schema。风险已在 plan:69 写明接受。 |
| 5 | `taken` 只比对 primaries，并写明 `authorKept` 的取舍 | 已解决 | 规则见 2R2-4（plan:59），用例见 plan:81。“已勾选且非 unresolved”的规则与源码一致：`sceneExcluded` 的场景只有在 `authorKept` 中才会被勾选（`core/novel-import-scene-identity.ts:11`，`main/novel-import.ts:1181`）。 |
| 6 | 改写 `wizardRosterFound` 的一致性表述 | 已解决 | 2R2-5（plan:60）改为“计数是上限”。用例见 plan:82。调用点在 `core/novel-import.ts:407`，只用 `.length`。 |
| 7 | 风险一节补两条 | 已解决 | 见 plan:70-71。 |

## 2. 2R2-4：在 `mergeWizardRoster` 内取得 primaries

可以做到，而且不影响现有输出。

- 组内已有 `primaries: Map<规范化本名, …>`（`core/novel-import-wizard.ts:101,107`），只是没有放进返回值。
- 有两种拿到 primaries 的办法，结果相同：
  - **返回内部集合。** `mergeWizardRoster` 多返回一个 `primaries:Set<string>`（取 `g.primaries.keys()`）。
  - **在 `buildWizardCandidates` 里重算。** 取规范化本名落在 `c.names` 中的条目。`c.names` 会排除其他组的本名（`:106` 的 `own.has(m)&&find(m)!==id` 跳过），所以落入 `c.names` 的本名都属于本组，与 `g.primaries` 的键集合完全相同。
- 对现有输出的影响：
  - 返回值多一个字段不影响现有调用方。`rosterFound` 只用 `.length`（`core/novel-import.ts:407`）。现有测试只用 `.find`、`.names`、`.aliases`、`.roleType`，没有对整个对象做 `deepEqual`（`tests/unit/novel-import-wizard.test.ts:83-112`，`tests/unit/novel-import-scene-identity.test.ts:18`）。
  - 角色和场景也调用 `mergeWizardRoster`。它们走 `buildWizardCandidates` 时额外字段同样被剥离，场景一侧的 `buildSceneWizardCandidates` 不调用 `mergeWizardRoster`。
- 资料来源条目也会进入 `mergeWizardRoster`（`core/novel-import-wizard-roster.ts:45`），所以它们的名称也算 primaries。这类组按规则豁免，不受影响。
- `buildWizardCandidates` 只在 `main/novel-import.ts:597` 调用一次，加可选参数 `taken` 只需改这一处。

## 3. 新矛盾与源码不符

没有发现会导致实现错误的新矛盾。2.1、2.2 中被覆盖的旧说法（plan:19-20,25-26）都按 2R2 > 2R > 2.x 的优先级处理，2R2-4 也明确覆盖了 2R-2 的“非 sceneExcluded”。

以下三点不阻塞，建议顺手写明：

1. **使用 primaries 时写明数据怎么传。** 如果选择返回 primaries 集合，它也必须和 `itemVotes`、`otherVotes` 一起剥离。2R2-2 只列了后两个字段。plan:78 的“整份状态通过 `validateImportWizardState`”用例能拦下这个遗漏，但写明可以少一次返工。另外，“任一 primary 在 taken 中即排除”是沿用 2.2 的“任一”，2R2-4 没有重述，建议补一句。
2. **防止 plan:77 的两条用例空测。** “判为 character 的条目的 `important:true`、`itemType` 不生效”这条用例，必须构造物品票占多数的组。例如 item 2 票、`important:false`、出场少于 3 章，加 character 1 票、`important:true`、`itemType:'角色'`，且 character 条目排在最前。如果用 character 占多数的组，该组会先被计票规则排除，测不到 2R2-1 的规则。
3. **plan:81 的“物品别名等于人名时不排除”。** fixture 里人名要作为物品条目的别名出现，而不是另一个物品条目的本名。否则这个名字会成为该物品组的 primary，用例结论就反了。

## 结论：通过

没有必须修改的项。第 3 节的三点建议在实现或写测试时落实即可。
