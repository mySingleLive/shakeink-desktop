# 547 · 导入主题定位（545）代码审核

日期：2026-11-11。范围：docs/545（以 §6 为准）与 docs/546 用例对应的未提交改动。539–544 的其它改动不在本次范围。

## 执行的检查

- `node --import tsx --test tests/unit/novel-import-theme-position.test.ts`：17/17 通过。
- `tests/unit/novel-import-result-quality.test.ts` 与 `tests/unit/lotm-local-import-audit.test.ts` 一起运行：46 通过、1 失败。失败项是 `volume-first chapter title prefix has independent raw and imported chapter hashes`（`FROZEN_CHAPTER_ORACLE_MISMATCH`），属于章节标题哈希检查，与主题无关。在 HEAD 的临时 worktree 中复跑时，因 node_modules 是软链接报 `DIRECTORY_LINK_OR_TYPE`，所以无法确认它是否在 545 之前就已失败，需要主代理另行确认。
- `tests/integration/novel-import-result-quality-publish.test.ts`：6/6 通过。
- 临时探针（已删除）：
  - `importThemeSynopsisFallback('甲。\n\n乙。')` 返回 `'甲。\n乙。'`。
  - `'他说：“走吧。”'+'乙'×300` 截断后得到 `他说：“走吧。`，后引号丢失。
  - 一份合规的定位回复，只要 synopsis 含空行，就会记 `clearedPosition:1`。
  - channel 为 `' 男频'`（前有空格）时，`repairSettingsReply` 返回 undefined。
  - 定位回复在两轮里都是 genre“全部”时，共 2 次生成，然后报 `模型返回结构不完整（artifacts.0.facts）`。该文案能被 `worldEntryRerunnable` 匹配，所以会进入下一次尝试。

## 已核对、未发现问题的点

- **完整性 issue 只在其它检查之后加入。** superRefine 依次检查：已有 issue 直接返回，然后核对 id/name，再做严格解码（失败时给通用文案并返回），最后才调用 `themeProfileGaps`（`novel-import-ai.ts:575-581`）。因此 `settingsItemValid` 里的 `gapOnly`（:1373）只会放行“其它全部通过、只缺字段”的条目。放行之后仍会执行 evidence、解码和链接校验（:1377）。id 错误的文案以“主题定位artifact”开头，不会被误判为缺字段。
- **纠错后仍只缺字段时能干净失败。** 探针确认会报结构不完整，并按 `worldEntryRerunnable` 重跑，一共 3 次尝试。
- **中止与授权错误立即抛出**（`main/novel-import.ts:1104`），两次尝试之间会检查 `halted()` 并调用 `this.current`。lane 只获取一次，在 finally 中释放，3 次尝试期间没有泄漏。
- **其它设定类型不受影响。** 文风、金手指、爽点泪点以及普通主题批次不会经过 themeProfile 分支。`repairSettingsReply` 的“未修改时返回 undefined”只对定位请求取消（:1307）。批次 `run` 新增“id 等于定位 id 时拒收”（:1045），属于合理收紧。TP-19b 覆盖了这一点。
- **旧会话兼容。** 542 的定位产物 channel 为“不限”时，`themePositionValid` 仍接受（POSITION_CHANNELS 含“不限”）。只有 genre、没有 channel 时，只要 genre 属于任一频道且没有 tags，也能解码（`novel-import-semantics.ts:214`）。发布时 genre 随 channel 一起写入，没有 channel 就不写 genre，不会报错。300–500 字的简介仍可解码（TP-16）。
- **调试行只含固定文案。** `theme-profile-fail` 取 `error.message` 前 80 字，`theme-profile-shape` 只含字段键、类型、长度和固定原因。传输错误如果带回服务端正文，会截入前 80 字，这一点 542 起就存在，本次未改变。

## 问题

### 中

**M1 原资料主题被截断，或在有定位时被整段舍弃。** 位置：`desktop/service/novel-import-publish.ts:122,127`

`themeText` 包含 `origin:'source'` 的主题，然后整体交给 `importThemeSynopsisFallback`。这会删除空行和行尾空白，并截到 15 行、300 字。§6 H4 和 IQ-11b 要求“原资料复制主题仍原样写入”。IQ-11b 只用了一句短文本，所以测试仍能通过。另外，有定位简介时，原资料主题完全不进入简介。

修复：
- 把原资料主题与推断主题分开处理。
- 存在原资料主题时，按原文拼接写入，只在字符边界处截到 `themeSchema` 的 5000 字上限。
- 只对推断主题拼接使用 fallback。
- 有原资料主题时，定位简介不得覆盖它。也可以由方案明确取舍，但必须写进 546。
- IQ-11b 补一条 400 字、多段的原资料主题用例。

