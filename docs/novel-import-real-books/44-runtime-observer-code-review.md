# 私有运行时观察工具增量独立代码审核

日期：2026-10-26。审核者：独立子代理 `cross_platform_picker_design`。

**结论：PASS，限定为本轮三个观察工具的静态审核及获准隔离 driver。** 发现一项“不启动子进程”测试可假绿的问题，已由原作者最小修复，独立复验24项检查全部通过。此结论绑定下面的工具及 parser 依赖指纹；生产运行时证明的实现由43另审，真正 RB-LIFE01 尚未由本审核执行或证明。

## 边界

依据[41末节观察器增量](41-import-runtime-proof-plan.md)及[42末节独立方案审核](42-import-runtime-proof-plan-review.md)。只审核：

- `scripts/project-real-novel-import-runtime.ts`。
- `scripts/observe-real-novel-import.py` 的 runtime_diagnostics、BUILD_INPUTS 及已绑定来源后的调用接点。
- `scripts/verify-real-novel-runtime-observer.py`。

仅对照生产 `parseImportRuntimeDiagnostics` 的 schema/API合同，不对 tracker、暂停捕获线性化、真实取消/drain、journal持久化或生产实现下结论，不修改其代码。CodeGraph工具未提供，直接读取上述指定文件。未运行观察器的 observe/freeze/record_build 命令，未读取真实journal、源小说、用户数据库、Key或模型配置，未使用应用/CUA/HTTP，也未重跑35/38或其他suite。

## 静态核对

| 项目 | 本轮核对结果 |
| --- | --- |
| CLI envelope与schema | stdin只接受严格 `{sessionId,diagnostics}`，sessionId为UUID，额外envelope key拒绝。诊断委托同一生产纯parser/API处理严格已知key、session一致性及16384字节诊断容量；没有复制一套宽松schema |
| 累积前容量 | Node每个stdin chunk在push前检查剩余17408字节，之后才concat和fatal UTF-8解码。Python使用iterencode，每段先检查字符长度，再编码并检查实际UTF-8长度，均在加入chunks/累计前拒绝；不会先把完整journal序列化再截断 |
| 固定失败结果 | 非法JSON、非法UTF-8、未知key、session错配、超限及运行异常统一固定unavailable；不输出原对象、自由error或输入片段。CLI不打印caught异常；Python不透传child stderr，失败只降级诊断，不修改原session对象 |
| 最小子进程输入 | Python只从三个RUNTIME_FIELDS挑诊断，另传sessionId；originalProse、models、analysisGrant等其余journal字段不进入child stdin。有效stdout仍检查字节上界及三字段集合；内部结构的严格性依赖上述同一parser，而非把任意child对象直接当证明 |
| legacy与非语义 | 仅Python整数semanticVersion=1且至少一个诊断字段存在时启动投影。无字段、缺版本/非语义、布尔True均返回空增量，不注入默认诊断，也不启动child。源资料零AI并不因观察工具生成假调用 |
| 来源调用接点 | runtime_diagnostics只在原observe流程完成既有新journal排除、corpus来源路径、完整sourceFiles路径集合及唯一候选筛选后，更新已有safe投影；二进制/目录元数据要求、既有source hash结果记录和证据写入边界保持。runtime字段不替代来源绑定，也没有把未校验原诊断加入原safe白名单 |
| 构建身份 | BUILD_INPUTS含runtime纯helper、CLI与observer；freeze及record_build复用同一列表。当前这些文件均存在，隔离结果另记录三工具及parser实际SHA。未调用真实freeze或build记录以证明这一点 |
| 证明口径 | pending磁盘字段只是定位提示。投影保留合法元数据不证明当前调用仍pending、供应商已执行/已取消/停止计费，也不证明本次真实暂停捕获或实际drain；这些仍由43及真实LIFE操作验证 |

## RO-CR01 · P1 · 超限无child断言可被自身异常捕获掩盖（已关闭）

首轮driver把subprocess.run替换为抛AssertionError，并仅比较oversize输入返回unavailable。被测runtime_diagnostics恰会捕获该异常并返回相同unavailable，因此即使错误地尝试启动child，这条检查也可能通过。无字段/非语义场景预期空对象，原本不会被同一返回值掩盖；问题集中在超限拒绝的证据强度。

