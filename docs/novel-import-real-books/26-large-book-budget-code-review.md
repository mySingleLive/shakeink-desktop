# 长篇预算实现独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 当前结论

**针对性复审通过，LB-CR01已关闭。** 新v2分类检查点分别绑定来源几何与当前分类结果/成功ID，正常重开重新授权只补pending，真实来源/范围/结果变化不误复用。最终版本同一获准NI-LB01–10四文件独立运行 **27通过、0失败、0跳过**，无剩余预算范围必须修订项。以下保留初审阻断、初版源码身份与最终修订过程；本结论不代替PDF/字形、语义、真实性能或真实整书验收。

本轮依据18方案、19独审与 `large-book-budget-implementation-evidence.md`，只读生产代码并运行下述唯一明确范围。未修改生产/测试、调用真实模型、执行audit/observer CLI、读取Key/真实journal/数据库或操作应用/CUA。旧S01外部快照的真实纯函数核对沿实施记录，本审核没有再次读取该真实快照或把它升级为新策略测试书。

## LB-CR01 · P1 · 分类重开重新同意会清空已成功子包

**实际接点：** `desktop/main/novel-import.ts` 的 initialize 撤销 classificationGrant；resume 的 recognizing 分支在重新同意后调用 classify；classify 随后无条件执行 `s.coverage={}`。recognize 的 v2 pending过滤虽然已经加入，但此时成功的 `coverage.classify` 已清空，之前子包全部再次发送。

可复现窗口为：新v2来源的首分类子包完整校验并checkpoint，第二子包保持pending；pause并正常close/reopen；原发送授权撤销，用户重新允许分类。现路径不是仅处理未覆盖来源，而是清空成功分类记录后重做。18明确分析、**分类**、全文review封包前过滤成功unit，网络包号不作为检查点身份；提高容量不能导致恢复重发成功网络工作。

**现有测试缺口：** NI-LB07先将分类一次全部完成，再在character分析第二包暂停；它证明分类文字不合并、分析成功子包不重发，但没有证明分类恢复。

**必修范围（已交主代理单owner）：** 用可验证的同来源/分类范围与已成功结果绑定保留v2分类coverage，仍明确重新授权且使用冻结profile；AI本身把unit.kind从unknown更新成body不能被误当作者范围变更。来源/作者选区真实变化仍须使旧分类检查点失效，不能放宽旧hash/授权或单纯盲信任任意旧coverage。legacy默认行为和已有scope/plan输入不补字段。

在现有NI-LB05/07加入分类首子包成功→第二包在途→pause→正常close/reopen；未同意时零AI且coverage不变；同意后只补未覆盖，首中尾/UTF-8/每个source ID保留、失败或迟到第二包不记信用。仅该编号内子场景，不扩展用例/套件。主代理已确认交预算owner修复，其余共享逻辑冻结；本人未直接修改。

## 已核对成立的部分

