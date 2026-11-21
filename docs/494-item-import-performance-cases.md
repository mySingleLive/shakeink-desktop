# 494 · 导入物品提速用例

日期：2026-11-03，对应 493。合成数据只用虚构名称；真实原件只在隔离目录读取。

- IP-01 并发：64 个合成物品，仅推断 item，经控制器真实路径进入第14步。实际在途 entity 请求达到 31 且 runtime.json 同时记录 31 项 pending；放行后全部 done，artifact ID 集合等于已选候选，dropped/skipped 为空，向导进入 detect-world 或其后。
- IP-02 暂停：31 项在途时先放行 8 项并落盘，暂停后 31 项全部取消，runtimePauseProof 为 drained、calls 31、remaining 全 0，已提交 artifact 不变；恢复后全部完成，已完成的 8 项不重复请求。
- IP-03 轻量策略：`importGenerationModel` 对 semantic v1 / analyze / entity / item 返回关闭 thinking 的副本，保留 store:false 等原 options，不改输入对象；普通 item analyze、review、reconcile、world entity、非 v1 请求返回原对象。CP-02、SP-01 中 item 的旧断言按本方案更新。
- IP-04 调度：两个聊天名额占满时，item entity 经 `runImportGenerationLane` 不排队；普通 item analyze 仍排队等待。
- IP-05 范围缓存：64 项物品真实控制器路径，整书 scope 只计算一次，每个请求 scopeHash 等于 `importScopeHash(s,'analyze')`，payloadHash 两两不同；unverified 调用与普通分析不走缓存。
- IP-06 目录：item instruction 目录只含目标及当前 units 出现的已选物品名称/别名，确有无关项被省略；`request.entities` 仍为全部已选物品。item 请求不带 `entityTarget.evidenceOptions`；纠错重试的提示仍要求模型复制 sourceUnitIds（不出现“sourceUnitIds由应用计算”）。
- IP-08 合批提交：CP-16a/b/c（`novel-import-character-commit.test.ts`）扩展到 item。慢写时其余结果合为一次写入；暂停等写盘屏障并丢弃未提交缓冲；写失败即停止调度且不报全部成功。改动前 item 只有 4 路，三项都在 31 路窗口前失败；CP-16c 的停止语义在改动后作为回归守卫。
- IP-07 回归：角色/场景性能、调度、缓存、物品类别、暂停恢复定向用例全部通过；TypeScript `--noEmit` 与桌面构建通过。
- IP-REAL 真实：macOS Electron、已配置 DeepSeek、指定原件只选第一卷，角色、场景、物品默认全选。从点击“导入 N 个物品”到离开 import-item ≤30000 ms（单调时钟）。物品任务全部 done、零 failed/skipped，artifact ID 集合等于已选候选，原件与正文 hash 不变，页面无错误。另记第13步识别耗时。不开启物品图标，断言无图片任务。记录每个 item 请求的起止时间分布、重试次数和失败类别，以及首次 `verify()` 耗时。超时或失败据实记录。

## 用例审核后的修订（以本节为准）

审核见 `494-item-import-performance-cases-review.md`。

1. **IP-06 目录解析。** 纠错提示接在目录之后（`novel-import.ts:1059-1060`），测试只解析 instruction 首行的目录 JSON。目录裁剪另测只靠别名命中的物品仍保留。
2. **缓存负例。** 新增断言：unverified item 调用与普通 item 分析不调用 scope 缓存；计数不按步骤过滤。
3. **合批提交。** 见 IP-08。
4. **池大小。** IP-01 断言 `WIZARD_ITEM_CONCURRENCY=31`、`WIZARD_ENTITY_CONCURRENCY=4`、`WIZARD_IMAGE_CONCURRENCY=2`，防止直接放大通用池。IP-01 断言无图片任务，仅推断 item 时向导进入 verify。
5. **IP-03 补充。** 增加 patch 阶段与 DeepSeek Anthropic 协议分支，二者返回原对象。
6. **IP-07 具体文件。** `novel-import-item-performance`、`novel-import-character-commit`、`novel-import-character-performance`、`novel-import-character-scope-cache`、`novel-import-scene-performance`、`novel-import-scene-scheduling`、`novel-import-item-category`、`novel-import-wizard-prompt`、`novel-import-roster-ai` 全部通过。IP 编号登记进 `docs/requirements-traceability.json`。
7. **IP-REAL 防挑选。**
   - 记录物品数 N。N 低于 90（490 轮 99、截图轮 104 的约九成）时不计为性能通过，单独报告。
   - 验收取实现后首个完整轮次。若该轮因供应商故障（HTTP 4xx/5xx、网络）中断，可重跑，所有轮次全部报告；不得因“慢”而重跑挑选。
   - 计时起点为驱动点击“导入 N 个物品”前的 `performance.now()`，终点为首次观察到 step≠import-item；轮询间隔 ≤500 ms，结果附上轮询间隔作为误差上限。
   - 记录在途峰值（runtime.json 同时 pending 的最大数）、物品请求起止分布、当时的 `maxConcurrentTasks`。thinking 已关闭的证据来自 IP-03 单元用例与构建产物，真实运行不读取 Key 或请求体。
