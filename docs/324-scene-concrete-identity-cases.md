# 场景具体身份最小用例（324）

2026-11-01。依据已独审通过的323冻结版 `f6aee4a01d8816757b5be723c24da94908eb45ee9e0491a894acd0192d239788`。本文件仅用例与分工接口，须由scene_fix_review独审后才编写测试/产品。下列矩阵是用例合同，不把实现中的定向执行记为App、API或真实作者验收；不实施320B、聚合或318。

## 固定夹具与证据口径

- **F1，两处具体地点**：全合成甲城东宅和乙城西宅各有字面“书房”；同一unit还可同时叙述两处，并含比较/回忆。每处有独立literal坐标、唯一上下文quote和真实context；另有同宅东/西两间同名房、同主人前后两处住所。不同关系由显式模型/作者依据给出，不让测试假称源码只从城市词便能理解全部空间语义。
- **F2，有据跨批连接**：三批源顺序固定，正常同一地点的不同称呼及same-place证据跨批出现；附第三组件的different-place约束和直接父级。模型返回顺序、alias顺序、同literal不同quote窗口可变化，原字面坐标不变。另有仅同词/同主人、没有连接依据的记录。
- **F3，归属完整性**：同一具体identity有201个不同合法body member，超过旧200门；含CRLF、非BMP、不同事实及首尾哨兵。ledger全部保留，实际请求按原预算分包；8选项与首包均不是全归属证明。
- **F4，来源只复制**：两个同标题source block、一个filename fallback名称不在正文的block、一个超过原text piece大小的完整block；均为合成临时文件/单位，copy原值、分片范围和hash独立可算。
- **F5，作者待确认与容量**：保留完整原记录的真实unresolved组，另有可正常导入的source-scoped未知；有有效短NameParts与超50字组合。规模夹具按实际稳定键生成有效唯一记录，容量反例不能先被重复键、坏引用或非法范围挡住。

fresh夹具必须显式 `wizard.sceneIdentityVersion=1`，通过原新建/初始化流程取得ledger；受控AI返回真正新wire并经service编译canonical。既有大量custom旧roster回归须明确选择：更新为新canonical，或以真正旧journal（无version且无ledger键）覆盖旧合同；不得让新scope缺sceneRosterRecords时产品fallback旧merge。旧回归通过不计为fresh具体身份验收。

预定模型响应只证明机械合同与接线，不证明供应商遵循提示或空间判断正确。来源/结果/输入不可变，错误反馈仅固定字段指导；原文、Key和真实配置不进入仓库。RED按实际节点/代数及未达断言记录，不要求原正控全部红。

## 最小独立矩阵

