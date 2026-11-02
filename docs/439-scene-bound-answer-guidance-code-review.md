# 绑定答案显示与拒后指导独立代码审核

结论：最终无阻塞，可由主代理冻结新构建并执行新的正常全文验收。本审核不代表小说导入、七分钟目标、发布或重开通过。

独立 Node24 八文件组实际 164/164，失败、取消、跳过均为 0；包含新 BG、原 BD、CO、CP、CP-budget、bound-budget、CI-service、eligible-choices。主代理最终 33 文件为 667/667，类型、桌面构建、差异检查均 exit0；已核对应最终收据的 33 测试、22 helper、57 产品当前 SHA，全部一致。164 包含于 667，不能相加。未执行 App/API 或全仓测试。

产品范围符合 437/438。`sceneRosterBoundTaskDisplay` 克隆后深冻结显示副本，连续印出 answerNumber 与局部 optionNumber，完整 assignment、明确 reject 空数组、原 slot 和拒绝资格保留。独立读取器还原原 tasks，拒绝跳号、重复、重排、错层、错列和错类型；测试适配没有改变原业务 oracle。共享 choices 仍为原完整八列。

已独立逆构 bound 文件：仅去除新增指导常量及末尾两个显示/诊断 helper，即全文精确恢复 R61 的 `fdbd7117589833b75d47b784ffc7a827a9df0db72e92fa19fd0bbdfa0cf7f755`。原编译限额、完整方案枚举、私有绑定、逐位置 decode、Native 构造及原 choices 显示均未改变。AI 与冻结 R61 源的差异仅为新增显示、静态提示、拒后诊断及可信指导的 UI 类别匹配；独立逐段核 strict boundRecord、原 decode/convert、accepting apply、完整 roster/source/retention 门字节相同，预算检查后才 activate 的顺序保持。

active answers 失败时使用答案协议指导；旧显式 repairs 保留原兼容指导，混根仍拒绝。数量失败只报可信完整数量；局部类型/范围及 replacement 指导不回显未知键、模型值或异常消息。mentions 的单 evidence 对象、context/link 的非空 evidence 数组及三种互斥元数据写明，原严格三分支继续拒绝非法组合。新增反馈仅在原门拒绝后运行；来源/保留的原安全反馈仍保留。首轮、根恢复、未解析重识别及其它业务的接受门未变。

本轮预审发现并关闭一个 P2：实际混合 deck 为 replacement 后接 selection，第一项 choice 为 0 或超共享目录上限时，原 decode 先在第一项 fromChoice 拒绝，而初稿诊断只检查 record 形状、误报后面的 selection。最终 AI 回调在拒后按原 mentions/context/links 顺序复核原 fromChoice，不提前执行 primary/canonical/source 晚门；当前 BG08 真桥两个时序均通过。修复前有效证据是独立真实 deck 探针；作者最初 BG08 日志误将 feedback:string[] 当对象，其 RED/所谓 GREEN 不作为有效功能证据。最终 feedback.join 修正保留原断言，已纳入本次 164 与根 667 的真实通过结果。BG01/BG02 的原功能 RED 与该无效草稿日志分开记录。

独立核最终 `r62-actual-new-prompt-budget-v2-private.json`：57 测量源当前 SHA 全相同；130 首轮及 196 历史代，共 326 个新完整提示均在原预算内，errors0、maxFixedRequired63285、minHeadroom689730，原 70 接受/20 拒绝保持。providerCalls0、newSupplierBehaviorVerified=false、oldInputHashesClaimedEqual=false；没有裁来源、draft/current、choices/keep/tasks/schema 或提高容量。这是本地历史复核，不是新供应商或全文成功证明。v1 不代替最终 AI 修复后的 v2 收据。

最终冻结 SHA：

- bound：`15c1dd6eeeb6fefbabde3e7bfab99881eb2900b3d72d10bee2d57001ad537a4e`
- AI：`58b8e75f3a9c6f7b21f15f57f0360a10936a011fe01c884e8ebab7abff26009b`
- 新 BG：`00038bd6b593f6a48da9f83a4a5fe14794023f36340528501821f3dbf9eef484`
- 独立显示读取器：`af192638d1f06684e223074619735a4353bc4613e51362602110368243e2341b`
- 共用 bound fixture：`9103fca90cae4207c5894897fbd0b8d2a2d083bf8a4423457a8072331cc9223e`
- CO：`9da9d8fed15919ccfd239abb2037317d26791aec8d3d5e5ab1350fcf44af0c5a`

实际独立命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=2 tests/unit/novel-import-scene-roster-bound-guidance.test.ts tests/unit/novel-import-scene-roster-bound-decisions.test.ts tests/unit/novel-import-scene-roster-choice-only.test.ts tests/unit/novel-import-scene-roster-claim-patch.test.ts tests/unit/novel-import-scene-roster-claim-patch-budget.test.ts tests/unit/novel-import-scene-roster-bound-budget.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-roster-eligible-choices.test.ts
```

独立日志 `/private/tmp/scene-bound-guidance-independent-green.txt`；另执行两源与冻结 R61 的 diff/段落比较、bound 全文逆构、最终预算及 scoped 收据 SHA 断言、审核文档 diff 检查。本审核未读取小说、真实生成文本或 Key，未修改产品和测试。仍须新的正常全文实际结果验证模型能否可靠遵循新指导，以及场景/正文完整、发布和重开全部验收门。
