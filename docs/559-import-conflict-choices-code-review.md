# 559 · 第 21 步矛盾处理方案 代码审核

审核对象：`docs/557-import-conflict-choices-plan.md`（以「审核后修订」R2–R12 为准）与 `docs/558-import-conflict-choices-cases.md` 的实现。只看 docs/557 相关改动，工作区其他未提交改动未审。审核人未修改任何源文件或测试文件。

## 结论：request changes

大部分路径正确：会话对象身份保持不变，详情缓存随保存刷新，「保留现在的设定」始终能直接通过。有一处 must-fix：对细纲 `chapterIndex` 冲突，「以正文为准」显示为可用，提交后会话却无法保存，作者会卡在第 21 步。另有几处 should-fix，涉及界面卡顿、误导性错误文案和台账。

## 已执行的验证（Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `node --import tsx` 临时探针（`/tmp`，已删除）：对合成 outline/narrative/worldline 资料调用 `conflictChoiceOptions`/`assertFieldValue` | 见 must-fix 1、should-fix 3 |
| `node` 临时探针：`diff@8.0.4` `diffChars` 处理随机中文 2000+2000 / 5000+5000 / 9000+2000 字 | 432 ms / 2643 ms / 962 ms；相似文本 9000 字为 16 ms |

未重跑长套件（主代理已报 CC 单元 23/23、集成 9/9、浏览器 16/16 通过）。

## 重点审核项结论（OK）

1. **OK：clone 后 `Object.assign` 保持会话身份。** `desktop/main/novel-import.ts:2655` 在 `structuredClone(s)` 上完成全部改动，`:2681` 先删 `s` 的键再赋值，`this.session===s` 保持不变。`sceneSourceMemo` 等以会话为键的 WeakMap 仍然命中。`workingUnits` 被一起克隆；决定不改正文，所以缓存仍有效。校验失败的 `throw` 都发生在 `:2681` 之前，原会话不受影响。`resolve` 不在 `act` 的 snapshot 名单里（`:564`），这里不需要它。
2. **OK：`detailCache` 会刷新。** 缓存键是 `session` 对象加 `revision`（`:503-509`）。`save()` 先做 `s.revision++`（`:383`），再在 `notify` 中调 `publicView`（`:391`），所以每次决定和每次 `checkpoint` 之后都会重算。复核运行中，`:506` 在查缓存之前就返回 undefined。`conflictDetail` 抛错时返回 undefined，界面退回旧版 `LegacyConflictScreen`，不会白屏。
3. **OK：锁与保存门槛一致。** 锁在 `fixStructure` 之后写入（`:2672-2675`），只保留值未变的锁，与 `keepForSave`（`:1412-1416`）和 `assertImportSemanticLocks`（`desktop/service/novel-import-publish.ts:87`）一致。`createImportSemanticState(next)` 使用的是新 decisions，`inputHash`/`decisionHash` 与 `assertPlan` 的检查对得上。R2 的锁检查改用 `importFactFields`（`desktop/service/novel-import-ai.ts:939`），R6 的锁过滤（`:2503`）覆盖了所有经过 `addConflicts` 的入口。
4. **OK：`deferredConflicts` 处理正确。** `:2670` 移除已解决的冲突，`finishWizardChecks`（`:1594`）只把仍待处理的冲突加回去。
5. **OK：最后一处决定后作者回到校验页。** `phase` 从 `conflicts` 变成 `select`，`adopt` 检测到 phase 变化，按 `phaseScreen`（`src/lib/desktop/novel-import.ts:37`）切到 `select`，即第 21 步校验页，一致性行为 ok，可以直接保存。还有待处理冲突时 `phase` 不变、屏幕保持 `conflicts`；`WizardConflictScreen` 以 `conflictId` 为 key（`NovelImportDialog.tsx:155`），换到下一处时会重新挂载。
6. **OK：错误信息不泄露内部内容。** `:2662` 的提示经过 `safeError`（`:2029-2072`），只透传白名单前缀开头且不足 180 字的 message，其余一律换成通用文案，不会带出路径或模型原文。`reason` 截到 300 字（`:1477`、`novel-import-ai.ts:1259`），界面按纯文本渲染。
7. **OK：自动修复的判定更严格。** `repairConflicts` 的 ok 判定（`:1527`）检查两侧的 artifactId，并把 `reviewRepairs` 视为未通过，只会让结果更保守。

## must-fix

