# 562 · 561 测试用例独立审核

审核对象：`docs/561-import-stop-after-save-cases.md`。依据：`docs/560-import-stop-after-save-plan.md`（修订 R1–R8 优先）、`docs/560-…-plan-review.md`。行号为审核时源码行号，`ni.ts` 指 `desktop/main/novel-import.ts`。

## 必须修改

1. [必须修改] 已有测试中有会被破坏但未列出的。
   - `tests/unit/novel-import-abandon.test.ts:127`（IA-12/IA-13）断言 `assert.rejects(f.act('cancel'),/保存已开始/)`。改动后这条断言必然失败，SD-47 只列了浏览器用例。应把 IA-12 改为「failed publication 草稿 cancel 成功」，并保留其后的「close 后重启再 retry 成功」部分（可拆成新用例）。
   - SD-47 写「『保存已开始』拒绝文案不再出现」，这个说法有误。`ni.ts:562` 的「保存已开始，请保留原导入计划并重试」仍然保留，`tests/unit/novel-import-pdf-source-text.test.ts:135` 依赖它。应限定为只有 `ni.ts:2720/2737` 的删除拒绝文案「保存已开始，不能删除这次导入，请重试保存」消失，并列出 pdf-source-text:135 为不变回归。
   - `tests/helpers/novel-import-ui-fixture.tsx:44` 的 `cancelMode:'publication'` 模拟的是旧拒绝行为。IA-B08b、NICC-B13（`tests/browser/novel-import-abandon.test.ts:97,101`）不能只说「按新规则更新」，必须写清改成什么：例如 NICC-B13 改用新的 `cancelMode:'kept'`，断言 toast；IA-B08b 改为 publication 草稿点 × 只收起、`cancels=0`。
   - `tests/unit/novel-import-close-confirmation.test.ts` NICC-02 断言 publication 和 publishing 的 `needsNovelImportCloseConfirmation` 为 false。按 R1，这条应保持不变，用例需明确列为「不变回归」，防止实现时照 560 第 5 节旧文把它改成 true。

2. [必须修改] R1 缺少谓词层用例。没有 `deletableImport` 的单元真值表（按 phase × 有无 publication，completed/discarded 为 false，其余为 true），也没有断言 `abandonableImport` 对 publication/publishing 仍为 false。界面层还缺以下回归：publication 草稿点「导入作品」不进 replace 页（现有 IA-B04b，应列为不变回归）；`ProgressScreen` 在 publishing 时仍显示「收起」；任务栏按钮在 publishing 时可见；`completed` 的「导入完成」页没有「停止导入」按钮。审核第 5 条列出的四处依赖目前只有任务栏一处（SD-43）被覆盖。

3. [必须修改] 界面用例用错了夹具。SD-40～SD-44 是向导第 22 步 `SaveStep`，需要用 `tests/helpers/novel-import-wizard-ui-fixture.tsx` 和 `tests/browser/novel-import-wizard.test.ts`，`novel-import-abandon.test.ts` 只挂载旧版对话框。另外，向导现有的「停止导入」不弹确认就直接删除（`tests/browser/novel-import-wizard.test.ts:214` NIW-B12/B13/IA-B03，`:248` NICC-B05）。SD-42 要求 publication 草稿弹确认框，应同时写明「无 publication 时仍不弹二次确认」作为不变回归，避免实现时统一加确认把这两条用例改坏。

4. [必须修改] 缺少用户仍会被卡住的路径。
   - 重启前处于 `publishing`：`initialize`（`ni.ts:535`）会改成 `paused`，`resumePhase='publishing'`。SD-05 只覆盖 `failed`。应补「journal phase=publishing → 重启 → cancel 成功」以及「→ 授权 → resume 能保存」。
   - 删除可以重复执行：`discardPublication` 已清理，但 `removeDraftDirectory` 失败（例如草稿目录有未知文件，参照 IA-10）。此时 `session=null`，草稿保留；重启后它作为 publication 草稿恢复，再次 cancel 应得到 `kept:'none'` 并删除成功（审核第 17 条）。目前没有用例。
   - 服务不可用或准入拒绝时，主进程要按 R2 兜底：`businessGate` 关闭（`BUSINESS_CLOSED`）、`stoppingImports`、`closing` 时调用 cancel，期望 `{view:null}`、草稿删除、返回 kept 原因。SD-04 只模拟了一种抛错文案，SD-31 的「主进程按 R2 兜底」没有任何主进程侧断言。
   - 等待保存期间收起再打开（R7「保持可收起」）：`abandoning` 时 `current` 返回 `{view:null}`（`ni.ts:547`），任务栏和重新打开后会显示什么，没有用例定义，可能出现「看起来已删除、实际仍在等待」或无法重新打开。需补：等待中收起 → 任务栏/重新打开时显示「正在等待保存结束…」→ 保存结束后自动完成删除。
   - 删除等待保存时退出应用：`close()` 在 `abandonRun` 存在时直接等待它，没有超时（`ni.ts:2711`）。审核第 14 条要求确认这不会拖住退出流程。应补「publish 挂起 + cancel 进行中 → controller.close()」，断言主进程退出路径（`desktop/main/index.ts` 的超时）仍能结束。

