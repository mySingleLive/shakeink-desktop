# 529 场景清单片段压缩用例 · 独立审核

审核对象：`docs/529-scene-roster-fragment-compaction-cases.md`。对照：方案 `docs/528-scene-roster-fragment-compaction-plan.md`（含修订 1、修订 1 复审补充）、审核 `docs/528-scene-roster-fragment-compaction-plan-review.md`（1–12、M1–M7、L1–L2）。核对代码：`desktop/core/novel-import-scene-roster-fragments.ts`、`-native.ts`、`desktop/service/novel-import-scene-roster-control-focus.ts`、`desktop/service/novel-import-scene-roster-repair-choices.ts`（两者在 service 目录，不在 core）、`desktop/core/novel-import-ai-payload.ts`、`desktop/core/novel-import-budget-policy.ts`、`desktop/service/novel-import-ai.ts`、`desktop/main/novel-import.ts`、`tests/helpers/novel-import-wizard-fixture.ts`、两份金样脚本。另读取了 `~/shakeink-test-roots/evidence-522/ss-r2-*`（只统计计数，不读取正文），用来确认 SC-REAL 门槛能否量化。

结论：**修改后通过**。19 条用例覆盖了方案主干，三元组编码、12 位 v2 域标签、按包回退、分批不变、独立会话字段都有对应用例。但有 3 个高项：SC-07 写错了一条拒绝路径的期望；SC-03 漏了 M7 点名的两条请求构造路径；SC-REAL 的基线数值和公式没有落成数字。另有若干中项，属于审核项覆盖不全或期望不可判定。改完即可进入 TDD，不必再走一轮用例审核。

## 覆盖对照

| 来源 | 对应用例 | 状态 |
| --- | --- | --- |
| 审核 1（请求字段、断言、轨迹金样） | SC-01/03/14/15 | 部分覆盖，见 2、7 |
| 审核 2、M4（按包判定、单一纯函数） | SC-06 | 部分覆盖，见 5 |
| 审核 3、12（12 位、v2 域标签） | SC-05/06 | 覆盖 |
| 审核 4、M1、M2（分批不变、双重 fit） | SC-09/10 | 期望无法判定，见 6 |
| 审核 5（内部结构不变） | SC-04 | 覆盖 |
| 审核 6、M6（文案、示例位宽、跨片计数） | SC-13/16/REAL | 覆盖，见 13 |
| 审核 7（独立字段、门控、hash、不在中途切换） | SC-02 | 部分覆盖，见 8 |
| 审核 8（三条拒绝路径、pendingReference） | SC-07/08 | 期望有误，见 1 |
| 审核 9、M5（修复链路、控制焦点） | SC-11/12 | 覆盖，见 9 |
| M3（纠错/焦点预算按旧布局） | SC-11 | 缺边界夹具，见 9 |
| M7（附加位置、校验位置、断言语义） | SC-03/14/15 | 部分覆盖，见 2、7、10 |
| 审核 10、11、L2（日志、计数、ss-r2、分列） | SC-16/REAL | 门槛未数字化，见 3、4 |
| 16 位仍重复时抛原错误 | SC-06 | 覆盖 |
| L1（memo 上限 40,000） | 无 | 缺失，见 11 |

## 高

1. **SC-07 把“16 位 ref 发到 12 位包”的拒绝路径写错了，另外漏了两条拒绝路径。**（529:13）
   - 期望写的是“16 位被拒（‘ref 无效’…）”。按方案，zod 的 `ref` 正则随位宽生成（现在在 service:92）。16 位串在 12 位包里会先被正则拒绝，走 `sceneRosterShapeGuidance` 的字段级文案（service:249，“ref必须为当前目录显示的完整字符串…”），根本到不了 resolve 的文案（service:96，“ref必须逐字复制当前目录已显示的ref…”）。审核第 8 项和复审第 8 项都专门指出过这一点，用例应当分开写：
     - (a) 格式合法但未知的 12 位 ref → service:96 的 resolve 文案；
     - (b) 16 位 ref 发到 12 位包 → service:249 的字段级文案；
     - (c) 12 位 ref 发到回退为 16 位的包 → service:249 的字段级文案（这条在 SC-07 和 SC-06 里都没有）。
   - 三条路径都要断言 `scene-roster-ref-invalid` 计数加 1。修订 1 复审第 9–11 项要求计数同时覆盖正则失败，SC-16 没写。
   - 漏了审核第 8 项要求的 `pendingReference`（service:95，`z.string()` 接受任意 ref）冻结保留语义不变：新布局下首代 invalid 后，被冻结草稿里未知的 12 位 ref 仍按原语义只作为未证明位置，不参与采用。

