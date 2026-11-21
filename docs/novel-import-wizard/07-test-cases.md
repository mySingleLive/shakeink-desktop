# 导入作品分步向导：测试用例（v2）

日期：2026-10-29。依据：[02-product.md](02-product.md)（P01–P14）、[03-ui-design.md](03-ui-design.md)、[05-technical-design.md](05-technical-design.md) v3。v2 按 [08-test-review.md](08-test-review.md) 的 24 条意见修订。只覆盖本次任务。

## 约定

- 编号 `NIW-<层>-<序号>`：U 纯函数、C 控制器集成、S 服务端/发布、B 浏览器组件、R 真实目标。
- 运行：Node v24.18.0；U/C/S `node --import tsx --test <文件>`；B 用现有 `tests/browser` 方式（esbuild + playwright-core + 本机 Chrome，阻断网络，`reducedMotion` 按用例设置）。
- C/S/B 层的模型、图像、发布由注入的假实现驱动；这些结果只证明代码路径，不计为真实目标通过。只有 R 层使用真实模型。
- 新测试文件：`tests/unit/novel-import-wizard.test.ts`（U）、`tests/unit/novel-import-wizard-session.test.ts`（C）、`tests/unit/novel-import-wizard-publish.test.ts`（S）、`tests/browser/novel-import-wizard.test.ts` + `tests/helpers/novel-import-wizard-fixture.tsx`（B）、`scripts/verify-novel-import-wizard-lotm.mjs`（R）。
- 回归（不计为新用例）：本次修改涉及的既有测试文件必须继续通过：`novel-import-session`、`novel-import-semantic*`、`novel-import-structure*`、`novel-import-volumes`、`novel-import-files`、`novel-import-ai`、`novel-import-protocol`、`novel-import-runtime-proof`、`novel-import-integration`、`novel-import-source-reselection`、`tests/browser/novel-import*.test.ts`。

### 标准合成夹具 F

`F` = 两个文件：
- `正文.txt`（GB18030 编码）：`第一部 甲卷` / `第一章 起`…`第四章 终`；`第二部 乙卷` / `第一章 再起`…`第三章 再终`；`第三部 丙卷` / `第一章 三起`…`第三章 三终`；尾部 `后记`（无章号，归入未分卷）。共 3 卷 10 章 + 未分卷 1 段。角色"沈砚""林舟""顾三"、地点"北城""北城·南巷"、物品"青铜钥匙"在不同章节出现。
- `资料.md`（UTF-8）：`# 角色` 下 `沈砚：…`、`林舟：…`；`# 世界观` 下 `## 社会制度`、`## 风俗`；`# 场景` 下 `## 北城`；`# 物品` 下 `## 青铜钥匙`。

`F0` = 只有 `资料.md`。

## U：纯函数

