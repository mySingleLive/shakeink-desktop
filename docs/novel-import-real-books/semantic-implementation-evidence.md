# 语义导入实施证据（21 / 24）

日期：2026-10-26。实现代理 `checkpoint_review_impl`；独立审核由 37（控制器）和 38（发布）分别执行。本文是实现与限定执行记录，不替代独立审核，也不宣称真实模型或新真实书 run 通过。

## 最终接线

- 新 choose 会话使用 `semanticVersion:1`；缺版本的旧 journal 保持旧 scope、预算几何、章节规则、prompt/payload、plan 与回执合同。源文件、正文和作者手动章界不会因语义修订改写。
- `semanticState` 耐久保存输入/决定/正文修订指纹、完整作者 locks、修订 original/baseHash、分片任务及提案、遗漏任务及 `completedUnitIds`、持续冲突、两轮上限和最终 `verifiedHash`。审核后仍未解决的同 hash 冲突重新阻断，普通 retry/reopen 不抹去轮次或成功任务。
- 字段决定在完整 session clone 上验证、排队，最后一次提交。授权、证据、预算或容量失败不留下半个决定。显式 typed ID 引用和允许的唯一角色姓名引用组成双向关联闭包；共享精确来源证据也会关联，未做全文姓名搜索。
- reconcile 发送当前完整事实和有界 text 分片。transport text lock 只对应该分片；普通阶段只发送当前包实际存在的锁字段。服务端私有完整锁不变，ordinary/omission 合并在 coverage 前验证全部锁（含空值）；每个提案包和最终提交都用完整原对象差量、原生映射/全部 typed 引用、完整锁重新验证。
- 修订任务笛卡尔积在分配任务对象前检查：最多 10,000 个任务、保守估算最多 64 MiB 调度元数据。分片范围生成本身也有 10,000 上限，安全 UTF-16 边界保持旧分片方式；超限明确失败，无截断或成功 credit。原模型 source/B、metadata/2B、完整 payload/3B 和固定提示预留保持。
- `importNativeMappings` 返回 `{decoded,projectable,projectableIds,sourceCopyIds,mappingWarnings}`。sourceCopyIds 只按真实 `origin:'source'` 确定；源结构不可映射时保完整 raw 材料、警示并排除 native。父环以及其后代、指向未映射角色/事件的源引用也递归排除；strict inferred/confirmed 不降级。未知角色类型仅既有 Supporting 存储兼容位加明确标签；无可靠性源时间线不制造客观行。
- 普通 strict 业务描述、九 Setting 描述字段都保留已知 reliability/attribution/temporalScope。六类 text、Concept explanation、Faction description/非空 relations、Level 全局 description/非空 rules/非空路径与节点描述、条件与能力描述附限定；非空按 `trim().length>0`。名字、ID、别名、tag、枚举和树结构不改，不造节点。显式 source.content 的外部知识无损附到描述；没有 content 的源介绍 fallback 原字保留并保留结构警示。普通 source-copy 原 text/name/bio 不加前缀，raw facts/content 始终保存在记录。
- Character 业务 ID Map 与唯一姓名 Map 分开；关系与 ref.character 仅 ID，people/narrator 保留 ID 优先或唯一姓名。原生事件/叙事每段先扣限定前缀预算，总 UTF-16 长度不超过 100,000；后续事件片段时间保持 unknown。
- 发布记录新版按完整 artifact 内容去重（只扣 `original-` 展示 ID），同 text 而 facts/evidence 已更新的最终材料仍保留。读记录标签聚合同 artifact 所有警示，roleType 警示不会被前面的其它警示隐藏。既有 Record 组件复用该真实状态投影，没有新产品 UI/schema 迁移。
- 新版自动章界仅调用已审核纯 helper；手动 cuts 优先，旧无版本规则保持。PDF 来源证明、逐页门控、failure lineage、生命周期取消/关闭、预算检查点保持现有分支。

## RED 与 GREEN

均使用绝对 Node 24.18.0；仅批准名称。AI 是合成 provider/dependency 注入；SEM07 新子情形经过真实 `runImportAi` 的 serializer、预算、阶段和锁校验，没有调用真实模型。

