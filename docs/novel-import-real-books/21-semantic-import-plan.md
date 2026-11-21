# 真实导入语义、业务映射与英文章界修复方案及限定TDD用例

日期：2026-10-26（Asia/Shanghai）。状态：**待另一独立代理审核方案与用例；本文仅文档，未实现、未运行测试、未调用真实模型/应用/UI/数据库。** 不据本文关闭任何真实失败。

## 1. 证据与目标

依据[已发布S01最终复审](reviews/S01-publication-01.md)、[S01逐项审读](reviews/S01-20261026-0355.md)及当前源文件。本轮不是继续把S01的completed当作质量通过：原文2723字符保真、回执与35条机械断言成立，但角色字段、地点/世界语义、转述与因果、早期还账范围、绰号/早期伤痕铺垫召回仍失败。作者决定只有decisions记录，最终原48项产物没有随解释修订；叙事卡默认“客观事实”又扩大了知识来源错误。

另有真实格式结果：L02正文为序章+58章+尾声，应60节，当前自动章界只给1节；M02为独立行Roman I–XVI及Epilogue，应17节。不能靠丢标题、重写正文或对书名编写特例修复。

目标是让新run通过既有真实业务模型和面板可用：角色进入正常角色字段；Scene保存地点树；World保存世界树，其九类世界级Setting具有正确worldId/type/native content；作者事实决定实际传播至关联产物和两线，再完整复核；章界精确且正文不变。不是建立新的创作工作台、事实知识库或通用知识图谱。

## 2. 不变量与实施范围

- 不修改schema/数据库迁移、现有编辑器UI或业务分类；继续13来源类/12补全目标。“世界观”内部映射到现有World/Setting，不新增面向用户的分类。
- 源文件/来源units/初始正文只读。只有既有apply-patches逐处明确批准才可改变workingProse；设定修订绝不能调用正文patch路径。
- 新推断的未知字段留空或待确认，不用姓名猜年龄/性别、将“十二岁起任职”填成当前年龄，或默认所有推断角色SUPPORTING。没有某类事实允许notFound，不能制造超能力、势力或等级凑齐九类。source-only的既有复制能力按下述明确兼容规则保留，不强制AI。
- 不把oracle、验收对象清单、出版后错误答案或测试脚本塞进模型；生产代码/固定提示不含特定书名、人物名、章节数量或特定解释。
- 保留既有来源/授权版本核验、精确证据与唯一版式定位、完整响应/引用校验、预算、epoch/暂停、原子发布及幂等回执。
- 历史已发布S01的work/novel、receipt、importHash、NOVEL_IMPORT snapshot与native记录不迁移、不补写、不清理。它继续作为真实失败样本；修复后使用新session/request/独立空run目录与新书名重测。

拟修改范围：

| 文件 | 窄职责 |
| --- | --- |
| 新`desktop/core/novel-import-semantics.ts` | 现有领域字段白名单、native content严格解码、分类型引用/层级验证、设定差量修订纯函数；不访问DB/模型 |
| 新`desktop/core/novel-import-chapters.ts` | 精确保留偏移的标题候选与完整序列校验 |
| `desktop/core/novel-import.ts` | 章界委托、按业务身份合并、调用上述校验；保留手动cuts/原文与容量行为 |
| `desktop/shared/novel-import.ts` | 新会话可选语义契约版本、简小的设定修订请求/差量结果与私有检查点；不新增UI action |
| `desktop/core/novel-import-ai-payload.ts` | 各kind真实业务字段/知识来源契约、修订模式与完整性复核指令；全部新增内容计入实际payload/固定提示预算 |
| `desktop/service/novel-import-ai.ts` | 按模式严格解析/验证native字段与差量结果，继续当前授权/证据边界 |
| `desktop/main/novel-import.ts` | 决定的字段级应用、有界设定修订、完整复核及恢复；不重写预算/PDF子系统 |
| `desktop/service/novel-import-publish.ts` | 新语义版本的真实native投影与可靠性保留，旧回执路径隔离 |