已先报告主代理，未自行修改三工具。原作者将该mock保存为child，并在同一块内四条无child检查均显式要求 `child.call_count==0`，保留原24检查和合成输入范围，没有新增suite。修复后实际调用次数与返回值同时受检，AssertionError被吞也不能假绿。本审核复读修复并重新独立执行唯一driver，24/24通过。CLI与observer未因这项修订改变。

首轮[独立隔离结果](evidence/runtime-observer-independent-isolated.json)保留，SHA `2009552334aaa557045b4d20a758c0003b9dd7d34a334f0aea7fb8f0716d889b`，它只能按修复前driver的测试强度理解；不能把其中“oversize refused before child”当作已经证明实际调用数为零。原driver SHA为 `51f05ed4578c1e6838eb58a26a621ed0388a05c8ff9b145955a8dba75ecb492c`。

## 初始失败的归属

- 主代理报告首次CLI执行因CJS转换不支持top-level await而编译失败；该次不是通过，也不是生产业务RED。随后只把CLI入口改为显式Promise.then，主代理及本审核的当前版本隔离执行才通过。本审核未恢复或重跑旧失败版，不伪造旧版通过记录。
- 主代理另报告专用CLI TypeScript配置 `/tmp/shakeink-real-runtime-projector-tsconfig.json` 初次因/tmp默认类型查找找不到node类型而报TS2307/2580；显式设置repo node_modules/@types及types:['node']后同命令exit0，三工具未改。这是**主代理报告的类型检查结果**，本审核未额外执行typecheck，也未将配置失败计为业务RED。

## 最终独立执行

只执行批准的同一driver，输出分别为独占新文件；没有其他测试命令：

```sh
python3 scripts/verify-real-novel-runtime-observer.py --output docs/novel-import-real-books/evidence/runtime-observer-independent-isolated.json
python3 scripts/verify-real-novel-runtime-observer.py --output docs/novel-import-real-books/evidence/runtime-observer-independent-final-isolated.json
```

最终第二条命令 **exit0，24 assertions / 24 passed / 0 failed**，约0.95秒。24为检查断言数量，包含每次直接CLI调用的退出码/stderr/秘密哨兵检查，不称作24项独立小说测试。

实际覆盖合法pending、settled/drained元数据逐值保留；未知call/envelope key、跨session、超限stdin、坏UTF-8/JSON固定拒绝；带有合成正文/Key/grant哨兵的Python对象只发送允许的诊断与sessionId；四种无child场景实际call_count为0；构建身份含三项必要工具依赖。所有输入均为driver现场构造的内存对象/bytes；driver只读取被测源码作hash、写自己的隔离结果。

[最终独立结果](evidence/runtime-observer-independent-final-isolated.json) SHA-256：`23e949bdc48cf5447a39e6a2e774be30da33c3f0d0ae19c655a79c896c3b1fae`。结果文件用exclusive `open('x')` 新建，未覆盖首轮或主代理证据。最终执行前后以下指纹一致，与最终结果记录相同：

| 文件 | SHA-256 |
| --- | --- |
| scripts/project-real-novel-import-runtime.ts | `7b74ef87b4d61bc741be7dd282489e99f60dadab01585ee398f76a12a5f925a8` |
| scripts/observe-real-novel-import.py | `2f7db9e979798b888c9e5be1c186800d3135a43478ee13a04726db1987051a4e` |
| scripts/verify-real-novel-runtime-observer.py | `e0ab69b0c80e8637200e7412b59c919bf3ce05a274e4298d0a739ab45edf2032` |
| parser API依赖 desktop/core/novel-import-runtime-proof.ts | `ed77bbf8fe0f1c572e49e4d8178bbc27d712f56799616cc27ab4a6acf78bf5d7` |

**本轮工具增量PASS，无剩余必修项。** parser当前仍由B实施并由43独立审核；如其最终SHA改变，须按实际API差异做必要增量复核与新独占输出，不把本表绑定的执行结果自动套到新版。此报告不证明生产runtime tracker或真正RB-LIFE01，更不改变原真实小说结果。
