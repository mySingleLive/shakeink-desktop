# 491 · 识别物品类别修复用例

状态：第二轮用例审核通过（`491-…-cases-review-2.md`），其建议已并入 E1。依据：490 方案（2R2 > 2R > 2.1–2.3），三轮审核见 `490-…-plan-review*.md`。

通用约定：
- 只用合成名称（沈砚、林舟、北城、南巷、青铜钥匙、圣徽、灯神、序列甲等），不用小说原文。
- 标“RED”的用例在实现前运行并确认失败，记录失败断言。
- core 用例直接调用 `mergeWizardRoster`、`buildWizardCandidates`、`wizardItemRejected`；服务层用例走 `runImportAi`（同 `novel-import-roster-ai.test.ts` 的 `run`）；控制器用例用 `tests/helpers/novel-import-wizard-fixture.ts` 的 `fixture`/`toTree`/`toStep`。
- 条目写法：`it(name,category?,extra?)` 生成 `{name,aliases:[],itemType:'信物',important:false,...}`，category 缺省时不带该键。章节为 `[{content}]` 合成数组，出场章数按需控制。

## A. 计票（core，`tests/unit/novel-import-item-category.test.ts`）

- **A1（RED）平票排除**：`[it('灯神','item',{important:true}),it('灯神','character')]` → `buildWizardCandidates('item',…)` 结果不含“灯神”。
- **A2 物品多数保留**：`[it('青铜钥匙','item',{important:true}),it('青铜钥匙','item'),it('青铜钥匙','concept')]` → 含“青铜钥匙”。
- **A3 全未知保留**：两条无 category、`important:true` → 保留（现状行为）。
- **A4（RED）一票非物品其余未知即排除**：`[it('序列甲','concept'),it('序列甲'),it('序列甲',undefined,{important:true})]`，出场 5 章 → 排除。
- **A5（RED）非物品批的 important/itemType 不生效**：顺序 `[it('圣徽','character',{important:true,itemType:'角色'}),it('圣徽','item',{itemType:''}),it('圣徽','item',{itemType:''})]`，出场 1 章（<3） → 物品票 2:1 不被计票排除，但无有效 important 且章数不足，被 `keepWizardItem` 排除。另一组把第二条改为 `itemType:'圣物'`、`important:true` → 保留，且 `itemType==='圣物'`（不是“角色”）。
- **A6 资料来源豁免**：`sources` 含一个 `kind:'item'` 的资料 artifact，文本为 `# 灯神\n\n一盏古灯。\n`（标题下须有非空正文，否则被 `headingOnly` 过滤）；条目 `[it('灯神','character'),it('灯神','character')]` → 保留，`sources` 含 `'source'`。
- **A7（RED）别名合并后按组统计**：`[it('青铜钥匙','item',{aliases:['钥匙'],important:true}),it('钥匙','concept',{aliases:['青铜钥匙']}),it('钥匙','concept',{aliases:['青铜钥匙']})]`。先断言 `mergeWizardRoster('item',…)` 只返回 1 组且 `itemVotes===1`、`otherVotes===2`（证明合组）；再断言 `buildWizardCandidates` 排除该组（改动前因 important 保留）。记录为已知行为。
- **A8 计票字段不进候选**：A2 结果每项 `Object.keys` 不含 `itemVotes`、`otherVotes`、`primaries`、`names`、`important`；以 `emptyWizardState()` 为底、设 `candidates.item` 为该结果，`validateImportWizardState({wizardVersion:1,wizard})` 不抛。
- **A9 `wizardItemRejected` 判定表**：`{0,0}`→false；`{1,0}`（item 1）→false；`{0,1}`→true；`{1,1}`→true；`{2,1}`→false。
- **A10 角色清单不受影响**：同一组条目以 `kind='character'` 调用，`mergeWizardRoster` 的 `name/aliases/roleType` 与改动前一致（沿用 RS-06 系列不变，全部通过）。

## B. 暂存与草稿（core）

- **B1** 物品暂存条目带 `category:'item'` 时 `validateImportWizardState` 通过；不带 category（旧草稿）通过；`category:'weapon'` 被拒绝。
- **B2 中途恢复混合**：暂存前两条无 category（旧批）、后两条 `'character'`，`important:true` 写在旧批 → 排除（other 2 : item 0）。另组后两条为 `'item'` → 保留。

## C. 同名比对 taken（core，`buildWizardCandidates` 第5参数）

每条物品条目 `it(name,'item',{important:true})`，taken 由测试按 2R2-4 规则从候选构造；另有一条控制器用例（E1）验证主进程的构造。

- **C1（RED）** 已选角色名“沈砚” → 物品“沈砚”排除；未同名物品“青铜钥匙”保留。
- **C2** 已选角色别名“砚哥” → 物品“砚哥”排除（称号风险，记录行为）。
- **C3** 物品条目 `it('圣徽','item',{aliases:['灯神']})`，已选角色“灯神” → 圣徽保留（只比 primaries）。
- **C4** 资料来源物品“沈砚”（`kind:'item'` 资料 `# 沈砚\n\n一枚印章。\n`，标题下有正文）+ 已选角色“沈砚” → 保留。
- **C5** taken 为空集合或未传 → 与改动前结果相同。