`src/components/content/setting-content.ts`、`SettingContentEditor.tsx`、`prisma/schema.prisma`、`src/lib/planning/domain.ts`是现有消费契约。前者为无React的纯类型/规整函数，可复用其类型/纯函数核对；不把客户端组件引入主进程，不复制一套新编辑器。

## 3. 生成与投影共用同一份窄契约

保留ImportArtifact的id/kind/name/text/facts/evidence/sourceUnitIds。facts仍为字符串字典；数组/结构化content用可校验JSON字符串，不另建庞大字段系统。新会话持久化可选`semanticVersion:1`；新推断/确认产物必须按相应kind验证。旧版本材料只读兼容，不拿严格新契约重解释旧发布记录。

### 角色

本轮支持并实际投影已有字段：roleType、aliases、age、gender、occupation、personality、appearance、clothing、catchphrase、growthArc、relationships；bio取已复核的text。aliases为字符串数组；relationships为已有`{target,description,characterId?}`数组，其中characterId仍是导入artifact ID，发布两遍创建后解析到本作品真实Character ID。无链接但有证据的姓名快照可以保留，不能猜同名人物外键。

对**新推断**，roleType只能为现有PROTAGONIST/SUPPORTING/ANTAGONIST，必须有源文/叙事功能依据；缺失或歧义进入待确认/明确失败，不在publisher兜底成SUPPORTING。其他未知项可空。源码中“traits/duties/actions”不再作为新推断的替代字段悄悄被丢弃：提示要求现有字段，适配器遇这类未支持字段须报映射问题，尚未记coverage；不能仅把traits机械复制到personality或appearance。被用户明确确认的字段按本字段类型校验，不因确认其中一个字段就声称其余字段也被推断/确认。

不增加身高、人格五维等本轮未失败的庞大强制字段。绰号/本名未知等需要在已有aliases和bio/描述中准确表达，不能为填aliases杜撰真名，也不以显示名本身替代绰号来源识别。

### Scene是地点

新scene产物要求`facts.entityType="PLACE"`，本轮仅支持parentId、coordinates及description=text。name标识具体地点/小空间，而非“某人受嘲”“最后来店”等情节标题。事件/时序/参与者归世界线与叙事线，不落地点树；不扩大为全部场景编辑字段迁移。

parentId只引用同书scene，按拓扑创建并拒绝循环、自指/外部ID。相同名字但不同已证实父地点不能按kind+name强合并；地点身份包含父节点，身份不明沿现有待确认/失败路径处理。不强制每本书有固定地点数量，不用名称正则假装能够自动证明“这是地点”。提示、严格类型与独立语义审核各有证据边界。

### World与世界级Setting

保留kind=world，使用最小区分：

| entityType | facts必需/可选项 | 真实投影 |
| --- | --- | --- |
| `WORLD` | parentId可选，只指另一个WORLD | World(name,description=text,parentId) |
| `SETTING` | worldId、settingType、content；parentId仅MAP允许 | Setting(novelId,worldId,type,name,content,parentId) |

WORLD是有身份的世界/嵌套世界，不是“酒价”“顾客分层”“看客文化”等主题。没有专有世界名时，允许明确标为未命名的作品世界容器，描述未知则空；它只是承载所属世界的中性标识，不声称小说存在一个新命名宇宙，不编时代/国家/疆域。来源显示多个世界但归属不明时必须待确认，不能把所有设定塞进一个默认世界。

SETTING只接受现有九类世界级类型，GOLD_FINGER/STYLE仍走原小说级目标：

| settingType | 与真实编辑器一致的content |
| --- | --- |
| LEVEL_SYSTEM | `{scope,form,description,rules,levels,pathways}`，节点使用现有LevelNode/LevelPathway/LevelAbility结构；没有证据不造等级/途径 |
| CONCEPT | `{concepts:[{term,explanation}]}` |
| FACTION | `{factions:[{id?,name,description,relations}]}` |
| POWER_SYSTEM / MAP / SOCIETY / CULTURE / GEOGRAPHY / WORLD_HISTORY | `{text}`，保留完整已选文字，不放到description等编辑器不会读取的键 |