| ID | 覆盖 | 用例 | 期望（断言） |
| --- | --- | --- | --- |
| NIW-U01 | P12 | GB18030 字节（无 BOM、非合法 UTF-8）解码 | `encoding==='gb18030'`、`requiresEncodingConfirmation===false`、`encodingDetected===true`；文本与 `iconv` 结果逐字相等 |
| NIW-U02 | P12 | UTF-8 BOM、UTF-16LE BOM、UTF-16BE BOM、无 BOM UTF-8 | encoding 分别为 utf-8/utf-16le/utf-16be/utf-8；`encodingDetected===true` |
| NIW-U03 | P12 | 字节 `0xFF 0xFF 0x80 0x80`（UTF-8 与 GB18030 都非法） | `file.error==='无法识别文本编码，请改选编码或排除此文件'`；不抛出 |
| NIW-U04 | P12 | `.html` 文件 GB18030 字节 | 同 U01 |
| NIW-U05 | P01 | `wizardSkipped(step,s)` 在 5 个场景下返回的跳过步骤集合 | A F+全部推断+有模型：∅<br>B F 只选正文、`infer=false`：{9–20}<br>C F0+有模型（选角色、世界观、场景、物品）：{5,6,7,8,17,18,19,20}<br>D F+无模型（选 F 中全部识别到的来源）：{17,18,20}（9–16 不跳过；资料大纲在第 19 步拷贝，代码审核 F9）<br>F 只选正文+主题、不推断：{9–15,17–20}（第 16 步承载其他设定，代码审核 F8）<br>E F+推断全选但"角色"两组都不选：{9,10} |
| NIW-U06 | P02 | 物化 F：取消第二部第一章、第三部全部 | `workingProse` === 选中 7 章原文按序拼接；`chapters.length===7`，`id` 为 chapter-1…7，`start/end` 连续；`materializedVolumes` 卷名序列为 [甲卷×4, 乙卷×2]，第 5 章卷名为"乙卷"（首章缺失仍保留） |
| NIW-U07 | P02,P09 | 物化：只取消"未分卷"；只保留"未分卷" | 前者无"后记"文字；后者 1 章、卷名 undefined；`importVolumeGroups` 两者都不抛出 |
| NIW-U08 | P02 | U06 物化后 `workingImportUnits` | 每个 unit.text 都是 `workingProse` 子串；任一 unit 不含"三起""再起"字样 |
| NIW-U09 | P02 | 向导 `assertPlan`：U06 结果 | 通过；把 chapters[2].content 改一个字报"原文不匹配"；把 materializedVolumes[4].volume 改为"丙卷"报"卷归属"错误 |
| NIW-U10 | P03 | `mergeWizardRoster`：{沈砚,主角}{沈砚,配角}{沈砚,主角}；{林舟,配角,aliases:[舟哥]}{舟哥,反派}；{ＡＢ,配角}{AB,配角} | 输出 3 条：沈砚 roleType=主角（2:1）；林舟 aliases 含"舟哥"、roleType=反派（1:1 并列按 主角>反派>配角）；AB 1 条 |
| NIW-U11 | P03 | 物品保留：模型 important=false 出场 2 章；false 3 章；资料来源 0 章 | 丢弃、保留、保留 |
| NIW-U12 | P03 | `chapterCount`：沈砚在选中 3 章出现、在未选章节出现 2 次；别名命中另 1 章 | `chapterCount===4` |
| NIW-U13 | P03 | 候选 id | 同 kind+名称两次调用 id 相等；匹配 `^[a-z]+-[0-9a-f]{16}$`；不同 kind 同名 id 不同 |
| NIW-U14 | P10 | `splitWizardSourceBlocks`：F0 各段；无标题纯文本资料 | 角色 2 块（沈砚、林舟）；场景 1 块（北城）；物品 1 块；世界观 1 世界（中性容器）+2 子项；无标题为整文件 1 块 |
| NIW-U15 | P10,N8 | 子项标题 → settingType 映射表 | "社会制度"→SOCIETY；"风俗""宗教""人文"→CULTURE；"地理""地域"→GEOGRAPHY；"历史"→WORLD_HISTORY；"等级体系""力量体系""势力""概念""地图""其他"→SOCIETY |
| NIW-U16 | P10,N8 | U14 世界观子项 artifact 经 `validateImportSemanticArtifact('source-copy')`、`importNativeMappings`、`decodeImportWorldContent` | `native!==null`、entityType=SETTING、worldId 指向中性容器；content.text 与原文逐字相等 |
| NIW-U17 | P10 | 非向导会话调用 `sourceImportArtifacts(F0)` | artifact id 列表与改动前快照完全相等 |
| NIW-U18 | P06 | 世界树选择：取消父世界；子世界唯一子项被取消；无子项的世界 | 父世界后代 selected 全为 false；子世界不保留、父世界仍保留；无子项世界 selected 按自身 |
| NIW-U19 | P06 | 世界树三态：父世界 2 子项全选 + 子世界 1/2 选中 | 父节点 `mixed`；全选为 `checked`；全不选为 `unchecked` |
| NIW-U20 | P05 | V2 角色合法 facts（每个 V2 字段一个合法值） | 校验通过；原生投影包含 height、weight、build、faceShape、tastes、habits、dialogueStyle、sampleDialogue、personalityTags、motivations（=normalizeMotivations 结果）、desires、fears、beliefs、bigFive、abilities、backstory、arcStages |
| NIW-U21 | P05 | V2 角色：motivations 非 JSON；bigFive.openness=120；arcStages 51 张；未知字段 `zodiac` | 各自报错，错误文案含字段名 |
| NIW-U22 | P05 | 无 `schema` 的角色 artifact 含 `height` | 报错（V1 字段表）；无新字段时 `importArtifactSemanticHash` 等于改动前快照 |
| NIW-U23 | P05 | `importAiPrompt` intent=entity kind=character | 包含 V2 全部字段名、"无依据省略"契约句；intent 为空时 prompt 与改动前快照相等 |
| NIW-U24 | P03 | 物品 V2：aliases 12 个其中 1 个 60 字；tags 10 个其中 1 个 25 字 | 发布投影 aliases 10 个、单个 ≤50；tags 8 个、单个 ≤20 |
| NIW-U25 | P07 | `planForeshadowTouches`：PLANT 有 eventId 且 narrative refs 含该事件 | 事件与讲述卡 materialRefs 各含 `{kind:'foreshadow',role:'plant'}`；`validatePlanning` 不抛出 |
| NIW-U26 | P07 | PLANT 有 narrativeId，narrative refs 不含 eventId；PLANT 无 eventId | 讲述卡无 plant；`dropped` 各 1 条（原因含"讲述未引用对应世界事件"）；`validatePlanning` 不抛出 |
| NIW-U27 | P07 | quote 在该章不存在；quote 在该章出现 2 次；chapterIndex=99；eventId 不存在 | 前三者触点被丢弃并记录；第四者 eventId 置空、触点保留 |
| NIW-U28 | P07 | note：summary 空；summary 600 字 | note=伏笔标题；note.length===500 |
| NIW-U29 | P07 | 事件已有 38 条 materialRefs，再加 5 条触点 | 事件 materialRefs.length===40；`dropped` 记 3 条截断 |
| NIW-U30 | P07 | 状态：有 PAYOFF；只有 PLANT/MENTION；无保留触点 | RESOLVED、PLANTED、PLANNED |
| NIW-U31 | P07 | narrative artifact 被拆为 3 张卡 | 只有第 0 张卡有 materialRef |
| NIW-U32 | P07 | 触点 summary 在细纲中可定位；不可定位 | 分别产生带 quote 与 `quote:null` 的 CHAPTER_OUTLINE 引用 |
| NIW-U33 | N2 | `importScopeHash(analyze)` 与 `wizardSelectionHash` | 改变候选选择：前者不变、后者改变；改变 grantedChapters：前者改变 |
| NIW-U34 | N2 | `importPlanHash` | 改变候选选择、图片选项、图片 sha256 任一项都改变 |
| NIW-U35 | — | 非向导会话 `importScopeHash`/`importPlanHash` | 与改动前快照相等 |
| NIW-U36 | — | `validateImportWizardState` | 合法状态通过；分别拒绝：非向导会话含 wizard、chapterSelection⊄grantedChapters、候选 id 不匹配正则、dependsOn 悬空、任务 20001 个、step 非枚举 |
| NIW-U37 | P14 | 图片容量预估 | 30 角色×2 = 150 MiB 允许；50 场景×2 = 250 MiB 拒绝 |
| NIW-U38 | P01,P11 | 任务条文字 | step=import-char 运行："导入作品 · 第 10 步 导入角色 · 作品名"；step=detect-char 等待：末尾含" · 等待确认"；暂停：含" · 已暂停" |
| NIW-U39 | P03,P14 | 主按钮文案 | 9 选中+头像+立绘："导入 9 个角色并生成头像与立绘"；0 选中："跳过"；7 场景+外景："导入 7 个场景并生成外景图"；第 6 步有模型/无模型："允许分析并导入"/"开始导入" |
| NIW-U40 | P03 | 搜索：名称或别名命中；卷章搜索"再"时卷复选作用范围 | 别名"舟哥"命中林舟；勾选乙卷只改变匹配章节 |
| NIW-U41 | P04,P14 | 进度摘要 | 9 角色 4 完成、1 失败、头像 2：`已完成 4 / 9 · 头像 2 / 9 · 1 项失败`；暂停前缀`已暂停 · ` |
| NIW-U42 | — | `safeError` 图片错误码 | `IMAGE_RESPONSE_INVALID`、`IMAGE_TIMEOUT`、`AUTHORIZATION_REVOKED` 各有中文文案，不返回通用文案 |
| NIW-U43 | — | 旧暂停证明（无 imageOperations）解析 | `parseImportRuntimeDiagnostics` 成功，remaining.imageOperations 视为 0 |
| NIW-U44 | N3 | runtime.json 编解码 | 64 条 calls 通过；65 条拒绝；序列化 >64 KiB 拒绝 |

