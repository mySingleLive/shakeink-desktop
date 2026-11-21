# 《诡秘之主》本地整书导入执行与自愈记录

日期：2026-10-28。本文按实际执行追加；未执行项目保持 NOT RUN，不预填通过。

## 用例状态

| 用例 | 状态 | 实际证据/说明 |
|---|---|---|
| LOTM-L-IN01 | PASS | 正式UI确认GB18030；原文件SHA、字符/换行/U+FFFD及完成后原件不变均核验 |
| LOTM-L-IN02 | PASS | v2独立基线：9卷1402章、35/2 PS、全部非叙事边界及原文hash通过独审 |
| LOTM-L-FLOW01 | BLOCKED | macOS辅助功能权限拒绝按键，真实原生选择器未通过；受控回退仅继续其他验证 |
| LOTM-L-FLOW02 | PASS | 精确正文、selected=['body']、11目标、隔离目录与冻结模型已确认并进入running；未选goldenFinger，未直接写库或注入结果 |
| LOTM-L-VOL01 | NOT RUN | 待9卷1402章发布核验 |
| LOTM-L-BODY01 | NOT RUN | 待发布及重开逐字比较 |
| LOTM-L-OUT01 | NOT RUN | 待完整大纲生成与独审 |
| LOTM-L-THEME01 | NOT RUN | 待 Theme 实表与语义核验 |
| LOTM-L-STYLE01 | NOT RUN | 待 STYLE 实表与语义核验 |
| LOTM-L-CHAR01 | NOT RUN | 待角色及关系实表与语义核验 |
| LOTM-L-ITEM01 | NOT RUN | 待物品实表与语义核验 |
| LOTM-L-SCENE01 | NOT RUN | 待场景树与语义核验 |
| LOTM-L-WORLD01 | NOT RUN | 待 World 容器与语义核验 |
| LOTM-L-WORLD02 | NOT RUN | 待 LEVEL_SYSTEM 核验 |
| LOTM-L-WORLD03 | NOT RUN | 待 POWER_SYSTEM 核验 |
| LOTM-L-WORLD04 | NOT RUN | 待 CONCEPT 核验 |
| LOTM-L-WORLD05 | NOT RUN | 待 FACTION 核验 |
| LOTM-L-WORLD06 | NOT RUN | 待 MAP 核验 |
| LOTM-L-WORLD07 | NOT RUN | 待 SOCIETY 核验 |
| LOTM-L-WORLD08 | NOT RUN | 待 CULTURE 核验 |
| LOTM-L-WORLD09 | NOT RUN | 待 GEOGRAPHY 核验 |
| LOTM-L-WORLD10 | NOT RUN | 待 WORLD_HISTORY 核验 |
| LOTM-L-FORE01 | NOT RUN | 待伏笔实表与埋设/回收独审 |
| LOTM-L-TROPE01 | NOT RUN | 待两类 Trope 实表与语义核验 |
| LOTM-L-WLINE01 | NOT RUN | 待世界线原生事件与逐章核验 |
| LOTM-L-NARR01 | NOT RUN | 待叙事线章节/refs与逐章核验 |
| LOTM-L-REVIEW01 | NOT RUN | 待完整 coverage/review/semanticState |
| LOTM-L-PERSIST01 | NOT RUN | 待正常关闭、只读数据库审计及新launch重开 |
| LOTM-L-AUD01 | PASS | 合成审计器22/22通过，含原库篡改、错误refs、缺章/缺子设定及scratch READ ONLY；真实结果审计待完成 |
| LOTM-L-HEAL01 | NOT RUN | 已发生多轮真实流程与实现自愈；最终状态待整书及语义核验 |

## 自愈 H01：输入基线边界与失效断言

- v1 冻结命令真实 exit0，但独立输入审核判 IN02 不通过：末篇 PS1 行首两个 U+3000 被误留在第1402章末尾；章内 PS 保留循环错误读取 range 字段，实际候选使用 start/end，导致断言未执行。原件与产品均未改动。
- v1 脚本及四份输出完整保留于私有 `baseline-v1/`。修正 cutoff 到 PS1 物理行起点，并增加35条保留、2条排除的精确计数断言后重新冻结；这是独立证据支持的工具基线纠错，不是为产品转绿修改预期。
- v2 冻结 exit0：正文4,785,312字符，SHA `81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414`；第1402章终点及末段排除起点均4803194。独立复审重算9卷1402章、逐段拼接、35/2 PS边界后通过，机械 IN02 基线可用；IN01 的正式UI确认另验。

