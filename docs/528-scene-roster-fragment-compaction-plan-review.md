# 528 场景清单片段压缩方案 · 独立审核

审核对象：`docs/528-scene-roster-fragment-compaction-plan.md`（A 方案）。对照代码：`desktop/core/novel-import-scene-roster-fragments.ts`、`novel-import-scene-roster-native.ts`、`novel-import-ai-payload.ts`、`desktop/service/novel-import-ai.ts`、`novel-import-scene-roster-repair-choices.ts`、`novel-import-scene-roster-control-focus.ts`、`novel-import-scene-roster-bound-decisions.ts`、`desktop/main/novel-import.ts`、`desktop/core/novel-import-budget-policy.ts`、`desktop/core/novel-import.ts`、相关单元测试与金样脚本。

结论：**修改后通过**。A 方向可行，现有 ref 链路是“目录同源 + resolve 查表”，不解析 ref 的长度或结构，缩短 ref、换线上编码不会让 resolve 或修复链路整体失效。但方案没有说明布局怎样从会话传到请求、服务端和原生 schema；对唯一性检查位置的描述与代码不符；8 位 ref 在实际包大小下碰撞概率不可忽略；方案还漏了一个直接影响验收的副作用（压缩后分批变大）。下列高项须先改方案。

## 高

1. **布局无法只靠会话字段生效，必须进入请求。** 现在每个环节都只按请求判定片段目录：`sceneRosterFragmentRequest(request)`（fragments.ts:10）、载荷投影（ai-payload.ts:39）、服务端建表与 zod（service:90-92）、原生 schema（native.ts:22-27，只看 request 和 phase，返回静态 `firstSchema`）、预算检查 `requestFits`/`assertSceneRosterNativeBudget`（main:1728-1733，native.ts:28-36）。服务端拿不到 `ImportSession`。方案须写明请求携带方式，例如在 `ImportAiRequest` 加一个顶层字段 `sceneFragmentLayout?:'compact-v1'`，并且：
   - 不放进 `sceneIdentity`：`{version:1,mode:'roster'}` 是 strict schema（shared/novel-import-scene-identity.ts:60），改它会牵动所有 `mode:'roster'` 判定和金样；
   - 主进程像 sharedSource 那样做一致性断言：请求带该字段时会话必须已开启（参照 main:1801）；会话已开启时 scene roster 请求必须带上；
   - 服务端只在 `sceneRosterFragmentRequest` 为真时接受该字段，其它阶段带了就拒绝；
   - 字段计入请求快照，并检查请求轨迹金样（`tests/fixtures/novel-import-request-trace.json`）在旧会话下逐字节不变。

2. **“每单元内唯一性已由 `unitFragments` 检查”与代码不符，回退机制也没设计。** `unitFragments`（fragments.ts:30-36）不做重复检查。检查在 `sceneRosterFragmentUnits` 里，范围是整个包，命中时直接 `throw Error('场景片段引用重复…')`（fragments.ts:39-41），没有任何回退。修复目录也会按整包再查一遍重复（repair-choices.ts:30 的 `seenFragments`）。“冲突时整表回退旧 16 位”要落地，须明确：
   - 判定单位是包。同一组 units 必须得到同一结论，载荷（ai-payload.ts:39）、服务端建表（service:91）、控制焦点验证器（control-focus.ts:45，它会独立调用 `createSceneRosterFragmentTable(input.units)`）、修复目录、原生 schema 五处结论一致；
   - 实际用的位宽（8 或 16）由建表函数返回，其余各处从这个结果取，不各自重算；
   - `fragmentMemo` 的键（fragments.ts:31）要包含位宽或布局，否则两种 ref 会互相命中缓存；
   - 原生 schema 的 `ef` 模式按“本包实际位宽”生成，而不只看“布局”。方案 §2 写“随布局二选一”，一旦回退到 16 位，按布局生成的 8 位模式会拒绝所有合法 ref。

