# PDF图像页逐页核对技术方案

日期：2026-10-26。状态：待独立技术审核；未实现、未执行测试。用户已明确批准 `design/novel-import/pdf-pages.html` 并要求继续技术方案与实现。批准稿 SHA-256：`59997e6a2c7be3442c7332d95d408cf658807e341146374648c679d1d77e5e27`。10/11保留当时的阶段记录，本方案记录其后的用户批准，不回写历史结果。实施仍须技术审核、16定向用例审核、TDD、独立代码审核及真实验证。

本次仅文档修订对应17独立审核的PDF-TR01–TR03：共用任务注册/取消时序、读取前全链预算、PDF.js无throw丢图诊断。仍待独立复审，不自行宣告关闭审核项。

## 目标与当前依据

原PDF完整保留。先提取所有能够提取的文字，逐页记录文字、栅格图像及解析状态。图像默认未核对；主进程提供当前授权原文件的单页PNG，用户逐页明确确认“图像不含需要导入的正文或设定”后才允许发送/发布。排除对象仅为该页图像，已有提取文字不能随之删除。图像含正文/设定、不确定、预览失败、来源变化、未完成解析或没有可用文本正文继续阻断。

已读取 AGENTS、implementation-boundaries、03、10/11、12，以及本方案列出的当前源文件。当前事实：

| 源文件/现状 | 需要的增量 |
| --- | --- |
| `desktop/main/novel-import-files.ts` 的 `pdfText` | 现在先检查栅格operators并在首图像页抛错，后续文字页不执行；每个空文字页也立即失败。改为有界的全页检查与结构化台账，禁止遇封面直接终止，也禁止静默跳过 |
| 同文件 `scanNovelSources` | 当前catch会清空text；PDF可核对状态应保留提取文字与页台账，不能混成通用读取错误后丢失上下文 |
| `desktop/shared/novel-import.ts` | 已有严格action联合、私有ImportFile/proof/pages与无路径的FileView。增加可选PDF检查/决定类型和受限单页响应，继续使用现有 `novelImport` 桥 |
| `desktop/core/novel-import.ts` | `validateImportCoverage`/`importSourceReady`现在只核对文本；需要独立PDF门控并合入发送/发布前校验，不能让全量set-range或纯拷贝绕过 |
| `desktop/main/novel-import.ts` | 真实journal、serial/epoch、在途AI/drain、成功analysisCheckpoint、全文与facts复核合包已存在。增量接入，保留NI-S10/11实现及确定性任务键，不重写工作流 |
| `desktop/service/novel-import-publish.ts` | `assertPlan`、importPlanHash、同请求事务回执及NOVEL_IMPORT快照已经存在。增加PDF审计与服务端门控，维持同请求重试一致性 |
| `src/components/desktop/NovelImportDialog.tsx`、`src/lib/desktop/novel-import.ts` | 使用真实Web Dialog及现有串行mutation/adopt；新增页核对状态、局部draft与有界位图生命周期。不得把HTML模拟状态或审核工具条带入产品 |
| `src/components/desktop/NovelImportRecord.tsx` | 目前只展示材料/冲突决定；增加独立PDF图像页决定区，不能混入冲突计数或宣称图像已OCR |

不新增视觉模型、OCR服务、HTTP监听或远端字体；不改变原文件、正文字符、既有12类目标或AI批次预算。RB-FMT01的原L01失败及后177页未执行保持历史事实；本方案不把它改记通过。

## 私有模型与格式返回

以下为拟定类型契约，最终字段名可在独立审核中收敛，但不能削弱信息或门控。所有文本offset沿用现有JavaScript UTF-16半开区间，不能混用独立oracle的Unicode codepoint位置。

`ImportFile.pdfInspection?` 仅PDF可有，schemaVersion为1，包括：

- `sourceHash`、完整 `ImportProof`（device/inode/size/mtime/ctime）、`inspectionId`、`extractorVersion`、`resourceProfileHash`、`ledgerHash`。绑定本次已校验的源与提取资源，路径和ancestors仍只在私有ImportFile。
- `pageCount:number|null`、`scanState:'complete'|'incomplete'|'document-error'`、`blocker?:'ocr-required'|'page-error'|'budget'|'source-changed'|'document-error'`。未知页数不能编造为0页成功。
- `pages[]`：`page`（1起）、`start/end`、`textCharacters`、`textState:'extracted'|'empty'|'failed'|'not-scanned'`、`raster:'present'|'none'|'unknown'`、有界错误码（不放库原始异常/路径/文本）。每个已知物理页都有一项，最后一页也必须入账；纯空页保留显式 `empty`，不能当未执行。
- `textOnlyPageCount`、`imagePageCount`、`totalTextCharacters`从台账计算，不接受renderer上送统计。未知栅格/未扫描/失败页均阻断，不能作为“无图像”确认。

现有 `ImportFile.pages` 继续返回按物理页排序的文字区间，零字页为合法零长区间；不能由其零长度推断“图像已排除”。`parts`仍覆盖完整提取文字。纯文本PDF的文字拼接、每页item.str/hasEOL/空格处理和页间 `\n\n` 保持现有结果；混合PDF只在非空页之间加入原规则的分隔，零字封面不凭空插字。所有实际可提取的页文字及混合页文字均保留。台账文字区间与最终text/parts交叉验证，空范围、分隔位置和最后end有定向断言。

