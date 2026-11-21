# 495 · 导入物品提速代码审核

日期：2026-11-03。对象：493 方案（以 3R 为准）、494 用例（以“用例审核后的修订”为准）对应的未提交改动。490 物品类别改动不在本次范围，只看它与 493 的交互。审核者没有修改源码或测试。

## 结论：通过

实现与 3R 一致，改动只做了方案列出的 5 处修改，没有多余改动。没有阻断问题。下面的“中”级问题是验收台账缺项，不影响代码正确性，但按 AGENTS.md 应在总结前补上。

## 逐项核对

| 检查项 | 结果 | 依据 |
| --- | --- | --- |
| 轻量策略 / 导入通道 | 正确 | `desktop/service/novel-import-ai.ts:985` 只增加 `kind==='item'`，前置条件仍为 v1 + analyze + entity。`importGenerationModel` 与 `runImportGenerationLane` 共用这个判断，所以 review/reconcile/patch、普通 item analyze、world、非 v1 请求都不受影响。`:979`、`:991` 的注释已同步。 |
| 并发 | 正确 | `desktop/main/novel-import.ts:50` 的 `WIZARD_ITEM_CONCURRENCY=31`，`:815` 只用于 item。world 仍为 4，图片池仍为 2。运行时证据上限 `IMPORT_RUNTIME_MAX_CALLS=32`（`core/novel-import-runtime-proof.ts:3`），31 路加 1 个预留和场景用的是同一套，图片任务不经过 `runtime.invoke`。 |
| scope 缓存 | 正确 | `:1514` 的条件只增加 verified + wizard v1 + analyze + entity + item。失效依据 `ImportRuntimeScopeCache.resolve`（id/epoch/workingRevision/grant），与角色/场景相同。物品步骤不改变 `importScopeHash` 的输入（`core/novel-import.ts:370-378`），所以缓存值和完整计算结果相同，IP-05 也断言了这一点。 |
| `indexed` 门控 | 未变 | `:1036` 的 `indexed` 仍为 character/scene。`trimmed` 只用于 `prose` 和 `relevant`（`:1036/1038`）。`evidenceOptions`（`:1040`）、`entitySchemaFeedback(error,indexed,…)` 与纠错提示（`:1058-1060`）、服务端 `indexedEntityRequest`（`novel-import-ai.ts:374`，sourceUnitIds 派生）对 item 都和原来一样。IP-05/06 断言 item 没有 evidenceOptions，并且纠错提示要求模型抄写 sourceUnitIds。 |
| 合批提交 | 正确 | item 走 `mergeImportArtifacts` 分支（`:780`），这条路径以前就存在，没有改动。冲突去重后写入 `s.conflicts` 和 `w.deferredConflicts`。单个合并抛错只会让该任务 failed，不会触发 `stop`。写盘失败会 `stop`，在途请求被取消（`:792`）。`while(committing)` 保证一次只有一个写入在进行，`this.serial` 保证写入串行。 |
| 与 490 的交互 | 无冲突 | `itemRosterTaken` 只用在清单构建（`:599`）。场景未选父级的目录处理只对 scene 生效（`:1036`）。item 的 `relevant` 不受影响。 |

## 发现（按严重度）

### 中

1. **IP 编号没有登记到台账。** 494 修订第 6 条要求把 IP 编号登记进 `docs/requirements-traceability.json`，但该文件中没有 `IP-01…IP-08` 条目，`git diff` 中也没有这个文件的改动。第 207 行的 `IP-05` 指的是别的用例（legacy google）。如果新条目直接写 `IP-05`，会和这条重名，建议加前缀，例如 `493-IP-05`。AGENTS.md 规定台账是验收依据，应在最终总结前补齐。IP-REAL 在真实运行完成前不能标为通过。

### 低

2. **31 路并发让物品合并顺序更依赖到达时间。** 两个已选物品如果按别名被 `sameEntity` 判为同一实体，谁先合并取决于哪个请求先返回，进而影响 `current` 是谁、别名怎么并、冲突怎么记录（`:780`，`core/novel-import.ts:321-337`）。4 路时也存在这个问题，现在只是更明显。合批没有改变每个批次内的处理顺序。本次不需要修改，记录给真实运行时观察冲突数量。
3. **IP-04 测的是 `runImportGenerationLane`，没有测 `defaults.generate`。** 两者由同一个 `lightImportGeneration` 判断，`generate`（`:980`）也是通过这个判断进入通道，所以结论成立。但测试没有覆盖“生产入口确实调用了通道”这一步。可接受。
4. **IP-05 负例直接调用私有 `c.ai`，并且是在向导已进入 verify 之后调用。** 负例的判断只依赖 `verified` 参数和 `intent`，与当前步骤无关，所以有效。缺点是这个测试依赖私有字段名。
5. **IP-01 的 `until` 超时后不会自己报错**（`novel-import-item-performance.test.ts:21`），靠后面的 `assert.equal` 兜底，失败时报错信息不够直接。CP-16 中的 `until` 会在超时时直接断言失败，写法更好。

## 测试质量

- IP-01/02 在控制器真实路径上证明了 31 路同时在途，runtime.json 也同时记录了 31 项 pending。暂停后 31 项全部被取消，证明为 drained；恢复后已完成的 8 项不会重新请求，请求总数为 64+31。池大小断言能防止有人直接放大通用池。
- IP-03 覆盖了 patch、Anthropic 协议、非 v1 等返回原对象的情况，并断言输入对象没有被修改。CP-02 和 SP-01 只是按新行为更新了期望值，没有因此删掉其它分支的覆盖。
- IP-06 只解析目录 JSON 所在的首行，同时验证了三点：目录确实被裁剪、有相关项保留、只靠别名命中的物品也保留。`request.entities` 仍然包含全部已选物品。
- CP-16a/b/c 已扩展到 item。改动前 item 只有 4 路，达不到 `pending.size===31`，所以这些用例对改动有区分力。
- 独立复跑：`novel-import-item-performance` 加 `novel-import-character-commit` 共 14/14 通过，用时约 16.5 s，没有观察到不稳定。CP-13a 的既有失败沿用 `/private/tmp/shakeink-item-493/cp13a-baseline.txt` 的基线结论，本次没有重复验证。

## 未执行

没有启动 Electron，没有运行真实模型，没有接触 `/private/tmp/shakeink-scene-import-486`。30 秒目标以 IP-REAL 真实运行结果为准。