| ID / 层 | 固定输入与操作 | 必须观察的结果 | 证据范围 |
| --- | --- | --- | --- |
| CI01 service严格新合同 | F1新scene roster，预定首个旧name/aliases-only响应或坏控制键，第二个合法完整记录；持续坏另测。roster/links/ownership及sceneParents互斥，旧scene/character/item/world作合法旧scope对照。 | 真实runImportAi→generateImportAiJson→generateJSON最多两代；新wire唯一根；应用产公共roster与完整sceneRosterRecords同序对应，final canonical重验，不被第二次wire parse丢失。raw自填sidecar、ID/confirmed、unknown或undefined额外键拒绝；undefined-own-key须直接调用schema对象验证，不能经JSON.stringify抹键后冒认覆盖。旧scope不接受新sidecar，不因fresh旧reply走locatedRoster。固定新增纠错无值/ID/名称/hash/未知键回显。 | 新service单元文件；捕获原generateText依赖的实际prompt/结果/次数，首bad→好完整保留，持续坏无credit。不是实际HTTP。 |
| CI02 精确mention与稳定键 | F1同unit两次“书房”放进同一唯一长quote；合法对照分别选唯一短窗口；另含quote重叠多命中、未知unit、错字、跨unit拼接、坏Unicode/CRLF边界。F2相同literal坐标换quote窗口。 | quote在unit与literal在quote均唯一；坏项整包失败且无取首/归一/rebind/drop。独立源坐标公式算member key，窗口变化不换key；同unit两个位置仍是两个member。name/每alias须各有对应literal，组合显示名不能伪造literal。 | pure+service；精确坐标/独立hash预期，不只比较两次实现输出。合法项夹坏项证明全包检查。 |
| CI03 不再按名称/别名折叠 | F1分别覆盖同规范名、own-name作为alias的传递链、仅共享第三alias、同父两房及同主人两住所；均不给same-place边。再加入独立有据different-place。 | 各具体/来源限定身份不因这些旧信号自动union，且取证不被共享泛称污染。明确different关系阻止直接和传递union；不能仅靠不同id、不同显示名就通过。所有合法原提及和不同限定保留。 | pure ledger/candidates；对照旧merge/build原入口的独立预期，检查身份数、成员partition、原来源hash，不调用模型。 |
| CI04 有界跨批归一与wave一致性 | F2按相反网络顺序追加、重放已完成同批；生成links包，预定same/different/unknown和parent/not-parent结果；缺任务、重复/越界、自配对、错误result分支及冲突边作负例。另走原sceneParents有据循环修复，含parent省略正控。 | 同地点有据归一而非每批永久一项；组件完整依据随包，不只有代表名。每task恰一次，unknown不造边/不自动重试。相同冻结wave allSettled后稳定顺序一次组合，矛盾不可按到达先后任选；全部成员/依据仍保留且不能继续生成已知混合PLACE。旧hash/revision/epoch结果拒绝。循环修复使用全部原目标/完整图/证据门和owned取材；关系以model basis入账，保留旧关系历史；省略parent为unknown且原证据进入parent task结果，不伪造作者决定。成功从新ledger重建candidate、失效ownership，非循环元数据完整；坏图/证据/save全回滚，不能只改candidate。 | pure plan/apply及main受控并发；记录稳定task keys、完整request材料、commit次数，不声称模型语义正确。 |
| CI05 检索集合/预算/容量 | F2一个新record匹配多个既有组件；另有无共同线索的隐含回指。用有效规模边界触发32records/64tasks分包；逐项覆盖records/members各50000、identities5000、linkTasks20000、relations+decisions20000、ownershipReviewed50000及context/mention/关系依据总引用50000的边界与超一。原字节预算不足于最小包时作负例。 | 共同context/literal仅用于检索，不能取首相容者或同城/同主人就并；全部待核目标保留。包按原完整payload fits，不截前64或压缩成员。任务结果/basis未变不重复付费；无依据者source-scoped独立。超限准确失败保留旧ledger/待核计划，模型调用0，不提高限额。含ledger的journal仍默认1GiB；用原encodeImportJournal的maxBytes参数及真实UTF8长度N/N-1测准确边界，不分配1GiB、不新增产品容量覆盖口。 | pure+main预算夹具；实际role pin、真实serializer/原预算负例，不以总量常量替代完整材料检查。 |
| CI06 未知/待确认/显示名 | F5正常来源限定但parent未知；另有明确互斥归属的unresolved组；组合标签未逐字出现在正文，超过50字对照有据短NameParts。 | source-scoped默认全选可正常导入，不因未知父级报错；真正混聚组有可操作阻塞，不能取消选择、来源编号或单边默认值掩盖。literal门不放宽；显示名由可信parts组成，过原50字门，不slice/丢关键限定；改label不改既有member/身份key。 | pure+实际Wizard UI单测；区分计数/state及正常按钮，无隐藏调试action。 |
| CI07 正常作者action原子性 | F5在detect-scene waiting经真实UI分配/拆分/label/parent/defer；完整partition正控及漏/重/片外member、sourceBlock拆分、未知parts/父级、空解释、旧revision/hash、running/生成后直接操作负例。注入save或来源/授权失败，另测noop。 | 仅strict正常action；sourceBlock整块原子、BodyMember按literal位置分配；成员完整互斥、无自动复制混合facts。有效更改一次保存后才替换owner，revision/identityRevision/epoch各+1；失败全回滚且不广播半结果；noop不增版本/决定。scene及后置任务/图像grant/credit失效，正文/卷章/来源/角色及早期credit保持。defer保留选中成员且不推进完成。 | main+真实组件；比较前后完整clone/hash与调用顺序。模拟作者仅对合成有据夹具，不冒认真实小说批准。 |
| CI08 有界详情与原文 | F5含working-0及F4 sourceBlock，50成员分页及32768文字边界；body邻接±1、sourceBlock仅0；错/过期句柄、hash、越界、任意路径键作负例。 | view只摘要不含ledger/全文。正常详情可看到全部成员/限定并分页读真实原值，正确定位mention；不假装working-0为原files。只读无模型/写入；安全字符边界、总字数限制及旧hash拒绝；同unit.id但start/text已切片时仍由绝对位置映射到正确原文，不用原offset索引slice；无权限外来源泄漏。 | action/schema+main/UI；收集返回字节/页数/源hash；无需启动真实App。 |
| CI09 取证/上下文/后续判等 | F1同unit两地点与比较对象；F3有201归属。新scene entity只取本identity owned范围及明确标注context；注入本包可逐字定位但属于另一identity/context的证据。组合名不在原文的场景参与context及typed引用。另用同id但不同start/text的合法slice与伪slice。 | 不走cited OR泛词全文扫描扩张，不回到200截断。8选项只来自当前归属，直接quote也过归属门，坏项不能靠取首/改绑通过。request range/hash按可信sources核原值后映射到当前slice局部坐标/实际hash；片外范围不得入包或credit，伪slice拒绝。context允许共同unit但不当目标事实凭证；新registry不同id同名同parent不合并，同id仍正常更新；无registry旧行为保持。原完整资料/四长字段及native门照跑。 | pure+service+main；实际请求单位/owned与context区分、完整引用closure和merge输出，不能只测index构造器。 |
| CI10 ownership闭环会补齐 | F3完成旧coverage.review/reviewFacts但缺最后member credit；再使合法资料/identity版本变化，清旧ownership且保持可重建当前owner/state。 | 原planner重新派发缺credit的真实member单位及身份资料投影，不能只在最终门报错永不补。每包通过最终授权/epoch后才credit；失败/取消/旧artifactHash/仅检索命中不计。最后member未完成，即使旧两类coverage全done也不发布；补齐后预期key集合精确相等。未生成artifact或选中unresolved不能因expectedKeys空而过门。 | 原main review路径+pure keys；受控ai/commit，实际重派unit集合与持久化credit，不读取/改真实会话。 |
| CI11 新地点遗漏先注册 | 合成review提出同名但不同具体地点的新scene遗漏；当前registry没有该id，另有当前同名同父级实体。 | 未注册模型artifact不能直接进入merge/native资料。先有据新roster→ledger；若有歧义，经正常返回detect确认门，再唯一entity任务。新identity默认按原选择规则处理且原注册地点不折叠；不得沿旧wizard“新实体不在清单便drop”宣称完成，不隐藏action、不借旧id改身份。原来源授权/epoch/ledger重建及后续完整复核仍成立。 | main纵向合成流程+service拒绝正控；记录正常action/阶段/registry/task IDs和零silent skip/drop。 |
| CI12 source copy与完整block | F4纯来源无模型模式，及原流程确需AI复核的分片模式；另插任意格式unit ID和同标题不同block的合法unit。 | 同标题块独立、fallback名称非正文也合法可信；模型不能伪造SourceMember。memberships由sources的真实artifact/block→unit/range映射产生，不从ID格式/标题猜；另一同标题block及无关unit均不误归属。同id sliced unit须核绝对start/原值后反投原block；未进slice范围无credit。全text/facts/evidence原值保留，无新模型调用。AI模式大block按原有效分片/投影coverage范围并集无缺口才credit；缺口/错block/不一致重叠/失效key拒绝。无模型copy只计等值来源归属证明，不冒认AI审过。 | pure+main source copy；完整block hash及独立区间并集，越界/字符反例不能先被无关门挡住。 |
| CI13 恢复/旧合同/最终门 | 真正无version旧journal、fresh新journal、保存后恢复与源/workingRevision变更；合法新资料在最终授权、native/知识/父级循环、发布失败控制下运行。fresh混合targets同时含scene和其它类别作纵向正控，纯非scene为黄金对照。 | 旧session恢复不补version；fresh缺/坏ledger不降级旧协议。mixed review合法附scene ownership并完成其全部credit，其它target合同/资料不变；保留原mixed review wire，UR/SV/index/lane的exact-scene范围不扩大，纯非scene请求无新增field且黄金不变。新版本缓存/任务/key只在绑定材料版本有效；所有原门保持。正常mock发布/恢复须全归属与全部review/facts及原值；不把mock当真实保存重开或7分钟通过。 | 状态/schema+main及既有阶段A/RA/UR/SV/SO/LF/预算相关回归，禁止全仓测试替代定向证据。 |