## C：控制器集成（注入假 ai / generateImage / publish；夹具 F，除注明外）

### 流程与步骤

| ID | 覆盖 | 用例 | 期望（断言） |
| --- | --- | --- | --- |
| NIW-C01 | P01,P13 | choose → 第 2 步 `wizard-next` → 第 3 步 | `wizardVersion===1`；step 依次 files→work；第 3 步无目录 `wizard-next` 抛"请选择保存目录"；标题空或 101 字时 `set-title`/`wizard-next` 拒绝 |
| NIW-C02 | P13 | 第 3 步选择与来源重叠的目录 | `choose-target` 拒绝"保存目录不能与来源或应用目录重叠" |
| NIW-C03 | P12 | F 的 GB18030 文件不调用 `set-encoding` 直接 `wizard-next` | 成功；之后 `set-encoding{utf-8}` 仍可执行并改变文本 |
| NIW-C04 | P12 | 旧路径：`reselect-source` 对 GB18030 文件 | 成功，文本与 proof 更新规则与改动前一致（`requiresEncodingConfirmation` 为 false） |
| NIW-C05 | P01 | 完整 22 步（F，全部推断，头像+外景图+图标） | 每步 stepState 依次 done；假 ai 收到的 intent/kind 序列：roster:character → entity:character×N → roster:scene → entity:scene×N → roster:item → entity:item×N → roster:world → entity:world… → analyze:theme/style/goldenFinger/trope → analyze:worldline → analyze:narrative → analyze:outline → touches → review；最终 phase=completed |
| NIW-C06 | P01 | 场景 C（F0+有模型） | 步骤 5–8、17–20 stepState=skipped；无 body 相关请求；资料角色/场景/物品/世界观进入清单 |
| NIW-C07 | P01 | 场景 B（只选正文，infer=false） | 9–20 skipped；发布只有卷章与正文 |
| NIW-C08 | P03 | F 角色两组都勾选，资料"沈砚"与正文识别"沈砚"同名 | 候选 1 条，`sources=['source','body']`，`sourceArtifactIds` 非空；entity 请求单元包含资料原文单元 |
| NIW-C09 | P03 | 角色只勾"从文件导入"（不推断） | 候选只来自资料；不发 roster/entity 请求；artifact `origin==='source'` |
| NIW-C10 | — | 第 16 步其他设定：theme 只从资料导入（未推断）；style 推断 | theme 不发请求、资料拷贝；style 发 analyze 请求；foreshadow 不在本步出现 |
| NIW-C11 | P01 | 第 17–20 步进度 | 每批完成后 view 中该步显示 `completed/total` 章数，total=物化章节数 |

### 章节范围（P02、N1、N2）

| ID | 覆盖 | 用例 | 期望 |
| --- | --- | --- | --- |
| NIW-C12 | P02 | 第 6 步取消第二部第一章与第三部全部；记录全部假 ai 请求 | 所有请求的 `units[].text`、`chapters[].title`、`instruction` 中不出现"再起""三起""三终""后记"等未选章节特有字样（review 请求同样） |
| NIW-C13 | P02 | 未配置审核模型时第 6 步 `wizard-next{consent}` | 拒绝；`workingProse===''`、`grantedChapters` 未写 |
| NIW-C14 | N2 | 授权后调用 `wizard-select-chapters` 加入未授权章节 | 拒绝"扩大章节需返回选择卷章并重新允许" |
| NIW-C15 | N2 | 授权后调用 `set-chapters` | 拒绝（不在该步允许动作内） |
| NIW-C16 | N2 | 第 9 步取消 2 个候选后重开应用、重新允许并继续 | 语义检查点不报"不匹配"；`analysisGrant.hash` 与第 6 步相同；`selectionHash` 已更新 |
| NIW-C17 | N1 | 已物化会话（含模型识别卷：注入 structure 结果）后新建控制器 `initialize` | 不抛出，会话可恢复；同目录另放一个物化后篡改 chapters 的向导会话：仅该会话不恢复，控制器正常 |
| NIW-C18 | N1 | 第 6 步 `set-chapters` 新增一个章节起点 | `wizard.structure` 与 `structureHash` 更新；`chapterSelection` 全选；phase 仍为 select |
| NIW-C19 | N1,C1 | 第 21 步 `apply-patches`：补丁在第 3 章内；补丁跨第 3/4 章界 | 前者各章 start/end 与 materializedVolumes 平移、卷名不变，`grantedChapters`、`analysisGrant`、候选选择与图片选项保留，第 9 步之后的 artifacts/任务/图片清空，step=detect-char 并自动开始识别；后者拒绝 |
| NIW-C20 | N1 | 第 18 步 `wizard-revise{to:'tree'}` | `chapters` 恢复为 structure 全书 11 章；`chapterDetection.structureDecision` 等于 `wizard.structureDecision`；`workingProse===''`；`analysisGrant` 与 `grantedChapters` 清空；`chapterSelection` 保留 |

