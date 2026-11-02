# 场景具体身份与证据归属方案（323）

2026-11-01。状态：待独立方案审核；仅方案，未编写用例、修改产品、执行作者决定或启动模型/应用。用户已明确选择按小说中的具体地点区分同名、泛称场景，不将各处房间、书房、厨房、教堂等汇成一种泛型素材。本方案不实施320B、318/319，也不以既有R27产物替代新版本的真实验收。

## 1. 已证入口和边界

本会话未暴露CodeGraph工具，以下依据已定位文件的当前源码。R27首wave不可变快照的内容审核发现不同住宅空间、不同城市同称地点、比较对象与叙述所在地混入同一资料等情况；私有建议尚未执行，不能把每一项复核分歧都归因于身份合并，也不能声称历史每次模型响应已重放复现。原小说、场景名称、引文和Key不写入本文或公共日志。

| 当前入口 | 源码事实 | 与本需求的关系 |
| --- | --- | --- |
| `desktop/core/novel-import-wizard.ts`：`mergeWizardRoster` | 所有类别共用。规范化own-name相同必分入一组；某主名作为另一主名的alias且投票达门槛后，union-find可传递合并。仅共享第三个alias并不必然触发union。组内`parent`取首个已有值。 | 不能把角色称号的合并策略当作具体地点身份规则。同名合并发生在真实父级/地点核验之前。 |
| `desktop/core/novel-import-wizard-roster.ts`：`buildWizardCandidates` | 用合并后的name/alias集合反查source blocks和stash；`evidenceUnitIds`按任一名称/别名匹配收集后截取200个；scene父级按name/alias的`Map`查找，同键后值覆盖，未知或自身被删成无父级。 | 即使没有union，共享泛称仍能污染候选来源；已有明确但歧义的父级会被任取或消失。 |
| `desktop/core/novel-import-ai-payload.ts`：`sceneRosterPrompt`；`desktop/service/novel-import-ai.ts`：scene roster schema、`locatedRoster` | 当前主要合同只有原文name/aliases/可选parent；提示不要求引文。`locatedRoster`优先使用可定位的模型证据，失败则找首个包含任一name/alias的unit；找不到条目被丢弃。 | 现合同不能表达“相同字面称呼、不同具体地点”；首个字面命中不证明身份及空间关系。 |
| `desktop/main/novel-import.ts`：`runRoster` | checkpoint仅保留定位后的unitId、名称等，未保留原quote及身份关系证明。stash按原文顺序而非网络返回顺序排序。 | 后续无法从现stash还原哪些具体称呼/限定依据构成了同一地点。原确定性顺序应保留。 |
| 同文件：`importEntity`、`characterEvidenceOptions` | scene也使用`cited.has(unit.id) OR 任一name/alias在全文unit中出现`选hits；频次排序后取首个预算批。scene复用角色证据选项生成器，按命中的名称截取附近文本，最多8项。 | 泛词能把无关地点单元送给同一目标；改显示名而保留原泛称aliases仍会继续混入。证据选项的真实逐字定位不等于目标身份正确。 |
| 同文件：`contextArtifacts`；`desktop/core/novel-import-semantics.ts`：`importSemanticIdentity`；`desktop/core/novel-import.ts`：`sameEntity` | 正文复核上下文主要按artifact.name字面命中选择；后续scene合并身份为name、PLACE和parentId。 | 合成的限定显示名可能不在原文连续出现而漏入复核；仅新增不同ID、仍用同名同父级合并，也可能在后续再次折叠。 |
| `src/components/desktop/NovelImportWizard.tsx`及现action合同 | 场景清单有选择/详情；合并按钮仅对角色开放，没有场景mention归属、拆分或父级歧义确认界面。 | 不得声称未知身份已能由现界面正常解决；最小场景详情确认交互须显式纳入范围。 |

当前所谓名称/来源索引实际由上述规范名集合、`evidenceUnitIds`、逐unit子串扫描和目录筛选组成，并非已存在一个能证明具体地点归属的索引。不能仅给现集合改名或给model加“不要混淆”提示就声称修复。

## 2. 最小可实施的纵向范围

仅新鲜向导会话的scene识别、scene候选确认、scene资料取证及相应复核目录接入有版本的具体身份合同。准确位置为`ImportSession.wizard.sceneIdentityVersion?:1`及`wizard.sceneIdentity?:SceneIdentityLedger`。更新后创建新wizard的`emptyWizardState`写version=1；ledger在首次进入detect-scene、工作正文及来源范围冻结后初始化，此前允许不存在。恢复旧会话缺version则保持旧合同，不补写；有version但detect-scene已完成而ledger缺失/不匹配则保留草稿并拒绝继续，不降级旧name协议。模型无权开启或关闭。普通旧会话/无版本请求、角色、物品、世界观及其它target沿原协议。禁止把当前私有草稿按新含义原地解释；旧运行的来源和结果身份保持原记录，真正验收需新会话。

最小完整修复包含四件相连的事：保留场景原文提及与限定依据；有据形成具体地点身份；按已确认归属选择资料/证据；把同一身份带到后续目录、复核和合并。只改alias合并、只拼显示名、只替换prompt均不足，不能先宣称这些局部补丁已经满足“具体地点”。不增加世界观式层级ontology，不修改小说正文，不用地名/泛词黑名单推断身份。

## 3. 小型scene原生识别合同

复用原roster阶段、完整输入units、原模型和现有单请求纠错次数，scene专用结果增加最少的有据关系；不向角色共享schema扩散。语义及下述wire字段/限额在本方案冻结：

