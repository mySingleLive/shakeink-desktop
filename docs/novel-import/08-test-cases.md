# 导入作品定向测试用例

日期：2026-10-25。依据 [已通过方案](06-technical-plan.md)、[独立复审](07-technical-review.md) 与已批准 v4 UI。状态：定向用例独立审核通过，见 [09-test-review.md](09-test-review.md)；已按先红后绿实施；最终结果见12-verification.md。本文限定本任务测试范围，禁止运行全仓测试。

## 环境、证据与运行清单

Node24、现有tsx/node:test、Playwright/Electron、真实PGlite/Prisma。所有数据为合成小说与临时目录，不用真实作品或Key。受控AI响应只验证协议/状态/领域结果，不充作真实供应商通过。测试名称含下列ID，按TAP/独立JSON保存实际运行结果；不把一个冒烟算成所有场景。

只允许运行下列新增文件及本文列出的构建/目标验证：

```sh
node --import tsx --test --test-concurrency=1 tests/unit/novel-import-protocol.test.ts tests/unit/novel-import-files.test.ts tests/unit/novel-import-domain.test.ts tests/unit/novel-import-session.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-integration.test.ts tests/integration/novel-import-publish.test.ts
node --import tsx --test tests/browser/novel-import.test.ts
```

实际命令用Node24绝对路径或为该命令设置正确PATH；不能用本机默认Node20冒充项目引擎。`npm test`、`tests/unit/*.test.ts`、完整浏览器/打包测试脚本、全仓回归均禁止。失败后只重跑受影响文件/ID，全部通过后不无目的重复。

NI-B01允许为本次新增IPC/handler/依赖/React构建运行 `generate:commands`、项目typecheck或相应入口编译、`build:ui`、`build:desktop` 及离线依赖资源检查；这些是构建验证，不运行任何自动测试套件。缺少真实目标/端点要写“未执行”，不得用平台外观或mock补齐。

## 协议及路径授权（novel-import-protocol.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-P01 | 13类来源、12目标、正文误入目标、重复目标、未知动作/字段、超长正文/offset、无revision | 合法契约往返；非法输入主进程前拒绝，不产生文件或模型请求 |
| NI-P02 | renderer传路径/worker方法名/伪造session ID，过期revision/owner/root与跨作品record读取 | 路径只来自原生授权，未知方法不透传，过期操作无副作用，记录检查归属 |

## 文件解析与清单（novel-import-files.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-F01 | TXT/MD UTF-8、UTF-16 BOM、GB18030、CRLF/连续空白/emoji；错编码切换 | 提取文本逐字符可核对，不trim/换行归一/繁简转换；失败编码需人工确认 |
| NI-F02 | 真OLE DOC合成/许可夹具，正文+脚注/页眉/文本框；伪扩展/损坏 | 正常提取且附属文字单独可核对；不依赖Office，不执行宏；损坏逐项错误 |
| NI-F03 | 真DOCX ZIP/XML，段落/表格/制表/换行/文本框、脚注尾注批注页眉页脚 | 提取各部件并保留位置，全部文字可归类/排除；不跟外链、不遗漏附属文字 |
| NI-F04 | 文本PDF多页、中文/换行；含扫描页/密码/损坏PDF | 正常页可核对页序；任一不可提取页明确错误/待处理，不静默漏页、无OCR假成功 |
| NI-F05 | HTML/HTM实体/标题/段落/表格、script/style/图片外链/嵌入指令 | 惰性文字提取，脚本/外链零执行/零请求，源文件中的指令不是工具授权 |
| NI-F06 | 递归目录、数字章名、多层目录、重复字节、同名不同文件、非支持/隐藏项/符号链接 | 所有支持文件自然排序，重复/排除原因可见，不跨越授权树，不覆盖同名文件 |
| NI-F07 | 读前/后替换文件或目录、链接换入、越界路径、应用/作品内部文件 | 身份/边界检查失败，不读新目标、不修改来源，不沿符号链接逃逸 |
| NI-F08 | 文件/总量/个数/提取长度/ZIP条目和解压大小超限、部分解析失败 | 逐项失败保留清单，须明确排除再继续；不截断正文、不删除用户文件 |