### 清单（P03、P06）

| ID | 覆盖 | 用例 | 期望 |
| --- | --- | --- | --- |
| NIW-C21 | P03 | 第 9 步取消 2 个、改 1 个类型、合并 2 个 | entity 任务只为选中候选建立；改后的 roleType 出现在该 entity 请求 instruction；合并后被并入名出现在保留项 aliases |
| NIW-C22 | — | 识别第 2 批失败 → `wizard-redetect` | stepState=failed 且 stepError 非空；重识别只发未完成批次（第 1 批请求不重发） |
| NIW-C23 | P11 | 识别失败后 `wizard-next{skip:true}`（跳过此步骤） | 该类识别与导入步骤 skipped，进入下一类识别 |
| NIW-C24 | — | 识别结果为空 | stepState=waiting、候选 []；`wizard-next` 使下一导入步骤 skipped |
| NIW-C25 | P11 | 第 5 步本地与模型均未识别到章节 | structure 为 1 章"未分章正文"；第 6 步可继续 |
| NIW-C26 | P06 | 第 15 步取消子世界"子界"和父世界一个子项 | 只为选中子项与父世界建任务；子界无任务；父世界任务完成后其子项任务才启动 |
| NIW-C27 | P06 | 父世界实体任务失败；然后 skip | 失败期间其子项任务保持 waiting；skip 后子项任务同步 skipped 并记录 |
| NIW-C28 | P06 | 父世界自身子项全部取消、子世界仍选中；另一用例父世界任务被跳过 | 前者父世界作为容器保留、子世界 parentId 指向父世界（与 U18 一致）；后者子世界随依赖一起跳过（取消父世界会级联取消子世界，故不存在"父取消、子保留"的提升情形） |

### 并行导入（P04、P05、N5–N7）

| ID | 覆盖 | 用例 | 期望 |
| --- | --- | --- | --- |
| NIW-C29 | P04 | 10 个角色，假 ai 延迟 50–150ms | 任意时刻 entity 在途 ≤4；全过程 `max==4` 被观察到；每完成一项后 view 中该任务 done |
| NIW-C30 | P04 | 第 4 个角色首次失败 | 其余完成；会话 phase≠failed；只剩失败项时 `controller.active===0` 且 phase=select、stepState=waiting；`wizard-task{retry}` 后完成并自动推进 |
| NIW-C31 | P04 | 运行中 `wizard-task{skip}`、`{skip-failed}` | `epoch` 不变；在途任务正常完成；`skipped` 含对应 label；全部 done/skipped 后推进 |
| NIW-C32 | P04 | 运行中调用 `include`、`set-title`、`wizard-select-candidates` | 均拒绝"导入正在处理，请先暂停" |
| NIW-C33 | P04 | 运行中 `pause` | 假 ai/generateImage 收到 abort；phase=paused，resumePhase=running，wizard.step=import-char；在途任务 state=paused |
| NIW-C34 | P04 | `resume` | paused 任务变 waiting 并完成；已完成任务的请求次数不增加 |
| NIW-C35 | P04 | 暂停后迟到返回的结果 | 不进入 artifacts |
| NIW-C36 | — | 重开应用后恢复第 10 步 | 授权撤销；step 仍为 import-char、stepState=waiting；`resume` 无 consent 时提示重新允许，不变为 confirm；带 consent 后继续 |
| NIW-C37 | — | 第 3 步之后重开应用 | `targetNeedsAuthorization===true`；第 4–21 步可继续；第 21 步 `wizard-next` 要求重新授权目录 |
| NIW-C38 | P05 | 角色 A 关系指向 B，B 晚于 A 完成；另一用例 B 被跳过 | 前者解析后 `relationships[0].characterId===B.id`；后者无 characterId、target 为 B 名字，`dropped` 1 条 |
| NIW-C39 | P03 | 场景"南巷"上级"北城"被跳过 | 南巷 parentId 为空；北城任务先于南巷启动（拓扑序） |
| NIW-C40 | N5 | entity 请求 `entities` | 角色条目键集合恰为 {id,kind,name}；场景含 entityType:'PLACE'；世界 WORLD；子项 SETTING+worldId+settingType；instruction 含别名 JSON；用 `runImportAi` 的 schema 校验通过 |
| NIW-C41 | P05 | entity 结果 motivations 非法，第二次合法 | 第二次请求 instruction 含结构提示；任务 done；两次都非法：任务 failed |
| NIW-C42 | N6 | 同批 3 个结果中 1 个与已有实体别名冲突 | 该任务 failed（error 为 safeError 文案），另 2 个已提交；该批只调用一次 save |
| NIW-C43 | — | 实体步骤中产生冲突 | phase 不变；调度继续；冲突 id 在 deferredConflicts；第 21 步 phase=conflicts |
| NIW-C44 | P03 | 复核返回无 artifactId 的 missingTargets（名称为已取消的候选） | 不新增 artifact；`dropped` 有记录 |

### 核验、保存、运行时证明（N3）

| ID | 覆盖 | 用例 | 期望 |
| --- | --- | --- | --- |
| NIW-C45 | — | PDF 来源（假 pdf client，限 1 运行 1 排队）+ 并发 4 | 无 `busy` 错误；`pdf.verify` 次数 ≤ ⌈请求数/16⌉ + 步骤数 |
| NIW-C46 | — | 非 PDF：`verifySources` 次数 | ≤ ⌈请求数/16⌉ + 步骤数 |
| NIW-C47 | — | 核验时来源被改动 | 在途全部 abort；未提交结果不入 artifacts；phase=failed，error 含"来源" |
| NIW-C48 | — | 40 个实体任务，spy `save` | 本步保存次数 ≤ ⌈40/8⌉ + ⌈时长秒/2⌉ + 5 |
| NIW-C49 | N3 | 并发 4 时读 `runtime.json` | 4 条 pending；结束后均 settled；任意时刻 calls ≤ 4+2（实体+图片） |
| NIW-C50 | N3 | `runtime.json` 写入失败（注入） | 该调用被取消，任务 failed，会话不 failed |
| NIW-C51 | N3 | `runtime.json` 原子写中途崩溃（留下 tmp） | 重开 initialize 删除 tmp，原文件可解析 |
| NIW-C52 | N3 | 暂停证明 | `remaining.imageOperations` 存在；有在途图片时暂停后为 0 才写 drained |