不能仅调用宽容`normalizeContent`就认证成功：它会给错误结构补空。先严格检查结构、枚举与来源保留，再验证normalizeContent后供编辑器读取的实质内容没有变空/丢失。默认数组/空字符串只代表没有已证实内容，不补写层级或规则。MAP的parentId只能指同world的MAP；无父关系则null。

world合并身份包含entityType；SETTING再包含worldId/settingType/parentId，WORLD包含父世界。不得把不同世界的同名规则合并，也不能让SETTING充当父World。发布先创建World树，再Setting/MAP树，所有ID映射仅限当前novel。普通world ID与规划世界线ID继续分属各自空间。

### source-only/逐kind关闭推断的具体兼容行为

严格新推断契约不能把“没有正文→直接拷贝已有角色等资料”变成永久失败或隐性强制AI。复制模式沿用0AI，可发布可用作品，完整原资料逐字存入导入材料，不能因原文不是JSON而拒绝复制。每个kind分别按用户是否允许该kind正文推断决定模式；关闭该kind补全时不得借其他kind正在分析就擅自推断它。

选定以下兼容方案供独审，不修改schema/新增UNKNOWN角色枚举，也不新增页面或确认向导：

1. **明确的原字段直接拷贝。** 原文显式roleType/别名/职业等采用可追溯本地字段映射；无法识别的文字不猜拆分，原text/bio逐字保留。已确认字段照其类型写入，未知可选列为空。
2. **缺roleType的原角色仍可复制。** 现有enum强制三选，此模式保留原有SUPPORTING存储兼容位，但不能称作推断结论。Character.extra记录`importMapping={version:1,mode:"source-copy",unconfirmed:["roleType"],artifactId}`，原角色name/bio不加说明、不改字。导入审计记录同一未确认映射；在**既有导入记录的材料名称视图**标“导入时角色类型未确认”，利用现有材料行/原文查看，不改组件布局或增加选择控件。概览仍明确“仅复制原资料，未执行正文推断”，inferred计数为0。边界必须如实说明：现有角色列表暂沿配角布局桶显示该存储值，它不是来源认定；用户可通过原CharacterPanel现有角色类型下拉核对/修改。历史“导入时未确认”标记保留为当时事实，不被普通字段保存假装抹成导入时已确认。这是纯复制的显式兼容例外，绝不用于新AI推断主角。
3. **世界/结构类型缺失不制造实体。** 已有明确World身份/归属/type/native content的原资料照拷。明确的六种文本型Setting直接保留为{text}；明确LEVEL_SYSTEM但只有整段介绍时，可在现有description保留全文，levels/pathways为空并标“结构节点未提取”，不虚构级数。CONCEPT/FACTION等无法无损放入正确native结构，或worldId/settingType根本未明确时，将完整原资料作为已复制材料发布，记录“导入时结构映射未确认”，不创建虚假World根、不存只有空数组的假成功Setting。用户从既有导入记录读/复制原文，在原World树选/建所属世界、原Setting创建/编辑器选择既有类型并整理；没有强制AI或永远卡住导入。
4. **状态与成功口径分开。** `publicationRecord`增加仅新版本存在的mappingWarnings（材料ID/字段/原因），读取时给现有材料名称加说明标签，分页原文仍原字节不变；不改原artifact/name或正文。复制完成只证明原资料已落盘和可读，未确认native映射不计推断成功或完整结构导入。真实“全12目标”run仍按严格派生/明确确认结果验收，不能用本兼容位抵消S01-PUB-C01–03。

该方案有明确边界：纯复制可保留未结构化材料，不承诺未知结构自动变成正确业务节点；但不会因为未知而丢原文、强开模型或让原复制流程永久失败。此边界必须出现在测试与最终范围说明，不能藏在私有JSON后声称全部native字段已正确。

## 4. 知识来源、时间范围与因果贯穿所有kind

固定提示对所有kind统一要求：区分亲见/角色陈述/传闻/推测/文学解释；区分早期习惯与后期例外；不能由“先被提到、后受刑”或阅读顺序推成因果；结尾未知不能补成确定经历。角色复合字段的各项事实必须在值中保留各自适用范围，不能用一个笼统标签把整个人物都认证为客观。