**M2 只缺字段的定位在 3 次失败后被整份丢弃。** 位置：`desktop/main/novel-import.ts:1098-1110`、`novel-import-ai.ts:1373`

一份频道、题材、简介都合法、只缺目标受众的回复，经过 6 次调用后会被全部丢弃，最后只剩本地兜底的频道。结果比 542 更差：542 至少保留已推断的字段。

修复：保留最后一次只缺字段的修复后产物，作为部分定位采纳。这需要在 `runImportAi` 失败时带出该产物，或者由主进程在第 3 次失败后对最后一次回复执行 `repairSettingsReply` 并采纳。dropped 文案改为列出实际缺少的项。频道仍缺失时，再由 `localThemeChannel` 补齐。这一条与 §6 H3 的取舍不同，需要主代理确认是否改方案。

**M3 部分用例没有真正覆盖方案要求。**
- TP-23（中止后不重跑）没有对应用例。
- TP-21/26 的期望值由被测函数 `localThemeChannel` 计算得出，属于同义反复。向导夹具正文的他/她计数大概率为 0，所以实际只走了“不生成兜底”的分支。“生成男频兜底产物并进入会话”和 TP-28 的原 dropped 文案都没有被断言。
- 没有用例覆盖“纠错轮仍只缺字段，因而失败，再进入第 2、3 次尝试”。
- TP-21 只断言 `ps[2].units.length<=3`，没有断言第 3 次的 units 等于开篇单元、前两次请求相同。
- TP-39（`audit-real-novel-import.ts` 的主题检查）没有用例。

修复：
- 在向导夹具中注入一段“他”远多于“她”的正文，断言 channel 为男频、没有 genre、dropped 含“频道已按正文推断”。
- 再构造一份他/她接近的正文，断言 dropped 为原文案。
- 增加中止用例：AbortError 只发 1 次请求，任务不是 done。
- 在 `novel-import-theme-position.test.ts` 中加一条：两轮都缺 genre 时，`runImportAi` 报结构不完整，且 `worldEntryRerunnable` 为真。

### 低

**L1 合规简介也被改写，并误计入 clearedPosition。** 位置：`novel-import-semantics.ts:72-73`、`novel-import-ai.ts:1363`

fallback 在提前返回前已经删除空行，并对每行 trimEnd。探针中“世界。\n\n主角。”被改写为“世界。\n主角。”，并计 1 次 clearedPosition。

修复：提前返回时检查原文（trim 后）是否已满足 15 行和 300 字，满足就返回原文。只有真正截断时才计数。

**L2 定位请求的修复计数从不展示。** 位置：`main/novel-import.ts:1091-1094`

定位请求的 `run` 不读取 `result.settingsRepairs`。`clearedPosition` 只由定位请求产生，所以 `recordSettingsRepairs` 里“N 处主题定位不合规已清除”的文案永远不会出现。这从 542 起就存在。

修复：把定位请求的 repairs 合并进该主题任务的 `repaired`。或者删除这段无效文案，在 546 中说明。

**L3 句末截断会留下未闭合的引号或括号。** 位置：`novel-import-semantics.ts:75`

截到“。”后，紧跟的“”」』）”会被丢掉。另外 `i>0` 不检查第 0 位。

修复：找到句末后，继续吞掉紧随的闭合符号（`”’」』）)】`）。循环条件改为 `i>=0`。

**L4 只做 trim 判断，修复值没有写回。** 位置：`novel-import-ai.ts:1351-1352`

channel 或 genre 带首尾空白（如“ 男频”）时，规则用 trim 后的值判断，但 facts 中仍是原值。解码失败后清掉 tags，整项被丢弃，最后只能走通用纠错文案。

修复：判断前先写回 trim 后的值，`facts.channel=channel; facts.genre=genre0`，或者在 `repairSettingsItem` 中统一对字符串做 trim。

**L5 genre 与频道冲突时清除 genre，纠错只报“缺少题材”。** 位置：`novel-import-ai.ts:1358`

男频配古风言情时，genre 被清除，反馈只说缺题材。模型不知道原因，可能重复给出相同组合。

修复：记录冲突，在 gap 文案前加“题材须属于所选频道”。也可以在 channel 合法、genre 只属于另一频道时保留 genre，不清除，交给纠错轮处理。

**L6 获取 lane 后没有检查跳过，样本放不下时没有兜底。** 位置：`main/novel-import.ts:1089,1096-1101`

在等待 lane 期间跳过任务，第 1 次请求仍会发出。`!head.length` 时直接返回 `{}`，本地频道兜底也不会生成。

修复：`await lane.acquire(true)` 之后先检查 `if(halted())`。`!head.length` 时也调用 `localThemeChannel`。