3. **8 位（32 bit）在真实包大小下不够稳。** 方案按 40 单元、4,641 片估算，碰撞概率约 n²/2³³ ≈ 0.25%。但 v2 预算下 `characters` 最高 120,000（budget-policy.ts:16），当前包大小受 `payload.length ≤ characters×3` 限制（main:1731、ai-payload.ts:45）。载荷/正文从 7.1 降到 3.06 后，单包正文可从约 5 万字涨到接近 12 万字，按 8.4 字/片约 1.4 万片，单包碰撞概率约 2.3%；一卷几十个包，累计触发回退的概率是两位数百分比。回退机制会被经常走到，不能当成极少发生的路径。建议：
   - 改用 10 或 12 位 hex（40/48 bit；1.4 万片时碰撞概率约 9×10⁻⁵ 或 3.5×10⁻⁷），每片只多 2-4 字符，载荷比约从 3.06 升到 3.2-3.3；
   - 或保留 8 位，冲突时只对冲突片用确定性的加盐再哈希。这样同长度、可复现，原生 schema 只需一种模式；
   - 无论选哪种，单元测试都要构造真实冲突（可注入摘要函数），覆盖回退后的五处一致性。

4. **漏了主要副作用：压缩会改变分批。** 由于上面的 3 倍载荷上限，压缩后同一预算能装进约 2.3 倍正文。场景 roster 调用数会从约 41 次（docs/525:12）大幅下降，单次输出相应变长。这会带来：
   - `maxOutputTokens=32768`（service:702-703）可能截断，非 stop 代次增加；
   - 单包 roster 有 2000 条上限（service:92）；
   - 单包失败时折半重试的代价变大（main:738-746）；
   - 并发度对总耗时的作用改变（main:157）。

   同时，“场景条目数 ±10%”和“折算费用 −40%”会把“编码变化”和“分批变化”两个变量混在一起。方案须二选一并写清：(a) 新布局另设单包正文上限，保持与旧布局同等分批，只验证编码；(b) 接受新分批，把输出长度、截断率、单包条目数列入验收。离线测量（§3.2）也要按真实分批计划算全部包，而不只是前 40 单元。

## 中

5. **去掉 `index` 只能在线上投影做，内部类型保留。** `createSceneRosterRepairChoices` 要求 `at===part.index`（repair-choices.ts:30）。多处测试也直接读 `fragments[j].index`/`.ref`（例如 opaque-reference.test.ts:38-41、fragments.test.ts:78、correction.test.ts:79-82）。方案应写明：`SceneRosterFragmentTable.units` 的内部结构（`{index,text,ref}`）不变，只在 ai-payload.ts:39 序列化时投影为 `[text,ref]`。否则修复目录、控制焦点和测试夹具都要改，影响面会远大于方案估计。

6. **元组编码与现有提示词冲突，跨片备选会变成“数位置”。** 首轮契约（ai-payload.ts:82）写的是“逐字复制当前目录 fragment.ref”，以及“`{unitIndex,fromFragment,toFragment}` 只取当前目录显式编号”。纠错文案也依赖“显示的编号/目录”：service:96、132、237、238、249、251、254、258、259。去掉 `index` 后：
   - 元组里没有名为 `ref` 的字段，“fragment.ref”失去所指，需要说明“fragments 每项为 [原文, ref]，ref 为第 2 个元素”；
   - 跨片范围备选不再有显式编号，模型只能数数组位置。这正是 B 方案被判为高风险的行为，A 在“单片重复、literal 跨片”时也会碰到。方案“模型行为最接近现状”的说法须收窄，并在验收里单列 span 备选的使用次数和失败率；
   - 新文案必须条件拼接（仅 compact 请求），旧常量不动，否则破坏 `tests/fixtures/novel-import-prompt-golden.json`（已含 `analyze/roster/scene` 用例）。纠错文案多为常量，service:807 还按常量全等（`message===SCENE_ROSTER_INDEX_QUOTE_GUIDANCE`）给错误分类，换文案时要同步。
   - 建议同时评估“保留 index、只去对象键”的 `[index,text,ref]` 三元组。它只比二元组多约 1.2 万片×(位数+1) 字符，但能保住显式编号。

