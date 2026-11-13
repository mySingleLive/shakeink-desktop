# 546 测试用例独立审核：导入主题定位

审核对象：`docs/546-import-theme-position-cases.md`。依据：`docs/545-import-theme-position-plan.md`（§6 优先）及 `docs/545-import-theme-position-plan-review.md`。只读审核，未运行测试或应用。

## 已核实

- 用例覆盖了 §3 + §6 的主要条目：契约文本与纠错文案（TP-01~03，对应 3.1、H2）；不限→由题材推频道、两频道题材不猜（TP-10/11，M5）；必填纠错（TP-12/13/18，H1）；简介 15 行/300 字句末截断（TP-14/15，M3）；旧会话 300–500 字解码（TP-16，L1）；tags 只清 tags（TP-19，H1）；开篇样本（TP-20，M2）；3 次尝试与精简第 3 次（TP-21/22，H3、M6）；同 id 去重（TP-24/25，3.3）；本地兜底频道与排除词（TP-26~28，H3）；无定位简介 fallback（TP-31/34，H4）；审核脚本（TP-38/39，M1）；真实目标（TP-41~44，M4、L2）。
- 现有辅助可以支撑大部分用例：
  - `tests/unit/novel-import-theme-position.test.ts` 已有 `run()`（经 `generateImportAiJson` 注入逐轮回复，可读 `prompts[1]` 纠错反馈与 `generations`）和 `repaired()`（`repairSettingsReply`），TP-10~19 可直接写。
  - `tests/unit/novel-import-result-quality.test.ts` 的 `themeAi`/`runSettings`（`legacySceneFixture` + `rosterAi` + `worldsAi`）可承接 TP-20~23、TP-25~28，`f.requests.filter(r=>r.themeProfile)` 可数尝试次数。
  - 发布集成的 `input()`/`material()`/`profileMaterial()` 可承接 TP-30~33（L4：H4 统一后不需要向导会话）。
- 真实目标驱动 `/private/tmp/shakeink-theme-545/launch-theme.mjs` 已设 `LOTM_THEME_ONLY:'1'`（`run-theme.mjs:32` 目标只为 `['theme']`），`VOLUME='小丑'`（:12），读回 `quality-readback.json` 已记录 channel/genre/sellingPoints/targetAudience/synopsis/synopsisLines/synopsisChars 和 `profileArtifact`、settings dropped（:266-268），并截主题面板（:270）。TP-41~44 与用户要求（男频、非“全部”、卖点受众非空、≤15 行、只讲世界观/主角/开篇、LOTM 第一卷、只导入主题）方向一致。
- `taxonomy.ts:33-36`：现实、轻小说两频道都有，其余唯一；TP-10（玄幻→男频、古风言情→女频）与 TP-11（现实不猜）取值正确。

## 问题清单

### 高

**H1. 会改变的 542 用例没有逐条给出新期望值，其中 IQ-33/34、IQ-48 未被列出且会失败。**
用例文档只在 TP-31 写“替代 IQ-42”、TP-38 提到 lotm-local-import-audit，其余 542 用例没有对应。逐条看现有断言（`tests/unit/novel-import-result-quality.test.ts`）：
- IQ-33/34（:68）：`channel:'都市频', genre:'奇幻'` 期望 channel/genre/tags 都被清空。按 M5，不合法频道且奇幻只属男频，应修为 `男频` 并保留 genre，原断言会失败。`channel:'女频', genre:'玄幻'`（频道与题材冲突）期望清 genre/tags；H1 只说“逐级清除只保留清 tags”，没说这个“题材不属于频道”分支是否保留，用例也没给值。
- IQ-48（:148）：同一 `都市频` 输入，`clearedPosition` 计数在 M5 下仍为 1 吗？需写明。
- IQ-35（:78）：`synopsis` 501 字仍应解码失败（LIMITS 500 不变），文档未声明保留。
- IQ-35b（:172）：`synopsis:'简'.repeat(600)` 期望 500 字，新规则应为 300 字（无句末，按字符截），`clearedPosition` 仍为 2。
- IQ-36（:83）：断言 prompt 含“蒸汽朋克”；按 M4 的新定义该词是否仍在契约中要确认。
- IQ-38（:122）：2 次→3 次；dropped 文案在 fixture 正文（`bodyF` 无“他/她”）下应为原文案。
- IQ-42（integration :102）：5000 字断言删除或改写，需明说“删除，由 TP-31 替代”。

