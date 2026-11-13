# 548 用例独立审核

**结论：需修订后再实现**（2 blocker，6 should-fix）。

## Blocker

1. **缺“会话已清、索引写失败”用例**（547:38 的顺序依据，`versioned-store.ts:93` 在 revision 不符时抛 `RevisionConflict`）。可用真实路径构造：直接调用 `works.unregisterUnavailable(id, async()=>{await forget(); 外部改写 catalog.json 使 revision+1})`。
   新增 **UW-11**：“beforeCommit 后 catalog revision 冲突 → 请求失败；ledger 中该会话已 deleted；catalog 仍含作品；`GET /api/chat/conversations` 200；重试 DELETE 200，且第二次 forget 不改任何位置（幂等）”。
2. **UW-0x 未规定启用会话账本**。`LocalDispatcher` 构造时取 `conversationTransfersFor(works)`（`dispatcher.ts:27`），未先 `configureConversationTransfers` 时 transfers 为 undefined，会话清理被跳过，UW-01 仍会通过。要求 A 组全部按生产方式（`index.ts:58`）先 configure 再 new dispatcher，finally 中 dispose。新增 **UW-12**：“transfers 未配置时 DELETE 不修改 catalog，并返回错误”。方案需补这一分支的定义。

## Should-fix

3. **UW-06 写清怎样构造数据**：作品健康时用 `works.runWithGlobal(a.id)` 建 conversation，再调 `manager.current(id)` 登记位置（同 `conversation-transfer-101-review.test.ts:26-55`），然后 close 并 rename。删除前须断言会话列表因 `dispatcher.ts:104` 失败。另补“已迁往 B 的会话 / 已 deleted 的位置不被改动”（547:34 写了 gate 内重读）。
4. **UW-07 写明期望**：重启后调 `recoverConversationTransfers(works)`，期望 `{phase:'pending',code:'CONVERSATION_DELETION_PENDING'}`。依据：`conversation-transfer.ts:32,142` 用于识别的文案是“作品不在本地目录索引中”（`workspaces.ts:365`）。还要断言 deletion phase 仍为 `committed`。
5. **UW-08 可以实现，但须说明测的是服务层**：`works.open(await directoryIdentity(path))` 满足 `verifySelection`（`workspaces.ts:129`），改名不会改变 inode，但这条路径不经过原生选择器，不能写成“打开作品目录”已通过。期望拆成两步：(a) recover 之前，列表因 deleted 位置跳过该会话（`dispatcher.ts:111`），但库中仍有这一行；(b) recover 之后 phase 为 `complete`，库中该行已删除。stale-lease 作品重新打开会被锁拒绝，需另列一条。
6. **缺与锁修复的并发用例**（547:61）。新增 **UW-13**：“stale-lease 作品删除后，调用 `closedWorkLeaseTarget(works,id,()=>{})` 抛 `WORK_LEASE_NOT_REGISTERED`，锁文件字节不变，catalog 不被重新加入”。再补 **UW-14**：两个 DELETE 并发，结果一个 200、一个 404（经由 serialize）。
7. **547:29 的 `failedRetirements`/`WORK_BUSY` 分支没有用例**。真实环境下很难构造这种状态。要么写单元用例并在台账中标为“注入”，要么从方案中删去这一分支，不能不覆盖也不说明。
8. **界面缺口**：UW-24 要预置该 novelId 的 tab 和一个无关 tab（`useTabsStore.setState`），断言只关闭前者，并断言 `/api/chat/conversations` 被重新请求、toast 文案正确。缺“重新加载进行中时删除按钮禁用”（547:48）。缺网络异常或非 JSON 500 时显示通用文案、不显示原始错误的用例。

## Nit

- UW-01：断言原路径在探测后仍不存在（探测没有重建目录）。
- UW-10：用 chmod 000 的 catalog.json 触发真实 500，断言返回通用文案且不含路径。
- UW-05 要校验 `{error,code}` 的形状；`GET /api/works/{id}` 应保持原有 404 行为。
- UW-28 的“Web 返回错误时按 UW-25”含义不明确，需要写出具体期望。
- B 组使用 fetch 夹具，台账只能记为“界面·夹具”。C 组的真实目标系统验收要包含：一个关联了会话的目录缺失作品、一个 stale-lease 作品，删除后会话列表可以打开，目录文件字节不变。