7. **门控可沿用 526 的流程，但不应复用 `promptLayout` 的值。** `promptLayout` 是单值枚举 `'shared-source-v1'`（shared/novel-import.ts:132），校验遇到其它值直接拒绝（budget-policy.ts:37）。526 已部分回退过一次（只保留 roster）。把两个独立实验塞进同一字段，回退 528 时会连带 526。建议新增独立字段，并且：
   - 在 main:1535 同一分支、同一条件下写入（新建、v2 预算、wizardVersion=1、`options.promptLayout!=='legacy'`、`sharedSourceLayoutAllowed()`）；
   - 金样/轨迹脚本只设 `SHAKEINK_PROMPT_LAYOUT=legacy`（scripts/capture-novel-import-prompt-golden.ts:12、capture-novel-import-request-trace.ts:12），所以新字段必须同样受这个开关关闭；
   - 加入 `validateImportBudgetState` 类校验（要求有 `budgetPolicy`）、日志读取校验（main:450、465）和两处 scope/plan hash 的条件展开（core/novel-import.ts:385、390）；
   - 是否要求 `budget.version===2`，参照 `sharedSourceLayoutActive`（shared-source.ts:72）写明；
   - “关闭 compact-v1”应是代码开关。已写入该字段的会话继续按原布局完成，不在中途切换，否则 scope hash 和已存目录都会失配。

8. **原生 schema 的“不放宽另一种”须测试双向拒绝。** native.ts:16 的 `ef` 与 service:92 的 zod `regex(/^ef[0-9a-f]{16}$/u)` 是两份独立定义，要一起按包位宽生成（见第 2 项）。现有测试用 `'ef'+'0'.repeat(16)` 表示“未知 ref”（repair-retention.test.ts:20、native.test.ts:74、opaque-reference.test.ts:52）。在 compact 包里，16 位串会先被 zod 正则拒绝，走字段级文案（service:249），不再走 resolve 文案（service:96），纠错提示的路径因此改变。新布局要单独测“格式合法但未知的 8 位 ref”和“旧 16 位 ref”两条路径，并确认 `pendingReference`（service:95，接受任意字符串）的冻结保留语义不变。

9. **修复链路展示的是 sourceRef，基本同源，但要确认。** 绑定修复的 choices 八列含 `sourceRef`（bound-decisions.ts:144），取自 `existingTable` 的片段 ref（repair-choices.ts:52），所以会自动展示短 ref，模型回答用的是 `choice` 号或 `cf`。`choiceRef`（`cf`+16，repair-choices.ts:50）、`claimRef`（`pc`+16）、`repairRef`（`rr`+16）（service:139、native.ts:19-21）与片段 ref 无关，方案不应改它们。要补两项测试：
   - 定点修复（service:763）和根结构恢复（service:719）在 compact 包下展示的 `sourceRef` 能被同一张表 resolve；
   - 控制焦点验证器（control-focus.ts:45）用同一位宽建表。

## 低

10. **验收指标大多可从现有数据得到，有三处需要补。**
    - 条目数、`sceneCleanup` 排除数、`unresolved` 数可从会话日志的 `wizard.sceneIdentity`/`candidates.scene`/`sceneCleanup` 得到（main:810、1238 有对应状态）；纠错代次率可用 `import-usage` 的 `generation>1`，筛 kind=scene、mode=roster（service:639）。
    - 但 `import-usage` 的 `layout` 列只反映 sharedSource（service:639），无法证明某个请求实际用了 compact 还是回退的 16 位。需要加一列（如 `fragLayout:'c8'|'c16'|null`），保持 768 字节上限。
    - “ref 无效计数”目前没有出处：`generateJSON` 内部纠错不打日志，`scene-roster-batch` 只在整批失败时输出前 300 字（main:739）。须定义计数点（建议在 service:96 的 resolve 失败和 ref 正则失败处计数），输出格式只含计数，不含原文或 ref 值。
    - “ss-r2”在仓库文档中没有定义（仅 528 出现），须写明是哪次运行、哪个隔离根。
    - 场景条目数 ±10% 只比一次运行，基线噪声未知（526 审核第 65 行已提出）。
    - “重试 ≤3”要说明指 `SCENE_UNIT_ATTEMPTS`（main:113）还是步骤重试。