拟将内部格式返回明确为“可用文字＋可选PDF检查”，阻断信息与文字并存。对PDF，`extractNovelText`的空文本末尾通用throw改为返回带 `ocr-required` 的结构化结果；该例外只用于明确带阻断台账的PDF，不放宽TXT/MD/DOC/DOCX。密码/损坏导致无法打开文档时返回 `document-error`、未知pageCount与空pages；已知页数后单页失败，保留该页失败项并继续检查后页；全局字数/时间/页数预算终止则 `incomplete`，余下已知页标 `not-scanned`，不得把已有片段当可用全文。超5000页只记录超限/已知总数，不为超限文件分配无界数组。

扫描器接收上述结果后保留source hash/proof/text/pages。可解析但待人工核对的PDF默认纳入，使用 `pdfInspection.blocker`/待决定计数，不能设置一个使核对入口永久disabled的泛化file.error。不可解析的文档可有file.error，仍保留受限PDF诊断；不允许纳入发送。原有非PDF错误路径不变。累计来源50MiB/文件、100MiB/总量、2500万UTF-16字符、5000项及现有去重/保护目录规则均保留，PDF部分提取也消耗预算。worker每完成一页向主进程私有收集器发送该页台账及有界原文字片段，以便解析预算到期且owner仍有效时形成明确incomplete结果；进度不是最终诊断已封口的证明，不进入日志/renderer，不由已收集片段推断全文完成。生命周期取消走独立Abort结果：初次choose不据片段创建新session，reselect不替换旧文件，旧PDF补检查不提交迟到台账；不能把取消伪装成普通解析错误后继续选入来源。

`ImportFile.pdfPageDecisions?` 为已保存当前决定，`ImportSession.pdfPageDecisionEvents?` 为事件历史。仅实际出现相关图像/失败状态时持久化，不给所有旧文件补 `[]`。当前决定含fileId/page/sourceHash/proof/ledgerHash/resourceProfileHash、decision、confirmedAt、decisionRevision；事件另外记录确认、撤销、含正文、不确定和来源失效，不将位图、token或本机路径存入journal。有效决定仅限 `exclude-image`；`contains-content`、`uncertain`、显式撤销后的 `pending` 都继续阻断。只保存明确改变的页；未提交draft不入journal。重复保存相同决定是无操作，不重写时间/不清空检查点。

全扫描规则采用保守可解释边界：全文trim后为空，或全部物理页都含栅格、没有任何成功的非栅格文字页时，返回 `ocr-required`，该文件不能通过勾选通关。这样“扫描正文＋可提取页码/页眉”也不能被误当完整小说。每页都有照片但文字确实完整的PDF会被此保守规则阻断，这是本版明确限制；不能用字数阈值假装能识别正文。混合文件中另有真正的文字页时，每个图像页仍须人工检查；图像页仅有页码不构成自动放行依据。纯空白页沿旧契约继续待处理，不新增“确认空白页”捷径。

## 严格动作、授权及来源验证

复用 `desktop:novel-import`、`DesktopBridge.novelImport`与preload既有窄桥，不新增通用读文件/任意URL/可调用worker方法。现有 `trusted(event)`、主frame的shakeink://app、ready owner/draftSession、关闭/迁移/锁修复检查与BusinessGate在任何读字节之前执行。拟新增严格 `.strict()` 动作：

| 动作 | 唯一允许字段（除type） | 主进程约束 |
| --- | --- | --- |
| `read-pdf-page` | id UUID、revision非负安全整数、fileId≤160、page 1..5000整数、requestId UUID | 当前会话/精确revision，已授权且纳入的PDF；page存在于当前完整/可诊断台账。可读取文字页供定向渲染核验，只有已知图像页可获确认token；正式核对导航仍按批准稿列图像页。不接收path、bytes、url、scale、资源目录或输出路径 |
| `set-pdf-page-decisions` | id/revision/fileId、ledgerHash为64位小写hex、changes 1..100项 | page不重复。每项decision为上述四值；exclude-image必须有本次有效previewToken UUID，其余值不接受token。整批先校验再一次原子保存；一个过期项则整批拒绝 |
| `cancel-pdf-preview` | id、requestId UUID | 只取消同owner/会话的该预览请求，不依赖revision、不改任何决定、不取消AI。renderer直接调用桥且main直接命中共用registry，均不经过mutation/serial队列或等待read/initialize |
| `reselect-source` | id/revision/fileId | 调用现有合法来源选择入口，只接受一次选择返回的一个普通PDF grant；多选明确提示且不改旧来源，取消无操作。新fileId/inspectionId，绝不继承旧确认 |