1. **原文称呼**：literal name、literal aliases。每种写法保留其原文锚点；name/alias的字面来源门继续成立，不能把应用拼出的显示名塞回此字段。别名只是同一候选的检索称呼，不自动成为全书identity边。
2. **具体限定依据**：可为原文明确的城市、地址、建筑、某处住所或更细空间的有限`label + evidence`列表。label须真实出现于它自己的声明unit/连续quote，quote同时用于判断该限定与目标的关系；仅在同一unit里同时出现两个词不构成空间关系证明。模型不能给无来源的“甲城某人之家”等自由identityKey。人物限定只是有据称呼，不要求改变角色导入或创建未选角色外键。
3. **提及及关系**：目标mention的精确锚点；本批同一地点、不同地点、直接父级的显式关系可引用应用提供的本批记录索引，必须附关系依据。模型不能自造候选ID、控制元数据、任意全局父级或声称某边已由应用验证。跨批已有候选若提供，只能显式引用当前冻结目录项，并有本批或明确相连来源支持；不凭alias串或名称相等补边。

先行数据合同冻结如下，限定scene新版本，不把它加入其它类别的公共roster条目：

```ts
type Anchor = { unitId: string; quote: string }
type Mention = { literal: string; evidence: Anchor }
type SceneMentionRecord = {
  name: string
  aliases: string[]
  mentions: Mention[]
  context: { label: string; evidence: Anchor[] }[]
  links: { targetIndex: number; relation: 'same-place' | 'different-place' | 'parent'; evidence: Anchor[] }[]
}
// 识别响应根仍唯一roster；name相同的多行合法，不能在parse时去重。
type SceneRosterReply = { roster: SceneMentionRecord[] }
```

所有对象strict自身键，显式undefined额外键也失败。name/aliases沿原1–300字符/最多20个alias合同，须各有对应literal完全相等的mention；mentions非空。literal是原文的本次具体称呼，不是自由描述，须在evidence.quote中**恰好出现一次**，quote本身又须在所指unit.text中**恰好出现一次**（计重叠匹配），均不做NFKC、trim、模糊或排版恢复。literal/quote必须完整Unicode，所派生起止通过原安全边界门。可信位置为`mentionStart=quoteStart+literalStartInQuote`、`mentionEnd=mentionStart+literal.length`；同unit两个同词位于同一唯一长quote仍拒绝，不能取首词。quote选取窗口不同但指向相同literal坐标时才是同一提及。context.label逐字出现于其evidence；context和links允许空数组表示未知。不能用空quote或空label造默认值。targetIndex为本包roster显式0-based安全整数，不能跨包/越界/自指；parent表示该行的直接父级是targetIndex行，same/different为无向关系。目标kind由应用固定scene，模型不提供ID、schema、origin、selected、已确认状态等控制键。所有合法提及、关系、别名依据保留；新增记录总量、数组及字节上限按4.1计，超限整包失败，不截前N项后接受。quote唯一、同unit共现及索引合法均不证明关系语义。

服务canonical的准确结果为`ImportSemanticResult`新增`sceneRosterRecords?:SceneMentionRecord[]`。新mode=roster的生成wire schema先严格解析模型唯一根`{roster:SceneMentionRecord[]}`，核验全部mentions/context/links，再由应用编译为`{roster:ImportRosterEntry[],sceneRosterRecords:SceneMentionRecord[]}`：roster与sceneRosterRecords逐项同序、同name/aliases，公共evidence取该行按真实源顺序的首mention.evidence；场景父级保留在完整links中，不填旧parent名字。sidecar保留全部原合法mentions/context/links，不删改raw坏项、不从名字反查补齐。模型wire自填sceneRosterRecords或canonical控制键必须失败，不能借此伪造应用结果。

`generateImportAiJson`该新分支的wire schema负责上述唯一编译；`runImportAi`末端改用该mode专用**canonical schema**严格接收这两个根键、完整重验双唯一锚点/引用及两数组对应，不能拿wire schema第二次parse canonical而拒绝额外键或丢掉mentions。`main.runRoster`只在version1/mode=roster同时读取`result.roster`和`result.sceneRosterRecords`，核对对应及当前源版本后将完整记录写账本，不能仍只stash旧roster。stage白名单仅在该mode允许这两个键。mode=links的wire/canonical结果根均只有`sceneIdentityDecisions`；其它mode/旧scene/其它kind不接受新sidecar结果键，原schema不变。所有末端权限/模型/snapshot/取消/原生门仍完整执行。父级不再同时接受旧name字符串分支，避免坏raw名称被索引回退修正。

请求接线准确为`ImportSemanticRequestFields.sceneIdentity`新增严格判别union：识别时`{version:1,mode:'roster'}`；核对时`{version:1,mode:'links',ledgerHash,identityRevision,records,tasks}`；entity/review传`{version:1,mode:'ownership',ledgerHash,identityRevision,memberships}`。前两者同时要求semanticVersion=1、phase=analyze、intent=roster、kind=scene，不新增通用intent值；与sceneParentTargets互斥。ownership用于该ledger构建的scene entity，或review且selectedTargets包含scene；混合target复核只附scene归属，保留原mixed review wire，不能扩大UR/SV的exact-scene引用编码scope。没有scene的请求不新增该field，原黄金行为不变；不能据此放宽原intent/phase。控制器生成并冻结该字段，服务完整保留传输副本及预算；模型响应不能回填它。初始识别根只接受roster；mode=links根只接受sceneIdentityDecisions，须在schema及main stage门同时隔离；原sceneParents分支仍独立。

跨批有据核对请求的records每项严格为`{recordIndex,key,members:(BodyMember|SourceMember)[],records:StoredRecord[],knownRelations:StoredRelation[],sourceBlocks?:{memberKey:string,ranges:SourceRange[]}[]}`（类型见4.1），是完整ledger记录/已确认组件的当前完整定位依据副本；其引用的ranges须有本包真实units覆盖。SourceMember存在时sourceBlocks必填、每member恰一项，无未知或重复memberKey；非source行可省略或[]。ranges由应用按可信sourceBlock原序给出，绑定当前request单位局部UTF-16范围及text hash；服务逐range核原值，按显式顺序恢复完整字符串并检验其hash恰等于该member.blockHash。缺/错/不完整映射、重复range、同unit或同file绝对位置交叠均在请求门0gen拒绝，不能重复同一真实片段拼出一个较长block，也不凭ID格式/标题/任意concat猜归属。同id多slice须合成可核实的完整真实unit/range映射，不能用Map(id)覆盖一块；最小材料装不下仍明确预算失败，不裁原文。该元数据是app-only来源证明，模型输出wire不新增字段；完整序列化预算原样计入。

