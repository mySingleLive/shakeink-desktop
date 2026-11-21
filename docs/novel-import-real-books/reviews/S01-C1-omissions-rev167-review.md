# S01-C1 · revision167 omissions实际存在性独立核对

日期：2026-10-26（Asia/Shanghai）。审核者：独立测试子代理 `cross_platform_picker_design`。

**20项工作中，18项“对应artifact未生成”的理由与现有快照不符；另外2项确实没有独立角色/地点实体。** 这不是说18个现有对象的文学质量已全部正确，也不把两项真实实体缺口变成无条件事实。报告仅核对归档证据，不操作已失败的应用流程，不改代码或原数据。

## 证据与时序

本次先完成[revision163全目标预审](S01-C1-all-targets-pre-fact-review.md)，再按主代理新增授权读取同一外部run的semantic-omission-repair-start-rev167.json，对照冻结oracle/完整原文及163现有33项材料。没有读取模型请求包、响应原始日志或revision177文件，因此不推断某次实际请求究竟给模型看到了哪些完整字段，也不将失败原因直接归因于这20项工作。

| 元数据 | 值 |
| --- | --- |
| run / session | S01-20261026-C1 / `d65ceffa-b91f-42a8-84bc-65ea9ee0ab47` |
| oracle SHA-256 | `c3b8fb1b0d17ccafc78222087310c212ec1940448bd9896feaf6b55f33455c67` |
| expected-body SHA-256 | `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a` |
| revision163文件 SHA-256 | `30566fd283db742ace4bccc644a5356d1e374f15072438174d17c77dd723f16d` |
| revision167文件 | 118913字节，SHA `b72f7a2c255365f9b1d9ab8448e14f3507a68171f68aaff58f3dda8b3394ac54` |
| revision167状态 | running；workingRevision0，正文仍2723字符/hash b636；semanticState round1/stage repair，verifiedHash无值；20项omissions均done=false |
| 工作项分布 | character2、scene2、style7、foreshadow2、trope1、worldline3、narrative3 |
| 材料比较 | 163与167的33项artifacts逐对象相等，没有新增实体或字段变化 |

本次只读规范JSON比较的artifact集合SHA为 `9854b9b00da543d001fa06cbbec33941eabd30ffdec4b68f5e26b10913ee5aec`，编码为Python `json.dumps(ensure_ascii=False,sort_keys=True,separators=(',',':'))` 的UTF-8；这是审计比较指纹，**不是产品importHash或semanticResultHash**。

主代理随后报告应用已在rev177因实体标识/原类型或父级身份冲突失败，仍为33材料、36待处理冲突、正文未变；这些是主代理提供的后续状态，本审核不扩读177、不倒填为167的字段，也没有继续操作。未改oracle/source/app/model/journal/DB/生产代码，未执行tests、模型调用或应用/CUA。仅在repo写本metadata报告，不复制整书。

## 逐项核对20项omissions

序号沿归档数组顺序；key前12位供定位，完整key保留在原归档。前18项理由均使用“entities中已有对应ID，但artifacts未生成”的模式。这里不只看目录有名字，而实际读了对应artifact的text、facts及证据，核心内容确已存在。

