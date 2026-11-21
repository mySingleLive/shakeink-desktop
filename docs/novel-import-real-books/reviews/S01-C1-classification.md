# S01-C1 真实来源识别独立质量审核

日期：2026-10-26。审核者：`remaining_books_oracle`。**结论：本次自动来源分类语义质量 FAIL。** 完整小说正文被按“可以推断出什么”误标为独立世界／角色／主题／叙事线资料，body为0。26/26分类覆盖只证明协议覆盖，不证明来源类别正确。

只读本run事前冻结oracle、run元数据、rev5分类检查点，以及指定的生产prompt小文件；实际阅读检查点全部26个原文单元及完整事前基线。没有修改oracle、原文、应用、journal、模型或DB，没有运行测试或启动分析。报告只保留身份、范围和问题定位，全文／完整模型数据不复制到仓库。原生“内容识别中”等待提示为主代理的实际UI观察，本审核没有操作UI。

## 证据身份与实际阶段

run：`S01-20261026-C1`；session：`d65ceffa-b91f-42a8-84bc-65ea9ee0ab47`；rev5，epoch2，phase=source，semanticVersion=1。两模型角色记录均为当前同一DeepSeek-V4.1-Flash／deepseek-flash，不是两个独立模型。

| 只读文件 | SHA-256 |
| --- | --- |
| 外部run.json | `a9ab69c9283e26e35f1b05b6ad41f8892f9b39641d498f50eefd57a356c6ef82` |
| 外部oracle-frozen.json | `c3b8fb1b0d17ccafc78222087310c212ec1940448bd9896feaf6b55f33455c67` |
| 外部classification-checkpoint-rev5.json | `bad80dd1954d8a5a0b597a6305db1d37a9bd437961a38c2bcfdc7cd5cdbf790e` |
| `desktop/core/novel-import-ai-payload.ts` | `9e26d2c5751550b6410b3b6d00a3e220e4b917ac7b5124fad493e25b75e76051` |

前三文件位于用户测试目录的 `执行证据/S01-20261026-C1/`。oracle的SHA等于run事前冻结值，readCoverage为complete-for-downloaded-source，selectedBodyRange=[69,2792)，正文2723字符，expected UTF-8 SHA=`b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`。当前prompt源码身份也等于run.resourceHashes中的冻结身份，不是对后改文件作因果判断。

检查点26个unit范围连续、无重叠／缺口，完整拼接3609字符，其UTF-8 SHA=`54921ed14bde39f62be97c151ee40618fff62b51bde6c46800bf0139cc0752c4`，严格等于run的源原件SHA和checkpoint文件hash。这里使用已获准检查点重建文本，没有另外读取原件或未获准目录。取原始切片[69,2792)后，字符数和UTF-8 SHA均严格等于冻结正文。没有内容丢失、截断或改字证据；本缺陷是语义分类错误。

classification coverage恰含全部26个不同unit ID。实际kind数量为unknown13、world1、character2、theme1、narrative9，body0；selected仅theme/world/character/narrative。targets仍列全部12项、infer=true，但原始正文／工作正文均为空，chapters／artifacts／conflicts／patches均为空，除classify外没有分析覆盖，也没有发布回执。runtimeAiCall记录的是classify应用调用已settled/fulfilled；它不证明分析／复核已执行，也不暴露供应商请求身份或用量。

## 全正文逐段核对

以下为检查点unit的顺序号与原始绝对范围，半开区间。此版本字符均处于BMP，既有oracle码点范围与这些UTF-16范围一致。全部13个单位都属于基线同一篇未分章小说正文；人物描写、背景说明、角色对话与叙述者评论没有成为独立创作设定卡。

