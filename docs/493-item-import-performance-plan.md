# 493 · 导入物品提速方案

日期：2026-11-03。用户要求：《诡秘之主》第一卷（小丑，213章）识别出的全部物品，导入时长不超过 30 秒；参考角色（246）与场景（253）提速方案。

## 1. 计时口径

从第13步“识别物品”清单点击“导入 N 个物品”开始，到第14步“导入物品”全部任务 done、向导离开 import-item 为止，单调时钟，≤30000 ms。包含落盘与内部纠错。识别物品（第13步）不计入，另行记录。每轮新 session，默认全选，不注入旧进度。数量取本轮真实识别结果，不硬编码（截图一轮为 104 项，490 验证轮为 99 项）。

## 2. 已证原因

| 位置 | 事实 |
| --- | --- |
| `desktop/main/novel-import.ts:814` | item 使用 `WIZARD_ENTITY_CONCURRENCY=4`；角色、场景为 31。 |
| `desktop/service/novel-import-ai.ts:985-989` | `lightImportGeneration` 只含 roster 与 character/scene entity。item entity 走 `generateJSON → withLongTask`，与聊天共用长任务队列，`DEFAULT_COST_CONFIG.maxConcurrentTasks=2`（`src/lib/ai/cost-config.ts:9`）。实际最多 2 路，且继承模型默认 thinking。 |
| `desktop/main/novel-import.ts:1513` | 运行时 scopeHash 缓存只用于 character/scene entity；item 每次请求重算整书 `importScopeHash`。 |
| `desktop/main/novel-import.ts:752` | `coalesced` 只含 character/scene；item 每个结果返回都可能触发一次完整 journal 写入，并发高时排队。 |
| `desktop/main/novel-import.ts:1037` | item 的自由 instruction 携带全部已选物品目录；角色/场景只带目标与本材料出现的名称。 |

参考实测：第一卷场景 442 项，31 路 + 轻量策略，entity 阶段 62.9 s（约 4.4 s/请求）。按此估算 104 项约 4 波、15 s 左右，30 s 目标可达，但需真实运行判定。

## 3. 最小实施（只改 item entity）

1. `WIZARD_ITEM_CONCURRENCY=IMPORT_RUNTIME_MAX_CALLS-1`（31），`runEntities(kind='item')` 使用。world、图片池不变。运行时证据 32 项/32 KiB 上限已为场景设定，不改。
2. `lightImportGeneration` 增加 semantic v1 / analyze / entity / item：同一 `importRosterModel` 轻量策略（DeepSeek OpenAI 协议关闭 thinking，其它供应商沿用最轻合法档位规则），并经 `runImportGenerationLane` 进入导入调度，不占聊天名额。不改保存的模型设置；普通 item analyze、review/reconcile、world 不变。
3. 运行时 scopeHash 缓存扩展到 verified 的 item entity 请求。失效条件与既有缓存相同（session/epoch/workingRevision/grant 变化）。unverified 与普通分析仍完整散列。
4. `coalesced` 包含 item：慢写合批、写失败即停止、取消排空沿用角色/场景实现。item 结果仍经 `mergeImportArtifacts` 合并（与场景相同），不改合并规则。
5. item 自由 instruction 目录只保留目标及当前 units 出现其名称/别名的已选物品；服务端 `request.entities` 仍为完整已选目录，引用校验不变。

不改：item 提示词与字段契约、证据规则、units 选取、任务粒度、暂停/取消/重试语义。不扩展 evidenceOptions、sourceUnitIds 派生或 schema2 v2 字段契约到 item（见第5节）。

## 4. 验证

- 单元/控制器：item 31 路实际在途并全部完成、ID 集合相等；暂停排空 31 项证明后恢复；轻量策略只覆盖 item entity 且不改原 options；item 走导入通道不被两个聊天名额阻塞，普通 item analyze 仍排队；scope 64 项只算一次，payload hash 各自独立；instruction 目录裁剪但完整 entities 保留。受影响定向回归（角色/场景性能、调度、缓存、物品类别）、TypeScript、桌面构建。
- 真实 E2E：macOS Electron + 已配置 DeepSeek，指定原件，只选第一卷，角色→场景→物品按默认全选，计时如第1节。成功要求：物品任务全部 done、零 failed/skipped、物品 artifact ID 集合等于已选候选、正文与原件 hash 不变、页面无错误，且时长 ≤30000 ms。超时或失败据实记录，不改写为通过。

## 3R. 独立审核后的修订（以本节为准）

审核见 `493-item-import-performance-plan-review.md`。

1. **第2节更正。** 目录行号为 `novel-import.ts:1037/1039`。“最多 2 路”是默认值：长任务名额为 `maxConcurrentTasks`（用户可设 1–8，默认 2），与聊天共用。
2. **目录裁剪不打开 `indexed`（覆盖第3节第5条的实现方式）。** `indexed` 同时控制引文选项、no-match 纠错白名单和“sourceUnitIds由应用计算”提示，服务端只对 character/scene 派生 sourceUnitIds。item 另设只用于裁剪目录的条件 `trimmed=indexed||kind==='item'`，引文选项、纠错白名单、提示文案与服务端 schema 对 item 保持原样。IP-06 增加断言：item 请求无 `entityTarget.evidenceOptions`，纠错提示仍要求模型复制 sourceUnitIds。
3. **需同步更新的旧测试与注释。** CP-02（`novel-import-character-performance.test.ts:65-67`）、SP-01（`novel-import-scene-performance.test.ts:15`）中 item entity 的断言改为走轻量策略；`novel-import-ai.ts` 中 `defaults.generate` 与 `importRosterModel` 上方注释同步写明包含物品。
4. **图片不在本次范围。** 真实验证与计时都不开启物品图标（默认 `icon:false`）；驱动断言没有图片任务。
5. **30 秒风险与观测。** item 请求带满一整批正文（`:1031`），单请求耗时可能高于场景的约 4.4 s；约 100 项分 4 波时每请求需在约 7 s 内完成，一次纠错重试就可能超时。关闭 thinking 后，“不可解析的 JSON”“输出未完整结束”对 item 不重试，item 仍需模型抄写 sourceUnitIds。真实运行记录每个 item 请求的起止时间分布、重试次数和失败类别，以及首次 `verify()` 耗时。若超时或失败，按观测到的具体原因另立方案，先审后改，不放宽验收。

## 5. 已知风险与范围外

- item 未使用 evidenceOptions，模型引文 no-match 不在 item 的单次纠错白名单中。若真实运行出现，按场景/角色同类方案另行补充，先审后改。
- item 模型契约仍用 v1 字段表（只有知识归属字段），未告知 appearance/acquisition/effects/aliases/tags。这是既有资料完整性问题，不属于本次提速；记录给用户决定。
