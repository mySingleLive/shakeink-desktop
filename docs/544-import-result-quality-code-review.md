# 544 导入结果质量（docs/542）代码审核

审核范围：docs/542 §5 所述改动（去批注、发布门禁、主题定位 profile、篇幅、细纲直出、ContentTabs memo）。539–541 的未提交改动不在本次范围。依据为 `git diff`、源文件和下列实际执行结果：

- `node --import tsx --test tests/unit/novel-import-result-quality.test.ts`：14/14 通过
- `node --import tsx --test tests/integration/novel-import-result-quality-publish.test.ts`：4/4 通过
- 浏览器用例 `tests/browser/content-tabs-render.test.ts` 未执行
- 去批注函数的手工探针（`npx tsx` 直接调用 `stripImportKnowledgeAnnotations`），结果见各条

## 高

### H1 去批注正则存在指数级回溯（desktop/core/novel-import-semantics.ts:301-302）

`annotationBody` 的值部分是惰性 `[^（）()\n]*?`，其中可以含 `；`、`，` 和标签字；后面又跟一个可重复的 `\s*[；;，,]\s*(标签)\s*[：:]…`。同一段文本有多种切分，匹配失败时（括号未闭合，或后面接了其它字符）回溯数量按“标签：值”对数成倍增长。实测一个未闭合括号内含 N 对：

| N | 耗时 |
|---|---|
| 16 | 4 ms |
| 20 | 61 ms |
| 22 | 269 ms |
| 24 | 1021 ms |
| 26 | 4122 ms |

每多 2 对约慢 4 倍。该函数在 `runImportAi` 中对每个推断产物的 text 和每个非结构 fact 同步执行（novel-import-ai.ts:1127、1193-1203），发布事务内的 `clean()` 也会再执行一次（novel-import-publish.ts:48）。模型输出不可信，一段重复批注就能卡住 service 进程数秒到数分钟，发布时还会让 PGlite 事务超时。

修复建议：改成线性匹配。先用 `[（(][ \t]*(?:标签)[ \t]*[：:][^（）()\n]*[）)]` 取出候选块（不带嵌套重复），再用 `split(/[；;，,]/)` 在代码里逐段确认每段都以固定标签开头，确认后才删除。另加一条单元用例：30 对未闭合批注须在 50 ms 内返回。

### H2 跨行批注能被检测、不能被删除，`clean()` 会因此阻断整次保存（novel-import-semantics.ts:303、305-312；novel-import-publish.ts:48）

`IMPORT_KNOWLEDGE_ANNOTATION` 用 `\s*` 连接括号和标签，`\s` 包含换行。删除逻辑却按行执行：先 `split('\n')`，再用排除 `\n` 的正则和 `balancedRemoval` 处理。实测：

- 输入 `他（\n可靠性：客观事实）走了`，输出不变，`IMPORT_KNOWLEDGE_ANNOTATION.test(输出)` 为 true。

这类文本在 `runImportAi` 中会原样留下。发布时 `clean()` 抛出“导入文本仍含可靠性批注，未保存”，整部作品无法保存。作者在向导里无法编辑产物 text，只能重导入，而重导入的结果仍可能相同。

修复建议：
1. 检测正则改用 `[ \t]*`，与删除规则使用同一组字符。两边最好共用同一个常量。
2. `clean()` 不再抛错。删除后仍有残留时保留原值并计数，写入导入记录或 `w.dropped`。门禁的目标是“不写入批注”，不应把一处无法删除的残留升级为整本保存失败。如果坚持阻断，错误里至少要指出是哪类产物，并给出可执行的修复入口。

## 中

### M1 未闭合批注会删到行尾，误删推断正文（novel-import-semantics.ts:319-320）

`balancedRemoval` 找不到闭括号时，从批注起点删到行尾。实测：

- `他说：“（可靠性：高”这句话不对，然后离开了房间。` → `他说：“`

这会悄悄删掉推断文本中有内容的部分，又因为 `runImportAi` 阶段就已删除，导入记录里也找不回原文。

