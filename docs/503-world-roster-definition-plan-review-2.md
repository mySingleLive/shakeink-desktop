# 503 方案独立审核（第二轮）

审核对象：`docs/503-world-roster-definition-plan.md` 第 2R 节，对照当前工作区源码。工作区里 `desktop/core/novel-import-ai-payload.ts` 已有未提交修改，`tests/unit/novel-import-world-roster.test.ts`、`docs/504-world-roster-definition-cases.md` 是新增文件。

## 结论：需修订（小幅）

第一轮的 10 条都有了对应处理。阻断项（主世界条目被 `locatedRoster` 丢弃）由 2R-2 的设定名回退解决，固定主世界 id 解决了勾选丢失，断环、只用角色名的 `worldRosterTaken`、旧草稿说明也都到位。剩下 2 处规则缺口会让国家名、组织名重新出现在主世界的名称或别名里，另有 1 处资料世界合并规则有歧义、1 处文档前后矛盾。改完这些即可进入实现，不需要第三轮整体审核。

## 1. 已确认解决

- 第一轮第 1、2 条：2R-2 只改 world 条目的定位，其它类别不变。`locatedRoster`（`desktop/service/novel-import-ai.ts:956-960`）按设定名命中后，主世界就有了 `evidenceUnitIds`。`importEntity` 按 `cited` 取正文（`desktop/main/novel-import.ts:1030`），名为“主世界”的主世界可以导入。用例 WR-S01、WR-M02 覆盖了这两点。
- 第 3 条：`WIZARD_MAIN_WORLD_ID` 已加 `'main'` scope（`desktop/core/novel-import-wizard.ts:147`），与按名称派生的 `wizardCandidateId('world','主世界')` 不同，测试已断言（`tests/unit/novel-import-world-roster.test.ts:132`）。
- 第 9 条：旧草稿必须“返回修改选择”后重新识别才生效，这与 `coverage['roster:world']` 只在 `desktop/main/novel-import.ts:1135` 清除的行为一致。
- 第 10 条：fixture 里的 北城世界 没有 parent，按新规则成为主世界，名称不变。南巷梦境 的 parent 能解析到 北城世界。`NIW-C26/C28`、`NIW-C27`（`tests/unit/novel-import-wizard-session.test.ts:242,258`）和浏览器用例（`tests/browser/novel-import-wizard.test.ts:154`）都按名称查找，id 变化不影响它们。
- 物品清单提示（`desktop/core/novel-import-ai-payload.ts:137`）已删除“封印物”“途径、序列”。`desktop/core`、`desktop/service`、`desktop/shared` 里已经找不到黑名单词。IC-04 的物品基线（`tests/unit/novel-import-item-profile.test.ts:51`）是非清单请求，不经过 `rosterContract`（`novel-import-ai-payload.ts:143`），哈希不会变。

## 2. 问题

