# 528 · 场景清单片段压缩方案（522 第三步）

日期：2026-11-08。依据 `522-import-token-cache-plan.md` §3、基线 `525`、第二步结果 `526` §5。

## 0. 目标与口径

- 场景识别（`analyze/roster/scene`，`sceneIdentity.mode:'roster'`）是除逐项导入外最大的单阶段：base-r1 输入 519 万 token（未命中 172 万），ss-r1 603 万（未命中 211 万）。
- 用户选择“质量优先”：场景数与证据定位能力不得变差；不达标回退保守版本（见 §4）。
- 验收看**折算费用**（未命中 + 0.1×命中）与质量，不只看命中率。

## 1. 现状（离线测量，第一卷前 40 单元，39,019 字）

- 载荷 277,866 字符，为正文 7.1 倍；4,641 片，平均 8.4 字/片。
- 每片 `{"index":k,"text":…,"ref":"ef"+16hex}`，仅 `index`+`ref` 即 181,241 字符（65%）。
- 模型证据三种形式（`novel-import-scene-roster-native.ts:16`、`service:92-96`）：`{ref}`（首选，提示词要求逐字复制）、`{unitIndex,fromFragment,toFragment}`（显式备选）、`{unitId,quote}`（原文）。

| 编码（同一 40 单元） | 载荷/正文 |
| --- | --- |
| 现状 | 7.11 |
| 去掉 `index`（数组位置即序号） | 5.80 |
| `[text, 8位ref]` 元组 | 3.06 |
| 单元原文 + 行内序号标记 `⟦k⟧` | 1.64 |
| 单元原文 + 片长数组 `cuts` | 1.45 |

## 2. 方案：保守与激进两档，均新会话专用

沿用 526 的会话字段机制：新增 `sceneFragmentLayout:'compact-v1'`，仅新建向导会话（v2 预算）写入，计入 scope/plan hash（条件展开），旧会话与金样逐字节不变。

**A（保守，先做）：** 去掉 `index`，ref 缩短为 `ef`+8 hex（每单元内唯一性已由 `unitFragments` 的重复检查保证，冲突时整表回退旧 16 位）；片对象改为二元组 `[text,ref]`。载荷约 3.1 倍正文（−57%）。证据仍是“逐字复制 ref”，模型行为最接近现状；native schema 的 `ef` 模式改为 `^ef[0-9a-f]{8}$|^ef[0-9a-f]{16}$`（随布局二选一，不放宽另一种）。

**B（激进，A 验收后再评估）：** 单元原文一次 + 行内 `⟦k⟧` 标记，证据只用 `{unitIndex,fromFragment,toFragment}` 或原文 quote。载荷约 1.6 倍（−77%），但移除了“复制不透明 ref”这一被刻意采用的设计（模型须数序号），质量风险高，需另起方案与审核。

本文只实施 A。

## 3. 验收（A）

1. 单元：新旧布局门控；旧会话提示词与 `tests/fixtures/novel-import-prompt-golden.json`、请求轨迹金样逐字节不变；新布局目录确定性、ref 唯一与回退；`resolve` 只接受当前布局的 ref；纠错/定点修复（bound repair、targeted repair）展示的 ref 与目录一致；native schema 随布局选择模式。
2. 离线：用真实构造函数对 ss-r1 会话计算场景 roster 载荷总字符（目标 ≤45% 现状）。
3. 真实首跑（第一卷，新会话）：场景识别成功（重试 ≤3）；场景条目数、`sceneCleanup` 排除数、未决（unresolved）数与 ss-r2/base-r1 相比 ±10% 以内；场景 roster 纠错代次率不高于基线 +5pp；“场景片段ref无效”类拒绝次数（新增调试计数）不显著上升；场景 roster 折算费用下降 ≥40%。
4. 不达标即回退：关闭 `compact-v1`（新会话不再写入），保留代码与测试。

## 4. 风险

- 8 位 ref 被模型改写/截断的概率可能不同于 16 位；由“ref 无效”计数与纠错代次率把关。
- 场景定点修复（`createSceneRosterTargetedRepair` 等）大量复用 ref 与 bound 数据，需要逐处确认展示与解析同源。
- 场景 links/cleanup/ownership 不使用片段目录，不在范围内。

## 修订 1（按 `528-scene-roster-fragment-compaction-plan-review.md` 1–12）

