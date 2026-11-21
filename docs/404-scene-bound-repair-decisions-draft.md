# 应用绑定的场景修复决定（工程草案）

本稿仅方案，产品保持 R47 冻结，不运行 App/API。403 的四例实测表明当前接口收到 strict=true/schema 后仍可违反 enum/minItems/uniqueItems，不能把增加 Native 约束当作机器正确性保证。R47 同轮忠实回放还证明错行 patch、未知 claim、列表外 CF、同组重复真实发生；以下改变控制职责，不放宽来源或事后修正错误答案。

## 推荐最小结构

首轮及当前冻结草稿/根恢复状态不改。进入普通 scene roster 定点修复后，应用从原 plan 构造一次不可变、有序的 `tasks`。位置绑定原坏行、允许操作、问题位置及完整已证基底；模型无需返回 repairRef/claimRef/CF、路径、row slot 或 patch/replace 模式。新增独立严格根，例如 `{"answers":[2,{"mentions":[...],"context":[],"links":[]}]}`；每项按本次任务位置解码，数组数目必须完全一致。未知键、混合根、额外/遗漏答案、非安全整数、越界及错误任务类型全部拒绝，不猜相邻项或把错误数字夹进范围。

原严格 `{"repairs":[...]}` 各支继续显式兼容，语义与全部负控不变；按实际独立根分支校验，不是在新根解析失败后尝试洗白。Native 仅给新根作为优先生成形状，本地仍独立验证；不能依赖上游执行任一子约束。后续代次始终复用同一任务表/草稿，不能按坏答重建绑定。表的私有绑定包含当前请求、完整draft/source哈希；不得跨请求复用同号答案或缓存。

## 任务粒度、顺序和数字语义

先按原坏行 stable slot 升序。原 `row.canReject=true` 的行一律只有一个 replacement 任务，不同时给它 claim/group 任务。保留该原资格事实，另有应用绑定的 `boundCanReject`；仅当 `boundCanReject=true` 时答案可为显式 `0`（该整行原 reject），否则只能为完整严格 replacement 对象。其余行若可走 bound patch，依次列未证 mention（原 mention.index 升序）、context证据组（原 context.index 升序）、link证据组（原 link.index 升序）；proof位置由应用保留，不形成可改任务。同组内各 claim 按原 evidenceIndex 确定绑定。任何组不能完整编译时，该整行所有任务撤回为一个 replacement 任务，尚未发网前一次冻结；row.canReject=false 的 replacement 任务只允许对象，不允许0。

mention/group任务的数字始终为 `1..optionCount`，各编号对应明示的完整决定；其内部 reject 也是一个编号>=1的明确选项，不能用0影射整行或省略其它任务。唯一的0语义只存在于上述 `boundCanReject=true` 的 replacement 任务。答案数组必须覆盖冻结后全部任务，不能靠省项表达拒绝。

`boundCanReject` 的唯一新增静态限制：若**当前不可改 good row**（原逐行验证已过、按本事务必须原样保留）的某条link，其精确targetIndex就是本candidate原stable slot，则删除该candidate必在原remap失败。该新任务不展示/不接受0，保留完整replacement，固定原因 `good-row-incoming-link`；原canReject不变。不能根据可改bad row、名称近似、推测关系或任意模型字段作此判断。旧repairs的reject仍走原门并如实TR52拒绝，不修改goodrow、不删除链接或补目标；这不是自动采纳或强行保留该candidate的原坏内容。

## 有 patch 资格的行

应用保持原 proofs、literal/label、target/relation 和 owner，不让模型重抄。mention 任务只选择本项原 `eligibleChoiceRefs` 中的一个有据候选；显示本地 1-based 选择号，应用私表精确映射回原 CF。明确拒绝仅在原 canReject=true 时作为一个可见选项，绝不把空答/越界/候选为空解释成 reject。所有原候选与完整窗口仍保留，不自动选首。