1. **细纲 `chapterIndex` 冲突的「以正文为准」显示可用，提交后保存必然失败，作者无路可走。**
   - `assertFieldValue`（`desktop/core/novel-import-conflict-choices.ts:31-36`）只跑 `validateImportSemanticArtifact` 和 `importNativeMappings`。这两个函数都不校验 outline 的 `chapterIndex`。
   - 保存路径 `wizardNext('verify')`（`desktop/main/novel-import.ts:625`）会调用 `projectOutlines` → `validateDetailedOutlineAssignments` → `assignments`（`desktop/core/novel-import-outline.ts:9-10`）。这里要求 `chapterIndex` 是范围内的整数且不与其他细纲重复，否则抛错。
   - 探针结果：outline 冲突候选值为 `'第3章'`，或为另一份细纲已占用的 `'1'` 时，`conflictChoiceOptions` 都返回 `inferred:true`。
   - 后果：决定在 `wizardDecision` 中通过，冲突被锁定。之后每次 [保存作品] 都报「细纲chapterIndex超出当前章节快照」或「…重复归属」，经 `safeError` 后显示成「导入处理失败，请核对来源、模型配置后重试」。`wizard-next` 有 snapshot 回滚，会话不坏，但冲突已解决且已锁定，作者没有界面可以撤销。这违反了「任选一种都能通过核对并保存」。
   - 同类问题：narrative 的 `chapterIndex` 候选值超出章节数（如 `'999'`）时，`inferred` 也显示可用。提交后 `fixStructure`（`:1563`）会把这条叙事整份丢掉（「指向不存在的章节，未保存」），保存能成功，但作者选「以正文为准」得到的是资料被删除。
   - 建议：
     - `assertFieldValue` 对 `WIZARD_REVIEW_STRUCTURAL` 字段改为在克隆上走一遍保存前准备：`fixStructure` → `importNativeMappings` → `projectOutlines`（outline 目标时），并要求该资料在结果中仍然存在且值未被改写。
     - 或者至少对 `chapterIndex`/`order` 补上 `assignments` 的整数、范围、唯一性检查，narrative 的 `chapterIndex` 要求 `< chapters.length`。
     - 补用例：outline `chapterIndex` 改成非整数或重复值时 `inferred` 不可用；对 narrative `chapterIndex` 越界同样断言。

## should-fix

2. **`DiffText` 在主线程重复计算，大文本时每次按键都卡。**
   - `NovelImportDialog.tsx:126-129` 每次渲染调用 `diffChars` 两次（左右两栏各一次），没有 memo。`WizardConflictScreen` 订阅了草稿，在「备注」或「填写这一项」中每输入一个字都会重新渲染。
   - 阈值是两段合计 2 万字，但实测差异大的中文 2000+2000 字耗时 432 ms，9000+2000 字耗时 962 ms，5000+5000 字耗时 2.6 s，乘以 2 后每次按键都要等这么久。
   - `text` 超过 2000 字时，`inferred` 不可用（R3），但 `current`/`proposed` 仍然会被 diff。
   - 建议：用 `useMemo` 按 `current`/`proposed` 只算一次，两栏共用结果；传 `timeout`（diff 8 支持，超时返回 undefined）或把阈值降到约 4000 字，超出时退回整段显示。
3. **「自己填写」被拒时的提示有误导性。**
   - `timeKind`/`timeValue`/`timeEnd` 不在 `WIZARD_REVIEW_STRUCTURAL` 中，`merge` 可用（探针已确认）。作者填写「三年后」时，校验报「事件时间数值无效」。这条 message 以「事件」开头，不在 `safeError` 的白名单里，最后显示成「填写的内容不能保存为「时间」：导入处理失败，请核对来源、模型配置后重试」（`:2662`）。作者看不出要填数字，还会被引向检查模型配置。
   - 建议：`:2662` 不经过 `safeError`，改为把语义校验的固定 message 映射成填写提示（例如「需要填写数字」），或在 `conflictChoiceOptions` 中给这几个字段的 merge 加格式说明。会话不变、草稿保留，这部分行为正确。
4. **台账未登记。** `docs/requirements-traceability.json` 中没有 557/558 的条目（`grep conflict-choices` 无结果，`CC-` 只命中无关的 `candidateCardPreviewClick`）。AGENTS.md 要求以台账作为验收依据。追加时注意保留其他未提交条目，不要 checkout 该文件。
5. **忙碌时文本框仍可编辑，不可用的方案仍显示为已选。** `:149-150` 的两个 textarea 没有 `disabled={busy}`。如果作者先选了某个方案，它之后变成不可用（例如另一处决定改了同一资料），单选框会保持 checked 并置灰，而按钮因为 `selected` 为 undefined 被禁用，界面没有说明原因。建议在 `selected` 为空且 `choice` 非空时清空 choice，或提示「这个方案已不可用，请重新选择」。

## nit

- 「第 {index} / {total} 处」中 `index` 恒为 1（`conflict-choices.ts:68`），处理一处后显示「第 1 / 2」→「第 1 / 1」，进度看起来没有前进。可以改成「还剩 N 处」，或记录已处理数。
- `merge` 的 `mergedText.trim()`（`Dialog.tsx:141`、`main:2660`）会去掉作者有意保留的首行缩进。`text` 超过 10 万字时，预填值超过 textarea 和 schema 的 `max(100000)`，提交会被拒为「导入操作参数无效」。这种情况很少见，可以在 merge 选项上直接置灰。
- R11 的「与 `conflictBases` 不一致视为过期」没有按字面实现，改为始终取实时值（558 已注明，由 CC-18 覆盖）。效果等价，可接受，建议在 557 R11 后加一句说明。

## 汇总

- must-fix：1（细纲/叙事 `chapterIndex` 的 `inferred` 校验门槛低于保存门槛，可能卡在保存或静默丢掉资料）。
- should-fix：2（DiffText 性能）、3（merge 错误文案）、4（台账）、5（忙碌和过期选项状态）。
