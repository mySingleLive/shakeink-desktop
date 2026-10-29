# 79/80 世界线预检与安全诊断实施证据

2026-10-26。仅修改 service AI、main.safeError 和既有 J 测试文件，独立代码审核由81执行。未访问实际run、应用、来源、journal、模型/Key或用户库，也未构建。真实rev129/164没有raw或原Error消息，本轮不认定其原因，不声称新代码一定修复该真实失败。

三份真实只读基线保存在 `/private/tmp/worldline-native-79-baseline/`：service `c88cf7f8941edcb4ab97449d244687f254db22aad5d1348404ef25a6d16d29c6`、main `e5e6b028ccdad762366aa70cab06b3ee6d56836a1e23b1b0461dda2660145bf8`、J测试 `e0ca570790a02f6f791f8e2fa2cc2fce72459e5e7d3e70f13121706747c87f88`。

新增J04后，在原生产上执行批准命令取得 [干净真实RED](evidence/worldline-native-baseline-red.txt)。J01–03及J04引用晚门/其它阶段保护通过；缺lineId被schema及实际生成桥接受，世界线固定错误和长结构列表仍折为generic。真实main原型同时明确回显了“未知事件时间不得制造数值”附合成秘密后缀、换行和保前缀截断的数组；旧行为并非generic。该RED先于生产修改，没有变异回放或补造历史。

service只在semantic1普通analyze/worldline的requestedArtifact后非变换调用原 `validateImportSemanticArtifact`，丢弃返回值。catch只产生固定 `artifacts.N.facts` issue，提示原lineId/lineName/timeKind、people JSON数组、eventId及unknown/exact/window合同，无catch/raw/ID/原文/字段值回显；固定消息小于原250字符反馈限额。原helper、最终同schema解析、native晚门、全图引用门和原bridge→generateJSON最多一次纠正保持。

main只增加9个既有世界线错误完整字面的固定安全映射。exact映射后，仅 `startsWith('未知事件时间')` 的非exact家族返回既有generic；不扩大到其它 `未` 开头消息。长结构提示仅在真实Error、message.length>=180、固定 `模型返回结构不完整（` 前缀及 `）` 结尾同时满足时返回固定文案；括号内容不回显。179字符短列表及其它旧短fallback、三条旧知识映射原样保持。非Error对象不因message属性获得信用。

J04包含28个完整合成artifact（5合法、23非法），逐项比对原纯helper和新schema接受集及原字符串不变；实际生产桥首坏次好2次、持续坏2次停止、首好1次，保护signal、role、模型、wrapper及不可变输入。合法格式但未知角色/父引用仍schema通过、原图门拒绝；narrative/其它kind、legacy及其它阶段的前置行为不扩大。原main原型的精确/相似/后缀/换行/非Error、179/180/181/320字符及前后缀反例均执行，无initialize、worker或IO。

首轮GREEN后，[必要类型诊断原日志](evidence/worldline-native-typecheck.txt) 只报新增J04两项fixture联合类型推成可选undefined；仅加 `Record<string,string>[]` 标注，未放宽生产类型或旧断言。此后在最后源码/测试版本重新执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [J01–04](evidence/worldline-native-j01-j04-final-green.txt) | 14/14（4顶层及J03/J04共10子场景），exit0，0 skipped |
| [A07/A08](evidence/worldline-native-a07-a08-final-green.txt) | 8/8（2顶层、6子场景），exit0，0 skipped |
| [必要类型诊断](evidence/worldline-native-typecheck-green.txt) | 当前tsconfig，noEmit、incremental:false；仅报告3个owned文件，diagnostics0 |
| [最终完整delta](evidence/worldline-native-final-baseline-delta.diff) | SHA-256 `ecf545b5cc4ae9ffff7e66165abdb1ec6736882b3e5a26f4c80df055345b432c` |
| [反向逐字节核对](evidence/worldline-native-final-delta-verification.txt) | service移除唯一native前置后恢复真基线；main仅safeError有增量、旧知识/fallback字节保持；旧J01–03为完整不变前缀，仅追加J04 |

冻结文件：

```text
d86eb08bcb6c909a5338c76efab787ccb8a1cbf9ef9c2d40a4b90c46679d98ad  desktop/service/novel-import-ai.ts
b042aac2bb99e0993ee5629432070424bd7ab0da16a36177ba01e724877076a6  desktop/main/novel-import.ts
4844d54205c6f887b2c7ec9ca58e8471edc8661ae572403953d4cf047e00670b  tests/unit/novel-import-request-schema.test.ts
```

payload/提示、预算、重试、权限、工作流及已有信用未改；旧失败与首轮日志保留。真实43产物/覆盖/正文/14章/预算保持、世界线及后续叙事质量、发布和重开由主代理后续实际验收，合成DI不追加真实成功信用。
