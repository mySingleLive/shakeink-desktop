# 508 · 506/507 世界观导入提速实现 · 独立代码审核

日期：2026-11-04。对象：工作树中 506（以 §3R、§3R2 为准）的未提交实现，对照 507（WP-01…14、WU-01/02）。503 部分已在 505 审核，本文不重复。未修改任何源文件或测试文件。

运行（Node v24.18.0）：
- `node --import tsx --test tests/unit/novel-import-world-performance.test.ts tests/unit/novel-import-item-performance.test.ts tests/unit/novel-import-wizard-session.test.ts`：83/83 通过。
- `node --import tsx --test tests/browser/novel-import-wizard.test.ts`：35/35 通过。
- 另写了一个临时复现脚本（放在 `tests/` 下，跑完已删除），结果见第1条。

## 结论：需修改

名额、批次上限、全局错误停止、批次失败、整体提交、world 纠错与目录裁剪都与 3R/3R2 一致。但“运行中跳过某项其它设定”会让整步卡死（第1条），而且 507 列出的 WP-08、WP-09 没有对应测试。

## 发现

1. **（高）运行中跳过一项其它设定，若它还有排队批次，整个世界观步骤会卡在“导入中”，且无法自行恢复。** `desktop/main/novel-import.ts:891`：排队中的批次拿到名额后，若 `task.state==='skipped'` 就 `throw stopped()`，抛出的是 `DOMException('…','AbortError')`。异常经 `importSettings` 抛给 worker，`:846` 的 catch 遇到 AbortError 直接重抛。`:852` 的 `worker(false).catch(stop)` 随即触发全局 `stop()`，取消全部在途世界条目，`runEntities` 带着 AbortError 退出。`launch`（`:1414`）把 AbortError 当作暂停，静默返回。此时 epoch 没有变化，所以没有任何代码把会话改成暂停或失败。
   复现：`characters:3000` 让 theme 分成 32 批，等 8 批在途后跳过 theme，再放行全部请求。4 秒后的状态是 `{"phase":"running","step":"import-world","stepState":"running","active":0,"states":{"done":1,"running":30,"waiting":34,"skipped":1}}`，`cancelAi` 被调用 30 次。也就是说，没有任何任务在运行，界面却一直显示“导入中”，30 张卡片停在“导入中”，只能暂停后再继续。
   WP-14 没有测到这一路径。那里 theme 的批次不超过 8，没有排队的批次，所以不会走到这次检查。
   修正：跳过时让剩余批次直接返回空结果（结果在 `:802`、`:824` 已按 skipped 丢弃），或抛出一个非 AbortError、只作用于本任务的错误，不能复用 `stopped()`。WP-14 应改成批次多于 8、跳过时仍有排队批次，并断言步骤能正常结束、其它世界条目没有被取消。

2. **（中）WP-08、WP-09 没有测试。** `tests/unit/novel-import-world-performance.test.ts` 只有 WP-01…07、11…14。WP-08 要验证 scopeHash 对 verified world entity 只计算一次（`:1539` 新增 `request.kind==='world'`），目前没有断言。WP-09 要验证暂停时排空 31 路、恢复后结果不丢不重，世界观步骤也没有覆盖。暂停时 epoch 改变，`current()` 会让等名额的 worker 抛出 AbortError，这条路径与第1条相同，需要真实跑一遍。WP-07 也只测了“输出未完整结束”，没有测 no-match（或其它定位错误）和“第二次失败则任务失败”。WP-01 和 WP-06 的断言能覆盖 WP-02 与 WP-06，可以接受。

3. **（低）有其它设定任务时，世界条目最多只有 27 路在途，WP-01/507 写的“31 路”在真实导入中达不到。** 一个 settings 任务在批次运行期间一直占着一个 worker 循环（`:845`）。这个循环自己不占名额，但也不领取世界条目。四项设定同时运行时，只剩 27 个循环处理世界条目（名额会剩下 31−27−8≥0）。总在途 ≤31，也不会死锁：settings 循环等名额时不持有名额，批次最多占 8 个名额，名额优先分给世界条目（`:780`）。但作者导入时默认会勾选四项设定，所以 E2E 的 60 s 估算应按 27 路算，或者让 settings 任务不占 worker 循环。WP-11 只断言了 ≥23 路，与实现一致。