引用校验按实际类型分派：scene.parentId指scene，WORLD.parentId指WORLD，SETTING.worldId指WORLD、MAP.parentId指同世界MAP；worldline.parentId才指worldline。实体目录只增加这几项必要子类型/父ID，不塞整个设定文本。`origin=confirmed`不能再跳过新版本native字段/引用校验；用户确认不是允许坏外键或坏content的通行证。纯复制的未知映射例外仅适用上一节显式分支，不放宽已确认字段类型。

单一事件/叙事项使用已有规划四种reliability值：客观事实、角色有限事实、人物推测、可能不可靠；可带有证据的attribution与temporalScope。它们不替代原文quote。事件text及正常业务描述也应明确可读的“谁说/何时适用/是否证实”，不能只在snapshot或decisions存一条总注释。结构枚举/ID能机械验证，语义支持性仍由真实模型复核与独立原文验收证明，不写特定语句关键词判真函数。

世界线只把明确发生的言说建为“某角色说了某事”，不要把其中未证实内容变成无条件客观事件；若保留所述事件，fact必须注明转述来源/未知状态。叙事线分别保留披露者/视角、回忆/提及/发生关系；有时间信息用现有time.label/unknown/exact/window，不凭“前天”制造绝对日期。

发布必须显式传递telling.reliability及ref.reliability/character，不再吃掉它们后让tellingSchema默认“客观事实”。原refs.kind的发生/提及/回忆关系保留在原facts审计及正常可读source/intent中，不伪造schema没有的结构字段。非客观信息的native event.fact也保留限定，不能只改讲述层而仍引用错误客观事件。

## 5. 决定应用：先局部字段，不整段替换

当前resolveConflict的B/inferred把artifact.text、整组evidence/sourceUnitIds替换成候选，merge又把一段自由文字同时放进text和某个facts字段，可能丢失其他事实。改为：

1. 验证当前conflict/source指纹、artifact ID、field与已显示候选仍一致；不允许用旧UI决定覆盖新版本。
2. B/inferred只将已确认field设为candidate.value；merge只将该field设为用户明确提交且符合字段类型的合并值。若conflict.field明确为text，才改text；其他fields逐字保留。类型不合法先失败，不能先写一半。
3. evidence/sourceUnitIds保留旧集合，并按需加入已校验的冲突证据；不抹去与其他facts相关的原引用。原始source材料快照始终保留。
4. 记录决定与锁定的目标字段/值/原hash。A/source保留原值，解释不只是日志；有正文推断时进入下节关联修订。没有正文/关闭推断的pure-copy保持0AI，按第3节兼容规则保留原文与未确认映射，不以新增修订流程强制AI或永久阻止直接复制。
5. 决定后不立即发布。修订失败、解释仍矛盾或未完成均阻止完成。正文仍仅由独立、逐处批准的rewrite/apply-patches路径改变。

## 6. 通用、有界的关联设定修订

不建立新claim数据库。使用现有artifacts/证据/实体引用与一份小的私有journal工作项；AI请求复用`phase=analyze`，加可选`intent="reconcile"`及服务器生成的修订上下文，不增加用户模型或UI action。此模式不能当作普通“再抽一次”。

### 范围与输出

种子来自冲突两侧artifact ID、evidence单元、已有实体引用；沿角色/地点/物品/世界/事件/叙事的明确引用与共享证据扩展，不只搜一次名字或只改当前对象。**修订只针对有这些关联依据的产物，不无差别重做所有kind分析。** 关联范围仍有不明项时，先保留待处理并执行完整全书复核；复核给出新源证据/关联对象后才扩充定向工作项。不能证明完整性时不发布，不能凭一次局部解释直接完成，也不以“重新生成整本”代替定位。原始source文本不被模型改写；已确认的原设定和用户锁定字段不可被另一次模型无声推翻。

