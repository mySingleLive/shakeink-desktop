# 角色识别提速 代码审核（241）

日期：2026-10-30。审核范围：`docs/238-roster-speed-plan.md`（含"审核处理"）、`docs/239-roster-speed-cases.md` 对应改动。独立审核，只读源码并运行定向用例。

已运行（Node v24.18.0）：`novel-import-roster-ai`、`novel-import-stage-batches`、`novel-import-wizard`、`novel-import-wizard-prompt` 共 61 项通过；`novel-import-wizard-session` 中 RS-/RF- 共 9 项通过。另用临时脚本复现了下面的 M1（脚本在 `/tmp`，没有写入仓库）。

## 结论：有条件通过

`runRoster` 的并发、epoch、暂停和保存顺序没有发现会丢失或重复覆盖的竞态，也没有发现未处理的 Promise 拒绝。需要先修复 M1：别名截断后，资料文件来源会被无声丢弃。L1–L4 可以记录后再处理。

## 中

### M1 别名截断后，候选与资料文件、证据单元的关联被无声丢弃

位置：`desktop/core/novel-import-wizard.ts:106`、`desktop/core/novel-import-wizard-roster.ts:18-22`。

`mergeWizardRoster` 分组时使用的是全部名称（`g.names`），返回结果时只保留前 50 个别名。`buildWizardCandidates` 随后用截断后的 `[c.name,...c.aliases]` 计算以下内容：
- 匹配到的资料条目（`hits`），由此得到 `sources` 和 `sourceArtifactIds`；
- `evidenceUnitIds`；
- `chapterCount`。

资料条目排在 entries 数组的末尾，所以它的名字最容易落在第 50 个之后。

复现场景：正文中主角的别名累计超过 50 个，资料文件里另有一张以第 51 个以后别名命名的角色卡（例如"愚者"）。实测结果如下：
- 这张角色卡被并入主角组，但候选的 `sources` 是 `['body']`，`sourceArtifactIds` 为空。资料原文不会被拷贝或关联，作者也看不到任何提示。
- 只靠被截掉的别名命中的正文单元（`u4`）不在 `evidenceUnitIds` 里，`importEntity` 也搜不到这些单元（`novel-import.ts:661-662`）。
- 物品类候选如果因此 `fromSource=false`，可能被 `keepWizardItem` 过滤掉。

修复前，别名超过 50 个时保存会直接报错；现在变成数据静默丢失。

建议：
- `mergeWizardRoster` 同时返回完整名称集合，`buildWizardCandidates` 用完整集合计算 hits、证据和出场章数，只在写入候选时截断；或者截断时优先保留资料条目的名字。
- 补一个用例：别名超过 50 个，且资料名落在截断位置之后。

## 低

### L1 手动合并时，被合并项自身的名称可能被截掉

位置：`desktop/main/novel-import.ts:810`。

`keep.aliases` 已满 50 个时，`[...keep.aliases,c.name,...c.aliases].slice(0,50)` 会丢掉 `c.name`，被合并候选的名字从清单中消失，后续导入时也不会用这个名字检索正文。建议优先保留各被合并项的 `name`，或者在超过上限时提示作者。

### L2 快速分批只按第一个单元判断"无上下文"，与 M4 的描述不完全一致

位置：`desktop/main/novel-import.ts:1055`。

`monotone` 只检查 `build(units.slice(0,1)).artifacts.length`。如果某个带 `contextArtifacts` 的阶段（`importSettings:522`、`workflow:1441`、`review:1473`、`omission:1342`）还没有 outline/world/theme 设定，第一个单元又没有提到已有实体，这个阶段也会走快速路径。每个贪心批次仍要通过 `requestFits`，所以不会超出预算，但批次切分会与"仍逐单元规划"的说明不同。建议改为按阶段显式传入标志（例如 `fullMetadata` 或 `monotone:true`），不靠第一个单元推断。