11. **缓存口径偏保守，属于有利方向，但要写明。** 新布局改变了片段载荷前缀，首跑接近冷缓存；base-r1 场景 roster 命中率是 71.2%（docs/525:12）。−40% 折算费用目标因此是在不利条件下比较，可保留，但报告中应同时给出未命中和命中两部分 token。
12. **ref 盐值版本。** 建议 compact ref 使用新的域标签（例如 `scene-roster-fragment-ref-v2`），不截取 v1 摘要的前缀，避免 8 位 ref 恰好是旧 16 位 ref 的前缀，让模型把两者混用。这项是可选的，不影响正确性。

## 建议的最小修订清单

- 补“请求字段 + 主进程/服务端一致性断言”的设计（第 1 项）。
- 改正唯一性描述；回退按包统一判定，由建表结果决定位宽、schema 模式和缓存键（第 2 项）；位宽改为 10-12 位，或改用确定性加盐（第 3 项）。
- 明确分批策略，并把输出长度和截断率纳入验收（第 4 项）。
- 写明内部结构保留 `index`，只改线上投影；评估三元组（第 5、6 项）。
- 新增独立会话字段，与 526 共用写入条件和 legacy 开关（第 7 项）。
- 补 `fragLayout` 日志列与 ref 无效计数的定义，并定义 ss-r2（第 10 项）。

## 修订 1 复审

复审对象：方案“修订 1”节（528 plan:48-72）。对照代码同上，另读 `desktop/service/novel-import-structured-scene.ts`、`desktop/core/novel-import-shared-source.ts`。

结论：**修改后通过**。1–12 项都有回应，方向正确，没有剩余的高项阻断。三元组 `[index,text,ref]`、12 位 v2 域标签、独立会话字段、按包回退这几处设计成立。“按旧布局长度算批”可以实现，也能让分批保持不变，但需要把计算对象写清楚，还要补一个兜底，避免极端包在 `ai()` 断言处失败。“请求级字段 + 按包回退”的语义自洽，但方案里“都从同一建表结果取位宽”跨进程时做不到，还漏掉了提示词示例和原生 schema 的调用点。以下中项在写测试用例前补进方案即可，不必再走一轮方案审核。

### 对“分批不变”（原第 4 项）的判断

可实现，口径合理。依据：
- 场景 roster 的分批全部经过 `stageRequests`→`requestFits`（main:718、1228，以及折半重试的 `stage()` main:738-746）。roster 属于 monotone 路径，走 `importStageBatches(...,fits)`（main:1741-1742，budget-policy.ts:94-102）。旧布局下真正起约束的是 `payload.length≤characters×3`（main:1731）和原生预算 `payload+schemaBytes≤characters×3`（native.ts:34），因为载荷约是正文的 7 倍，而正文上限只是 1 倍。所以只要 `fits` 的判定与旧布局完全一致，批就逐单元相同。
- 逐片比较：旧格式 `{"index":k,"text":T,"ref":"ef"+16hex}`，新格式 `[k,T,"ef"+12hex]`，`T` 的转义完全相同。新格式每片少约 30 字符；回退到 16 位时仍少约 26 字符。所以正常情况下新载荷严格短于旧载荷。服务端的所有预算断言都按真实载荷做（main:1802-1803，service:655、698、717-722、747、766、1090-1092），新布局只会多出余量，不会更紧。

需要补充：

M1. **“旧布局载荷长度”要定义成“整份旧布局请求”的判定，而不只是载荷长度。**（main:1728-1734，native.ts:29-35）`requestFits` 有三道检查：载荷长度、`assertSceneRosterNativeBudget`（载荷+schema 字节、固定提示预留 `importAiPrompt(request,payload)`）、单元数/字符数。只把载荷换成旧的，schema 仍按新位宽、prompt 仍按新契约计算，`payload+schemaBytes` 就会和旧计算差几个字节，“批完全相同”就不严格成立了。建议写成：`requestFits` 对新布局请求先构造 `legacy={...request,sceneFragmentRefs:undefined}`，对 `legacy` 执行原有全部检查（旧载荷、旧 prompt、旧 schema）。这样旧会话的代码路径不变，新会话的分批也与旧会话逐单元相同。测试可以直接断言“同一组单元在新旧会话下 `stage()` 产出的 `units` 序列相同”。

