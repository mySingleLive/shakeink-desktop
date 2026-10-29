# PDF图像页核对定向用例草稿

日期：2026-10-26。状态：待独立用例审核，全部未执行。依赖15技术方案、已批准HTML SHA `59997e6a2c7be3442c7332d95d408cf658807e341146374648c679d1d77e5e27`。本文件新增目标范围，不修改03/04原审核或RB-FMT01历史失败；本轮不实现测试、不运行任何测试。

实施窄接点增补：NI-PDF03/05/12覆盖 `report-pdf-preview-failure` 严格schema及已颁request的sourceKey lineage。合法response若因清旧失败令outer revision推进，renderer以原requestRevision或颁token版本报告decode失败仍应持久阻断；同源其他view版本推进不能吞掉此报告。未知/过期/外页request、新fileId/inspection/source身份不能污染新来源。无raw错误/path/PNG输入，旧saved决定不被暗改，取消/重开后继续阻断，直到成功重试。此为已审核“img.decode失败同样阻断”的具体实现窗口，主代理已确认，无新UI范围。

本次仅补17独立审核PDF-TR01–TR03所需窗口，继续使用原NI-PDF05/08/14编号，不新增全量测试范围，仍待独立复审。

## 夹具与判定边界

合成PDF只放测试fixtures/临时独立目录，明确为算法/协议用例：纯文本双页；0文字图像封面＋两文字页；双图像页并各有可提取文字；位图正文＋可提取页码；全部图像/全部无文本；单页图像无文本；文字页＋纯空白页；嵌入字体/未嵌入GBK CMap字库；密码、损坏、超大尺寸及解析中段失败。追加实际可读文字/可见正常图像与畸形图像资源共存页：图像W/H缺失、非数字、截断/损坏解码，明确触发锁定PDF.js的warn-return或warn-null分支。期望文本/页ledger在构造时固定，不能从被测提取输出反向生成。图像正文用明确可读的测试句，不能仅用1×1像素证明正文可读。

真实原件仅使用已固定L01网络原PDF及本任务相关独立基线；读取前后SHA须仍为 `fb1a231fc2cf94f38412566ad200d0a6d245ca92cdb6bae565e5329b462e9598`。不删封面、不转格式、不用提取TXT替换原件。长引用、PNG和真实journal/全文证据留用户测试目录，不进repo。改变源身份的负例使用合成临时副本，绝不触碰六部原件。

合成控制器用例可以使用可计数AI/发布替身来证明“调用为0/没有推进”，必须标明组件测试；真实RB-L01必须调用现有真实模型并开启12目标/复核，不以替身或pure-copy代替。数据库独立核对按03正常关闭/释放租约，不打开活动PGlite。

## 新增具体名称

下列名称为计划新增的唯一测试名；实施时保留前缀及断言。未实现前不能把表格记为pass。

