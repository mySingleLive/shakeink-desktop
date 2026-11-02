# 场景保留现值后的复核路径草案

2026-11-01。**仅为离线优化草案，未批准实施；不阻塞当前R27真实完整验证。** 产品/测试/构建均不改。待R27实际后置结果决定是否推进；318独审通过后才审核319用例，另经RED/GREEN、代码独审及新构建验证，不把本草案计为已修复。

## 已有证据与适用边界

对指定R23不可变快照做了两次纯内存precommit预检。81个pending中，52项同时满足当前完整字段值、已存完整artifact版本hash及精确原文证据。第一项合法保留source：当前field、artifact全部facts和text逐字未变，仅证据与sourceUnitIds从8项增至9项；原semanticRelated扩至848个场景、涉及2292个证据单元，原semanticRepairs生成9875个范围/任务，距10000任务上限余125。最大每任务9单元/9000字符，原证据字符预算40960仍余31960，故该样本的任务数量不能归因为证据包已满。

首轮预算遍历经主代理要求停止，日志仅确认**至少2700/9875**通过，不知道终止瞬间的精确数量，不声称全量预算通过。以第一候选clone再保留另一来源，原容量门仍通过并同为848/9875；只额外检查了一个预算样本。两次均在owner回写前截停，实际决定、模型、网络、save/publish/launch均为0，原快照/owner及文件hash不变。标量证据只存私有0600文件`/private/tmp/shakeink-scene-import-20261031/r23-source-preserving-decision-geometry-preflight-private.json`。

这是旧R23资料形态的几何证据，不是新profile或R27已发生错误的证明。该旧快照还有25项unfinished omissions，不能直接充当下述保守分支的适用正控；不得为制造适用性删掉这些记录。

## 原规格与语义风险

`docs/novel-import/02-product.md` NI-06要求决定绑定当前版本、保留原设定须给解释/证据、解释能消除矛盾才通过，并重新检查受影响内容；NI-05要求全部选中来源覆盖和未决冲突阻断完成。向导产品亦要求作者决定后重新校验。省去generative规划不能等于省去这些检查。

保留现有字段并不保证作者解释没有其它含义。解释可能澄清时间/信息归属，也可能要求改另一实体、关系、字段或正文。后者不能被本分支宣称已执行；仍需原显式修改/作者决定流程。完整review必须继续读取全部决定与解释，报告仍存在的矛盾/遗漏，持续问题依原门阻断保存。

另有两项需保守处理：未完成repair/omission是既存工作，不能靠“以后也许重新发现”当作已保留；source-source选A若候选指向另一活跃inferred artifact，也可能要求调整B，即使A本身没改。草案据此进一步收窄，而非默认为所有source/a均可省略规划。

## 候选实现范围（待独审）

只考虑普通向导校验页的作者冲突决定：wizardVersion=1、semanticVersion=1、targets恰为scene、infer/原needsAi有效，当前处于verify的正常待作者冲突状态，非失败/未完成校验页。source artifact须为inferred scene且schema=2；type为setting-body且合法source，或满足下一条保守限制的source-source合法a。

- 原模型快照授权、当前source.value及完整版本hash、原文证据、合法field/native/引用、决定解释与业务校验均先原样执行。选择后的id/kind/name/schema/origin、完整text及全部facts必须与当前artifact逐值相同；不trim或Unicode归一化，不以只比较选中字段掩盖其它变化。原证据合并/sourceUnitIds仍保留，不能删除新增引用。
- source-source/a仅在candidate没有指向另一当前活跃、独立待修订artifact时讨论适用；另一实体可能受影响时保持原规划。若独审认为该语义仍不充分，第一版只做setting-body/source，a维持旧路径。不得自动把B视为已失效或删除B。
- previous.repairs不得存在uncommitted任务；建议同时要求无unfinished omissions、无persistent/blocked语义问题。否则沿原路径，不迁移/清除/伪造完成既存工作。已完成记录是否可忽略仍依原state重建语义，不能为了命中该分支改写previous。
- 仅省去这次新建的semanticRelated/semanticRepairs generative规划；不新增默认推断、模型变更、重试或预算豁免。所有真实inferred/b/merge、字段发生变化、非scene/旧协议/body-body、作者正文修改、来源artifact或其它不满足项均保持原路径。

守门位置应在原clone和全部原native/引用校验之后，用旧artifact与next业务数据作精确判断；不能提前以action名直接return。保存selected conflict的原resolution/解释/decisions、合并证据、更新原作者锁定值、原epoch与原持久化/原子性流程全部保留。其它pending conflict不自动解决，仍等待作者。

## 完整复核必须保留

继续清空coverage.review与reviewFacts，删除旧verified/ready credit，按原state规则进入repair→完整review。该受限分支没有待生成任务时，原repair阶段可以为空，但不能直接ready/publish。最后一项决定后仍沿原workflow/runVerify重新覆盖全部body/source与全部冻结fact任务、读取新解释与锁定、检查引用/知识/版本和持续冲突，再由正常保存按钮发布。

若新review发现真实字段变化或遗漏，进入原修订/作者处理及容量预算门；不得为了维持“无生成”而丢掉它们。已有pending repair/omission不命中本分支；因此不能用旧R23包含25未决遗漏的快照演示“9875直接变0且全部工作保留”。

## 后续准入与当前安排

当前优先完成R27，不为尚未出现的本轮问题扩大产品scope。本草案只记录可离线证明的旧成本及安全边界。若决定实施，先独审318及319，构造无既存未完成工作、合法且真实保留现值的合成正控，验证未发生generative调用但完整新review与全部原门真实执行；再核所有旧路径和失败原子性，独立代码审核后按新构建身份做真实验收。

不提高10000/64MiB容量、模型/预算、7分钟场景门或完整导入标准。9875旧几何、局部2700预算下界、mock或本草案均不是R27全流程通过证据。
