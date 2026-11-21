# 382 场景清单根结构恢复独立代码审核

结论：限定增量通过，无阻塞项。可由主代理按冻结构建执行新的正常全文验收；本审核未执行 App/API，不代表全文导入、发布或重开已通过。

审核依据为 380/381 及其独立审核，范围为 service 的额外根字段恢复、ER/UD 测试、三个必要旧夹具适配，以及 PRIVATE v5 observer、构建器和 R43 driver。

`desktop/service/novel-import-ai.ts` 的原严格首答 schema 仍拒绝额外根键。新增投影仅向 retention 捕获一次可独立核验的来源证明，不返回投影、不接受部分结果、不建立定点事务。进入此态后始终使用 first schema 完整重生；原 typed 态不能退回。后续仍执行原完整来源、窗口、owner、限定、关系双端和最终接受门；未定位 claim 不被当成已证事实。四代上限、非 stop 立即终止、普通通道、生成选项及模型容量均未放宽。每次纠正包含原草稿和当前完整回复，并重新计算实际 prompt/schema 预算，不累计已被替代的失败历史。

ER 的八类保留负控先独立证明候选通过原 whole/source 校验，再证明恢复流程拒绝丢成员、缩窗口、换 owner、额外桥接、删限定或变更关系双端，避免以其它非法字段制造假绿。额外根仍持续四代失败；直接 parser 仍严格拒绝。三个旧测试只适配额外根恢复次数及 first schema 预期，未改变错误根、预算、generic、原 typed/source/retention 的断言。

PRIVATE v5 仅增加六种固定业务标签及最多五个互异标签组合的全锚定分类；未知、重复、超额及尾随秘密不进入标签。原 Worker 委托、错误对象、顺序、权限、排空及恢复逻辑未变。内存逆向对照恢复原 v4 整文件哈希；R43 driver 逆向替换两处 observer 路径后与 R42 driver 字节相同。原计时、全选、完整复核、发布及关闭验收门保留。未执行 v5 实际构建或启动；由主代理使用 R43 manifest 构建并核对受保护产物。

## 实际独立验证

- Node 24.18.0 定向十文件 **283/283**：ER、UD、BR、identity-service、TR05、RR、TR、error-labels、native、novel-import-ai。日志 `/private/tmp/scene-roster-root-recovery-independent.txt`。
- PRIVATE v5 纯控制 **13/13**，包括已创建真实 Node Worker、原响应不变、权限、排空、描述符与秘密负控。日志 `/private/tmp/scene-roster-root-observer-independent-final.txt`。
- 独立 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0；日志 `/private/tmp/scene-roster-root-recovery-independent-typecheck-final.txt` 为空。
- v5 使用 esbuild `write:false` 内存编译通过；v5 builder、R43 driver、final/snapshot verifier、freeze 脚本 `node --check` 均 exit 0；`git diff --check` exit 0。
- 主代理组合证据为 23 文件 531/531、完整类型检查与 desktop build exit 0；不与本审核或历史测试数相加。

核心命令：`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test` 加上述十个 `tests/unit/novel-import-*.test.ts`；PRIVATE 控制使用同 Node 和绝对路径 tsx loader。全部为合成数据测试，不涉及供应商行为证明。

## 冻结 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `161031e42cfede7887ec96e1317c7a2d582016ccae0786ad9406622512657069` |
| ER test | `9f9766ff1bc13734aabd1d8e18066db2d75314ae9df6f67783c7ce5a30acbc55` |
| UD test | `7faf5c2510141cd7007099385e50af3df213ddd305c1330d7f4b05ae1290ad0f` |
| PRIVATE v5 source | `7b4ff788a8affd9f9e10b3af775ff2f4ac6df67245cee93a7a5064187f5fb55a` |
| PRIVATE v5 test | `381681aaef2e43672d2afaca9fa9dd8b543e9cd923c6427e31e9fbeba6eaab8b` |
| PRIVATE v5 builder | `1218b50d1f537aa4ae1f59e2d64c01c072790ce0f66d6ef3820e8b8b7b64db5b` |
| PRIVATE R43 driver | `e3044f241fdb7a8100e3d8fe9f9a7c134594fcafc5664fef782f18ee4ff3bdd8` |