实施测试文件建议按边界分为pure identity、service/AI payload、main session、真实Wizard UI四组；每组只选对应行的必要断言，复用原长字段/预算/授权负例，不复制整套矩阵。所有预定错误必须实际到达目标门，记录RED后置未达范围。容量/完整性或内容分歧仍未满足时如实未完成，不提高heap、context、cap、重试、并发或7分钟门。

CI04/12来源材料补充（独审P2，实施前须复核此增量）：links row的app-only `sourceBlocks?:{memberKey,ranges:SourceRange[]}[]`须为每个SourceMember恰一项；body-only可省略或[]。正控用同标题不同block、显式多个当前unit局部ranges，按原block顺序恢复完整值/hash，metadata完整进入原预算。缺mapping/漏member/未知或重复memberKey、错误unitHash/越界/Unicode或CRLF边界、显式ranges不完整或顺序错、同unit/同file绝对位置交叠均0gen固定拒绝；其中重复文本block须专测重复/部分重叠range不能凑出恰好相同blockHash。同id多slice不能Map覆盖另一block，不能从名称或ID猜。非unknown及unknown空证据均不能绕过该请求门；原模型响应wire、两代、role及预算不变，输入完整clone保持不变。

CI12/13内部Sources版本补充：同id不同block的owned slices之间有真实gap时，上游提供同一已授权来源的真实完整unit作support；`sourceBlocks[].units`先完整owned前缀（包含纯空白），后为相应slice同id/file的非重复真实superset supports。正控同时覆盖连续slice和有gap+真实support，核显式sourceBlocks原序全值、非unknown源quote→apply wave→assert ledger→再membership；owned/copy evidence不能含support片外范围。缺原值、伪superset、错file、重叠或不完整owned前缀不猜补、不Map丢片，按原门准确拒绝；不新增模型wire。独立canonical哈希预期明确包含workingRevision：仅增工作版本而正文偶然相同，重建后再append相同记录，旧partition/label/parent只能留审计，不能重新生效；同scope/版本正常revise仍保留有效决定。调用方按不可变snapshot使用Sources，显式assert必须重验，不能靠原地改值复用缓存冒认新版本。