每个包只提交能装下的原始设定分片、真实证据、相关已确认解释和固定目标ID。返回使用专属`artifactEdits`差量契约：artifactId、baseHash、textEdits（精确before/start/end/after）、setFacts、明确的unsetFacts、reason与evidence。缺省字段表示“不改”，不表示删除；不接受整个artifact替换来省略其他facts。ID/kind/name保持，修改不允许跨当前目标/原文版本；文字差量只作用于artifact.text，绝不作用workingProse。

阶段合同明确分开：classify仍只分类；普通analyze仅artifacts/notFound；analyze+reconcile仅artifactEdits及真实未决conflicts；review仅conflicts及有证据missingTargets；patch仍只正文patches。非对应阶段的非空字段拒绝，07已批准的空数组无操作兼容保留。不得为了让reconcile能返回结果而全局允许模型在任意阶段改artifact或正文。

set/unset仅允许当前kind支持的字段；unset只能显式清除没有依据的派生字段，必须有理由/证据且不能删除作者锁定值。原source字段与未指定字段不动。引文仍known-unit/精确或既有唯一版式定位，所有新引用和native content再次验证。若需要改实体类型、删除材料、推翻已确认事实或无法形成有依据的修订，保留草稿并报告未解决/需该目标重新核对，不能擅自丢弃产物。

### 预算与原子性

完全复用18已冻结的执行预算/workingUnits几何，不提高预算，不重做已成功analysis批次。每个修订包唯一源chars≤B、units+artifacts及新增差量上下文序列化≤2B、实际完整payload≤3B；固定提示与JSON纠正开销继续在原预留内。新intent/决定/差量元数据必须进入实际payload计算。单任务装不下明确失败，不截断字段或解释。

一个artifact的全部分片提案在其baseHash不变时先暂存，完成全部必要分片后校验重叠/同字段冲突，按逆序应用textEdits并合并facts，一次checkpoint提交该artifact。任务键绑定semanticVersion、决定集hash、workingRevision、artifact baseHash及证据/分片hash。暂存提案与已成功任务耐久保存；失败、暂停、迟到epoch不得写半个artifact，恢复只补未成功项，不能软件重启就重新抽完整设定。

某产物改变后，引用它的下游产物也必须核对。ID稳定，类型/引用仍有效才可提交；所有相关修订完成后清空旧全文review/reviewFacts信用，按新产物指纹重新跑**全部所选正文/来源单元和全部设定字段**复核，不凭单次“解释通过”发布。作者决定集和结果hash进入新版本审计；没有pending修订才可进入publish。

新语义版本必须修改现有`addConflicts`的决定去重接点：完整复核再次返回的持续冲突，不能仅因同hash已在decisions或resolved冲突中就被丢弃。复核结果绑定当前artifact/result指纹、决定集hash和workingRevision；同一冲突修订后仍存在时，重开待处理或明确失败，保留历史决定，不能以历史决定当作新结果已一致的证明。重开/重启不能消音该状态，普通retry也不能重置两轮限制。

互斥事实仍走原冲突询问，不通过自动修订替用户选A/B。一次决定/正文版本允许最多两轮自动修订+完整复核；轮数耐久保存，仍有矛盾/遗漏则停在待处理/明确失败，不能无限重抽。新作者决定或明确批准正文版本是新输入，才生成新工作代号；普通retry不重置轮数。

## 7. 最低召回与复核结果

各kind提示补齐本次暴露的通用要求：人物姓名/绰号与已知身份的区别、角色间关系；伏笔需setup/payoff及其分散源证据；不把“全部unit已发送”或零conflict当作全部语义正确。

review在原conflicts之外可报告有证据的`missingTargets`（kind、真实unitIds/evidence、遗漏说明），只限用户已选补全目标。它不携带oracle或替代原文答案。控制器验证后仅对该证据支持的目标/范围创建有界补全工作项，完整原文/上下文仍可追溯；保留旧产物，不以缺省响应删除任何设定。新增产物走相同native/证据/合并校验；仅失效与新增/变更实体及证据有关的两线任务，其他已完成分析信用不动，全文review/reviewFacts仍必须完整重检。任务hash防重复计信用，仍受上述两轮上限。疑似遗漏但无法定位证据则保持待核对，不伪造notFound。