同一个 context/link 证据组的未证位置不能继续作为互不关联的独立答案。为该小组列出**完整、明确的合法 assignment 选项**：每个原位置恰好 resolve 或原资格允许的 reject；每个 resolve 可表达原允许的非空候选集合；冻结来源子组件仍完整保留；组合需通过该组原来源、限定、旧事实冒用、重复完整 Anchor/关系组合门。模型只选择方案号，应用编译回各原 claim 的决定，再进入原 apply。不得用事后去重、贪心分配或默认 reject 制造合法方案。

例：R47 同组两个未证位置只有同一个合法窗口且均可 reject，非法的“两项都选该窗口”不进入选项；完整的该组局部候选方案显式区分“第一项 resolve/第二项 reject”“第一项 reject/第二项 resolve”“两项 reject”。选择权在模型，应用不替它决定哪项成立。已有证明的窗口不能作为可拒部分。root 的0 API同轮局部替换实验证明这三种选法消除该组首次重复原因后仍可被后续整事务门拒；不能据此称该包已通过，或把局部方案当全局保证。

选项只解决该组可独立证明的约束。跨 claim 的新 occurrence、跨行/新旧 owner 桥接、最终关系和完整事务仍必须执行原联合门；不能声称小表保证全局合法。组合法组合太多或不能完整证明/展示时，不截断方案或候选，该**整行**改走下述固定 replacement 任务。方案生成另外设明确计算保护：每组最多256个完整合法方案、每行最多4096个候选扩展步骤、每请求最多65536个步骤；一触及上限且尚未证明枚举完整，整行回固定 replacement，不取前N项。该原因是新编译保护，不伪称原资料超出模型预算，也不缩来源或旧replacement表达能力。展示仍须实际预算另验。计数与遍历顺序由冻结输入确定；每次partial候选、子集或笛卡尔积扩展及每次候选校验之前都先计步骤，非法分支同样计数，不能只数合法结果或分配无界组合后才检查。达到任一工作上限且尚未证明完整时整行fallback。

## 无 patch 资格及容量退路

每类行由应用在发网前冻结任务类型，模型不能借另一行的 patch 权限：

| 情况 | 明确处理 |
| --- | --- |
| preferred 三数组可完整分类且小组完整选项可容纳 | 上述绑定选择任务 |
| legacy name/aliases/primary、未知/坏形状、重复歧义、不能完整分类或原资格不成立 | 固定该原行的完整 replacement 任务 |
| 有 patch 资格但完整 assignment 不能在原预算/容量内表示 | 整行固定 replacement；全部原来源/候选/proofs 保留 |
| 原 row.canReject=true | 单replacement任务；显式0还须boundCanReject=true；有不可改good-row入链的静态必败0不展示/不接受，完整replacement保留 |
| 没有合法选择且也不能 reject | 只能明确失败或完整 replacement；不清行、不猜来源 |

replacement 答案沿用当前 `repairRecord` 的三个严格互斥 branch：完整 `{name,aliases,mentions,context,links}`、显式 `{primaryMentionIndex,mentions,context,links}`、或 `{mentions,context,links}`；不得把前两支投影为第三支。下面仅以第三支举例：`{"mentions":[{"literal":"…","evidence":{"choice":1}}],"context":[{"label":"…","evidence":[{"choice":2}]}],"links":[{"targetIndex":0,"relation":"parent","evidence":[{"choice":3}]}]}`，当前位置已绑定行/replace，不再携带控制 token。`choice` 仅是本任务明确显示的完整当前 CF 目录的本地 1-based 号；应用精确映射为原 choiceRef，不接受原文坐标或猜测。三个 branch 仅将 evidence 的严格 `{choiceRef}` 替换成严格 `{choice}` 后一一编译；name/aliases/primary 的显式值、未知键/own undefined/混合键以及所有原容量规则原样验证，不按失败结果自动选另一支。new literal/label/links、任意原合法多CF证据组均能逐项对应表达。这里仍需要模型给真正待修的语义文字/关系，不能由应用从坏 raw 推定。原 requiredSpellings、零证明 source-present、已证完整窗口/owner/context/双端关系保留、stable slot/dangling remap 与最终严格门全部照旧。replacement 不通过提取已知字段来接纳原坏行，不自动删未知字段后采用。