主进程构造规则（`itemRosterTaken(w)`，导出供测）：
- **C6** 未选角色“林舟” → 不在 taken。
- **C7** 场景：已选 concrete “北城”在；`sceneExcluded` 且未选“南巷”不在；`sceneExcluded` 但在 `authorKept` 且已选的“东渡”在；`unresolved` 且已选的“西渡”不在。
- **C8** `candidates.character`、`candidates.scene` 均不存在 → 空集合。

## D. 运行中计数（core）

- **D1（RED）** 构造 `ImportSession`：`wizard.step==='detect-item'`、`stepState['detect-item']==='running'`，`rosterStash.item` 为 A1 条目 + 一条 `it('青铜钥匙','item')` → `toImportView(session).wizard.rosterFound===1`（改动前为 2）。会话可取 E 节 fixture 在 detect-item 的 journal 再改写这三项。

## E. 控制器（fixture）

- **E1（RED）** fixture 默认文件（资料无 `# 物品`）。`classify` 后直接 `select`：`selected:['body','character']`、`targets:['character','item']`、`infer:true`；随后两次 `wizard-next({consent:true})` 各自 `settle`（过 kinds、tree），再 `toStep(f,'detect-item')`。AI 用 `relatingAi(rosterAi({'roster:item':r=>…}))` 以通过第10步导入角色；`roster:item` 覆盖照 `rosterAi` 的 `hits()`，只为文本中真有该名的单元生成条目，每条自带 `evidence:{unitId,quote:名称}`（fixture 不经 `runImportAi`）：`青铜钥匙`(item, important)、`北城`(place, important)、`沈砚`(item, important)。推进到 `detect-item` 等待：候选只有“青铜钥匙”。“北城”只能被 place 票排除（每章出现，≥3 章）——证明 category 经主进程暂存进入计票；“沈砚”被已选角色同名排除。另组在第9步取消勾选“沈砚”后推进 → “沈砚”保留在物品清单。
- **E2** E1 到达 `detect-item` 等待后，先断言 journal 中 `wizard.rosterStash.item` 已删除、`candidates.item` 每项无计票字段；再用 `injectJournalEdit` 写入 `rosterStash.item=[{unitId,name:'青铜钥匙',aliases:[],itemType:'信物',important:true,category:'item'}]`，断言 `validJournal` 接受（helper 内置断言）；另写一条 `category:'weapon'` 的副本，断言 `validJournal` 拒绝（直接调用 controller 的 `validJournal`，不经 helper）。

## F. 服务层（`runImportAi`）

- **F1（RED）** 返回 `{roster:[{name:'风声',aliases:[],itemType:'信物',important:true,category:'item'}]}` → 结果条目含 `category:'item'`（更新 RA-07）。
- **F2** 无 category → 通过，结果无 category 键。
- **F3（RED）** `category:null` → 通过，结果无 category 键。
- **F4** `category:'Item'`、`category:'weapon'` → 拒绝。
- **F5** 角色清单条目带 `category` → 拒绝（strict 不变）。

## G. 提示

- **G1（RED）** item 清单 phase-output-contract 含完整枚举串 `category:"item"|"character"|"place"|"organization"|"concept"|"other"` 与物品定义关键词“可被持有”（更新 WP-01；不单独断言 `item`，现契约已含该词）。
- **G2** character、scene、world 清单提示（`importAiPrompt` 全文）与改动前逐字相等：实现前把三段提示的 sha256 写入测试常量，实现后比对。基线（HEAD `b26975f`，WP-01 同款合成请求）：character `6ffb4c39…894f7`，scene `14c60245…c832aa`，world `c6776270…c7377`（全值写入测试）。
- **G3** WP-04 不变：item 固定提示不含 `evidence`、`quote`、`逐字`。

## H. 全量与真实目标

- **H1** Node 24：`npm test`、`npx tsc --noEmit`（或项目 typecheck 脚本）、lint 全部通过。
- **H1b 台账**：`docs/requirements-traceability.json` 新增 NI-10，`source` 列 490/491 文档及审核，`testIds` 覆盖 491-A1…G3，`status` 与证据按实际执行情况填写，JSON 可解析。
- **H2 真实目标**：LOTM 第一卷（小丑），隔离根，走到第13步。记录：物品清单数量（修复前截图 317）、模型返回条目 category 缺省比例、失败批次数；核对截图中“克莱恩·莫雷蒂、邓恩·史密斯、黑夜女神、奥黛丽·霍尔、老尼尔、值夜者、序列、廷根市、魔药、贝克兰德、黑荆棘安保公司”均不在清单；“占卜家魔药”“罗塞尔大帝的日记”“镶银手杖”记录是否保留（预期保留，不作为硬门）。清单页截图存隔离证据目录。