2. **SC-03 只列了请求种类，没覆盖 M7 点名的构造路径。**（529:9）M7 要求在 `sceneRequest`/`requestSnapshot` 统一附加字段，原因就是“遗漏场景（importSceneOmissions）和折半重试很容易漏掉”。用例须覆盖：
   - 首轮 roster（main:718）；
   - 遗漏场景补识别 `importSceneOmissions`（main:1228）；
   - 单包失败后折半重试的 `stage()`（main:738-746）；
   - 两处 `sceneParentTargets`（main:823、836，反例，不带字段）；
   - scene ownership/review 请求（`sceneRequest` 会附加 `mode:'ownership'`，main:369-372，反例）。
   
   每条都断言 `fixture` 捕获的 `requests`（wizard-fixture.ts:39）里字段有或无，而不只是检查构造函数的返回值。

3. **SC-REAL 的费用和纠错门槛没有基线数值和计算公式，不可复核。**（529:25）按 `ss-r2-app-stderr.log` 的 `import-usage` 行统计（kind=scene、intent=roster）：
   - mode=roster 共 59 行、27 个 op；未命中 2,084,561，命中 4,072,960，折算 **2.49M**；
   - mode=links 0.058M，mode=cleanup 0.222M，mode=null（sceneParentTargets）0.004M。
   
   526 §5.1 表里“场景 roster 2.78M”的口径，与“roster+links+cleanup”的合计（约 2.77M）基本吻合，与 mode=roster 不一致。用 2.78M 和 2.49M 作基线，−30% 的门槛分别是 1.95M 和 1.74M，相差 0.2M。纠错代次率同样有歧义：按行算 `generation>1` 为 32/59=54%，按 op 算 20/27=74%，+5pp 的含义完全不同。用例须写明：
   - 筛选条件：`kind=scene&&intent=roster&&mode=roster`，不含 links、cleanup 和 mode=null；
   - 折算公式 `noCacheTokens+0.1×cacheReadTokens`，以及基线值（建议 2.49M，门槛 ≤1.74M）；
   - 纠错代次率公式（建议按 op：至少有一行 generation>1 的 op ÷ op 总数；基线 20/27=74.1%，门槛 ≤79.1%），并给出统计脚本（可沿用 `evidence-522/summarize-usage.mjs`）。

## 中

4. **SC-REAL 的质量指标须落成数字，“ref 无效计数”须写明是否作为门槛。**（529:25）
   - “场景条目数”：方案里的 429/354/345 对应的是 `wizard.candidates.scene` 中 `selected` 的数量（base-r1 429、ss-r1 354、ss-r2 345）。候选总数分别是 478/446/356，这两个口径须选一个写死。按 345 计，±15% 为 [293,397]。
   - “未决数”：三次运行的 `sceneIdentityState` 全部是 `source-scoped`，未决都是 0。应写明取值字段（`candidates.scene[].sceneIdentityState==='unresolved'`，参照 main:810），期望为 0 或不增加。
   - cleanup 排除数（`sceneCleanup.excluded`）三次分别是 49/92/11，波动很大，只适合同报，用例应明说“不作门槛”。
   - ref 无效计数在 ss-r2 中没有基线（是新增计数）。原方案的“不显著上升”已无法判定。要么明确“仅同报，不作门槛”，要么给一个绝对门槛（例如“ref 无效次数 ÷ 首代 op 数 ≤ X”）。`refWidth` 也应给期望：12 位行占比 100%，16 位回退次数等于 SC-SIM 预测的次数（期望 0）。

5. **SC-06 的一致性面不完整，注入方式也没有落到代码上。**（529:12）
   - 现有代码里没有“替换摘要”的钩子（fragments.ts:25 的 `digest` 是模块私有常量）。用例须写明注入点。例如导出一个仅测试可用的摘要覆盖函数；或者把碰撞判定拆成一个可单测的纯函数，入参是 ref 列表。同时断言生产路径不能触达这个钩子。
   - 回退后的一致性除了已列的载荷、zod、原生 schema、提示词示例，还须覆盖：服务端建表 `resolve`（service:91）、修复目录 `createSceneRosterRepairChoices` 的 `sourceRef`（repair-choices.ts:30、52）、控制焦点（control-focus.ts:45）、`import-usage` 的 `refWidth`（service:639）、`supportsStructuredSceneRoster`（structured-scene.ts:33）。M4 要求的“全部调用同一纯函数”，应通过断言这些位置拿到同一个位宽来验证。
   - 漏了两项：
     - 碰撞判定以包为单位：同一组 units 经过 `structuredClone`（模拟 main 与 service 跨进程）后结论相同；这组碰撞单元换到另一个不含冲突单元的包里，仍得到 12 位；
     - `fragmentMemo` 不串位宽：同一单元先按 12 位、再按 16 位建表，ref 各自正确，不会命中对方的缓存。