### 校验（P08，第 21 步）

每条注入一个故障，断言对应 `checks[i].ok===false`、原因文案非空，且 `wizard-next` 拒绝。

| ID | 检查 | 注入 |
| --- | --- | --- |
| NIW-C53 | 卷章与正文完整 | 篡改 `chapters[1].content` |
| NIW-C54 | 所选范围一致 | 某 artifact evidence 指向不存在 unitId |
| NIW-C55 | 角色关系引用 | relationship.characterId 指向不存在 id |
| NIW-C56 | 世界观归属 | SETTING worldId 指向未导入世界 |
| NIW-C57 | 世界线/叙事线引用 | narrative refs 指向不存在事件 |
| NIW-C58 | 细纲覆盖 | 删除一章细纲 |
| NIW-C59 | 伏笔触点 | 保留触点 quote 被改为不可定位 |
| NIW-C60 | 一致性复核 | 假审核返回 1 条冲突 → phase=conflicts |
| NIW-C61 | 全部通过 | `checks.length===8` 且全部 ok；`wizard-next` 进入发布 |
| NIW-C62 | P08 | C55 后 `wizard-retry-kind{character}` | 角色 artifacts 清空、候选选择保留；step=import-char |
| NIW-C63 | P08 | C60 后 `resolve` | 假 ai 不收到 kind ∈ 旧 12 类的整书 analyze 请求；只有受影响 artifact 的 reconcile 与 review；checks 重算全部通过 |
| NIW-C64 | N10 | 第 21 步修订编辑了伏笔 touches | `planForeshadowTouches` 重跑，`dropped` 更新 |

### 返回修改（P11）

| ID | 用例 | 期望 |
| --- | --- | --- |
| NIW-C65 | 第 18 步运行中 `wizard-revise{to:'detect-scene'}` | 在途 abort；场景及之后 artifacts、候选、任务、图片文件删除；角色结果保留；step=detect-scene；`deferredConflicts`、`checks` 清空，场景及之后类别的 conflicts/decisions 删除 |
| NIW-C66 | `wizard-revise{to:'work'}` | 只改名/目录，artifacts 不变 |
| NIW-C66b | `wizard-revise{to:'kinds'}` | wizard.structure、structureDecision、structureHash、materializedVolumes、chapterSelection、grantedChapters 全部清空；之后第 5 步重新执行 |
| NIW-C67 | `wizard-back` 在第 4 步 / 第 8 步之后 | 前者回到第 3 步；后者拒绝 |
| NIW-C68 | revise 后 imageGrants | 被清空；再次勾选图片需 `imageConsent` |

### 图片（P14）

| ID | 用例 | 期望 |
| --- | --- | --- |
| NIW-C69 | 角色勾头像+立绘，10 个角色中 1 个跳过、1 个失败后跳过 | 图片任务 = 8×2；每个 dependsOn 其实体任务；图片在途 ≤2 |
| NIW-C70 | 不勾选任何图片 | 假 generateImage 调用 0 次 |
| NIW-C71 | 勾选但 `wizard-next` 缺 `imageConsent` | 拒绝 |
| NIW-C72 | 勾选使预估 >200 MiB | `wizard-set-images` 拒绝 |
| NIW-C73 | 图片失败 → retry；另一张 skip | retry 后 done；skip 进 skipped（label "林舟的头像"）；角色 artifact 不变 |
| NIW-C74 | 生成前图像模型被更换 | 任务 failed，error="图像模型配置已变化" |
| NIW-C75 | 角色 appearance、clothing 都空 | 图片任务 failed "缺少外观描述"，generateImage 未被调用 |
| NIW-C76 | 生成 prompt | 等于 `buildCharacterImagePrompt('avatar', V2 投影, {})`；场景/物品同理 |
| NIW-C77 | 假 generateImage 返回 11 MiB；PNG 魔数错误；mime 为 text/html | 均 failed，未写入 images/ |
| NIW-C78 | rename 后检查点前崩溃（注入）；登记文件被改写 | 重开删除未登记文件；sha256 不符的任务回到 waiting |
| NIW-C79 | images/ 内有 symlink；nlink>1 文件；未知名文件 | initialize 不跟随链接；`discard` 拒绝 |
| NIW-C80 | `wizard-read-image` | 运行中可调用；返回字节 sha256 与登记一致；未登记 taskId 拒绝 |
| NIW-C81 | `discard` 含 images/ 与 runtime.json | 成功删除整个会话目录 |
| NIW-C82 | 重开后图片任务 | imageGrants 撤销；恢复时要求重新允许图片 |

### 无模型与兼容

| ID | 用例 | 期望 |
| --- | --- | --- |
| NIW-C83 | P10 F+无模型 | 推断选项不可选；`wizard-set-images` 拒绝；清单来自资料标题；17–20 skipped；0 次 ai 调用 |
| NIW-C84 | 旧会话 journal（无 wizardVersion）恢复、start、resolve、发布 | 走原 handler（spy 断言向导 handler 未被调用）；结果与现有测试一致 |
| NIW-C85 | journal 含 `wizard` 但无 `wizardVersion` | `initialize` 不恢复该会话 |
| NIW-C86 | 隐私 | 向导各步 `ImportView` 序列化后不含任何绝对路径（`/` 开头的来源/目标/root）与 `apiKey`/`authorization` 字样；`targetLabel` 等于目录 basename |