| 项目 | 源码依据与判断 |
| --- | --- |
| 默认legacy与显式v2 | `novel-import-budget-policy.ts` 保留旧公式/默认100；只有创建时text/review均已知且至少262144才持久化version2。1M对应81920/300，角色profile和工作单元策略严格校验，坏owned policy抛专类而非当作可忽略journal |
| 旧几何与模型授权 | capture发生在initialize/current/授权刷新models和撤销grant之前，已有成功分析却无可证明旧grant/绑定时阻断。v2/legacy profile不从当前模型容量自动缩放；实际角色model ceiling与主进程profile再次比较。endpoint/authRevision/role等仍在发送前与结果采用前核对；无AI纯复制不被低容量模型强制失败 |
| working/source单元 | 新v2首次workingUnits仅合并同file/part/连续且≤1000的安全UTF-16范围；已有数组原引用返回。来源分类units不合并、不trim、不改ID/part/offset。正文确实修改才清units按该会话冻结策略重建；软件/模型升级不重分片 |
| payload与固定余量 | controller与worker共用无IO payload helper，相关实体及父闭包/全局chapter index/指令和决定实际JSON均计入3B。worker按真实解析角色独立复验，源≤B、fact包≤2B、完整JSON≤3B维持；固定提示加16KiB结构纠正包络仍在64KiB预留。实际generateJSON初始/一次纠正调用有捕获断言；未提高供应商输出限制 |
| v2元数据拆包 | 贪心按完整相关目录重新计量，不削正文/决定/依赖来通关；单unit连必要元数据都超限明确失败。分析及全文review封包前过滤成功unit，fact包按稳定key过滤；LB-CR01是分类重新授权前清空coverage的例外缺口 |
| 复核完整性 | `novel-import-review-tasks.ts` 与controller/audit共用纯迭代器，按持久profile决定全部text/facts/证据分片。每片保留同artifact ID，pack.artifacts按数组保留，不按ID覆盖；共享units去重。响应全部冲突证据/引用通过、epoch仍有效才一次checkpoint，无部分包信用；全文review循环仍独立执行 |
| 旧hash/发布记录 | scope/plan/importBudgetAudit仅v2条件展开，legacy私有绑定不进入旧hash/旧publicationRecord；默认helper旧行为保持。NI-LB04用旧字段原始结构独立计算legacy golden，覆盖5k/12k、原workingUnits/checkpoint/artifacts/coverage重开保留及范围/target失效。实际已发布S01不重投影、不迁移 |
| 审计/观察器边界 | audit先validate预算状态，消费同一review任务helper；NI-LB09只导入无IO模块，不触发CLI。observer仅条件导出policy/legacyBudget和代码身份，endpoint/auth/grant未增加导出。原单原件/own work/novel/正常退出/只读事务门未扩大。本审核没有执行其CLI，也不把此预算变更当新PDF审计运行能力的证明 |
| PDF与生命周期组合 | main/index hash与交接基线完全一致；controller仍先PDF cancel/drain再tail/pause/close，发送/发布verify保留PDF页门控、源前后校验，私有report failure仍接受已颁同源历史revision并限定最后成功request。没有为容量跳过PDF等待或图像页决定 |

当前addConflicts的语义持续冲突问题属于已审21/24后续方案，不在本预算变更中展开实现；不会借预算审核宣称S01旧语义缺陷已修复。

## 冻结源码身份

全部与主代理交付值相符：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/core/novel-import-budget-policy.ts` | `d4c211b16dfbebc68f292ec10c7ab1f2d895b5b5156f7205908f6ff0c5c3c31d` |
| `desktop/core/novel-import-ai-payload.ts` | `c55b39bba7e60ef0e84811100dc71a6ce3d904b9d5b939eedd2939ad44c70b9a` |
| `desktop/core/novel-import-review-tasks.ts` | `2dfea1742a67f70b78b8d33353144dadfb30d13704e4a4ad1f0bbf99848a540f` |
| `desktop/core/novel-import.ts` | `75efc17677b1322f72ce9e4570d835f511ef82b02d87899225c0c297154db3c2` |
| `desktop/shared/novel-import.ts` | `3360c883af7b0560ec7d2085cc6e8cd0c01a8519b5a97db146271841d4228526` |
| `desktop/main/novel-import.ts` | `cbbacdc7c78eacea355182a188fecd1b85119e776bcac5b50c0f5e055e74e1ff` |
| `desktop/main/index.ts`（未改） | `02da4014d9f4404b71b34a8c0917881d63053dddd25772ed4c2daee098f10778` |
| `desktop/service/novel-import-ai.ts` | `bd86cc823d9bcf84628fd1fd48b199d9bc4e3f721987af99f0f940af33034a8b` |
| `desktop/service/novel-import-publish.ts` | `0d49374352c2b010de39c98a71f3f5df7be078950ea8007d6153ba15e957c24a` |
| `scripts/audit-real-novel-import.ts` | `917db3dd7feebe84aa2a6ba6d43e644bdba9320000a30a0a6572963a698b8ab9` |
| `scripts/observe-real-novel-import.py` | `b1ef948699943665c130e124c2626759dcb9a7dc401c5508eac15b1f0821d7a2` |
| `tests/unit/novel-import-ai.test.ts` | `12e208f117202d6cfade828e5cabb65f2f65fe8df256491c15564eea89cf34e6` |
| `tests/unit/novel-import-domain.test.ts` | `5f2649d2915041b4827d98e3c3914f14448165b4f624e83b700e643233c1f294` |
| `tests/unit/novel-import-session.test.ts` | `198ce09ba4e0866e07c36ddf74fb97705d55e168627104d2a63348f942580bd8` |
| `tests/unit/novel-import-budget-policy.test.ts` | `b114ce8a083021a348bbfebd0b0afa844f8ed0533c302aea5cff327e9f96f786` |

## 独立定向测试

仅执行主代理本轮明确授权的四文件/十名称：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB(?:0[1-9]|10):' tests/unit/novel-import-ai.test.ts tests/unit/novel-import-domain.test.ts tests/unit/novel-import-session.test.ts tests/unit/novel-import-budget-policy.test.ts
```