**编码改为保留编号的三元组 `[index,text,ref]`（审核 6）。** 去掉 `index` 会让跨片备选 `{unitIndex,fromFragment,toFragment}` 只能靠数位置，正是 B 被判高风险的行为；三元组保留显式编号，现有“只取当前目录显式编号”的文案与 `repair-choices.ts:30` 的 `at===part.index` 校验仍成立。内部结构（`SceneRosterReferencedFragment`）不变，只改线上序列化（审核 5）。离线：12 位 ref 三元组 4.14 倍正文（现状 7.11，−42%）；16 位三元组 4.62 倍。

**ref：`ef`+12 hex，新哈希域标签 `scene-roster-fragment-ref-v2`（审核 3、12）。** 全卷 81,509 片，12 位（48 bit）全卷碰撞概率约 1.2e-5；不截取 v1 摘要前缀，避免短 ref 成为旧 ref 的前缀。

**位宽按包判定并下发（审核 1、2、8）。**
- 请求新增顶层字段 `sceneFragmentRefs:{version:1,width:12}`（不放进 strict 的 `sceneIdentity`）；缺省即现状 16 位。服务端 `validateSemanticRequest` 只允许在 `sceneIdentity.mode==='roster'` 的场景 roster 出现；主进程在 `ai()` 中断言其与会话布局一致（同 526 的 sharedSource 做法）。
- 建表函数 `createSceneRosterFragmentTable(units,width)` 返回实际位宽：12 位在本包内出现重复时整包确定性回退 16 位 v1（不报错），所有使用方——载荷、服务端建表、控制焦点验证器（`control-focus.ts:45`）、修复目录（`repair-choices.ts:30`）、zod 正则（`service:92`）与原生 schema（`native.ts:16`）——都从同一建表结果取位宽；`fragmentMemo` 键含位宽与域标签。
- 回退次数记入调试计数。

**独立会话字段（审核 7）。** 新增 `sceneFragmentLayout:'compact-v1'`，与 `promptLayout` 相同写入条件（新建向导会话、v2 预算、非 legacy 开关），加入 `validateImportBudgetState`、日志读取校验与两处 hash 的条件展开；526 与 528 可独立回退。

**分批不变（审核 4）。** 新布局下 `requestFits` 改用旧布局载荷长度上限计算批（即单包单元集合与旧布局相同），只改编码，不改分批与输出长度；压缩带来的是同批输入减少，而非更大的批。

**文案（审核 6、8）。** 新布局请求只在 roster 契约中把“fragment.ref/编号”的描述改成“fragments 每项为 [编号,原文,ref]”，其余纠错文案不变；新文案仅在新布局拼接，`service:807` 的常量分类同步扩展，旧金样不变。测试中的“未知 ref”样例按布局生成。

**修复链路（审核 9）。** 新增用例：定点修复与根结构恢复在新布局下展示的 `sourceRef` 能被同一表解析；控制焦点验证器与请求同位宽。

**验收补充（审核 10、11）。**
- `import-usage` 增加 `refWidth`（12/16/null）。
- “ref 无效”在 `service:96` 计数（`scene-roster-ref-invalid` 调试行，仅计数），跨片备选使用次数另计。
- 对照运行为 ss-r2（526 §5.1）；场景 roster 折算费用目标 −30% 以上（编码 −42% 的输入，扣除首跑冷缓存）；场景条目数受模型波动影响（三次运行 429/354/345），改为与 ss-r2 比 ±15%，并以未决数与 cleanup 排除数辅助判断。
- “重试 ≤3”指驱动对识别/导入步骤与任务点击“重新识别/重试”的次数。
- 报告分列命中/未命中 token。

## 修订 1 复审补充（M1–M7、L1–L2）