单页响应在 `ImportResponse.pdfPage?` 使用判别联合：成功包含requestId/id/requestRevision/fileId/page/ledgerHash、mime字面量image/png、Uint8Array PNG、width/height、PDF原页尺寸与可选previewToken；失败仅含相同关联标识及封闭错误码（render-failed/timeout/budget/resource-missing/source-changed），不附库堆栈/路径。requestRevision对应请求时版本；若失败落盘使版本推进，最外层view携带新的权威revision，不能混淆两者。PNG签名、字节数、像素尺寸在出worker和入renderer各验证一次；Uint8Array不转大段base64，renderer仅创建image/png Blob URL。FileView只投影页码、文字计数、当前决定/阻断摘要与ledgerHash，不广播位图或原页全文。

预览token是主进程短期能力：绑定owner/session/fileId/page/revision/sourceHash/proof/ledgerHash/resourceProfileHash/PNG hash，最多100个、10分钟，随机UUID不可由renderer自报hash替代。取得成功、完整且可显示的预览后才颁发；确认时仍需重读源验证。token不是“已看完”证明，用户checkbox负责内容判断；禁止预览成功自动勾选。UI在img.decode失败时不能保存exclude，并提示重试；主进程无法证明人眼观看，不能在报告中作此承诺。已保存确认不因缓存淘汰失效；若对同源重新预览实际失败，保留旧决定作为历史、增加独立preview阻断状态，重试成功前不得继续。该状态不改提取ledgerHash或成功检查点内容，不能靠取消弹窗清除失败。服务发布验证也检查当前阻断状态。

实施接点增补（主代理确认属于NI-PDF12既有范围）：严格动作 `report-pdf-preview-failure` 仅接收 id/revision/fileId/page/requestId，用于合法PNG响应之后的renderer img.decode失败。主进程只认已颁预览记录的owner/root generation/session/file/page及同sourceKey(hash/proof/ledger/profile/inspectionId)，不接收原错误、PNG或路径，不改已保存决定。报告revision可为该响应的requestRevision或颁token时的权威revision；其间仅view版本推进不能吞掉已知同源失败。来源已重选/inspection变化、外会话/外页/未知request或过期记录一律拒绝，不能污染新来源。成功报告只持久化固定render-failed阻断并撤销该页token；取消/重开保持，成功重试后按原规则清除。新增同名TDD覆盖这些关联条件，仍在NI-PDF03/05/12范围，不增加通用能力或新UI。

在 `novel-import-files.ts` 增加主进程专用“按现有ImportFile读取受校验快照”helper，内部复用readSourceChecked，校验完整祖先链、禁止链接、O_NOFOLLOW、前后fstat/lstat、现有ctime严格规则及字节SHA。调用者只能传主进程查到的ImportFile，renderer不给路径。预览缓存命中同样先读源核验；渲染完成、颁发token前再核验身份/hash，确认批保存前再核验；不把读完后路径替换当原授权。预览与检测使用同一份已经核验字节/同一资源profile，不重新从路径加载PDF。禁止降低ctime规则以消除真实选择后的元数据异常。

以上helper只能在下述共用registry已经准入的job内执行，不能先readSource/verifyNovelSources或复制ArrayBuffer再排worker。此约束也覆盖scanNovelSources的PDF分支（在当前readSource之前准入）、确认保存/每次发送前的PDF源重验、旧PDF补检查及缓存命中；非PDF来源校验保持原路径，不新增通用文件能力。

任何源hash、proof或祖先变化：清除该来源全部有效确认/token/位图缓存，记录失效事件，增加epoch并撤销发送授权，`sourceReady=false`，要求合法重选。旧决定可留历史但不得显示为当前已确认，不自动把新hash写入旧ImportFile。对外错误只含受控码/短文案。新增来源、替换为同名文件、相同字节但新inode均不继承确认。

## 单页离线渲染、资源与容量

### 共用任务注册、读取前准入（PDF-TR01/02）

main为当前数据根创建一个 `PdfJobRegistry`/PDF任务客户端，早于controller.initialize，显式注入controller与扫描器；不是只附在session上的previewJobs。它统一管理inspect、preview及PDF源verify，覆盖初次choose、append/reselect、旧PDF补检查、缓存命中、页确认前和AI/发布前的源重验。每个job关联owner（window/draft owner及数据根generation）、operationId、用途、可选session/file/page/revision/epoch、取消标志、实际FS/worker资源账目及独立settled promise。

初次choose在调用选择器时就建立 `owner + selectionOperationId + generation` 的主进程选择上下文；选择器返回grant后，扫描工作仍归此上下文，尚无session也能取消/计active。队列只保存operationId、grant索引或fileId/page及期望proof/hash/profile等小型不可变标识，不克隆ImportFile.text、不持有PDF bytes。reselect和旧PDF补检查各有独立operationId；旧PDF补检查须在合法ready owner下进行，不能因initialize尚未有renderer会话就失去归属。所有完成回执先比较owner/selection generation，再比较已有session的revision/epoch，确认仍有效才创建/替换/保存；无session不能成为跳过检查的分支。

全客户端最多1个运行slot＋1个排队标识。运行slot在第一次主进程PDF身份链/快照FS调用、字节读取或独立buffer分配之前取得，直到最后一次源后验校验、worker真实退出/清理、全部FS promise settled与handle关闭、输出校验和响应准备完成后才释放。排队项提升为运行前重新核对内存中的owner/generation/期望身份；等待时不预读、不开PDF、不分配快照、不查缓存后偷偷验证。超出1＋1直接busy；同页合并只能发生于同owner/generation/operation/session/source proof/hash/profile及相同参数，不跨来源或owner共享结果。

