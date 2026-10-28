# 工具入参数组字符串化且内层闭合符错乱 · 独立 code review

关联方案：[235](235-tool-input-container-closer-repair-plan.md)（修订 3，终审通过）
关联用例：[236](236-tool-input-container-closer-repair-cases.md)（经 239 审核，有条件通过）
关联 issue：https://github.com/mySingleLive/shakeink-desktop/issues/15
审核分支：`fix/tool-input-container-closer-repair`

## 审核范围与方式

- 生产改动：`git diff -- src/lib/ai/tool-input-repair.ts`（新增 `repairContainerClosers`、改写 `parseEncodedContainer`），仅此一个文件。
- 新增测试：`tests/unit/tool-input-container-closer-repair.test.ts`。
- 对照文档：`docs/235`、`docs/236`、`docs/239`。
- 只读参考：`src/lib/planning/domain.ts:236-264`（`operationSchema`）、`src/lib/ai/planning-tools.ts:60-78`（真实 `proposeNovelPlanning.inputSchema`）、`src/lib/services/planning.ts`（未改动的落库路径）。
- 本审核未修改任何源码/测试，仅新增本文件。

### 实跑证据（本机命令）

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/unit/tool-input-container-closer-repair.test.ts` | `tests 35 / pass 35 / fail 0` |
| `node --import tsx --test tests/unit/tool-input-repair.test.ts` | `tests 9 / pass 9 / fail 0` |
| `npm run typecheck`（`tsc --noEmit`） | 退出码 0，无输出 |
| 独立脚本（复刻扫描器，逐夹具输出 `rewritten/dropped/padded` 与放行结果） | 见下文各条证据 |
| 独立脚本（复刻 CL-30b 差分语料，固定种子） | `passed=32 rejected=920 failures=0`（2000 次注入中 952 个 parse 失败样本计入语料） |
| 独立脚本（M1/M2/M3 元缺陷变体） | M1 使 CL-32 翻转、M3 使 CL-33 翻转、M2 使 CL-18 翻转（均被杀死），见第六节 |

> 说明：工作区另有 `desktop/service/routes.generated.ts`、`desktop/shared/command-catalogs.generated.json` 的改动（仅 sourceHashes 变化，`git diff` 已查看），与本任务无关，不属本审核范围；提交本修复时不得夹带。

## 一、逐项结论

### 1. 算法正确性 —— 通过

- **转义口径与既有实现一致**：`repairContainerClosers`（`src/lib/ai/tool-input-repair.ts:156-165`）使用通用 `escaped` 标志（任意 `\` 消费下一字符），与 `repairPlanningClosingBoundary`（同文件 `14-23`）逐字一致；`\uXXXX` 由「`\` + `u` 被消费、其余 4 位按普通字符处理」隐式满足（`:160-161`）。CL-06/CL-07 通过，`\\` 结尾与 `\uXXXX` 未被误判为未闭合。
- **字面量内闭合符被忽略**：`:158-164` 的 `inString` 分支只识别转义与闭合 `"`，其余字符（含 `}`/`]`/`{`/`[`）只做 `out.push`。实证：CL-32（`[{"content":"x}y","b":1]]`）实测 `rewritten=1, dropped=0, padded=0`，字面量内 `}` 未被计入；CL-33（`[{"a":"x]y"}`）实测 `rewritten=0, padded=1`，字面量内 `]` 未被计入。
- **LIFO 补齐正确**：`:180` 为 `stack.slice().reverse().map(...).join("")`，即栈顶→栈底。实证 CL-18 输出 `[{"a":{"b":1}}]`（若 FIFO 应为 `[{"a":{"b":1}]}`，无法 parse）。
  - 备注：因放行要求 `padded ≤ 1`（`:207`），LIFO 与 FIFO 在**所有放行例**上行为不可观测；实现取 LIFO，符合 235:84，但它是不可观测约束（236:95 已承认）。235:85「若 FIFO 会产出非法 JSON」的论证只在 `padded ≥ 2`（必被拒绝）时成立，属文档表述张力，不影响代码。
