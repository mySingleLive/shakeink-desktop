# 《诡秘之主》本地整书导入专项测试用例

日期：2026-10-28。范围仅为用户指定 TXT 的完整真实导入、本任务 11 类设定及必要自愈。本文是用例，不是执行结果；所有用例初始为 NOT RUN。

## 冻结门槛与通过规则

- 唯一来源：`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`，原字节 SHA-256 `04e1a336e29d8437de3f2bd68ffe09f84befebe0748b8750e8f84caeebdd964e`。严格 GB18030 解码，使用 UTF-16 半开区间；不做 Unicode、空白或换行规整，不修改原件。
- 叙事基线为八卷 1394 个主线章加本文件附带的 8 个独立番外单元，共 1402 个。主线卷名依次为小丑、无面人、旅行家、不死者、红祭司、逐光者、倒吊人、愚者；第八卷名称及边界使用既有官方目录独立审核。原生结构必须为 9 个 Volume、1402 个 Chapter：八个主线卷加一个标题为“番外”的独立卷，番外卷含 8 章，主线卷不含番外。所有标题、范围、逐章 hash、PS/作者说明/替代片段的纳入或排除须在首个模型分析前冻结。
- 精确目标：`outline/theme/style/character/item/scene/world/foreshadow/trope/worldline/narrative`。selected 必须深度等于 `['body']`，infer=true；不得额外选择 goldenFinger，不得有直接来源设定产物或原生 GOLD_FINGER 行。
- 世界观九类子设定为 LEVEL_SYSTEM、POWER_SYSTEM、CONCEPT、FACTION、MAP、SOCIETY、CULTURE、GEOGRAPHY、WORLD_HISTORY。九类均须有真实原生产物，不能以 World 容器或其他类别代替。
- 状态只使用 PASS、FAIL、BLOCKED、NOT RUN。机械持久化与文学语义分别判定；未执行、无法证明或仍有关键问题均不得写 PASS。只运行本文用例及实际修复必要的定向回归，不运行全仓测试。
- 真实 Electron、真实原生选择器、真实模型和真实 PGlite 是正式全流程的必要条件。合成负例只验证审计器会失败，不抵扣整书实测；不得直接注入 journal/数据库、替换模型响应、缩短输入或关闭目标。

## 用例