主进程PDF读取另有同一slot内的真实资源账目：最多1个源FS链在执行，不用Promise.all并行发出同源多个重读。保留祖先链/前后fstat、O_NOFOLLOW和hash要求，初次快照按已核对size分配精确长度非池化ArrayBuffer（≤50MiB）并分段填充；EOF/增长探测和源后验校验使用≤64KiB临时块流式hash，不再为后验复制整份PDF。传给worker采用转移所有权；共享引擎直接消费收到的独立Uint8Array，不能沿用现有 `Uint8Array.from(bytes)` 再留一份客户端源副本。整条管线由客户端显式持有/复制的源快照预算≤50MiB＋64KiB（主进程与worker合计；PDF.js内部解析/解码对象另受worker/画布限额，这不是总RSS上限；字体/文字结果/PNG各按自身预算），每次分配/转移/释放有计账；若实现暂保留chunks+concat，就必须先调整为符合该预算的读取方式，不能仅以worker并发1声称字节有界。

截止时间从首次运行准入起计，覆盖前验FS/read→解析/渲染→后验FS→响应；排队另受相同最长等待期限，排队超时只删除标识，不启动任何FS。取消/超时立即使public结果不可采用、撤销相关token，并阻止启动下一段FS；已发出的底层FS可能无法中止，必须继续持有slot、字节/handle账目及settled promise，待真实读取settle后丢弃字节并完成close。终止worker不等于主FS结束，Promise.race的public timeout/epoch改变不能在finally提前删job或释放预算。尚有未settle FS/worker时不提升排队项、不接受新一轮“取消后重开”绕过限额；排队项取消则删除且无字节开销。

registry区分public completion和资源settled：前者可返回受控timeout/Abort，后者只有全部实际工作及清理结束才resolve。main busy直接计registry（含无session初检、已超时但未settle的FS）；controller.active同时覆盖自身动作/AI，不以session有无推断空闲。关闭期限内若settled未达成，保留正常关闭流程中的窗口、已有草稿/原目标及资源账目，明确停止失败；不关闭数据根/迁移交接、不报active=0。迟到FS最终settle后仍无PNG/token/session adoption，才释放资源并允许重试停止；不能借超时强行忘账。外部强制销毁owner时只保证撤销归属、后台资源继续计账和收敛，不宣称能恢复已被系统强制销毁的窗口。

采用项目已有PDF.js 6.3.289和已锁定@napi-rs/canvas 1.0.10，不引入新渲染器。PDF任务放入单独Node worker线程及专用构建入口 `dist/main/novel-import-pdf-worker.cjs`，由上述共用registry管理；worker接收核验字节和封闭任务联合，不能接收renderer方法名。共享PDF引擎供 `extractNovelText` 与worker调用，提取算法只有一份；Node24组件调用仍可用。正式扫描/预览通过同一客户端执行，防止Canvas渲染占住主事件循环；初检不能在默认scan中绕回主线程无注册解析。字节转移遵循上述预算，任务结束不保留PDF副本。worker线程不是操作系统沙箱，resourceLimits只管JS堆，不能声称限制了全部原生内存。

worker加载前设置其独立env `DISABLE_SYSTEM_FONTS_LOAD=1`，不改应用全局env，不在已加载Canvas的主进程removeAll。先安装封闭诊断收集器、注册内置字体，再动态加载PDF.js（它会自动require Canvas并安装DOMMatrix/Path2D）；CanvasFactory在创建及中间画布时统一检查尺寸。解析和预览只传 `data`，不传url，`stopAtErrors:true`、`verbosity:pdfjs.VerbosityLevel.WARNINGS`（不能用0隐藏诊断）、`cMapPacked:true`、`disableFontFace:true`、`useWorkerFetch:false`、关闭OffscreenCanvas/ImageDecoder/XFA，worker/CMap/standard_fonts/wasm路径只由包内固定根派生。禁用PDF脚本、外部链接动作和外部资源加载；只输出渲染位图，不创建可点击PDF DOM/annotation层。

### 丢图与资源诊断必须阻断（PDF-TR03）

已只读核对锁定PDF.js 6.3.289源码：`legacy/build/pdf.worker.mjs:40551–40553` 对图像W/H缺失或非数字直接warn＋return；`40710`附近解码失败catch也可warn后发送null图像。前者即使 `stopAtErrors:true` 仍不throw。`pdf.mjs:22773–22776` 的Node分支使用同线程fake worker，两个模块的warn均调用console.warn。故“最后没有paintImage”只是一项结果，不是无图像证明；PNG magic/尺寸成功也不能证明没丢内容。此事实与对应诊断映射绑定PDF.js模块hash/resourceProfile，依赖升级须重审，不能静默沿用规则。

