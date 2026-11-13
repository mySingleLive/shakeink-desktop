# 535 · 导入伏笔提速方案

日期：2026-11-08。用户要求：第20步“导入伏笔”在《诡秘之主》第一卷（小丑，213 章，760 个工作单元）上 ≤2 分钟；导入界面显示“已处理 N 个伏笔”一类的文案。用户 2026-11-08 确认伏笔请求关闭思考（轻量策略）。

## 1. 计时与质量口径

驱动 `/private/tmp/shakeink-foreshadow-535/launch-foreshadow.mjs <label>`（复制自 531 细纲驱动，`LOTM_FORESHADOW=1`，目标 角色+世界线+叙事线+大纲+伏笔，第一卷，隔离根 `~/shakeink-test-roots/cache-522`）。时钟从向导进入 `foreshadow` 起，到离开止，单调时钟 ≤120000 ms，步骤 `done`，页面无错误。驱动每 5 s 采样 `.ni-progress-hero` 的界面文字，作为文案证据。

质量（`foreshadow-import-completed.json.quality`）：伏笔数、触点数及 PLANT/MENTION/PAYOFF 分布、RESOLVED 数、触及章数、带 eventId/narrativeId 的触点数、规划关联数、丢弃原因计数、`touches` coverage = 760。

## 2. 基线（fs-r1，HEAD 22b1b10，真实 E2E）

- 第20步 `runForeshadow` 用 `stageRequests` 串行；每批按 profile 装满（输入约 6.2 万 token、约 10.3 万字符提示），共 10 批。
- `intent:'touches'` 不属于轻量策略：DeepSeek 保留思考，每批输出 1.5–2.6 万 token（多为思考），单批 91–275 s，p50 153 s。
- 整步 1528108 ms（25.5 分钟），10/10 成功。质量：130 个伏笔、173 个触点（PLANT 115 / MENTION 30 / PAYOFF 28），RESOLVED 28，触及 111 章，丢弃 7 个（引文无法唯一定位），eventId/narrativeId 关联 0。
- 进行中界面只显示“正在处理所选章节”，没有章节进度，也没有伏笔数。

## 3. 修改

1. **轻量策略。** `lightImportGeneration` 加入 `semanticVersion===1&&phase==='analyze'&&intent==='touches'`（与 roster 同类：短列表输出）。因此伏笔请求关闭 DeepSeek 思考（其它模型降到最低思考档，规则同 `importRosterModel`），并在 `runImportGenerationLane` 内运行，不占聊天长任务名额。`touches` 只由向导第20步发出，不影响其它路径。不新增 executionLane。
2. **按章并行。** 新私有方法 `runTouchBatches`：
   - 待处理单元 = 未在 `coverage.touches` 中的单元（恢复时只发剩余部分）。
   - 分批 `wizardLinePlan(pending,s.chapters,profile,WIZARD_LINE_CONCURRENCY*2)`（62 批，两波，最长优先，不切章；超出 profile 的单章按单元切）。每批经 `requestFits`（带完整元数据：事件目录、本批讲述卡）检查，放不下时用 `wizardLinePlan(batch,…,2)` 对半，单单元仍放不下报原有预算错误。
   - 并发 `WIZARD_LINE_CONCURRENCY`（31）。来源复核与 roster 相同：首批前一次，之后每 30 s 至多一次，同一时间只有一次。
   - 失败处理沿用 roster（docs/503）：`ROSTER_OUTPUT_RETRYABLE` 类错误，多单元批按章对半放回队首，单单元批最多 `ROSTER_UNIT_ATTEMPTS` 次；整步额外请求不超过计划批数。其它错误（停止、授权、模型配置/来源变化、传输、存储）立即停止派发新批，在途批全部结算后抛出，步骤失败。
   - 每批成功后在串行检查点内追加 `touchStash` 并写 coverage；暂停时等待在途请求结算（与 runLineParallel 相同）。
3. **确定的合并顺序。** 并行返回顺序不定，而 `applyForeshadowPlan` 以每组首条的 title/content 为准。检查点内追加后按批首单元在全书中的位置稳定排序（批内保持模型顺序），使同一组回复得到同样的伏笔名称、说明和 id。`touchStash` 每项增加可选 `order`（批首单元的工作单元序号，非负整数），schema 同步；排序后的结果与串行一致。旧会话无 `order` 时按原顺序处理。
4. **提示词（仅 touches）。** `touchesContract` 增加：本次只分析全书一段章节，其它章节由并行请求分析；同一伏笔在不同章节必须使用相同的 foreshadowKey（伏笔本身的稳定名称，不含章节号或触点类型），以便跨批合并埋设与回收；chapterIndex 必须是本批原文所在章的全书索引。同步 prompt golden。
5. **进度与文案。**
   - `wizardLineProgress` 扩到 `foreshadow`，coverage 键 `touches`，显示“已完成 x / 213 章”。
   - 视图新增 `foreshadowFound?:number`：步骤 `foreshadow` 运行中时，等于 `touchStash` 中不同 `normalizeWizardName(foreshadowKey)` 的数目（与 `applyForeshadowPlan` 的分组口径相同）。
   - `LineStep` 在 foreshadow 步骤显示 `已处理 N 个伏笔`（`aria-live="polite"`，类名 `ni-w-found`，与识别步骤“已识别 N 个角色”一致）。数值来自真实状态，不显示示例数字。
