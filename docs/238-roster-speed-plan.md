# 角色识别提速与进度计数 技术方案（238）

日期：2026-10-30。基线提交 `3162a4f`。

## 需求

1. 导入向导"正在识别角色"等待界面显示"已识别 N 个角色"，N 随识别结果增加（场景/物品/世界观同一界面同样显示对应类别）。
2. 《诡秘之主》（`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`，GB18030，1402 章，工作正文 4,803,440 字符）全书角色识别不超过 1 分钟。
3. 修改后用真实导入验证以上两点。

## 现状（源码与实测）

- `desktop/main/novel-import.ts` `runRoster()`：`stageRequests()` 按预算分批（v2 预算 81,920 字符/批 → 全书 59 批），**逐批串行** `await this.ai()`，每批之后 `checkpoint` 保存 32 MB 草稿。
- 上次真实运行（`app-data-wizard-20261029/.../runtime.json`）：36 次 roster 调用耗时 65–235 s，平均约 115 s；全书串行约 1.9 小时。
- 每批耗时来源：DeepSeek-V4.1-Flash 按模型默认思考强度 `high` 运行；输出契约要求每个条目附 `evidence:{unitId,quote}`（10–30 字原文逐字摘录），输出量大且是结构失败主因（上次失败"角色类型、来源证据、角色清单"）。
- 服务端 `generateText()` 经 `withLongTask()` 占用全局长任务名额，默认 `maxConcurrentTasks=2`，导入请求也受此限。
- 运行时证据 `ImportRuntimeProofTracker` 每进程最多 16 个在途调用（`maxTokens` 上限 16，暂停证明 `calls` ≤16）。
- `stageRequests()` 在存在 `budgetPolicy` 时逐单元序列化整个请求判断是否装得下，全书 5589 单元实测 2.2 s。
- 本地其余开销实测：`encodeImportJournal` ≈90 ms、写盘+fsync ≈250 ms、`buildWizardCandidates` ≈1.1 s、`toImportView` ≈7 ms、`mergeWizardRoster(1193 条)` ≈14 ms。

结论：瓶颈是 59 次串行、每次带高强度思考与逐字引文的模型调用。

## 方案

### A. 识别批次并行（主进程 `runRoster`）

- 新常量 `WIZARD_ROSTER_CONCURRENCY=16`（等于运行时证据在途上限，不改证据格式）。
- 先一次性生成全部未覆盖批次请求；开始前 `verify(s)` 一次；16 个 worker 从队列取请求，`this.ai(s,epoch,request,true)`（已核验，不再逐请求读源文件两次）。
- 结果合并：worker 把结果放入缓冲，非阻塞地触发合并保存；合并在 `checkpoint` 内一次写入所有已返回批次（stash 与 `coverage['roster:'+kind]`），保存中到达的结果并入下一次保存。worker 不等待保存即取下一批。
- 首个非中止错误：停止取新批，取消其余在途请求（`cancelAi`），等全部 worker 退出、已成功批次落盘后，按现有逻辑标记步骤失败；"重新识别"只重发未覆盖批次（NIW-C22 不变）。中止/暂停错误照旧上抛。
- 全部完成后再 `verify(s)` 一次，然后 `buildWizardCandidates` 与现有收尾逻辑不变。

### B. 输出契约去掉逐字引文（核心 `novel-import-ai-payload.ts`、服务 `novel-import-ai.ts`）

- roster 契约改为 `roster:[{name,aliases,roleType}]`（场景 `parent?`、物品 `itemType/important`、世界观 `parent?/settings`），不再要求 `evidence`。
- 服务端 roster 条目 schema 中 `evidence` 改为可选（兼容模型仍返回）。服务端为每个条目**本地定位证据**：按请求单元顺序找第一个原文包含 `name` 或任一别名的单元，`evidence={unitId,quote:命中的名称}`；找不到则丢弃该条目（与现在"无法定位即丢弃，不猜"一致）。模型若给了 evidence 且能定位，优先保留模型的。
- 下游只用 `evidence.unitId`（`rosterStash.unitId` → `evidenceUnitIds`），语义不变。
- `touches` 契约与 schema 不变。

### C. 识别请求使用轻量思考、不占全局长任务名额（服务 `novel-import-ai.ts`）

- `defaults.generate` 对 `intent==='roster'` 的请求降低思考：DeepSeek 系（`providerFamily==='deepseek'`）发送 `thinking:{type:'disabled'}`（名称清单是抽取任务，不需要推理）；其他供应商用 `withLightReviewThinking`（模型最低显式档位，无档位不变）。
- roster 请求在 `runInsideLongTask` 中执行，不占聊天用的全局长任务名额（默认 2）；并发由主进程 A 的上限约束。
- 估算：全书约 2000 条清单 × 约 25 token ≈ 5 万输出 token；16 路 × 约 80 token/s ≈ 40 s，另加首包延迟。
- 其他导入请求不变。