专用Node worker内、导入任何PDF.js模块之前封装该线程console.warn/error/info/log/debug，不转发原console，也不改应用主进程console。WARNINGS确保无throw分支可见；Node fake worker与display模块都必须落入同一收集器，不另起未受控浏览器Worker。console入口只在内存中取至多首个字符串参数的前512字符作固定模式识别，不JSON.stringify未知对象/调用用户getter，不存原文/字体名/路径/堆栈；非字符串、超长、无法分类一律记封闭 `PDF_DIAGNOSTIC_UNCLASSIFIED` 并阻断。每页最多128条、全任务512条及固定码计数；超限记 `PDF_DIAGNOSTIC_OVERFLOW`、阻断，禁止继续堆积原始日志。Worker构造显式 `stdout:true,stderr:true`，流由客户端排空/丢弃、不concat保存、不自动管道到应用日志；任何意外输出只记固定异常码并取消任务。worker error/message也经schema映射，不向renderer、journal或证据日志发送库原始message。

| 固定诊断类别 | 处理契约 |
| --- | --- |
| `PDF_IMAGE_DIMENSIONS_INVALID` | 精确映射上述missing/not numbers警告；该页 `raster:unknown`＋page-error。即使有可提取文字或operators无图像也不能none/ready |
| `PDF_IMAGE_DROPPED`、`PDF_IMAGE_DECODE_FAILED` | 图像被移除、decode失败/null图像、截断/部分JPEG恢复、mask/图像维度修复等无法证明完整的路径全部阻断；不能把修复/忽略余数据当成功 |
| `PDF_REQUIRED_RESOURCE_FAILED` | 必要CMap/standard-font/wasm/嵌入字体损坏、缺字形或加载失败均阻断；不得笼统归为可接受字体fallback |
| `PDF_DIAGNOSTIC_UNCLASSIFIED/OVERFLOW` | 无法证明无内容丢失，阻断本页；不能归属某页的异步/文档级诊断使检查不完整并阻断整个文件 |
| `PDF_BUNDLED_FONT_FALLBACK` | 唯一非丢内容例外：可确认是未嵌入字体的家族替代、已验证CMap/字体资源hash且该页所有待替代字符在内置字体有非零glyph。只能使用锁定版本逐条审核的固定警告模式及结构化条件；字体损坏/编译失败/截断不在此例外。非例外警告不能为L01兼容而统一忽略 |

诊断有完整性封口：顺序逐页处理，getOperatorList/getTextContent后仅有候选台账。对已发现栅格/风险页执行同样有界的离屏验证render以等待图像依赖/解码（不颁token、不自动确认、不必编码PNG）；预览则完成真正render/PNG候选。相关render、PDF对象依赖、loadingTask.destroy/worker任务收尾都完成且诊断无阻断后，才封口最终状态并将候选PNG送主进程后验校验。已完成页进度可以先收集文字，但不得提前以 `raster:none` 放行整书。晚到且不能安全定位页的警告污染整文件，不能按“当前页”猜归属或靠短暂sleep假装异步排空；无法证明完整即page-error/incomplete。图像页验证渲染仍受同一slot/时间/画布预算，不扩为无界额外并发。

只有页扫描成功、诊断已封口且没有丢图/解码/资源问题时才能记 `raster:none`；图像已知存在且完整则present，存在风险或任何未证明部分则unknown。任何阻断诊断都禁止发previewToken，丢弃可能已生成的合法PNG，并向用户返回受控page-error/render-failed。主进程/服务门控不接受该页exclude来覆盖解析/诊断错误；需修复来源/OCR/重新合法检查，不以人工勾选代替原页完整性。

渲染允许PDF.js使用已注册的字体fallback（`useSystemFonts:true`仅作为该库选择fallback的选项，Canvas系统字体加载仍被禁用），否则未嵌入GBK字体可能不显示。注册封闭别名集：Noto Sans SC、serif、sans-serif、monospace、宋体/仿宋_GB2312/楷体_GB2312/黑体及已独立发现的对应乱码家族；允许字体元数据带来的普通别名做有界清洗，但不得将PDF提供的名字当文件路径加载。嵌入字体由PDF.js原有路径处理。提取字形检查与真实页视觉核对仍为验收项，fallback不保证恢复原字重/字面/排版。

仓库资源只读核验如下（不是渲染测试）：

| 资源 | 大小/身份与打包选择 |
| --- | --- |
| `design/assets/NotoSansSC-Regular.ttf` | 10,642,676 bytes；SHA `6fb994f703468a02b8abff77a75ec1ece966b03c7a93a213454531fffae1f53e`。设计目录不在正式files白名单，不运行时引用它 |
| `public/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz` | 6,309,044 bytes；SHA `cff80a0848ccb2c2da3660dcc3349f9df32ea8fd7e0af3ffc2a79633f09e0699`；解压与上项逐字节相同。采用此现有资源，无需复制第二套字体 |
| 同目录LICENSE及design对应LICENSE | 均4301 bytes，SHA `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`；现有README标明Noto Sans SC 2.004、固定400字重、OFL 1.1；现有prepare-package-resources已复制许可证及登记provenance |
| 字体cmap静态表 | 30,890个非零映射codepoint；L01独立全文中2,842个不同BMP汉字全部有非零映射。只证明字符覆盖，不证明实际Canvas渲染或PDF原样式 |

