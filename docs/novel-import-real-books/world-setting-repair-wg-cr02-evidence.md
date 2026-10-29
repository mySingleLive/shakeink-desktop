# WG-CR02 回执重放修复

96 独审发现恢复后的重放分支只把原 apply 回执的 status 改成 restored，仍使用 apply operationId、snapshotId 和 before/after 方向，导致返回及 after/ack 导出与已恢复七旧行不一致。按父代理授权，仅修改 repair service 和原 WR01/02 文件，其他冻结源码不动。

修改前真实两文件基线单独保存在 `/private/tmp/world-repair-wg-cr02-baseline/`，未覆盖先前历史。先增加 repeat rollback 和 apply-after-rollback 的真实回执/导出断言，在 service `8015c04938d27802b2691a5ff2050fe4f2f7a572c58cf15ffefa2d4c2fa658bb` 上取得[干净 RED](evidence/world-setting-repair-wg-cr02-red.txt)：23 项中 22 通过、WR01 的完整 restored 回执相等断言失败，exit 1。原安全断言保留。

生产只改一行：恢复后重放使用 `parseReceipt(previous.rollback.result, plan, true)`，返回实际已经校验的 rollback 回执。新增断言验证 rollback operationId、独立 snapshotId、beforeHash=apply.afterHash、afterHash=apply.beforeHash、rollback 快照的 before/after 方向、每次 after.rows 的 hash、ack 和返回值完整一致，并验证无新增审计、业务行仍等于原始基线。

最后源版仅执行批准命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-WR0[12]:' tests/integration/novel-import-world-repair.test.ts
```

[GREEN](evidence/world-setting-repair-wg-cr02-green.txt) 为 23/23、0 skip、exit 0；两个 owned 文件的 [TypeScript 诊断](evidence/world-setting-repair-wg-cr02-owned-typecheck.txt) 为 0。未重复无变化的 A10 或 SEM-P01，未访问真实应用、模型、来源、journal 或用户数据库。

新冻结 service SHA `c3b560ead06b156875e464230c3eadad82f9ce16d1096664f9ee233ec75bd5f9`，WR test SHA `076b5400db9dfcaf9dbedd6915e7dafb79e3c831fca31f8b6978469382f6dee1`。[增量](evidence/world-setting-repair-wg-cr02-delta.diff) SHA `2f9d5c236c1697789074bec796c36b64ca00ffb511ee46410693148af4c9dd30`；[新冻结清单](evidence/world-setting-repair-wg-cr02-freeze.json) SHA `b1f3573ceef812ae6755c37a4f67d8a136fc2f43e0cb9e3387a0c8f3ccf5de14`。此清单仅取代原 manifest 中两个 owned 文件的身份，原 RED/GREEN 和原 manifest 保留。等待 96 增量复审，不声称实际旧作品修复通过。