修复建议：未闭合时只删除“标签：值”本身，值到第一个 `。！？”\n` 或 `；` 为止；或者不删除，交给计数记录（与 H2 第 2 点一致）。补一条“未闭合批注不删后文”的用例。

### M2 发布门禁和运行时剥离漏掉多处作者可见的推断文本

计划 §5 H1 说门禁覆盖推断产物投影出的全部字段，但下列字段没有经过 `clean()`，部分在运行时也没有剥离：

- 角色 profile 的 JSON 字段（`motivations`、`beliefs`、`arcStages[].description/changes/markers`）、`relationships[].description`、物品 `effects[].description`：这些字段都在 `ANNOTATION_KEPT_FACTS` 中（novel-import-ai.ts:1192），所以运行时不剥离；发布时 `characterProfile`、`item.value.effects`（novel-import-publish.ts:110、115）以及 `publishWizardLinks` 的 arcStages（:201）都直接写入。
- 角色、场景 profile 的文本字段（backstory、desires、fears、exteriorDescription 等）和角色 native 字段（personality、appearance、growthArc 等）：运行时会剥离，但发布不兜底。docs/539 的自动修复会把复核模型的 `candidate.value` 写入这些字段（desktop/main/novel-import.ts:1478），这条路径不经过 `stripArtifactAnnotations`，所以带批注的修复值会直接发布。reconcile 的 `textEdits.after`/`setFacts` 同样不经过剥离。
- 伏笔触点 `summary`（novel-import-publish.ts:207）：来自 `result.touches`，不属于 `result.artifacts`，运行时和发布时都不剥离。

修复建议：
1. 运行时剥离按“JSON 结构字段”和“JSON 内的文字字段”区分。对 motivations、beliefs、arcStages、effects、relationships 解码后只剥离其中的描述性字符串，与 `content` 的处理方式相同。touches 的 summary/content 也在 `runImportAi` 中剥离。
2. 自动修复写入 `next` 前，对 `candidate.value` 调用 `stripImportKnowledgeAnnotations`。
3. 发布门禁对 profile 文本字段、effects/arcStages 描述和 touch summary 同样调用 `clean()`。集成用例 IQ-09 增加这些字段的读回断言。

### M3 其它设定任务提交时会删掉“主题定位”的 dropped 记录（desktop/main/novel-import.ts:1099）

`recordSettingsRepairs` 对任何 settingsKind 都会过滤 `d.label===THEME_POSITION_LABEL`。如果主题任务先提交，文风、金手指或爽点任务后提交（包括 :960 的 none 路径和 :961 的 failed 路径），作者就看不到“主题定位未能推断”的提示。

修复：只有 `task.settingsKind==='theme'` 时才过滤和写入 `THEME_POSITION_LABEL`。补一条用例：主题定位失败后，文风任务再提交，dropped 记录仍在。

### M4 定位修复计入 `clearedReliability`，作者看到的提示是错的（novel-import-ai.ts:1307-1318；desktop/main/novel-import.ts:1100-1102）

计划 §5 H2 要求新增计数 `clearedPosition`。实现复用了 `clearedReliability`，所以清除非法频道、题材或标签后，主题任务的 dropped 记录会显示“N 项取消可靠性标注”。该计数还会与主题批次的真实可靠性清除合并（importSettings 中按 task 求和）。

修复：在 `ImportSettingsRepairs` 中加可选的 `clearedPosition`，同步修改 `settingsRepairsSchema` 和 `refine`，dropped 文案改为“N 项定位字段不合规已留空”。只有 themeProfile 请求才允许出现非零的 `clearedPosition`。

### M5 真实导入审计脚本仍按旧规则断言主题全文（scripts/audit-real-novel-import.ts:159）

`theme-full-text` 要求 `synopsis` 等于全部主题文本的拼接。新的发布逻辑优先写定位产物的 synopsis（不超过 500 字），否则截断到 5000 字，因此真实目标验证中这一项必然失败。计划 §3/M7 要求修订 `scripts/audit-*`，这一处被漏掉了。`scripts/real-novel-semantic-assertions.ts:60/79/118` 仍按“前缀”协议推导；由于 `qualifyImportKnowledgeText` 现在是恒等函数，它碰巧还能运行，但断言含义已经失效，应改为“原文直出且 `IMPORT_KNOWLEDGE_ANNOTATION` 不命中”。