| ID/具体名称 | 层级/拟文件 | 操作与必须断言 |
| --- | --- | --- |
| `NI-PDF01: full PDF inspection retains cover, every text page and mixed-page text without image approval` | files/`tests/unit/novel-import-files.test.ts` | 原0字封面＋中尾文字及混合页：所有物理页有唯一有序ledger、image待核对、未知/失败无自动exclude；后页实际执行，全文/末字符不漏。零字页不插字，混合页原文字不删；parts/pages与UTF-16边界一致；非PDF无新增字段 |
| `NI-PDF02: scan and partial PDF failures keep explicit blocked page ledgers instead of truncated success` | files | 单图像无文本、全扫描、每页位图正文但叠页码、全空文本均ocr-required；即使伪造所有exclude也不可ready。文字＋空白沿旧契约阻断；中页失败保留前后文字/失败页，文档无法打开pageCount未知，预算终止余页not-scanned；不得清成“空成功” |
| `NI-PDF03: page preview actions reject unsafe schemas, foreign files and stale revisions before IO` | protocol＋main IPC/`novel-import-protocol.test.ts`、`novel-import-integration.test.ts` | page 0/-1/小数/NaN/超5000/超实际页数、非PDF、未纳入/外会话fileId、过期revision、额外path/url/bytes/scale/workerMethod、重复changes/超100全部拒绝；不读取文件/开worker。untrusted frame、非owner、not-ready、BusinessGate已关及维护状态先拒绝，trusted主frame同通用桥正常 |
| `NI-PDF04: preview verifies authorized source identity before cache use and after rendering` | main/files | 真正readSource身份链：源inode替换、祖先目录替换/符号链接、hash/size/mtime/ctime任一变化、读取中/渲染中替换均拒绝，含缓存命中；旧确认/token/cache全部失效；不自动接受新hash，不泄露path。重选须合法grant，新fileId无继承；取消/多选不误替换 |
| `NI-PDF05: only bounded PNG previews issue page and source bound confirmation tokens` | main/新`novel-import-pdf.test.ts` | 实际PDF.js＋Canvas渲染输出PNG magic/尺寸/完整页面，不输出PDF bytes/路径/临时文件。预览失败、超大画布/PNG、字体/资源失败不发token；特别断言“PNG本已生成、magic/尺寸合法，但出现丢图/非法尺寸/解码/必要资源诊断”仍丢弃PNG、返回受控失败、不发token/不接受exclude；不能把warn＋return看成none/ready。随机/过期/外页/外源/外owner/revision/profile token保存失败。成功预览本身不修改已保存决定 |
| `NI-PDF06: explicit page decisions commit atomically, preserve page text and reblock after revocation` | session/`novel-import-session.test.ts` | 两图像页：先只保存第一页仍阻断，第二页明确exclude后门控通过；未操作页不变；一项非法整批不落盘。contains-content/uncertain仍阻断；撤销保存后sourceReady=false、grants/checkpoints失效；同值save/no-op及只读预览不清coverage。已开始publication禁止改决定 |
| `NI-PDF07: every sending and publication path rejects unresolved PDF images including copy-only imports` | domain＋session | 将所有文本强设body、selected不选body/infer=false、excluded单元、直接classify/start/resume/retry/resolve/apply-patches/恢复保存均不能绕过待核对PDF。首次classify只要求PDF已ready而不要求unknown已归类；每次classify/analyze/review/patch请求前及采用返回前复核，外部源变化后迟到结果丢弃，AI/发布调用为0或只保留变化前已经实际发送的记录 |
| `NI-PDF08: inspection and preview cancellation drain real jobs before controller serial waits` | lifecycle/main＋session | 初次choose扫描（选择器已返回、session尚未创建）、reselect检查、旧PDF补检查及预览，在FS/read与worker两类受控在途点分别触发关闭/迁移/owner撤销。实际controller.tail未完成时main先cancel共用registry，再在serial外等真实FS settle/worker exit；无需扫描自然完成，不创建/替换迟到来源。read promise未返回时renderer切页/Escape/卸载的cancel不经mutation队列，main不排serial/initialize。未退出/未settle仍计active；关闭期限届满明确失败保留草稿/原根，迟到无token/PNG adoption，真实收敛后才可重试；原AI NI-S07行为保留 |
| `NI-PDF09: old non-PDF hashes and restored checkpoints remain byte identical with absent PDF fields` | domain＋session | 冻结旧版S01形状的合成journal、scopeHash/classify/analyze/planHash/publicationRecord值；新代码读取/恢复后不补空数组，全部指纹逐字节相同，检查点和已完成facts包保留。新增有效PDF决定改变相关scope/plan，read/zoom/token时间不改变；新PDF可选字段嵌套校验拒绝缺页/重复/伪造proof；旧纯文本PDF补检查不改文字/指纹 |
| `NI-PDF10: publication atomically binds PDF page decisions and exposes a path-free durable audit` | actual PGlite/`tests/integration/novel-import-publish.test.ts` | 服务直接收到缺决定/过期ledger/错误proof或变更plan拒绝，零作品；正常最终快照含逐页文字hash/保留说明/确认撤销事件，无PNG/path；ContentMutation、快照和实体同事务。未知回执重试同request只一作品；改页决定/审计事件后同request冲突。实际readNovelImportRecord route可读受控页审计，旧记录仍可读 |
| `NI-PDF11: two-page review drafts survive navigation and cancel retains saved decisions` | real React/`tests/browser/novel-import.test.ts` | 从真实NovelImportDialog入口进入页核对；每页默认未确认，preview成功不勾选；第一、二页draft切换不丢，保存只提交明确changes。已有确认再取消勾选，取消/Escape明确保留旧确认；点击撤销保存才变待核对。新sourceKey/revision清旧draft，不自动以新revision重发 |
| `NI-PDF12: failed previews, OCR and changed sources cannot be confirmed by the review UI` | real React/browser | 加载/失败checkbox及保存exclude禁用；重试失败仍阻断，成功仍未勾选；img.decode失败同样阻断。旧已确认页重新预览失败也保留错误阻断，取消/重开不能清除，成功重试后才恢复原决定；纯缓存淘汰不误撤销。含正文/不确定提示OCR；全扫描无勾选通关；源变更显示确认失效/重选，旧成功PNG不复用。取消纳入来源后计数实时正确，重新纳入仍受真实门控 |
| `NI-PDF13: PDF review keeps fixed controls, readable zoom and focus at 390 by 600 in both themes` | real React/browser＋原生Electron | 390×600及桌面尺寸、宣纸/玄墨，max920/外边距≥16/高度≤视口减32；头尾固定，仅中间滚动。缩放/100%/fit、横纵滚动及方向键可查看小字，640断点无横向挤掉按钮。初始焦点、Tab/Shift-Tab循环、Escape取消、页关闭返回来源触发器、总弹窗关闭返回原工作台；背景不可交互，不改编辑器草稿 |
| `NI-PDF14: PDF worker budgets bound admission, canvas, cache and cleanup without accepting partial output` | worker/resource | 在准入后的首个源FS快照/后验读取处阻塞，连发超过1＋1请求并反复取消/重开；断言真正启动的read链≤1、排队仅标识/无PDF字节、客户端源快照≤50MiB＋64KiB、独立复制次数符合转移设计，未settle不释放slot或提升队列。迟到read/verify无token/PNG，真正settle/close后才释放账目。另保留文件/页数/字符/operators/画布/PNG/超时/LRU/token边界；追加缺失/非数值尺寸、丢图、解码及未知/溢出诊断断言：即使文本/合法PNG存在也page-error/raster unknown，不是none/ready、无token。原始库警告/路径/正文不进入应用日志，封闭字体fallback例外需满足资源与glyph条件；不把JS堆限额报成总RSS保证 |
| `NI-PDF15: packaged PDF rendering resolves only bundled CJK fonts, maps and native canvas offline` | packaging/新增专用PDF资源用例 | 在与repo/用户字体/Codex缓存隔离的安装包副本中，取消NODE_PATH，禁系统字体加载/网络，真实新worker入口可require锁定Canvas及目标架构.node；gz/解压TTF/OFL/provenance/CMaps/standard_fonts/wasm/worker哈希匹配。L01字体哨兵和受许可小PDF真实PNG可读；删/坏资源负例明确失败无token。开发态成功不能代替包内成功，mac/Windows分别记实际范围 |

