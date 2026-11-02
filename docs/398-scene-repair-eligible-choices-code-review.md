# 398 单项候选与可信定点反馈独立代码审核

结论：最终冻结增量通过，无阻塞项。可由主代理按构建冻结执行 R47 正常全文验收。本次不认证新供应商行为或完整导入、复核、发布及重开通过；未启动 App/API，未读取实际小说或模型回复。

依据为最终 396/397 及两份独立审核。范围为 claim-patch、targeted-repair、ai、新 diagnostic helper 及两个定向测试。

## 源码结论

完整目录在所有 row 和 wholeUnits 建立后，才派生 eligibleChoiceRefs。显示集合保持原目录顺序，仅使用原 source/literal、旧 occurrence、固定 label、旧 context 和固定基底重复谓词；完整全局目录、CF、窗口和 keep 未删。集合及返回副本冻结。apply 不读取 eligible 列表作额外白名单，不自动选首或 reject；newMembers、联合证据、跨 owner 桥接和全部原接受门仍独立运行。原 replace 未列入偏好 candidates 的合法全窗口正控仍接受，没有暗缩原接受集合。

定点反馈只由实际 guard 捕获的 Error 经私有 WeakMap 关联，active.feedback 再校验本事务已声明 rr/pc。未知 ref、伪造 Error 的属性/消息、未声明模型值不参与诊断；当前 catch 直接读取当前 Error，不把上一代或其它事务的分类继承给后续错误。仅输出闭合 reason、应用 ref、固定 mentions 字段/数字下标，单条 UTF-16 ≤250；原通用修复事务 issue、kind/finish/四代及业务标签保留。反馈补充不会替代拒绝或修正模型选择。

只有 native 且有 patch 时采用同义紧凑指导，引用本轮实际完整 JSON schema。非 native/无 patch 的完整示例路径保留；完整来源、原 draft、当前回复、全部 choices/keep/eligible 和 schema 字节不裁，逐代仍过原 fixed/context/payload 门。首轮、root、Native/CF 合同及原角色/用量/授权/取消行为未改。

## 实际独立验证

- Node 24.18.0 十五文件 **305/305**：EC、EC-budget、CP、CP-budget、identity-service、TR、RR、TR05、CC、CO、native、native-budget、ER、BR、error-labels。命令为 `node --import tsx --test` 加对应 `tests/unit/novel-import-*.test.ts`，日志 `/private/tmp/scene-repair-eligible-independent.txt`。
- 另执行两条合成真实 SDK 桥控制：原 replace 选择真实 CF 但 literal 在窗口中为 0 次/多次，均维持四代拒绝；反馈仅含本事务 rr、mentions/index=0 和固定 missing/repeated reason，长度 ≤250，不回显 CF/引文。未修改仓库测试。
- 独立 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0；日志 `/private/tmp/scene-repair-eligible-independent-typecheck.txt` 为空。`git diff --check` exit 0。旧 CI 两个 16K 正控未改容量或断言并通过。
- 独立核对主代理完整预算 v2 的四个 measurementSources 与最终源逐一相同：130/130 首提示、77/77 历史输出对应的新提示均已测，errors=0、allMeasuredFit=true、providerCalls=0、historicalAcceptanceUnchanged=true。报告明确 oldInputHashesClaimedEqual=false、newSupplierBehaviorVerified=false。v1 超 fixed 的失败保留；v2 通过来自同义指导压缩，不是裁材料、扩大预算或新供应商成功。
- R47 driver 与 R46 字节相同，final/snapshot verifier 仅标签替换；driver/freeze 语法检查通过。两个 PRIVATE observer source/CJS 及其全部声明依赖哈希未变；未运行 observer/App/API。

主代理 28 文件 594/594、类型/构建为另一次组合证据，不与本审核节点数相加。实际预算记录为 PRIVATE `r47-actual-new-prompt-budget-v2-private.json`；公开文档只记录计数/哈希和验证边界。

## 最终 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| ai | `88d625db2a0cf52b48894b7fbdfd6f57e5370eca4e4613eda6dc5a713b6a3d71` |
| claim-patch | `d60e246e9daf21c473f52d2d447b26980a647f3d27f693abaf60229b594f2fe6` |
| targeted-repair | `a0ac219d344dfc228bf603bd59e9179bd7f60684f3f91912f7a043a33ca009b3` |
| repair-diagnostic | `ba522e37bcb8d41aa02e76380ef90e60bbbe766f9d3c66888bca7e4219c89ca4` |
| eligible-choices test | `747e2a63f8f5544a1a380fa210e468ee462b3379322cccb4b5ad777e04691ec1` |
| eligible-budget test | `d23d0399769d62305fb7f9eee63e7853fc6c7e1275c06f00f86890c7571d2c9b` |