| 单位／范围 | 实际kind | 事前原文用途／定位 |
| --- | --- | --- |
| 03 [69,286) | world | 酒店格局、饮酒方式及阶层背景；小说开篇，oracle setting.tavern |
| 04 [286,483) | narrative | 十二岁伙计的第一人称回忆和工作变化，characters.narrator |
| 05 [483,580) | narrative | 柜台生活与孔乙己到店的叙述衔接，characters.narrator/boss |
| 06 [580,995) | character | 外貌、绰号、买酒、受讥与争辩连续在同一叙事场景，characters.kong／foreshadow.wound |
| 07 [995,1218) | character | 以听闻引入的经历及早期还账习惯，characters.kong／causality.debt；不是独立人物卡 |
| 08 [1218,1387) | narrative | 酒客继续嘲笑未进学的情节，theme |
| 09 [1387,1782) | narrative | 教字与伙计冷遇的对话情节，characters.children／emotion |
| 10 [1782,1933) | narrative | 分茴香豆的情节，characters.children |
| 11 [1933,1963) | theme | 叙述者反讽过渡，theme／style；不是作者另列的主题说明 |
| 12 [1963,2212) | narrative | 酒客转述丁举人事件，characters.ding；知识来源限定仍属小说叙事 |
| 13 [2212,2678) | narrative | 断腿后最后一次到店，items／emotion／foreshadow.wound |
| 14 [2678,2769) | narrative | 此后欠账重复及长期未再见，causality.debt／ending |
| 15 [2769,2794) | narrative | 最后一句不确定死讯，ending／style；其中正文仅至2792，尾部2换行在冻结正文外 |

按冻结正文范围相交计算，217字符被标world、638标character、30标theme、1838标narrative，合计全部2723字符，unknown和body均为0。这不是仅漏识别某段标题或注释，而是整篇正文被按照可提取内容分类。narrative在产品中是独立叙事线材料类别，不能因为原文是“叙述”就把小说正文全归该类别。

标题／作者围栏[0,69)及作者日期／现代注释／末围栏[2792,3609)均为oracle事前已列书外区间。unknown13主要位于这些区域，不把它们简单判为错误排除；本次模型没有将其标excluded。正文中的原有注号仍在冻结正文内，不授权删字。末单位越过2792的两换行需按固定边界精确切分，不能用trim或直接拼全部13单位替代冻结正文。

## 已知prompt缺口与窄修复建议

已知文件第25–26行让semanticVersion=1所有阶段进入semanticPrompt。第38行classify契约只要求unitId/kind、恰好一次及unknown，没有定义“来源材料本来是什么”与“正文里可推断出什么”的区别。第39行对classify仍统一附加IMPORT_KNOWLEDGE_CONTRACT、全部facts/native字段、角色／世界／事件与叙事线提取规则。actual结果与这种阶段混合相符，但本审核没有模型内部推理，不能证明这是唯一原因或保证一次改prompt就能解决真实模型质量。

建议主代理在45中限定：

- 为classify提供单独的来源角色说明和当前合法kind含义：连续小说中的背景、人物介绍、对话、事件、内心、叙述者评论仍为body；只有原资料本身明确为独立设定／规划／角色卡等内容时才归相应kind。不能按某段能抽取人物／世界／主题就改来源类别。
- classify仅输出来源分类，不附analyze/reconcile/review的native产物、facts、两线／引用生成要求；保留资料不可信／不改正文／unit精确覆盖／unknown回退／不自动排除和现有阶段白名单。
- 文件名、part或邻接信息只能作为线索，不能用特定书名、语句、所有文本文件默认body等硬编码解决。混合资料、正文与独立卡片、标题许可与注释仍需有界上下文和现有来源核对，不能自动吞附录或跨书内容。
- 不改原文、正文基线、语义oracle、字节／预算／引用校验、模型和重试配置。合成用例只证明契约边界，修复后仍须用此原件／当前模型真实重测，不能靠反复随机重抽或单纯coverage通关。

## 手工核对能否继续

仅排除标题／注释边界不能补救本次结果，须将整个既定正文[69,2792)明确重标body。现有来源核对可以在授权范围内作这种人工修正，事前基线和原字符均不变；但必须记录“整篇来源类别人工纠正”，保留本次自动分类FAIL，不能称自动识别通过或改oracle迎合输出。修正后可继续的只是后续真实导入／补全验证，后续全部语义、12目标、落盘和重开仍各自待验。

不能直接沿用当前四类selected当“选择全部已有内容”继续宣称全流程：body不存在，故事文字会被当原有设定资料，无法证明完整正文导入和正文12目标补全。建议保留C1失败证据，先完成45/46窄方案及审核，再按批准路径真实重测；若主代理选择先人工救本run，结果须与自动分类修复验证分开记录。本文未执行任何手动核对动作，也不授予额外模型调用、库访问或正文修改权限。
