# PDF 图像页核对 · 技术方案与定向用例独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

本轮只读审核15技术方案、16用例、已批准10/11设计记录及所列现有接点。没有实现、运行测试、操作应用/CUA/模型、读取真实PDF/journal/Key/数据库，未使用file:或HTTP绕过预览限制。字体大小、hash、授权与cmap覆盖沿作者已核对的静态事实，不将其视为安装包实际渲染通过。

## 当前分开结论

**针对性复审已完成：15技术方案独立审核通过；16定向用例独立审核通过。PDF-TR01、PDF-TR02、PDF-TR03 均已关闭，可按既定顺序交实施代理进入本范围TDD。** 本结论只确认修订后的设计和测试要求，不代表实现、安装包渲染或真实L01已经通过。未运行测试或触碰真实状态。

## 初审分开结论（后续已关闭）

- **15技术方案：暂不通过。** 主体结构成立，但需先闭环 PDF-TR01–TR03，尤其初次全PDF检查尚无session时的取消/关闭和读快照前准入；否则不能兑现当前生命周期与容量约束。
- **16定向用例：暂不通过。** 现有15项及指定旧回归覆盖方向完整，范围仍属于本次任务；须将下列窗口具体加入现有NI-PDF08/14，不增加全量测试。技术方案修订后针对性复审通过，再开始TDD。

不将上述结论当作 UI 未获批准；用户对具体稿的批准已成立。这里阻止的是尚未具体化的实现接点进入生产编码。

## PDF-TR01 · P1 · 共用 PDF 任务注册必须覆盖初次检查，取消必须在串行等待之前

**现有代码依据：** `NovelImportController.act` 将choose置于 `serial` 内；私有choose在新session创建之前等待 `scanNovelSources`。`pauseAll` 首先 `await this.tail`，`close`又等待pauseAll。main当前beginClose先取消来源选择器，随后stopTasks/closeData才等待controller和BusinessGate。来源选择器一旦已返回，无法取消正在扫描的PDF。

15方案把正式扫描也改为worker执行，但目前只具体说明previewJobs和read-pdf-page的serial外等待。初次choose解析中没有现成session/id可注册preview；若先await controller.tail再取消PDF工作，主进程要等最长120秒检查完成，现有10秒停止期限会先失败。这不是单页预览正确地移出serial即可解决的路径。reselect-source和旧PDF补检查也有同类接点。

**必修：** 明确主进程共用PDF任务客户端/注册表同时管理inspection与preview，初次选择使用owner＋独立选择operation ID，不依赖尚未创建的session。beginClose/stopTasks/closeData、owner失效/换根/迁移等入口必须在等待controller.tail/pauseAll/close/gate之前发起取消；真实worker退出等待在serial之外完成。区分生命周期取消与解析预算到期：不能将取消后的片段当正常完整扫描继续创建可发送任务。新准入关闭、旧回执epoch失效、未退出工作仍计active的责任需明确。

`cancel-pdf-preview`也必须在renderer与main的变更队列之外发出/执行，且不依赖revision；不能把它放入正等待read-pdf-page的现有mutation队列。切页、Esc、卸载或关闭应能实际发出取消，而非等15秒渲染返回后才排到取消动作。

**用例修订：** NI-PDF08至少增加初次choose全PDF检查中、reselect检查中及旧PDF补检查中的关闭/迁移/owner撤销；使用真实controller串行等待和受控worker退出点，证明先cancel后drain，无需检查先完成。另在renderer read promise尚未返回时操作切页/Esc，证明cancel已独立送达。不能用已完成promise或只断言调用过cancel代替。

## PDF-TR02 · P1 · 1＋1 准入必须早于读入 PDF 快照，覆盖整条管线

15已有明确输入、worker、画布、PNG、缓存上限，但worker队列有界不自动限制worker之前的主进程快照读取。预览每次、含缓存命中都要重新读取至多50MiB并计算hash；如果先读取/复制，再向worker申请1个运行＋1个排队名额，多个合法请求仍可能堆积整PDF字节及不可取消的FS等待。终止worker不会取消主进程已经发出的fs操作。

