# 长篇容量、耗时与旧检查点兼容方案

日期：2026-10-26（Asia/Shanghai）。状态：**待独立方案与定向用例审核，仅离线计算，未实现、未调用模型、未运行应用/CUA/数据库。** 本次只新增此文档。估算使用本地固定原件、独立正文/oracle、L02生产文本映射与当前纯函数；不读取真实journal、模型配置或Key，不将预计批次或乘法耗时称为真实性能通过。

## 问题、目标与不变量

当前 `desktop/core/novel-import.ts` 的 `importModelCharacterBudget` 最高12,000 UTF-16字符，`splitImportBatches` 每批最多100单元；`splitImportUnits` 遇空行提前切分，`workingImportUnits`也沿用该行为。正文按12个kind顺序独立遍历，之后仍有全文review及逐设定文字/facts/证据任务的合包review。12/13/14已解决恢复授权清空成功检查点及逐字段独立请求；本方案不重写该实现，也不把已成功S01重新作为新策略测试书。

目标是在**新建且适用大上下文的会话**中减少网络往返，保持：全部来源先分类、全部所选正文按原顺序进入每个目标、全文review继续存在、全部设定文字/facts/证据实际复核、精确引用、完整响应校验和epoch有效后才checkpoint。没有摘要替代、开头采样、原文截断、跳kind、改变pure-copy门控或并行发12个请求。正常pause/drain、发布事务及原request回执规则继续成立。

本轮使用主代理提供的当前配置容量 `contextWindow=1,048,576` 进行计算；它是现有配置值，不在本方案中声称已独立验证供应商窗口、分词器、最大输出或吞吐。

## 可复核的离线输入与计算

本地根为 `/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026/`。六个原件的字节SHA均在本次只读计算中与对应oracle的sourceHash相等；完整原文不写入仓库。

S01/S02/M01/M02/L01使用 `语义基线/<ID>.json` 中 `independentTextPath` 的严格UTF-8文本，按 `selectedBodyRange` 的**Unicode codepoint**坐标取完整连续跨度，再交现有JS纯函数计算UTF-16单元。估算没有更改来源或执行UI选择。M01跨度内58字符编注、M02的124字符编注及L01的4,573字符版式区另按已列范围离线排除做敏感性计算，新旧批次数均未变；正式UI仍须依oracle核对，不能据该表默认批准编注/页眉进入正文。L01此处只有独立PDF文字的几何估算，不是PDF生产解析或图像页审核通过。

L02必须用 `输入核验/L02-selected-production-prose.txt`：1,105,899 UTF-16字符、1,139,556 UTF-8字节，SHA-256 `58548a4030b4da383b4bddb22948c3218913a0b32110bd89dace4e4c881d0c41`。原DOCX SHA `7e4f3f5d38b70531364a275d06148d21ab273226a9f1f86f8c7554ea743f7845`；冻结oracle SHA `9484142bcc54d2e7e24a7ff66a7c268cb0144c074d218906715b82be867b29f3`；`L02-ui-source-map.json` SHA `71ae53d11259657730768543468bb05dea013d64019f97ae3fae487c961873ff`。

该map把独立原文区间映射到生产UTF-16 `[9693,1115592)`，主小说为序章、58章、尾声，共60节，排除Ars Arcanum及其他书试读。分类估算读取map绑定的**完整生产提取文字**1,343,352字符及其正文/附属parts，SHA `b646b9942fbb47feff6358f5b8d317fc7b714794b317e1ce9c2f3399cb8916c7`，没有只分类选中正文。生产文字与独立提取的版式差异继续依map审计，不把二者当逐字相同。正式章界必须使用既有map的60个明确cuts；本容量补丁不修复英文标题自动识别只认出1节的问题。