| ID | 操作与核验 | 必须满足的预期 | 证据 |
|---|---|---|---|
| LOTM-L-IN01 | 只读重算指定文件身份并在正式 UI 核对编码 | 路径/字节/SHA 与冻结值一致；明确确认 GB18030；解码字符数、换行及 U+FFFD 状态一致；全程原件不变 | 私有输入清单、来源页截图、前后 hash |
| LOTM-L-IN02 | 独立冻结目录、1402 个叙事单元及全部非叙事边界；复核已知乱码 | 八卷 1394 章加 8 篇番外无缺漏/重复/换序；作者说明、PS、替代片段逐项有明确边界；既成乱码原样保留，不换源、不修字、不把拉丁 k 一概判错 | 事前逐章/番外范围与 hash、独立输入审核 |
| LOTM-L-FLOW01 | 从当前构建的正式 Electron 入口经真实原生选择器选指定 TXT，核对来源并创建本次会话 | 使用新的 session UUID，且 createdAt 晚于基线冻结时间；文件路径/SHA 精确匹配；启动分析前无旧 artifacts/coverage/publication；旧 B1 和派生文本未恢复为本次任务 | 会话身份、构建指纹、真实 UI 与检查点 |
| LOTM-L-FLOW02 | 核对分类与范围，选择正文和 11 项目标，选择隔离空目录并允许分析 | selected 深度等于 `['body']`；targets 与 11 项完全相等；infer=true；goldenFinger 未选且无 GOLD_FINGER 行；实际文本/审核模型与发送范围经 UI 确认；不直接写库或注入结果 | 选择页、确认页、目录授权、首次分析前检查点 |
| LOTM-L-VOL01 | 在正式卷章核对中确认八卷与番外边界，发布后检查 Volume/Chapter/PlanningDocument | 精确 9 卷 1402 章：八卷主线名称/顺序及 `213/269/250/214/204/116/87/41` 章数正确，独立“番外”卷含 8 章且组内顺序 1–8；主线卷不含番外，第八卷及番外卷均不是“导入内容”；叙事线全书索引可指向番外章；原始字节未增删 | 卷章 UI、原生表、规划投影 |
| LOTM-L-BODY01 | 独立拼接全部预期叙事内容，与发布后及关闭重开后的章节逐字比较 | 9 卷 1402 章的内容、标题、边界和顺序完全一致；全部章及首中末均核验；workingRevision=0、无待应用 patches；已知乱码逐字保留 | 独立预期、只读章节导出、重开 UI、全文 hash |
| LOTM-L-OUT01 | 按八卷、番外及完整章序核对全部大纲产物和原生大纲 | 主线关键事件、转折、结尾与番外内容正确；不串章、不提前披露、不把推测写成事实。叙事线成功后才生成细纲；最终review/repair后的章级细纲与1402个Chapter.outline及对应cards/tellings一致。第一卷 Volume.summary 只聚合不含chapterIndex的卷级/来源大纲，章级细纲不在其中重复，其他卷不重复塞入全书大纲；PlanningDocument 在容量阈值内保留相同摘要，超限时只能是“原始大纲全文见导入记录”指针；导入记录保存完整材料但不替代上述原生核验 | 全部大纲实表/记录、逐项原文证据、独立遗漏清单 |
| LOTM-L-THEME01 | 核对主题产物及 Theme 实表和面板 | 主题非空且有原文依据；复仇、守护/人性、选择/代价、身份与时代等实际主题不被单一口号替代；Theme.synopsis 与全部可投影主题产物精确对应 | Theme 行、全部证据、实际主题面板 |
| LOTM-L-STYLE01 | 核对文风产物及 Setting(type=STYLE) 实表和面板 | 叙述视角、语言节奏、悬疑/恐怖氛围、对白与细节风格有全文依据，不把情节或主题冒充文风；仅一条预期 STYLE 行，content.style 完整对应产物，referenceCases/dialogueMark/innerDialogueMark 与发布合同精确一致 | STYLE 整行、全部证据、实际文风口径面板 |
| LOTM-L-CHAR01 | 核对全部角色、身份、关系、状态变化及 Character 实表 | 主角多身份正确关联；重要人物/组织关系、别名、成长与后期状态覆盖；无错误合并、重复、关系方向或时期错误；全部原生字段与关系 ID 正确 | Character/relationships、逐条证据与跨卷独审 |
| LOTM-L-ITEM01 | 核对全部重要物品、封印物及 Item 实表 | 名称、归属/流转、能力与限制有原文依据；不只列名称，不混淆时期或虚构能力 | Item 行、完整字段、逐条证据 |
| LOTM-L-SCENE01 | 核对全部主要地点与 Scene 实表面板 | 城市、据点、后期地点覆盖；父子层级和坐标字段正确；地点不混入人物、事件或世界规则 | Scene 树、源章与面板 |
| LOTM-L-WORLD01 | 核对 World 容器与世界观总体归属 | 独立世界/层次关系正确；同一世界的规则不错建为多个并列 World；容器描述有依据且全部可投影 | World 树、全部产物与原生面板 |
| LOTM-L-WORLD02 | 核对 LEVEL_SYSTEM | 22 条途径、序列层级、晋升/扮演/仪式及能力限制按原文结构化；路径与节点不串位、不造缺级 | Setting 原生 LEVEL_SYSTEM 树、逐节点证据 |
| LOTM-L-WORLD03 | 核对 POWER_SYSTEM | 非凡特性、灵性、污染、失控等力量规则与 LEVEL_SYSTEM 不重复错分；内容和适用时期正确 | Setting 原生 POWER_SYSTEM、逐条证据 |
| LOTM-L-WORLD04 | 核对 CONCEPT | 关键术语及解释准确；概念名与解释一一对应，未知/有限认知保留归属 | Setting 原生 CONCEPT、逐项证据 |
| LOTM-L-WORLD05 | 核对 FACTION | 教会、隐秘组织、国家/势力及关系、立场、时期正确；势力 ID/名称/关系无错配 | Setting 原生 FACTION、逐项证据 |
| LOTM-L-WORLD06 | 核对 MAP | 地图及层级、区域关系正确；MAP parentId 仅指同世界 MAP，worldId 正确，不用普通地点树替代 | Setting 原生 MAP、父级与世界引用 |
| LOTM-L-WORLD07 | 核对 SOCIETY | 社会制度、阶层、货币/经济与政治结构有依据；不把文化习俗或组织列表重复错分 | Setting 原生 SOCIETY、逐条证据 |
| LOTM-L-WORLD08 | 核对 CULTURE | 语言、宗教习俗、节日、饮食与生活方式等有依据，保留地区/时代差异 | Setting 原生 CULTURE、逐条证据 |
| LOTM-L-WORLD09 | 核对 GEOGRAPHY | 大陆、海洋、国家、区域及地理关系有依据；与 Scene/MAP 分类及引用不混 | Setting 原生 GEOGRAPHY、逐条证据 |
| LOTM-L-WORLD10 | 核对 WORLD_HISTORY | 各纪元、历史事件、传说与真实披露的可靠性/归属/时期正确；不把角色传说无条件写成客观史 | Setting 原生 WORLD_HISTORY、逐条证据 |
| LOTM-L-FORE01 | 核对伏笔产物的埋设—发展—回收及 Foreshadow 实表 | 关键线索、披露顺序、关联人物/事件正确；未回收与推测不写成已证实回收；setup/payoff 与源章一致 | Foreshadow 行、首现/回收位置、逐项独审 |
| LOTM-L-TROPE01 | 核对爽点和泪点及 Trope 实表面板 | SATISFACTION 与 TEAR 两类分别存在且非空；具体叙事作用、人物/事件和情绪类型正确，不把主题或任意场景冒充情绪点；每行 category/content/referenceCase/selected 与最终检查点及发布合同精确对应，无额外行 | Trope 两类整行、完整证据与面板 |
| LOTM-L-WLINE01 | 核对世界事件顺序及 PlanningDocument worlds/events | 八卷与番外事件覆盖；人物、父子事件、时间与因果正确；未知时间不造日期；可靠性、归属与世界时间顺序明确 | PlanningDocument 原生行、事件 refs、逐章独审 |
| LOTM-L-NARR01 | 核对叙事披露、章节、叙述者与事件 refs | 叙事顺序独立于世界时间；chapterIndex 为全书索引（含番外章）；refs 指向正确世界事件；倒叙/提及/回忆、限知视角和伏笔揭露不混淆；空 refs 不算完整 | cards/tellings/refs、逐章对照与面板 |
| LOTM-L-REVIEW01 | 检查最终会话及完整复核状态 | 11 类 coverage 与当前正文单元精确相等；review/reviewFacts 与预期键相等；notFound=[]；11 类均有可投影产物；semanticState ready、hash 绑定、repairs/omissions 全完成、冲突全解决；单次 completed | 最终 checkpoint、覆盖集合、语义状态审计 |
| LOTM-L-PERSIST01 | 正常关闭后只读审计本次作品数据库，再正常重开 | 发布及关闭时，session、最终构建、关闭所属 launch、作品和回执相互绑定；单次 ContentVersion/ContentMutation；正文和 11 类实表与最终检查点一致；原库、原件、基线未被审计修改。重开必须使用新的 launchId/PID，但打开同一 session 对应的 workId/novelId、同一回执和最终数据；如中间重建则另记构建身份 | 两次生命周期身份、进程退出证据、scratch READ ONLY SQL、原树 hash、重开截图 |
| LOTM-L-AUD01 | 在真实结果审计前，以本任务合成负例验证审计器 | 缺/重/换序章、番外并章、第八卷占位、乱码被改、缺任一世界子设定、Theme/Trope 空表、notFound、错误 refs、篡改原库均必须失败；正例才可通过 | 定向 RED/GREEN 命令及退出码 |
| LOTM-L-HEAL01 | 每次真实失败执行自愈并回到同一指定整书复测 | 原始失败保留；区分来源/模型/产品/工具；最小方案与用例独审→RED→修复→GREEN→代码独审；不得为转绿降低或把预期改写成实际结果；若独立证据证明基线/审计器有误，保留旧版、记录原因并重新独审后修正；不关补全、不换短书/来源；最终重跑所有受影响用例 | 每轮方案、失败/修复 diff、命令退出码、真实复测 |

## 语义充分性与最终判定

事前最低语义清单须覆盖每卷、番外、11 类目标、九类世界子设定和两种情绪点，但它只是最低门槛。所有生成事实须逐条回查原文，并形成覆盖 1394 个主线章和 8 个番外的逐单元独立审核台账，记录已核对范围、关联产物、发现遗漏及修订后复核状态；引文命中、字段可解析、类别非空、模型自评、coverage 或 completed 各自都只是局部证据。

最终 PASS 要求本文全部用例通过。若来源本身限制权威文本认证，只能限定结论为“对指定 TXT 保真”，不得扩大；若任何必需目标、真实流程或独立语义核验未完成，总结必须明确 FAIL/BLOCKED/NOT RUN，不能以局部进展宣称验收通过。
