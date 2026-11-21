# R67 显式选择包装与保留资料聚焦实际验证

R67 正常新会话实际失败，状态为 `actualFailed`，没有完成全文导入。会话 `38067148-5fae-41cf-8c35-84b7d9676195` 于2026-11-01 12:20:54.326 UTC允许分析，12:21:36.935在 `detect-scene` 失败，12:21:39.560正常关闭。App exit0、signal null、驱动exit2，启动PID已不存在，page errors为0。允许分析至失败42,609ms，不是七分钟完成达标证据。

129个规划首轮请求中实际启动20个清单RPC，18成功、2拒绝；关闭前runtime的20项均settled，结果与RPC观察一致。失败快照仅覆盖661/4912工作单元，含418成员、324记录、324身份、7关系；正式artifacts为0，workingRevision为0。识别账本中的身份计数不能当作已导入场景数。

独立核对34份生成捕获：全部完整、流闭合、provider completed，逐份delta、done、completed文本相等，解析/UTF8/终止冲突均0。根代理零API原请求重放20项、34代输入SHA全相同，复现18成功/2拒绝；本次逐transfer、operation、payload、delta SHA、字数及结果与原捕获交叉核对，原RPC与重建请求绑定也一致。两事务的细分首拒仍待诊断，本文不据未核错误类别推测原因。

文本观察器34/34，pending、unmatched、ambiguous、观察/限制/写失败和retainedBytes均0；RPC观察器无pending、观察/写失败。两者均完成恢复。数字内存观察器停止后pending、workers、timeouts、writeFailures均0。没有以私有观察器注入成功、改变请求、补资料或绕过接受门。

冻结身份独核全部相符：57个源码、8个bundle、303个renderer文件、41个测试、22个helper、3份审核文档，以及私有驱动、Electron runtime、两观察器源码/产物。Renderer复用已核相同的R66产物，本轮没有重新构建UI。原文件字节SHA不变，4,785,312 UTF16正文、1402章的start/end/content/title及全部4912个工作单元与R66相同。单元唯一ID、连续偏移、完整重拼、最大1000 UTF16以及surrogate/CRLF边界检查均通过；这不保证任意称呼都不会跨边界。

构建前760/760定向节点、types/desktop build/diff通过；129个新首轮、130个旧首轮与204个历史请求的可达新提示预算通过。历史418份捕获中实际使用417份，显式selection包装提前接受使1份后续旧捕获未使用；175接受/29拒绝是新本地回放结果，不能称历史结果全不变或R67模型通过。以上本地与历史证据均不能替代本轮实际结果。

全文场景识别和导入未完成，完整正文/事实复核、发布、正常重开及全量DB比较均未达到。全文、七分钟完成、发布和重开四项保持未通过。R66的[457失败报告](457-scene-source-boundary-focus-real-verification.md)及安全记录保留。

证据：[R67安全标量](scene-import-verification/r67-selection-retention-focus-normal-observation.json)、[冻结构建](scene-import-verification/build-identity-r67.json)、[460独立代码审核](460-scene-selection-retention-focus-code-review.md)。独立私有脚本 `verify-r67-evidence-independent.mjs` 使用Node v24.18.0执行exit0，无App、模型API或业务写入；原文、生成回复及输入仅保留隔离私有目录，未写入本文或公共JSON。