- **M1/M2 分批：** `requestFits` 对“去掉 `sceneFragmentRefs` 的完整旧请求”做全部判定（旧载荷、旧提示词、旧原生 schema），并再对真实请求判定一次，两者都通过才算 fit；`sceneFragmentRefs` 不写入载荷 JSON。测试：同一单元集合在新旧会话下 `stage()` 产出相同批；随机单元集合上新载荷长度 ≤ 旧载荷长度。
- **M3 纠错/焦点预算：** `service:717-722、766` 的纠错、focus、定点修复预算在新布局下仍按旧布局等价长度计算（以旧表重建的旧载荷），使附带 focus 的判定与旧布局一致；验收报告注明。
- **M4 位宽来源：** 导出纯函数 `sceneRosterFragmentWidth(request):12|16`，内部用请求单元建表（含碰撞回退）并缓存；载荷、服务端建表、zod 正则（`service:92`）、原生 `ef` 模式（`native.ts:16`）、提示词示例、usage 日志全部调用它。
- **M5：** 控制焦点验证器改为接收已有表（不影响功能，仅一致性）。
- **M6：** 提示词示例 ref 按实际位宽生成（确定性占位，如 `'ef'+'0123456789abcdef'.slice(0,w)`）；新文案不写位数。
- **M7：** 字段在 `sceneRequest`（main:369）统一附加，仅 `sceneIdentity.mode==='roster'` 且无 `sceneParentTargets`；服务端校验置于 `service:881` 提前返回之前，以 `sceneRosterFragmentRequest` 判定；主进程断言“调用方请求与快照字段一致”。
- **回退：** 16 位 v1 仍重复时保留现有抛错（`fragments.ts:41`）。
- **L1/L2：** `fragmentMemo` 上限随位宽键调整为 40,000；`refWidth` 加入后核对日志行 ≤768 字节。

## 6. 真实首跑 sc-r1（北京时间 14:11:26–14:24:42，证据 `~/shakeink-test-roots/evidence-522/sc-r1-*`）

全部成功，任务重试 0；场景 roster 全部 `refWidth:12`（无回退）。按 529 审核修订口径（`mode=roster`）对比 ss-r2：

| 指标 | ss-r2 | sc-r1 | 门槛 | 结果 |
| --- | --- | --- | --- | --- |
| 输入 token | 6,157,521 | 3,967,983（−35.6%） | — | — |
| 命中 / 未命中 | 4.07M / 2.08M（66%） | 0.85M / 3.12M（21%） | — | — |
| 折算费用 | 2.49M | 3.21M | ≤1.74M | **未达标** |
| op 级纠错率 | 74.1% | 68.0% | ≤79.1% | 达标 |
| 选中场景数 | 345 | 305 | 294–397 | 达标 |
| 场景资料（facts 均值 / evidence 均值 / text 中位） | 6.35 / 1.41 / 224 | 6.34 / 1.72 / 223 | — | 持平或更好 |

同报：ref 无效 3 次、跨片编号引用 138 次、cleanup 排除 11→36、未决 0→0。全流程（不含 review）折算费用 11.55M→9.64M。

费用门槛未达标的原因是缓存条件不对等：新编码在 DeepSeek 上首次出现（冷，命中 21%），而 ss-r2 的旧编码提示词与 base-r1、ss-r1 逐字节相同，已被此前运行预热（命中 66%）。同为冷缓存时费用与输入成正比，约 −35%；同为热缓存的对比需要第二次运行。

## 7. 第二次运行 sc-r2（北京时间 14:32:41–14:42:40，同一新编码，缓存已部分预热）

| 指标（`mode=roster`） | ss-r2 | sc-r1 | sc-r2 | 门槛 |
| --- | --- | --- | --- | --- |
| 输入 token | 6.16M | 3.97M | 4.54M（−26%） | — |
| 命中率 | 66% | 21% | 41% | — |
| 折算费用 | 2.49M | 3.21M | 2.88M | ≤1.74M（未达标） |
| op 级纠错率 | 74.1% | 68.0% | 62.1% | ≤79.1%（达标） |
| 选中场景数 | 345 | 305 | 375 | 294–397（达标） |
| 场景资料 facts / evidence / text 中位 | 6.35 / 1.41 / 224 | 6.34 / 1.72 / 223 | 6.23 / 1.66 / 210 | — |

但识别场景步骤**整步失败 3 次**（`模型返回的场景清单结构无效（响应结构）`，`scene-roster-failed`），由驱动第 3 次“重新识别”后成功；此前 base-r1、ss-r1、ss-r2、sc-r1 均为 0 次。ref 无效计数 3→15，跨片编号引用 138→577，单包失败 2→4。全流程（不含 review）折算费用 9.75M（ss-r2 11.55M、sc-r1 9.64M）。

判定：费用门槛两次均未达标（缓存首次预热未完成，DeepSeek 前缀缓存只在完全相同前缀时命中），且 sc-r2 出现此前未见的整步结构失败，违背“识别场景一定成功”的约束。按 §3.4 **回退：新会话不再写入 `compact-v1`**，代码、测试与金样保留，可通过恢复写入条件重新启用。