5. [必须修改] 有用例把注入的模拟结果当成了真实结果。
   - SD-01～SD-11 的 `publish`/`discardPublication` 都是控制器选项注入的模拟。SD-20～SD-31 只测 `Workspaces`。没有任何用例覆盖 `desktop/main/index.ts` 中 `discardPublication → businessGate.run → service.call('novel-import-discard')` 这条接线，也没有覆盖 `desktop/service/index.ts:119` 准入列表和在途登记的真实回调。R3 应仿照 `tests/unit/novel-import-integration.test.ts:139` NI-L04 的 `workerRig`（从 `desktop/service/index.ts` 的 AST 取出真实回调）测试：discard 在途时 `task-status.active≥1`；`stop-tasks`/`close` 等待它结束；`stoppingImports`/`closing` 时拒绝。注意 `workerRig` 的 deps 需要加上新依赖。SD-31 放在「真实 Workspaces/PGlite」节下，实际测不到这些。
   - SD-50～SD-52 的合成草稿没有预留记录，真实系统里只会走 `kept:'none'` 分支。半成品清理（SD-23 类）在真实构建版上从未执行。台账只能把真实系统通过记在「`.DS_Store` 目录保存成功 + 无预留删除」上，不能记为「半成品清理真实通过」。否则应补一条真实目标系统用例：在隔离根中先制造带预留和 creating 清单的半成品（例如用测试构建的故障注入，或由集成测试生成后拷入隔离根），再停止导入。

6. [必须修改] 部分期望值不确定或无法验证。
   - SD-23 写「`{kept:'none'}` 或 `cleaned`」，返回值必须唯一确定，并与 SD-21、SD-29、SD-30 第二次的结果统一。返回类型 `ImportResponse`（`desktop/shared/novel-import.ts:175`）目前没有 `kept` 字段。SD-04、SD-45 都要求响应中有 kept 原因，用例需定下字段名和结构（例如 `{view:null,kept:{path,reason}}`），浏览器夹具 `cancelMode` 也要相应新增。
   - SD-28「`works` 有该目录的连接」：`works.slots` 以作品 id 为键（`workspaces.ts:84`）。creating 目录不能 `open`，`create` 又持有 `serialize`，discard 也在 `serialize` 中运行，所以按现有夹具构造不出「活动连接持有 creating 目录的锁」。应改为可构造的前提并写明构造方法（例如直接写 `owner.json`，`host=hostname()`、`pid=process.pid`，并通过测试钩子登记一个活动 token）；如果确实不可达，就删掉这条，只保留 SD-29。
   - SD-23 只在 `before-initialize` 注入故障。应按 `tests/integration/novel-import-publish.test.ts:42` NI-W03 的方式参数化各阶段：`before-initialize`、`domain-writing`、`database-committed` 期望清理（后者会删除完整数据库，审核第 15 条要求文案说明）；`manifest-ready` 期望 `kept:'directory'`（SD-24）；`catalog-committed` 期望 `kept:'work'`。
   - SD-10 是用户截图中的核心状态（重启后 `analysisGrant` 被清空，`ni.ts:535`）。它必须明确 `resume` 不带 consent（`consent:false`），并断言整个过程中 error 从未变成「请重新允许发送本次正文及设定范围」（`ni.ts:1729`）。SD-09 在同一进程内授权没有被清掉，验证不到发送授权分支。

## 建议

7. [建议] SD-11「手改日志使计划哈希变化」容易连带触发 `assertWizardSessionChapters`/`validJournal` 失败（`ni.ts:527`），测到的会是启动失败。建议只改 `publication.hash` 字段。R6 要求哈希校验在授权分支之前，可加一条「未授权目录 + 哈希不符 → 先提示计划变化」来固定顺序。
8. [建议] R8 补反例：已有 publication 时选择**另一个**非空目录要被拒；目录中含其他作品清单时提示「请选择空目录」。补回归：`tests/integration/workspaces.test.ts:48`（`author.txt` → `/空目录/`）保持不变。
9. [建议] R4 补用例：使用旧品牌名（`LEGACY_NAMES`）清单的半成品按 `readWorkBrand` 的 names 清理；`restores/`、`preserved/` 作为陌生文件保留；`.<uuid>.tmp` 被删。SD-30 应断言失败后清单和预留记录**都**还在。
10. [建议] SD-26 应写明返回值。审核第 12 条要求提示残留（目录可能已被移走），用例应定下是否返回 kept 提示。
11. [建议] SD-50 的合成 publication 草稿不要手写。在隔离根中用控制器夹具跑到第 22 步并让 publish 失败，再拷入构建版的隔离数据根，这样能通过 `validJournal` 和章节校验。按记忆规则，要先移出 inbox lease receipt，否则启动报 `AUDIT_CHANGED`。SD-52 还应断言目标目录中的 `.DS_Store` 仍在。
12. [建议] SD-08 注明使用旧版还是向导控制器，以及 `resume` 不 await。可加一条向导第 22 步 `resume` 启动的 publish 挂起时 cancel 的用例。
13. [建议] 新用例编号写入 `docs/requirements-traceability.json`（注意该文件常有未提交条目，不要 checkout）。

## 确认无误

14. [确认无误] SD-01～SD-03、SD-06、SD-07 可用 `tests/unit/novel-import-abandon.test.ts` 的 `fixture()` 实现：`options.publish` 可以替换（IA-12 已有先例），`cancel` 期间 `current` 为 null、其他操作抛「正在删除这次导入」，与 `ni.ts:547` 一致。
15. [确认无误] SD-13/SD-14 可直接在 `f.target`（夹具的 `chooseTarget` 返回该目录）写入 `a.txt` 或 `.DS_Store` 来构造。SD-20 与 `workspaces.ts:198-200` 的修复点对应。
16. [确认无误] SD-12（NIW-C61 不变）、SD-07（`close()` 保留）分别对应 R6 和「不做」节。SD-21、SD-22 对应 560 第 2 节第 1、2 步。