独立退出0，tests22/pass22/fail0/cancelled0/skipped0，约22.23秒。10个顶层名称含12个明确子场景；没有运行其他旧NI、完整文件/suite、browser/package、真实模型/数据库/应用。110万字符及实际prompt/结构纠正均为隔离合成输入，不是实际吞吐、供应商窗口/分词器或真实长篇质量证明。

等LB-CR01修订交付后只复审受影响文件并重跑同一限定命令，追加最终结论。PDF组合构建、旧S01实际指纹复核和后续新M02/L02真实验证仍由主代理按既定顺序独立保留。

## LB-CR01 增量复审与最终结论

同日只复审controller及同名session测试的指定增量，重新核对其余13个源/测试文件均与初审表相同。

| 最终变化文件 | SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `b4ef686b61b3c7ac08df121bdaf3347bba898ecdbe4c777824155ef19ee25f28` |
| `tests/unit/novel-import-session.test.ts` | `87520622eb43a542c439734731e2260ddadf712571275d604b999c5574cd3dd6` |
| `large-book-budget-implementation-evidence.md` | `da2f5a2b4f46f0f79b2b46913ca8dfc30012b1da15ef5a2b469c8297eba9eb96` |

controller新增私有 `classificationCheckpoint`，不进入旧shared/hash字段：sourceHash以同一v2策略/来源/PDF范围和完整unit几何/原文为基础，归一kind只用于区分不可变来源；另一个resultHash绑定当前实际所有kind和成功classify ID。采用每个完整结果时，在同一checkpoint内更新kind、coverage及两指纹，迟到epoch不会进入该原子回调。作者来源/范围等invalidate动作删除此检查点。

重新同意前仍verify来源、验证冻结容量；两个指纹均匹配才保留分类成功IDs，且只保留该分类coverage，不错误继承分析信用。缺检查点/不匹配按新分类处理，不拿任意旧coverage当可恢复；兼容新模型仍需明确授权并沿81920/300，不兼容和拒绝同意均零AI且不破坏已有记录。AI自身unknown→body的正常结果更新不会被当成源修改。legacy不补该检查点，scope/plan及prompt黄金未改。

新增的是NI-LB05内四个失效负例（作者set-range、include撤销后重新包含、同ID来源内容/hash变化、成功kind篡改）及NI-LB07内一个真实分类恢复正例，合计五个子场景。正例实际等待第二网络包pending后pause/close/reopen、拒绝同意、不兼容模型、兼容模型重新允许，验证仅未完成原source IDs及全部字段/UTF-8字节按序发送/采用一次。原110万字符十二kind、全文review、facts及其他旧断言保持。

实施记录保留该恢复窗口的真实RED（旧实现首包重发）、同名GREEN；独立在最终hash后重新执行本文件原精确四文件命令：**退出0，27通过、0失败、0取消、0跳过，总时长约25.29秒**。未额外运行旧NI、PDF、browser、package或其他文件；没有调用真实模型/DB/应用/CUA或真实journal。

同controller包含主代理明确交付的OCR非exclude决定接点增量；只静态确认其完整台账/源验证及PDFReady/send/publish阻断仍在。本26不把它计为预算通过依据，也没有扩跑PDF；其行为与真实controller正反验证交27独审处理。25字体保真方案尚未实施，不在此版本宣称字体/图像通过。

**最终：18长篇预算实现独立code review通过，LB-CR01关闭，无剩余本范围必须修订项。** 27项合成通过不是供应商上下文/分词器保证、真实性能或语义正确性证明；旧S01已发布回执和FAIL记录继续只读，后续PDF组合构建及新M02/L02等真实run按各自验收顺序保留。