| 输入 | 连续正文跨度UTF-16字符 | 本次跨度UTF-8 SHA-256 |
| --- | ---: | --- |
| S01 | 2,723 | `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a` |
| S02（完整MD） | 5,310 | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| M01 | 23,257 | `b06de8a2b8ac2e8e2561f6b4fb39d6f15e866001f4af6d3c24e929cb7f87c397` |
| M02 | 182,372 | `d54f2f4806d149d3540a77b6b4c731083dc3bf340cf037e131ab50f262659492` |
| L01（独立文字） | 131,797 | `731f5bc9e0e0948c63d709e578f44da9e15ab143577bd46c0ba57d7eac2665d4` |
| L02（map绑定生产正文） | 1,105,899 | `58548a4030b4da383b4bddb22948c3218913a0b32110bd89dace4e4c881d0c41` |

实际计算命令为本机Node24绝对路径加 `--import tsx --input-type=module` 的只读heredoc，加载当前 `splitImportUnits`、`splitImportBatches`、`importModelCharacterBudget`、`safeImportBoundary`。旧计数直接调用生产纯函数；候选计数只在内存仿真下节的可选单元上限和相邻合并，不替换生产函数。另断言仿真在12,000/100参数时与生产旧批次逐项一致；合并前后拼接相同、全部UTF-16边界安全、每单元不超过1,000字符、`text===body.slice(start,end)`。命令exit0，只输出计数/hash，没有源文字、模型/DB/进程操作或测试suite。

计算时 `desktop/core/novel-import.ts` SHA-256 为 `b571ac2c59e2c709a89432f452163f223713b000c4d04e34dc23333f1e07b354`；主控制器为14审核的 `8b004ecab38be45b35394581781aaae0fc8fe2dfe82453c5d793a769bbaeccf5`；AI适配器为 `7b35bae5e6438a348bb6606578de51dd89f356f3221cd32cae0e6913ad805829`。后续PDF组合若改变这些文件，应按新hash重做离线计数/兼容核对，不能继续宣称本表绑定新实现。

## 新会话的版本化预算

明确把“256k”取为262,144、“128k”取为131,072个配置context单位。阈值以下全部继续旧公式，包括中间的(131072,262144)区间；256,000也保守留在旧侧，避免模糊k含义。新策略只对安全整数、已知容量生效；未知容量沿原规则处理，不猜大窗口。

```text
legacy(C) = min(12000, floor(((C > 0 ? C : 16000) - 6000) / 2))
            保留现有不足1000报错等行为
large(C)  = C >= 262144
              ? min(120000, floor((C - 65536) / 12))
              : legacy(C)
```

| 配置context | 新大窗口公式的字符预算 |
| ---: | ---: |
| 16,000 | 5,000（旧公式） |
| 131,072 / 256,000 / 262,143 | 12,000（旧公式） |
| 262,144 | 16,384 |
| 524,288 | 38,229 |
| 1,048,576 | **81,920** |
| 1,505,536及以上 | 120,000上限 |

不得直接把默认 `importModelCharacterBudget(C)` 全局改成large：主控制器、reviewFacts分片和现有审计helper都依赖旧默认。拟保留默认legacy，新增显式版本/容量ceiling helper；只有已持久化新策略的控制器选择large。

`splitImportBatches(units,maxCharacters,maxUnits=100)`拟增加可选第三参，旧调用默认100且输出逐项不变；新策略最多300，正整数范围1..300，非法值明确拒绝。字符预算与单元上限同时限制，任何一个先到即封包。单个unit超过字符预算仍失败，不截断。来源分类的units保持原数量、ID、text、part及start/end，**只扩大网络包，不合并来源unit**。

### 容量推导与最终闸

令阶段有效字符预算为B。继续要求唯一源字符总量≤B，设定复核内容JSON `{units,artifacts}` ≤2B，适配器**实际完整payload JSON**（含相关实体、章节、指令、决定、冲突及转义）≤3B；不得把完整闸改为4B、跳过目录/决定计数，或失败后临时放大B。

UTF-8对有效UTF-16文本每code unit最多3字节；JSON控制字符/转义的扩张已经计入序列化后的payload.length。因此完整payload的粗字节上界为9B。公式把另3B及65,536留给输出、固定提示和协议余量：`12B+65536<=C`。当前B=81,920时，完整JSON字符上限245,760、粗字节上限737,280；另有311,296个工程预留单位。