M2. **兜底：新布局请求还要再检查一次真实请求。**（main:1800-1803）`ai()` 用真实载荷做 `assertImportPayloadBudget`、`assertImportFixedPromptReserve` 和原生预算断言。只要新字段 `sceneFragmentRefs` 会被序列化进载荷（ai-payload.ts:40 现在会把 `sceneIdentity` 等字段原样写进去，方案没说新字段写不写），片段很少的包就可能出现“新载荷 = 旧载荷 − 26×片数 + 字段长度 > 旧载荷”。新契约文案变长也会占用固定提示预留（ai-payload.ts:80-82，budget-policy.ts:4）。概率极低，但一旦发生，就是规划时判定能装下、`ai()` 时抛“超过模型预算”。这个错误不在 `sceneModelRetryable` 的可重试范围内，会让整步失败。建议：`fits=legacyFits(request)&&actualFits(request)`；再加一条性质测试：对任意包，新布局载荷长度不超过旧布局。另外要写明字段是否进入载荷。建议不进入，位宽只体现在 ref 本身和契约文案里。

M3. **新布局下纠错和焦点的预算余量会变大，属于行为变化，需要写明。**（service:717-722、747、766、779）纠错文案、控制焦点、定点修复的 `checkBudget` 都按真实载荷计算。压缩后，原来因预算放不下而丢弃的 focus 在新布局下可能被附带上。这会改变纠错轮的输入，但方向有利，属于“编码之外”的第二个变量。可以接受，但验收报告里应注明，或者把这几处的预算也按旧布局计算以保持一致，二选一。

### 对“请求级字段 + 按包回退”（原第 1、2、8 项）的判断

语义自洽：请求字段 `width:12` 表示“申请的布局”，实际位宽是 `f(units,申请位宽)` 的确定性结果。同一组 units 在主进程和服务端算出的结论相同，所以两边不需要传递“实际位宽”。但方案中有几处与代码对不上：

M4. **“都从同一建表结果取位宽”跨进程做不到，应改为“同一个纯函数”。** 主进程的分批（main:1732）和 `ai()`（main:1803）、服务端（service:91、655、1092）、`supportsStructuredSceneRoster`（structured-scene.ts:33）各自调用 `sceneRosterNativeSchema(request,model,phase)`。这个函数现在只看请求本身，返回静态 `firstSchema`（native.ts:18、22-27），手里没有表。建议在 fragments.ts 导出 `sceneRosterFragmentWidth(request):12|16`，内部基于带位宽键的 `fragmentMemo` 计算并检查本包是否重复。建表函数、载荷投影（ai-payload.ts:39）、zod 正则（service:92）、原生 `ef` 模式（native.ts:16）、`import-usage` 的 `refWidth`（service:639）都调用它。测试断言这些位置结论一致，包括注入摘要函数制造 12 位冲突的情况。

M5. **控制焦点验证器拿不到请求，要明确传参方式。**（control-focus.ts:10、45）它的输入只有 `{plan,bound,units,error}`，内部自建 `createSceneRosterFragmentTable(input.units)`。复核代码后发现：验证器只比较 `addAnchor` 返回的 `choiceRef`（`cf`+16，repair-choices.ts:50，与片段 ref 无关），`createSceneRosterRepairChoices` 只要求表与 units 自洽（repair-choices.ts:21-31），不关心位宽。所以位宽不一致在功能上不会出错，原第 2 项把这处列为必须一致，严重度偏高。为了避免以后误用，仍建议改为传入调用方已有的 `table`（service:144 处有 `active`/`units` 可用），不要自己按默认位宽重建。

M6. **提示词示例 ref 和文案要跟实际位宽走，不能只看布局。**（ai-payload.ts:56、80-82）`sceneIdentityRosterPrompt(payload)` 只接收载荷，示例里写死了 `"ef0123456789abcdef"`（16 位）。新布局如果把示例改成 12 位，回退到 16 位的包就会出现“示例 12 位、目录 16 位”的矛盾；不改示例，正常包又是“示例 16 位、目录 12 位”，而模型有照抄示例长度的倾向。建议：新契约文案不写位数；示例 ref 按 `sceneRosterFragmentWidth` 生成。函数签名改为接收 request，旧路径的输出逐字节不变，由提示词金样保证。

