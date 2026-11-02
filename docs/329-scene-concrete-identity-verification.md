# 具体地点身份实现与组合验证（329）

2026-11-01。本轮依据用户选择“按小说中的具体地点分开”，实现323/324批准的有据场景身份账本、正常作者详情/分配界面、scene专用识别与跨批核对合同、按提及归属取材及完整复核credit。其它目标、旧无版本会话、native wire及请求预算保持原合同。

当前只完成代码与定向组合验证；**尚未通过此版本真实《诡秘之主》全文、发布及重开验收**。R27的1055场景阶段与其未完成复核仍是历史结果，不移用于新实现。

## 本轮实际执行

最终冻结候选的7个文件组合：

```sh
node --import tsx --test --test-timeout=60000 tests/unit/novel-import-scene-identity.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-identity-session.test.ts tests/unit/novel-import-scene-identity-actions.test.ts tests/unit/novel-import-scene-identity-closure.test.ts tests/unit/novel-import-scene-identity-ui.test.ts tests/unit/scene-import-persistence-verifier.test.ts
```

Node24.18.0，exit0，**158/158**，fail/cancelled/skipped均0；日志`/private/tmp/scene-concrete-identity-final-scoped-tests.txt`。这158为core37、service44、session16、actions37、closure6、UI16及持久化验证器2；父子test节点按Node实际计数，不扩称158个独立真实业务场景。

依赖均为合成来源或预定生成依赖；实际加载controller/service/schema/bridge/组件及出版准入门，但不把假生成或workspace边界当真实供应商/数据库成功。旧协议导入回归另已定向22个不同文件416节点通过，其中service44与本组重叠，**不相加**为574项。

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run generate
npm run build:ui
```

均exit0。类型日志`/private/tmp/scene-concrete-identity-final-frozen-typecheck.txt`；界面日志`/private/tmp/scene-concrete-identity-ui-build-retry.txt`。首次受限环境Next编译无进展，确认本次两个进程后终止，原命令在可用权限下重跑成功；未把被终止的首跑记为成功。最终`npm run build:desktop`也已exit0（日志`/private/tmp/scene-concrete-identity-desktop-final-build.txt`），构建身份见`scene-import-verification/build-identity-r28.json`。真实验收另补实际结果。

## 最后闭环与RED边界

- CI-C04先经真实service生成合法合成conflict，在当前已满body coverage但待后续ownership复核的受控前置条件，真实runVerify把conflicts改为select，首断实际失败。修复仅在无pending时断言最终ownership，让作者冲突页继续可见；真正publish仍无条件检查ownership。修复后waiting/deferred/未发布断言实际到达。
- CI-C05真实publicationRecord缺新sidecar，首version断实际失败；条件保存version1和独立clone的完整ledger后，JSON roundtrip、strict ledger复验、输入/快照互不影响及旧无版本不加字段断言实际到达。未新增native facts字段。
- 保存重开验证原先按name/parent路径建唯一Map，会误拒合法同名同父节点。新纯验证器按真实ID绑定边、完整7业务字段与children多重集合构建无递归forest fingerprint；保留同型重复节点数量，检查缺父/循环/重复ID/所有节点。2个合成正负控证明字段改变、丢节点或重分配children均失败；不把它当真实DB证据。

独立代码审核见325（service）、326（core，独立37/37、关联86/86及tsc通过）、327（main及出版sidecar增量）、328（UI）；验收driver与重开验证器另见330。用户已明确授权当前DeepSeek传输，原文文件hash保持`04e1a336e29d8437de3f2bd68ffe09f84befebe0748b8750e8f84caeebdd964e`，所有原文/Key/私有journal保留隔离目录，不进入本证据。

R28启动后，330只读验收脚本审核指出两处统计/形状边界：forest接受空ID/非显式null根、比较字段数误记4而实际7。新增第3条验证器测试真实首断RED；最小脚本修复后3/3 GREEN（前2项与158组合重叠，不相加），app来源与bundle未改。验收脚本后续hash单列在build identity的acceptanceOnlyScriptRevisions。此增量不构成新app构建或真实保存重开证据。