## 领域保真/分类/规划（novel-import-domain.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-D01 | 混合正文/设定，多段空白、无章、跨文件边界、emoji安全分片 | 单元完整不重叠；章切片拼接严格等于已选正文；标题留正文，不自行润色 |
| NI-D02 | 本地明确标题分类/手动范围/未归类/低把握、AI漏ID/重复ID/外来ID | 有来源才可选、默认勾选；任何未归类/漏项阻止继续，范围外文字不丢失 |
| NI-D03 | 取消源角色但保留角色补全、关闭某目标、取消正文、source与target跨页返回 | 两组选项独立，关闭项目明确跳过；无正文不推断，不丢用户选择 |
| NI-D04 | source已有大纲/角色/世界/文风/金手指/爽点泪点；source不含某类 | 原文先拷贝，缺项才补；13类与真实领域映射一致，无证据保持not-found |
| NI-D05 | 跨批同名/别名、明确年龄等字段冲突、角色传闻/倒叙/未知时间 | 有证据才合并，互斥事实生成冲突，不静默以模型覆盖，未知/不可靠信息不当客观事实 |
| NI-D06 | 非本书unit ID、quote不在单元、非法实体/时间/事件引用/未覆盖批次 | 拒绝模型结果，保持checkpoint失败而非完成，不产生无来源事实 |
| NI-D07 | 来源A/B冲突无正文、正文内冲突、源设定与正文冲突 | 只出现适用决策；无正文无推断/改正文；未解矛盾阻止发布 |
| NI-D08 | 正文patch预览/逐处选择、旧before/workingRevision、代理对切点、重复应用 | 原文快照不可变，匹配版本才改工作副本；未勾选不改，旧offset/授权/下游结果失效 |

## 会话与工作流（novel-import-session.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-S01 | 分类前未授权、来源/范围/模型发生改变；授权后识别 | 发送前门控，绑定范围/hash/ID/端点/authRevision；等待真实回执，不用计时器假完成 |
| NI-S02 | 全文多批识别/推断，早批成功晚批失败后重试，最后一章关键人物 | 全部范围记录覆盖，未处理不能完成；只重试失败批次，不遗漏末章人物 |
| NI-S03 | 有正文且补全启用/逐类禁用 | 正文→大纲→角色→场景物品→世界→其余设定→世界线→叙事线→复核；实际跳过不算完成 |
| NI-S04 | 无正文、取消正文、全部关闭补全（pure-copy） | 仅拷贝已选资料；包括最终复核在内模型调用数为0，不声称全书语义审核完成 |
| NI-S05 | 三种冲突决策、坚持但无解释、解释仍不自洽、暂不决定 | 有效决策绑定版本，未解不推进；源/工作文本变动使旧决定过期并重检关联结果 |
| NI-S06 | 修改正文提案/确认patch，随后继续分析 | 先diff、逐处选、二次确认；保留原快照，旧analysis授权作废，再确认范围后才发新请求 |
| NI-S07 | 识别/推断中暂停、取消、收起、完成回执迟到；旧epoch写入 | 请求真实abort/排空才暂停，旧回执不推进；后台完成不弹窗；原入口恢复当前会话 |
| NI-S08 | 保存checkpoint后退出重开；来源变动/丢失/目标换身份 | 同会话可恢复，重新授权来源/目标，变动要求重核；不靠同名文件或陈旧路径续写 |
| NI-S09 | 丢弃有未知文件/链接的草稿目录；完成后关闭/再导入 | 仅清本次自有文件，未知内容保留，不删来源/其他作品；完成不生成未完成任务 |

## 模型适配（novel-import-ai.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-A01 | 小/大/未知模型contextWindow、较长CJK单段/全书 | 预算内分批，所有字符有覆盖；超预算明示失败，不用前N字摘要代替全文 |
| NI-A02 | 文本/审核模型分别配置、review缺失、调用中授权撤销/端点变化 | 严格role与固定snapshot，无平台后备、不代用文本模型；撤销阻断请求及结果采用 |
| NI-A03 | 不完整/错误JSON、未知类别、输出夹带指令、quote伪造 | 结构/证据校验失败保留重试，不写库、不执行输出指令、不泄露正文到日志 |
| NI-A04 | 单次operationId取消、另一任务并行；RPC序列化 | 跨线程只传operationId等数据，worker本地controller.abort；不传signal对象、不误停其他任务 |

## 发布与实际数据库（novel-import-publish.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-W01 | 正文/设定/两条线导入到独立空目标，真实PGlite/Prisma | 原生表可查询，正文逐字、规划引用正确；原 Outline/Character/Scene 等查询能读取 |
| NI-W02 | 已有大纲原文＋投影重建，长原设定、人工改正文；实际登记的LocalDispatcher读取命令 | 原大纲/原设定/最初正文在NOVEL_IMPORT记录可完整读取，投影不覆盖原文 |
| NI-W03 | 初始化前/领域事务中/事务后manifest前/ready后catalog前/回执丢失故障 | 未登记半成品，已提交步骤按同requestId/hash恢复，不重复建书/实体/审计记录 |
| NI-W04 | 同request/title但换import payload，creating和catalog previous两分支 | reservation/manifest/catalog/ContentMutation都绑定importHash；拒绝不同hash，不覆盖旧作品 |
| NI-W05 | 未登记creating/ready-before-catalog锁恢复，缺reservation/错目录/换inode/活PID/外机锁 | 只有原session/request/hash、已有reservation、同目录原生再授权且本机死锁才可恢复；无旁路抢锁 |
| NI-W06 | 目标是源/父子/已有作品/应用内部目录；目标身份在关键await间变化；并行发布 | 拒绝越界/覆盖，保留来源与其他目录；catalog串行且事务全有或全无，不写错作品 |