开发态从本仓库public固定路径读取；安装态从appRoot/out/fonts固定路径读取。gz输入≤8MiB、gunzip maxOutputLength 12MiB、同时校验压缩/解压hash，只在worker内一次解压并以 `GlobalFonts.register(Buffer,alias)` 注册，不写临时TTF、不从系统目录或Codex缓存取字体。资源缺失/损坏/注册失败时预览返回失败且不颁token，不偷偷落回系统字体。

现有 `electron-builder.config.cjs` 为asar:false、npmRebuild:false，正向包含out/**/*；`scripts/inspect-packaged-app.mjs`已要求上述gz且逐资源比对。`scripts/runtime-dependencies.mjs`从build metafile取externals递归保留依赖，但PDF.js把Canvas声明为optional。拟在package.json/lock把已有1.0.10提升为明确生产依赖，并在worker源码显式引用，缺平台包即失败；这不引入新的库或版本。新增worker入口必须同时加入build-desktop、runtimeEntries、builder正向files及inspect预期，保持metafile与entry顺序对应；不能宽泛打包desktop/design/整个dist或开发证据。资源provenance补PDF.js、Canvas MIT、对应平台原生包许可证/hash和PDF资源profile；继续原有许可证/归档规则。

平台包已有darwin-arm64/x64、win32-x64/arm64-msvc的N-API预编译声明；当前只读安装元数据只能证明可行路径。后续必须在相应实际安装包中验证.node架构、包内require、字体注册与一页渲染；不运行npmRebuild、不修改签名/公证/库校验权限、不从父目录fallback。Windows真实执行未具备时单独标未执行，不能拿macOS或样式切换替代。

拟定固定上限（常量主进程/worker共用，schema不能让renderer提高）：

| 项目 | 上限及失败行为 |
| --- | --- |
| 文件/页数/文字 | 保留50MiB、5000页、2500万字符；全局超限不产生可用全文 |
| PDF工作/主FS | 共用registry同时1条运行管线＋1个仅标识排队项；准入早于主FS/read/分配，覆盖read→worker→postverify；源字节≤50MiB＋64KiB，FS尚未settle不释放slot。相同页合并也须同owner/proof/profile/operation |
| 单页预览 | 长边≤4096、总像素≤4,000,000、PNG≤8MiB；按完整页面比例缩放，不裁图。100%为PDF point按96/72换算的CSS尺寸；20%–250%为UI查看比例，不由IPC任意申请画布 |
| 图像/复杂度 | 保留PDF.js maxImageSize 4,000,000；每页operators≤100,000、单任务累计≤2,000,000。预算异常归page-error/budget并阻断，不丢大图后交一张看似完整的预览 |
| 时间 | 从运行准入到后验/响应的完整管线：单页15秒、全PDF检查120秒，每页给取消点；排队亦有有界等待。到时取消render/loading并终止worker；public timeout可先返回，实际FS/worker settled前持续占预算。生命周期取消不创建来源session；解析超时仅能产生阻断incomplete台账 |
| 位图缓存 | 当前controller内最多2页且总≤16MiB，LRU，key包含owner/session/fileId/sourceHash/proof/ledgerHash/resourceProfileHash/page/固定渲染参数；不缓存整个PDF或活document，不写磁盘 |
| renderer | 只保留当前PNG Blob及至多前一页；离页/关闭/新会话/卸载撤销ObjectURL。PNG不进Zustand持久化、journal、AI参数、日志或最终审计 |
| 运行资源 | worker JS堆resourceLimits 256MiB；每次任务结束清理page、loadingTask.destroy、canvas。原生解码仍有实现内存开销，几何/输入/时间限额是约束而非总RSS证明；需目标资源用例实测 |

若实际PDF在这些限额内仍无法完整预览，明确失败/OCR处理，不提高成无界分辨率，也不允许确认。L01需实测全178页提取及1/89/178等真实页可读性，静态cmap不能代替。

## 控制器状态、并发与门控

新增纯函数 `validatePdfPageReviews(files)`：对每个纳入PDF验证台账与源绑定、完整页数/唯一页码/区间、无解析或当前预览阻断、至少一个成功非栅格文字页、每个raster=present页都有当前有效exclude-image。`unknown`/缺失台账/不合法决定拒绝；排除整个来源只免除该文件门控，不让“选择正文类别”免除图像页核对。preview失败使用独立受校验状态，不放进稳定提取ledger；保存进私有journal供重开保留阻断，成功重试才清除，不写PNG。事件历史/决定项累计也受journal既有1GiB编码限额，超过时整批回滚并明确失败，不能截断旧审计来通关。

调用层次：

1. `readable`和本地/AI classify前验证PDF门控，但不要求所有unknown文本已归类，避免分类死锁。未知片段仍能在PDF核对后合法识别。
2. `validateImportCoverage`在现有文本覆盖之外调用同一门控；`importSourceReady`因此权威为false。来源页另给 `pdfReady`/待核对数用于识别按钮，不能用需要分类后才为真的sourceReady阻止首次识别。
3. `verify`统一检查源身份/hash和PDF决定，位于每次classify/analyze/review/patch发送前；返回结果采用前再检查源与epoch。start/resume/retry、纯拷贝、冲突后继续、恢复保存、最终publish均不能绕过。
4. 服务侧 `assertPlan`再次验证PDF契约与importPlanHash，即使renderer伪造UI/直接调用start或服务收到缺决定session也不发布。服务不接受renderer直接publish；实际源文件校验在主进程发送前完成，服务只接主进程封闭输入。

