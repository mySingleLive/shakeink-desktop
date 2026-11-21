# 406 应用绑定修复决定独立代码审核

结论：最终冻结增量通过，无剩余阻塞。可由主代理冻结后执行 fresh R49 正常全文验收。本审核未调用 App/API、未读取实际小说或模型回复；不认证模型会遵守 Native schema，也不代表完整导入、复核、发布及重开已经通过。

已按 404/405 主体、good-row 入链及八列显示增量和对应独立审核，检查五产品源、新 BD/budget/fixture、必要旧 Native/reader/TR05 适配。

## 源码结论

- 私有 deck 深拷贝并冻结完整原输入，按原坏 slot、mention/context/link 位置绑定。新 answers 严格检查根、数量、任务类型、安全整数和范围；错误新根不回退洗成旧根。selection 的编号至少 1；0 只对应允许整行 reject 的 replacement。原 repairs 三种 disposition 独立严格兼容，原 replacement 的 name/aliases、primary、三数组三支逐字段保留，仅将证据本地号映回原 CF，再执行原全部校验。
- 组编译完整枚举非空多 CF 子集及每原位置的明确决定，冻结基底不参与删除。共用局部 predicate 不给其它 claim 填默认值；原全 apply 仍检查 newMembers、完整关系、跨行 owner 桥接及最终来源/retention。每组 256 方案、每行 4096/每请求 65536 的扩展/校验前计步包含 partial 与非法分支；未证明枚举完整就撤回整行全部 selection，不能保留前 N 个或局部任务。
- 编译或实际提示预算不足时，仅在激活前改该整行为完整 replacement；不减目录、来源、keep 或语义表达能力。激活后的各代复用同一 deck/draft/schema，不能按错误答案重建或改号。最多四代、非 stop、授权/角色/用量/取消及原机器接受门保持。
- boundCanReject 仅额外排除“原逐行验证通过且不可改 good row 的 link 精确指向此坏 slot”时必败的 0。原 canReject 事实、完整 replacement 和旧根 reject/remap 原义保持；bad row 的 nested proof、同名或其它 slot 不触发该限制，不删 link/补目标或默认保留坏内容。
- provider-view choices 固定八列逐项保留显式原序号、CF、单位/完整范围、sourceRef、flags 和 literals；无重排、去重或缩窗。flags 只编码原工厂 true/缺省，不吞掉显式 false；私有 entries/compactEntries/resolve/哈希不改。严格 reader 展开与原完整对象深等，旧 object 分支保留原义。tuple 是阅读表示，不是接受模型坐标的新入口。
- 活动提示明确 answers 首选，旧 roots 只作兼容/历史背景；实际 Native tuple schema 保留完整 replacement 三支和原字段容量，默认 cap/thinking/出口不变。本地严格解码和原业务门独立于供应商 strict 子约束执行。

## 实际独立验证

Node 24.18.0 最终十七文件 **348/348**，日志 `/private/tmp/scene-bound-independent-final-r2.txt`；命令为 `node --import tsx --test` 加 BD、bound-budget、EC、EC-budget、CP、CP-budget、identity-service、TR、RR、TR05、CC、CO、native、native-budget、ER、BR、error-labels 对应文件。独立完整 `tsc --noEmit --incremental false` exit 0，日志 `/private/tmp/scene-bound-independent-typecheck-final-r2.txt` 为空；`git diff --check` exit 0。

旧 TR05 首次 6 叶子及 3 父节点失败来自原 selection 基线还能合法压为 replacement。最终只用坏行未知字段显式固定 full replacement，并逐实际提示断言所有任务均 replacement、slot=0；原 full prior、65536/16384/6000、角色、16000、0/未知容量和 N±1 断言全部保留，B4/B5 未改。未抬容量或把越界放行视为成功；首次失败日志保留，不与最终重跑相加。

另独立复跑合成差分：逆构旧完整 claim-patch 源 SHA 精确为 R47 `d60e246e9daf21c473f52d2d447b26980a647f3d27f693abaf60229b594f2fe6`，与新 apply 比较 **291** 组合、**50** 接受，结果/拒绝相同；不是两个共用新 predicate 的入口互证。记录 `/private/tmp/scene-bound-group-equivalence-independent.json`，0 API/产品写入。BD 同时覆盖真实 SDK→ModelService/Gateway→fake 最终 fetch 的 selection/replacement 两例、完整 schema/Ajv、默认输出及局部合法但跨 owner 仍拒等控制。

独立核对预算 v3 全部 **57** measurementSources 与当前冻结源一致：130 first + R46 77/R47 59，共 136 历史新提示全测、errors=0、最大 fixedRequired=63751≤65536、providerCalls=0，历史 50 accept/13 reject 不变。保留 v1/v2 失败；不冒旧 input SHA 相同或新供应商行为。收据为 PRIVATE `r49-actual-new-prompt-budget-v3-private.json`。

主代理最终 30 文件 637/637、类型/构建为另一次组合证据；其 receipt 的 30 test、19 helper、57 product 哈希已独立逐项核对，不与本审核计数相加。两个 observer source/CJS/声明依赖未变；R49 driver 与 R47 字节相同，driver/freeze 语法检查通过。未启动实际验收。

## 最终 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| bound-decisions | `98818a44b717300d385bc79d552589010b3a93f3f122b7d2bd1bc399c4fff951` |
| claim-patch | `55dcde059a2baac4fad37a6a5c99b0034e2c5e104fb8ab2796d892b6e17e7894` |
| targeted-repair | `b6b07e1b5495409564e3cba2dd12cb2e9555622cb843fa073301274cc6f282cc` |
| ai | `a0f1fe3c5ddc21356a5dd31939cc40646dfc8bab424541536ac098801c49cd2a` |
| native | `ea333267c1491314701764dea98782814d56c4cd640b05554b1da3e87b1da68a` |
| BD test | `d558f7d36a0474b9b33f16b88ef7240f00349df117c74471d8bfe272c311b319` |
| bound-budget test | `c16cce0a07a9b3868028f66baf1098070d4d03a010266e0ecefbeba6a965b0df` |
| TR05 final test | `49cbe3dae0c3c5475f21182138308ed18d0e33dcc6e4e198434301dc6a88b893` |
