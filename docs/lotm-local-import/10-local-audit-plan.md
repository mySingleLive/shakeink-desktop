# 本地整书关闭后审计方案/定向用例

日期：2026-10-28。状态：调研与工具方案，尚未表示真实结果可审计。仅服务 `03-test-cases.md` 的 LOTM-L-BODY01/VOL01/OUT01、11类原生映射、REVIEW01/PERSIST01/AUD01。

## 不可复用的旧假设

`scripts/audit-lotm-import.ts` 固定上一轮 B1 路径、派生正文、8卷1394章和8目标。本次必须新写绑定，不修改旧证据：指定原文件、v2正文4,785,312字符、9卷1402章、11目标、Theme/STYLE/Trope和番外。旧 `verifyNativeRows` 不能原样用于本次。

## 实施边界

新增专用审计脚本及对应定向测试，生产导入逻辑不因审计器改变。输入为明确的 runDir/appRoot/workRoot/repo/sessionId/最终buildIdentity/shutdownEvidence；禁止默认指向旧B1。

1. **冻结与只读IO**：原文件、run.json、expected-chapters/body、semantic-minimum、最终journal、构建/迁移和退出证据使用普通文件/无链接/身份复查；真实完整文本只留私有目录。
2. **完成门槛**：新session.createdAt晚于机械/语义基线；phase=completed；selected=['body']；11 targets精确、无goldenFinger；workingRevision=0；notFound=[]；原/工作正文和1402章精确；11类coverage、review/reviewFacts、semanticState ready/hash、repairs/omissions、冲突及单次publication完整。
3. **原库保护**：正常退出且同launch/PID/退出时间绑定后才运行。解析作品manifest和存储指针，只复制本次work的数据库闭包到隔离scratch；复制前后及审计后比较原树，原库不交给PGlite。scratch事务 `REPEATABLE READ READ ONLY`，安装迁移与构建一致。
4. **正文/大纲**：9卷名称/顺序/`213/269/250/214/204/116/87/41/8`精确；1402章内容、标题、卷内/全书顺序、状态、字数与基线相等；番外独立。第一卷summary与可投影outline按合同拼接，其他卷不重复，PlanningDocument容量/指针、原Version材料完整。
5. **11类实表**：复用 `realNovelSemanticAssertions` 检查Character/Scene/World/Setting和两线引用；另验Item/Foreshadow精确多重集、Theme.synopsis、STYLE整行、Trope两类及整行、无GOLD_FINGER。九类世界子设定逐项存在且worldId/parent/content正确。
6. **回执/记录**：单一ContentVersion/ContentMutation，request/after/importHash、snapshot材料/facts/evidence/coverage/semanticAudit/sourceCopyIds/mappingWarnings/budget一致；最终重开是新launch/PID但同workId/novelId/receipt/data，不能要求同launch。
7. **文学与机械分离**：审计器只判机械持久化与证据/引用。45项最低语义和1402单元独立文学台账另验，不能把机械PASS写成全书文学PASS。

## LOTM-L-AUD01 定向测试

使用合成9卷1402章及11类最小但完整的原生数据，不读取真实书或Key：

- 正例：完整closed-work、只读事务、所有原生映射、单次回执通过；重复发布请求不新增实体/回执。
- 正文负例：缺/重/换序章、番外并入末章、第八卷或番外占位、改动已知乱码、字数字段错均FAIL。
- 目标负例：notFound/任一类空产物、Theme或Trope空表、缺SATISFACTION或TEAR、缺任一世界子设定、额外GOLD_FINGER、STYLE/Trope字段被改均FAIL。
- 引用负例：角色关系、MAP parent、worldId、世界事件人物、叙事chapterIndex/event refs/reliability错误均FAIL。
- 状态负例：coverage/reviewFacts/semanticState/冲突/版本/回执/构建/launch/退出不符均FAIL。
- IO负例：原库或输入在复制中改变、链接/硬链接、错误storage candidate、scratch被替换、已有输出label、应用未关闭均FAIL且不打开原库引擎。

## 独审补强（覆盖前述简要条款）

1. 冻结输入另含 `non-narrative.json` 及hash。`files[0].text` 是完整4,803,440字符原文；`originalProse/workingProse/sourceBody` 才是4,785,312字符筛选正文。全部units须无缺口/重叠覆盖完整源文件，body/excluded分类、九段正文与八段非叙事区间、1402章范围与基线一致，禁止沿用旧脚本 `files[0].text===expectedBody` 假设。
2. PlanningDocument 完整断言包括：唯一reading line的ID/name/primary；9个planning volumes与实际Volume的ID/顺序/标题/摘要；1402个planning chapters的ID/卷/全书order/标题/wordBudget；Chapter.outline及cards/tellings；世界事件完整分片/人物/父事件/时间/line；叙事cards/tellings文本/章节/顺序/叙述者/refs/reliability及无额外卡片。
3. Theme精确一条预期行且synopsis与全部可投影主题产物按合同拼接；STYLE精确一条预期行，worldId/parentId为空，style/referenceCases/dialogueMark/innerDialogueMark完整；Trope与全部可投影产物精确多重集相等，SATISFACTION/TEAR分别存在，kind/category/content/referenceCase/selected逐行对应。所有行归属本次novelId，无额外Theme/STYLE/Trope或GOLD_FINGER行；AUD01增加额外行及错误novelId负例。
4. ContentVersion逐项检查targetType/targetId/version/session/章节与语义版本及完整snapshot；ContentMutation逐项检查operationId/novelId/targetType/targetId/requestHash/afterHash/beforeHash/beforeVersion/afterVersion/result。snapshot覆盖sources、原/工作正文、sourceKinds/targets、modified、decisions、notFound、materials/facts/evidence、coverage、semanticAudit、mappingWarnings、budget；work manifest、存储指针、workId/novelId/requestId/importHash互相绑定。AUD01逐项变异而非只改一个hash。
5. 合成正例的session、expected body、原生行与回执由独立冻结fixture构造，不能由被测发布器/审计器现场生成期望值。每个负例只改一个关键条件并断言具体错误码；正例先走完整closed-work等价路径。除复制中篡改外，增加复制完成后、PGlite查询后及最终复核前的原库/指针/输入篡改；所有IO失败不得把原库交给PGlite或覆盖既有label。

## 顺序

先独立审核方案 → 定向测试RED → 最小审计实现 → 正负例GREEN与独立代码审核 → 等真实completed且正常关闭后运行。审计器未通过正负例前不得用于给真实结果判PASS；真实尚未completed时不运行正式审计，不伪造检查点。