这是保守的**字节容量设计包络**，不是对所有分词器“1字节恰为1token”的证明，也不是供应商允许245,760输出token的声明。固定提示、JSON补充指令及一次结构纠正提示都占余量；实施时要核算实际拼出的完整提示字节，验证固定提示部分没有突破64KiB预留。保留现有网关和供应商输出限制，不为装下大包擅自提高maxOutputTokens。provider拒绝、`finishReason!='stop'`、JSON截断、缺分类项或引用校验失败一律不记覆盖。当前 `generateJSON`已检查finishReason并最多一次结构纠正；现有网络重试也会增加实际往返，必须如实记录，不能混进“单批一次调用”证明。

适配器从**当前实际解析的角色模型**计算model ceiling，再验证主进程传入的冻结session预算（无新字段的旧调用默认legacy），有效B不能大于model ceiling；profile不兼容应拒绝，不能靠取min后暗改任务几何。服务端可具备81,920的模型容量，同时旧控制器仍发送12,000包；旧请求的有效最终3×12,000闸可继续保留。服务容量提高本身不能驱动旧会话重新分片。

## 新正文单元与来源坐标

仅当新策略已在会话创建时确定、且首次生成该版本 `workingUnits` 时，按原1000字符切分结果的顺序，贪心合并同fileId、相同part、`previous.end===next.start`且合计≤1000的相邻正文单元。不得跨缺口、重排、trim、统一换行或拆surrogate。合并后ID仍由 `working-<workingRevision>:<start>:<end>` 确定；text取工作正文的精确slice，start/end仍是全书工作正文UTF-16半开坐标。

**任何已经持久化的workingUnits都原样返回**，包括旧会话，以及新策略会话的暂停/重开/重试。旧会话即使尚未生成workingUnits也沿旧段落切法。正文明确修改导致workingRevision增加、现有invalidate清空成果后，才按该会话已冻结的策略生成新revision单元；不因软件/模型升级重建原数组。

模型证据仍使用实际提交的working unit ID与连续精确quote，现有layout唯一定位、证据与引用校验不放宽。对未修改正文，可按 `selectedImportUnits` 的顺序累计工作偏移，把一个合并unit映射回一个或多个原source区间；若选区之间有排除内容，映射保留多个跨度，不能伪造单一原文件连续区间。已修改工作正文以作者批准版本为证据，原件/原正文继续单独审计，不声称新工作偏移就是原件偏移。

## 离线批次数与耗时敏感性

以下“新”均是假设**新建**、text/review角色均为1,048,576 context、启用v2的假想run。S01/S02行用于小书兼容性比较，不授权重做已有S01。分类覆盖完整来源；分析每kind完整遍历所选正文，12个kind全部执行；全文review另计一次。

| 样本 | 来源分类units | 工作正文units 旧→新 | 分类批数 旧→新 | 每kind分析批数 旧→新 | 12类分析批数 旧→新 | 全文review批数 旧→新 | 基础总批数 旧→新 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S01 | 26 | 13→3 | 1→1 | 1→1 | 12→12 | 1→1 | 14→14 |
| S02 | 105 | 91→6 | 2→1 | 1→1 | 12→12 | 1→1 | 15→14 |
| M01 | 373 | 317→25 | 4→2 | 4→1 | 48→12 | 4→1 | 56→15 |
| M02 | 490 | 408→238 | 18→3 | 16→3 | 192→36 | 16→3 | 226→42 |
| L01（独立文字估算） | 1,626 | 1,568→165 | 17→6 | 16→2 | 192→24 | 16→2 | 225→32 |
| L02（生产文本map） | 1,554 | 1,241→1,136 | 115→17 | 95→14 | 1,140→168 | 95→14 | **1,350→199** |
| 合计 | 4,174 | 3,638→1,573 | 157→30 | — | 1,596→264 | 133→22 | **1,886→316** |

