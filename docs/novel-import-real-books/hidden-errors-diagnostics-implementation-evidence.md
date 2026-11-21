# 85/86 隐藏错误安全诊断实施证据

2026-10-26。仅修改main.safeError原exact字典及既有J测试文件，独立代码审核由87执行。未访问实际run、应用、小说、journal、模型/Key或用户库，没有构建。rev203的原Error未知，本轮不认定它属于角色引用、外部服务、余额或其它已确证原因。

两份真实只读基线保存于 `/private/tmp/hidden-errors-85-baseline/`：main `b042aac2bb99e0993ee5629432070424bd7ab0da16a36177ba01e724877076a6`、J测试 `4844d54205c6f887b2c7ec9ca58e8471edc8661ae572403953d4cf047e00670b`。

先新增J05取得 [首轮混合RED](evidence/hidden-errors-baseline-red.txt)。其中新增世界线fixture沿用scene ID，触发原实体身份冲突；这不是本次生产缺陷。仅给新J05事件独立ID，保留该日志，再于未改main真实基线取得 [干净RED](evidence/hidden-errors-clean-baseline-red.txt)。两条合成请求均先通过原native helper和请求schema，实际runImportAi各生成1次、拒绝且无有效返回，捕获的Error.message逐字为 `角色引用不存在或同名不明确`、`角色引用类型无效`。真实未初始化prototype.safeError随后均返回旧generic，不能用手造同文Error或早门错误替代此证明。

生产增量只有原own-property exact字典的16个键：源文件中9条目录/角色/地点/世界/MAP/父循环/章节固定字面，以及85/86已审的7个标准英文描述。映射值为固定中文，英文服务提示表述为“模型服务返回…提示”，不据此查询或确证账户状态。未增加部分匹配、动态消息提取、provider body/status/headers/cause读取、日志、协议或重试。新键的大小写、空白、秘密值、URL、模型标记、换行和非Error变体均不命中。

J05还逐项检查16个独立literal正例、全部上述反例、原own-property保护及无新增实例属性；非Error的message getter不会被读取。旧J01–04原字节保留，继续实际保护79的世界线映射、未知事件时间家族guard、长列表179/180门、三知识映射、旧fallback、原生成纠正和引用/native晚门。

最后一次源码/测试修改后仅执行批准的两条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[12345]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 证据 | 最终结果 |
| --- | --- |
| [J01–05](evidence/hidden-errors-j01-j05-green.txt) | 17/17（5顶层、12子场景），exit0，0 skipped |
| [A07–09](evidence/hidden-errors-a07-a09-green.txt) | 12/12（3顶层、9子场景），exit0，0 skipped |
| [必要类型诊断](evidence/hidden-errors-typecheck.txt) | 当前tsconfig，noEmit、incremental:false；仅报告两个owned文件，diagnostics0 |
| [完整delta](evidence/hidden-errors-baseline-delta.diff) | SHA-256 `0a26586bfc86df95bc0be41223c6ad782a155a62461796b71d7546951a93e90a` |
| [反向逐字节核对及控制SHA](evidence/hidden-errors-delta-verification.txt) | 删除16键及所需逗号后整main等于真基线；旧J01–04为完整原字节前缀，仅追加J05；service d86/payload239/AI测试663均未动 |

冻结文件：

```text
fee1997ffd3a0fd149ceaf05c83e42970e75137afd587b80ca1f17eaab63543d  desktop/main/novel-import.ts
afb0983cc6536549a7826ef30284e9784ac2de0964d80e79cfa2084cf11c250d  tests/unit/novel-import-request-schema.test.ts
```

此次只补安全诊断，不修改模型结果、schema、服务、工作流、信用或文学判断。未识别消息仍按原策略处理；真实43产物/覆盖/正文/14章/预算保持、世界线恢复与其余验收由主代理后续执行，旧失败及文学待修保持。