修改：在文档中加一节“542 用例修订”，按编号写出旧值→新值；补 `女频+玄幻`（频道题材冲突）的期望：建议保留 channel、清 genre/tags、进入纠错并在反馈中提“题材”，与 H1“genre 不合法交给纠错轮”一致。

**H2. 本地兜底频道的第 1 级（主角性别）没有用例，第 2 级的计数与边界不确定。**
§6 H3 规定先看“已导入角色中唯一主角的 gender 以男/女开头”，再看代词。TP-26~28 只覆盖代词。另外：
- TP-26“远多于”、TP-28“接近”没有数值；2 倍边界（“不少于”即 ≥2 倍）未测。
- TP-27“他们/其他很多而单字她多”期望不明确：要给出原始计数和排除后的计数，例如“他们×10、其他×5、他×2、她×5”→排除后 他 2、她 5→女频；不排除时 他 17 会判男频，这才能证明排除生效。排除词表应与 §6 一致（其他、其它、他们、她们），评审曾提的“他人、她人”未纳入方案，用例应以方案为准并写明。
- 统计范围是“正文”（`workingImportUnits` 还是已选章节正文）未写，fixture 中带“他/她”的正文需自建 `source(...)` 文件，`bodyF()` 不含这两个字。
- 引文“第一个正文单元开头 20 字”、产物 schema 2/固定 id、进入 `importPlanHash` 都没有断言。

修改：增加 TP-26a（只导入主题时无角色→走代词；有角色时唯一主角 gender“男性”→男频，即使代词偏“她”）、TP-26b（两名主角性别不同→跳到代词）、TP-28a（他=2×她 →男频；他=2×她−1 →不生成）。TP-26 补断言：`evidence[0].quote===units[0].text` 前 20 字，`schema===2`，产物出现在 `journal().artifacts`，计划哈希与无兜底时不同。

**H3. 纠错只针对修复后条目（§6 H1 的核心）没有专门用例。**
H1 的根因是原始回复里的无法定位引文、超长字段等被再次报给模型。TP-13 只检查反馈“提到对应字段”，没检查反馈不含其它已被修复的问题。
修改：增加用例：回复同时有一条无法定位的引文（如 IQ-51b 的写法，request.artifacts 带已验证主题）、`sellingPoints:'卖'.repeat(2500)` 和空 `targetAudience`；期望第 1 轮后反馈以“主题定位缺少”开头、只提受众，不含“证据”“引文”“过长”等词；第 2 轮完整时成功，`generations===2`，`clearedPosition>=1` 保留。

### 中

**M1. 样本算法（§6 M2）只测了最常见路径。**
TP-20 没写 k 的起始值（§6 为 3，§3.3 写的 6 已被覆盖），也没有预算收缩路径。
修改：TP-20 期望写成“`units[0..2]` 为工作正文前 3 个单元”；增加 TP-20a：用很小的 `contextWindow` 模型（`fixture` 的 `over.models`）使 3 个开篇放不下 → 实际请求只有 `units[0]`、`artifacts` 为空且仍发出；TP-20b：1 个开篇也放不下 → 无定位请求，主题任务 done、dropped 为原文案。另加“主题引文在开篇之外时也在样本中且按书序”的断言。

**M2. 原资料复制主题与 300 字 fallback 的关系未覆盖。**
`novel-import-publish.ts:124-129` 的 `themeText` 是所有非定位主题（含 `origin:'source'`）的拼接。H4 规定拼接截到 300 字，同时要求“原资料复制主题原样写入（IQ-11b）”。TP-33 只用一条短的原资料主题，测不出冲突。
修改：增加 TP-33a：原资料主题 800 字、无推断主题、无定位 → 期望值需先在方案中定（建议原样写入）；TP-33b：原资料主题 + 推断主题混合 → 写明期望（原资料原样在前、推断部分是否截断）。没有定论前此项是方案缺口，应回到方案补一句。