**必修：** 确认全流程准入在第一次快照读取/独立ArrayBuffer复制之前发生，覆盖源验证→读取→解析/渲染→后验验证→响应；排队项仅持有受限标识/不可变上下文，不预读字节。明确主进程FS任务也使用跨请求、取消及超时后仍计真实未settle工作的有界预算；同页合并不能跨owner/source proof/profile分享结果。截止时间应涵盖这些阶段，不能只计worker render时间。

若底层FS不能真正取消，要保留其账目及资源收敛责任，不因public超时/epoch改变提前释放真实预算；关闭不能将未settle工作伪报排空，超过现有停止期限保留窗口/草稿并明确失败即可。无需为此引入新通用文件服务或放宽路径能力。

**用例修订：** NI-PDF14在“已准入快照读取尚未完成”处阻塞，连发超过1＋1请求并反复取消/重开，断言实际read/复制启动数、保留字节数和工作预算均未越界，排队项没有PDF字节；迟到读取/验证无token/PNG adoption，真实settle或清理后才释放对应账目。NI-PDF08包含这一阶段的关闭失败/后续收敛边界。

## PDF-TR03 · P1 · 避免 PDF.js 静默丢图被认作无图像或完整预览

**锁定依赖源码依据：** 当前 `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` 的图像处理在尺寸缺失或不是数字时，直接 `warn("Image dimensions are missing, or not numbers.")` 后return（约40551–40553），该分支不受ignoreErrors=false保护。尺寸超限分支在stopAtErrors的对应路径可throw，但不能据此推断所有漏图都会throw。当前解析参数的verbosity=0还会隐藏此类诊断。

因此仅设置stopAtErrors和统计最终paintImage operators，并不能证明未出现“图像被库跳过、最终operator列表没有图像”的情况。这样的页若还有可提取文字，可能被误记raster=none或在预览中漏图，从而失去本轮默认待核对/失败阻断的意义。

**必修：** 明确worker内对已锁定版本的丢图、图像解码和必要资源失败建立有界诊断收集/等价检查，将无法证明完整的页标page-error或raster=unknown，不颁token、不以优化后缺少paintImage当无图像。不能把原始PDF.js警告/路径/正文写进应用日志；输出仅封闭码。允许封闭字体fallback须有明确的非丢内容处理规则，不能为兼容而笼统忽略全部警告。无需更换PDF库，但要处理这条已存在的无throw路径。

**用例修订：** NI-PDF14增加有实际可见图像/文字的畸形图像资源或可控对应库诊断：缺失/非法尺寸、被丢弃图像及解码失败不能生成可确认token，ledger不能标无图像ready。NI-PDF05也应核对“PNG能够生成但存在该失败诊断”仍是失败，不能仅凭PNG magic/尺寸成功判断完整预览。

## 已成立且不需扩大范围的部分

- 全物理页ledger、部分失败继续/预算终止not-scanned、图像只排除图像而不删除已提取文字；全扫描/页码规则保守且明确，不用字数阈值猜正文。旧纯空白页仍阻断，不引入OCR捷径。
- 严格动作、当前fileId/source/owner/revision、原源hash/proof/祖先前后检查、缓存命中仍验证；确认token绑定完整来源/资源profile且不进入journal/AI，预览成功不自动勾选。
- PDF门控分离首次分类可用状态与归类完成sourceReady；所有发送前/结果采用前和服务发布再次验证，pure-copy/全set-range/恢复保存不能绕过。失败预览保留独立阻断状态，不靠取消弹窗或LRU淘汰清除。
- 条件展开PDF指纹字段、不补空数组，旧MD/纯文字PDF及已经修复analysisCheckpoint兼容；决定真实变化才invalidate，同值保存/只读查看不清成功成果。最终PDF审计与原回执/事务同存，投影不回传路径或图片。
- 字体采用已有gz、hash及OFL资源，Canvas成为精确生产依赖，worker/build/runtimeEntries/正向包清单同步；不使用系统字体、父目录或Codex缓存fallback。已明确JS堆不是原生总RSS硬限额，实际包内Canvas/CJK渲染和目标架构仍须验证。
- 真实L01必须用原PDF、178项ledger和177页文字完整检查，正式流程仍含12目标/复核、语义oracle、发布和重开；合成绿测、字体静态覆盖或渲染组件不能替代该验收。Windows未执行单列，禁止全suite/全仓/完整打包测试的范围控制明确。

