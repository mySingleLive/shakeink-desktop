# 场景复核遗漏早校验用例草案（仅阶段A）

2026-11-01。依据主代理明确限定的320阶段A编写，**仅为用例草案**；等待阶段A方案独审通过后，由另一独立代理审核本用例，再开始测试编写及RED。当前不修改产品/测试，不执行App、API、作者决定或实际会话修订。

## 范围与已证边界

仅当`semanticVersion===1 && phase==='review' && selectedTargets`恰为`['scene']`、无`conflict`且无`intent`时，将**当前request可证明的既有missingTargets纯校验**加入原`generateImportAiJson`生成schema，让它参加既有最多两代JSON纠正。原`runImportAi`末端和main校验继续执行，接受集合不放宽。

阶段A不新增wire形式、版本标识、artifactIndex遗漏绑定或输入元数据，不涉及局部candidate编辑、typed引用、同field聚合、作者选择或旧会话迁改。完整owner是否仍存在、当前kind/origin及完整semanticHash是否仍匹配，只能由main在实际当前owner上核验；不能用packet通过代替该门，也不能为早校验发送磁盘完整owner或全书额外材料。

先前有界12类人工JSON审计的结果为：空/合法新遗漏/合法已有三元组三正控均经service及main通过；八类坏例通过JSON桥后被service末端拒绝；重复unitIds原本即在两代JSON内拒绝。**没有发现该真实request下“service最终接受而main拒绝”的案例。** 本组只针对已证的提前纠错缺口，不将人工坏例认定为R27历史失败reply；历史generic仍未直接复现。

## 全合成夹具

- 所有小说、单位、资料、名称和响应均新建合成值，不导入私有77单元request、R27快照、真实小说片段、模型配置或Key。
- 至少三个不同的合成unit，含非BMP字符、CRLF和有据的不同事实。普通review请求不设置analyze kind/entityTarget；使用合成text/review模型pin与原合法冻结预算，真实调用`runImportAi → generateImportAiJson → generateJSON`，只在既有`generateText`依赖返回预定JSON。resolve/assert均为受控合成依赖，usage只读，网络入口禁止；不通过“看到prompt关键词才成功”的伪模型响应。
- 一个合法scene/schema2完整owner，带完整业务facts、text、证据及PLACE身份。request中的完整/片段artifact与reviewProjection由原投影函数创建，fullFactKeys、semanticHash、字段范围均真实。三元组正控使用同kind、同完整版本、未锁定且本包完整可核验的字段。
- text不完整负例须由原完整owner产生真实部分textRange，保留完整长度/hash等元数据；不能用本身无效的projection或无关预算错误抢先拒绝。合法修正响应改报本包确实完整可核验的facts字段，不靠返回空数组、丢条目或补片外值通过。
- unitIds、artifactId、坏hash、非法field值、名称和原文放入不同合成canary，供新增纠错段不回显断言使用。断言失败不得把完整资料值输出为公开证据。

## EM01：八类原late-invalid进入原第二代纠正

每行分别执行“首bad→第二good”和“持续bad”两个预定序列；其余字段必须合法，确保目标失败不是基础JSON、请求、授权、预算或原证据锚点先挡住。

| 类别 | 唯一目标错误 | 旧service末端拒绝依据 |
|---|---|---|
| 选中范围外kind | kind仍为合法枚举，但不在selectedTargets；合法unit及证据 | 遗漏目标或来源范围无效 |
| 未知unitIds | 声明一个本包外unitId，证据仍引用本包合法unit | 遗漏目标或来源范围无效 |
| 已有实体错baseHash | 完整三元组、合法64位hash格式，但与可信投影不等 | 已有实体遗漏目标、版本、字段或锁定范围无效 |
| 未知artifactId | 三元组齐全，但artifactId不在本包 | 已有实体遗漏目标、版本、字段或锁定范围无效 |
| 非法field | artifact/hash合法，field是合同外非空字符串 | 已有实体遗漏目标、版本、字段或锁定范围无效 |
| 证据未覆盖声明单位 | unitIds含A/B，证据只含合法A | 遗漏目标证据未完整覆盖来源范围 |
| 证据含多余单位 | unitIds仅A，证据含合法A/B | 遗漏目标证据未完整覆盖来源范围 |
| 已有text未完整提供 | 三元组/hash合法，但本包只有原text的一部分 | 已有实体遗漏文字未完整提供，片外内容不能判缺 |

每行要求：