这不能机械证明穷尽所有人物/伏笔。固定oracle仍只用于独立验收；真实新run若仍缺事前最低对象，即使review返回空数组仍FAIL，不降低期望或用模拟补件通关。

适配器须独立执行各阶段的非空输出白名单：artifactEdits仅用于analyze且intent=reconcile，artifacts仅用于普通analyze，missingTargets仅用于review，patches仅用于patch；classify仍要求完整classifications。classify/普通analyze/reconcile/review/patch收到其他阶段的非空结果均拒绝且零credit。保留此前空数组兼容，不因新增合同重新引入S01已修复的空classifications问题；修订不得借普通analyze路径混入整对象替换。

## 8. 通用精确英文章界

生产识别只读取所选完整正文，扫描保留原UTF-16 start/end与换行的逻辑行；只在解析副本上去除标题装饰/边缘空白，源内容不trim、不换行归一化。手动cuts优先且沿原严格校验。

自动候选支持既有中文章回、独立行`Chapter 1`及`Chapter One`/组合英文数词（如Twenty-One），独立行Prologue/Epilogue。英文数词用通用数值解析，不列某书58个特例。标题须为整行标题格式，普通句子“in chapter one ...”不匹配。显示title可以去装饰，chapter.content继续包括原始标题/空白。

纯Roman仅接受规范大写罗马数值的独立标题行，且有空行/独立标题样式边界和从I开始的连续序列，至少两个编号；单独一个英文I不触发。重复、缺号、目录/正文形成两套候选、或与正文独立I无法消歧时不猜选一套：保留“未分章正文”并给现有来源核对/手动cuts路径明确诊断，不改正文。不得使用宽泛`/^I/`或把段内代词/引号内I当章节。

Prologue/编号/Epilogue共同组成一套序列；序号保证连续、章名可以短，内容很短的章节仍保留。只含空白的首部归入首章；首标题前存在真实叙述则保留为序言段并如实显示，不能为凑章数删掉。跨章空白保持明确归属，所有切片按序拼接必须严格等于输入，UTF-16边界不拆surrogate。

L02新run在排除作者说明/试读后的主小说应匹配冻结独立60 cuts；M02应I–XVI+Epilogue共17 cuts。这些数量仅是本次验收预期，不进入生产代码/模型指令。识别不成功时使用既有明确manual cuts并记录自动识别失败，不能把手动修正说成自动通过。

## 9. 兼容与并行改动串行整合

18预算helper/service与PDF main/shared/publish正在并行实施，本文不得与其同时编辑重叠文件。顺序固定：

1. 预算/PDF各自完成独立code review，主代理冻结组合基线/文件hash；取得主controller/shared/publish/payload的文件所有权后才实施本文。
2. 先完成本方案及用例的独立审核，再写最小失败测试，保留红证据；纯语义/章界helper可先于重叠入口接线。
3. 串行接入service/payload→controller→publish；保留18预算、原workingUnits恢复、PDF页决定/资源/发送/发布门控，不能整文件覆盖其他人的改动。
4. 新session加semanticVersion后，scope/importPlanHash/publicationRecord只在该字段存在时纳入新版语义项。无该字段的旧计划仍按原字段/原顺序/原值核对，不能补默认值使历史hash变化。版本不兼容的未发布草稿保留并明确阻断升级使用；不偷偷迁移或重新抽模型。已发布只读/幂等核对旧snapshot，不重新投影旧作品。
5. 仅执行下节明确测试与必要定向编译；独立code review后构建。编译不是语义通过，有限UI消费者验证也不是安装版通过。
6. 新run真实S01→独立语义/实表/重开复审，再继续其余正式原件；原失败run与证据保留。L02章界和模型大包按各自已审用例验证，不用PDF通过或预算成功抵消语义失败。

## 10. 限定TDD清单（待独立审核，不授权全suite）

测试输入只用隔离合成资料；真实源文、oracle、Key不进入仓库。下面名称为准确的唯一测试身份，允许内部表驱动子情形；不能只测一类就宣称九类通过。

