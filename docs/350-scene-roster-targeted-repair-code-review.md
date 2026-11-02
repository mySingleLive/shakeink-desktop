# 场景清单定点修复：独立代码审核

结论：**限定范围通过，无剩余阻塞。**依据已独审的348/349，审核core等价提取、service事务及proof接线、targeted/choices/retention helpers和相关用例。审核者未修改产品或仓库测试，未构建/启动App、调用模型或读取小说、实际模型回复、配置及Key。CodeGraph工具未暴露，使用已定位源码。本结论允许后续组合验证及真实探针，不代表供应商或全文验收通过。

## 实现核验

- `desktop/core/novel-import-scene-identity.ts:34–41`只将旧逐row校验提取为共享函数。内存中逆向去掉新增入口/提取后，完整文件SHA256精确恢复旧冻结值`16c8f9b7d33f487328675f8fad71a61018d89675db12f6b798727125af43ced4`；另与R33旧编译validator小段核对。原whole shape、实际target存在性及累计50000 refs容量门保留。单row的slot-range检查仅用于定位坏行，最终仍执行完整门。
- `desktop/service/novel-import-scene-roster-targeted-repair.ts:15–44`深冻结首份可定位draft，repairRef绑定draftHash和stable slot，私Map限定全部且仅坏slots；good rows不能由第二答修改。replace须完整非空，reject须显式符合资格。新副本应用后按保留slots唯一重映射links；指向reject的good link整事务失败，不删边或改指。不能定位到row的错误首1/次0失败，不退回整份roster重发。
- `desktop/service/novel-import-scene-roster-repair-choices.ts:18–93`收录当前来源全部精确重叠occurrences，不取首或截前N。window须通过原quote/literal双唯一及Unicode/CRLF边界；原完整Anchor另有preserved选项，whole-unit只在显式选择时恢复。choiceRef绑定版本、来源/geometry/UTF16LE全文hash/window，权限来自当前私Map实例；同来源ref稳定不构成跨事务缓存。连续同file单位链仅保守阻止错误reject，不造跨unit Anchor。返回Anchor副本。
- `desktop/service/novel-import-ai.ts:90–145`的known-claims投影只建立保留证明；首答及合成后的完整新draft仍走原strict wire、编译、canonical和whole门。旧full记录的name/aliases归属继续约束mention，不能从未列literal洗白。未知row/mention键不会清空其它独立可核实事实；reference本身仍严格，不strip混键或修错误raw。第二答choiceRef仅在已激活修复事务中可用，不能进入第一答或公共canonical。
- 事务只在完整第二prompt预算检查成功后激活，不随parser尝试多个候选提前切换。`novel-import-ai.ts:139`仍在完整结果通过后执行retention：完整窗口、精确occurrence、旧owner双向投影、context和双端link关联均保留；只是拒绝损失，不把坏首答直接采纳为结果。
- `novel-import-ai.ts:557–563`实际第二prompt包含完整prior、原feedback及全部choices，保留65536 fixed、16384 wrapper及原payload门；v1按实际role检查UTF8+6000，0/未知仍16000。超限不裁材料、候选或提额。generate/payload与346/342冻结hash相同，原两代上限、transport/abort及final授权/来源门未改；无hook的generic路径保持原合同。

## 已发现并关闭的问题

outer row多未知键曾令整row proof丢失，author实际桥反例24节点22pass/2fail后修复。独审随后实证：唯一正确mention仅多未知note，同样会漏锁完整窗口，typed replacement能缩窗并删除其context/link。独立合成真桥`/private/tmp/scene-roster-targeted-nested-proof-red.mts`在旧`dd127…`服务上exit1、`Missing expected rejection`；author新TR25为23pass/2fail。最终`fb08…`只在proof层投影literal与原严格reference；同一独立探针现6/6、exit0，包含坏subclaim不擦除其它好事实、旧full未列literal不洗白及完整修复正控。第一答/最终接受集合未因投影而放宽。