## 低

- **L1 重跑前未检查 halt/skip**（desktop/main/novel-import.ts:1083-1087）：批次 `attempt()` 会在 `first||halted()||skipped` 时不再重跑，定位请求在第一次失败后只检查 `worldEntryRerunnable`。作者跳过主题任务或其它任务已经 halt 时，仍会再发一次请求。建议 `importThemeProfile` 接收 `halted` 和 `task`，重跑前与批次使用相同的判断。
- **L2 全局错误被吞掉**（同上）：授权变化（如“模型配置或授权已变化”“请重新允许发送本次导入范围”）不属于 rerunnable，会被记为“定位未能推断”，主题任务仍为 done。建议这类全局错误直接抛出，判断方式参照 `reviewGlobalFailure`。
- **L3 普通主题批次可以占用保留 id**：普通主题批次的模型输出如果使用 id `import-theme-profile`，它会在发布的 `themeText` 中被排除（novel-import-publish.ts:122），并与之后的定位产物发生 id 碰撞（mergeImportArtifacts 抛出“模型实体标识与不同身份重复”，导致整组回滚）。建议非 themeProfile 请求的 schema 中拒绝这个 id 和 name。
- **L4 先截断再清理**（novel-import-publish.ts:125）：`clean(limitCharacters(themeText,5000))` 可能把批注从中间截断，变成未闭合批注，再触发 M1 的删到行尾。应改为先 `clean` 每段，再截断。
- **L5 旧会话的细纲锚点偏移**（novel-import-publish.ts:139 与 :211-212）：Chapter.outline 写入的是清理后的值，`publishWizardLinks` 仍在未清理的 `s.chapters[i].outline` 上计算 `CHAPTER_OUTLINE` 的 offset。对 M1 兼容的旧会话（带前缀），锚点会整体偏移前缀长度。建议把同一个 `chapterOutline(i)` 传给 `publishWizardLinks`。
- **L6 剥离后的空文本**：如果 text 只有一条批注，结果是 `''`（实测 `（可靠性：客观事实）` → `''`）。剥离发生在 schema 解析之后，空文本可能形成空的主题、文风或爽点行。建议剥离后再检查一次非空，为空则丢弃该项并计入 droppedArtifacts。另外，`（适用时段：…）（信息来源：…）\n\n正文。` 的结果是 `\n正文。`，开头多一个空行，可以顺手去掉。
- **L7 非语义旧会话也走 `clean()`**（novel-import-publish.ts:105）：`nativeText` 不再判断 `mapping`，semanticVersion 不为 1 的旧会话中的推断文本也会被改写并可能抛错，而同一路径中非 mapping 的角色 bio（:111 else 分支）仍写 `a.text`，两者不一致。建议限定为 `mapping&&a.origin!=='source'`，或至少保持一致。
- **L8 `stripJsonStrings` 改写 content 中的全部字符串**（novel-import-ai.ts:1203）：剥离范围包括 name、term、scope 等结构字符串。实际命中的可能性很低，但更稳妥的做法是只处理 `importWorldContentTexts` 覆盖的文字字段，可以复用 `mapImportWorldContentText`。

## 已核对、无问题