M7. **字段由谁附加、在哪里校验，需要写明。**
- 附加：建议在 `requestSnapshot`/`sceneRequest`（main:369-372、1711-1712）这一个位置，按 `sceneRosterFragmentRequest(request)&&会话已开启` 统一附加。不要分别改 main:718、1228 两处构造函数，否则遗漏场景（importSceneOmissions）和折半重试很容易漏掉。`sceneParentTargets` 请求（main:823、836）是 roster/scene，但没有 `sceneIdentity`，`sceneRosterFragmentRequest` 为假，不能附加，要写一条反例测试。
- 服务端：允许条件应直接用 `sceneRosterFragmentRequest(request)`，同时要求 `semanticVersion===1`，不能只看 `mode==='roster'`。校验要放在 service:881 的 `semanticVersion===undefined` 提前返回之前，参照 sharedSource 在 service:878 的位置，否则不带语义版本的请求会绕过检查。用 strict schema 限定为 `{version:1,width:12}`。
- 主进程断言（main:1801 旁）：`ai()` 会再调用一次 `requestSnapshot`，若字段由它附加，“会话开启 ⇔ 字段存在”就恒成立，断言不起作用。应改为断言传入请求与快照中的字段一致（防止调用方手工附加或剥离）。

### 其余各项回应核对

- 第 3、12 项：已改为 12 位、v2 域标签、不截取 v1 前缀。全卷 81,509 片，碰撞概率 ≈ n²/2⁴⁹ ≈ 1.2×10⁻⁵，计算正确；按包算更低。回退到 16 位后若 v1 仍重复，应保留现有的抛错行为（fragments.ts:41），方案要写一句。
- 第 5、6 项：三元组保留了 `index`，`at===part.index`（repair-choices.ts:30）和“只取当前目录显式编号”的文案（ai-payload.ts:82）都仍成立，可以接受。4.14、4.62 倍的离线数据本次没有复算。
- 第 7 项：已回应。补充一点：`sharedSourceRequestError` 禁止 `sceneIdentity` 请求带 sharedSource（shared-source.ts:37），所以 526 与 528 不会同时出现在同一个请求里，独立回退成立。
- 第 8 项：要测试“格式合法但未知的 12 位 ref”“16 位 ref 发到 12 位包”“12 位 ref 发到回退 16 位包”三条拒绝路径，并检查 service:807 的常量分类。方案只写了“按布局生成未知 ref 样例”，要改成按包位宽生成。
- 第 9–11 项：已回应。“ref 无效”计数点在 service:96，还要覆盖 zod 正则失败（service:92，走字段级文案）；跨片备选使用次数的计数点要写明（service:96 的 `unitIndex` 分支）。

### 低

L1. `fragmentMemo` 键加上位宽后，一卷的缓存条目约翻倍，按旧布局算批时两种位宽都会被访问。上限 20,000 单元条目（fragments.ts:34）是否会抖动，需要用全卷单元数核对一下；超过就按位宽分开两份 memo。
L2. `refWidth` 写入 `import-usage` 时调用 `sceneRosterFragmentWidth`，要确认 768 字节上限内还有空间（service:639）。

## 修订 1 复审：须补清单

- M1/M2：`requestFits` 对新布局 = 旧布局请求完整判定 && 真实请求判定；写明字段不进入载荷；补“新载荷 ≤ 旧载荷”性质测试和“新旧会话分批逐单元相同”测试。
- M4/M6：位宽由单一纯函数 `sceneRosterFragmentWidth(request)` 决定，载荷、zod、原生 schema、提示词示例、usage 都调用它；契约文案不写位数。
- M7：字段在 `requestSnapshot` 统一附加；服务端校验放在 service:881 之前，用 `sceneRosterFragmentRequest`；主进程断言改为“传入与快照一致”。
- M3：说明纠错/焦点预算余量的变化，或者让它们也按旧布局计算。