旧RR适配没有用“第二答整份roster已非法”冒充保留门通过：12个损失反例先独验原whole合法，再直接执行真实`retention.capture→accepts`确认拒绝；重排/overlap正控也明确为pure。typed真实桥另验坏slot缩窗、完整prior及整份roster第二答故意非法。测试helper只把预定replacement按本次opaque ref/slot编码，不是产品fallback或模型服从性模拟。

## 实际命令与结果

均使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`：

```sh
node --import tsx --test tests/unit/novel-import-scene-roster-targeted-repair.test.ts tests/unit/novel-import-scene-roster-repair-choices.test.ts tests/unit/novel-import-scene-roster-targeted-budget.test.ts
node --import tsx --test tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-opaque-reference.test.ts
node --import tsx --test tests/unit/novel-import-ai.test.ts tests/unit/novel-import-structured-scene.test.ts tests/unit/novel-import-structured-buffering.test.ts
node --import tsx --test tests/unit/novel-import-scene-roster-repair-retention.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

独立四组分别**50/50、112/112、67/67、32/32，exit0**。日志依次为`/private/tmp/scene-roster-targeted-independent-final.txt`、`-old-independent.txt`、`-generic-independent.txt`、`-retention-independent.txt`（后三项同`scene-roster-targeted`前缀）。最终完整tsc exit0，`/private/tmp/scene-roster-targeted-independent-typecheck-final2.txt`为空；diff exit0。此前一次施工中的test helper TS18046已修复，不隐去该失败，也不算产品RED。

另独立执行core18/18合成边界、choices2193/2193穷举小窗口探针及上述proof6/6；日志`/private/tmp/scene-targeted-repair-core-pre-review.txt`、`/private/tmp/scene-roster-choices-window-review.txt`、`/private/tmp/scene-roster-targeted-proof-final.txt`。这些探针不与框架节点、作者或历史组相加。choices最初module-missing不能算6项行为RED；预算19项在实现后首跑GREEN，不伪造RED。TR05短合成prompt只用于触达16000精确边界，仍含完整payload/prior/choices，不冒充产品长prompt。

## 冻结身份

最终复核SHA256如下，产品自nested修复后未变：

| 文件 | SHA256 |
| --- | --- |
| desktop/core/novel-import-scene-identity.ts | d8435095110e78d72dc85687821ae13df9dbadcf24a68d6d070e799258756e78 |
| desktop/service/novel-import-ai.ts | fb08db64d2bf3db389e72a008c3382fed98aa8913c7a952d208e23e972eb044f |
| desktop/service/novel-import-scene-roster-targeted-repair.ts | 73735debcbd15f8a7d7457cba671bdc98ad6fc595f77ae61338b1da60d65135c |
| desktop/service/novel-import-scene-roster-retention.ts | fb1e97af7c263b79f435b27abd97841fcd1f11e19a4f0ee14ce2f3d6383657c4 |
| desktop/service/novel-import-scene-roster-repair-choices.ts | cfd7197fd989fc3b50a0e61d20ec289237a6f9d5d82957738fbc84ddab7a6f3e |
| src/lib/ai/generate.ts | abd8efa580cabe507e726e9268bc625981c761fb4bbfcbee653c6d928e37e01e |
| desktop/core/novel-import-ai-payload.ts | 28b4f5d9fcf786af698aaf4679ea084669ff6f75d00f60abdd69dbf6616afe94 |
| tests/unit/novel-import-scene-roster-repair-retention.test.ts | 62b9443af6a13c95dd3c204cd659c7c5737e4b04f3579e497fded0c2744823ce |

本轮只证明定点事务及保留合同可机械执行。实际当前模型探针、fresh全文所有场景、作者确认、完整复核、发布和重开仍须主代理真实验收，不能用合成JSON、单包或过去部分场景成功替代。
