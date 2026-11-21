# 场景具体身份方案独立审核

2026-11-01，审核者 `structured_generation`，未参与323方案编写。只读方案与实际源码，未改产品/测试，未运行App、模型或真实作者动作。初审版本SHA256：`4b4d8b90b61185aeb9badf436ca55b5030722a2daca99a360eb9bc60dd808f71`。

## 最终结论

已复核作者最终冻结补稿SHA256 `f6aee4a01d8816757b5be723c24da94908eb45ee9e0491a894acd0192d239788`，**方案通过，无遗留方案阻塞，可编写324最小用例并交另一代理独审。** 尚不授权跳过用例审核、TDD或实际系统验收。

最终内部投影/材料澄清也已复核：sceneIdentityMaterialUnits仅从可信同id/file完整原值构造必要hull，不扩大owned；引文只能取同identity、同unitHash相邻owned并集。作者拆分后的packet records投影本part成员/字面别名，raw全记录留ledger；knownRelations仅当前包闭合，外部约束仍由完整ledger硬验。共同字面无额外定位不付费，异名共同context也核对，不声称所有name-only专名均已完成跨章归一。此为原组件归属/完整材料合同的精确接线，不扩模型wire、限制或作者权限，具体代码由326复核。

内部Sources澄清已复核：workingRevision加入既有sourceScopeHash，防同文本的新工作版本重放旧partition，旧记录只留审计。真实同id slice有gap时只使用原已授权完整unit作为support，不猜补；Sources.units以可核完整owned前缀加同id/file真实superset后缀表示，共用sceneSourceBlockOwnedUnits只返回前缀。links可借support保存完整原值，主copy/取证/ownership不把后缀当owned。无新wire或字段、仍计原完整预算；Sources不可原地改值复用缓存，显式assert重验。324的gap/非unknown后置、版本哈希及旧决定失效增量须再独审，具体代码是否落实由326另审。

代码独审P2暴露的SourceMember材料证明增量已复核：links row新增可选app-only sourceBlocks显式memberKey→当前局部ranges映射；有source时逐member恰一项，服务按显式顺序核局部hash/边界、完整字符串blockHash以及同unit/同file绝对位置无交叠。这样服务不再仅凭SourceMember shape接受unknown空结果，也不用从ID、标题或任意串联猜源归属；同ID多slice由main可信sources正确映射，不能Map覆盖。原输出wire/两代/role不变，元数据全额计入原预算。324对应源正负控须独立复核后才补实现；先前28项service通过未覆盖此请求前门，不冒认P2已修。

在已通过的`6e81df…`版本上，最后三项接线增量也已独立复核通过：mixed review在selectedTargets包含scene时附scene ownership，仍保留原mixed wire及UR/SV exact-scene范围，纯非scene黄金不变；`sceneIdentityMemberships(ledger,units,sources)`明确可信source-block映射及同ID slice的绝对start→局部range/hash转换，不能从ID格式或标题猜来源；原sceneParents循环修复保留完整图/目标/证据门，model basis及unknown原证据进入ledger，再重建candidate，原授权/epoch/保存失败全回滚，不伪造作者决定。三项均补齐已有纵向合同，没有扩展模型wire、重试或免除归属覆盖；对应324用例须独审。

三个初审接口块均已关闭：

1. 版本准确放在wizard，旧无版本会话不自动迁移；strict transport明确roster/links/ownership及原phase/intent/kind门。模型wire只收原单根，应用编译公共roster加完整sceneRosterRecords，canonical末端重验对应，不会因双parse丢mentions。links的records携带完整members/records/knownRelations，32records/64tasks及全局容量、冻结wave一次提交已明确；不将memberKeys当作worker已有的全文。
2. literal和quote双唯一生成可信literal范围，member稳定key不取quote窗口、到达顺序或显示名；同unit两处同名房间不再凭同一长quote去重。跨批任务由共同线索产生完整待核组件集合，仅显式有据关系可归并，不按首相容者、名称投票或容量截断猜并。未知来源限定独立与真正混聚unresolved的区分保持。
3. 生成前正常作者action及两个分页read的strict payload/view、当前revision/ledgerHash、完整互斥partition、解释/noop/defer、保存失败回滚与epoch/任务/credit失效已冻结。working unit直接按可信句柄读取，body邻接只允许原序±1；全ledger不广播到view。sourceBlock可信标题来源不套body literal门，source-only仍无新增AI；大block归属可由原有效分片/投影覆盖并集核验，不必硬塞一包，也不伪称本地copy为模型复核。

## 初审结论（以下三块已由上述补稿关闭）

根因和纵向修复方向成立，不要求扩展通用ontology、320B或聚合。当前版本仍有下面三块小型实施合同未冻结，**暂不批准进入用例/实现**；补齐后可直接复核，而不是重新设计整套身份系统。

## 已核实的源码依据

