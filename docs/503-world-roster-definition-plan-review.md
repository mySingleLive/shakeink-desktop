# 503 方案独立审核（第一轮）

审核对象：`docs/503-world-roster-definition-plan.md`。

## 结论：需修订

根因判断正确，主方向（契约给出世界定义，本地把 main 条目合并为一个主世界）可以修好截图里“国家、纪元、人物、概念成为顶层世界”的问题。但方案里有一处会让主世界整批丢失：模型按“原文未称呼时用主世界”作答，这类条目会被现有定位逻辑丢弃。另有几处会让症状以子世界的形式复现，或者让树结构死循环。修订后再进入测试用例阶段。

## 1. 根因核对

- 属实：`desktop/core/novel-import-ai-payload.ts:138` 的 world 契约只有字段形状和 settingType 取值，没有定义什么算世界。
- 属实：`desktop/core/novel-import-wizard-roster.ts:70` 每个 `e.name` 都调用 `world()` 建候选。设定的去重键是 `owner.id+名称`（同文件 :67），所以同一设定会在每个“世界”下各出现一次。
- 补充：同文件 :66 的 `parent` 取最先出现的一批（`if(parent&&!w.parentId)`），:71 只排除了自己指向自己。方案给 sub 加了更多用法，这两处要一起处理（见第 5 条）。

## 2. 问题

1. **“主世界”这个名称会让条目整条被丢弃（阻断）。** 世界清单的公共契约要求“不引用原文、不附证据”（`novel-import-ai-payload.ts:140`）。没有 evidence 时，`locatedRoster` 只在本批原文里查找 `name`/`aliases`，查不到就丢弃整条（`desktop/service/novel-import-ai.ts:956-960`）。原文里一般没有“主世界”三个字，所以按 2.1 写法作答的 main 条目会连同全部 settings 一起丢失。只要原文没有对整个世界的称呼，修复后的清单就会是空的。world 条目需要另一条定位规则，例如在 settings 名称中查找，或者 main 条目回落到本批第一个单元。还要补一条经过 `runImportAi` 的单测，因为 fixture 绕过了服务层（`tests/helpers/novel-import-wizard-fixture.ts:151`）。
2. **主世界导入会因为找不到正文而失败。** `importEntity` 只靠 `evidenceUnitIds` 和名称命中来找正文（`desktop/main/novel-import.ts:1029-1033`），找不到就报错“正文中没有找到该项内容”。主世界名称为“主世界”时，只有第 1 条修好、`cite` 记下了引用单元才能导入。方案要写明这个依赖，并加一条测试：名称为“主世界”的主世界能导入。
3. **主世界的 id 跟着票选名称变化。** `wizardCandidateId('world',name)`（`desktop/core/novel-import-wizard.ts:87-89`）由名称派生，设定 id 又由 `owner.name+设定名` 派生（`novel-import-wizard-roster.ts:67`）。在部分批次失败后重试的过程中，多数票一变，主世界和它下面全部设定的 id 都会变。`runRoster` 按 id 恢复之前的勾选（`desktop/main/novel-import.ts:599`），id 变了，勾选就丢了。建议主世界使用固定 id，例如加 scope 的固定键，设定 id 改用 `owner.id` 派生。如果保留按名称派生，要在方案里写明这个代价。
4. **sub 可能让截图症状以子世界的形式复现。** 模型很可能把国家、区域标成 `sub`、parent 填主世界。按 2.3 第 4 条，这些条目会变成主世界下的一排子世界，导入时每个都单独建 WORLD。建议加一条本地防线：sub 名称与任一世界的设定同名，或者与已选角色或地点同名时，按设定（或 main）处理。E2E 通过条件只要求“顶层 ≤2”，查不出这种情况。应改为：主世界 1 个；子世界和平行世界逐个人工核对确为原文明确存在；同名设定不重复。
5. **世界 parent 成环会导致无限递归。** sub 之间互相填 parent（A→B、B→A）时，:71 只排除自环，环会保留下来。`leaves()` 会无限递归，包括 core（`novel-import-wizard.ts:145-148`）和 UI（`src/components/desktop/NovelImportWizard.tsx:138`）。场景清单已经有 `sceneParentCycleIds`（`novel-import-wizard-roster.ts:9`），世界也要断环，例如环上节点挂到主世界下，并补测试。parent 也应改为投票或按出现次数取多数，代替先到先得。
6. **parent 解析与别名上限冲突。** 方案写“parent 能解析到主世界的任一名称或别名”，但主世界的 `aliases` 截断在 `WIZARD_ALIAS_LIMIT=50`（`novel-import-wizard.ts:93`），候选 schema 也限制为 50 个（`desktop/core/novel-import-wizard-state.ts:43`）。解析要用未截断的名称集合，与 `mergeWizardRoster` 的 `names` 做法一致（`novel-import-wizard.ts:95-96`）。`parent` 填“主世界”、或者填的名称在本地已改判为 main 时，都应解析到主世界。`parallel` 条目与主世界任一名称相同时，应并入主世界。
7. **与人物同名的条目还会把人名带进主世界别名。** 2.3 第 2 条只写了“不参与主世界命名”。这类名称和条目自带的 aliases 也不能进入主世界 aliases。否则 `wizardChapterCount` 和 `importEntity` 的 `names`（`desktop/main/novel-import.ts:1029`）会按人名去找正文。另外，`taken` 的来源要写清楚：`itemRosterTaken`（`novel-import-wizard.ts:137-140`）同时包含已选地点。如果复用它，与地点同名的子世界会被并入主世界。建议新增一个只含角色的函数，或者在方案里说明地点也算进去。现在 `buildWizardCandidates` 的 world 分支不接收 `taken`（`novel-import-wizard-roster.ts:45`），主进程也只在 item 时传入（`desktop/main/novel-import.ts:599`），两处都要改。
8. **资料世界与主世界的合并规则不完整。** 资料文件没有一级标题时，`splitWizardSourceWorlds` 会生成一个名为“世界”的中性容器（`novel-import-wizard.ts:186`）。它与正文主世界（“主世界”或原文名称）不同名，界面上仍会出现两个顶层世界。建议：资料里只有中性容器时，并入正文主世界；资料里只有一个顶层世界、且正文没有可用名称时，主世界采用资料世界的名称。
9. **旧草稿不会自动修正。** 草稿 schema 加可选 `relation` 后旧草稿可以读取，这一点成立。但已经停在第 15 步的旧草稿已有 `w.candidates.world`，暂存在建清单后就被删除（`desktop/main/novel-import.ts:604`）。识别过的单元记在 `coverage['roster:world']` 里，只有“返回修改选择”会清掉（同文件 :1135）。所以旧草稿必须返回修改选择后重新识别才能生效，方案要写明，与 490 审核指出的问题同类。
10. **空清单和缺字段的情况。** 没有 main、只有 sub 时会建一个空的“主世界”。它有子节点，可以勾选，但自身没有设定和引用单元，导入可能踩第 2 条。要定义这种情况的行为：不建主世界、子世界升为顶层，或者引用单元取自子条目。`relation` 缺省、只有 parent 时按 sub 处理，与现有 fixture 一致（`tests/helpers/novel-import-wizard-fixture.ts:152`：南巷梦境挂在北城世界下），既有会话测试 `tests/unit/novel-import-wizard-session.test.ts:246-266` 应该不变。方案应把这条测试列为兼容性验收项。