| # / key前12位 | 工作kind / 指向对象 | 现有材料证据 | 分类 |
| --- | --- | --- | --- |
| 1 · c5401bb4031d | character / character-narrator | 独立character已含伙计身份、十二岁起点、温酒职务及关系，并非只在entities目录有名 | **错误报实体缺失** |
| 2 · 9fc3c1a00b9b | scene / scene-xianheng-back-room | 独立PLACE已含酒店父ID、长衫顾客坐饮房间text | **错误报实体缺失** |
| 3 · 1fe34da9c1e7 | style / style-first-person-retrospective | 独立style已解释第一人称限知回忆视角 | **错误报实体缺失** |
| 4 · f05ed55d67ec | style / style-white-drawing-portrait | 独立style已有白描外貌/衣着及对比功能 | **错误报实体缺失** |
| 5 · cd5d56d854c3 | style / style-classical-colloquial-contrast | 独立style已有文白/市井语体反差 | **错误报实体缺失** |
| 6 · 426d8264b183 | style / style-repetition-laughter-irony | 独立style已有笑声反复与冷峻反讽解释 | **错误报实体缺失** |
| 7 · 9eaae99aeb8d | style / style-object-motifs | 独立style已有长衫/豆/粉板/蒲包的物件母题 | **错误报实体缺失** |
| 8 · db7302a586e2 | style / style-scene-fragment-time | 独立style已有到店片段与节令推进解释 | **错误报实体缺失** |
| 9 · 6315e2b0d96e | style / style-understated-ending | 独立style已有克制结尾与不确定性解释 | **错误报实体缺失** |
| 10 · 6de7569a8271 | foreshadow / foreshadow-kongyiji-scars-leg | 独立foreshadow已有setup/payoff、伤痕与断腿传闻照应及来源限定 | **错误报实体缺失** |
| 11 · 31a32281a584 | foreshadow / foreshadow-debt-disappearance | 独立foreshadow已有十九钱反复与消失/推测死亡照应 | **错误报实体缺失** |
| 12 · 698f5dc0a14b | trope / trope-kongyiji-tear | 独立trope已标TEAR并有受辱/消失悲剧概括 | **错误报实体缺失** |
| 13 · f7b3b28d6af7 | worldline / worldline-kongyiji-observed | 独立worldline已有lineId/name、unknown时间、人物及亲见时段内容 | **错误报实体缺失** |
| 14 · aa474e9a307b | worldline / worldline-kongyiji-leg-rumor | 独立worldline已有丁家传闻、听闻之前发生/具体时间未知的限定 | **错误报实体缺失** |
| 15 · e5d85a90abb7 | worldline / worldline-kongyiji-disappearance | 独立worldline已有节令、欠账、不再见与死亡推测限定 | **错误报实体缺失** |
| 16 · a8d361426d44 | narrative / narrative-1 | 独立narrative已有order0、chapter0、叙述者ID及酒店/登场披露 | **错误报实体缺失** |
| 17 · 138f0cb39ea4 | narrative / narrative-2 | 独立narrative已有order1、背景/教字分豆的披露及来源 | **错误报实体缺失** |
| 18 · 838762140431 | narrative / narrative-3 | 独立narrative已有order2、传闻/末次到店/死亡推测披露 | **错误报实体缺失** |
| 19 · db050e7b1a64 | character / 丁举人 | 当前3个character无此独立实体，只有关系与传闻文字；不是已有character的另一档案字段 | **真实独立角色实体缺口** |
| 20 · 4addbfecbcfd | scene / 丁举人家 | 当前3个scene无此地点；源文确有酒客所述偷到丁家的地点，不是酒店隔壁房间 | **真实独立地点实体缺口** |

因此主代理所指narrator1+styles7+worldlines3+narratives3共14项，确实全部误报；除此之外，back-room1、foreshadows2、TEAR1也同样已实际存在，合计18项。不是18项引文无效，而是**引文证明原文有该内容，并不能证明当前artifact集合没有该实体**。

## 不把“已存在”误当“字段已正确”

| 当前真实问题层级 | 与错误实体缺失理由的区别 |
| --- | --- |
| 伙计人物态度 | 已有character-narrator确有入职年龄和职务；其真实缺口是自己附和嘲笑/轻视等人物事实。第1项所引职务句已在资料中，不能把整个角色说成未生成 |
| 三条narrative引用 | 已有三张带text/顺序/视角的材料，真实不足是refs全部为空及相关细节，而不是narrative实体数量为0 |
| 世界线粒度/关联 | 已有三条时段概括与不确定性说明；是否充分表达事件间关系和披露联动需按实际字段核对，不能用“缺整条世界线”替代 |
| 泪点与物件文风 | TEAR和物件母题确实有完整材料，但善意受冷的具体情绪及九文/四文等最低细节仍未充分召回；不等于整类条目尚未生成 |
| 伏笔文字归属 | 伤痕照应已生成且有据；欠账伏笔中个别话语主体仍可修，这属于现有text的质量，不是缺一个全新同ID对象 |
| 其它既有质量意见 | 绰号身份、局部受刑原因被标亲见、长衫范围等仍以163预审证据为准。18项误报也不意味着真正问题已经被完整识别或都可由这20项工作修好 |

本分类不是建议删掉原审核记录或跳过真实缺口；它区分事实存在性与质量维度，不能将“现有材料不够好”表述成“整个实体不存在”，也不能反过来因有同ID就忽略缺字段。

## 两项真实新实体的来源边界

丁举人是具有特定称谓的个体，不是可以用匿名群体关系代替的名称；现有关系提及不能当独立Character已导入。其直接证据来自酒客转述，不能因此写成叙述者亲见、确定审案官或一般受刑处理程序；真实姓名、年龄等未知不能编造。

丁家在原文作为酒客所述偷窃地点出现，当前没有独立Scene，故第20项的地点存在性判断有据。但原reason把它概括为偷窃与挨打传闻的发生地，后续也必须保留传闻/关联范围，不能新增具体处刑房间、坐标或无根据的父地点，不能将未亲见的空间细节确定化。本次不设计卡片/接口或规定新增对象数量之外的内容。

**限定结论：18项理由错误地把已生成实体说成缺失，2项确属当前独立实体缺口；现有实体另有真实字段/引用/文学质量不足，须分开记录。** 这份证据足以纠正对20项omissions的解释，不足以单独证明rev177身份冲突的实际执行根因、失败后的数据修复、发布或整书质量通过。原始证据未被改动，应用流程没有被继续操作。