PDF检查与预览均归上述共用registry，不另建只覆盖preview的孤立注册表。预览只在source/select/confirm/paused/failed且无AI在途、无publication冻结时接纳；recognizing/running/publishing/completed/discarded不能以查看页来改变当前任务。`read-pdf-page`在短serial中取得当前revision/epoch的不可变标识，再排registry；该步不做FS/read。管线等待放在serial之外，资源settled后再短serial核对owner/session/revision/epoch/源并生成可采用响应。registry的资源settled不等待controller的serial提交；controller状态提交也不占着serial等待自己才能完成的job，避免互等。

预览中暂禁保存决定/来源修改，或先在serial之外await同owner预览取消再提交；页决定等正常mutation仍用现有串行队列，不能用忙状态吞掉用户草稿。read-pdf-page及cancel-pdf-preview采用独立请求通路：renderer的取消helper直接 `window.desktop.novelImport`，不排在mutations/choosing/read promise之后，也不等待一个current刷新；切页、Escape、卸载和关闭即使预览busy也能立即发取消。main在trusted/严格schema/归属及业务准入后，直接以id/requestId命中registry并撤销能力，不进入controller.serial、不await initialize/tail、不要求revision。已关闭BusinessGate的renderer取消可被拒绝，但main内部生命周期取消不走IPC/gate，因此不依赖此请求才能停止。重复取消是幂等；不允许取消其他owner/session的工作。

切页取消后迟到响应只有session/file/page/requestId/requestRevision全匹配才可adopt。成功的独立read-pdf-page不增加持久revision、不写无意义save，两个页draft可共用打开时revision；首次持久化实际失败/清除已持久失败是有意义的状态变更，按save正常推进版本并返回新view。任意外部revision变化时旧token拒绝，UI刷新/重新核对后才能保存，不自动拿新revision重发旧checkbox。

生命周期顺序明确如下（PDF-TR01），包括初次choose仍卡在controller.serial扫描、尚无session的窗口：

1. `beginClose`进入时先同步关闭该owner/generation的PDF新准入、推进selection generation并向所有registry job发cancel；来源选择器也取消。此步骤在CloseCoordinator.request、任何 `await controller.tail/pauseAll/close` 或 `BusinessGate.close()` 之前执行。stopTasks、closeData、服务断开、owner销毁/换根、迁移/维护入口重复执行同一幂等入口，不能等选择器或controller扫描先完成。
2. 在controller.serial之外等待registry资源settled：取消排队标识，等待实际worker exit、未settle FS结束/handle close，清token/缓存。registry内的resource cleanup不依赖controller提交；生命周期取消的初检/reselect/补检查完成后以Abort展开原serial动作，禁止采用部分结果或创建新session。
3. 随后才等待controller.pauseAll/close/tail、既有AI cancel/drain与草稿保存，再关闭并等待BusinessGate及数据服务，最后换根/迁移交接。controller.pauseAll/close自身也须在其首个await tail之前调用registry取消作为防御，不能只指望main的某一个关闭入口。main内部取消不需要现有session/id/revision或renderer仍存活。
4. 现有正常停止期限（10秒）内若FS/worker未settle，则停止失败并保留窗口/既有草稿/原数据根，禁止宣告drained/closed/迁移已武装。registry保持不准入和真实账目；后续迟到工作收敛后才能显式恢复准入或重试关闭。用户取消关闭/维护恢复也仅在registry已真实settled后由当前owner/root generation reopen，不恢复旧已取消任务。

共用PDF worker无DB租约、模型Key或模型请求，其取消/收敛不改写AI复核包或成功analysisCheckpoint；生命周期取消只撤销当前在途采用能力，不能把重新授权变成重做已成功分析。BusinessGate覆盖已接纳的public业务promise，registry另外覆盖public timeout后仍未settle的实际FS/worker；两者均排空才算数据关闭完成。

改变当前有效页决定（包括撤销）在无AI/发布在途时原子保存并调用来源失效逻辑：增加epoch，清发送grant、旧分析检查点/coverage与相关派生结果，回source并保留文件原text/页台账和决定历史。源决定改变属于实际范围变化，应重新允许发送；仅打开、缩放、切页、取消draft、重复同值保存不失效。已开始publication时禁止任何页决定修改，沿现有冻结计划重试，不抹掉publication去改审计。

## 指纹、旧journal与最终审计

`importScopeHash`/`importPlanHash`通过条件展开增加 `pdfReviews`，仅在纳入来源实际有图像/阻断PDF检查时存在。规范值包含source身份/ledger/resource profile、按file顺序及page排序的当前有效决定；不包含预览token、PNG、UI draft、读取时间、当前session revision或事件时间。`importPlanHash`额外绑定已冻结的PDF决定审计事件指纹，保证同request的审计不能被替换。事件在发布前固定，重试不得增加“重读”事件。