这项退路保留原 full replacement 的表达能力，而不是承诺所有坏行都能变成短整数。新路减少机械复制的主要收益限于可绑定问题；无法分类的语义仍可能被原门正确拒绝。用例必须实测该退路，不得只测全部 patch 正控。

## 不变的边界与准入

应用只编译已明确选择的决定；不直接采用首坏 raw、不拼未经核验结果。整个新 draft 必须通过原 wire/canonical、全部 source、retention（完整窗口）、owner、关系、授权/epoch/final 门后才采用；原正文、全部材料、候选、keep、原草稿及当前完整失败回复不裁。新展示可以省去 provider 不需复制的 rr/pc 冗余，但私绑定保留，语义数据不变。

原最多四代、非 stop 立即失败、网络/配额/角色/输出容量/并发/时限不变。新增任务表、完整方案、Native schema 和实际二至四 prompt 全部走原 fixed/schema/context 预算；没有新额度。需要重新执行原 CI 16K 临界、实际 prompt N/N-1 及R46完整77回复（含既有be8 fixed回退）及R47完整59回复驱动，130个first各计一次的的新字节预算回放，不能沿用旧 prompt SHA 或声称新供应商行为。

拟范围：新增纯 bound-decisions helper，targeted-repair 的独立编译入口、service 的严格根/实际提示、native 首选第二阶段 schema，新增独立 fixture/定向测试；main/shared/ledger/原接受门不变。404 独审后再写405用例/独审，随后TDD和406独审，root 才执行下一次正常全文。组局部 predicate 从原 apply 等价提取单项解析/来源限定，以及该组组装、完整Anchor重复和旧关系检查为同一纯函数，由原 apply 与选项编译共同调用；不能向其它claim填默认答案后调用full-apply来筛选本组。其余跨项/跨行联合门仍在原完整apply中执行。用例须证明提取前后旧接受/拒绝不变及无默认选择。本稿不宣称已实现或已验收。

## 已证预算回退的无损显示增量

root 的 R46全77/R47全59 历史回复驱动新prompt预算回放，V2仍在一个R46包第三代超过原fixed门；不能抬65536或裁任何来源/原草稿/当前回复/全部choices/keep。该包共享choices126项，仅重复字段键的tuple表示可节省约7KB；这只是0API字节实验，不是新供应商结果。

仅**provider-view**共享choices目录采用固定8列：`[choiceNumber,choiceRef,unitIndex,start,end,sourceRef|null,flags,literals]`。choiceNumber显式为本项原序index+1，供直接读号，不要求模型数行；所有原CF、窗口、顺序、sourceRef及literals逐值保留。flags位wholeUnit=1、preserved=2，只能0..3；原应用目录这两个字段为true或缺省，位关闭恢复缺省。sourceRef的null仅表示原缺省，不是空字符串。不得截断、排序、去重、合并条目，或混用object/tuple条目。完整原文本仍在原units，引用窗口绝不缩小。

私有entries/compactEntries/resolve及CF/hash计算不改，新响应仍只按原task本地号绑定，不接收tuple/坐标。旧object目录表示继续由测试reader按原义支持，tuple的reader须严格8列、连续1-based号、安全非负整数/合法start<end、CF/sourceRef形状、flags及字符串数组类型后无损展开；不能靠忽略列/未知flag修好夹具。provider视图不成为接纳模型输出的入口。只新增列图例，实际全部字节仍原schema/fixed/context门；修后必须重跑完整130first+R46全77/R47全59并保留先前预算失败记录。无其它协议、机器门或原始资料变化。
