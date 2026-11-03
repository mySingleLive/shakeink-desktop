# 491 用例独立审核（第二轮）

**第二轮审核结论：通过。** 第一轮的 8 项必改都已落实。E1、D1、E2 我用临时探针在当前代码上实际跑过，用 Node 24、真实 fixture。探针放在 `/tmp`，跑完已删除，仓库文件没有改动。

## 一、8 项必改的核对

| # | 项目 | 结果 |
|---|---|---|
| 1 | A7 | 已解决（`cases.md:19`）。条目带 `important:true`，并先断言合成 1 组、`itemVotes=1`、`otherVotes=2`。链接计数是 3，满足 `3*2>=min(1,2)`（`novel-import-wizard.ts:98-100`），所以确实合组。改动前因 important 保留，改动后按票排除，测试不会空过。 |
| 2 | A6、C4 | 已解决（`:18`、`:36`）。写明了 `kind:'item'`，标题下有非空正文，不会被 `headingOnly` 过滤（`novel-import-wizard-roster.ts:41,44`）。 |
| 3 | D1 | 已解决（`:46`）。改为对整个会话调用 `toImportView(session).wizard.rosterFound`，状态写明 `detect-item` 且 running，可以构造出来。探针在当前代码上得到 `rosterFound===2`，与“改动前 2”一致。方案 2R2-5 要求排除被判为非物品的组，所以“灯神”平票被排除后应为 1，这条是 RED。 |
| 4 | E1 | 已解决（`:50`），细节见第二节。 |
| 5 | E2 | 已解决（`:51`）。去掉了重开，改用 `injectJournalEdit`。探针确认这个 helper 对 detect-item 等待状态的 journal 可用，`validJournal` 接受修改后的 journal。`category:'weapon'` 直接调用 `validJournal` 检查，写法可行。 |
| 6 | A8 | 已解决（`:20`）。用 `emptyWizardState()` 加 `candidates.item` 构造状态。 |
| 7 | G1 | 已解决（`:63`）。断言完整的六值枚举串。 |
| 8 | 台账 | 已解决。H1b（`:70`）加了 NI-10 核对项。 |

## 二、E1 实测

探针步骤：`classify` → `select({selected:['body','character'],targets:['character','item'],infer:true})` → AI 用 `relatingAi(rosterAi({'roster:item':…}))` → `toStep(f,'detect-item')`。结果如下：

- **`select` 校验通过。** 实测 `found` 中 `character=1`、`item=0`。`selected` 不含 item，所以不会触发“不能选择未识别出的来源内容”（`main/novel-import.ts:441`）。targets 含 item，item 走推断：`wizardInfers` 只检查 `targets`（`:859`），`wizardSkippedSteps` 也不会跳过 detect-item。scene 不在 targets，第11、12步会跳过。
- **能走到第13步。** 第10步“导入角色”由 `relatingAi` 处理 entity 请求，正常通过，最终到达 `detect-item`、状态 `waiting`、无 `stepError`。
- **当前代码下 E1 是 RED。** 候选为 `青铜钥匙(10章)`、`北城(10章)`、`沈砚(4章)`，与预期“只有青铜钥匙”不符。
- **北城出场章数满足要求。** `bodyF` 共 10 章，北城每章都出现（`fixture.ts:18`），满足 ≥3 章。场景步骤被跳过，没有 scene 候选，所以 taken 里没有北城。北城只能靠 place 票排除，这条能证明 category 经主进程暂存（`main/novel-import.ts:575`）进入了计票。
- **沈砚的两组用例都能区分新旧行为。** 沈砚是已选角色，被 taken 排除。“另组”在第9步（detect-char）用 `wizard-select-candidates` 取消勾选沈砚后，taken 只剩林舟、顾三，沈砚应保留。两组都不会空过。

## 三、E1 需要补一句推进方式

`toStep` 调 `wizard-next` 时不带 consent（`fixture.ts:163`），而第6步“tree”没有 consent 会报错“请先允许发送正文、设定并进行分析复核”（`main/novel-import.ts:522`）。我的探针第一次照字面写法跑，就是在这里失败的。

所以 `select` 之后要先调两次 `wizard-next({consent:true})` 并各自 `settle`：第一次过 kinds，第二次过 tree。之后才能用 `toStep(f,'detect-item')`。这和 `toTree` 加 `toVerify` 的现有写法一致。E2 建立在 E1 之上，修正后同样受益。

其余用例（A1–A5、A9、A10、B、C、F、G2、G3、H）与方案 2R2 及代码一致，没有发现会让测试出错、空过或建不出来的问题。

**通过**（下面一项是建议在实现前写进文档的小修订，不需要再审）

1. E1（`docs/491-item-roster-category-cases.md:50`）：写明 `select` 之后连续调两次 `wizard-next({consent:true})` 并各自 `settle`（第一次过 kinds，第二次过 tree），再用 `toStep(f,'detect-item')`。否则 `toStep` 会在 tree 步骤因缺少 consent 抛错。