1. RED先记录旧JSON桥确实接受首bad，原service最终以对应固定类拒绝且仅产生一代；新期望“第二代纠正后成功”因此实际失败。持续bad的旧行为虽也拒绝，但须区分旧末端普通Error/一代与新`StructuredGenerationError(kind='invalid_schema')`/两代，不能把任意reject当目标通过。
2. GREEN首bad→good恰两次生成，第二次实际包含固定纠错段，经原service末端及main纯后置到达与独立合法响应相同的canonical/遗漏入队结果。输入request、预定response、资料/正文和证据不被原地修改。
3. 持续bad恰两次生成后structured拒绝，无第三代、额外外层review重试或任何成功credit；不是过滤坏missingTargets项后返回成功。至少一行使用“合法/坏/合法”数组，持续坏时整包拒绝，修正时完整保留前后合法项及全部证据。
4. 新增issue只定位已知结构字段/数组位置。反馈仅用固定有限说明，原单issue消息不超过250 code units，实际纠错段完整保留说明；不把未知field值/键、ID、hash、名称、quote、正文、reason或cause拼入路径或文字。
5. canary检查针对**新增纠错段**，不是错误地要求原完整prompt/payload不含其合法输入数据。固定指导可说明字段/范围，不能通过回显坏值定位。第一代原prompt和完整payload保持原字节。

本组不要求模型真的推断出正确遗漏；bad/good均为预定合成响应，只证明原两代机制能纠正已经存在的机械校验错误。

## EM02：原12类中的正控、原有拒绝和证据接受集合

- 空`conflicts:[]/missingTargets:[]`、合法新scene遗漏、合法已有三元组三正控各一代成功，与独立原canonical预期逐值一致；原unitId、reason、三元组、证据及其它字段不重写。
- 重复unitIds保留原uniqueIds拒绝：持续重复原本即最多两代invalid_schema；首重复→合法仍为原第二代恢复。不得以去重、trim或丢单位把显式坏值变成合法输入。
- 正控同时覆盖raw`{unitId,quote}`和既有`{unitIndex}`。全部声明unit都有证据，全部证据属于声明unit；多项证据、中间项、Unicode/CRLF及原Han排版恢复接受集合保持。unitIndex仍只还原当前包完整text，不跨包、不新增编码。
- 对原可恢复的raw排版差异，只在校验副本上验证，生成schema不能提前trim/归一化输出；原末端仍负责现有定位还原。最终canonical逐项匹配原合法结果，引用不取首项或少项。
- 原RA/UR证据及严格wire组继续回归，不能因阶段Ahelper捕获异常而把坏锚点、未知/混合index形式变为成功。

## EM03：末端及main完整owner版本门必须保留

- 同一合法已有遗漏经生成桥及原service末端后，在纯main clone上运行原`semanticMissing/addConflicts/semanticQueueMissing`，合法当前owner正控通过；不运行save/commit或模型，不修改真实owner。
- 另造全合成的“当前owner已变化”控制：service所见request/projection仍合法，main收到的当前完整owner有新字段值/新semanticHash，并具有符合原合同的当前语义state。应实际到达并被原固定“已有实体遗漏与完整设定版本不匹配”拒绝；不能被无关inputHash/锁定错误提前挡住后冒称版本门覆盖。
- 这个stale控制不应要求生成schema预测尚未发生的owner变化，也不应自动重绑baseHash、重写投影或调用模型重试。完整owner门不可搬到bounded request，原main仍最终决定能否给credit。
- 通过源码接线及至少一个受控末端负例证明service最终纯门仍执行，main的完整版本、当前来源/epoch/模型授权、锁定与候选原子提交门不被早schema代替；不为证明保留而在产品增加“绕过早校验”选项。

## EM04：精确scope、完整预算和原通道

- author conflict复核、非scene目标、组合目标、旧semantic/缺版本保持原生成合同、prompt/payload和晚校验行为。选用本来合法的原request作对照，不能让请求阶段/缺依赖先失败来冒称隔离；不要求所有旧路径对坏missingTargets具有同一种接受行为。
- 至少对author及非scene普通review保留一个“旧桥可解析、旧末端拒绝”的坏范围控制，仍为旧流程的一代晚拒绝，而非被阶段A偷偷赋予新两代纠正。旧协议用原支持的合法响应及既有raw/证据负例对照，不强塞其本来不支持的missingTargets作scope正控。
- 复用原真实review pin、完整单位/资料/目录/投影/证据/锁定/已确认决定；冻结第一代prompt/payload字节或与可信改前黄金比较。没有新元数据、删材料、扩大profile、借text容量、换model/endpoint/thinking/cap/并发或提高7分钟门。
- 新固定反馈仍计原JSON wrapper/纠错reserve，不豁免字节；原完整payload/单位/固定说明/实际role预算负例在生成前拒绝且调用0次。恢复用例的第二代含完整原材料，不为装入反馈而裁剪来源。
- 复用既有length/JSON、网络/授权/abort、原有限生成及预算组，保持原错误身份与次数；不把transport/取消变成schema重试，不记录模拟用量为真实供应商调用。

## 证据与执行顺序

本文件未编写或运行任何测试。320阶段A独审通过→另一代理独审本用例→合成真实桥RED→最小实现/GREEN→独立code review→受影响引用/投影/语义/预算/runtime/发布回归及类型/构建→经明确身份的后续实际接口/完整新会话验证。

记录实际RED到达的断言与代数；后置未达项不得回填为失败或通过。原12类人工审计只作为选例依据，R27真实通用失败仍未知，既有request、owner、冲突/遗漏及私有证据保持原样。阶段A合成通过也不等于提案语义正确、作者已批准或全文发布/重开成功。