6. **测试钩子。** 无新增环境变量。

不改：`planForeshadowTouches` 规则、引文定位与丢弃、发布映射、第21步检查、`touches` 输出 schema、其它步骤。

## 4. 风险

- 关闭思考可能降低伏笔识别深度；以伏笔/触点数、PAYOFF/RESOLVED 数、丢弃数对比基线衡量。
- 批变小后，一个伏笔的埋设与回收更常落在不同批；跨批靠 foreshadowKey 同名合并（第3节第4条），名称不一致时会成为两个伏笔。基线 10 批同样没有跨批上下文，以 RESOLVED 数对比。
- 31 路并发下尾部由慢批决定；本方案不做 3R5 慢批提前拆分，实测不达标再加。

## 3R. 审核修订（依据 535 review，以本节为准，取代第3、4节对应条目）

1. **批数（高1）。** 分批改为 `wizardLinePlan(pending,s.chapters,profile,WIZARD_LINE_CONCURRENCY)`：31 批一波，约 6.9 章/批，最长优先。删除第4节“基线同样没有跨批上下文”一句。
2. **质量硬指标（高1）。** 真实运行与基线 fs-r1 对比：RESOLVED ≥ 基线的 70%（≥20），多触点伏笔 ≥ 基线的 70%（≥28），跨 ≥4 章的伏笔 ≥ 基线的 50%（≥10），伏笔数 ≥ 100，丢弃触点 ≤ 触点数的 10%。驱动把这些数字写入 `quality`。任一项不达标时不判通过，带数据交用户决定（备选：增加一次只含 key/title/content、不含正文的合并分组请求）。
3. **输出长度（中2）。** touchesContract 写明：content 不超过 100 字，同一 foreshadowKey 在本批只在第一条填写 content，其余留空；summary 不超过 200 字；quote 不超过 60 字。驱动记录 `finishReason=length` 次数，以及每批输出 token 的 p50/max（来自 `import-usage` 行）。
4. **复核与缓存（中3）。** 调用 `ai(s,epoch,request,true)`，由批调度负责来源复核（首批前一次，之后至多每 30 s 一次，同一时间只有一次；结束前再复核一次）。`ai()` 的 scopeHash 缓存条件加入 `s.wizardVersion===1&&request.intent==='touches'`。
5. **失败处理（中4）。** 可重试：`ROSTER_OUTPUT_RETRYABLE`（输出未完整结束 / JSON 无法解析 / 返回结构不完整）。其余错误都不可重试，立即停止派发，在途批全部结算后抛出。多单元批对半用 `wizardLinePlan(batch,…,2)`，只得到一段时按单元从中间切；单单元批最多 `ROSTER_UNIT_ATTEMPTS`（3）次；整步额外请求不超过计划批数。形状修整（仅 touches schema，形状修复不改含义）：summary 超过 200 字时截到 200 字，content 超过 4000 字时截到 4000 字。quote 不截。
6. **章节归属（中5）。** 提交前，主进程用本地锚定后的 evidence（`unit.start+unit.text.indexOf(quote)`）推出触点所在章。若与模型给的 chapterIndex 不同，且 `touch.quote` 在推出的章内唯一，则改用推出的章，并计数 `chapterFixed`。否则保留模型值，交给 `planForeshadowTouches` 照旧判定。计数只写入 debug 行 `touches-repairs`，不进入界面。
7. **“已处理 N 个伏笔”（中6）。** 在 `toImportView` 中计算，口径同 `wizardRosterFound`：`foreshadowFound` = `touchStash` 里不同 `normalizeWizardName(foreshadowKey)` 的数目，在 `step==='foreshadow'` 且状态为 running 时给出（暂停时会话 phase 为 paused，stepState 仍为 running，所以继续显示）。失败视图不显示。`ImportWizardView` 增加 `foreshadowFound?:number`。LineStep 在 `.ni-progress-hero` 内渲染 `<p className="ni-w-found" aria-live="polite">已处理 N 个伏笔</p>`，与章节进度一起显示。这个数是规划前的数目，所以用“已处理”，不写成“已识别 / 已导入”。UI fixture 增加 `foreshadowFound` 和 `lineProgress` 选项。
8. **排序位置（低7）。** 检查点只追加，带 `order`（批首单元的工作单元序号）。`applyForeshadowPlan` 按 `(order ?? -1, 原位置)` 稳定排序后再分组。schema 中 `order` 为非负安全整数，可选。
9. **暂停（低8）。** 与 `runLineParallel` 相同：出错或暂停后不再派发新批，`Promise.allSettled` 等所有 worker 结束后再抛出。
10. **进度映射（低9）。** `wizardLineProgress` 对 foreshadow 用 coverage 键 `touches`，只用于显示进度。
11. **Golden（低10）。** 用 `scripts/capture-novel-import-prompt-golden.ts` 重生成 touches 键；request trace 不受影响。touches 只有向导一个调用方，新提示词对 legacy 夹具同样生效，可以接受。
12. **台账。** `docs/requirements-traceability.json` 新增 NI-16，用文本插入，不 checkout。