## 构建环境自愈 H02

- 首次 `npm run build` exit1：UI编译和TypeScript通过，但默认Node v20.20.2在desktop构建加载`.ts`时报`ERR_UNKNOWN_FILE_EXTENSION`。项目要求Node >=24 <25，不能把该次记为构建通过。
- 使用本机项目要求的Node v24.18.0重新执行同一`npm run build`，exit0；日志私有`build-node24.log`。初始dist main/service/preload SHA分别为`488489aa…0bdb`、`2a17894a…c7b`、`b1aa9792…cba4`，Next BUILD_ID `d6ff4313b9af333cbe3384c9fe455bf7f67530e7ca4156c915ebd94015c9000a`。
- 测试驱动`run-lotm-local-import.mjs`只做正式UI/原生选择器/现有IPC操作，完整截图与检查点留在私有目录；首次真实前置执行结果待记录。

## 卷章自愈 H03 与分析前基线

- 原生macOS选择器实际尝试因`osascript`不允许发送按键（1002）阻塞，未创建会话；真实原生项不以回退替代。受控回退选择同一原件后，首次choose保存真实报“卷归属必须按原文连续排列”，草稿`b61a26f1…236a`仅`.owner`无session，零模型请求。
- 06方案/用例经07独审，补充start/resume/retry分析前严格门槛与AI=0、人工组名冲突、真实choose/UI断言。TDD真实RED后修改core chapters/main controller/ChaptersScreen；08记录实施，09独立代码审核通过并独立复跑25/25及typecheck。
- 修复后实际Electron已成功读取指定原件并显示GB18030。驱动曾把fileId误作sessionId、忽略3个待识别片段及错误假设暂停按钮，均按真实界面修正；这些不作为产品修复。范围操作改为同一正式`set-range` IPC，避免大列表UI重复操作，仍受控制器/检查点约束。
- 事前独立语义清单45项已在任何本次模型分析前冻结：11 targets、九类worldCategory、SATISFACTION/TEAR和8篇番外全覆盖。旧PLEASURE枚举版保留，当前SHA `29118079538ce72421cfa9ee4524159bf199c6e494cd0be02e9def0dd686658a`；run SHA `3ca34c5ec5e5f3476d905cf6f8124756a622b8a939e2729f716c123e8e4f1432`。
- 正式会话`6d7b6180-7d01-4a0b-9e95-01104090bcce`，createdAt `2026-10-27T21:59:32.342Z`。V05真实GREEN：9卷1402章，卷章数`213/269/250/214/204/116/87/41/8`，章节拼接正文SHA `81d901…7414`，selected=['body']、11 targets、零模型产物/coverage/publication。证据私有`volume-complete2-evidence/green.json`及真实UI截图；这是分析前卷章通过，不是发布后VOL01通过。
- 驱动范围归并初版误将1402章逐一分类，已停止并改为按冻结卷号的9段正文+8段排除；恢复按钮按可见且可用状态等待。上述均为测试驱动修正，未降低产品预期。

## 模型授权自愈 H04

- 首次真实分析rev925/failed：首个outline operation在约0.2秒内rejected，零artifacts/coverage，正文hash不变，不能盲目归为schema或供应商内容问题。
- 使用同一加密模型记录做最小真实连接检查，直接Electron身份返回`AUTHORIZATION_REVOKED`；此前创建模型的隔离应用`ink.shakeink.lotm-verification`与Electron二进制hash一致，改用该身份后同一检查`ok=true`，1040ms，usage 35+2 tokens。未读取/输出/重置Key。
- 以正确隔离身份恢复同session并再次进入running，原授权失败证据保留于`analysis-evidence/`与`model-diagnostic.json`，新证据在`analysis-runtime-evidence/`。完整11目标仍在执行，后续按实际coverage/语义与发布验收。

## 新顺序真实恢复与自愈 H06