CI04/05最终接线澄清：纯共同字面而无额外定位不产生付费核对，保守source-scoped；异名但共同完整context同样进入全部待核集合，不能AND要求同词。作者拆分后，packet row仅投影本part成员及其字面别名，原完整raw record留ledger；已由作者指定的context才作为跨part定位依据。knownRelations请求仅带本包闭合端点/完整证据，外部父级及不同约束仍由完整ledger组合提交硬验。正控须经真实runImportAi接受该投影，不能只测自造fits=true而掩盖服务0gen拒绝；不把请求投影写回覆盖原record。sceneIdentityMaterialUnits仅用可信原值合成必要hull，连续owned并集可证明同identity、同unitHash的直接引文，context/gap或不同identity不能混入。

## 共用pure API与分工（待本用例独审后冻结实施）

共享类型以323为准。`SceneIdentityDecision`特指links每项`{taskIndex,result,evidence}`，与ledger作者审计`IdentityDecision`不同。`SceneIdentityRequestContext`为三mode严格union；`SceneIdentityMembership={identityId,memberKeys,ownedRanges,contextRanges}`。基础结构放renderer安全的新shared模块，semantics request仅import/re-export并接字段，避免双方重造协议。

- **作者/shared/core/state**：新`shared/novel-import-scene-identity.ts`、新`core/novel-import-scene-identity.ts`、wizard-state/候选类型及原core roster/merge/semantics必要接线。
- **主代理/main/UI**：新版本初始化、原actions/排程/权限/原子提交、正常Wizard详情、source范围读取、ownership重新排程与最终门；共享action外层必须补id/revision。
- **service/AI payload**：strict mode请求、wire→canonical及sidecar对应、原两代纠错、唯一锚点/归属校验、预算与stage隔离。不得再实现另一套ledger/union/index。

shared导出323全部类型及 `sceneMentionRecordSchema`、`sceneRosterRecordsSchema`、`sceneIdentityDecisionsSchema`、`sceneIdentityLedgerSchema`、`sceneIdentityChangeSchema`。`SceneIdentityChange`只含四op业务字段和expectedLedgerHash/explanation，不含session id/revision，也不反向依赖ImportAction。