NI-PDF08/14的必需受控窗口进一步固定如下；这些是同一编号内子场景，不是可选观察：

- 初次choose：真实控制器进入serial，来源选择器已交付合法grant，检查尚未完成且current session为空。阻塞worker退出，触发main beginClose/stopTasks/closeData；记录“registry取消→worker真实exit→原choose Abort展开→controller tail/pauseAll/close完成→BusinessGate drain/数据关闭”的先后。exit前不能active=0、不能创建新session；把已经resolve的worker promise传入此例不算覆盖。迁移与owner撤销各重复此窗口，reselect/旧PDF补检查各验证其独立operation归属及迟到不提交。
- renderer取消：让真实页面的read-pdf-page promise保持pending，再操作切页/Escape/卸载；在释放read前已经观察到桥的cancel请求及main registry取消信号。取消不含revision、不被busy/choosing/mutations阻塞；服务端不需要等controller.serial/initialize。只事后数到一次cancel不足以通过。
- FS资源：阻塞已准入读取或后验verify的真实promise，快速请求/取消超额任务；public timeout/Abort返回后仍有registry真实active/字节保留，新增请求busy或仅占唯一无字节排队项，不产生第二条FS链。关闭10秒生产期限或测试中等价受控期限届满时停止失败，窗口/已有草稿/数据根仍保留且未迁移；释放FS后才关闭handle/丢弃迟到字节/释放slot，无token或状态采用，随后重试关闭可完成。测试观测主进程实际read、分配/转移和release点，不用worker启动数代替FS预算。
- 无throw丢图：使用真实锁定库处理W/H缺失或非数字图像（有其他正常文字/可见图像，避免空白页兜底），证明确实发生对应固定诊断且可能没有该资源的paintImage；同样处理decode失败/null图像、必要资源失败。另用组件层可控诊断覆盖“PNG编码已经成功后、最终封口前出现异步警告”，必须仍不发token；晚到无法归属页的诊断阻断整个文件。对每页128/任务512上限、超长/未知诊断、stdout/stderr意外输出逐项断言封闭码与阻断，不记录原文/路径。字体家族fallback的唯一允许例单列正例；嵌入字体损坏、CMap失败不得套此豁免。