### L3 Anthropic 等默认不思考的模型，识别时反而开启思考

位置：`desktop/service/novel-import-ai.ts:362-365`。

非 DeepSeek 的模型会选第一个显式档位。旧款 Claude 的默认值为 `default` 时原本不开思考，识别时会变成 `thinking:{enabled,budgetTokens:2048}`；Claude 5.x 会变成 `adaptive` 加 `effort:low`。这与方案"降低思考"的目的相反，会增加延迟和费用。这个行为与现有的 `withLightReviewThinking` 一致，不算新缺陷，但建议只在模型原本已开启思考时才降低档位。

### L4 名称定位强度较弱（方案已记录为 L2）

位置：`desktop/service/novel-import-ai.ts:322-327`。

只要模型给出的 `name` 或任一别名在原文中出现，条目就会保留，即使 `name` 本身是编造的。单字别名（例如"他"）几乎能在任何单元命中。界面用 React 转义渲染，没有注入风险。建议至少要求 `name` 本身在原文中出现，或者定位时忽略单字别名。

## 已核对、未发现问题

- 并发与 epoch：`this.ai` 返回结果后先做 `current()` 再推入 `finished`；`flush` 通过 `checkpoint` 再次检查 epoch。暂停后迟到的结果和保存都会抛出 AbortError，不写 stash 或 coverage。被取消的请求返回普通 Error 时，外层 `checkpoint` 因 epoch 已变化而抛出 AbortError，步骤不会被标记为失败（与 RS-04b 一致）。
- 保存顺序：`flush` 用 `splice(0)` 取出全部已返回批次，一次写入。结束时先等 `saving` 完成，再补一次 `save()`，最后到达的批次不会丢失。stash 按原文单元顺序排序，结果与返回顺序无关。
- 出错后：`queue.length=0` 停止取新批，在途批次完成后照常落盘，coverage 恰好是成功批次的并集。
- Promise 拒绝：`check`、`save` 的拒绝都由调用方处理（`.catch(stop)`、worker 内的 try、`allSettled`），没有遗漏。
- 证据容量：并发上限 15 低于 `ImportRuntimeProofTracker` 的 16 个在途上限，暂停证明 `calls ≤ 16` 成立。
- 隐私：`importRosterModel` 按供应商键合并选项，保留 OpenAI Responses 的 `store:false`。DeepSeek 关闭思考后，SDK 不发送 `reasoning_effort`。
- 长任务名额：识别请求绕过 `acquireLongTask` 后，数据库连接仍由外层 `works.runWithGlobal('inbox')` 的 slot 保持，`checkQuota` 和 `recordUsage` 不受影响。
- 调试日志：只在 `SHAKEINK_IMPORT_DEBUG=1` 时输出，`validateImportWizardState` 只打印字段路径和错误码，不含正文或 Key。
- 界面：`rosterFound` 只在 `detect-*` 步骤处于 running 时计算，结果缺省时显示 0，`aria-live=polite`，与 RB-01/02/03 一致。

## 处理（主代理）

- M1：已修复。`mergeWizardRoster` 返回组内全部名称 `names`（不截断），`buildWizardCandidates` 用它匹配资料卡、证据单元与出场章数；只在写入候选时截取前 50 个别名。新增 RS-06b（资料名在第 60 位）；去掉修复后该用例失败，修复后通过。
- L1：已修复。手动合并时被合并项的主名排在别名最前，不会因截断被丢掉。
- L2：已修复。快速分批只对 `intent` 为 roster/touches 且无上下文设定的阶段启用，不再按首批是否带设定判断。
- L3：已修复。模型默认不思考（`defaultThinking` 为 default）时识别请求不开启思考；只有默认思考的模型才降到最低档（RT-02 增加断言）。
- L4：保留并记录（方案"审核处理"已写明只靠别名命中也会保留条目，强度与原引文机制相当）。