“基础”是 `分类 + 12×每kind正文 + 全文review`，**不包含设定reviewFacts、相关元数据导致的额外分包、结构纠正、网络重试、冲突解释/正文改写、识别/选区人工核对、模型耗时随包长变化及发布/语义审读**。L01生产提取/页核对仍需15/16/17方案的真实验证；上述数字不代表其当前可运行。

| 样本/范围 | 旧基础批次×1–3分钟，仅乘法 | 新基础批次×1–3分钟，仅乘法 |
| --- | --- | --- |
| M02 | 3.77–11.30小时 | 0.70–2.10小时 |
| L01 | 3.75–11.25小时 | 0.53–1.60小时 |
| L02 | 22.50–67.50小时 | 3.32–9.95小时 |
| 六书 | 31.43–94.30小时 | 5.27–15.80小时 |

1–3分钟来自主代理当前观察，不是本次测得的分布；更大请求可能更慢，因此不能据约6.0倍批数下降宣称约6倍速度提升，也不能保证六书在这些小时内完成。设定复核尚无法从正文长度准确预测：任务数仍为每artifact的完整文本片段和全部facts字段，与全部证据批次的笛卡尔积，实际合包再受B/2B/3B限制；缺少真实长书设定产物时不虚构其调用数、token或费用。

隔离因素的每kind离线对比说明三项不能互相替代：

| 样本 | 仅提高B、原units/100 | 提高B、原units/300 | 提高B、合并工作units/100 | 提议完整方案/300 |
| --- | ---: | ---: | ---: | ---: |
| M01 | 4 | 2 | 1 | 1 |
| M02 | 5 | 3 | 3 | 3 |
| L01 | 16 | 6 | 2 | 2 |
| L02 | 14 | 14 | 14 | 14 |

L02主要受字符cap限制，并非本份生产文本有7,305个working unit：map的paragraphMap长度7,305是原文映射项数；真实当前切分为1,241。L01/M01则明显受短单元数限制。不能把段落数当网络批数或把来源units改成合并正文units。

候选新包（只含units与空artifacts）的最大序列化长度在六书中为109,914字符，低于当前3B=245,760；L02最大单包源字符81,654、工作units86，分类包最多120单元，未碰300上限。**这不是完整AI payload大小通过**：实际entities/chapters/facts/decisions尚未加入，仍必须逐包运行最终闸。

## 元数据、输出与失败处理

相关实体/父事件闭包、章节全局index和全部作者决定继续按现有规则传入。不能用删尾目录、漏父节点、忽略解释或摘要替代原设定的方式凑预算。已有 `contextArtifacts` 的可选分析上下文选择不等于完整设定已复核，完整text/facts仍必须在reviewFacts任务中全部出现。

v2在真正请求前必须使用与适配器相同的纯payload构造/计量逻辑作预检：若完整包超3B，确定性地把**未完成任务**拆成更小网络包并重新计算完整相关目录，而不改unit文字/ID、facts任务键或B。按原顺序贪心加任务，候选一旦超B/2B/3B或300单元，先发送已装下的前缀；单任务/单unit连完整相关元数据都装不下时明确失败。每个任务/引用仍完整，不在正文或一个facts任务中间切掉尾部。适配器仍独立复验，不信任控制器“已检查”。表中数字继续标为不含元数据分裂的基础估算，不能承诺所有包必装下。

拟把现有service中纯粹的相关目录/章节筛选及payload构造提取到同一个无IO helper，由控制器预检和适配器最终检查共同调用，避免两份逻辑各自漏算字段；鉴权/模型快照解析仍只在原worker入口。正文候选包的可选 `contextArtifacts` 沿原选择规则构造，不能为了预检成功新增删事实规则。实际发送使用同一份已计量的units/artifacts/目录/决定快照；worker重新核验模型及完整payload。角色不匹配或worker最终闸仍拒绝时本包零credit，不循环放宽预算。

