# 世界线格式预检与安全诊断：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。覆盖79修订/80批准的三文件及两条定向命令；WF-TR01的窄安全例外实现符合方案。不认定实际rev129/164根因，也不代表真实世界线、叙事线或整书通过。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `d86eb08bcb6c909a5338c76efab787ccb8a1cbf9ef9c2d40a4b90c46679d98ad` |
| `desktop/main/novel-import.ts` | `b042aac2bb99e0993ee5629432070424bd7ab0da16a36177ba01e724877076a6` |
| `tests/unit/novel-import-request-schema.test.ts` | `4844d54205c6f887b2c7ec9ca58e8471edc8661ae572403953d4cf047e00670b` |

对真实基线 `/private/tmp/worldline-native-79-baseline/` 独立重建完整差异，逐字等于 `evidence/worldline-native-final-baseline-delta.diff`，SHA-256：`ecf545b5cc4ae9ffff7e66165abdb1ec6736882b3e5a26f4c80df055345b432c`。service移除新增worldline checkedArtifact并恢复原return后整文件等于基线；main仅safeError方法改变，原三知识映射及最终fallback逐字保持；J04之前的J01–03整个旧测试前缀逐字保持。审查/执行时payload仍为 `953d4a39…9335298`，AItest仍为 `800a9624…0e8eff8`。

## 代码与用例判断

预检仅进入semanticVersion1普通analyze/worldline分支，在原requestedArtifact基础上复用严格validateImportSemanticArtifact，丢弃返回值，不替换、trim、规范化或默认原值。固定facts issue不传播catch消息、动态键、ID、源文或模型值。原helper、证据/知识schema、所有late门、完整图引用、bridge、一次纠正及payload/预算/工作流均未改动。

J04以独立字面合法性期望对照原纯helper和新schema，覆盖必需字段、people JSON类型/字符、eventId、unknown数值属性、exact/window有限数值与边界，并保留原空白、科学计数和描述性time字符串。有效格式但未知角色或parent引用仍schema通过、原图门拒绝；legacy、其它phase/reconcile、scene及尚未前置的narrative原行为明确保护。

实际生产bridge与真实generateJSON通过既有generateText DI验证每类native反例首坏次好恰好2次、持续坏2次停止、首好1次；固定guidance在原250字符反馈界内，无动态内容回显，signal/role/action/模型和wrapper预算保持。没有真实模型或网关调用。

main新增9个固定字面的own-property精确映射；随后仅“未知事件时间”固定前缀非exact家族返回generic，exact先行且其它`未`开头旧短行为保留。非Error、近似/后缀/换行及原型名反例有覆盖。长结构列表要求真实Error、固定前后界及message.length>=180，只返回固定文案；179原行为、180/181及更长、错误边界/尾部附加值均验证。未新增自由诊断字段或日志。

## 独立执行与历史

只执行79批准的两条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `worldline-native-independent-j01-j04.txt` | 14/14，exit0，0skip | `88948872328433b22839088292e51cdbc3569c9339dd0f6162c4b1f6fdc41aeb` |
| `worldline-native-independent-a07-a08.txt` | 8/8，exit0，0skip | `62e8bc1e46aa511f67e06cee10b9a834dad3f229b3dd96755b9ce99fa0fc5509` |

作者 `evidence/worldline-native-baseline-red.txt` 保留：8 pass、6 fail（含父测试），实际缺字段被旧schema接受、bridge未纠正、固定诊断缺失、未知事件时间后缀/换行秘密回显及长结构列表generic均有真实基线失败；图引用晚门子例通过。本审读取该历史，未回滚冻结代码重演RED。新增fixture的类型注解调试不计作产品RED；独立审核未另跑类型或构建。

独立基线/最终hash、完整差异、保留文件身份及精确argv见 `evidence/worldline-native-independent-review.json`，SHA-256：`20741c8886990fcb98e55ab4e5d292c85e889f43bb85c850a73c53b0eeb64747`。

本轮未改生产/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库。主代理后续构建、原目录/同模型授权恢复、43产物与信用/正文/14章/预算保持及真实世界线结果另记；原通用失败及文学待修不得由本报告追溯改成通过。
