# 场景清单完整纠错与事实保留：独立增量代码审核

结论：**限定范围通过，无阻塞。**344最终修订及345用例已由另一审核者按序通过。本轮审核generateJSON可选hook、service接线与纯retention helper；payload仍为342冻结版本。审核者未修改产品/仓库测试、构建/启动App、调用模型或读取小说、实际R32响应、Key。CodeGraph工具未暴露，按已定位源码审核。

## 源码核验

- `src/lib/ai/generate.ts:189`可选repair回调在解构时从generateText的rest明确剥离。只在首轮`StructuredGenerationError`后调用一次；第二轮失败直接抛出。网络/abort不进入该结构纠错；原两代、用量累计、取消及length不接受保持。没有hook的generic调用仍用原默认反馈和prompt，不携带prior。
- `desktop/service/novel-import-ai.ts`仅new scene roster建立一次冻结units/ref表和retention状态。完整第一输出使用`sceneRosterPriorData`作明确不可信资料；whole JSON可compact，其他文本（含fence）完整作为JSON字符串。`<`/`>`安全编码，资料不能闭合应用标记；坏row、控制键及未知值不截断或只挑好项发送。固定error/feedback与刻意发送的完整prior资料块分开，不以移除prior来满足隐私断言。
- repair构造的**实际完整第二prompt**包括原JSON wrapper、原feedback、静态保留指导及完整prior，再用原完整payload预算和`assertImportFixedPromptReserve`复验。65536 fixed/16384 wrapper不改；v1额外检查实际第二prompt UTF8+6000不超过当前实际role的有效contextWindow，0/未知沿16000。超限固定失败，首代已1次/第二代0次，不截断、不升额或加第三代。v2冻结profile仍沿原门。
- first保护提取调用原`parseJsonOutput`候选规则，包含fence；不是只对整个文本JSON.parse失败就清空保护。严格roster根和逐row严格wire成功后，badrow内每个claim独立解析/编译并复用原完整精确来源校验。坏ref/primary等不连带抹掉其余已证mention；旧full记录仍检查literal属于显式name/aliases，不从错误metadata派生洗白。
- `desktop/service/novel-import-scene-roster-retention.ts:28`用literal、unitId、完整unitHash及精确literal半开位置作稳定occurrence键，并另保护完整Anchor/evidenceRange。相同literal坐标而缩quote窗口不等价，跨单位或换位置也不能替代。重复同事实可按集合比较，不拿计数冒充完整性。
- 第60行对首代全部grounded universe计算每个当前row投影：每个旧非空owner必须存在，且每个当前非空投影也须恰为某旧owner，覆盖无context/link行及“原行全在但额外加桥”反例。原有overlap允许保持，真正新member允许加入；没有用subset放过2→1。该owner只是纠错保留约束，不是已批准的地点语义身份，后续identity links/作者和完整复核仍负责。
- context绑定其完整label/Anchor及精确owner投影；link绑定relation、左右非空grounded endpoint集合及全部已证Anchor，按第二代当前行号重建，不锁旧targetIndex。无法证明的endpoint或claim不强制变为真值，完全无grounded幻觉不硬锁。
- 新门只在第二代整份原wire/编译/canonical/full校验成功后比较保留事实；失败仅固定known路径/静态说明拒绝。首代保护集从未被拼进accepted结果，没有恢复坏raw、丢坏项或绕过原final/main/ledger/shared门。

