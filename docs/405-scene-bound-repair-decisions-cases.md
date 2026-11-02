# 应用绑定修复决定：最小用例

前置：404主体及good-row入链窄增量已按序独审通过；当前tuple显示增量由方案先复核，再复核本用例。仅合成资料，先本用例独审再测试/产品实现。建议新增 `tests/unit/novel-import-scene-roster-bound-decisions.test.ts`，复用真实SDK/当前CP合成fixture；纯组合/预算如需独立文件先报确切名称。旧 replace/helper/负控不通过删断言迁就新协议。表中“成功”仅合成验证，不是供应商或全书通过。

| ID | 固定夹具/动作 | 必须断言与证据边界 |
| --- | --- | --- |
| BD01 位置绑定真实入口 | 首代一个已证good row、一个有两项未证claim的patch row、一个legacy/无patch row；真实generateJSON→SDK Mock V4第二代返回新answers | 首RED应到实际generation/新根尚不支持，不能只module missing。app构造任务按stable slot→mention.index→context.index→link.index，reply不需rr/pc/CF/row/mode；可被原fullgate接受的精确原窗口/owner/全部context与links完整保留。当前活动修复提示首选answers，旧唯一repairs不能在数据块外同时当活动要求；Native字段只是传输形状，不冒硬保证。 |
| BD02 闭合根与权限 | 对BD01逐一改少项、多项、错类型、0、负数、小数、越界、own undefined/额外键、混合answers+repairs；交换不同类型任务答案；旧repairs另走原完整合法样例与坏refs/错行patch/空claims | 新根拒绝不切回旧根，不夹范围、不重排补项；没有未知pc/CF可作为新根输入。旧根3disposition及replacement3branch的原语义不变，旧坏输入仍拒。原row.canReject=true只有一个replacement任务，0还须boundCanReject=true；row不可拒、claim/group及漏答均不能用0或空数组代替。 |
| BD03 单项候选与完整绑定 | 两包相同文字但来源id/hash/geometry不同，含同literal两个occurrence及旧proof；新任务选本地1-based号 | 解码恰等当前私表原CF/完整Anchor，非source索引/非字符坐标；不会选首、模糊找词、接受另一包缓存。patch候选完整等原eligible顺序，列表外/old-mention/old-context不可能通过新任务号编译成相应候选；原旧窗口、身份组和知识归属不变。显式合法候选仍由模型选择，单项合法不证明全事务成功。 |
| BD04 同组联合选择 | 同一context组2未证positions、一个共同eligible窗口、均可reject；另有固定已证窗口；再加多CF resolve、部分已证link组 | 新表完整含各合法明确resolve/reject组合，但不含重复Anchor/与固定基底重复的组合。多CF非空子集完整表达；原已证组件不能reject。选择方案编译回每个原位置决定，不事后dedup/贪心分配/填默认答案。用现R47 e61结构的合成变体证明只消除该组原因；加独立后置坏项仍拒，不声称整包已过。 |
| BD05 编译阈值/整行fallback | 一context claim、8个有据可选窗口（含reject共256组合）；再9个窗口。受控纯组合夹具分别逼近每行4096/每请求65536步，包含非法分支/partial扩展 | 256完整可列；出现第257个合法方案、或计算上限前未证明完整时整行改为一个replacement任务，不能保留前N方案/部分claim任务。每次partial/subset扩展及校验前计数，非法分支也计；不先分配巨大笛卡尔积。受控predicate仅证明计数，不能冒来源验证。阈值是编译退路，不称旧资料超模型预算，不抬任何原门。 |
| BD06 fallback表达完整性 | preferred但无法完整分类、未知/坏shape、重复歧义、legacy name/aliases、primary、组合退路分别造行；new literal/label/link、多CF证据组 | 应用固定该行replacement，不允许从另一行借patch。三种严格replacement逐字段能对应旧合法集合（name/aliases、primary和三数组）；仅evidence choice号精确映射CF。坏显式metadata/mixed/undefined不投影洗白。所有原requiredSpellings、source-present零proof及跨相邻unit保守不能reject仍执行；有资格整行reject需显式0；无候选且不能reject明确失败，不清行。 |
| BD07 原门等价/跨项安全 | 小完整域穷举比对提取前/后原group predicate；跨任务newMembers重复、跨row共享新occurrence桥接旧owner、不同字段保留、dangling/rejected链接、旧raw坏值 | 原apply接受/拒绝集合不变；编译与apply共用同一组predicate，不能给其它claim造默认值再筛。局部选项成功后仍原全事务/strict/canonical/source/retention/owner/关系/授权/epoch gate；任何拒绝零adopt，不改首draft/source。明确加入e61结构合成反例：同组选择已局部合法，但原good row的link.targetIndex必指另一canReject candidate。新deck保留原canReject=true，boundCanReject=false及固定good-row-incoming-link原因，不展示/不接受0而保留完整replacement；旧repairs显式reject仍在原stable-slot remap拒绝，不得自动删link、改goodrow或补target。反控：入链来自可改bad row、仅名字相似或指其它slot时不伪造此限制，原bound0资格保持。首轮合法接受、root-envelope、unparsed-stop恢复、非stop立即、generic默认2/newscope最多4及usage/cancel原行为回归。 |
| BD08 实际字节与代次冻结 | 真实SDK捕获新任务/完整旧source/all choices/keep/draft/current/schema的二三四实际prompt，原CI16K临界及v1未知/0窗口 | 真实prompt N/N-1、fixed N/N+1含所有元数据和schema，超限此前调用数准确、不得裁剪或增额度。后续代次同deck/source/draft hash，当前完整失败reply替换历史、非累计；并发请求不共享绑定。旧root合法不因新root存在变更接受语义。root另对R46完整77回复（含be8 fixed回退）和R47完整59回复做0API新字节预算，130个first各计一次；新prompt不冒旧inputSHA或新provider成功。 |

必要低层证据：初轮/native/source字段黄金与旧scope保持；新reply编译结果需与**同一显式选择**对应的原typed事务深等（含legacy metadata），不能拿任意可过结果代替。原SDK实际body仍使用同能力工厂/角色、thinking-off、原输出cap，四代之外不发网；不因Native不可靠放松本地门。

拟分工接口只供实现收敛：新纯helper创建冻结tasks和私有本地号映射、严格解码answers成原typed replies；claim-patch等价提取共享group predicate，targeted-repair提供原slot/资格/基底句柄；service按独立根分支后统一进入原apply/final，native仅切换活动第二阶段的首选shape。没有main/shared/ledger或新用户动作。本用例审准不等于这些接口已写成产品，需TDD及406独审后再真实验证。

BD09（tuple显示增量）：先新显示真实入口RED，验证固定8列而不是测试私造tuple。以真实choices工厂生成有sourceRef/无sourceRef、wholeUnit/preserved四种组合、空/多literal、长Unicode/CRLF完整窗口的目录，逐项展开后与原完整CompactChoice深等，号恰index+1、顺序及数量完全相同，原entries/resolve/hash不变。真实SDK的bound方案/完整replacement与旧object目录在同一明确选择下结果深等。原object reader兼容不删旧断言。

reader负控逐一为7/9列、错号/重号/乱序、混object与tuple、错CF/sourceRef/null、非法整数/负数/反序范围、flags=-1/4/小数、非字符串literal/错数组；一律拒绝，不修索引/省列/去重。空目录按原义为空，不引入伪选项。必要inline reader只适配表示，unknown/借用/源门/保留门等原负控动作不改。新增图例/目录完整纳入BD08实际预算；完整136历史回放才可宣称该预算回归关闭。