| 精确测试名称 | 文件 | 必须断言的实际失败边界 |
| --- | --- | --- |
| `NI-SEM01: native character facts preserve supported profile fields and unknown values` | 新`tests/unit/novel-import-semantic.test.ts` | 新推断roleType/aliases/occupation/personality/appearance/clothing/关系真实键可投影；未知可选为空、新推断未知role不默认配角；旧traits类未支持键不静默丢失；“任职起始年龄”不当当前年龄 |
| `NI-SEM02: place and world-setting identities retain typed parents without merging unrelated entities` | 同上 | PLACE非事件类型；Scene父节点、WORLD/SETTING、worldId/MAP父级、循环/外部ID拒绝；不同父地点/世界同名不合并；不声称能用名称正则证明语义 |
| `NI-SEM03: all nine world setting contents survive the native editor content contract` | 同上 | 九类逐一严格结构→normalizeContent，真实首末内容不变空；LEVEL/CONCEPT/FACTION正确形状，六文本类型为{text}；错误键/类型不能靠补空通过 |
| `NI-SEM04: knowledge qualifiers survive every selected kind and native timeline reliability` | 同上 | 通用提示包含转述/时间范围/因果/未知要求；类型/归属/reliability与已知角色引用校验；不默认为客观；不把字符串quote匹配当语义判真；真实适配器逐一拒绝classify/普通analyze/reconcile/review/patch错阶段的非空artifactEdits/artifacts/patches/missingTargets，空数组兼容保留，拒绝时零credit |
| `NI-SEM05: artifact field edits preserve unrelated facts and immutable prose` | 同上 | sparse set/unset/text差量、baseHash/精确before、surrogate/重叠边界；未指定事实和旧证据保留；作者锁定值不可删/改；不写workingProse |
| `NI-SEM06: author decisions reconcile linked artifacts and both lines before full-book review` | 新`tests/unit/novel-import-semantic-session.test.ts` | 合成转述决定传播至有依据关联的角色/设定/世界事件/叙事，非仅decisions；不重做无关已成功分析；关联不明不发布、借完整review的新证据补关联；完成后全文与全部facts实际再次复核；修订后复核再次出现同hash已决定冲突仍阻断，不被历史去重消音 |
| `NI-SEM07: inferred and merge decisions apply only the chosen field before reconciliation` | 同上 | B/merge不以候选text/evidence覆盖整对象；无关字段/引用/原始source保留，非法typed值先拒绝，未修订不能publish |
| `NI-SEM08: bounded semantic repair checkpoints atomically and resumes without stale credit` | 同上 | B/2B/完整3B及固定提示实计、超限任务明确失败、部分提案不改artifact、在途暂停/失败/迟到epoch不记完成、正常重开只补未完成，决定改变/两轮未收敛阻断；持续同hash冲突跨重开/重启仍待处理或失败，普通retry不重置轮数 |
| `NI-SEM09: source-only and inference-disabled imports never invoke semantic inference` | 同上 | pure-copy/逐kind关闭补全均0越权AI；无roleType原角色可复制、存储兼容位有extra及现有材料名视图警示、不称推断；原文/分页不变，未知世界归属/结构材料可发布待映射而非永久失败；明确字段照拷 |
| `NI-SEM10: evidence-backed omission work adds missing selected targets without oracle input` | 同上 | 合成绰号/跨章伏笔遗漏由review源证据创建补全任务，首末正文可见；仅所选kind、真实ID/quote、去重、相应两线/复核失效；无证据/超范围/越轮次不加信用，不把测试期望发模型 |
| `NI-CH01: standalone English word-number chapters preserve prologue through epilogue` | 新`tests/unit/novel-import-chapters.test.ts` | 独立固定标题序列覆盖One–Fifty-Eight及Prologue/Epilogue，60原始cuts，极短章保留；另通用组合数词样本防硬编码；拼接逐字相等 |
| `NI-CH02: canonical Roman sequences preserve sixteen chapters and epilogue` | 同上 | 独立I–XVI及Epilogue为17节，CRLF与标题空白保留，显示章名不改变正文 |
| `NI-CH03: ambiguous prose and title sequences never create guessed chapter cuts` | 同上 | 段内/引号/单独孤立I、正文句子Chapter one、目录重复、缺号/错Roman拒绝猜测；前导空白/真实前言/emoji安全；manual cuts优先且原字节不变 |
| `NI-SEM-P01: native publication populates characters places worlds and nine editable setting types` | 新`tests/integration/novel-import-semantic-publish.test.ts` | 隔离真实PGlite/Prisma，角色正常列和两遍关系、地点/世界父树、九类Setting.worldId/type/content；正常读取→normalize→编辑后保存→重读不空；另核source-copy未确认映射及既有材料名视图可追溯、原文不变；不是只查snapshot |
| `NI-SEM-P02: publication preserves attributed events and qualified narrative references` | 同上 | 两线native fact/intent含转述/时间范围，telling/ref reliability/character显式正确；保留发生/提及/回忆语义，不靠默认客观掩盖；未知死亡/日期不变成确定事实 |
| `NI-SEM-P03: new semantic runs leave legacy publication receipts and hashes unchanged` | 同上 | 使用独立冻结的合成旧snapshot/hash与真实隔离回执，旧只读/幂等核对不迁移；新版新request/目录，重试同版本不重复，旧request不能被新版重投影；PDF/预算可选字段不被擦除 |
| `NI-SEM-B01: existing setting editors read and edit the nine native imported content shapes` | 新`tests/browser/novel-import-semantic-native.test.ts` | 仅既有真实SettingContentEditor/其内容契约的隔离fixture，九类实际显示源内容、改一项后onChange仍是对应native结构；不改产品UI，不用纯JSON存在性替代消费验证 |

