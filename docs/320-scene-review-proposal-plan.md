# 场景复核候选完整性与引用提案草案

2026-11-01。仅技术草案，尚未独立审核；不据此编写用例、修改产品或执行作者决定。R27尚未发布，本方案不将局部复测通过记作完整导入通过，不迁改既有私有会话的冲突、遗漏或正文。

## 已证问题与未证问题

R27不可变首wave快照的33项内容审核中，已看到：正确的局部地理/比较关系纠正被写成很短的candidate.value，而现有字段还包含其它有据描述；引用字段候选使用地点名称、指向自身或指错独立实体；同一artifact/field有多条基于同一旧值的提案。当前 `semanticDecision` 对inferred/b直接以candidate.value替换整个字段，setting-body且有正文时的正常选择只有source/inferred/rewrite，没有merge。不能靠作者选短片段解决局部错误，也不能锁住明确错误的source或改小说来过验收。

另有同名不同地点的实体/别名混聚、不同时间/知识视角不真正互斥等内容问题。本方案只使提案的机械编码完整、可校验，不能证明模型的语义判断正确，也不能自动拆分实体或以唯一目录ID证明多个地点就是同一实体。这些内容仍须原复核和有据作者判断，不能为清空冲突而一律选任一侧。

R27通用机器错误仍未直接复现。对应77单元首包按原controller重建后，原service前门通过；当前接口单包复测一代stop，原main遗漏、冲突入队等后置门也通过。历史失败reply未持久化且缺历史payloadHash。因此不能把此次失败归因于遗漏baseHash，也不能把新复测称为历史出站逐字节重放。

已校正stale边界：`createImportSemanticState`不带旧conflictBases，后续 `semanticCheckpoint`会基于当前artifact重填。私有原 `semanticDecision` clone控制中，同artifact不同field连续两次source成功，虽证据并入使完整artifact hash变化，也未普遍stale；同field先inferred改值后，另一旧source仍被原固定版本门拒绝。不能从完整hash变化推断所有跨field提案都失效，也不需要全量旧hash重绑。

## 取舍与推荐范围

更小的替代是固定说明“candidate.value必须是修订后完整字段”，加引用类型/ID早校验。它能降低误用概率，改动少，但短片段本来就是合法字符串，不能机械证明其保留了其它事实；长度下限、跨度比例、输出/输入长度比均不能补这个证明。仅此替代不足以处理已证完整性问题。

推荐先做窄v2：普通scene-only review的setting-body提案，对完整可见的场景字段使用精确局部编辑，由应用编译完整candidate.value；引用字段使用显式typed引用，从冻结目录唯一解析，再走原门。原source/inferred界面、canonical alternative字段和作者决定流程保持。安全合并重复提案、遗漏索引是下面列出的后续有界部分；不要为尚未定稿的复杂rebase拖延这两个已证问题的方案审核，也不能据第一部分完成便声称同field重复问题已全部解决。

新能力须有应用设置的显式版本标识，例如 `sceneReviewProposalVersion:2`，并与既有纯scope共同成立：semanticVersion=1、phase=review、selectedTargets恰为scene、无conflict、无intent。模型不能自行开启、关闭或回退协议。该标识及静态指导参加完整序列化预算；旧会话/非scope没有标识时保留原合同，不能悄然用新解释重读历史raw值。具体接线位置在独审后确定，不把模型可填的JSON键当授权。

首范围限定实际source artifact为scene、字段属于其既有kind/schema合同。根conflict.kind/type/id/hash/status等仍由原base解析，不能因为目标是scene便强制把合法kind=body改掉。source-source的已有资料两侧绑定、纯body-body形式、作者conflict复核及其它目标不改。原RA证据早门范围、unitIndex编码和原末端定位集合保留。

## 完整字段的局部提案编译

v2 setting-body candidate保留解释text，可用严格编辑形式，例如 `{text, edits:[{quote,replacement}]}`。这是提案字段编辑，完全不同于正文patch；不得修改workingProse。仅接受明确规定的自身键，混入raw value、其它control键、undefined自身额外键或不合法分支均失败，不strip后接受。新增事实而字段当前完整为空时，优先使用既有遗漏/补全流程；不将空quote当作唯一命中，不为此自动补默认文本。

1. 先复用现有packet字段绑定表，从当前request的artifact及reviewProjection证明根field的完整值。facts须为本包完整原子字段；text须本包同ID一致投影无缺口覆盖全文。schema/身份、重叠内容、fullFactKeys及完整semanticHash一致；不能从磁盘owner或其它包补片外值。原source索引绑定和显式坏raw拒绝不回退。
2. 每个quote必须非空、逐字且在该完整字段内恰好命中一次。不能模糊、排版恢复、换同名实体、取首命中或改成另一字段。按UTF-16定位，但起止必须通过原安全边界规则；quote/replacement须完整Unicode，CRLF和前后空白原样保留。
3. 同提案各编辑按原base坐标计算，拒绝重叠、重复冲突及依赖先前replacement才能定位的编辑；验证全部通过后按倒序应用。replacement允许合法删除局部错误内容，不能把编辑范围外的任何字符改掉。完全no-op不应制造真实冲突，应固定反馈要求核对提案，而非伪造互斥。
4. 应用得到完整字符串，编译为原canonical candidate.value；candidate.text保留理由，原引用/evidence和其它根字段保留。不得trim、截断、仅保留首编辑或首证据。模型无需复制剩余整字段，应用逐字保留编辑范围之外的全部内容。
5. 对编译值执行能在packet内证明的原类型、知识归属、引用及字段校验，再走原canonical/schema、service末端及main完整owner门。不能拿片段构造假的完整artifact以绕过原native校验；packet不够时拒绝/defer到原完整资料复核。