## S：服务端与发布（PGlite 内存库）

| ID | 覆盖 | 用例 | 期望（断言） |
| --- | --- | --- | --- |
| NIW-S01 | — | `runImportAi` intent=roster/entity/touches 合法结果 | 通过 |
| NIW-S02 | — | roster 结果带 `artifacts`；touches 带 `classifications` | 拒绝"当前语义阶段包含越权结果" |
| NIW-S03 | — | roster 条目 evidence 不可定位 | 该条丢弃，其余保留 |
| NIW-S04 | — | roster/touches 空数组且无 notFound | 合法 |
| NIW-S05 | — | runtime-proof schema 接受 roster/entity/touches；拒绝 intent='other' | 通过/拒绝 |
| NIW-S06 | P02,P09 | 发布 U06 物化结果 | Volume 2 条（甲卷 index1、乙卷 index2）；Chapter 7 条，卷内 index 从 1 连续；乙卷首章标题为"第二章 …"；各章 content 与原文区间逐字相等；无"三起""后记" |
| NIW-S07 | P05 | 发布 V2 角色 | Character 每个 V2 列等于规整后的值；arcStages[0].startChapter.chapterId 为已建 Chapter.id、label 为"第一卷 · 第 n 章 标题"格式；relationships[0].characterId 为新建 Character.id |
| NIW-S08 | P03 | 发布场景/物品 V2 | Scene.exteriorDescription 等写入；Item.aliases 10 个、tags 8 个 |
| NIW-S09 | P07 | 发布伏笔 | Foreshadow.status 与计划一致；ForeshadowTouch 行数、kind、chapterId 正确；CHAPTER_CONTENT 引用经 `resolveReferenceAnchor(chapter.content, ref)` 得到与 startOffset/endOffset 相同区间；CHAPTER_OUTLINE 引用存在；planning `events[].materialRefs`、`cards[0].tellings[0].materialRefs` 含伏笔 id；`validatePlanning(planning)` 不抛出 |
| NIW-S10 | P14 | 发布图片 | 作品资产目录新增文件数=图片数；CharacterImage/ItemImage url 前缀 `/_desktop/assets/<workspaceId>/`；SceneImage.id=资产 id、filename 存在、url 匹配 `/api/novels/<novelId>/scenes/<sceneId>/images/<id>/asset`；`readSceneImageAsset` 可读回；avatarUrl/portraitUrl/exteriorImageUrl/iconUrl 指向对应记录；exteriorImageRevision=1 |
| NIW-S11 | P14 | 发布事务中注入错误 | 本次写入的资产文件全部被 removeCreated；资产目录文件数恢复 |
| NIW-S12 | P14 | 首次事务提交后再次调用 initialize（模拟 manifest 未 ready 的重试） | 资产文件数不变；返回原回执 |
| NIW-S13 | — | worker 收到的图片 sha256 与字节不符 | 发布拒绝，未写资产 |
| NIW-S14 | — | `workspaces.create` 导入 initialize 内调用 `currentWorkAssets()` | 不抛出 |
| NIW-S15 | P08 | 导入记录 ContentVersion snapshot | 含 wizard.structure、chapterSelection、candidates（含未选项 selected:false）、skipped、dropped、images[{taskId,kind,sha256}] |
| NIW-S16 | — | 基准：1394 章、300 V2 角色、1000 触点、200 图片记录 | 事务耗时 ≤ 60 秒；实测值写入验证报告 |

## B：浏览器组件（假桥接）

每条用例只断言列出的内容；文字均为精确字符串。