无图像来源绝不默认添加 `pdfReviews:[]`、`pdfPageDecisions:[]`、`pdfPageDecisionEvents:[]` 或改变files映射。S01等旧TXT/MD的scopeHash、planHash、publicationRecord及analysisCheckpoint保持逐字节原结果；`stableImportJson`忽略undefined不忽略空数组，故必须用条件展开。不改旧journal文件来迁移真实会话，不重算真实S01历史grant/检查点。

恢复时可选PDF字段需嵌套schema与绑定校验，不能沿用当前validJournal的浅files检查接受伪造/重复/缺页决定。无PDF旧journal按原路径恢复，原target重授权与NI-S10/11保持。旧PDF缺新台账时先权威阻断发送，在ready owner下通过共用registry登记补检查operation，再准入重读授权原源；不能在initialize/tail内开始一项主进程无法取消的孤立检查。原源失效要求重选，生命周期取消不提交新台账。若确认是纯文字PDF且text/pages相同，不给hash加入PDF决定字段；已有成功检查点可保持。旧图像PDF在当前实现原本不能成功提取，不存在自动继承的图像确认；新增图像来源一律未确认。

publicationRecord仅有实际图像页决定时增加可选 `pdfPageReview`：版本、fileId/文件名/format/sourceHash、无路径proof、物理总页数、逐页文字区间/字符数/文字hash与栅格状态、每页最终exclude-image、确认时间、全部确认/撤销/失效事件、ledgerHash/resourceProfileHash，并明确“图像未导入；该页提取文字保留；无OCR”。既有sources、冲突decisions及其计数语义不变。NOVEL_IMPORT快照和ContentMutation回执同事务提交；失败/未知确认重试比较完全相同的审计快照。

`readNovelImportRecord`和前端RecordResponse增加受控只读投影：来源名、短hash、页号、文字字符数、确认/撤销时间与决定说明；不回传路径、ancestors、PNG或任意原PDF读取能力。已有无PDF记录自然无此区块，不显示“0页已确认”误示。保留完整本地材料分页与原始正文阅读；完成后不要求永久保留预览缓存。

## 正式UI接入

使用现有 `@/components/ui/dialog`（Base UI真实组件）、Button与当前主题变量。来源卡显示物理图像页数/尚未确认数/预览失败等真实状态，来源数量随纳入复选变化。保留原文核对和编码路径，新增“核对图像页”入口；不能把整个文件error作为唯一入口条件。

页核对使用真实DialogContent及独立局部draft Map，key为session/fileId/sourceHash/proof/ledgerHash，按page保存本次明确变更；切页不清draft，未操作页不进入changes，不提供默认全选。两页打开/查看成功仍不算确认，只有手动checkbox并保存才提交。已确认页取消勾选后显示“撤销确认并返回/保存更改”，保存后重新阻断；取消/Escape/关闭写“取消本次更改”，丢弃draft并清楚保留旧决定。主来源步骤与页弹窗分离焦点，内部关闭回到“核对图像页”触发器，整个导入Dialog关闭仍回原工作台触发器；复用Base UI焦点管理，不另写一套全局Tab拦截器。

最大920px，四周至少16px，height/max-height≤视口减32px；头尾固定，中间min-height:0独立滚动；640px以下纵向堆叠，390×600保持确认/取消可达。预览20%–250%、100%、适合页面，双轴原生滚动及可聚焦区域供方向键查看小字。图像保持原比例/白色PDF纸面，周边使用宣纸/玄墨令牌。加载、失败、重试、OCR、来源变化均是实际状态；重试成功不自动确认，旧源失效须重选。演示场景选择器、占位文字与主题审核工具不进入产品。

## 实施范围和阶段门

拟修改：上述8个指定业务文件；新增专用PDF worker/client/helper（desktop/main下，主进程私有）；`desktop/main/index.ts`接入生命周期、`scripts/build-desktop.mjs`/`scripts/runtime-dependencies.mjs`/`electron-builder.config.cjs`/`scripts/inspect-packaged-app.mjs`/`scripts/prepare-package-resources.mjs`及package.json/lock精确资源增量；`src/components/desktop/novel-import.css`及必要的页核对真实React子组件。shared/ipc/preload仅在类型需要时同步，不增宽任意数据通道。已完成选择器/跨平台来源工作与检查点/复核合包必须原样保留。

技术审核后先独立审核16中每个具体用例，再红测→最小实现→同名定向绿测→独立代码审核→受影响真实Electron及安装资源验证→原L01完整正式重测。只运行目标相关用例名，不跑测试suite、全仓/全浏览器/全打包回归。真实原件、journal、模型和既有04已审核案例不在本轮文档编辑范围；当前只新增15/16。

尚未验证：上述新门控/worker、包内字体渲染、真实390×600交互、macOS安装版资源及Windows。原L01全流程仍未通过。静态字体覆盖、方案或将来的合成测试均不能代替RB-L01的原生选择、真实AI、20回语义核对、发布与重开证据。