本地资源也要有界：维持现有来源25,000,000 UTF-16字符、派生设定JSON50,000,000字符及journal 1GiB等独立容量门，不把模型context当本地容量。逐包构造、发送、checkpoint后释放临时JSON，不预先保留全书×12个序列化包；共享源引用与pending任务标识不复制全部原文。当前RPC会发送实体目录后再由worker筛相关项，原目录/父闭包的CPU和传输体积仍须记录，不能仅凭provider payload达标宣称IPC/总RSS已获硬上限或无成本。此次没有测内存/CPU，不能把批次估算冒充该项通过。

v2分析/分类/全文review在封包前过滤已覆盖unit ID，防止“较大父包拆成两个子包，首子包成功、次子包失败”后恢复重发首子包；网络包号不是检查点身份。reviewFacts按原稳定任务键过滤，只有共享units去重，不按artifact.id覆盖。完整响应、所有冲突证据/引用及epoch全部有效后，一次保存该包所有任务覆盖；输出截断/结构失败/部分分类/取消/迟到结果均零新增credit。保留此前已成功包，禁止为降低耗时清掉失败证据或把失败目标改成notFound。

## 策略身份与旧journal兼容

拟使用私有可选 `budgetPolicy?:{version:2,...}`（等价于可选policyVersion=2标记），保存text/review角色的冻结字符预算、单元上限、工作正文单元策略、review文本分片大小及证据批次上限。首次创建时只有两个必需角色均已配置且达到大窗口阈值才选择v2；模型缺失/较小/未知则留legacy，不因随后配置模型自动升级同一会话。字段须严格校验，未知版本/矛盾几何不作为“可恢复v2”静默接受。

| 会话 | 预算/工作units/任务几何 |
| --- | --- |
| 缺少v2标记的旧journal（含当前S01） | 原legacy预算（当前S01为12,000）、默认100、原workingUnits；不得补v2或改已有facts键 |
| 缺v2标记且workingUnits尚未生成 | 仍用原段落切法和legacy预算；不是趁首次生成自动升级的机会 |
| 新建且满足大窗口条件 | 在首次授权/发送前持久化v2角色profile；本次1M窗口为81,920/300，首次工作正文可相邻合并 |
| 已有v2，重开/重新授权/正常重试 | 读取已持久化profile和workingUnits，不随当前软件默认值重分片 |

不能给旧会话的scope/plan输入补 `policyVersion:1`、空对象/数组，或把新helper默认值反向应用到旧会话。旧 `importScopeHash`、`importPlanHash`、analysisCheckpoint.hash、来源units、工作units、成功coverage及reviewFacts键均保持原值。新策略身份及工作单元manifest只在v2条件分支绑定到新scope/plan；发布记录也只给v2增加策略审计字段。与PDF方案一样，条件展开而非给旧材料补默认字段。

需要单独处理**模型/profile变化**：

- 角色模型、endpoint、authRevision等变化继续撤销/重取发送授权，不因有policy标记跳过现有前后模型校验。
- v2几何来自已保存profile，不从重开的 `s.models` 或当前adapter ceiling重新推导。换到容量足以承载原冻结profile的模型，明确重新授权后可沿原几何继续；容量不足则暂停并阻断，要求恢复兼容配置或另开新会话，不能自动缩B、改review分片/证据批次或清掉检查点。不得新增未批准的“自动迁移策略/重新分析”UI动作。
- 旧会话也不能因角色context从大窗改为16k而把既有2,400字符review片段变成1,000字符片段。拟在任何覆盖已存在时，先从仍有效的原grant/持久化角色快照捕获legacy执行几何，再更新当前展示models；必要时仅持久化**不参与旧scope/plan的私有legacy几何绑定**（不是升级为v2）。原旧16k会话继续5,000，原旧大窗继续12,000。几何有变化则阻断；仅换auth/模型而legacy几何不变可按现有重授权继续。历史绑定无法证明时不得猜测并重算已完成任务；保留草稿并明确阻断不兼容变更。

最后一点必须通过用例审核收敛：当前initialize会撤销grant并刷新models，不能在这之后才“从新models推断旧预算”。本次不读取/改写真实S01来迁移，实际兼容验证使用脱敏合成形状；新构建进入真实流程前由主代理确认S01指纹/coverage保持。

