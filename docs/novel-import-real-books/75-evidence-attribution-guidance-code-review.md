# 证据与叙述归属固定指导：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。仅覆盖73/74批准的两文件与三条定向命令；不把提示接线或合成输出记作真实文学效果、旧12项产物修复或实际S02通过。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/core/novel-import-ai-payload.ts` | `49482e28232c89c8eb1276ed7c2b755e496d9b26607329cac9d5f34a07a5bb21` |
| `tests/unit/novel-import-ai.test.ts` | `9dd2d4c3f4304f64bbf275304cf7704915e575826053d3009e87a25a7a3e2ec0` |

对真实基线 `/private/tmp/evidence-attribution-73-baseline/` 独立重建完整差异，与 `evidence/evidence-attribution-baseline-delta.diff` 逐字相等，SHA-256：`cb704651d54322ce955718a4acad8dbb06b08938f6aed3b6beb0302e97b8a10c`。反去新增guidance声明及其串接，payload整文件逐字恢复原 `8edd5629…6cb2d98`；AI测试新增A07以前逐字等于旧文件。service仍为72冻结的 `c88cf7f8941edcb4ab97449d244687f254db22aad5d1348404ef25a6d16d29c6`。

## 代码与测试判断

指导仅在semanticPrompt的analyze（含reconcile）/review启用，固定在不可信资料封套之外。内容是短连续引文、同unit自核、叙述层/说话者/判断归属、重要框架参与者及未定结尾等通用原则，无本书名称、人物、原句或答案。10–30是偏好且明确允许更短精确原引，不改变anchor接受集合。

原reviewProjection证明范围、reconcile目标/稀疏字段/锁及阶段契约保留；序列化、分类合同、legacy提示、semantic patch、payload与固定预算断言未改。无schema/anchor/晚门、网关、重试或模型授权变更，也没有清除旧产物信用的路径。

A07真实调用runImportAi，在既有生成DI接点捕获实际prompt，并验证resolve角色、pinned模型、signal、request/raw/output及实际payload不变。合成恶意自由要求留在数据中，固定段未吸收这些资料。短3字精确quote通过；长/非BMP/换行、引号和反斜杠数据仍满足原65536固定预留及16384 wrapper。投影不完整在生成前拒绝，错误缺口与锁定/外部目标修订继续被原门拒绝，具有生成计数断言。

8组legacy/classify/patch的独立prompt与payload hash字面量，与作者修改前metadata及真实基线payload身份对应，当前执行全部匹配。新增测试没有使用当前producer计算自己的expected hash；payload另有独立字段形状期望。A03/A05/A06及全部旧断言未删改，J03/SEM04继续直接保护证据规则、一次纠正和语义合同。

## 独立命令与历史

仅执行73批准的三条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[3567]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J03:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `evidence-attribution-independent-a03-a07.txt` | 7/7，exit0，0skip | `c2645944e6c4271796a9c035d1c5cf82cefc5d76d9ba5c3d237746ce849836a0` |
| `evidence-attribution-independent-j03.txt` | 5/5，exit0，0skip | `a1f3fb3ba00366487e20518b8ad14f0579963bae2d1dc437201a06227afd87b4` |
| `evidence-attribution-independent-sem04.txt` | 1/1，exit0，0skip | `ea8a738ff5dcba5e0db7f22280cf6e2e5584730a72f83e1671b2f0dcf8b3ccfb` |

作者干净实施前 `evidence/evidence-attribution-baseline-red.txt` 保留：5 pass、2 fail（新增实际路径指导子例及其父测试失败），旧goldens与投影/锁子例通过。更早patch空修改fixture错误另有日志，不作为产品RED；本审核未回滚冻结代码重演RED。

独立完整差异、基线/最终hash、旧golden对应及精确argv见 `evidence/evidence-attribution-independent-review.json`，SHA-256：`fd2615399a06e99dfd4ac5fc1cd85ef03d59c2852250f17c10aedb60c4a21da1`。

本轮未改源码/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库；未自行构建或另跑类型。原rev58原因未知边界、失败和旧文学问题保持；同草稿真实未完成物品及全书质量须由主代理另行验收。