| 原编号内新增边界 | 实际 RED | 最终 GREEN |
| --- | --- | --- |
| SEM06 跨 unit 单向 typed 引用、people/narrator 唯一姓名 | 原仅反向关系闭包漏目标 | 同名原测试 3/3 |
| SEM07 reopen 清 grant 后决定原子性 | 抛错后 occupation 已改变 | clone 排队后整体提交；原对象/决定/locks/coverage 相等 |
| SEM07 大 text 锁/包外 review 锁与空字段锁 | 可逆旧 transport 基线中真实 adapter 拒绝分片；去完整合并锁基线时空 occupation 被越权填入 | 实际 adapter 多片修订、全书/全 facts review 完成；omission 越权零新增 coverage/artifact credit |
| SEM08 容量、失败分片、恢复、两轮上限 | 容量函数缺失；原错误分片不得 credit；旧成功任务重发风险 | 10,000/10,001 边界、safe-integer overflow、元数据上界；暂停重开仅未成功任务，末哨兵保留 |
| SEM09 源父环后代及坏源字段/知识/引用 | source 子节点仍 native；坏 source 抛死纯复制；同 kind 推断被坏 raw identity 阻断 | 坏源完整保留+逐 ID 警示，0 AI；同 kind strict 新推断和 actual adapter 合法继续 |
| SEM04 九类 native 内容附限定 | 新 pure projection 不存在（4/5） | 5/5，原字段/结构/空白不变且知识可读 |
| SEM04 raw 未分型来源目录 | raw entityType 被假作 typed 目录导致 adapter 拒绝 | 来源 raw 保留，可信完整目录决定可投影类型 |
| P01 姓名等于另一角色 ID | 关系更新错行，目标关系为 []（4028 ms） | 独立 ID/name Maps 后正确行与 FK |
| P01 警示顺序 | 先出现不支持字段警示时 role 标签消失（7253 ms） | 全部警示聚合，角色类型标签可见 |
| P02 普通 kinds + 九 Setting + source 外部知识 | 原正常业务内容缺知识限定；SEM04 pure 首先 RED | 真实隔离 PGlite 查正常业务字段与原始 snapshot；不是只查 facts/count |
| P03 legacy + semantic/Bv2/PDF composition | 语义版本最初未进入 plan identity | 冻结旧 hash/回执/快照；新版保私有 proof/decoding、公开摘要剥 proof |

locks 的旧行为比较使用同一 SEM07 名称，在 `try/finally` 中临时恢复旧 transport 或移除完整合并锁门后执行并观察 RED，随后恢复最终实现；未把变异版本作为最终源码。

初次 SEM06–10 最小 RED 为 0/11，初次 P01–03 为 0/3（aliases/知识限定/语义 plan）。其后所有失败按原编号补回归，未扩 suite。

最终执行命令（`N=/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`，此处只是缩写）：

```sh
$N --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM(?:0[1-9]|10):' tests/unit/novel-import-semantic.test.ts tests/unit/novel-import-semantic-session.test.ts
$N --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM-P0[123]:' tests/integration/novel-import-semantic-publish.test.ts
$N --import tsx --test --test-name-pattern='^NI-A03:' tests/unit/novel-import-ai.test.ts
$N --import tsx --test --test-name-pattern='^NI-D01:' tests/unit/novel-import-domain.test.ts
$N --import tsx --test --test-name-pattern='^NI-CH0[123]:' tests/unit/novel-import-chapters.test.ts
```

结果：SEM01–10 共 25/25、4038 ms；P01–03 共 3/3、13494 ms；A03 1/1；D01 1/1；CH01–03 3/3。TypeScript 用当前 tsconfig、`noEmit:true,incremental:false` 的 createProgram 检查以下 11 个 owned 实现/测试文件，筛选其 diagnostics 为 0。未运行全文件/全仓 suite、额外旧 NI/PDF suite、构建或真实 app。

## 旧 S01 纯快照

只读 root 明确授权的脱敏 observer 副本 `S01-20261026-0355/completed-checkpoint-rev177.json`（session `ef97e681-df26-420b-a7ff-2c42758548b1`）。在内存按各 fileId 的原 units/start 拼回省略的 file.text，并从同 run 元数据补 path/bytes；读取原公共测试源仅校验 SHA。没有读取真实 journal/DB，没有恢复/启动 app。

- legacy semanticVersion 缺失；plan `d51702f08aef8b33b736c6295acb369c9748a20418c6cfd092654528a610faee` 不变。
- 57 artifacts；215 facts 字段 + 57 text = 272 个确定性 review tasks，与全部成功 reviewFacts 键逐项相等；13 workingUnits 不变。最初误把 272 当纯 facts 字段数的断言失败，随后按独立任务键与真实 215 字段区分校正，没有修改数据。
- 正文 2723 UTF-16 chars，UTF-8 SHA `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`，与 expected-body 字节相等。
- artifact 指纹 `9bad1af0c41ae94bbf0be6a6265104e6fd247cbb6696f5b8a29ac5c3eed61ce0`；facts 指纹 `6919008f85e7368074b360b24ea893216a7fff40736eb201d64a5104e7db5cf1`；workingUnits 指纹 `88d99e766e8b5438b98c2de422222a148a1488fee77b26edcce8d5cc170895ac`，纯函数调用前后相等。
- source SHA `54921ed14bde39f62be97c151ee40618fff62b51bde6c46800bf0139cc0752c4`，快照/run/expected-body 与 source 文件前后 SHA 相同。

上述只证明旧会话几何/指纹兼容，不改变原 S01 语义 FAIL，也不是新的真实模型性能或全目标验收。

## 冻结 SHA-256