审计脚本 `scripts/audit-real-novel-import.ts` 的 `factKeys` 当前按旧预算计算，后续必须显式读取持久化策略/legacy几何，而非默认large或最新模型context；无v2的S01仍按旧文本片段和证据批次计算。只读观察器须条件导出新策略和核对任务所需的工作单元manifest/预算，旧输出不补空字段。该审计改动不授权执行数据库或读取其他作品；RB-P01的正常关闭、own work/novel、只读事务、排他外部证据边界继续适用。

## 拟改文件与PDF工作协调

本文件不授权立即编码。审核通过后先由主代理与PDF实施代理确认共享文件最新hash，再安排窄实现与独立code review。不能让容量代理覆盖PDF增量，不能把PDF image待核对、源proof重验或发布门控改成容量条件。

- `desktop/core/novel-import.ts`：保留旧默认；显式预算policy helper、批次可选单元数、仅v2工作正文相邻合并；新策略条件指纹。不得修改来源解析/分类切分语义。
- `desktop/shared/novel-import.ts`、`desktop/main/novel-import.ts`：私有可选profile、冻结与兼容校验、旧几何保护、逐阶段选取，保留12/14恢复和review原子合包实现。严格复用PDF正在增加的可选字段/检查点门控，不恢复旧文件版本。
- `desktop/service/novel-import-ai.ts`：实际角色model ceiling和有效冻结B、完整3B闸、必要的计量预检；不改Key、用户模型、供应商端点、业务目标、引用校验或网关重试策略。
- 可新增 `desktop/core/novel-import-ai-payload.ts` 作为上述无IO共用构造/计量helper，仅迁出当前service的相关实体/章节筛选与序列化，不引入模型或数据库依赖。旧请求黄金payload须逐字节相同。
- 若新策略进入发布审计，`desktop/service/novel-import-publish.ts`仅条件加入v2策略/工作单元身份，旧publicationRecord逐字节不变；与PDF条件审计一起组合。
- `scripts/observe-real-novel-import.py`、`scripts/audit-real-novel-import.ts`：条件记录/消费policy和旧执行几何，所有原只读与脱敏限制不变。不在容量补丁中实际执行RB-P01。

## 精确定向回归草案（尚未编写/运行）