## 实际执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-roster-repair-retention.test.ts tests/unit/novel-import-scene-roster-opaque-reference.test.ts tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-identity-session.test.ts
```

独立实际**157/157、exit0**，日志`/private/tmp/scene-roster-retention-independent.txt`；新RR29已包含在157内。真实JSON桥实际覆盖完整plain/fence prior、badrow内好事实、长Unicode/CRLF窗口、重排/等价编码、完整context/link、同数换位置/缩窗口、无context合并及额外bridge、原overlap与真正新member。fixed UTF8 reserve N/N+1、v1实际prompt+6000 N/N-1与0回落16000均达到目标门；generic once/rest隔离、网络/abort、length也实际执行。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-wizard-prompt.test.ts tests/unit/novel-import-structured-buffering.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

独立generic/request/prompt/buffering组实际**68/68、exit0**，日志`/private/tmp/scene-roster-retention-generic-independent.txt`。完整类型检查exit0，日志`/private/tmp/scene-roster-retention-independent-typecheck.txt`为空；diff检查exit0。不与作者297、主代理295或旧组重复相加。

另在`/private/tmp/scene-roster-retention-pure-review.mts`执行6个合成审查探针，最终exit0；日志`/private/tmp/scene-roster-retention-pure-review.txt`仅固定计数：同quote跨unit不能替换、旧full未列literal不洗白、仅一端grounded的link不硬锁、prior闭合标签安全编码/逐值保真、实际review角色大窗允许两代及其真实第二prompt+6000差1时首1次后拒绝。预算探针先按实际第二prompt校准边界，没有把任意16k的错误预期算成产品RED。这些小探针不是实际模型或真实数据执行。

已核原RED日志`/private/tmp/scene-roster-repair-retention-red.txt`：实际24节点、5通过19失败。12个先独立证明可过原full gate的缩减/窗口/关联/合并/桥接第二输出，旧桥仍接受，构成真实功能RED；plain/fence缺完整prior也实际失败。回调泄露到generateText options单独失败；generic、transport/abort、length及原overlap正控通过。RR03在缺prior处先失败，其5个预算子项未注册，GREEN成为29后才实际达到，不倒填RED边界覆盖。

旧new-roster隐私断言只从新增纠错段排除明确prior数据块，再检查静态部分；没有删除资料求过关。RC/FA/OR合成正控容量改64k以使新增完整二prompt门可达，真实政策未改，RR仍验证小窗边界。原巨量50k-ref反例仍独立通过原validator证明容量拒绝，完整prior超预算时现为首1/次0，不能误记为仍有第二次模型调用。

## 冻结身份与R33只读准入

以下五项独立执行前后SHA256一致，记录`/private/tmp/scene-roster-retention-independent-before.sha256`：

| 文件 | SHA256 |
| --- | --- |
| src/lib/ai/generate.ts | abd8efa580cabe507e726e9268bc625981c761fb4bbfcbee653c6d928e37e01e |
| desktop/service/novel-import-ai.ts | 5ba9656674a559cb6392c13c9fd91e1a4aa35419d1ac801ea0b73748c527a088 |
| desktop/service/novel-import-scene-roster-retention.ts | 810235f9ad8333bf938102b37b4b2dc842cdf900a8bd534dbb9a1617100d115f |
| desktop/core/novel-import-ai-payload.ts | 28b4f5d9fcf786af698aaf4679ea084669ff6f75d00f60abdd69dbf6616afe94 |
| tests/unit/novel-import-scene-roster-repair-retention.test.ts | 3a4b869e3596f1c5880c41172ab42ba51b6a22e0ec7c09eeabda43181e31baa5 |

仅只读核对私有R33 helper对R32的diff为两个私有捕获前缀替换；runner用新request/另名bundle，保留原隔离root/state hash、实际role、只读usage、DB/模型元数据写拒绝、normal quit及prompt SHA/长度摘要。两源600、runner独立node --check exit0。须在执行前补齐并核当前bundle的上述产品输入hash；审核者未读私有request/raw或运行runner。主代理另做的R32 recorded pair离线结果不在本独立数据核验内。

本增量证明已证来源信息的保留机械合同，不证明首代未证claim真实，也不证明供应商会完整纠错。实际同scope探针、fresh全文、全部场景、作者处理、发布和重开仍须主代理真实验收，不以Mock或单包结果替代。