```text
6292d4567fe3e7a06b6ec86265b28a9b3a79158e8cdd899d4be859d92b8837b3  desktop/main/novel-import.ts
3aeb90fded876870a83d272ba3d9a24b75fde397cebcb8182ae2dbf40f3a1db2  desktop/shared/novel-import.ts
854c734df935bb7631e71bf3c7e9d9a1f70a1c582a6d50ba102d5ba491793dbc  desktop/core/novel-import.ts
30ea421c4c70008ca1b975a16bfc9a83b70ed7dfbab1c9bfc7bac1312ef704ab  desktop/core/novel-import-semantics.ts
57bc498f75b800fc602666f984594bb7ec10e59207d5ee709f8dacda7272f60c  desktop/core/novel-import-semantic-state.ts
9e26d2c5751550b6410b3b6d00a3e220e4b917ac7b5124fad493e25b75e76051  desktop/core/novel-import-ai-payload.ts
803de671b3a9ec5e764d8b9bcabe081835750984acd862597fb5d87718e02599  desktop/service/novel-import-ai.ts
790c360ebe5e734cdfe5b95c68d58c25f512a4acf01cafb97baa04655ac92dde  desktop/service/novel-import-publish.ts
d822a3eed0f3ca1698d7326ffd70370269786fab0a95412a32e3efd3eee2787c  tests/unit/novel-import-semantic.test.ts
730343f42e7ddfca71fd1c9912d40966cb49c5ba22c2bbd5084101512b1aa8dc  tests/unit/novel-import-semantic-session.test.ts
b1ae2f06289b3279d60469d088988af8181185780d6c85d5c1d64b6216eb6469  tests/integration/novel-import-semantic-publish.test.ts
```

本轮未改 `desktop/main/index.ts`，仍为 `02da4014d9f4404b71b34a8c0917881d63053dddd25772ed4c2daee098f10778`；Record 原组件仍 `93da972ef693c3fdca37508085121c2f5c31d9714ae166c8c265a4b16c2cb61c`。其他人的未提交文件全部保留，未操作真实 journal、Key、用户数据库或模型。

## 38 增量 SP-CR04 / raw 基础结构

38 在前次冻结版发现知识限定重复投影缺少资源上限。本次仅改 semantics/state 两生产 helper 与原 SEM04/09/P01/P02 测试；main/shared/core-original/service/payload/publisher 的上方 SHA 保持。

`assertImportWorldContentProjectionBudget(content, knowledge, limits?)` 在 clone/重复附前缀前检查实际完整 JSON UTF-8 字节；按 JSON 规则计键、引号、逗号、括号、字符串转义、控制符/引号/反斜杠和 Unicode surrogate pair，对象 undefined 字段省略。外部知识前缀由常量片段与原字符串引用计 escaped bytes，不先构造巨大前缀；精确增量为前缀转义字节 × 实际附限定描述字段数。加法/乘法及输入 limits 都检查安全整数。硬门为 16 MiB 输出 JSON、100,000 描述字段，另有 1,000,000 结构访问节点及 256 深度保护。可选 limits 只能缩小门，不能放大。

`qualifyImportWorldContent` 首先调用该门，然后才 structuredClone/附限定。`importNativeMappings` 提前同门；严格派生/确认物超限抛错，source 超限保完整 text/facts/evidence/sourceUnitIds、加 content/知识字段容量警示并从 projectable 排除，因此 plan/audit 映射明确绑定结果。source 缺 content 的原字 fallback 按实际不加前缀的内容计量。publisher 现有 qualify 再次检查默认硬门。未提升模型 B/2B/3B，未截断，无巨大测试分配。

新增 `isImportRawSourceArtifact` 基础门要求真实 source、合法 id/kind/name/text、plain facts 与合法 string 字段、合法 sourceUnitIds/evidence 和良好 UTF-16。坏 aliases/reliability 等业务值仍可 raw-only；facts 字符串/数组/Date、坏 ID/kind/name、坏 UTF-16、坏数组/evidence 都拒绝，不能借 catch 降级。与 35 审计 raw 基础门一致，不扩大旧 journal 迁移。

实际执行：同原名字 SEM04/09 小边界先 RED 0/2（容量阈值被忽略及 facts 字符串被当 raw 接受），实现后 GREEN 2/2。精确 escaped JSON 字节边界通过、少一字节/少一个字段失败、放大 limits 被拒；clone spy 证明超限前 0 次 clone。P02 小阈值检查 source 超限 raw+warning/excluded、strict 硬失败、fallback 无额外前缀，含普通 FACTION 无 id 的 undefined 正常形状；在 try/finally 中暂时禁用 mapping 预检的同 P02 0/1 RED 后恢复最终源码。随后最终 SEM01–10 两文件 25/25、4038 ms，P01–03 3/3、13494 ms，11 owned TS diagnostics 0。全部仍为批准定向范围、合成数据/隔离 PGlite。

新 helper SHA 绑定本文件上方最终清单；此前 31/33 结论仅绑定其各自历史 hash，最终 37/38 需按本次 hash 独立增量审核。S01 rev177 脱敏纯快照在新 helper 下再次验证旧 plan/57 artifacts/215 fact fields/272 tasks/13 workingUnits/正文 SHA 与所有输入文件前后 SHA 不变；仍不宣称 S01 语义通过。