6. **SC-09 和 SC-10 没有让“旧布局判定起约束”的边界夹具，期望可能空过。**（529:15-16）
   - SC-09：合成正文如果小于一个包，新旧会话都只产出一批，“逐项相同”会恒成立。须构造让 `payload.length≤characters×3`（main:1731）或原生预算 `payload+schemaBytes≤characters×3`（native.ts:34）恰好在批边界处起约束的输入，例如把 `contextWindow` 调小使 `characters` 变小，或使用高片段密度的正文。并断言：旧会话至少分成 2 批；新会话的批与旧会话相同；同一批在新布局下的真实载荷明显低于上限（证明分批确实由旧布局判定，而不是由新载荷判定）。100 组随机集合要固定种子。
   - SC-10：“片段很少的包、全 `<` 的包”写的是现象，没有写怎么验证 `fits=legacyFits&&actualFits`。真实请求比旧请求更长的情况几乎构造不出来，须用注入或替换的方式，让 actualFits 为假而 legacyFits 为真，断言该批被继续切分，`ai()` 不会抛“导入请求超过模型预算”。另外，“全 `<`”与载荷无关：`JSON.stringify` 不转义 `<`，`<` 转义只出现在修复数据里（service:767-768）。这条用例的意图须写明，否则删掉。

7. **SC-14 的 `width` 合法值与方案不一致。**（529:20）
   - 方案和复审 M7 写的是“用 strict schema 限定为 `{version:1,width:12}`”，缺省就表示 16 位（plan:55、review:110）。用例写的是“`width` 非 12/16 被拒”，等于允许请求携带 `width:16`。应改为：除 `{version:1,width:12}` 以外的任何值都拒绝，`width:16` 也拒绝。
   - 正例和反例要补齐：
     - 正例：`semanticVersion:1` 且 `mode:'roster'`，带字段的请求通过；
     - 反例：`sceneParentTargets` 请求（roster/scene，但 `sceneRosterFragmentRequest` 为假）带字段被拒；
     - 反例：`semanticVersion` 缺省时带字段被拒，并验证拒绝发生在 service:881 提前返回之前。
   - 用例里的“固定错误”须写出确切的文案。

8. **SC-02 的会话门有几处缺口。**（529:8）
   - “legacy 开关”实际是两个独立条件：`options.promptLayout==='legacy'`（main:1535），以及 `SHAKEINK_TEST_ROOT` 下的 `SHAKEINK_PROMPT_LAYOUT=legacy`（main:95）。两者要各测一次。
   - 缺“小窗口模型 → 无 `budgetPolicy`（v1 legacyBudget）→ 不写入”这一条。
   - 审核第 7 项要求“已写入的会话继续按原布局完成，不在中途切换”：须增加两条用例。一是已带 `compact-v1` 的会话在代码开关关闭后 resume 或 append，场景 roster 仍是 12 位三元组，scope/plan hash 不变。二是对已带该字段的会话做 `append`，字段保留。现在用例里的“`append` 不写入”只说明了旧会话追加的情况，有歧义。
   - “526 的 `promptLayout` 可独立为缺省”须写成可执行的形式：分别加载只含 `sceneFragmentLayout` 的日志和只含 `promptLayout` 的日志，断言前者用 compact 片段、无 sharedSource，后者用旧片段、有 sharedSource（sharedSource 本来就不会出现在 sceneIdentity 请求里，见 shared-source.ts:37）。
   - “哈希不变”须有确定的对比值：可以用改动前代码对同一夹具算出的 `importScopeHash`/`importPlanHash`（core/novel-import.ts:385、390）固定十六进制值，也可以写明由金样保证。

9. **SC-11 的 M3 判定缺边界夹具，修复链路也应写明覆盖哪些函数。**（529:17）
   - “与旧布局下是否附带 focus 一致”须构造一个包：focus 在新载荷下能放下，按旧载荷放不下。断言新布局同样丢弃 focus。还要有反向对照（两种布局都能放下时都附带 focus）。纠错（service:717-722）、根结构恢复（service:719）、定点修复/绑定修复（service:766、`assertSceneRosterKeyedInlineBudget`）三处各需一个用例，否则 M3 的“按旧布局等价长度”只验证了一处。
   - `sourceRef` 能被解析，应断言 `boundData` 里展示的每个 `sourceRef` 都能被同一张表的 `resolve` 解析回相同的 quote，并且位宽与 `sceneRosterFragmentWidth` 一致。`choiceRef`/`claimRef`/`repairRef` 仍为 16 位、前缀不变（审核第 9 项：不改）。