| ID | 覆盖 | 用例 | 期望（断言） |
| --- | --- | --- | --- |
| NIW-B01 | P01,P13 | 依次走第 1–4 步；第 3 步标题与目录点击回归 | 对话框标题依次为"选择来源""确认文件""作品与目录""选择内容"；第 3 步未选目录时"继续"按钮 `disabled`；编辑标题后的首次选择、已选后重选、"继续"及"上一步"均在标题保存成功后才发后续动作并使用新 revision，保存失败阻断、保留本地标题且可重试；未改标题时成功重选、取消后再选均恢复可用，目录 IPC 在途连点不重复但完成后允许再次主动选择 |
| NIW-B02 | P01 | 步骤总览与阶段条 | 收起时按钮文字"第 10 / 22 步 · 导入角色"；展开后 22 个 `li`，已完成项含读屏文字"，已完成"、跳过项"，已跳过"；阶段条 6 个 `li`，当前项 `aria-current="step"`；390 宽时阶段条 `ol` 隐藏，显示"阶段 3 / 6 · 角色 · 场景 · 物品 · 第 10 / 22 步" |
| NIW-B03 | P12 | 第 2 步 | 文件行含"GB18030（自动识别）"；页面无名为"确认编码"的按钮；点"编码不对？"后出现名为"<文件名> 编码"的下拉，选项为 UTF-8、UTF-16 LE、UTF-16 BE、GB18030 |
| NIW-B04 | P02 | 卷章树 | 初始全部章节 checkbox `checked`；取消乙卷 1 章后乙卷 checkbox `indeterminate===true`、行内文字"2 / 3 章"、工具栏"已选 9 / 11 章 · 4 卷"；点"全不选"后主按钮 `disabled` 且提示"请至少选择一章"；搜索"再"后勾选乙卷只改变可见章节；页底含"发送范围"与真实模型名；主按钮文字"允许分析并导入" |
| NIW-B05 | P03 | 角色清单 | 每行可见文本只有名称与类型标签（不含"章""资料"字样）；工具栏"已选 3 / 3"；点"详情"出现"别名：… · 出场 N 章 · 来源：…"；点类型标签出现下拉，改为"反派"后标签文字为"反派"；"合并为同一角色"在勾选少于 2 项时 `disabled`；场景行按上级缩进（子场景有 `ch` 缩进类）；物品行有类型标签；全不选时主按钮文字"跳过" |
| NIW-B06 | P14 | 图片选项 | 第 9/11/13 步分别有 2/2/1 个 checkbox，名称为"生成头像""生成立绘"/"生成外景图""生成内景图"/"生成物品图标"，初始都未勾选；勾选头像+立绘后主按钮"导入 3 个角色并生成头像与立绘"；说明文字含真实图像模型名；无图像模型夹具下 checkbox `disabled` 且出现"配置模型"按钮 |
| NIW-B07 | P04,P14 | 任务卡 | done 卡在名称后有打钩图标且含读屏文字"，已完成"；failed 卡有"重试""跳过"按钮；图片小标签文字"头像"及状态；进度文字 `#live` 为"已完成 2 / 3 · 头像 1 / 3 · 1 项失败"；底栏出现"跳过失败项并继续（1）"；进度条 `role="progressbar"` 且 `aria-valuenow` 等于完成任务数 |
| NIW-B08 | P06 | 世界树 | 子世界节点位于父世界的子 `ul` 内；取消父世界后其下全部 checkbox 未勾选；取消子世界一个子项后父世界 `indeterminate`；"全选/全不选"生效 |
| NIW-B09 | P07 | 伏笔页 | 每条触点行含 4 个标签，文本前缀分别为"正文 · ""大纲 · ""世界线 · ""叙事线 · "；状态标签为"已埋入"或"已回收" |
| NIW-B10 | P08,P11,P14 | 校验页 | 8 行检查；问题行有"处理矛盾"或"重试导入角色"按钮；有问题时"保存作品" `disabled`；跳过区块文字"已跳过 2 项"并含"林舟的头像" |
| NIW-B11 | P14 | 完成页 | 统计含章节、角色、场景、物品、世界观设定、伏笔 6 项；勾选图片时说明含"已生成头像 3 张" |
| NIW-B12 | P11 | 暂停与停止 | 暂停后 `#live` 以"已暂停 · "开头、按钮文字"继续导入"；"停止导入"弹出含"继续导入""停止并保留草稿""丢弃导入草稿"三按钮；点"丢弃导入草稿"出现二次确认文字"不能恢复"；"停止并保留草稿"后对话框隐藏、任务条可见 |
| NIW-B13 | P11 | 返回修改选择 | 列出可返回步骤的单选项，文字"第 11 步 · 识别场景"与"将丢弃第 12–18 步的结果" |
| NIW-B14 | P11 | 识别失败与空 | 失败：`role="alert"` 文本含"识别失败"，有"重新识别""跳过此步骤"；空：文本"未识别到角色"，有"重新识别""跳过" |
| NIW-B15 | — | Esc 与任务条 | Esc 后对话框隐藏且假桥接未收到 pause/cancel；任务条文字以" · 等待确认"结尾（清单步骤）或含" · 已暂停" |
| NIW-B16 | — | 焦点与 Tab | 在卷章树对第 3 个章节 checkbox 按空格后 `document.activeElement` 仍为该 checkbox；Tab 从最后一个可聚焦元素回到第一个 |
| NIW-B17 | — | 中文输入 | 搜索框派发 compositionstart + input("林") 时列表不变；compositionend 后列表筛选 |
| NIW-B18 | — | 减弱动态 | `reducedMotion:'reduce'` 下导入中卡片显示文字"导入中"；`.sp` 元素 computed `animation-name` 为 `none` |
| NIW-B19 | — | 主题与宽度 | 宣纸/玄墨 × 1280/390：`document.scrollingElement.scrollWidth<=clientWidth`；390 宽第 10 步首个任务卡 `getBoundingClientRect().top` < 视口高度 |
| NIW-B20 | P10 | 无模型 | 第 4 步推断卡全部 `disabled`；第 6 步页底含"仅拷贝"、主按钮"开始导入"；第 9 步只有资料角色 |
| NIW-B21 | — | 示例值不入源码 | 03 示例值清单（雾港夜行、林默、艾琳、老约翰、白鸦、薇拉、卡尔文、灰袍主教、雾港城、灯塔区、钟楼街、铜灯、星图残页、黑羽怀表、雾海世界、梦境层、示例文本模型、示例审核模型）在 `src/components/desktop/novel-import-wizard/`、`src/lib/desktop/novel-import-wizard.ts`、`desktop/` 中搜索结果为空 |

## R：真实目标（《诡秘之主》）

### 前置条件

- 运行时：`/private/tmp/shakeink-lotm-runtime-20261027/LotmVerification.app`。模型 Key 以该 app 身份加密保存在现有 app-data 中，新建 app-data 无法使用。因此 R 层使用**现有 app-data 的副本**：主代理把 `app-data` 目录复制为 `app-data-wizard-<日期>`（复制加密状态，不读取、不导出、不修改 Key），删除副本中的 `novel-imports/` 与 `works/`，以 `SHAKEINK_TEST_ROOT` 指向副本启动。原 app-data 不改动。
- 模型：副本中已有文本模型 DeepSeek-V4.1-Flash（文本与审核均指向它）和图像模型 doubao-seedream-5-0-flash-260915（`imageModelId` 当前为空）。运行前需在副本的设置界面中把图像模型设为默认图像模型；这是界面操作，不触及 Key。若图像模型不可用，R05/R06 的图片部分记为"未执行（无可用图像模型）"。
- 发送授权：R 层会把《诡秘之主》所选章节发送给 DeepSeek，把角色/场景/物品外观描述发送给字节跳动图像服务。**执行 R 层前须用户明确同意**；未获同意时 R 层全部记为未执行。
- 选择器：沿用现有受控选择方式（`LOTM_CONTROLLED_PICKER=1` 时由脚本经测试入口提供文件路径与目标目录），证据中注明"受控选择，非原生对话框"。
- 成本控制：只保留第一部、第二部（482 章）参与分析。
- 复制前确认原 app-data 没有正在运行的导入（无运行中的 LotmVerification 进程，`novel-imports` 中会话 phase 非 running/recognizing/publishing）；R 层结束后删除副本（含加密 Key 的 state），删除记录进 R11。
- 证据目录：`/private/tmp/shakeink-lotm-wizard-<日期>/evidence/`，写入用 `wx`；仓库内只放汇总报告。