4. **（低）world 定位纠错的提示提到了 world 请求里没有的“引用选项”。** `:82` 的定位反馈是“请逐字复制本次合法引用选项或同单元真实连续原文”，现在 world 也会用到它（`:1105` 的 `indexed||kind==='world'`）。world 请求没有 `evidenceOptions`（`:1086`，`indexed?…:[]`），`:1107` 的提示也正确地走了非 indexed 文本（“sourceUnitIds与evidence.unitId逐字复制units[].id”，不提 optionIndex），只有这一句反馈不准确。建议 world 改用不提选项的措辞。另外 `allowScene` 对 world 也开启了场景链接与场景字段的反馈，但这些错误信息只会由场景请求产生，没有实际影响。

5. **（低）WU-01 没有覆盖“九种设定图标两两不同”。** `tests/browser/novel-import-wizard.test.ts:160` 的 fixture 只有 3 种设定类型，加上世界共 4 种图标。实现上 `NovelImportWizard.tsx:25` 直接用 `getTabIcon`，9 种类型在 `src/stores/tabs.ts:119-131` 各有不同图标，所以实际正确，只是用例写得比 507 弱。

## 已核对、无问题

- **名额。** `:779-784` 中，名额只在 grant 时扣减。entity 路径（`:845`）和批次路径（`:891`）的 `acquire` 都在 try 外面，release 在 finally 里，拿到名额的每条路径都会归还。`halt` 之后 `acquire` 立即拒绝，`stop()` 和 `release` 会拒绝全部等待者，拿到名额后也先检查 halt（WP-12）。
- **批次失败。** `allSettled` 加上 `first` 标记：第一批失败后，排队批次不再发出；等全部批次结束才抛错，不会占着名额。没有任何部分结果返回（WP-13、WP-05）。
- **提交。** settings 的结果在 `:800-806` 按任务整体合并，失败时恢复 `artifacts/conflicts/deferredConflicts`。`none` 和 `failed` 遇到 skipped 时跳过（`:824-825`）。`coalesced` 已包含 world（`:768`）。
- **world 目录裁剪。** `:1081-1083` 只保留目标、`parentId` 链（有防环）和本材料里出现名称的已选项，`entities` 仍是完整目录。world 请求没有 evidenceOptions。
- **服务层。** world entity 已加入 `lightImportGeneration`（`desktop/service/novel-import-ai.ts:1001`）。`wizardSettingsLaneRequest`（`:999`）只放行 semantic v1、analyze、无 intent、四类设定的请求，`:828` 拒绝其它请求带这个 lane。这类请求不经过 `importRosterModel`，普通 theme 分析仍走聊天名额（WP-03 已断言）。`ImportAiRequest.executionLane` 的类型已扩展。
- **WIZARD_ENTITY_CONCURRENCY** 已删除，代码里没有其它使用者。CP-02、SP-01、IP-01/IP-03 已按 3R-5 更新。
- **UI。** 卡片和识别树都用 `getTabIcon` 取图标、`SETTING_LABELS` 取标签，世界节点标签为“世界”。settings 卡片保留 Sparkles，`tabs.ts` 没有改动。`novel-import-scene-identity-ui.test.ts` 的受控渲染器已为 `@/stores/tabs` 加了桩。

## 主代理处理（2026-11-04）

1. 高：被跳过任务的排队批次改抛 `SettingsTaskSkipped`（普通错误），只结束该任务，不再触发全局停止。WP-15（32 批中跳过）在修复前失败、修复后通过。
2. 中：WP-07b 补定位类错误（no-match、ambiguous）与 JSON 不可解析，断言一次纠错、二次失败即任务失败。WP-08、WP-09 未单独补：scopeHash 缓存与暂停排空沿用物品已验证的同一实现（IP-05、IP-02），记为已知缺口。
3. 低：60 s 估算按世界条目实际 27 路计。
4. 低：world 定位纠错改用不提“引用选项”的文字。
5. 低：WU-01 补九种设定加世界共 10 种图标两两不同。