10. **SC-15 只写了“不一致”，没有覆盖 M7 要防的两个方向，也没有正常路径。**（529:21）须分别覆盖：
    - 旧会话中调用方手工附加字段 → 抛错；
    - 新会话中调用方剥离字段 → 抛错（前提是传入请求已经是 `stageRequests` 产出的快照，main:1735-1742）；
    - `width` 被篡改 → 抛错；
    - 正常的 stage 快照 → 通过，并且 `options.ai` 收到的请求与快照字段相同。
    
    每条都断言 `options.ai` 没有被调用，`operations` 里也没有新增 operationId（main:1804 之前）。

## 低

11. **L1 没有对应用例。**（plan:83）应补一条：`fragmentMemo` 上限是 40,000，按全卷单元数（ss-r2 会话的工作单元）在新旧两种位宽交替访问时不发生抖动。可以计数 memo 命中率，或断言同一单元第二次建表不重算摘要。

12. **SC-SIM 的门槛与原方案 §3.2 不一致，口径也不全。**（529:24，plan:38）
    - 原文是“≤45% 现状”，修订 1 给出的三元组数据是 4.14/7.11≈58%，用例取 60%。这样设合理，但须在方案里注明 §3.2 已由修订 1 替代。
    - 应同时报告 prompt 总字符。费用由 `promptChars` 决定，其中包含固定契约。这样可以先用离线数据预估 SC-REAL 的 −30% 能否达到。
    - 用 `stage()` 重建旧布局批次后，须先校验重建结果：批数等于 ss-r2 首代 op 数（27），旧布局的 prompt 字符数与日志 `promptChars` 一致或可解释（例如最大值 258,071），证明重建无误后再比较新布局。
    - 产物只记录计数。ss-r2 会话里有真实正文（`files[0].text` 约 480 万字符），不能进入证据（AGENTS.md）。

13. **SC-13 的“`service:807` 常量分类覆盖新文案”没有具体对象。**（529:19）service:807 只对纠错常量做全等分类（例如 `SCENE_ROSTER_INDEX_QUOTE_GUIDANCE`，对应标签“证据窗口”）。新契约文案在首轮提示词里，不进入这条分类。应写明新增了哪个纠错常量、期望打哪个标签；如果没有新增，就写“分类不变”，并用 `novel-import-scene-roster-error-labels.test.ts` 回归。另外建议为新布局的契约增加一份确定的快照（固定夹具），锁定“[编号,原文,ref]”的描述，以及 12 位、回退 16 位两种示例 ref。

14. **SC-04 缺编码边界。**（529:10）现有的片段切分会保留 CRLF、代理对和只含空白的尾片（fragments.ts:13-22）。应补几项：
    - 含 `"`、`\`、控制字符、代理对、CRLF、尾部空白的单元，在三元组 `JSON.parse` 后 `text` 能逐字还原，各片拼接等于原文；
    - 除 `fragments` 外，单元的其余元数据与旧布局相同；
    - 只有一片的单元（没有任何边界符）。

15. **SC-16 须给出日志行格式，并补一条反例。**（529:22）
    - 写出 `scene-roster-ref-invalid` 和跨片备选计数行的确切格式（字段只有 op 与计数），并断言行里不含 ref、unitId、quote 或正文；
    - 调试关闭时不输出这两行；
    - 非场景 roster 的行 `refWidth=null`，回退包为 16；
    - 写日志失败不改变生成结果（参照 service:641 的 catch）。

16. **SC-17 和台账。**（529:23）应写明金样检查的确切命令（`scripts/capture-novel-import-prompt-golden.ts`、`capture-novel-import-request-trace.ts` 的 `--check`）。按 AGENTS.md，还要把 SC-01…SC-REAL 登记进 `docs/requirements-traceability.json`，SIM 和 REAL 只有在真实执行后才能标为通过。

## 须补清单

- 高 1：SC-07 拆成 (a)/(b)/(c) 三条拒绝路径，写明各自文案和计数；补 `pendingReference` 语义不变。
- 高 2：SC-03 覆盖 main:718、1228、738-746（正例），以及 823、836 和 ownership（反例），断言以捕获的请求为准。
- 高 3：SC-REAL 写死筛选条件、公式和 ss-r2 基线（mode=roster 2.49M → ≤1.74M；op 级纠错率 74.1% → ≤79.1%），并给出统计脚本。
- 中 4–10：落实条目数口径与区间、未决数、计数的门槛性质；SC-06 的注入点与全部一致性面；SC-09/10/11 的边界夹具；SC-14 改为严格 `{version:1,width:12}`；SC-02 的门控与“不中途切换”；SC-15 的双向断言。