显式recordIndex从0连续，最多32条；tasks每项严格`{taskIndex,type:'identity'|'parent',leftIndex,rightIndex}`，最多64项，taskIndex从0连续，不许自配对或重复相同type/方向任务。模型唯一根为`sceneIdentityDecisions`，每项严格`{taskIndex,result,evidence}`。identity任务只接受same-place/different-place/unknown，parent任务只接受parent/not-parent/unknown；parent方向固定为左记录的直接父级是右记录，not-parent不能推断其它父级。所有taskIndex恰好一次，无缺漏/重复/新增；非unknown须有真实关系依据，unknown可空证据，不被编译成边。records/task索引只在本包有效；初始roster的targetIndex只指本回复roster，不能跨批使用。全局核对任务最多20000；材料装不下按原真实预算分包，不裁units、成员依据或关系依据。

这里的records是当前组件的已确认归属投影，原完整raw记录始终保留在ledger：作者拆分后仅投影本组件memberKeys及对应字面称呼；同一原record其它part的成员/别名不冒作当前身份，跨part原context仅在作者为当前part明确选择时作定位依据。knownRelations请求仅投影本包闭合的端点及其完整有据范围；外部父级/不同约束不删除，仍由main完整ledger在组合提交时硬校验。请求中的来源关系所需真实unit按稳定range加入context，不做display/alias全文匹配。这样服务端闭合引用门可验证本包，而不会把历史原记录的片外成员误判为当前组件，或为了过门修改全图。

### 3.1 有界跨批核对的任务产生

初始roster本身不能表达未给目录的跨批目标，不承诺从不存在的wire键取得外部边。完成原文顺序去重后，literal name/alias的共同规范写法仅作本地检索线索；**付费核对还须有共同完整context.label定位依据，且不能只是该组件name/alias自身的重复值**。异名但具有共同具体context的全部相容组件同样纳入，不额外AND同词；没有context的纯共同字面（包括现记录无法据此证明具体定位的专名）保守source-scoped，不声称已跨章核成同一地点。NFKC仅用于检索，不用于证明身份。已知different-place、互斥作者分配及明确不相容的定位/父级约束先阻止union；全部真正相容的context目标进入有序待核集合，不取首个代表即宣称匹配。没有共同定位线索的隐含回指不猜，作者可读原文后显式归并。

处理顺序固定为最早源提及；对新记录与每个待核组件分别生成identity任务，组件以稳定代表键引用，但发送该组件**全部与本次定位相关且尚有效的成员/限定/不同约束依据**，不能只给代表的一段证据。共同具体locator优先于只共泛称，优先级只影响顺序，不删除其它待核目标。只有模型显式same-place加真实关系依据、且全组件约束通过才合并；同城/同主人/同建筑、单纯同词仍应different或unknown。已合并的跨批重复地点下一次只比较一个组件，避免每个chunk都形成正式候选；不能因组件扩大而丢掉其定位冲突。

每轮按32 records/64 tasks及完整实际预算分包；同一稳定record/component关系、证据/组件版本未变不重复发已完成任务。任务键为`hash(version,sourceScopeHash,type,左右稳定键,左右依据hash)`，identity两侧排序，parent保持方向。每次结果原子更新组件后重新去重剩余集合；未知不编译边、不重复重试，在无互斥混合时可来源限定独立。所有待核目标均保留：若集合/全部成员依据超过原全局20000任务或任一最小合法包预算，保留完整计划并报容量门/交正常作者确认，不能截前64、从多个相容者任选一个、按同词投票或为容量猜并。不做全书所有记录的无条件笛卡尔积；逐线索集合过大也不伪装成已核对。此算法允许已知具体地点的跨批归一，同时把无法证明的连接留未知；是否在全书容量/时限内必须实测。

锚点始终绑定本次真实unit和原快照。重复短词不能默认取首命中；需要更长连续引文使位置唯一，或从应用已定位的真实选项明确选择。不得跨unit拼quote、模糊换字、因坏证据改绑另一unit。scene新合同中的坏/缺身份锚点进入同一原有生成纠错门；失败批不记coverage，不用旧`locatedRoster`的“另找首个同名/丢条目”回退修好。其它类别维持原行为。

应用核验的是字面来源、范围、引用及一致性，不假称字符串校验已经证明空间语义。关系的语义依据仍由提取/后续复核和必要的作者决定核验。带多个地点的长unit可以是共同上下文，不能仅凭unitId相同就宣称整unit属于某一个地点。

## 4. 可追溯身份账本与有据合并

为scene维护应用生成、严格持久化的sidecar：原输入/工作版本、原始记录稳定键、全部literal称呼及锚点、限定/父级/同一地点关系及依据、具体identity组件、未解决事项。模型响应不能写入“已确认/已核验”状态。stash保存完整已核验信息，不再只留一个unitId。原文、source artifact和已有facts本体保持原值，不把sidecar伪装成native facts新字段。

### 4.1 持久化与应用身份的准确合同

`wizard.sceneIdentity`为严格对象，最少字段冻结为：