**L7 全文计数的开销。** 位置：`main/novel-import.ts:211`

对约 480 万字的 workingProse 先 replace 生成副本，再用 `match` 生成大数组。

修复：改为一次遍历计数，遇到“他们、其他、其它、她们”时跳过。还可以考虑排除“他人、吉他”等常见词，属于可选项。

**L8 审核脚本的对比口径与发布不一致。** 位置：`scripts/audit-real-novel-import.ts:162`

发布写入的是 `clean(position.synopsis)`，脚本对比的是 `facts.synopsis.trim()`，含批注时会误报。

修复：脚本改用 `stripImportKnowledgeAnnotations(...)`。如果 M1 改了原资料主题的处理，脚本要同步修改。

**L9 纠错文案与检查不一致。** 位置：`novel-import-ai.ts:385`、`:416-427`

`IMPORT_THEME_PROFILE_GUIDANCE` 写着 tags 必填，但 `themeProfileGaps` 不检查 tags，修复也可能清空 tags。

修复：文案改为“tags 可为空数组”，或者从必填列表中移除 tags。

## 结论

545 的主路径已经实现：契约、完整性检查及其与纠错轮的衔接、上下文 id 去重、开篇样本、3 次尝试加精简请求、本地频道兜底。gap-only 放行只在其它检查全部通过后生效，纠错后仍不完整时能干净失败并重跑。中止、授权、lane 和调试行没有发现问题，其它设定类型和旧会话解码没有回归。

提交前建议处理：
- M1：原资料主题被 fallback 改写，违反 IQ-11b 和 H4。
- M3：补齐 TP-23、真正的 TP-26/28，以及“纠错后仍只缺字段”的用例。
- M2 需要主代理决定是否修改 §6 H3：保留部分定位，还是维持现在的整份丢弃。

低优先级问题可以一并处理，其中 L1、L3、L4 改动都很小。

## 处理记录（主代理）

| 项 | 处理 | 位置 / 用例 |
|---|---|---|
| M1 | 已修。原资料主题原样在前，只截推断主题；整体截到 5000 字（主题行上限，`src/lib/services/theme.ts:11`）。有定位简介时仍只写定位简介（542 行为，见 545 §7） | `importThemeSynopsis`（core），publish、`audit-real-novel-import.ts` 共用；TP-33a/b |
| M2 | 未改，待用户决定：保留“只缺字段”的部分定位，还是维持 §6 H3 整份丢弃 | — |
| M3 | 已补：纠错后仍缺字段 → 可重跑的结构错误；中止不重跑；“他”多的正文 → 男频兜底与 dropped 全文；第 3 次精简请求恰为开篇单元 | 547-M3a/b/c，TP-20a/20b/23b/28a |
| TP-39 | 无单测，按 546 §G3 由真实读回验证 | — |
| L1 | 已修。两项限制内的简介原样返回，不计 clearedPosition | 547-L1/L3/L4 |
| L2 | 未改（542 起即存在）；定位修复计数不展示 | — |
| L3 | 已修。句末后紧跟的闭合引号/括号保留；第 0 位也检查 | 同上 |
| L4 | 已修。channel/genre 先写回 trim 值 | 同上 |
| L5 | 未改；冲突时仍清 genre，纠错提“题材” | — |
| L6 | 已修。取得 lane 后先检查 halted；样本放不下时也走本地频道兜底 | TP-20b（他/她为 0，无兜底） |
| L7 | 已修。单次遍历计数，不复制正文 | TP-27/28/28a |
| L8 | 已修。脚本对定位简介用 `stripImportKnowledgeAnnotations` | — |
| L9 | 已修。纠错文案改为 tags 可为空数组 | TP-03 |

`lotm-local-import-audit.test.ts` 的 “volume-first chapter title prefix” 已在 HEAD 干净副本（APFS 克隆 node_modules，非软链接）上复跑，同样报 `FROZEN_CHAPTER_ORACLE_MISMATCH`，为既有失败，与 545 无关。

## 第二轮审核（处理记录之后的工作区）

执行：三个指定测试文件共 53/53 通过（Node 24.18.0）。临时探针（已删除）：`importThemeSynopsis([{origin:'source',text:'𠀀'×4990+'abcdefghijkl'}])` 返回 5000 个码位、9990 个 UTF-16 单元；`importThemeSynopsisFallback('。'+'乙'×320)` 返回 `'。'`。

### 中

