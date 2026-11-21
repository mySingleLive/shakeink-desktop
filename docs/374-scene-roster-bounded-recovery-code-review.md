# 场景清单有限恢复：独立代码审核

结论：**限定范围通过，无阻塞，可冻结当前构建后立即进行R41正常fresh全书验收。**372/373已按序独审。审核者未改产品/测试、启动App、调用模型或读取真实小说/request/raw/Key；本轮为合成SDK及代码验证，不能当作全文通过。

## 源码与边界

- `generateJSON`新增受信maxGenerations：默认2，只接受1至4的安全整数，在解析prompt/供应商调用前拒绝非法值，解构后不进入SDK options。每代仍走原generateText/quota/usage/取消；成功时累计全部实际代次用量。普通调用、旧string/object hook和非场景默认次数保持。
- 仅原concrete scene roster服务桥注入4代。服务在原生成结果返回后要求明确stop；length/content-filter/tool-calls/error/other/unknown及missing立即以incomplete失败，不再格式恢复。完整合法JSON也不能绕该门；generic missing-finish原接受行为仍保留。网络、quota、usage、abort及最终授权错误保持原异常与边界。
- 无冻结草稿时，只有原invalid_json、实际stop且原parser候选unparsed可完整重新识别；原raw/ref/span及首native schema保持。null/数组/其它根/额外键/超额roster保留首代拒绝。没有宽松解析、括号补造、过滤坏项或部分入账，也不声称已证明保留不可解析输出中的资料。
- 首次可定位draft仅prepare/activate一次。冻结text及plan数据随后复用，失败repairs不重新成为roster或重算slot。每次typed候选仍完整应用于原draft，再过原CF、strict/source/canonical、owner/retention及final门；good rows、完整窗口、context/link与稳定引用均保留。每次prompt含原draft、同plan、当前完整失败回复，不累计已取代的历史失败回复。
- 每次先核完整实际prompt、原材料、对应实际native schema及原预算。full-regeneration使用outer base prompt+correction再由pure helper加一次JSON wrapper；typed使用已含wrapper的actualPrompt，未重复扣除。原fixed/wrapper、v1+6000及0/未知16000不变，超限立即停止，不裁资料/证明或扩大cap、网络重试、并发和420000ms计时。

## 实际独立验证

使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test`执行15文件：BR bounded-recovery、UD failure-shape、native/native-budget、旧CI/RC/FA/OR/CO/RR/TR/TR05，以及novel-import-ai/structured-scene/structured-buffering。实际**373/373、exit0**（BR43、UD36、native27、旧8组200、generic/entity/buffering67已全部包含），日志`/private/tmp/scene-roster-bounded-independent.txt`。

`node node_modules/typescript/bin/tsc --noEmit --incremental false`实际exit0，日志`/private/tmp/scene-roster-bounded-independent-typecheck.txt`为空；diff检查exit0。不与作者404、主代理491或历史组相加。

实际SDK控制覆盖：unparsed→首schema重生、unparsed→draft→CF、typed后invalid JSON→同plan、四代持续失败/成功第四代、原draft+当前回复不积历史、全部原来源/owner/window/link反例、合法JSON missing/unknown首1拒绝、generic原行为、原quota/usage/transport/abort身份和最终授权拒绝。实际第2/3/4 SDK prompt+其schema的v1 N/N-1及完整fixed N/N+1均达到目标门；受信limit非法值零生成、选项剥离、四代用量累加均通过。初BR真实入口RED4/4；后置边界在GREEN才达到，不倒填RED。

旧8文件test-only diff已审核：仅持续stop失败计数2→4及新增批准重生控制；positive2、非roster根1、budget0/1、generic2和callback unsupported2保持。未删除/弱化source、choices、完整窗口、owner、link负控；意图适配前57项失败不算新缺陷。

## 冻结身份与R41脚本

| 文件 | SHA256 |
| --- | --- |
| src/lib/ai/generate.ts | 28e92312dfefeae757499ce410b79a2cf87798c50a03347e79686c2c55dfa900 |
| desktop/service/novel-import-ai.ts | c1c26d0dd42da8ae3c31749fec4fc691f56c23290c1bb96bb1dec7d5d863bc9d |
| tests/unit/novel-import-scene-roster-bounded-recovery.test.ts | 464d897094417e97180f046abbd574c82a64a986beef119a90ce1e8eec32a79b |
| tests/unit/novel-import-scene-roster-failure-shape.test.ts | 0a8bc922a60093f80c9cd1d2f1b11945f48583e34384d7d6da84ec67fa10e0a9 |

只读核R41 driver逐字等于R39冻结driver，SHA256仍`b0d62be639ed21872bdf0c582f1830ad8b32699d6c30051e51a3feba69b8d64e`；final/snapshot/progress三文件仅r39/R39→r41/R41替换，freeze-r41-build.mjs语法exit0。未运行freeze或App脚本。原场景全选、计时、完整复核、作者UI处置、发布及退出重开门均未改；应由root冻结新源/产物并真实执行后另验。四代上限仅增加有限恢复机会，耗尽仍失败，不能将其标成成功。