```ts
type SceneIdentitySources = { workingRevision: number; workingUnits: readonly ImportUnit[];
  sourceBlocks: readonly { artifactId: string; blockIndex: number; sourceName: string;
  nameOrigin: 'heading' | 'artifact' | 'filename'; text: string; units: readonly ImportUnit[] }[] }
type SourceRange = { unitId: string; unitHash: string; start: number; end: number }
type BodyMember = { key: string; origin: 'body'; literal: string; range: SourceRange; evidenceRange: SourceRange }
type SourceMember = { key: string; origin: 'source-block'; artifactId: string; blockIndex: number;
  blockHash: string; sourceName: string; nameOrigin: 'heading' | 'artifact' | 'filename' }
type StoredRecord = { key: string; batchKey: string; name: string; aliases: string[]; memberKeys: string[];
  context: { key: string; label: string; evidence: SourceRange[] }[] }
type StoredRelation = { key: string; leftKey: string; rightKey: string;
  relation: 'same-place' | 'different-place' | 'parent' | 'not-parent';
  evidence: SourceRange[]; basis: 'model' | 'author'; decisionKey?: string }
type NamePart = { kind: 'literal' | 'context'; key: string }
type Identity = { id: string; memberKeys: string[]; recordKeys: string[];
  state: 'concrete' | 'source-scoped' | 'unresolved'; nameParts: NamePart[];
  parent: { state: 'unknown' } | { state: 'known'; id: string; relationKey: string } }
type LinkTask = { key: string; type: 'identity' | 'parent'; leftKey: string; rightKey: string;
  basisHash: string; result?: { outcome: 'same-place' | 'different-place' | 'parent' | 'not-parent' | 'unknown';
  evidence: SourceRange[] } }
type IdentityDecision = { key: string; previousLedgerHash: string; revision: number;
  operation: 'partition' | 'label' | 'parent' | 'defer'; explanation: string;
  memberKeys: string[]; before: Identity[]; after: Identity[] }
type SceneIdentityLedger = {
  version: 1; sourceScopeHash: string; workingRevision: number; identityRevision: number; ledgerHash: string;
  members: (BodyMember | SourceMember)[]; records: StoredRecord[]; relations: StoredRelation[];
  identities: Identity[]; linkTasks: LinkTask[]; decisions: IdentityDecision[];
  ownershipReviewed: string[]
}
```

Sources为不可变工作版本快照，调用方不能原地改workingRevision、unit.text或映射后复用缓存；显式`assertSceneIdentityLedger(ledger,sources)`仍重验，正常高频索引按同一快照复用。`sourceBlocks[].units`的准确顺序为：先放应用按真实block范围截出的全部owned slices（包括纯空白片，原顺序拼接必须完整等于block.text），再附同id/file且真实包含上述slice的非重复原完整unit作为supports。后缀supports可用于links、scene entity及parentRepair同包中同id多slice之间真实gap的必要context材料恢复，不算这个block的owned文本；没有真实原值不能填白、猜拼或丢一片。支持unit仍须在原已授权文件/kind范围。

共用pure helper固定为`sceneSourceBlockOwnedUnits(block:SceneIdentitySourceBlock):ImportUnit[]`：返回上述完整owned前缀并核验后缀确为相应slice的真实superset。main的sceneOwnedUnits、sourceCopy证据及ownership只用该helper；这些请求构包统一使用sceneIdentityMaterialUnits(units,sources):ImportUnit[]，核实sources中同id/file原始superset后仅合成片段所需最小真实hull；缺真实gap仍拒绝，不能丢片或猜补。links再按owned前缀生成sourceBlocks的显式ranges。源字段仍不新增，模型wire不变，support不自动变成事实证据或其它场景的所有权。直接引文可由同identity/同unitHash的相邻owned范围连续并集证明，不能跨context/gap或不同identity合并。

全部hash/key为64位小写hex；identity.id沿`s-`加16位hex候选合同；整数为非负safe integer，ranges为unit内UTF-16半开范围，start<end且安全边界/原值hash均通过。SourceRange不装file路径或Key。quote由绑定版本unit.text的range完整恢复，不在每个member重复保存全文；`BodyMember.range`是literal本身的位置，evidenceRange是包含它的原连续引文窗口。关系左右键引用稳定record/member/组件代表键时须在当前账本解析唯一，不能引用其它账本。

选择状态仍以现wizard.candidates[].selected为唯一来源，不重复存入Identity；新鲜及新建part默认true，作者显式选择仍走原选择action。改变选择会改变原session revision/selectionHash及预期覆盖集合，不改变具体地点身份或拿旧identityHash掩盖过期UI动作。decisions保存每次原完整before/after身份元数据及解释，不覆写已决定历史；它不复制facts或正文。

`sourceScopeHash=importHash({version:1, workingRevision, workingUnits:原顺序的{id,fileId,start,end,textHash}, selectedSceneSourceBlocks:原顺序的{artifactId,blockIndex,blockHash,sourceName,nameOrigin}})`，另保留原来源grant/proof校验，不用此hash替代权限。workingRevision也参加命名空间，防正文偶然相同而新工作版本重放仅应作历史的旧partition；同scope/同工作版本正常revise保留账本。unitHash是完整unit.text hash；sourceBlock由应用调用原`splitWizardSourceBlocks`的确定序号和完整block text得出，标题出处由原heading/artifact/file fallback得到，**不要求fallback名字在block正文出现**。SourceMember不经模型literal门、不新增模型调用；模型不能返回或构造source-block分支。重新分卷/选章/改正文或来源块变化即建立新scope，旧账本不能合用。

body member.key为`hash({version:1,sourceScopeHash,unitId,unitHash,start,end,literal})`，不用quote窗口、批次返回序号或模型name构成提及身份；source member.key为`hash({version:1,sourceScopeHash,artifactId,blockIndex,blockHash})`。batchKey只取该批原有请求的有序unit ID/textHash及sourceScopeHash/workingRevision；StoredRecord.key取排序后的memberKeys及其完整context依据hash，不取网络到达位置，targetIndex先在本回复解析再转稳定键。组件id以全组件最早源member.key为scope、该member原literal/来源名为固定底名调用`wizardCandidateId`，显示名不参与；后续真实分拆/归并按源顺序重算组件，生成前旧候选/任务按5.1失效。相同材料重试、batch返回乱序和quote窗口变化不能变更相同提及key或偷偷换ID。