## 旧用例契约的精确调整

`tests/unit/novel-import-files.test.ts` 当前NI-F04名称为 `NI-F04: actual PDF text page extraction preserves page order and rejects any image-only/missing-text page`；该实现对“任何栅格出现即抛错”作断言。这一断言在用户批准的新门控下必须调整，不能为保留绿测继续无条件拒绝封面，也不能直接删去图像风险检查。

拟改名 `NI-F04: actual PDF extraction preserves text order and reports image or missing-text pages as blocked review ledgers`。保留中英文纯文本两页逐页顺序/换行/末页、密码/损坏失败；旧位图＋页码样本改断言完整image ledger且默认阻断，全扫描仍OCR；文字＋空白页保持阻断。是否可发送/发布移到NI-PDF06/07/10真正门控验证。原11-runtime审核/既有证据是旧版本事实，保留不改写。

直接相关已有回归只选择这些具体前缀：NI-F04、NI-F07（授权身份）、NI-D01/02（文字与覆盖）、NI-S02/07/08/10/11（全文、在途暂停、恢复、已修复检查点和合包）、NI-L02/04（真实IPC/关闭及发布边界）、NI-W04/06（同请求指纹及未解决计划）。同ID现有多个test时全部是其列出的直接断言；不扩大为整个文件或全部NI。

拟执行命令由实施代理在新增实际文件后固定：Node24 `--import tsx --test --test-name-pattern` 精确锚定上述名称/ID，仅传实际相关文件。现有browser文件也是node:test＋playwright-core，继续该启动方式，只选择 `^NI-PDF(?:11|12|13):`；沿现有esbuild真实React夹具、内存setContent/Script/Style及拦截资源方式，不新开HTTP或使用file:预览。包资源只选 `^NI-PDF15:`。不能运行 `npm test`、`test:package`、全仓、完整浏览器或通配整个目录。未新增的测试名不能用空匹配/skip报告通过。打包构建与静态包清单核对仅用于本功能资源，不触发全打包回归套件。

## 真实原PDF重测

| ID | 必须取得的真实证据 |
| --- | --- |
| `RB-PDF01`（RB-L01新增前置） | 正常应用＋原生授权选择原L01 PDF；178项物理页台账，图像封面未确认且177文字页实际提取；与事前pypdf独立逐页文字核对，仅允许提取表示必需空白差异。实际界面预览封面；89/178通过正式受限单页入口另做渲染组件可读性核验，明确这两项不是页导航UI验证。确认前无模型发送；手动确认真实封面后已有页文字未删，保存页决定/源hash/proof/resource profile。不能用占位图/独立渲染脚本冒充产品预览 |
| `RB-L01`继续原03完整流程 | 冻结20回完整oracle及UI确认正文hash；真实AI识别、全部12补全/复核、必要冲突处理、发布、打开与正常退出重开；Chapter拼接严格等于冻结正文，20回及requiredFacts/禁止推论独立语义审核，最终PDF决定审计与原源一致。不得只导前几页/只复制正文后宣布成功 |
| `RB-PDF02`（合成负例的真实界面） | 实际混合图像含测试正文/设定、双页draft、撤销、预览重试失败、临时副本源替换及单图像/全扫描。以原组件和主进程真实状态证明不能继续/无发送；不动真实原件。该项是负例验收，不计为新真实网络小说 |

每个run固定Git修订、实际构建/worker/资源hash、源身份/源SHA、oracle SHA、授权动作、页决定与审计hash、真实调用及用量、发布回执、数据库和重开证据。合成绿测只说明其断言，不说明原PDF质量/完整全流程。资源不可读、超限、平台未具备、模型错误、语义不合格分别保留failed/blocked/not-run，不用“预期拒绝”冒充RB-L01成功。Windows真实验收未执行时明确保留该范围。