- 最新完整构建及Node 24 TypeScript检查通过。隔离根的应用窗口和首次启动主题引导均有真实截图；默认启动快速退出是已有应用的单实例锁，不是允许删除默认数据的故障。
- 驱动首次混用“重置并恢复”以及重复证据目录，分别在来源入口和EEXIST处停止；随后改为新会话与唯一证据标签。没有将这些驱动错误记作产品修复。
- 真实set-encoding暴露“本地章界缺少可核对候选”。候选扫描曾对每一行复制完整前/后缀并回扫不存在的CR，整书探针约157秒；修复为相邻行定点检查后约0.22秒。文件起点回退补齐真实候选，空行正则sticky下标及file/directory元数据边界经独立复审和22/22回归。
- 规划validatePlanning逐章重复全书卡片排序/扫描，造成审计负例组超时；改为局部阅读卡索引，保持错误顺序和预算语义。审计细纲负例修正为只篡改映射，完整22/22通过；相关回归273/273通过。
- 一次失败驱动遗留的Electron子进程仍占用隔离根，确认session仅source、零steps/artifacts后终止该测试进程；未删除锁文件、journal、默认配置或用户数据。另一重置分支错误假设新草稿已有H05备份，改用无需该假设的新建会话分支。
- 当前真实新结构会话及11类完整分析/文学验收仍未据此判定通过。

## 真实模型分类自愈 H07

- 正式新会话为`7414fd07-904b-46c2-b0fc-0fce080d4666`。指定原件SHA、严格GB18030和4,803,440字符均在真实UI/IPC复核；没有继承H05早期outline信用。
- 默认Electron对既有隔离模型记录返回`AUTHORIZATION_REVOKED`；旧备用路径已不存在，但隔离目录中的`LotmVerification.app`仍在。最小真实模型检查在该既有运行时返回`ok=true`，未读取、输出或重置Key。
- 真实classify两次在覆盖检查处失败；原schema允许合法但漏项的数组，无法利用既有单次纠错。新增C03受控用例先RED，再将普通classify的必填/长度/唯一/输入归属前置到生成schema，第二次仍失败仍无信用；相关协议85/85通过，独立代码复核接受，并修正重复诊断路径。
- 驱动原先忽略`LOTM_ELECTRON_RUNTIME`，且每次恢复重复`set-encoding`导致分类按规则失效；已分别修复为复用续跑脚本同一参数、仅`requiresEncodingConfirmation`时重新编码。没有绕过产品失效规则。
- 恢复后分类已超过原3616检查点并继续推进。9卷1402章、11类artifact、最终细纲、发布、45项最低语义和1402单元文学审核仍未完成，不以分类进度替代整书通过。

## 恢复顺序与分类分批自愈 H08

- 识别后来源仍可能有unknown，产品在source等待核对不是失败。驱动原只等待select，误耗30分钟；改为接受source/select并先核对来源，且范围变化后重新授权结构，不能只跑本地分类。
- 恢复驱动不得先重做结构再重设范围。现按原文boundary比较相邻同类区间，先归一再授权；不再要求原始分块合并为17块。已确认编码、已一致边界不重复写入。
- 调试只输出固定错误类别，不记录原文、模型原始响应或Key。`expect.poll`改用实际支持的`toBe(true)`；调试失败遗留的隔离测试子进程均按根目录和检查点确认后清理，未删除默认数据或锁文件。
- 真实大批经两次纠错仍不完整，新增C04先RED后实现仅普通classify的覆盖失败二分（最多9次）。父批无信用、成功子批独立提交、右失败不重放左成功、单单元与其它错误仍拒绝。定向88/88通过，独立复核接受；最终相关回归及真实恢复结果另记。

## 正文边界与空白信用自愈 H09

- 真实正文曾少3个卷间换行，当前sha与冻结值不同；另发现番外未独立成卷、微小空白反复unknown。驱动按冻结排除区求补集并在IPC前验证正文sha，已得到`81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414`。
- 独立冻结文件已含书前/书尾排除区，重复追加曾立即RED，未发模型；已移除重复区间，不把未知换行简单丢弃。
- 空白处理方案及代码独审发现“原始已知空白也须credit”。最终实现为included已知空白只记账，unknown空白仅按全序列本地规则解析，prefix不默认body，excluded不发送；恢复后无新增模型请求。定向90/90通过，独立复核关闭问题。
- 正文保真、分类进度和工具修复不替代9卷1402章与11类设定、最终文学验收。