`ledgerHash`为上述绑定字段及records/members/relations/identities/decisions的规范序列化hash，排除自身hash、linkTasks的纯执行进度及ownershipReviewed；source顺序、member范围、稳定key排序规则固定。identityRevision初始0，每次有效关系/作者修改的原子提交加1；存盘时重算hash、所有引用/全partition/父级图并严检。links并发只能在同一冻结ledgerHash/revision的有界wave内调用，allSettled后按稳定任务顺序**一次**组合校验提交，不逐个返回改变版本后接纳旧包；组合矛盾保留原记录/待确认，不按到达先后任选边。每次提交后下一wave使用新快照，失败和晚返回仍受原epoch/授权门。

容量分别为：原始StoredRecords≤50000（原stash上限），去重members总数≤50000，identities≤5000，linkTasks≤20000，`relations.length+decisions.length≤20000`，ownershipReviewed≤50000；各记录内aliases沿20，所有context/mention/关系依据的**总引用数**≤50000。数组去重不能删不同来源的合法项；越界整包/提交失败并保留旧已提交账本和未提交结果，不截断。完整session含账本继续受现`IMPORT_JOURNAL_MAX_BYTES=1GiB`约束；不提高该门。模型每包仍过原字符/unit/JSON/UTF8 wrapper/实际role容量门，records32/tasks64不构成预算豁免。

ownership mode的memberships严格为`{identityId,memberKeys,ownedRanges:SourceRange[],contextRanges:SourceRange[]}`数组，最多5000项，只投影当前包出现的已归属成员/必要上下文及有据引用闭包。完整可信账本留在main，不向worker/每次view复制全账本。单条ownership coverage key为`hash({version:1,sourceScopeHash,identityRevision,identityId,memberKey,memberRangeHash,artifactSemanticHash})`；BodyMember仅在当前完整owner版本的有效review请求确实包含该membership、覆盖该member的真实unit范围且提供该identity资料投影时checkpoint credit。

pure接口准确为`sceneIdentityMemberships(ledger, units, sources):SceneIdentityMembership[]`。ledger中的range/unitHash始终绑定sources原完整unit；request.memberships中的range/unitHash绑定**当前request unit.text**的局部UTF-16坐标及实际text hash。`wizardSourceSlices`可能沿原unit.id但start/text已经切片，须以当前unit的绝对start与可信sources对应关系映射，核验原值一致后再恢复局部范围；不能因id相同直接使用原offset索引slice。服务核验当前request局部范围，main在有效接受后再沿相同映射反投原member/block计算coverage。不得为省映射改成发送整block全文，也不能将未进入slice的范围计入credit。

SourceMember的memberRangeHash用完整blockHash；当原流程需要模型复核时，完整block credit允许由原确定性来源分片或该source-copy artifact真实text投影的已完成coverage**并集**得出，不要求一包装完整大block。main以同一sourceScope/完整owner hash重算原计划，将片段映射到该block的半开范围；仅原有效review/reviewFacts task key对应的连续原值范围可进入并集，须无缺口覆盖`[0,blockText.length)`，重叠内容必须一致。片外/其它block/仅名字出现/已失效key不计；不伪造额外“已复核”任务。中间范围从原coverage及原确定性planner可重建，不存无限新进度。原本无模型的source-only复制仍不新增模型需求：应用验证该完整block原值等值复制、来源版本与原copy/native门后可记录**来源归属证明**，不将其声称为模型语义复核，不改变原流程何时需AI。原有需要AI的scene资料不可借该本地copy分支省略复核。

其它包、仅检索命中、未展示成员、失败/取消/旧版本均无credit。预期keys由当前全部已选identity的members计算，必须唯一且全部完成；该门与原`coverage.review`、`coverage.reviewFacts`并列，不能互替。任何身份/资料版本变化清旧ownership credit，原模型/权限变化不继承未被原门确认的结果。

后续identity判等的最小接线采用**现artifact.id加应用可信registry**，不新增native facts或让模型自报identity字段：main从当前version=1、hash校验的ledger构造`ReadonlyMap<identityId,组件成员依据hash>`，仅以显式内部参数传给scene的merge/context/目录路径。已注册scene只按相同artifact.id为同一身份；不同ID即使同名同父级也不合并。新scope收到未注册scene ID须走原有据新遗漏的“先加入ledger/再生成”路径，否则拒绝，不能fallback旧name身份。无registry/旧scope继续原行为。ImportArtifact、ImportSemanticEntity和reviewProjection不增加模型可写identity字段；传输只增加上面的app-only request.sceneIdentity，worker必须严格保留其副本，canonical原id/name/kind/native/投影门仍全执行。

合并规则独立于`mergeWizardRoster`的名称union：

- 同一精确源提及的重复识别可去重；去重仍保留每批来源记录，不重复制造材料。其它提及加入同一具体地点，必须有明确同一地点关系或可核验的完整具体定位依据，并且已知城市、地址、容器、空间区分及适用时间不冲突。仅name/NFKC相等、alias相等、同一parent、同一人物所有、相邻章节、相似描述或高出现次数均不充分；同城同名建筑、同屋多个房间、同人不同住所是必须保持的反例。
- 跨批不同但有据等价称呼可以合并；不能为避免误并而机械地每unit建一处。初批未展示的连接关系不能猜。在原roster结束后，可对确有歧义/待连接的记录使用同阶段有界身份核对：只返回冻结候选之间的关系提案及原文依据，沿原权限/预算/纠错次数；不附带entity资料生成或改facts。每批所有目标须有结果（同一/不同/仍未知），不得只保留成功子集；无法装下的关系集合按真实材料分批，不能丢候选缩小目录。是否需要模型核对由实际原始记录决定，不给所有候选无条件增加一轮调用。
- 明确不同地点的关系阻止直接或传递union。每次拟合并须检查整个组件的具体定位/互斥约束；不能用中间泛称把两个已知不同地点接在一起。新证据与已冻结身份冲突时保留待确认，不静默重写已有组件。
- source-only场景块保留原block身份和全文；同名source块不直接合并。资料块与正文身份的连接也须有据或由作者确认，不能因标题等于泛称就把同名块一并并入。来源只拷贝模式保留原复制及无模型调用语义，原source字段/正文不改，不把source强制转成inferred；身份及组合标签放在向导sidecar/可信目标映射中，不改原来源记录。