局部编辑只证明范围外内容未被机械丢失，不证明被替换区内的事实都应删除。模型仍可能给出错误quote/replacement或把整段当局部；不得用长度比例把它自动判为语义完整。作者仍看到完整修订候选，原有据解释及完整re-review继续判断其正确性。

## 引用字段的显式解析

parentId、sceneId、characterId、itemId按原字段目标kind分别处理。候选可用严格typed index引用，或显式typed name引用，例如 `{text, reference:{kind:'scene',name:'合成地点'}}`，不能把地点名塞进raw ID再由应用猜测修好。

- 目录冻结于当前request。索引必须安全整数、当前kind池内且范围有效；name须逐字匹配该kind的唯一规范名称。首阶段不通过别名/模糊/名称归一消歧，尤其不能使用已混聚别名把两个地点自动判为一处。同名多ID、同名跨kind、目录缺失均固定反馈；不能取首条或借全书未发送目录补ID。
- 解析后只恢复可信ID；保留原typed目标类型、父级PLACE要求、引用有效性、循环及知识归属门。明确自父级或无业务意义的自身关联提案不得悄悄采用；具体自关联拒绝范围须在独审时对照原native关系合同确认，不能顺手扩大其它协议的接受集合。
- 显式raw ID形式若保留兼容，必须原样通过已知ID/kind及原门；名称、错kind、自指或坏ID不能按typed-name规则回退。格式选择是显式的，错误raw不被规范化成成功结果。
- unknown/unset若提供，须为单独严格分支，并能够编译成原canonical后通过原native门。不能因“可选”就把空字符串、null、缺省或删除等价；若原inferred决定不能合法表达删除，则该分支保持拒绝/留待原补全修订，不改变native或作者决定来制造可接受的unset。

## 同base同field提案的安全聚合边界

既有 `main.addConflicts`按整个canonical hash去重；不同理由/证据造成hash不同，同字段多条候选可能在一次采纳后留下旧source。仅把旧conflictBases改成新hash不能修复旧source.value，禁止这样处理。

可以在该入口之前增加纯聚合器，但只处理应用确认来自v2编译的pending setting-body组。分组须同时满足：同source artifact、同field、同完整base semanticHash、同完整source.value、同工作版本/决定版本、同kind/type及有效证据。resolved历史和已决定记录不并入、不删除、不改写；不跨原始来源/作者锁定范围聚合。

严格可行的两类是：

- 编译后完整candidate.value完全相同：合成一个待作者选择的候选，保留每个成员的原ID/hash、理由与精确证据的来源记录；证据按unitId+quote去重，理由可在既有候选说明中完整呈现。不能只因为同实体/同字段就当等价。
- 同一完整base上的已定位编辑互不重叠，或重叠部分是严格相同操作：对全部编辑一次并集编译并重新验证完整候选。相邻/交叠不能靠字符串拼接或任选先后，冲突replacement、不同引用目标、不同base、模糊跨度均不合并。引用字段只有相同最终ID可视为等价。

聚合需要保留编译器产生的base/范围/成员provenance。若采用内部sidecar/ledger，须由应用生成并在main按当前完整owner重验，不能让模型声明“已验证”或仅凭canonical两个长字符串猜出原多处patch。ledger存储位置、严格类型、稳定group identity、成员hash与既有去重/已决定记录的关系，以及完整保留材料时的容量门，须先独审定稿。没有这些证明时不纳入首轮实现；不能无条件合并或暗中清掉旧pending。

同field互斥、歧义重叠和其它实体身份问题保留显式未解决状态，由原有据作者流程或另一个先审方案处理；本草案不把它们标resolved。跨field不做全量rebase：已验证的原state重建允许未改字段的合法后续source，仍逐项受原完整版本、source.value、native、授权门约束。

## 遗漏协议：可有界提前，不能冒认历史根因

当前service已经在末端检查missingTargets投影、目标、锁定、证据及unitIds覆盖，main还比较当前完整owner/baseHash。可先把同一request能证明的原纯门放入生成schema的superRefine，让明确错误进入既有两代JSON纠正；原末端函数继续执行，不将其移走。失败必须使用固定有限指导，不回显名称、原文、ID、hash、未知键或cause。

若后续独审认为值得，可给已有实体遗漏增加严格artifactIndex绑定形式，由应用从对应reviewProjection恢复artifactId与完整semanticHash；根field仍严格核验，text/事实完整性及原字段/锁定范围门不变。显式坏raw三元组必须拒绝，不回退索引修好；新实体遗漏保留旧形式，不把“缺省”伪作完整空字段。该扩展是降低opaque抄写与提前纠错的加固，当前没有证据证明它是R27历史通用失败根因，可与首轮提案修复分开审核实施。

## 不变项与后续顺序

完整units、资料、目录、投影、证据、锁定和已决定内容不裁剪；新增版本、引用元数据和静态指导全部进入原payload、UTF8固定说明/wrapper和实际role预算。沿用原模型/endpoint/thinking、输出cap、两代JSON纠错、外层原次数、网络策略、并发及7分钟场景门，不额外重试或接受length。author conflict、其它target和旧版本隔离；原semanticDecision版本比较、完整native映射、epoch/来源授权/取消和全部正文/冻结事实re-review保留。

建议先独审本草案并确定首阶段范围：局部提案编译、显式引用解析及必要的request早校验；同field聚合/遗漏索引是否同时进入，按上面的可证明边界单独决定。随后才写最小用例并独审、真实JSON/SDK桥RED、实现/GREEN、独立code review和受影响定向回归/类型/构建；最后当前配置接口及全新完整导入、全部复核、真实作者决定、正常发布/退出重开材料核验。既有R27内容建议仍是私有未执行草稿，不可作为自动作者批准，历史失败证据不覆盖。