## 卷间证据与来源恢复自愈 H10

- `volumeContext`新增“前一cut必须是实际章节”边界，避免把实质序言后的首章误认作新卷。合法卷间命名、伪造拒绝、无自动命名及序言反例已执行；结构和卷章39/39通过，独立代码复核接受。此前334/334相关回归通过。
- r21真实恢复未进入模型：驱动在异步界面已到“选择内容”时仍只等“核对来源”，60秒超时。改为按实际source/select状态等待再返回来源，保留失败截图和日志，未伪称模型失败。
- r22暴露真实幂等问题：所有body/excluded范围已与冻结范围一致，仅旧卷名错误，重复set-range仍删除structureDecision、保留manual并触发“人工卷名必须与来源卷及其他人工卷组区分”。方案/用例先经独立审核；STR12以同一歧义结构真实RED复现。
- 实现相同units直接返回，不保存/不增revision；真实来源变化清空整个chapterDetection，使明确结构可重新本地确认、歧义结构可重新正式AI确认，非source手工确认保留。用例验证磁盘session不变、改范围/类别仍失效、AI可重确认。40/40结构专项、335/335相关回归、typecheck/build:desktop及独立代码复核通过。
- 旧草稿已在修复前丢失决定，r23通过正式set-range做一次正文内部细分触发重识别；类别不改、正文拼接hash仍在IPC前校验，不直接编辑journal。真实九卷及后续结果待记录。

## 跨单元卷名证据与只读审核自愈 H11

- r23/r24为驱动修正：兼容“核对原文”按钮，且仅在残留manual、无结构draft时用正文内部换行做一次正式范围细分；不误重置自动识别检查点。r25完成5605个body分类（另有32个excluded单元），真实structure前两批有效，第三批因“卷归属不能回跳或重复使用卷名”失败；无正式结构决定、设定或发布。
- 只读元数据核验发现：真实卷末作者说明被拆成两个文本excluded加末尾一个换行excluded，旧实现只读取末尾换行，未取得卷名。经独立方案独审，改为同文件连续excluded链的末尾至多2000 UTF-16字符，按安全边界计算start/end及全部unitIds；不跨body/文件，不自动命名，不改正文/cut。STR11新增真实分段、三单元截取中点/边界和伪造unitIds反例，先RED后GREEN。
- 40/40结构专项、typecheck/build:desktop通过。真实候选现含“愚者”及3个连续来源单元，scopeHash改变后旧structure批次按既定规则失效，不声称保留其信用。独立代码复核接受；r26真实模型复测另记。
- 只读审核初版经独立复核发现null上下文立即失败、真实生成会读写用量、初始化可能隔离无效state等阻断。LOTM-E07先证明options未透传，真实SDK+主网关+PGlite先证明UsageRecord=1；随后增加显式usage/maxNetworkRetries适配，生产缺省保持原checkQuota/recordUsage/重试，readOnlyImportUsage仅校验身份并纯计算成本。只读辅助进程预检state、拒绝元数据写入及DB访问，零重试；该辅助入口仅开发/测试，不进入安装包。
- 修复后适配器透传、真实SDK只读零UsageRecord/tokenUsed不变、原生产默认仍记一条均通过；完整相关回归338/338，独立复核接受。真实只读烟测、45项最低语义、1402单元文学审核仍待执行，不能记为文学通过。
- 合成审计器22/22通过，覆盖缺/重/错序章、错误refs、缺子设定、原库篡改和scratch READ ONLY；不替代真实结果审计。

## 同卷连续性与真实只读诊断 H12

- r26仍在一批真实structure结果处报卷归属回跳，不能在没有保存原始响应时断言其具体原因。独立合成STR13证明另一确定性缺陷：同一卷显式→省略→显式被raw校验误判，而归一化本来会继承。经方案独审，validate改用cut.volume、所选候选volume及前序有效volume计算effectiveVolume；显式来源校验和真实A→B→A拒绝不变。分批合并反例先RED后GREEN，41/41专项、339/339相关回归、typecheck/build:desktop及独立代码复核通过。
- 只读诊断先分别遇到tsx加载器遗漏、预算缺少version及启动前hash断言，均未把未发模型算作诊断通过。后改用importSessionBudget和会话冻结模型；控制器initialize会在启动时递增epoch、撤销授权并保存，故分别记录启动变化与启动后的模型调用区间，不掩盖模型写入。
- 真实第三批只读重放返回299个章界、1个忽略项，现行校验接受；调用前后及正常关闭后journal/state均不变。结果未提交或写入journal，能力验证不等于整书结构或文学通过。r27正式恢复结果另记。