候选ID由应用按源版本和有据identity组件确定，结果不依赖网络返回顺序、显示名票数或alias顺序；可使用现`wizardCandidateId`的scope能力，但scope必须来自冻结组件，不能是模型自由字符串。源顺序确定稳定代表锚点；冻结后改显示名不改身份。后续合并/拆分导致身份变化时按原revision/epoch原子更新所有成员、引用和受影响任务，失效旧结果，不能仅改列表文字而保留旧任务credit。

须区分两种未知，不能把未知都变成强制猜测或所有未知共同合并：

- 原文已能分别描述一处具体空间，但无客观跨章连接、地点名/父级不明：保留该有据提及集合为**来源限定独立记录**，不猜地理，不与其它同词记录自动相连。限定标明来自哪一真实章/来源范围，是出处标签而非小说中的城市/住所事实；parent可正常未知。原文同一场景范围内有据连续描述应归一条，不按每个unit/每次词出现建一项；后续发现真实连接再按有据关系/作者动作归并。记录数量来自有据识别条目和关系组件，有原容量界限，不扫描每个泛词生成材料。此类保守独立记录可正常导入；出处局限明确，不伪称已证明它与全书所有其它记录必不同，也不因未知父级自动报错。
- 一条记录已混入明确不同地点、同一提及有互斥归属、或现材料不足以在已知几个地点间正确分配：保留所有原始锚点为**待确认组**，不生成混合PLACE资料。作者在正常详情中确认归属/拆分；若仍不确定，保持待确认。不能以来源编号掩盖已知错误归属而越过此门。

计数应区分具体/来源限定场景和真正待确认组，不能把旧按名字合并数冒作具体场景数。来源限定独立记录同样默认全选，正常未知不降低任何覆盖义务。

## 5. 显示名、父级与作者处理

应用可由已核验的原文限定片段组成最短足以区分的显示名，如合成示例“甲城·东宅·书房”和“乙城·西宅·书房”。这是明确标识的应用组合标签；原文literalName、全部alias和限定出处另存，不能声称组合串逐字出现，更不能放宽literal门去接受任意自由名称。限定不充分时保留源称呼并标“身份待确认”，不用编造住址、城市、人物归属或编号冒充小说事实。

显示限定应优先保留已有真实短名并仅补最少区分。现候选name最多300，而真实场景面板`src/lib/scene-schema.ts`的name最多50；新生成的组合名称须通过该实际native名称约束。原source-only复制名称/全文仍沿旧复制合同，不因新body literal/组合名规则新增拒绝或改写。不能静默slice/省略关键限定以变成重名，不能为此放宽面板限额；必要时让作者用有据短称确认，完整限定和出处保存在详情。即使显示名同名，身份仍不可退回name+parent判等。

父级只在具体identity解析后绑定真实candidate ID；使用有据直接容器关系，不以城市/主人词任意补成直接parent。歧义parent保持待确认，与“原文未确定有上级”区分；不得取同名Map首/末值，不得删除有冲突的边当根。全图类型、范围、循环检查继续执行；已有有据循环修复协议保留，不任意本地断边。不猜测两处相似空间能否同时存在，不从层级较深自动判为更正确。

新scope保留原`sceneParents`模型循环修复wire，不经作者change伪造决定。pure入账接口冻结为：

```ts
applySceneIdentityParentRepair(
  ledger: SceneIdentityLedger,
  binding: { ledgerHash: string; identityRevision: number; targetIds: readonly string[]; units: readonly ImportUnit[] },
  proposals: readonly { id: string; parentId?: string; evidence: Anchor }[],
  sources: SceneIdentitySources
): SceneIdentityLedger
```

binding是应用在调用前冻结的值，不由模型返回。main从循环目标及相关父级的owned mentions/source ranges选修复units，不按display name/alias泛扫全文；缺证据/最小完整目标集不适配预算则沿原明确门失败，不能选部分循环。pure复用原`sceneParentCycleIds/applySceneParentProposals`的全部循环集合、目标完整覆盖、32上限及完整图无环门，重验真实证据及来源绑定，拒绝stale ledger/revision。返回新账本，所有非循环父级/候选/资料元数据完整保留；新parent关系以basis=model入账，旧关系保留历史而不再active。显式proposal省略parent时转为unknown，将该真实原proposal证据保存在对应parent LinkTask.result=unknown，不伪造author IdentityDecision、不由本地任意断边。成功一次identityRevision++/重算hash/失效ownership；main经原授权、epoch和持久化门原子提交后，**由新ledger重建candidates**，不能只改候选留下旧账本。任何失败原账本/候选/credit不变。

场景详情最小新增正常作者操作：查看所有待确认提及及必要邻接原文；明确归为某已有具体地点、保留为另一具体地点，确认有据短称/直接父级，或保持待确认。复用已批准的真实`NovelImportWizard`详情、来源查看及原作者revision/解释/保存交互，不另造工作台。展示合并将保留的全部成员、原始称呼和证据；拆分按原提及分配，不能自动分摊/复制已混合facts。决定需当前版本及解释，原子保存，可返回修改；与场景选择分开，不通过取消勾选隐藏未知。默认全部选中；选中的真正待确认混合组阻止该项进入资料生成并给可操作说明，不阻塞其它已明确或正常来源限定项目的完成credit。不能调用隐藏action、直接改会话/数据库或由测试代理代作者盲选。最终验收不得skip/drop待确认项来满足“全部场景”。

### 5.1 严格UI action、详情及提交时点