- `desktop/core/novel-import-wizard.ts` 的 `mergeWizardRoster` 先按NFKC/去空白主名归组，再按own-name作为alias的投票连边做传递union；共享第三个alias本身不必触发union。`parent`取组内首值。323没有把这几种情况混成同一个错误。
- `desktop/core/novel-import-wizard-roster.ts` 对合并names反查source和stash；证据unit集合截前200；scene parent的同名Map会覆盖并把未知/自身移除。`main.runRoster`只存定位后的unitId与名称，不保留原完整quote/身份依据；现scene roster又会经 `locatedRoster` 首次名称命中或丢项回退。仅禁用一个union不足以修复其它入口。
- `main.importEntity` 的scene仍用 `cited OR name/alias全文命中`，首个预算batch和角色名称周边选项不能证明具体场景身份。后续 `contextArtifacts` 按artifact.name匹配；`sameEntity/importSemanticIdentity` 的scene判等是name/PLACE/parentId。只改显示名、只换ID或只补prompt仍可能污染来源、漏复核或再次折叠。
- `NovelImportWizard`目前详情只是别名、章数与来源文本；场景没有mention分配/拆分action。现有合并按钮只在角色显示，主进程泛用merge action也不是经过新scene身份约束的作者合同。323正确承认需新增正常交互，不能宣称“已有UI已经可解决”。
- 候选name允许300，而实际 `src/lib/scene-schema.ts` name上限50。应用组合标签与原文literal来源必须分开；不能放宽literal门或偷偷截短标签来规避真实native约束。

## 需要冻结的三个接口块

### 1. 版本、ledger及任务的准确类型与容量

方案的 `sceneIdentityVersion:1` 位置仍为建议，sidecar仍只有语义清单。两条实现范围必须共享可直接写strict schema的最小结构：新鲜会话何时设置版本、旧会话无版本如何保持旧合同、持久化ledger字段、source/working/identity revision绑定及稳定record/component键的输入，sourceBlock与bodyMention如何区分。

需明确跨批核对请求的实际字段/子意图、root结果准入、recordIndex与taskIndex作用域及每包tasks限额；不能由两个实现者分别猜成新intent或其它transport。现32完整records和全局records/tasks容量方向合理，但每类计数、字节门、失败/恢复绑定及ownership coverage key要有可测定义，不能实施时再随意选。

source-only block可能使用文件/heading fallback名称，不保证名称在正文里。body literal门不得误套而拒绝原复制或新增模型；应由应用根据可信源block范围/标题出处建立source记录，模型不可伪造，原全文与源记录不改。

### 2. 精确mention不能等同整个长quote

现 `Anchor={unitId,quote}` 只证明quote在unit内唯一；一个唯一长quote仍可含同字面称呼的两处房间。若以该quote当“同一精确提及”去重，可能又把同unit两处具体空间并成一处。须冻结literal到其唯一原位置的绑定和稳定去重键；例如显式mention的literal与anchor，并要求该literal在anchor内也唯一，从而得到可信的原坐标。可采用其它等价的严格坐标合同，但不能取首名词、凭unit相同或选择最长泛称消歧。

context/parent/same-place的语义关系仍不能由共现机械证明。现方案保留关系依据、different-place组件约束、unknown来源限定独立与真正混聚待确认的区分，方向正确；本修订只要求把锚点身份接口写清，不要求自动理解全部空间语义。

### 3. 正常UI action/view与原子失效

需列出实际strict action payload与返回view，至少包含当前session revision和ledger/version绑定、有效record/identity目标、解释、分配/拆分的完整partition，以及label/parent/defer的精确语义。声明“复用原revision/保存”不足以冻结新scene作者决定。

建议首范围限制在detect-scene的waiting确认门；生成后的调整经原正常revise回到此门，避免新增任意迁移混合facts的协议。允许时点、保存失败回滚、成功后epoch变化、受影响scene任务/图像/后续引用及review credit的失效清单须明确；不以取消勾选或丢掉旧记录隐藏未确认归属，不改变无关角色结果。

view应只携带有界摘要和ledger身份，详情按需读取必要工作unit/range与少量邻接。workingUnit的fileId不保证是原files的id，不能假设已有read-source能直接读取；不能把全ledger引文或全文复制到每次view。返回修改、暂停/恢复、过期renderer action和失败提交均须遵守原权限与原子边界。

## 同意保持的产品与验证边界

用户已选择具体地点分别导入。无跨章连接依据但来源已限定的具体记录可保守独立，不能强猜合并，也不能每个泛词/每个unit制造一项；明确混聚或互斥归属必须待确认，不用来源编号掩盖。source copy及其它类别仍保持原合同。

同一unit可包含多个真实身份和其它身份的上下文；8选项只是编码便利，不是全归属覆盖。移除200/首batch冒充完整覆盖、后续context/sameEntity沿ledger、不截全文/长fields及最终全部正文/facts/ownership任务门，均必须纵向验收。达到既有容量就准确停在可恢复门，不能静默裁掉来源。

既有模型/endpoint/thinking、原有限纠错、实际角色预算、roster并发和31场景workers、7分钟门、完整投影/知识/native/来源授权/epoch/发布门不提高或绕开。更多具体实体和身份核对的实际耗时必须测量，不能提前承诺达标。场景全绿或一组模拟通过不替代完整默认全选、所有归属/事实、作者决定、真实发布/重开。

补充后的最终准入以本文“最终结论”为准：下一步仅编写并独审最小用例，随后才TDD与独立代码审核。实际语义、容量/7分钟和完整发布重开仍待真实验证，本审核不预先认领通过。