## 番外父标题与版本化归一 H13

- r27真实模型已形成9卷1402章，卷章数为213/269/250/214/204/116/87/41/8，含“愚者”和独立番外；但逐章基线发现首篇番外start多5，独立“番外”标题被留在前一章末。此时不是结构通过，正文拼接仍完整。
- STR09先RED复现。独立方案复核要求仅处理与下一卷名匹配的唯一父标题，不接受任意短正文。v2归一化仅对非forced、来源heading、有标题格式、位于调整后章界区间、无实质span的候选前移，>1拒绝，candidateId与原start脱钩时移除。undefined/1旧结构按旧规则重验，新commit写version=2，未知版本拒绝，不自动迁移旧分析。
- STR14覆盖实质正文不动、卷名不匹配不动、重复父标题拒绝，STR09覆盖candidateId脱钩、旧版本重验和未知版本拒绝。42/42专项、340/340相关回归、typecheck/build:desktop及独立代码复核通过。
- 旧草稿由正式set-chapters修正，不直接编辑journal，不把旧模型坐标称为完全正确。驱动严格限制为全部章名/卷归属正确、仅第1393章end和第1394章start这2处相差5，且原文切片trim为“番外”；实际原文是标题加3个换行。其它情况拒绝人工恢复。
- 真实PreviewScreen完成核对返回来源列表，驱动已改为按可见来源页导航。来源/目标操作按产品规则重新分类；r30工具300秒超时后隔离进程均退出，r31无工具时限恢复，分类从1142续跑而非从零开始。正式set-chapters、烟测及11类分析仍待完成。

## 结构门槛与真实只读烟测 H14

- r31完成正式set-chapters并生成`ordered-session.json`。独立重算9卷1402章，卷章数213/269/250/214/204/116/87/41/8，所有标题/start/end/volume/content逐项等于冻结基线；正文SHA为`81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414`。selected=['body']，11项目标，artifacts=0、coverage={}、无细纲/发布。驱动关闭阶段另有IPC状态错误，但不否定已落盘的真实检查点。
- 首次烟测在分析前workingProse为空而停止，没有调用模型。改为仅从已核验sourceBody构造内存审核单元，不写journal。`readonly-smoke-r2`真实调用返回conflicts=0，启动恢复保存单独记录，模型调用期间及正常关闭后journal/state不变；仅证明只读能力可用，不是文学通过。
- 独立复核指出整书审核冷启动binding和notFound矛盾问题，已修复：新ledger先绑定，45项要求结构化判定且拒绝notFound=true。全部1402章和45项尚未执行，不能用烟测替代。
- 最新相关回归340/340通过。完整11类分析以`ordered-analysis-r1`启动，显式绑定run-ordered、analysis-readiness-ordered和当前构建身份；实际结果后续记录。

## r4角色分析失败只读诊断 H15

- `ordered-analysis-r4`真实11类分析在第3个character批次（23单元，末单元`working-0:18129:19129`）rev1441/failed，界面只显示通用“导入处理失败”；artifacts=0、coverage={}，正文hash不变，无发布。
- 只读重放（`inspect-lotm-analysis-batch.mjs`，payloadHash与失败runtimeAiCall逐字节一致）：默认Electron身份返回`MODEL_KEY_MISSING`，只说明驱动身份错误，不是r4原因；改用隔离`LotmVerification.app`后第一次重放复现`模型证据无法定位（no-match）`，第二次开启锚点诊断时同一请求返回10个合法角色、无notFound。重放期间journal/state hash均不变，正常退出。
- 结论：r4是模型引文非确定性失败，控制器已有的“一次纠错→二分重试”路径在本次两次都未定位后仍以原错误终止（此批≥2单元应二分，需在r5中由DEBUG日志确认实际走到哪一步）。不修改证据校验、不放宽定位规则。
- r5以同一session、隔离运行时、`SHAKEINK_IMPORT_DEBUG=1`与`SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS=1`正式恢复，结果另记。