新增且只用于该scope的正常action如下；下述共同字段必填`{id:session UUID, revision:当前session revision, expectedLedgerHash:64hex}`，不能用现mutable可选revision放宽。所有对象strict（含额外undefined），字符串well-formed，explanation非空且≤16000。

- `type:'wizard-scene-identity'`，附`explanation`及严格op判别分支：`op:'partition', identityIds:string[], parts:{memberKeys:string[],state:'concrete'|'source-scoped'|'unresolved',nameParts:NamePart[],parent:{state:'unknown'}|{state:'known',id:string,evidenceKeys:string[]}}[]`；或`op:'label',identityId,nameParts`；或`op:'parent',identityId,parentId:string|null,evidenceKeys:string[]`；或`op:'defer',identityId`。identityIds/parts均非空≤5000，唯一，不接受模型/renderer新造ID。label只引用该identity已有literal/context键，应用组合并过真实50字门；不能带自由新场景名。parentId=null明确标未知而非证明顶层，保留旧关系/解释历史；设置/撤销既有关系必须有相关原文evidenceKeys和解释，不能空依据自动删边。defer仅将该组标unresolved，不取消勾选、不删成员。来源范围可已知但父未知的正常source-scoped不需被defer。
- partition的完整universe为identityIds当前全部memberKeys并集。parts须对它形成**完整且互斥partition**：每member恰好一次，无遗漏/重复/片外member；SourceMember整个block是不可拆原子，不能拆正文或将一块复制多份。BodyMember按唯一literal位置分配，不能按unit分配代替具体提及。context原记录及全部依据永远保留；nameParts只能从本part成员所属原记录引用，不能自动把旧混合facts复制给每part。各part无新facts，默认selected为原涉及组件selected的并集（全部新鲜记录默认true）；如作者之后取消项目只走原选择action。全图父级/known-different约束和名称门一次检查；声明concrete不能豁免其材料依据，未知可保守source-scoped，仍混合则unresolved。
- 两个只读action：`type:'wizard-read-scene-identity',identityId,cursor:number,limit:number`（cursor≥0，limit1–50），返回`sceneIdentityDetail:{ledgerHash,identityRevision,identityId,state,name,parent,totalMembers,members,nextCursor?}`；members仅当前页的`{key,origin,literal?,unitId?,range?,sourceName?,blockIndex?,contextKeys}`及必要受限关系摘要，不携带全文。`type:'wizard-read-scene-source',memberKey,neighbor:-1|0|1,offset:number,limit:number`（limit1–32768），返回`sceneIdentitySource:{ledgerHash,memberKey,neighbor,unitId?,offset,total,text,nextOffset?}`。neighbor=0时offset位于该body member绑定的完整working unit或该sourceBlock全文；body的±1只指该unit在当前已授权workingImportUnits原序中的前/后一个unit，越界拒绝，sourceBlock仅允许0。安全字符边界按原分页规则处理，原文不改写。不接受任意fileId、路径、SQL或片外unit。working unit可为working-0，直接从当前账本校验的workingImportUnits/真实sourceBlock取值，不伪装成原files去调用read-source。首次定位页由应用给实际mention相邻offset，长资料再分页，不能把每次原文都灌入view。

普通`wizardView`必须显式剔除内部ledger，只新增`sceneIdentitySummary:{version:1,ledgerHash,identityRevision,concreteCount,sourceScopedCount,unresolvedCount,ownershipDone,ownershipTotal}`；candidate仅保留现列表必要信息及state摘要。详情/原文响应也核对revision/hash并限制总文字≤32768；全ledger不随每次current/changed广播。读操作可在detect-scene的running/waiting/failed查看当前已提交数据，旧hash立即拒绝，不启动AI或写状态。

写action只允许`wizardVersion=1,semanticVersion=1,sceneIdentityVersion=1,step=detect-scene,stepState=waiting,phase=select`，无jobs/停止/出版、来源及ledger当前有效。生成后调整只能通过原`wizard-revise(to:'detect-scene')`先取消/排空并按原规则删除scene及其后置产物、完成重新识别到waiting再操作；不增加“任意修改已生成facts”接口。该revise必须保留旧身份作者记录用于有版本核对而非悄悄迁移；范围/workingRevision改变即重建，失效旧决定应用效力但保留审计。

提交在原serial/当前owner校验内对clone执行，校验完整partition/所有引用/全图/名称/容量后一次持久化成功才替换owner并发changed；失败包括save/授权/来源变化均保留原内存、revision、epoch、ledgerHash、任务和credit，不能一半改名一半保存。有效非noop提交identityRevision/session revision/epoch各加1并重算ledgerHash；同part/label/parent/state完全未改变的noop返回现view，不新增决定/版本/credit。defer保留成员且不能推进完成。

失效清单固定：所有scene实体/内外景任务及暂存结果与scene artifact（此门本就尚未生成；若存在残留须拒绝或走原revise清除，不能复用）；scene图像grant/selectionHash；scene及之后步骤checks、运行结果、后续typed引用目录、outline/foreshadow链接/semanticState、review/reviewFacts/ownership credit和出版计划均按原revise规则清除后重新计算。识别的完整raw records/members及已核验原始roster单元coverage不删；links任务只有basisHash仍相同才可复用，变更组件的计划/结果失效。正文/卷章、来源原值、角色/角色图像及更早阶段已完成结果不改。未来scene任务由新组件hash确定；晚到旧epoch结果不能进入新ledger。当前版本身份改动后必须重新完整review及全部最终门，不能保留“此前已复核”标志。

## 6. 证据归属索引与后续闭环

从冻结账本构建可重建的`identity → owned mentions/source ranges/units`及反向`unit → identity memberships`索引；输入hash/workingRevision/身份决定版本变化即失效。原文中的比较、回忆、他人住所、转述可在同unit属于其它identity；保留知识归属及时间。一个unit允许多个真实归属，不能用unit互斥假设删掉其它地点。