| 新测试完整名称 | 文件 | 关键断言 |
| --- | --- | --- |
| `NI-LB01: explicit large-context budgets preserve every legacy threshold and final capacity bound` | `tests/unit/novel-import-ai.test.ts` | 默认legacy不变；0/16k/128k/256000/262143/262144/1M/cap边界；大窗口必须显式policy；9B字节包络/固定提示余量及源字符、完整3B闸的等于/超1边界；不能只检查返回数字 |
| `NI-LB02: optional unit caps preserve default batches and all ordered source characters` | `tests/unit/novel-import-ai.test.ts` | 默认100逐批与旧黄金向量相同；100/300/301、非法上限、源字符先到和单元数先到；首中尾全部unit多重集、顺序、UTF-8拼接相等；单unit超限明确失败 |
| `NI-LB03: only new working prose coalesces adjacent safe UTF16 ranges` | `tests/unit/novel-import-domain.test.ts` | 密集短段、CRLF/空行/英文/汉字/emoji、恰1000边界，全部slice/start/end/ID可解析；不同fileId/part/缺口不合并；来源分类units完全相等；旧/已有workingUnits引用与序列化均不改 |
| `NI-LB04: absent policies keep legacy scope plan checkpoints and review keys byte identical` | `tests/unit/novel-import-session.test.ts` | 冻结旧S01形状及旧16k形状（含已成功facts键），持久化→重开→choose-target→start；原scope/plan/checkpoint/hash及成功artifact/coverage逐项相同，不补v2；缺workingUnits也用旧切法；与PDF无字段场景组合 |
| `NI-LB05: frozen role profiles survive restart and reject incompatible model changes without losing progress` | `tests/unit/novel-import-session.test.ts` | text/review不同context、角色缺失、auth变化、升/降窗口、未知容量；兼容需授权且不重切，不兼容零AI/零覆盖破坏；覆盖存在时从旧有效grant捕获几何而非新models；v2字段畸形拒绝 |
| `NI-LB06: large requests enforce complete payload and reject truncated or partial output before credit` | `tests/unit/novel-import-ai.test.ts` | 捕获实际payload及prompt，含目录父闭包/全部chapter index/decisions/JSON转义/Unicode；初始及结构纠正的length/incomplete、缺一分类、引用无效、超3B/固定预留失败不能产生成功结果；不删字段通关 |
| `NI-LB07: every large-book kind sends all text and retries only uncovered stable units` | `tests/unit/novel-import-session.test.ts` | 合成约110万字符，12kind顺序不变，每kind每unit恰好一次成功提交，首中尾/末章哨兵及严格拼接；成功子包后失败/在途pause→正常重开，已覆盖子包不重发；实际source分类单元完全未合并 |
| `NI-LB08: fact review uses persisted geometry independently of adapter model capacity` | `tests/unit/novel-import-session.test.ts` | 同artifact多片/全部字段/替代值/证据任务多重集，legacy5k/12k与v2各自冻结key；adapter扩大但旧任务键不变；成功包保持、失败整包零credit、恢复只补未完成；全文review不能被facts替代 |
| `NI-LB09: own-run audit reconstructs fact coverage from persisted policy without promoting legacy records` | `tests/unit/novel-import-budget-policy.test.ts`（新纯单测文件） | 把审计几何计算分离为可导入纯函数，合成冻结checkpoint验证legacy/v2 key；输入models刷新不改变旧绑定；缺/错policy明确失败；测试不导入会自动执行DB的CLI入口，不访问真实目录/DB |
| `NI-LB10: metadata-aware packing preserves full dependencies and atomic coverage` | `tests/unit/novel-import-session.test.ts` | 大实体目录、父闭包/决策使源包≤B但完整payload>3B；完整任务/引用多重集无丢失、单包共用逻辑预检和worker独立最终复验；首包成功后次包失败的resume只补未完成；单任务仍超限明确失败而非截断；旧黄金payload不变 |

以上新用例先经独立审核，再TDD红→窄实现绿→独立code review。计划执行范围仅这些新名称及直接相关旧 `NI-A01/02/03/05/06`、`NI-D01/06/08`、`NI-S02/07/08/10/11`；不得运行整文件、全仓或通配suite。PDF回归由主代理与另一方案按实际冲突点合并精确名单，不默认扩为全部PDF/浏览器/打包测试。

拟定Node24命令（待实际测试文件/名称存在、审核批准后才执行，当前没有执行）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  --test-name-pattern='^(?:NI-LB(?:01|02|06)|NI-A(?:01|02|03|05|06)):' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  --test-name-pattern='^(?:NI-LB03|NI-D(?:01|06|08)):' tests/unit/novel-import-domain.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  --test-name-pattern='^(?:NI-LB(?:04|05|07|08|10)|NI-S(?:02|07|08|10|11)):' tests/unit/novel-import-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  --test-name-pattern='^NI-LB09:' tests/unit/novel-import-budget-policy.test.ts
```

## 验收与停止条件

通过上述限定检查和独立审核后，由主代理组合PDF变更、构建，再先核对旧S01的源/plan/scope/analysisCheckpoint、成功artifacts与全部既有facts键逐项保留。新策略只用于后续新run；选择M02做完整中篇和正式在途暂停/正常退出/重开/最终发布，再处理L02，保留原文件/60章映射/十二目标及两线。新包的真实生成时长、实际payload大小、语义遗漏、输出截断、失败/重试数由本次run实际证据记录；不得读取global Usage或拿离线乘法填token/费用。

若大包频繁输出截断、相关元数据无法装入或独立语义审核不合格，保留本次检查点及失败，不自动改小profile后复用不同facts几何、不略过目标。新策略需要调参时形成新版本并审核，已有run保持原身份；六书未全部通过时逐项列未执行/阻断，不把批次数减少当质量验收完成。