## 最小收敛与下一步

保持已批准交互和现有PDF.js/Canvas，只落实一个覆盖inspection/preview的有界任务客户端、固定诊断映射和同一门控函数即可；不新增OCR/视觉模型、通用路径读写接口或重写AI工作流。针对以上三项修订15，并将必要窗口补入16现有编号后，提交针对性独立复审。两个分开结论均通过前不得让实现开始。

## PDF-TR01–TR03 针对性独立复审

同日只复读15/16修订及相应已知源码接点，没有重复扩大审核、实现或运行测试。两个文档现已将初审缺口改为具体可验的契约：

| 审核项 | 关闭依据 |
| --- | --- |
| **PDF-TR01 已关闭** | 共用registry在controller.initialize之前建立，覆盖inspect/preview/PDF verify；初次choose使用owner＋selectionOperationId＋数据根generation，不依赖尚无session。beginClose及controller.pauseAll/close的首个tail等待之前取消准入/任务，在serial外等真实资源退出，再排空controller/gate。生命周期Abort不提交初检片段、不替换来源；renderer/main取消均走队列外，不要求revision或先current/initialize。NI-PDF08现具体包含初次choose、reselect、旧PDF补检查、renderer pending read及FS/worker两类在途点，禁止以已完成promise代替 |
| **PDF-TR02 已关闭** | 1个运行slot＋1个无字节排队标识在首次源FS/读取/分配之前生效，并覆盖后验及真实清理。独立源buffer转移所有权，客户端源快照50MiB＋64KiB、后验流式hash、禁止排队预读和chunks＋concat双份常驻；不将PDF.js内部对象或JS堆限额冒充总RSS约束。public timeout与真实settled分开，未结束FS保持slot/账目且不提升新任务；关闭超时保留窗口/草稿/原根。NI-PDF14现明确观测实际read/分配/转移/释放，不能用worker启动数替代FS预算 |
| **PDF-TR03 已关闭** | 专用worker先安装封闭console诊断收集器，WARNINGS使锁定库的warn-return/null图像分支可见；每页128/任务512及512字符识别上限，未知/溢出/意外输出阻断。丢图、解码、必要资源失败均为page-error/raster unknown、无token；仅封闭且具资源/glyph证明的未嵌入家族fallback可例外。逐页候选到render/依赖/销毁及诊断收尾后才封口，晚到无法定位的警告阻断全文件。NI-PDF05/14现覆盖合法PNG已产生仍须丢弃、真实畸形尺寸/解码分支及晚到诊断，不再把PNG magic或operators缺图当完整证明 |

定点复核了当前PDF.js display/worker的warn入口均经console.warn及现有main停止/数据关闭回调仍先等待controller的事实；修订明确承接这些现有接点，未以当前代码已经具备新行为为前提。原始警告不转发应用日志/renderer，worker stdout/stderr显式受控，也未新增通用路径或worker方法能力。

### 技术方案最终结论

**15技术方案通过独立复审。** 无剩余必须修订项，可按已批准交互实现；实际资源限制、字体fallback、PNG/逐页台账和取消/排空仍须由实施代码及测试证明。旧MD/PDF指纹和已通过NI-S10/S11检查点/合包修复必须保留。

### 定向用例最终结论

**16用例通过独立复审。** NI-PDF01–15及明确列举的直接旧回归构成实施允许范围；本次新增窗口已纳入原NI-PDF05/08/14，未扩大为全suite、全仓或完整打包回归。只能按实际新增的具体名称执行，空匹配/skip不能报告通过。真实L01原PDF、178页/177页文字、正式12目标和发布重开仍另行实际验证；Windows未具备时单列未执行。

后续顺序为先红→最小实现→同名定向绿→独立代码审核→必要真实Electron/包资源验证→原L01正式重测。用户UI批准与本次方案/用例通过均不改写RB-FMT01历史失败，也不把静态字体hash/cmap覆盖当渲染或真实小说验收结果。