1. **从子世界降回主世界的条目，名称仍会进入主世界的名称或别名。** 2R-4 第 1 项写明，与角色同名的条目“名称和别名都不进入主世界名称或别名”。第 2 项（有 parent 但与某设定同名）没有这句话。按第 4 项“主世界条目名称中出现次数最多者”，被降回的国家名、组织名会参与主世界命名，至少会成为别名。后果有两个。一是它们进入 `importEntity` 的 `names`（`desktop/main/novel-import.ts:1029`），按国家名去拉正文。二是主世界的 `chapterCount` 被这些名称撑大（`desktop/core/novel-import-wizard.ts:131-134`）。第 2 项也要写明“名称和别名不参与主世界命名”。WR-B04 要断言这一点。
2. **没有 parent 却用国家名、纪元名作 name 的条目，仍会成为主世界的名称或别名。** 这正是截图里的情况。模型即使拿到新契约，也可能继续这样作答。WR-B01 的输入本身就是“国名、纪元名、概念名各自为 name”。按 2R-4 第 4 项，出现最多的国名会成为主世界名称，其余国名、纪元名都进入别名。层级是修好了，但界面上主世界会显示成某个国家的名字。建议在命名上再加一条：任一条目的任一设定同名的名称，不参与主世界命名，也不进入主世界别名，与第 1 条使用同一个判定函数。WR-B01、WR-B02 应断言：输入里国名、纪元名同时以设定形式出现时，主世界名称是“主世界”或原文对整个世界的称呼。
3. **2R-5 的资料世界合并有歧义。**
   - “用资料世界的 id”有两种可能。资料拆分时的 id 带文件名 scope（`desktop/core/novel-import-wizard.ts:193,195`）。建清单时的候选 id 只按名称派生，不带 scope（`desktop/core/novel-import-wizard-roster.ts:66`）。方案要指明用后者，也就是候选 id。
   - 多个资料文件各自只有一个中性容器“世界”时，它们会按名称合并成同一个候选（`novel-import-wizard-roster.ts:66` 按名称作键），这时应算作“一个顶层世界”。如果按文件计数，它们会被算成多个，方案要写清楚按哪种算。
   - 正文没有主世界条目、资料只有一个顶层世界时，子世界的 parent 无法解析，应该挂到这个资料世界下，还是成为顶层，方案没有写。按“它就是主世界”处理最一致。
   - 合并后名称换成正文主世界名称时，要把“世界”保留为别名。`wizardCandidateBlock` 按名称或别名查找资料里的世界块（`desktop/main/novel-import.ts:103-106`）。名称改了又不留别名，世界块会查找失败，回落为整份资料文本。设定的查找也依赖 parent 名称与资料世界同名，否则只能在资料仅有一个世界时侥幸命中（同文件 :105-106）。
4. **第 3 节的验证清单与 2R 矛盾。** `docs/503-world-roster-definition-plan.md:76` 仍写“schema 接受/拒绝 relation”“物品清单提示哈希不变”。按 2R-1，字段应为 `parallel`；按 2R-8/2R-9，物品清单提示哈希会变，需要另立基线。请改成与 2R 一致。
5. **parent 投票要先解析成世界 id 再计票。** 2R-4 第 5 项按 parent 字符串计票。同一个世界的不同叫法（主世界的别名、“主世界”）会把票分散，结果可能挂到少数票指向的世界下。应先把每批的 parent 解析成目标世界 id，再按 id 计票。复用 `sceneParentCycleIds` 时要注意，它要求所有 parentId 都在列表里，否则直接抛错（`desktop/core/novel-import-wizard-roster.ts:10-11`）。所以要先解析和清理 parent，只把 world 节点传进去，最后再判环。
6. **设定 id 改为由 `owner.id` 派生，会改变现有资料世界设定的 id。** 现在设定 id 由 `owner.name+'\0'+name` 派生（`novel-import-wizard-roster.ts:67`），改了以后资料来源的设定 id 也会变。已经停在第 15 步的旧草稿重新识别后，资料设定的勾选会恢复默认，因为 `runRoster` 按 id 恢复勾选（`desktop/main/novel-import.ts:599`）。这只发生一次，可以接受，但请在 2R-6 里写明。

## 3. 作品专有词（范围外，供主代理决定）

- 本方案和导入提示已经干净。黑名单测试（`tests/unit/novel-import-world-roster.test.ts:29-31`）只覆盖 4 类实体的清单和 entity 提示，classify、review、reconcile、场景整理等其它导入提示没有覆盖。建议把同一份黑名单扩展到所有导入提示，例如复用 B7 的 cases（`tests/unit/novel-import-scene-cleanup-core.test.ts:94-99`）。
- 导入以外的提示里还有具体作品的设定，同样违反这条约束。`src/lib/ai/chat.ts:22` 的示例写着 `@[设定·序列阶梯/cmxxxx·序列九·假面学徒]`。`src/lib/ai/tools.ts:121,127,759` 用“途径名”描述多体系等级的路线，这个属于通用字段说明，问题较轻。这两处来自复用的 Web 代码，建议另开一项处理，本方案不必一并修改。