**M3. 部分用例的期望不可判定或依赖未导出函数。**
- TP-24：`validateSemanticLinks` 未导出（`novel-import-ai.ts:957` 是模块内函数）。改为通过 `run(request({artifacts:[themeA,themeB]}),[完整回复])`（两主题同 id `theme-1`、不同名），期望 `runImportAi` 拒绝且错误含“模型实体标识与原类型或父级身份冲突”。
- TP-19b“修复与校验行为不变”无可断言值。改为：普通主题批次（`themeProfile` 未设）回复 `facts:{}`，`generations===1`，返回条目 facts 为空，反馈未出现“主题定位缺少”。
- TP-31“两段长推断主题”：`'长'.repeat(4000)` 没有句末标点，只能测字符截断。拆成三组：无句末→恰 300 字；含句号→截到 300 字内最后一个“。”，给出准确字符串；20 个短句各一行→恰 15 个非空行。另断言 `channel===''`、`genre` 为默认值。
- TP-14：须保证 20 行总字数 <300，否则测到的是 300 字规则；写明每行如“第n句。”，期望恰好 15 行、`clearedPosition+1`。
- TP-39：`scripts/audit-real-novel-import.ts` 没有单元测试（`tests/` 中无引用）。改为“代码检查 + 真实运行读回时该脚本 `theme-full-text` 通过”，或新增可调用的纯函数并单测；不要标为单元。
- TP-38：写出期望：`synopsis===importThemeSynopsisFallback(joined('theme'))`，channel/genre/tags/sellingPoints/targetAudience 仍为空（`scripts/audit-lotm-local-import.ts:185-192` 同步修改）。

**M4. 真实目标期望缺项。**
- TP-41 没要求 synopsis 非空（空串也满足 ≤15 行、≤300 字）。补 `synopsisChars>0`，sellingPoints/targetAudience 去空白后非空。
- 没区分“模型定位成功”与“兜底”：兜底产物只有 channel，genre 会是“全部”，TP-41 会失败，但原因要能看出。补：`profileArtifact===true`、settings dropped 中无“主题定位”，并从 `app-stderr.log` 统计 `theme-profile-fail` 行数作为尝试次数（TP-43 写了“记录”，但没有说读哪一行、记到哪个文件）。
- 补前置条件：运行前已在 Node 24 下 `npm run build`，运行中不重建；`state.json` 哈希不变（launcher 已断言）。
- TP-44 截图期望补：频道显示“男频”而非“不限”，题材不是“全部”。

**M5. TP-40 的通过标准与 AGENTS.md 不符。**
“与 542 基线比无新增失败”允许已有失败存在。AGENTS.md 要求“全部通过后总结”。改为 `npm test`、`npm run typecheck`、`npm run build` 全部 0 失败；如确有与本改动无关的已知失败，逐条列出用例名与原因。

**M6. 不可重跑错误与跳过没有用例。**
§3.3 规定“授权、中止、跳过仍立即结束”，TP-23 只测中止。补：定位请求抛授权类错误（非 `worldEntryRerunnable`）→ 只 1 次请求；任务被跳过 → 不再尝试。另在 TP-21 中断言第 1、2 次请求仍带去重后的 context 主题，只有第 3 次为空。

### 低

- L1. TP-12 只说“channel 保留”；补“genre 为全部时纠错轮中 sellingPoints 等其它字段原样保留”。
- L2. TP-10 补 `不限 + 现实` → channel 被清除并进入纠错（M5“仍为不限时清除”）。
- L3. M6 的调试行 attempt 取值 1–3（类型由 `1|2` 扩展）没有用例；可在 TP-21 设 `SHAKEINK_IMPORT_DEBUG=1` 时捕获 stderr，或在代码审核中确认。
- L4. TP-34 补：输入恰为 300 字/15 行时原样返回；仅含空白行时的行计数。
- L5. 方案 L3 的台账 `docs/requirements-traceability.json` 追加 NI-19 没有对应验收项；在 E 节加一项“NI-19 只追加，其它条目不变（git diff 只增）”。
- L6. TP-26 的 dropped 文案应写全：“主题定位未能推断，频道已按正文推断，题材、卖点与受众已留空”，并说明 H4 下简介不再为空，文案不提简介。

## 结论

用例结构完整，大部分可用现有辅助直接实现，真实目标用例与用户要求一致。需要修订后再进入实现：

- 高：补齐 542 现有用例的新期望值（尤其 IQ-33/34、IQ-48 在 M5 下会失败，以及频道题材冲突的处理）；补兜底第 1 级主角性别和代词计数的确定数值与 2 倍边界；补“纠错只报修复后缺失字段”的用例。
- 中：样本收缩路径、原资料主题与 300 字 fallback 的冲突（需先回方案定期望）、TP-24/19b/31/14/39/38 的可判定期望、真实目标的 synopsis 非空和成功/兜底区分、TP-40 改为全部通过、授权/跳过不重跑。
