# 491 用例独立审核（第一轮）

**结论：需修订。** 计票规则、A5 的算术、taken 规则和服务层用例都与方案和代码一致。有四个用例在当前代码下写错或建不出来：A7、D1、E1、E2。另有两个前置条件缺失（A6/C4）和两处小缺口（G1、台账）。

## 一、正确性问题

**1. A7 会空过**（`docs/491-…-cases.md:19`）
- 合组成立。`own` 中“青铜钥匙”为 1、“钥匙”为 2；链接计数为 3，满足 `3*2>=min(1,2)`，见 `novel-import-wizard.ts:97-100`。合并后票型 item 1 : other 2，判定排除。
- 但三条条目都用 `it()` 默认的 `important:false`，用例也没定章数。按 `keepWizardItem`（`novel-import-wizard.ts:124`），改动前这一组同样被排除，断言实现前后都成立。
- 需要给 item 条目加 `important:true`，或出场 ≥3 章。还应断言 `mergeWizardRoster` 只返回 1 组，且 `itemVotes=1`、`otherVotes=2`，证明确实合并了。

**2. A5 成立**（`:17`）
- 第一组：两条 item 都是 `important:false`，出场 1 章，改动后被 `keepWizardItem` 排除。改动前 `important||=` 吃到 character 那条的 true（`:109`），所以保留，确为 RED。
- 第二组：`itemType` 取第一条 item 条目的值，结果为“圣物”。改动前 `??=` 取到排最前的“角色”，能区分新旧行为。
- 无需修改。

**3. A6、C4 缺资料块前置条件**（`:18`、`:32`）
- `buildWizardCandidates` 会用 `headingOnly` 过滤只有标题、下面没有正文的块（`novel-import-wizard-roster.ts:41,44`）。
- 用例只写了“`# 灯神` 标题块”。如果标题下没有正文，资料来源就不存在，A6 会失败；C4 也因此测不到豁免。
- 需要写明：标题下有非空正文，且 artifact 的 `kind:'item'`。

**4. D1 按现写法建不出来**（`:45`）
- `wizardView` 不返回 `rosterFound`。`rosterFound` 来自未导出的 `wizardRosterFound`，只在 `toImportView` 里拼进去（`core/novel-import.ts:394,405-407`）。
- 它还要求 `w.step==='detect-item'` 且 `stepState['detect-item']==='running'`，否则返回 `{}`。
- 需要改为对完整 `ImportSession` 调用 `toImportView(session).wizard.rosterFound`，并写明 step 和 running 状态。预期值“1，改动前 2”正确。

**5. E1 的驱动方式不完整**（`:49`）
- fixture 的 `ai` 直接把结果交给控制器，不经过 `runImportAi`（`fixture.ts:39`），所以 `locatedRoster` 不会生效。控制器暂存时直接取 `e.evidence.unitId`（`main/novel-import.ts:575`）。覆盖 `'roster:item'` 时，每条都要自带 `evidence:{unitId,quote}`，并照 `rosterAi` 的 `hits()` 写法只为文本中真有该名称的单元生成条目（`fixture.ts:94-97`）。
- fixture 资料里没有 `# 物品`，所以 `selected` 不能含 `item`（`main/novel-import.ts:441` 会抛错）。应写成 `selected:['body','character']`、`targets:['character','item']`，并直接调用 `select`，不能用 `toTree` 默认的 `v.targets`。
- 第13步之前要先过第10步“导入角色”。兜底 AI 对 entity 请求返回 `{notFound:true}`，会让任务失败，`toStep` 随即抛错（`fixture.ts:37,163`）。需要包一层 `relatingAi`，或用 `entityResult` 处理 entity 请求。
- “沈砚”就是已选角色名，taken 本身就会排除它，所以它不能证明“因类别排除”。真正能证明主进程把 category 拷进暂存的是“北城”：它在每章都出现，只能靠 place 票排除。用例文字应据此改，不要把沈砚归为类别排除。

**6. E2 的“重开后可加载”建不出来**（`:50`）
- 未保存的草稿在 `initialize` 时直接删除（`main/novel-import.ts:376-377`），重开后什么也加载不到。
- 另外，按现写法检查时暂存已经删除（`:602`），带 category 的暂存从未经过 journal 校验。
- 需要改为按 `injectJournalEdit` 的方式（`fixture.ts:186-193`）：在第13步写入带 category 的 `rosterStash.item`，确认 `validJournal` 接受，然后在原地接管草稿。原有的“暂存已删、候选无计票字段”断言保留。

**7. A8 的状态来源应写清**（`:20`）
- core 单元测试不该依赖控制器 fixture 生成状态。应写明用 `emptyWizardState()`（`novel-import-wizard-state.ts:35`），加上 `candidates.item`，再以 `{wizardVersion:1,wizard}` 调用 `validateImportWizardState`。

## 二、覆盖缺口

**8. G1 有一项断言空过**（`:62`）
- 我实测了当前 item 清单的 phase-output-contract：已经含 `item`（来自 `itemType`），不含 `character`/`concept`。单独断言 `item` 出现是空过。
- 应断言完整枚举串，例如 `"item"|"character"|"place"|"organization"|"concept"|"other"`。

**9. 缺台账用例**
- 方案 2R-4 和第4节要求新增 `docs/requirements-traceability.json` 的 NI-10，H 节没有对应用例或核对项。

其余部分与方案一致，可以照写：A1–A4、A9、B1、B2（old 无类别、后两条 character 时为 other 2 : item 0）、C1–C3、C5–C8、F1–F5、G2、G3、H2。

## 需修订
1. A7：item 条目加 `important:true` 或出场 ≥3 章，并断言合并为 1 组且 `itemVotes=1`、`otherVotes=2`。
2. A6、C4：写明资料标题块下有非空正文，artifact 为 `kind:'item'`。
3. D1：改为 `toImportView(session).wizard.rosterFound`，状态为 `step:'detect-item'` 且 running。
4. E1：每条自带 evidence，名称取自单元文本；`select` 用 `selected:['body','character']`、`targets:['character','item']`；包 entity 处理器以通过第10步；把类别排除的证据改为“北城”。
5. E2：去掉“重开 controller”，改用 `injectJournalEdit` 注入带 category 的暂存并校验 `validJournal`。
6. A8：明确用 `emptyWizardState()` 构造合法状态。
7. G1：断言完整的六值枚举串，不单独检查 `item`。
8. H 节：增加 NI-10 台账更新的核对项。
