# 390 绑定 claim patch 独立代码审核

结论：限定增量通过，无阻塞项。可由主代理按冻结构建执行 R45 正常全文验收。本审核只认证代码和合成控制，不证明供应商遵守新协议，也不代表完整场景、全书复核、发布或重开已经通过。未读取真实小说/回复，未启动 App/API。

已按最终 388/389 及两份独立审核检查四产品文件、新显式 fixture、CP、预算和 native schema 测试。

- patch 资格先通过原 preferred 三数组 strict parser。未知键、legacy 元数据、混键、重复/歧义组件、不能确定来源义务或目标归属时，整行回旧 replace，原位置不被过滤。每个原 mention 及 context/link evidence 位置分别进入冻结基底或绑定 claim；部分已证分组保留其完整子证据和原 label/target/relation，未证组件不被当成完整已证关系。
- pc 绑定冻结 draft、来源、slot、位置及工作版本/operation；resolve 只接受当前 CF，mention 恰一个，context/link 非空且只展开对应原位置。每个 claim 恰一次，无自由新增或修改称呼、限定、端点。source-present mention 禁止 reject；全无据分组只有逐位置明确拒绝后才可不组成新组。
- 旧 mention proof 按单位版本、literal 和真实 occurrence 判定，同位置换宽/窄 quote 不能冒充新事实。context 和 link 复核原 owner/限定/完整窗口及双端绑定。带 patch 的完整 composite（含 good rows 和 replace）执行连通性检查，拒绝用共同新 occurrence 桥接两个原 owner；纯旧 replace 路径不新增该分支。
- 应用只组合原冻结基底与绑定决定，再与未改 good rows 形成全量候选。原 strict/source/owner/retention、stable slot/remap、dangling 和最终接受门保留，失败不部分入账。原 native replace/reject 两个分支逐值相同，仅新增闭合 patch 分支；first schema 不变。
- 完整来源、原 draft、当前失败回复、claims、全部 compact choices 和实际 native schema 均继续计原预算。四代、非 stop 终止、root/typed 状态、generic 和外部失败通道未放宽。新独立预算测试实际覆盖二/三代 prompt+schema UTF-8+6000 的 N/N-1、65536 固定空间（含原 16384 wrapper）的 N/N+1及初始超限零调用。

## 实际独立验证

Node 24.18.0 十一文件 **245/245**：CP、CP-budget、native-budget、CC、CO、TR、RR、TR05、ER、native、identity-service。命令为 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test` 加对应 `tests/unit/novel-import-*.test.ts`。日志 `/private/tmp/scene-claim-patch-independent.txt`。

独立 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0，日志 `/private/tmp/scene-claim-patch-independent-typecheck.txt` 为空；`git diff --check` exit 0。原 native-budget 旧用例只适配合法分支数 2→3，并增加旧 replace/reject 完整值和新 strict patch 的明确断言，未削弱原字段/容量/CF-only 控制。CP 首个真实 SDK 功能 RED 与后续补充控制以作者实际日志为准；新增预算 fixture 首跑的到达边界修订不冒称产品 RED。

R45 driver 与 R44 字节相同，final/snapshot verifier 仅标签替换；driver/verifier/freeze 脚本 `node --check` 均 exit 0。原 v5 observer source/CJS 及 21 个依赖哈希逐项仍匹配，可按原冻结复用；本审核未构建或运行它。主代理 26 文件 584/584、类型/构建结果为独立组合证据，不与本审核计数相加。

## 最终 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| claim-patch | `6ebdf8499b28a3ff213f58b73afd4553d24702db75fb3d961396434a8eae4b28` |
| targeted | `5b37012fee00b0c4962d53c655c8e07a210adf959047d77cc89a4f459182c617` |
| service | `a09a2de85eeb934222f3c5c2203ead00788ae759bb076dc92305335adc9f74b9` |
| native | `93bfb88c704c65a6cda030777e7541c264f6aab1112f7afe2a7ee8f76f380940` |
| CP test | `629361dcd64f5f17ffc5cf92f1b69cb8f7488ff5850341ca98b1f96b026c29fa` |
| 显式 CP fixture | `cd83a51651fc17b74cf0cabc09e1e6b7af69cadb6f873e8352f6b7dc98cd73f8` |
| CP-budget test | `3b5368454e711af4b718310a7aa32e5baf836aef105bbfd367cd15dd10bac36e` |
| native-budget test | `0004b53e27b60f7fc6c1b75d0e1697cb157710d9d2136d5f3de24266dee9f93b` |