### 用例

| ID | 覆盖 | 用例 | 通过条件 |
| --- | --- | --- | --- |
| NIW-R01 | P12,P13 | 选择原始文本 | 第 2 步文件行显示"GB18030（自动识别）"，未出现"确认编码"；第 3 步作品名默认"诡秘之主-原始文本"，选定空目录后可继续 |
| NIW-R02 | P09 | 第 6 步卷章树 | 前七卷卷名与章数精确为：第一部 小丑 213、第二部 无面人 269、第三部 旅行家 250、第四部 不死者 214、第五部 红祭司 204、第六部 逐光者 116、第七卷 倒吊人 87；第七卷之后、番外之前恰有 41 章（"第一章 这一晚"…"第四十一章 新的旅程"）自成一组，卷名为"愚者"（模型识别）或为无卷名组——若为无卷名组，经"手动调整卷章"补卷名"愚者"后计数正确；番外 8 篇（一个普通人的日常（一）…（八））自成一组、不并入主线卷；完本感言可单独取消。前七卷任何章数差异、第八部 41 章被并入第七卷或拆散，判失败。与 LOTM-L-VOL01 口径一致 |
| NIW-R03 | P02,P09 | 选择：第一部全选；第二部取消第 1、2 章与第 100–110 章；第三至七卷与未分卷全部取消 | 保存后作品卷数 2、章数 213+256=469；第二部卷名仍为"无面人"；每章正文 sha256 与原文对应区间一致；作品全文不含"完本感言" |
| NIW-R04 | P03 | 第 9 步角色清单 | 存在名称为"克莱恩·莫雷蒂"或"克莱恩"且类型为主角的条目；清单 ≥20 条；取消 3 个配角（记录名称） |
| NIW-R05 | P04,P05,P14 | 第 10 步，勾选生成头像 | 观察到同时导入中卡片数=4 的时刻（截图）；全部完成或跳过；保存后取消的 3 个角色不存在；主角 Character 的 appearance、personality、motivations、growthArc 或 arcStages、relationships 均非空；头像记录数 = 导入成功角色数 − 跳过的头像数 |
| NIW-R06 | P03,P14 | 场景勾外景图、物品勾图标；各取消 1 项 | 取消项不在作品中；SceneImage(exterior)、ItemImage 记录与资产文件存在 |
| NIW-R07 | P06 | 世界观树 | 至少一个子项类型为等级体系或力量体系（如非凡途径/序列）；取消的 1 项不在作品 Setting 中 |
| NIW-R08 | P07 | 线索 | 469 章每章 Chapter.outline 非空；伏笔 ≥5 条；≥1 条伏笔同时有 CHAPTER_CONTENT 引用、世界事件 materialRef 与讲述 materialRef；随机抽 5 个 CHAPTER_CONTENT 引用经 `resolveReferenceAnchor` 定位成功 |
| NIW-R09 | P04,P11 | 第 10 步完成约一半时暂停、退出应用、重开、重新允许、继续 | 重开前已完成任务的请求次数在继续后不增加（runtime.json 计数）；最终完成 |
| NIW-R10 | P08 | 校验并保存，打开作品 | 第 21 步 8 项检查全部通过（若有矛盾，作者决定后通过并记录）；作品在工作台打开；角色、场景、物品、世界观、伏笔面板显示导入内容与图片（截图） |
| NIW-R11 | — | 证据审计 | 证据目录中无 `sk-`、`Bearer `、`api_key` 等 Key 模式；无与原文连续 20 字以上相同的片段（脚本按原文滑窗检查）；未复制 `session.json`、`runtime.json`、`state.json`；截图中不含正文段落（截图只取对话框与面板列表区域）；app-data 副本已删除（记录删除时间与路径） |

R 层任何一项未执行或失败，在验证报告中如实列为未执行/失败，不以 C/S/B 层结果代替。

## 台账

`docs/requirements-traceability.json` 新增 NIW-P01…NIW-P14：`requirement` 取 02 验收原文；`testIds` 为下表；`verificationKind` 用现有取值——仅含 U 为 `UNIT`，含 C/S 为 `INTEGRATION`，含 B 为 `UI`，R 层另列 `NOVEL_IMPORT_TARGETED`（同一 P 可登记多条）；`status:"planned"`。

| P | 测试 |
| --- | --- |
| P01 | U05 U38 C01 C05 C06 C07 C11 B01 B02 |
| P02 | U06 U07 U08 U09 C12 C13 S06 B04 · R03 |
| P03 | U10 U11 U12 U13 U24 U39 U40 C08 C09 C21 C39 C44 S08 B05 · R04 R06 |
| P04 | U41 C29–C36 B07 · R05 R09 |
| P05 | U20 U21 U22 U23 C38 C40 C41 S07 · R05 |
| P06 | U18 U19 C26 C27 C28 B08 · R07 |
| P07 | U25–U32 C64 S09 B09 · R08 |
| P08 | C53–C63 S15 B10 · R10 |
| P09 | U07 S06 · R02 R03 |
| P10 | U14 U15 U16 U17 C83 B20 |
| P11 | U38 C23 C25 C65–C68 B12 B13 B14 B15 · R09 |
| P12 | U01–U04 C03 C04 B03 · R01 |
| P13 | C01 C02 B01 · R01 |
| P14 | U37 U39 U41 C69–C82 S10 S11 S12 B06 B07 B10 B11 · R05 R06 |

真实目标覆盖：P02 P03 P04 P05 P06 P07 P08 P09 P11 P12 P13 P14；P01、P10 不在 R 层覆盖（无模型路径不适用于真实模型运行）。