- scene `importEntity`仅从该identity已归属的提及/资料块与有明确标注的必要上下文取输入；移除新scope下`cited OR 泛词全文命中`的自动扩张。alias只产生待核对命中/检索结果，不能自动追加归属；非scene仍用旧路径。原始完整units不改，必要上下文与目标证据须在payload明确区分，避免把邻近其它地点描述当目标事实。
- scene证据选项由其已归属真实锚点生成；最多8项的选项是便利编码，不代表其它证据/事实可以丢弃，也不能从泛词周围任截一句就宣称归属。直接引用仍须同时通过原精确引用门和当前目标归属门；信息不足的引用反馈固定指导，不改绑/过滤坏项。
- 所有已归属来源保存在账本，不能沿用200个unit截断作为完整归属，更不能把首个预算批标为全部来源已核验。初始资料可沿既有有界取材产生，但完整正文/全部facts复核必须覆盖原所选全文，并核对全部归属记录；未展示的归属不发明“已完成”credit。原遗漏/补全/修订任务继续承担片外有据事实的完整纳入，未完成任务阻止最终完成；若无法在原任务/材料预算下合法处理，明确停在原可恢复门，保留全部原值，另行审定材料分包，不能靠裁事实完成本方案。
- `contextArtifacts`及scene实体相关目录按该索引提供当前包的真实identity及有据父级/必要引用闭包；组合显示名未在原文连续出现时仍能获得正确资料上下文。向review提供的归属元数据是待核验的来源绑定，不替模型做空间推理，也不能把全book泛词候选都塞入每包。
- 后续scene新增遗漏、`mergeImportArtifacts`/`sameEntity`及目录绑定在新scope中须沿账本身份，不以name+parent再次折叠不同ID。真正新地点以原缺口路径、真实证据加入账本并生成新任务；同名已有地点须明确选择/待核对，不能静默当新或自动并入。无账本的旧/其它target保留旧identity合同。
- 原source-value版本绑定、原native十三字段、知识归属、完整投影、作者锁/决定、引用类型/循环、来源/权限、epoch/取消和持久化门继续执行。新的identity/ownership只增加目标绑定证据，不替代这些门，不借此实施318无变化再生成优化或320B候选编译。

## 7. 有界性、性能与材料保存

账本保存每条合法原始识别记录，按稳定源键去重而非silent cap；既有候选5000、任务20000、记录及journal材料容量门不提高。超过门时保留可恢复材料并报准确固定错误，不能裁掉低频地点、别名对应锚点、全文或资料来降量。alias展示的既有限额不能截断账本原始身份依据。每个未知字段保留未知，不以null/空值改写成事实。

归属索引每源/身份版本构建一次并复用，避免scene并发时每项再次全book泛词扫描；中间结果只引用源范围，勿复制全文到每候选。模型只获得当前任务完整材料及必要有界目录；新增scope/锚点/账本投影/prompt全部真实序列化，参加原JSON、UTF-8 wrapper和实际role容量检查，无预算豁免。不提高heap、并发、模型context或输出cap，不改provider/endpoint/Key/thinking、正常授权或每包有限纠错。新增身份核对是对不同真实材料的有限任务，不可伪装成无限重试。

沿原实际场景导入计时起止验收≤7分钟，不挪起点、不暂停计时掩盖重排/网络等待。另记录识别/身份核对及作者等待耗时，不把前置身份工作归零。更多真实具体地点可能增加任务数；必须实际全书测量，不能依据索引优化预言达标。效率与完整性冲突时记录未达，不恢复泛型混聚、降低质量、取消默认全选或跳过难项。

## 8. 实施与准入顺序

本方案独审后，另写并独审最小用例；再按RED→GREEN→独立代码审核推进，不修改正在运行的冻结会话或把旧hash记为新实现通过。建议先以一个scene专用纵向模块承载纯身份/归属逻辑，main仅接线；shared请求/草稿schema、service原生roster、payload、真实场景详情和后续merge/context入口按上述合同最小更改。新增数据严格自身键校验，非法分支不能strip、fallback或取首项；错误只给静态字段指导，不输出未知键/原文/ID/Key/cause。

用例设计须证明而非只比实现自身：同规范名不同城市/住所不合并；shared-third-alias与own-alias两条旧入口均覆盖；同parent两房间及同主人搬迁不误并；真实跨批同地点及别称有据合并；传递边不得跨明确different关系；字面限定/坏quote/重复词不fallback；同unit多地点与比较对象归属正确；超过200条源依据不丢；限定显示名不逐字出现仍可审且不能伪造literal；后续name+parent不重并；未知有正常作者动作；版本/失败/取消/保存/恢复及非scene默认隔离。另验证无资料/正文/facts截断、原长字段、完整review及最终native/发布/重开门不变。此段是方案验收义务，不代替正式用例及其独审。

真实准入使用用户指定全书、当前已授权接口和正常产品构建的新鲜导入，默认全选。内容审核重点抽查已知混聚类别，同时核对完整记录数/归属覆盖、零skip/drop/失败、无泛型混合资料、无OOM、场景时限、全部正文/事实复核、作者有据决定、真实保存/重开及配置身份不变。任何一项尚未完成即如实未完成；不得以合成通过、scene卡片全绿或一次只读模型复测代替全流程通过。私有原文和建议仅存600隔离证据，公共台账只存计数、固定类别、hash及真实执行状态。

## 9. 需独审确认的取舍

身份语义不能仅靠文本相等机械证明；有据模型关系仍可能错，真正混聚须保留作者确认。新增场景详情确认动作是现界面缺口，不应伪称零UI变化。跨批有界核对的wire字段/单包上限、账本容量、恢复及UI绑定已在3/4.1/5.1冻结，须经独审和对应正式用例，不能在实施时自由扩展；超出本方案的通用地理ontology或全量事实重写另立方案。若实际全书暴露某具体地点全部归属材料的现补全路径无法装下，保留原完整数据并先审其材料几何，不以first-batch遗漏或无覆盖credit绕过。本方案尚未通过独审与实际验收，对达标不作预先承诺。