## r6角色分析失败 H16

- `ordered-analysis-r6`以隔离运行时、原run/readiness及诊断开关恢复同session；r5因误用`analysis-readiness-ordered.json`（其runSha256不对应任何现存文件）在发送确认前被驱动完整性断言拦截，未调用模型。
- r6 rev1460/failed，仍为首个character批次，artifacts=0、coverage={}，正文hash不变。时间线：op1（17:56→18:00）证据定位失败，锚点诊断`noMatch=11, otherUnitUnique=11`，即11条quote均为本次请求中另一单元的逐字唯一原文，仅unitId配错；op2为控制器既有“定位纠错”重发，返回`模型返回的角色字段结构无效（可靠性）`，不属证据白名单，未进入二分，直接终止。
- 结合r4（同类首批失败、重放时同请求一次no-match一次成功）：当前文本模型在角色批次上系统性错配unitId，而非偶发；按现行规则，角色约5589单元、每批约4分钟，任一批非证据类结构错误即终止整书，实际无法完成。
- 不改校验、不擅自改模型。既有方案26明确“分类结果不自动修复或重定向证据”，任何修复方向均改变已独审规则或成本，需用户决定后再走方案→独审→用例→TDD→代码复核流程。

## 证据唯一逐字改挂 H17

- 用户选择“唯一逐字改挂”。方案`20-evidence-rebind-plan.md`经独审`21`有条件接受，两项阻断（早晚同一判定、遗漏补全路径）已写入冻结补充。
- 实现仅`desktop/service/novel-import-ai.ts`：新增`rebindEvidence`，先跑原`anchorEvidence`，仅`no-match`且非空白≥8、在其它单元合计逐字（含重叠）恰1处时改挂；schema检查与晚期接纳共用；晚期按unitId+quote去重并按序追加`sourceUnitIds`，保留声明单元。旧版、reconcile、conflicts保持原严格定位。
- RED：新文件7组中RB01/03/11-12/16失败、应不变的RB02/05/06/10/13已通过；修正两处夹具（character需roleType、旧版请求不得带selectedTargets、语义v1不允许conflicts）后GREEN 7/7。RB08/RB15控制器用例在临时关闭改挂时均失败、恢复后通过，临时开关已移除。DIAG02“唯一其它单元”分类改用unknown-unit构造，59/59通过。
- typecheck通过；`build:desktop`须用Node 24（默认Node 20报`.ts`扩展名错误，与本改动无关），Node 24下通过。相关回归与独立代码复核结果另记。
- 独立代码复核`22`有条件接受，阻断1项：晚期分支对未改挂的结果也做证据去重并把全部证据单元并入`sourceUnitIds`，改写了配对正确的普通结果。已修为仅在确有条目unitId变化时去重并只追加改挂单元；新增RB18（无改挂结果原样返回，含重复证据与原sourceUnitIds）与RB19（声明单元ambiguous时不改挂）。RB16标题按实际覆盖修正。9/9与RB08/RB15 2/2通过。
- 首轮相关回归误在Node 20下启动（约20项失败集中在PDF/审计/生命周期等需Node 24能力的文件），且早于阻断修复，已终止作废，不作结论；改用Node 24重跑，结果另记。
- Node 24相关回归582项：566通过、16失败。对照：临时还原改挂后同5个文件仍有13项失败（LOTM-AUD01–08等11项均为“仍有章节缺少细纲”、lotm-local“volume-first”为`FROZEN_CHAPTER_ORACLE_MISMATCH`、LOTM-L-ID04），属改动前既有失败；`scripts/audit-lotm-local-import.ts`及其测试在本轮开始前（01:32–01:34）已被修改，未在本轮触碰，保留原状，整书审计前须单独处理。LOTM-L-C04单独重跑3/3通过，判为偶发。唯一由本次规则变化引起的是NI-J10“另一单元文本不修复错误声明单元”，按方案20改为“唯一时改挂、两处时仍no-match”，request-schema 51/51通过。

## r7真实恢复：首次越过角色首批，停在合并冲突 H18