- **`inString === true` 时返回 null 覆盖全部「字面量未闭合」形态**：`:177-178` 在补齐之前返回 null。已实证覆盖：字面量内截断（CL-10）、`\uXXXX` 中间截断（CL-14）、转义反斜杠结尾（CL-14，实测 `[{"a":"C:\` → `null`，`reject:cond1`）、孤立引号导致的未闭合（扫描器同样以 `inString=true` 保守拒绝）。不存在「字面量未闭合但 `inString=false`」的形态（引号计数为奇必然停留在字面量内，转义已归一）。

### 2. 放行条件 —— 通过

- 求值顺序与 235:90-104 完全一致：
  1. 字面量完整性：扫描器内 `:177-178`，**早于**补齐 `:180`，也早于任何 parse；
  2. 错乱信号：`:207` `repaired.rewritten >= 1 && repaired.padded <= 1`；
  3. 解析成功：`:209` 的 `try/catch` 独立包住 `JSON.parse(repaired.value)`；
  4. 类型一致：`:210` 复用 `accept`（与 `matchingContainerSchema` 口径一致，`:192-196`、`:134-148`）。
- 未发现可达的「parse 成功但内容被改」路径：扫描器对非闭合符一律原样 `out.push`（`:175`），开括号只入栈+push（`:166`），只有闭合符会「改写/丢弃」（`:167-174`）。
- 未发现「改出全新内容」的路径；结构重解释（operation 数量偏少、数值被截断解释）属 235「范围收窄声明／已知会放行」的已声明残余（CL-25 实测 `rewritten=1, padded=1` → 放行且 `ops.length === 1`）。
- 条件 3 本身在实现中可达且正确：`[{"a":1,]` 实测 `rewritten=1, padded=1`，修正串 `[{"a":1,}]` parse 失败 → `reject:cond3`。**但测试集没有覆盖到它，见 R1。**

### 3. 安全性 —— 通过

- 「只增删改闭合符」成立：`:166-175` 穷举了所有分支，除闭合符分支外均为原字符 push；不存在 `char` 被替换、插入或跳过的其他路径。
- 不具备「伪造缺失内容」能力：`padded` 只在末尾追加闭合符（`:180-181`），无法生成 ID、版本、文案、数组元素。
- `dropped` **确实不参与放行**：`:169` 仅自增，返回对象里的 `dropped`（`:181`）在 `:207` 的判断条件中未被引用；实测 `dropped` 无上限（CL-04 实测 `dropped=2`）、CL-01 实测 `dropped=1`，均按 235:100 放行。
- 一个未在 235/236 显式登记的边界（不阻塞）：`[{]` 实测 `rewritten=1, padded=1` → `[{}]` 放行，会「无中生有」一个空对象容器（不是内容字符）。建议在 241 验证文档把这类「结构级重解释（空容器/分组变化）」与「op 数偏少」并列登记，避免验证阶段误报。

### 4. 既有行为回归 —— 通过

- 三条前置判据原样保留：schema 必须含 `object`/`array`（`:187`）、联合含 `string` 不处理（`:189`）、不以 `{`/`[` 开头不处理（`:191`）。
- 「直接 parse 成功且类型匹配」路径（`:197-200`）在 repair 之前返回；「直接 parse 成功但类型不符」落到 `:212 return undefined`，与改动前等价（旧的 `[1,2]` vs object schema 用例在 `tests/unit/tool-input-repair.test.ts:60-64` 仍通过）。
- `normalizeToolInput` 递归在还原后不中断：CL-05（`"78"→78`）、CL-27（`bigFive` 的 `"78"→78`）实测通过；`matchingContainerSchema` 未被改动（`:134-148`）。
- 既有 9 用例 9/9 通过；`toolInputIssueHint`（`:280-294`）无改动。

### 5. 与 `parsePlanningToolJson` 的交互 —— 通过

- 调用顺序：`repairToolInput:242` 先 `parsePlanningToolJson`（`:49-107`），再 `:256` `normalizeToolInput`。`parsePlanningToolJson` 只负责顶层 tool-call JSON 与其 `arguments`/字符串包裹的解包（最多 4 层，`:52-61`），内层 `operations` 字符串落库前不会被它触碰 → 与本次修复无重叠。
- 实测双层编码 CL-35（`{"arguments":"{\"expectedVersion\":37,\"operations\":\"<错乱>\"}"}`）通过：解包后由 `normalizeToolInput` 修复，`proposeNovelPlanningSchema.safeParse` 通过。
- 未见「同一字符串被两套逻辑各修一次」的路径：`repairPlanningClosingBoundary` 只在顶层 `JSON.parse` 抛 `Expected double-quoted property name` 时才进入（`:78-84`），而本次故障的顶层 JSON 合法。

### 6. 测试有效性 —— 部分不通过（见 R1、R3）

- **CL-30a（`tests/unit/tool-input-container-closer-repair.test.ts:295-338`）**：参照切分器与被测栈式扫描器**结构不同构**（不维护栈、不做补齐、不做改写），满足 236:93 的最低要求；无 `JSON.parse` 反推。
  - 共因盲区（低风险）：转义/引号规则与被测**同源**（同一 JSON 规范实现），若该规则本身写错，两侧会同错。这属于「独立实现≠不同语义」，可接受，但应知情。
  - 断言口径弱于文档：比较对象是 `JSON.stringify(repaired)`（`:332`、`:336`），(a) 对含 `\uXXXX`/代理对内容的夹具会因重编码产生**假失败**（当前用例未包含此类，CL-07 未被纳入 CL-30a）；(b) `skeleton`（`:315-317`）剥掉**所有**括号，因此无法发现「开括号被错误增删」，而 236:93 写的是「结构段差异仅限闭合符位置」。建议见可选建议 S2。
- **CL-30b（`:340-374`）**：固定种子 xorshift32（`:342`），2000 次注入中 952 个 parse 失败样本计入语料（`:360`）；独立复跑得 `passed=32 / rejected=920 / failures=0`，无骨架误报、无 op 数超标。下限断言 `passed > 0`（`:373`）有效——移除新逻辑后放行数必为 0，不会空洞通过。未发现误报风险。
- **CL-30c（`:376-383`）**：**未真正注入错误实现**，只是复述 CL-18 的期望（`:381`），与 236:95「对错误实现逐一跑测试集」的形式不符。但判别力经独立模拟核实真实存在（见下），故判为非阻塞。
  - M1（忘记字面量状态）：CL-32 由 `accept` 翻转为 `reject:cond2`（字面量内 `}` 被当作结构闭合，`rewritten` 变 0）→ 可杀。
  - M3（字面量内闭合符计入 `rewritten`）：CL-33 由 `reject:cond2` 翻转为 `accept` → 可杀。
  - M2（去掉 `padded ≤ 1`）：CL-18 由 `reject:cond2` 翻转为 `accept` → 可杀。
- **CL-31（`:199-203`）不成立**，见 R1。

### 7. 代码质量 —— 通过（含两处非阻塞建议）

- 命名、注释贴合既有风格（中文职责注释 + 口径说明）；单次线性扫描，`out` 数组 push + 末尾 `join`（`:155-181`），符合 235:257；无多余抽象，`accept` 的抽取消除了原三处重复分支。
- `dropped`（`:169`、`:181`）**没有任何消费方**：函数未导出，测试无法断言统计量。这正是 CL-02/CL-16/CL-31/CL-32 统计标注错误长期未被发现的直接原因（R2）。建议见可选建议 S3。
- 无未使用参数/变量导致的编译告警（`npm run typecheck` 退出码 0）。

### 8. 文档一致性 —— 部分不一致（见 R2）

以「复刻扫描器 + 真实 `normalizeToolInput`」实测各夹具统计，对照 235/236 标注：

| 用例 | 236 声称 | 实测 | 结论 |
| --- | --- | --- | --- |
| CL-01（test:43 / 236:31） | rew=2, drop=1, pad=0 | rew=2, drop=1, pad=0 | 一致 |
| CL-02（test:53 / 236:32） | rew=1, drop=0, pad=1 | **rew=2, drop=0, pad=0** | 不一致（夹具并非「形态 B」） |
| CL-04（236:34） | rew≥1, pad=0 | rew=2, pad=0 | 一致 |
| CL-05（236:35） | pad=1 | rew=1, pad=1 | 一致 |
| CL-15（236:50） | rew=0, drop=1 | rew=0, drop=1 | 一致 |
| CL-16（236:51） | rew=0, pad=1 | **rew=0, pad=2** | 不一致（结论仍为拒绝，但依据不同层级） |
| CL-18（236:53） | pad=2 | rew=1, pad=2 | 一致 |
| CL-25 | — | rew=1, pad=1 | 与「范围收窄声明」一致 |
| CL-31（test:201 / 236:60 / 239:22） | rew=1, pad=1 → 条件 3 | **rew=1, pad=2 → 条件 2** | 不一致（且未覆盖条件 3） |
| CL-32（test:226 / 236:66） | rew=1, pad=1 | rew=1, **pad=0** | 不一致（放行结论不变） |
| CL-33（236:67） | rew=0, pad=1 | rew=0, pad=1 | 一致 |

其它文档核对：
- 235:99 的真实样本统计（`rewritten = 2/1/1/2/2`、`padded = 0/1/1/0/0`）无法独立复核（真实样本未入库，符合数据隔离纪律），本审核不采信也不质疑，交 241 真实验证承担。
- 236:94 声称「≥2000 例」，实际是「注入 2000 次、其中 952 例 parse 失败计入语料」；已实跑确认，属表述精度问题，不影响判别力。
- 235:191-198「已知会放行」与实现一致（CL-25 实测放行且 op 数=1）。

## 二、必须修复项

| 编号 | 级别 | 位置 | 问题与证据 | 修复要求 |
| --- | --- | --- | --- | --- |
| **R1** | **阻塞（仅测试/文档，不改生产代码）** | `tests/unit/tool-input-container-closer-repair.test.ts:199-203`；`docs/236:60` | CL-31 夹具实际为 `rewritten=1, dropped=0, padded=2`，被**条件 2（padded ≤ 1）**拦下，而非文档声称的「条件 3（parse 失败）」。实测：`[{"kind":"put","collection":"cards","value":{"id":"c1","x":1,]` → `reject:cond2`，修正串 `[{"kind":"put","collection":"cards","value":{"id":"c1","x":1,}}` 从未进入 `JSON.parse`。239:22 要求的「条件 3 关键安全网」在整套用例中**零覆盖**。 | 夹具改为能走满条件 1/2 再 parse 失败的最小形态，例如 `[{"a":1,]`（实测 `rewritten=1, padded=1`、修正串 `[{"a":1,}]` parse 失败 → `reject:cond3`）；同步修正 236:60 与测试注释。断言应保持「入参原值不变」，并（建议）用能区分条件 2/条件 3 的注释说明依据。 |
| **R2** | 非阻塞（须同批修正文档/注释） | `docs/236:32,51,66`；`tests:53,150,226` | CL-02、CL-16、CL-32 的统计标注与实测不符（见第 8 节表）；其中 CL-02 声称代表真实 5 样本的「形态 B（rew=1,pad=1）」，但夹具实为 `rew=2,pad=0`，形态 B 在正例集中实际缺失（仅 CL-05 以不同内容覆盖 `padded=1` 放行）。CL-02 注释「代表 2/5 份真实样本」因此误导验收。 | 二选一：(a) 修正 CL-02 夹具为 `'[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"]}'`（实测 `rew=1,pad=1` → 放行且内容完整），使注释为真；或 (b) 保留夹具但删除「形态 B」表述。同时修正 CL-16（pad=2）、CL-32（pad=0）的注释数字。 |
| **R3** | 非阻塞 | `tests:376-383` | CL-30c 未注入任何错误实现，只是重新断言 CL-18（与 CL-18 本体重复），不满足 236:95 的用例设计要求。判别力本身已由独立模拟确认（M1/M2/M3 均可被现有夹具杀死），故不阻塞。 | 把三种错误实现写成测试内的局部函数副本（或对扫描器做可注入的临时变体），实际跑 CL-32/CL-33/CL-18 并断言其翻转；若坚持现状，须在 236:95 注明「已由独立审核模拟替代」。 |
| **R4** | 非阻塞 | `tests:4`；`package.json:42,68` | 测试直接 `import { asSchema } from "@ai-sdk/provider-utils"`，但该包未在 `package.json` 声明（仅 `ai`、`zod`），当前依赖传递/提升才可解析。依赖树变化时测试会整体无法加载。 | 在 `devDependencies` 声明 `@ai-sdk/provider-utils`（版本与 `ai` 兼容），或改用 `ai` 暴露的等价 schema 导出。 |

## 三、可选建议（不阻塞）

- **S1（条件 3 的端到端加固）**：除 R1 的最小夹具外，建议补一条真实入口形态的条件 3 断言：`{"expectedVersion":37,"operations":"[{\"kind\":\"put\",\"collection\":\"cards\",\"value\":{\"id\":\"c1\",\"x\":1,]"}`（op 内部悬挂逗号）。实测 `repairToolInput` 返回 `null`（不修复、保持原入参），确认不会补出残缺提案。注意：该形态若在 value 层多保留一层开括号会变成 `padded=2`（走条件 2），因此端到端夹具必须用上述「数组 + 单对象」结构。
- **S2（CL-30a 断言口径）**：不要用 `JSON.stringify(repaired)` 回写比较字面量（对 `\uXXXX`/代理对会重编码产生假失败）；改为：拒绝例直接比原字符串，放行例对 `repaired` 递归取字符串值再与原文按字面量分段比较；结构段比较显式排除 `{}[]` 后再要求「开括号数量相等 + 顺序一致」，以覆盖「开括号被误增删」这一当前盲区。
- **S3（统计量可观测）**：`dropped` 目前是死统计。建议为测试导出只读的 `repairContainerClosers`（或返回带 `inString` 标志的 debug 视图），使 236 的 rewritten/padded 期望可以**被断言**而不是只写在注释里——R2 这类错标即可被机器拦住。
- **S4（LIFO 文档）**：235:85 的 LIFO 必要性论证与「padded ≤ 1 才放行」存在张力；建议在 235 或 241 注明「LIFO 仅为实现纪律，放行例不可观测」，避免后续审核反复追问。
- **S5（结构级重解释登记）**：`[{]` → `[{}]` 这类「空容器凭空出现」属结构级重解释，不伪造内容但未在 235/236 声明；建议在 241 验证文档与 235「已知会放行的形态」中补登记。
- **S6（可选用例）**：239 建议但未采纳的 CL-34（多 op 中途类型错位，`rew=1,pad=0` 放行且全部 op 完整）与 CL-36（接近 200 op 的线性/大输入冒烟）可放在 241 验证阶段承担，若采纳则补入 236。

## 四、总结论

**须先修（R1），修复范围仅限测试夹具与 236 相关标注，生产代码无需改动。**

依据：

1. 生产实现（`src/lib/ai/tool-input-repair.ts:150-213`）在转义口径、字面量忽略、LIFO 补齐、四条放行条件顺序、只动闭合符、与既有路径/`parsePlanningToolJson` 的交互上**均通过**；`npm run typecheck` 退出码 0，两组单测 35/35、9/9 全绿；差分与元缺陷独立模拟未发现内容被改动或错误放行。
2. 但用例集存在一处**阻塞级证据缺口**：239 明确要求（优先级「高（须补）」）的「错位 + 悬挂 `,` → 条件 3 拦截」用例实际被**条件 2** 拦截，条件 3 在整套用例中零覆盖；若未来误删 `:209` 的 `try/catch`，现有测试不会变红。R1 修正（1 个夹具 + 1 行注释）后即可进入全量用例与真实目标系统验证。
3. R2/R3/R4 不改变运行时行为，建议与 R1 同批一并处理，避免 241 验收被错误统计标注误导。

---

# 复核结果（2026-10-27，独立复核主代理修复）

复核方式：只读源码/测试 + 重跑用例 + 复刻扫描器逐夹具核算 `rewritten/dropped/padded` 与放行条件。未改动源码/测试，仅追加本节。

## 实跑证据

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/unit/tool-input-container-closer-repair.test.ts` | `tests 35 / pass 35 / fail 0`（1.64s） |
| `node --import tsx --test tests/unit/tool-input-repair.test.ts` | `tests 9 / pass 9 / fail 0` |
| `npm run typecheck`（`tsc --noEmit`） | 退出码 0，无输出 |
| 复刻扫描器逐夹具核算 | 见下方 R1/R2 证据 |
| 元缺陷变体复跑（M1/M2/M3） | M1 使 CL-32 翻转、M3 使 CL-33 翻转、M2 使 CL-18 翻转，判别力保持 |

生产代码 `src/lib/ai/tool-input-repair.ts` 的 diff 与初审时逐字相同（未再改动）。

## 逐项状态

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| **R1** | **已修复** | 新夹具 `tests/unit/tool-input-container-closer-repair.test.ts:200` = `[{"kind":"put","collection":"cards","value":{"id":"c1"},"x":1,]`，实测 `rewritten=1, dropped=0, padded=1`，修正串 `[{"kind":"put","collection":"cards","value":{"id":"c1"},"x":1,}]` **parse 失败** → `reject:cond3`（确由条件 3 拦截，而非条件 2）。条件 3 自此有真实覆盖。`docs/236:60` 已同步夹具与统计。 |
| **R2** | **已修复** | CL-02 `test:53` = `'...标题一"}]'`，实测 `rew=1, drop=0, pad=1` → `accept`，与 `236:32`「形态 B（1/0/1）」一致；CL-16 `test:149` = `{"a":1` + object schema，实测 `rew=0, pad=1` → `reject:cond2`，与 `236:51` 一致；CL-32 `test:226` = `[{"content":"x}y","b":1]`，实测 `rew=1, pad=1` → `accept`（内容 `x}y` 完整），与 `236:66` 一致。CL-01（2/1/0）、CL-18（1/…/2）、CL-33（0/…/1）、CL-25（1/…/1）复测仍与文档一致。 |
| **R4** | **已修复** | `test:3` 改为 `import { asSchema, tool, type ToolSet } from "ai"`，不再引用未声明的 `@ai-sdk/provider-utils`；typecheck 与 35 用例均通过，说明 `ai` 公开导出可用。 |
| **R3** | **未修复（维持非阻塞）** | `test:375-382` 的 CL-30c 仍是复述 CL-18 期望、未真正注入变体实现。独立复跑确认判别力真实存在：M1 使 CL-32 由 `accept` → `reject:cond2`，M3 使 CL-33 由 `reject:cond2` → `accept`，M2 使 CL-18 由 `reject:cond2` → `accept`（用新 CL-32 夹具同样成立）。可作为后续测试加固项，不阻塞。 |

## 复核中新发现（均为非阻塞）

- CL-30a 的夹具列表（`test:319-324`）未随 R2 同步：其第 2、3 条仍是旧 CL-02/旧 CL-32 变体。该用例只做「内容未变」断言，不要求与编号夹具逐字对齐，结论不受影响；如需严格一致可顺手同步。
- 初审 S2（`JSON.stringify(repaired)` 回写比较对 `\uXXXX` 会重编码假失败、`skeleton` 剥掉全部括号导致「开括号被误增删」不可见）与 S3（`dropped` 死统计）仍在，均为可选加固，不阻塞。
- `desktop/shared/command-catalogs.generated.json`、`desktop/service/routes.generated.ts` 的工作区改动仍在（与本任务无关），提交时不得夹带。

## 复核结论

**可以进入全量用例与真实目标系统验证。** R1/R2/R4 已修复并有实跑证据，无剩余阻塞项；R3 与 S2/S3 为可选测试加固。