## 3. 作品专有词

- 方案拟写入提示词的内容只有通用说法，没有作品专有词。第 1 节和 E2E 里的人名只出现在文档中，可以接受。“不出现截图中的词”这条测试应作为黑名单留在测试文件里，不进入源码规则。
- 范围外但相关：现有 item 契约（`novel-import-ai-payload.ts:137`）含“封印物”、“途径、序列”，测试也把它们固定成必含字段（`tests/unit/novel-import-wizard-prompt.test.ts:13`）。这几个词属于某一部具体作品的专有设定，违反同一条硬约束。建议另开一项处理，本方案不必一并修改。

## 4. 测试与验证

- 哈希基线测试 `tests/unit/novel-import-wizard-prompt.test.ts:35` 把 character、scene、world 三项写在一起，测试名是“byte-identical”。更新时要把 world 移出这项断言，单独记新基线，并注明来源提交。
- 需补的单测：第 1 条（经服务层）、第 3 条（重试后勾选保留）、第 4 条（sub 与设定同名）、第 5 条（成环）、第 6 条（parent 填“主世界”、填非胜出名、超过 50 个别名）、第 7 条（人名不进入别名）、第 8 条（中性容器合并）、第 10 条（只有 sub）。
- E2E 通过条件按第 4 条修改，并增加两项：主世界导入成功，主世界下设定不重复。

## 5. 更简单的做法

可以不加 `relation`：没有 parent 的条目一律视为 main，平行世界改用一个可选的布尔字段 `parallel`。这样合法取值更少，模型出错的余地更小。sub 的判断照旧使用 parent。效果与方案相同，但 schema、暂存和草稿 schema 改动更少。是否采用由主代理决定。第 1、3、5 条无论采用哪种做法都要处理。