- **门禁范围**：`chapter.content` 和 `origin==='source'` 的副本都不经过 `clean()`；细纲只清理 `detailedOutlineIds` 中映射到推断产物的章节（publish:138-139）；世界设定 content 用 `mapImportWorldContentText(content,clean)` 覆盖全部文字字段；事件 fact、讲述卡 intent/reveal 和金手指三段都已清理；refs.source 已去掉知识拼接。
- **lane**：`importThemeProfile` 在全部批次释放后用 `acquire(true)` 获取一个 lane，`finally` 中释放，获取与释放成对。AbortError（包括 `this.current` 抛出的 stopped）会继续向上抛出。
- **样本循环**：for 循环以 units 为界，while 循环以 artifacts 长度为界，都会终止。样本最多为 `profile.characters/3` 加一个单元，最后还会用 `fits` 检查。
- **schema 2**：`semanticResultArtifact`、`settingsItemValid` 和 `runImportAi` 尾部都会补 `schema:2`；`importNativeProfile(theme)` 用 `positionError` 校验频道、题材和标签，各文本有长度上限；`validateSemanticRequest` 只允许 v1、analyze、theme、settings 通道且 intent 为空的请求带 `themeProfile`。
- **retryKind world**：会清除所有非 source 的主题产物（包括定位）和 settings 类 dropped；wizard checks 的 `scope` 对定位 evidence 生效，样本来自 working units，属于所选范围。
- **主题发布**：不写 `authorPosition`；`upsertTheme` 之后保存时，`author.success` 为 false，不会覆盖；`positionError(data, existing)` 在标签不变时通过，IQ-43 已验证。synopsis 不超过 5000，与 `themeInputSchema` 一致；`length` 取 `WIZARD_LENGTHS` 中的值。非向导会话只多写 length。
- **ContentTabs memo**：tabs store 的 `activateTab`、`openTab`（已存在的 tab）、`moveTab`、`closeTab` 都保留原 tab 对象引用；`prefix` 来自 `useId`，在组件生命周期内稳定；`active` 是布尔值。只有可见性变化的两个面板和被改名的面板会重新渲染，`key={tab.id}` 不变，实例保留语义不变。StagedSaveSurface 和面板内部的 store/context 订阅不受 memo 影响。
- **日志安全**：新增的 debug 行只输出单元数、尝试次数和 `settingsFailureClass`；`clean()` 和定位相关的错误都是固定文案，不含用户文本或模型输出。

## 修复记录（主代理，2026-11-10）

- **H1**：改为单遍线性扫描。只有满足以下全部条件的括号块才会删除：
  - 括号块以固定标签加冒号开头；
  - 在同一行内闭合，且不超过 2000 字符；
  - 括号嵌套配平；
  - 顶层按；/; 切分后，每一段都是“标签：值”。

  新增 IQ-45：30 对未闭合批注、2000 行已闭合批注，各自都在 200 ms 内完成（实测 0 ms 和 9 ms）。
- **H2**：检测和删除改为同一组字符（`[ \t]`），跨行的块既不检测也不删除。`clean()` 不再抛错。新增 IQ-46。
- **M1**：未闭合的块原样保留，不再删到行尾（IQ-46）。
- **M2**：以下 JSON 事实中的字符串值剥离批注，键和结构不变：content、relationships、effects、motivations、beliefs、arcStages、touches。新增 IQ-47。另外：
  - reconcile 的 `textEdits.after` 和 `setFacts` 新值剥离批注；
  - 自动修复写入的新值剥离批注；
  - 发布时对推断产物的 profile 做深度清理，角色关系的 description 一并清理；
  - 伏笔触点的 summary 剥离批注。
- **M3**：只有主题任务清除或写入“主题定位”记录（IQ-49）。
- **M4**：新增 `clearedPosition` 计数，提示文案为“N 处主题定位不合规已清除”（IQ-48）。
- **M5**：`audit-real-novel-import.ts` 的 theme 检查改为：有定位简介时用定位简介，否则用截断到 5000 字的拼接文本；另加 `theme-no-annotation`。`real-novel-semantic-assertions.ts`、`audit-lotm-*`、`verify-lotm-scenes-persistence.mjs` 统一使用发布时同一个剥离函数。ref.source 改为 `导入语义关系：<kind>`。
- **低**：
  - 定位请求重跑前检查跳过和停止；
  - 授权或中止这类全局错误继续上抛；
  - 普通主题批次使用保留 id 时视为无效来源；
  - 只含批注的文本剥离后为空串，这是允许的。旧会话细纲和截断顺序维持现状，原因：发布时先 clean 再截断，截断按字符边界，不影响内容。