### D. 分批快速路径（主进程 `stageRequests`）

- 先用 `splitBudgetBatches(units,budget.characters,budget.maxUnits)` 贪心分批，对每批做一次 `requestFits`；全部装得下时直接使用（与逐单元算法产生相同批次：请求体积随单元单调增加，边界都由字符/单元数决定）。任何一批装不下则退回现有逐单元算法。所有阶段共享，结果不变，仅省时。

### E. 等待界面计数

- `ImportWizardView` 增加 `rosterFound?:number`：当前步骤为 `detect-*` 且有 `rosterStash[kind]` 时，等于 `mergeWizardRoster(kind,stash).length`（按名称/别名合并后的不同条目数）。不持久化新字段，草稿格式不变。
- `NovelImportWizard.tsx` 运行态在说明下方加一行 `<p aria-live="polite">已识别 {N} 个{类别}</p>`，未开始返回结果时显示"已识别 0 个角色"。每次合并保存都会推送新视图，N 随之增加。

## 不改动

预算策略与范围哈希、草稿/运行时证据格式、实体导入并发、图片、发布流程、其他阶段的提示与校验。

## 风险与取舍

- 去掉逐字引文后条目证据只是"名称在该单元出现"，强度低于原文摘录；但下游从未使用 quote，仅用 unitId 选正文，且名称必须真实出现在原文才保留，不会凭空收入。
- 关闭/降低思考可能漏掉少量低频角色；角色清单作者可在下一步编辑，且识别后仍按原文统计出场章数。真实运行与上次结果（同书 344 个候选，覆盖 3324/5589 单元）对比主要角色召回。
- 16 路并发可能触发供应商限流；限流错误走现有失败/重新识别路径（只重发未完成批次）。
- 1 分钟目标依赖供应商实时延迟：59 批/16 路≈4 轮，每轮需≲13 s。真实运行若超时，记录实测数据并另行评估（例如关闭思考），不虚报通过。

## 验证

- 单元/会话测试见 `docs/239-roster-speed-cases.md`。
- 真实运行：`scripts/run-lotm-wizard-import.mjs` 新导入《诡秘之主》，在 `detect-char` 记录开始/结束时间、过程中多张截图与 `rosterFound` 序列，识别完成后停止（不继续导入实体），证据存 `docs/evidence/`。

## 审核处理（`docs/238-roster-speed-plan-review.md`）

- H1：`importRosterModel` 改为按供应商键合并思考选项，保留 OpenAI Responses 的 `store:false`（RT-03）。
- M1：识别开始前核对来源，运行中每 30 s 核对一次；每次 `infer` 都在构建清单前无条件核对（含全部已覆盖的重新识别）。结尾核对失败时步骤失败，不生成清单（RS-05、RS-05b）。
- M2：并发改为 15（证据上限 16 留 1 个余量）。
- M3：出错后不再取消在途批次，只停止新批；在途批次完成后落盘，重新识别只发剩余批次（RS-03）。暂停/停止仍取消在途请求（RS-04、RS-04b）。
- M4：快速分批只用于请求不带上下文设定的阶段（识别、触点），带 `contextArtifacts` 的阶段仍逐单元规划。
- L1：识别提示整段不再出现 evidence/quote 要求（WP-04）。
- 合并结果与返回顺序无关：stash 按原文单元顺序排列后再保存（RS-07，用例审核第 6 条）。
- 别名上限：真实运行发现合并后别名可超过草稿上限 50（主角在全书识别中积累到 50 以上），导致保存失败。`mergeWizardRoster` 与作者手动合并都截取前 50 个（RS-06）。
- 记录的限制：`rosterFound` 只统计正文返回的不同名称，不含资料文件；物品最终清单还会按出场章数过滤，世界观按世界和设定计数，所以识别完成后的列表数可能与最后一次显示的数字不同（RF-01）。只靠别名命中也会保留条目（L2，与原引文机制强度相当）。识别请求不再受 `maxConcurrentTasks` 约束（L3）；DeepSeek 走 Anthropic 协议时不改思考选项（L5）。
- 名称合并规则（真实运行发现）：原规则只要两个条目共享任一名称就合并。全书并行识别后，"魔术师""海神"等称号与个别批次的误标（把别的角色列为主角别名）会把主角与佛尔思、卡维图瓦等合并，配角票数压过主角票，主角显示为配角，显示名也随批次返回顺序变化。现改为：一个条目的主名被另一个条目列为别名，且这种关联至少出现在较少一方主名条目数的一半中才合并；只共享别名不合并；其他组的主名不作为别名；显示名取出现次数最多的主名（RS-06c、RS-06d）。