## 主进程/关闭/入口（novel-import-integration.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-L01 | 侧栏按钮/原生file.import/file.import-folder、picker取消及重复触发 | macOS统一原生picker可选多文件或目录，Windows保留显式目录兼容；无选择不建书；未完成任务优先恢复；不占Cmd/Ctrl+O（2026-10-26修订见15定向用例） |
| NI-L02 | renderer非主frame、业务gate关闭/迁移、非法action、未就绪owner/session | IPC拒绝且不发模型/不读文件；长后台job也纳入生命周期门控 |
| NI-L03 | worker识别/推断active时task-status→stop-tasks→close，单任务cancel | active计入job，abort等待done后关DB；只停对应operation，退出无旧回执写入 |
| NI-L04 | main识别/推断/存checkpoint/发布中关闭或迁移，worker断连；实际根清单和DataRootManager搬迁导入journal | 先停止/保存再关闭gate；无死锁，不把半个发布当取消；回执确定后允许关闭/重启恢复 |

## 真实React交互（novel-import.test.ts）

| ID | 输入/操作 | 预期 |
| --- | --- | --- |
| NI-U01 | 来源清单：真实类型图标、多选/排除/排序、分页全文、编码/范围/卷章核对 | 调用真实React动作和严格bridge，异常/未归类阻止继续，无HTTP模型伪请求 |
| NI-U02 | 13个普通来源checkbox、12张始终展开的补全卡片、总开关、无正文、双主题窄短窗 | 符合v4批准；无展开按钮，master关闭只disabled；整卡一次切换，来源预览不误改选择 |
| NI-U03 | 识别授权→真实pending bridge→结果/失败/重试、无模型/本地分类 | 不提前分类，等待动画依据pending状态，模型设置返回保留草稿，无虚构费用/百分比 |
| NI-U04 | 名称必填、隔离目标、两次发送确认、未配置review模型 | 正确门控与实际配置名/范围，返回选择保留，不发送未经确认资料 |
| NI-U05 | 运行→暂停/恢复/收起/原入口恢复→取消保留/丢弃 | 用户可继续当前会话，关闭不假成功；后台完成不抢焦点，完成页关闭不留下待办 |
| NI-U06 | 混合冲突三选、无正文A/B/手工合并、正文diff逐处勾选/二次确认 | 无默认决定、有效选项适配、未解阻止完成；已发生修改显式记录并再确认分析范围 |
| NI-U07 | 完成摘要/打开作品/原大纲与概览记录链接；Tab/Space/Escape/焦点/减少动态效果 | 打开原业务面板，完整原文分页可读；模态焦点不外溢，文本无真实用户数据 |

## 构建、安装运行与真实外部条件

| ID | 操作 | 预期/证据类别 |
| --- | --- | --- |
| NI-B01 | 本次入口typecheck、命令目录生成、生产UI/main/service/preload构建；检查运行时依赖/PDF资源与图标许可；ZIP同名builtin包解析、真实生产弹窗CSS定位 | BUILD；新handler/命令可打包，无design原型或mock成功状态、无跨仓引用/HTTP监听 |
| NI-N01 | 真实macOS Electron隔离目录：从实际导入入口选择合成文件/目录，正文/设定落盘、关闭重开、离线启动 | NATIVE；真实文件系统和原组件；如果picker被测试替身接管，单独记受控流程，不能称原生对话框通过 |
| NI-N02 | 真实Windows重复核心原生选择/读写/取消恢复、独立目录与原组件流程 | NATIVE；无目标机器则未执行，不以win32 UA/主题切换算通过 |
| NI-N03 | 用户明确配置且可用的文本/审核模型端点，用合成小说贯穿识别/补全/冲突/两条线 | PROVIDER；无端点/Key/权限就未执行，受控AI结果只证明自动化用例，不算此条通过 |

## TDD、审查和收尾

每组先写对应失败用例并留红灯命令/ID，再实现并定向转绿；新增故障必须在本表中对应目标，不加无关全仓测试。代码交独立子代理审核，修复后只重跑受影响组。最终台账逐项写已执行/通过/失败/未执行与命令证据，更新 requirements-traceability 的本任务记录；未实现或未验证的条目不能写为完成。