另仅复跑直接保护本次修改边界的两个既有测试：`NI-D01: every source character and chapter boundary survives safe splitting`、`NI-A03: missing ids, unknown categories and fabricated evidence are rejected`。不加全仓/整个browser/packaging套件。若实现改变18/PDF接口，先修正并独审范围清单，不能自行跑其所有测试或拿其旧绿灯推断新组合通过。

拟执行命令由实施代理在先红后绿阶段使用Node24绝对路径，限定名称与文件：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM(?:0[1-9]|10):' tests/unit/novel-import-semantic.test.ts tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[123]:' tests/unit/novel-import-chapters.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM-P0[123]:' tests/integration/novel-import-semantic-publish.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-D01:' tests/unit/novel-import-domain.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A03:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM-B01:' tests/browser/novel-import-semantic-native.test.ts
```

NI-SEM-B01沿仓库现有Node/tsx browser fixture入口，使用上述唯一名称/文件；环境沿既有测试浏览器配置，不新开常驻HTTP服务或用HTML设计稿抵充真实React消费者。当前不运行这些命令。必要的定向TypeScript/桌面构建另记为编译，不冒充功能测试。

## 11. 新run真实验收与待审结论

独审/TDD/code review/组合构建完成后，以同固定原件和独立基线新建S01 run：正常角色字段与绰号性质/关系有据；地点与事件分开；社会/文化等规则进所属世界Setting，不要求无证据九类全非空；决定确实改变相关产物/两线并全书复核；早期还账与后期未清、传闻/因果/结尾不确定性以及伤痕铺垫最低召回达到事前预期。实际provider调用、修订/补全轮次、失败与用量逐次保留。只在正常发布后退出、隔离读本作品实表、重开原业务面板均有证据后判定本run；旧run仍FAIL。

L02/M02章界分别对独立冻结cuts和所选正文做逐段/拼接断言，章节数只能证明边界，不能代替全书正文、十二目标/两线和语义导入。后续其他样本继续逐书相同门槛，不把合成回归或一种格式通过扩写成六书验收。

**待另一代理明确审核：native契约与未知处理、差量修订/两轮界限、完整性任务与预算、旧回执兼容、章界消歧、测试名称/消费者验证入口及串行所有权。** 在审核通过前不编码、不调用真实模型/DB/UI、不请求用户许可；本文不是已通过结论。