```ts
type SceneIdentitySourceBlock = { artifactId:string; blockIndex:number; sourceName:string;
  nameOrigin:'heading'|'artifact'|'filename'; text:string; units:readonly ImportUnit[] }
type SceneIdentitySources = { workingRevision:number; workingUnits:readonly ImportUnit[];
  sourceBlocks:readonly SceneIdentitySourceBlock[] }
type SceneIdentityLinksContext = Extract<SceneIdentityRequestContext,{mode:'links'}>
type SceneIdentityLinkPacket = { context:SceneIdentityLinksContext; units:ImportUnit[] }

validateSceneRosterRecords(records:readonly SceneMentionRecord[], units:readonly ImportUnit[]):void
sceneSourceBlockOwnedUnits(block:SceneIdentitySourceBlock):ImportUnit[]
sceneIdentityMaterialUnits(units:readonly ImportUnit[], sources:SceneIdentitySources):ImportUnit[]
createSceneIdentityLedger(sources:SceneIdentitySources, previous?:SceneIdentityLedger):SceneIdentityLedger
assertSceneIdentityLedger(ledger:SceneIdentityLedger, sources?:SceneIdentitySources):void
appendSceneRosterBatch(ledger:SceneIdentityLedger, records:readonly SceneMentionRecord[],
  units:readonly ImportUnit[], sources:SceneIdentitySources):SceneIdentityLedger
planSceneIdentityLinkWave(ledger:SceneIdentityLedger, sources:SceneIdentitySources,
  fits:(packet:SceneIdentityLinkPacket)=>boolean, maxPackets:number):
  {ledger:SceneIdentityLedger;packets:SceneIdentityLinkPacket[];pendingTaskCount:number}
applySceneIdentityLinkWave(ledger:SceneIdentityLedger,
  outcomes:readonly {packet:SceneIdentityLinkPacket;decisions:readonly SceneIdentityDecision[]}[],
  sources:SceneIdentitySources):SceneIdentityLedger
applySceneIdentityParentRepair(ledger:SceneIdentityLedger,
  binding:{ledgerHash:string;identityRevision:number;targetIds:readonly string[];units:readonly ImportUnit[]},
  proposals:readonly {id:string;parentId?:string;evidence:Anchor}[],
  sources:SceneIdentitySources):SceneIdentityLedger
applySceneIdentityChange(ledger:SceneIdentityLedger, change:SceneIdentityChange,
  sources:SceneIdentitySources):SceneIdentityLedger
buildSceneWizardCandidates(ledger:SceneIdentityLedger, previous?:readonly WizardCandidate[]):WizardCandidate[]
sceneIdentityRegistry(ledger:SceneIdentityLedger):ReadonlyMap<string,string>
sceneIdentityMemberships(ledger:SceneIdentityLedger, units:readonly ImportUnit[],
  sources:SceneIdentitySources):SceneIdentityMembership[]
expectedSceneOwnershipKeys(ledger:SceneIdentityLedger, artifacts:readonly ImportArtifact[],
  selectedIds:ReadonlySet<string>):string[]
sceneOwnershipReviewKeys(ledger:SceneIdentityLedger, sources:SceneIdentitySources,
  artifacts:readonly ImportArtifact[], request:ImportAiRequest):string[]
```

所有返回ledger的API纯复制、不改输入；validate/assert只throw固定静态reason的SceneIdentityError，不echo材料。无sources的assert用于journal结构/hash/引用门，有sources再核真实范围/版本。append自行计算稳定batch/record键。plan的maxPackets为1..15、每包32records/64tasks，fits必须由main以原**完整请求**预算闭包提供；plan不能伪造已核关系，apply只在同冻结hash上组合一次，失败任务保持pending。

`sceneSourceBlockOwnedUnits`只返回并校验完整owned前缀，后部真实supports不是owned。只有links构包为合并同id slices而使用完整原值supports；sceneOwnedUnits/sourceCopy/ownership与证据选项均复用前缀helper。`createSceneIdentityLedger`可选previous仅用于同scope恢复有效状态或新scope保留旧作者审计，旧决定不迁入新member命名空间。

`applySceneIdentityParentRepair`复用原sceneParents wire与完整循环修复门，只以model basis原子入账，不伪造作者审计；main在原授权/epoch/保存门后从新ledger重建candidate。`sceneIdentityMemberships`必须接可信sources，以真实block/unit对应及绝对start核原值，再将原完整unit绑定范围/hash映射为当前request slice的局部范围/实际hash；服务只重验当前包，main反投原member/block算credit。不从名称或unit ID格式推断归属。

`expectedSceneOwnershipKeys`给最终323哈希coverage key，不能以缺artifact/未确认返回空集合假装完成；`sceneOwnershipReviewKeys`只给该真实request可证明的同类哈希key，不自行credit。main必须在原最终接受/epoch门后保存。SourceBlock完整并集与source-only等值copy证明按323由main使用原planner/coverage重建，不能把单片或模型布尔值当完整proof。

core旧路径不改默认：新main显式调用`buildSceneWizardCandidates`；只给`importSemanticIdentity(a,mode?,sceneRegistry?)`、`mergeImportArtifacts(original,incoming,semanticVersion?,locks?,sceneRegistry?)`末尾增加可选registry。有registry的scene须注册并按id判等，无registry保持原行为。详情/view的严格action与状态字段直接按323，由main/UI owner实现；不再平行造一套通用session mutation API。