- `ordered-analysis-r7`（含改挂规则的构建）以隔离运行时恢复同session。角色前两批成功提交（无证据定位失败、无二分），coverage.character=187/5589单元，产出23个角色；第2批后合并产生56条pending body-body冲突，rev1473进入`conflicts`后按驱动规则暂停退出。正文hash不变，无发布。
- 冲突按字段：temporalScope 14、occupation 11、personality 9、relationships 9、attribution 9、reliability 4。绝大多数是同一角色在不同批次的措辞或时间范围差异（如“第1—23章”对“本次导入片段”、性格词增减），由`mergeImportArtifacts`对任何非空不同值一律判冲突造成；少数为可靠性/来源归属的实际分歧。
- 按187单元产生56条推算，仅角色全书即达上千条，另有10类目标；每次决定还会重置复核覆盖并进入修订轮。按现行规则需作者逐条决定，整书不可行。冲突决定属作者权限，未代为作答，待用户选择处理方向。

## 跨批次字段自动合并 H19

- 用户选择“代码内自动合并”，可靠性分歧“取较弱一级并合并来源说明”。方案`23`经独审`24`有条件接受（B1原子性、B2单字段上限、B3关系身份、B4驱动衔接），均写入冻结补充；采纳整值比较建议。
- 实现：`mergeImportArtifacts`新增locks参数与`reconcileImportFact`；仅semantic v1、inferred对inferred、未锁定字段：角色描述字段及attribution/temporalScope整值并集（只按片段判断包含，保留原标点），relationships按身份严格归并，reliability取较弱级；候选任一字段冲突则本候选所有并集/降级均不应用；超1500字符/60项/8000字符回退冲突。仅`semanticPending`与`semanticAnalyzeUnits`两处传锁。
- RED：12项中新行为7项失败、应不变5项通过；修正两处夹具（scene须PLACE、characterId须指向存在角色）后12/12。控制器MG09、MG12/MG16 2/2；临时关闭合并时MG09失败、核心7项失败，开关已移除。
- 驱动新增`LOTM_RESET_ANALYSIS=1`：先把journal备份到本次证据目录（wx），再经正式`select`/`set-title`重置，断言confirm、零冲突/产物/覆盖并逐章核对。全量回归与独立代码复核另记。
- typecheck通过；Node 24 `build:desktop`通过，`dist/main/index.cjs`含`reconcileImportFact`、`dist/service/index.cjs`含`rebindEvidence`。
- Node 24相关回归596项：580通过、16失败。其中14项与H17基线同名（LOTM-AUD×11、volume-first、LOTM-L-ID04、LOTM-L-C04偶发），非本次引入。唯一新失败为`legitimate-merge-conflict-stops-unprocessed-siblings`：该用例以occupation不同构造“合法冲突”，按方案23该字段现自动合并；改用仍判冲突的age后evidence-batches 33/34，剩余1项为既有LOTM-L-ID04。
- 独立代码复核`25`有条件接受，阻断2项均已修复：（1）片段包含判断会丢失语义（如旧“对乙 忠诚；对丙 怀疑”吞掉新“对乙 怀疑”），改为NFKC+trim整值双向包含，新增MG17；（2）原MG12未设锁也未经遗漏补全路径，新增MG12a（遗漏补全，`main:652`）与MG12b（普通分析，`main:702`），两者分别仅在对应调用点去掉locks时失败。采纳非阻断建议：合并结果等于旧值时不受1500上限约束，避免已超长旧值使每次无增量合并都暂停。
- 受影响8个文件219项：218通过，唯一失败为既有LOTM-L-ID04。typecheck、Node 24 `build:desktop`通过。
- 复审（`25`末节）：接受，两项阻断已解决，无新增阻断。非阻断风险记录：整值包含会让“谨慎”被“不谨慎”吸收（冻结规则本身取舍）；relationships上限尚未对“合并结果等于旧值”豁免，8000字符分支无用例。
- r8：`LOTM_RESET_ANALYSIS=1`经正式`select`/`set-title`重置（rev1475→1477），清空56条旧冲突与23个产物，1402章逐章核对一致，重置前journal备份于`ordered-analysis-r8-evidence/pre-reset-session.json`；随后正式授权并开始11类分析，结果另记。