**R2-M1 5000 字截断按码位计数，主题面板按 UTF-16 计数。** 位置：`desktop/core/novel-import-semantics.ts:83`。
场景：原资料主题含扩展区汉字或 emoji，总长 3000 个码位、5200 个 UTF-16 单元。截断不会触发，发布用 `tx.theme.update` 直接写入，所以发布成功。之后作者在主题面板保存任何字段，`themeInputSchema` 的 `synopsis: z.string().max(5000)`（`src/lib/services/theme.ts:11`）按 `.length` 计数，校验失败，作者必须手动删字才能保存。
修复：按 UTF-16 长度截到 5000，用 `safeImportBoundary` 退一位，避免切开代理对。用例改为探针中的扩展区文本，断言 `synopsis.length<=5000` 且没有孤立代理项。

### 低

**R2-L1 审核脚本比较的是未 trim 的定位简介。** 位置：`scripts/audit-real-novel-import.ts:162`、`desktop/service/novel-import-ai.ts:1363`。
场景：模型返回 `"……开篇。\n"`。repair 只在截断结果与 trim 后的值不同时写回，所以 `facts.synopsis` 保留末尾换行。发布写入解码后已 trim 的值。脚本比较 `strip(facts.synopsis)`，结果是 `theme-full-text` 误报失败。
修复：脚本改为 `stripImportKnowledgeAnnotations(position.facts.synopsis.trim())`，与发布的 `clean(trim)` 一致。也可以在 repair 中始终写回 trim 后的值。

**R2-L2 句末截断可能只剩一个字。** 位置：`novel-import-semantics.ts:77`。
场景：推断主题以“。”开头、后面没有其它句末，结果简介只有“。”。它非空，`themeProfileGaps` 不会报缺简介。
修复：找到的句末短于上限一半（150 字）时，改按字符截断。

**R2-L3 非重跑错误直接 `break` 后会进入本地兜底，方案没有写明。** 位置：`desktop/main/novel-import.ts:1110-1115`。
场景：第 1 次就遇到传输错误“模型接口请求失败”，或“主题定位结果无效”，或授权以外的预算、授权变更错误。这时只发 1 次请求，随后生成本地频道兜底，dropped 提示“主题定位未能推断”。这与 542“定位失败不影响主题任务”一致，结果可以接受，但 §6 H3 写的是“3 次都失败时”兜底。AbortError、授权错误和 halted 都正确地不重跑、不兜底。
修复：在 545 §6 H3 补一句“不可重跑的失败也走兜底”。TP-23b 再断言兜底产物或 dropped 文案，目前它只断言请求次数和 done。

**R2-L4 `theme-profile-fail` 记录原始错误文本。** 位置：`main/novel-import.ts:1108`。
场景：传输错误的 message 可能带服务端响应片段，被截入前 80 字写到 stderr。同一行的 `debug()` 已经用 `settingsFailureClass` 输出固定分类。
修复：`reason` 改为 `settingsFailureClass(error)`。

### 已核对、无问题

- **修复与纠错不会循环。** `repairThemePosition` 是单次确定性处理。gap-only 条目带着修复后的文本进入严格 schema。纠错后仍缺字段时，报出可重跑的结构错误，最多 3 次尝试、6 次调用。不会丢掉合法定位：合法回复在 L1 修复后原样通过，channel/genre 先写回 trim 后的值。
- **截断按字符边界，不会切开代理对。** fallback、`themeProfileGaps` 和 `localThemeChannel` 的引文都用 `Array.from`。组合字符和 ZWJ emoji 仍可能被切开，影响很小。
- **fallback 提前返回的条件正确。** 判断针对 trim 后的原文，两项限制都满足时原样返回，不计 clearedPosition（TP-34 覆盖）。
- **`localThemeChannel` 的产物能通过发布校验和计划哈希。** facts 只有 channel，能用 strict 模式解码。引文逐行尝试，并经 `validateImportEvidence` 核对。它和其它推断产物一样进入 `s.artifacts`，计划哈希是确定的。TP-32 的发布结果是 genre“全部”、简介为拼接主题。
- **halted、跳过和中止。** 取得 lane 后、每次尝试之前、兜底之前都会检查 halted。被跳过的任务在写入时会被跳过。
- **`audit-lotm-local-import.ts:189`。** 该会话强制所有产物都是推断产物（:123），也没有定位产物。这种情况下 `importThemeSynopsis` 的结果等于 `fallback(joined)`，5000 截断对不超过 300 字的结果不起作用，所以与发布一致。建议改用 `importThemeSynopsis` 并排除定位 id，这样以后会话形态变化时，两边仍按同一函数计算。

### 第二轮结论

545 主路径正确，没有阻断问题。提交前修 R2-M1（一行改动加一条用例）。R2-L1 和 R2-L4 改动很小，建议一并处理。R2-L2 和 R2-L3 可以只更新文档或用例。第一轮的 M2（是否保留“只缺字段”的部分定位）仍待用户决定。
