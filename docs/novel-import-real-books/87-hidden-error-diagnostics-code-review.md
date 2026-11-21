# 隐藏引用及标准服务错误提示：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。覆盖85/86批准的两文件及两条定向命令；不认定实际rev203根因，不代表真实世界线或整书通过。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `fee1997ffd3a0fd149ceaf05c83e42970e75137afd587b80ca1f17eaab63543d` |
| `tests/unit/novel-import-request-schema.test.ts` | `afb0983cc6536549a7826ef30284e9784ac2de0964d80e79cfa2084cf11c250d` |

对真实基线 `/private/tmp/hidden-errors-85-baseline/` 独立重建完整差异，与 `evidence/hidden-errors-baseline-delta.diff` 逐字相等，SHA-256：`0a26586bfc86df95bc0be41223c6ad782a155a62461796b71d7546951a93e90a`。反删除16个已批准字典项并还原原最后项逗号，main整文件恢复基线；新增J05之前整个J01–04测试前缀逐字保持。

控制文件service仍为 `d86eb08b…79d98ad`、payload `239cac9b…187ab55`、AItest `663097fb…f9c9903`，与既有冻结身份相等。无service、schema、payload、预算或工作流变化。

## 代码与用例判断

新增恰为9个已核对service固定引用/目录/父级/章节字面及7个85/86核对的官方标准描述，值均为固定中文。沿用Object.hasOwn精确查表，没有部分匹配、动态原文插值或responseBody/status/headers/cause读取。原知识映射、世界线旧字典、未知事件时间家族guard、长结构列表及最终短fallback全部保留。

新键均不匹配旧允许前缀，非exact变体仍generic；没有借新键扩大回显。供应商提示明确为“服务返回……提示”，不认证账户状态，不承诺识别全部SDK包装错误，也不增加自动调用、日志、协议或付费/模型切换行为。

J05两条实际runImportAi路径先以原纯helper及请求schema证明格式合法，各生成1次，在真实validateSemanticLinks分别捕获确切角色不存在/类型错误，且无有效结果；随后交给未初始化prototype上的实际safeError。role/signal/request/raw、授权计数及错误字面断言排除schema/native或ID碰撞早拒假绿。

16个固定键的独立字面期望、大小写/空格/截断/前后缀、秘密/URL/模型ID/换行、非Error及原型名反例均实际执行；非Error带抛错message getter也不读取，无额外实例属性。J01–04完整旧断言继续保护79安全例外、179–180边界及原一次纠正/晚门；A07–09继续保护固定业务合同、权限和原数据。

## 独立执行与历史

只执行85批准的两条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[12345]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `hidden-errors-independent-j01-j05.txt` | 17/17，exit0，0skip | `110a04c8af86ecf87c02b1df4f041fe939ceaca6cc73f81288ff0993e0906aed` |
| `hidden-errors-independent-a07-a09.txt` | 12/12，exit0，0skip | `5ea5b456da46a83ef3cac4ded8d23059b49507b4f6c269089e9e7f25aa2ddf67` |

作者 `evidence/hidden-errors-clean-baseline-red.txt` 保留：14 pass、3 fail（J05两子例及父测试），实际两条late Error在原main均被隐藏成generic。更早 `hidden-errors-baseline-red.txt` 的新增fixture ID碰撞导致类型身份冲突，保留为fixture历史，不冒充对应角色错误的产品RED。本审核读取这些历史，未回滚冻结代码重演RED。

独立基线/最终hash、完整差异、16键及控制文件身份、精确argv见 `evidence/hidden-errors-independent-review.json`，SHA-256：`71238ef7cfbd2844427a34cbd59d6431571da46ec47957498bab87ec729f38a1`。

本轮未改生产/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库；未自行构建或另跑类型。真实同草稿带诊断恢复、43产物/覆盖/正文/14章/预算保持，以及最后语义/落库/重开仍由主代理另验；旧失败原因与文学缺口不能由本报告追溯改记通过。
