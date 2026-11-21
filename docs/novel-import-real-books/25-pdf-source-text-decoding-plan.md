# PDF 源字形编码保真：调查、窄方案与用例

日期：2026-10-26。状态：**待独立技术/用例审核，未实施**。只解决RB-PDF01逐页原文保真失败，不改真实原件、既有正文、CMap资源或AI引用规则。

## 实际失败及源证据

主代理以明确绑定`.ts`源码的worker提取原L01全部178页，原件前后SHA相同。外部`输入核验/L01-production-pdf-v2.json`保存完整结果及解析代码前后hash；1图像页、177文字页、123760 UTF-16字符、正文提取SHA `c728d4a96c55a4b4b97fb0e7b8a1bd0b0f5462f214916501bc4d535d4abb8ee3`。这是组件输入核验，没有应用、模型或发布。

与事前独立pypdf逐页去空白比较，171页精确相等；所有页去空白长度相同，全部不等字符穷举只有269对`U+2026 → U+22EF`。页3/4为目录省略点135/124个；页40/46/92/121/172各2个，其余无非空白差异。它不满足16“仅允许必要空白表示差异”的既有验收条件，不能直接调低此条件记通过。

独立只读解析实际PDF ContentStream证明这269个字形原码均为`A1AD`，字体为Type0、Encoding=`GBK-EUC-H`、BaseFont宋体、原字体字典无ToUnicode。这些页的全部字体资源均为相同GBK编码且无ToUnicode。GBK标准解码A1AD为U+2026；PDF.js经CID/Adobe-GB1生成的Unicode是U+22EF。原字节、原渲染与提取Unicode是三个不同层次，不能以图片可读代替正文码位保真。

锁定PDF.js worker保留Glyph.originalCharCode/fontChar/unicode（约32429行）；getTextContent只提供str/fontName，存在合并、空白插入与bidi。fontExtraProperties暴露的toUnicode可能已是生成映射，不能用其存在性证明源字典是否有ToUnicode。**禁止全局U+22EF替换、NFKC、仅按字体名猜编码、覆盖源ToUnicode、直接修改node_modules/CMap或依独立测试答案改正文。**

## 候选实现与边界

使用已安装的生产依赖pdf-lib，只读核对原PDF字体资源；不增加Python/外部程序/网络或新模型。新增纯worker helper负责有限源编码证据与提取字形对照，renderer无新action/UI。

1. 在同一已准入worker、PDF.js接管/转移源ArrayBuffer之前，从同一源Uint8Array读取字体资源证明。禁止`pdf.getData()`再制造一份全文件源快照。不得序列化/保存改写后的PDF。pdf-lib的内部解析内存仍受worker限制，不将JS堆限额称为总RSS上限。
2. 证明覆盖页面实际可能使用的字体资源，包括继承资源与可达Form/Pattern等嵌套资源；设严格深度/访问对象数/资源数上限、循环检测与可取消工作边界。不能只看page.Font却漏XObject里的另一套编码。只有全部相关字体明确Type0+GBK-EUC-H且原字典确实缺少ToUnicode时，才标记为可校正页。其他编码或源ToUnicode存在时原输出保持，不做自动转换；缺失/歧义不能冒充已证明。
3. 读取该页operator list中真实字形Unicode及originalCharCode。以实际显示文字操作、顺序、字符多重集与getTextContent结果建立可验证的一对一非空白序列对应，保留原文本项全部空白；不按str位置盲目对齐、不丢文本、不依赖特定书名/页码/字体资源名。只有对照完全成立才可定位目标码位。已满足源编码前提但存在需要处理且无法建立对应的字形时，明确标记该页无法核对并阻断，不返回截断成功。
4. 仅将已追溯到原码A1AD、当前提取为U+22EF的那个字形，按源GBK解码为U+2026。其他所有字符逐码位不变，源已有显式ToUnicode的真正U+22EF必须保留。发生变化前后UTF-16边界、页文字范围/完整拼接需重新核验。渲染仍使用原PDF.js字形，不改PNG、字体/CMap或PDF字节。
5. 新的源解码策略标识与最小校正证明（页、源码、前后码位、数量、证明hash）只在实际发生校正的检查台账中条件保存，纳入ledger/sourceKey/授权/发布指纹和私有审计；不补默认字段到旧记录。诊断与审计无路径/PNG/原文片段。固定证明大小受页数/资源边界约束，不把全部glyph写journal。
6. 历史已发布/正在恢复的正文不自动重解释或替换，旧plan/scope/receipt保持；新提取结果只经既有重选/检查→范围失效→明确发送授权进入新分析。不能借bugfix静默改旧workingProse或成功coverage。旧材料缺新策略字段仍按历史表示读取；新记录精确绑定实际采用的解码策略，不能用旧预览token批准不同台账。

若pdf-lib资源证明与PDF.js实际执行字形不能安全关联，停止并保留失败，进一步收敛方案；不能为通过此书而扩大Unicode别名容忍。该方案尚非已实现，实施前必须验证具体API与映射可行性并由独审确认边界。

## ST01–ST03 独审后的具体收敛（本节优先于上节概述）

### 解析前准入及原始资源遍历

该校正只接受一个保守子集，不承担通用PDF重排/解压：证明用输入上限 **8MiB**；页面上限5000；原始字节扫描最多8MiB、危险名字匹配仅保留最多7个解码字节、Name起点总数最多100000、原始`obj`关键字出现最多20000。超总量/词法不完整在调用pdf-lib之前结束为incomplete，不能先load后计数。扫描直接读取原Uint8Array及≤64KiB固定scratch，不把整文件转字符串或复制；每64KiB处理边界让出执行权，取消仍由现有worker.terminate及实际exit管理。

解析前对**全体原字节**扫描PDF Name，按PDF分隔符/空白界定并完整解码`#xx`（含混合大小写/逐字符转义），拒绝解码为`ObjStm`、`XRef`、`Encrypt`的名字。因为是保守全字节扫描，字符串/普通流内同名字也可能使证明不完整；不能因此转入另一个不受限解析器。锁定pdf-lib只在Type=ObjStm/XRef路径自动解码这两类流，该预检在load前拒绝它们，**本证明路径允许的ObjStm/XRef解压预算为0字节**。需以锁定库实际分支及注入load spy验证拒绝早于decode/分配，不能只用最终超时证明。普通raw stream不调用decode/getContents，仅保留源buffer view；没有候选的页面维持原PDF.js结果，证明不完整且出现待核对A1AD/22EF候选的页面阻断。

实施预检在原L01二进制流中遇到随机`/`后长段，旧“所有原字节Name超过128即拒”会在load前误拒本书（names291/obj62，原件hash不变），因此修订为有界危险名字匹配：最长危险名Encrypt为7解码字节，超过7即已证明不可能精确等于三个危险名字，不再保存其内容，但仍消费到下一合法分隔符并计入8MiB/Name起点预算。不能跳过stream、不能在长段中重新寻找伪造词法边界，也不能只检前缀；只有完整名字结束时精确等于危险名才拒。`#xx`始终逐字节验证/消费，不分配任意长名字数组。实际字体资源字典采用的Name仍有128字节上限，在受限raw资源遍历中核对；pdf-lib普通名字的总输入仍受8MiB预检约束，不宣称其内部字符串分配为0。NI16补原二进制长非危险Name不触发无关预算、危险名字逐字符转义/边界/前后缀及总扫描上限反例；这不扩大8MiB/零解压准入，不放宽资源证明。

全原字节的禁用名扫描与真正语法Name校验分离：L01普通二进制数据还有210处非`#xx`形态，不可当所有PDF资源名字无效。锁定pdf-lib `PDFName.of`的decodeName仅替换合法转义，非法`#`保留为字面内容，不能形成无`#`的ObjStm/XRef/Encrypt。预检遇非双hex的`#`只消费该字面字节并将本Name匹配状态置为“不可能是危险名”，继续到原始合法delimiter，不以非法转义为新边界、不跳过后续Name、不分配长数组。有效`#xx`完整解码，编码出的delimiter仍是Name内容，不能提前结束名字；单次解码不递归解释`#23`产生的`#`。可更保守拒绝合法大小写转义，但不能漏掉锁定库会识别的危险名。真正被资源闭包采用的Name仍做严格结构/128字节检查；本预检只负责在load前排除自动解码入口。NI16加非法`#`字面/EOF、`#23`非递归、转义delimiter、危险名所有合法转义及相邻Name反例，断言库实际Type判定与预检不会漏拒危险入口，而普通二进制随机片段不触发未声明的解析预算。

通过预检才建立`Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)`的零复制别名，再调用`PDFDocument.load(alias,{updateMetadata:false,ignoreEncryption:false,throwOnInvalidObject:true,parseSpeed:ParseSpeeds.Slow})`。锁定库的ByteStream.slice实际调用输入的.slice：普通Uint8Array会复制raw stream，而Buffer.slice保留同源view；因此不能直接传普通Uint8Array后声称零复制。alias及所有raw-stream内容必须有相同底层ArrayBuffer，禁止Buffer.from(bytes)/Uint8Array.from或新整文件快照；测试同时用load spy和实际ByteStream raw-stream buffer identity验证。证明完成后释放文档/别名引用，原始Uint8Array仍原样交PDF.js，无save/draw/normalize/pdf.getData。若锁定库存在未被预检排除的自动解码/复制路径，必须继续收紧拒绝子集，不能编码时声称堆限制等价解压限额。

禁止`getPages()`、`page.node.Resources()`、`getInheritableAttribute`等未经限环的便利遍历。只经原始PDFDict/PDFArray/PDFRef和context的单次lookup，自己迭代页树及Parent链：页树/Parent深度≤32、资源/Form深度≤16、全部访问对象/引用边≤20000、单页资源项≤256、全文件字体≤4096；计数在递归/lookup之前，重复引用按(ref,有效Resources上下文)识别，环或无效引用为incomplete。原ToUnicode存在性用保留PDFNull的原始get；显式null/错误引用为incomplete，合法显式ToUnicode为正常ineligible（不校正），绝不视作缺失。

闭包固定如下，不以“等”省略：支持继承Resources；支持Image XObject（不解码其数据）及Form XObject的独立Resources/缺省回退；支持ExtGState.Font的直接字体引用。非空Pattern、ExtGState.SMask（除Name None）、annotation/AP、Type3字体及无法识别的可执行资源一律不证明为eligible。页Annots为空可接受；非空Annots保守incomplete，不调用外部URI。一般Transparency Group本身不引入字体，但有独立资源/执行字典则拒绝。所有闭包字体必须Type0、固定GBK-EUC-H、原字典无ToUnicode，且未嵌入；正常其他编码/合法ToUnicode为ineligible并保持原结果。结果是closed+eligible、closed+ineligible、incomplete、budget四态，不能把后两态转成可校正。

该子集覆盖已核对的L01七页：其Resources仅Font/ProcSet，Annots为空，没有XObject/Pattern/ExtGState。此为输入事实，不在生产逻辑中写页码/书名例外。

### 可执行的同质候选映射

只在closed+eligible页面、普通水平LTR TextItem中校正。用锁定operator list的真实`OPS.showText`（含TJ/引号归并结果）逐glyph流式处理；数值仅作字距，不当字符。跟踪save/restore及setFont/ExtGState.Font，未定义字体状态、超过32层状态栈、不可识别文字操作/嵌套执行状态或非0/1/2文本渲染模式使候选页incomplete。Form经operator list的实际展开序列处理，并已在源闭包涵盖其全部字体，不能漏用另一套编码。

仅接受**同质目标集**：本页所有unicode为单码位U+22EF的glyph，其originalCharCode都必须是A1AD；只要同unicode另有其他原码，或多码位glyph包含22EF，候选页阻断。其他多码位glyph可展开成Unicode scalar作序列比较，但不得生成目标。所有目标来源均同一已证明编码及同一原码，重复的目标字符互换也不会把别的原码误校正；不是用多重集相等猜目标位置。

完整glyph Unicode scalar序列与完整TextItem.str scalar序列先逐项校验，仅忽略用于布局的空白；**必须顺序完全相同**。任何RTL/ttb/vertical、Unicode格式控制符(Cf)、非布局控制符、过滤/位置裁剪、字序重排、未知glyph身份或数量不等，使有候选页阻断；无候选则原样且无校正字段。完整相等后，按每个TextItem实际UTF-16起点/for-of scalar长度建立目标offset，保留每个str及hasEOL附加的全部空白。只在已证明目标位置做22EF→2026，不能用全文件replace或只看数量；其余码位逐项相同，应用前后单页完整检查一次，通过后才append/progress/ledger。整个页面要么完整校正并证明，要么阻断且无半页校正成果。

每页glyph≤100000、全任务≤2000000，复用已审operator预算；候选页≤128、每页目标≤2048、全文件校正点≤4096，新增证明JSON≤64KiB。每1024 glyph检查处理预算并让出执行权；parent取消/超时仍等真实exit，不把内部循环宣称有AbortSignal。证明不保存全部glyph/原文，临时页数组在页完成后释放。

### 策略、指纹、历史与审计

仅有实际校正的新检查结果增加严格可选字段`sourceTextDecoding={policy:'gbk-euc-h-a1ad-v1',sourceHash,pages,proofHash}`。每个pages项含page、resourceClosureHash、beforeUtf8Sha256、afterUtf8Sha256、candidateCount、严格递增的changedOffsets、glyphSequenceHash和correspondenceHash；offset相对该页最终pageText的UTF-16起点。文本digest明确定义为原始UTF-8的SHA256；proofHash为剔除自身后按稳定排序JSON计算的SHA256。该schema限制上述数量/字节/hex/offset，且sourceHash必须等于文件/inspection原件hash。

core验证每个offset确为最终2026、安全且唯一，逆置为22EF后必须等于before digest，最终全文必须等于after digest；candidateCount/校正数与数组相等、页范围完整，proofHash/ledgerHash均吻合。source raw资源证明由可信worker在同一原件snapshot计算，main仍做源hash后验/epoch核验；renderer不能提交或选择策略。

具体接点：shared可选schema；core PDF stored字段验证及ledger hash；`pdfReviewScope`把“实际sourceTextDecoding”也纳入（即使imagePageCount=0）；`importScopeHash/importPlanHash`条件绑定完整policy/proof；`pdfReviewAudit`及publicationRecord包含**纯文字但实际校正**的来源，完整证明只在私有审计，read-record投影只返回policy及校正页/点数等无路径摘要。相同最终文字而policy/proof不同仍有不同授权/计划/发布指纹，旧token不能跨ledger/sourceKey使用。

新choose/reselect默认采用上述受限策略；旧session恢复及旧PDF补检查明确采用legacy策略，不生成该字段、不改变旧file.text/workingProse/units/成功coverage。补检查在临时结果中先核对提取text与旧file.text逐字相等，若不同则保留旧全部数据并明确阻断、要求合法重选，不能为补台账覆盖旧正文。若要新策略只能合法重选、原失效路径与重新授权；旧已发布读取及幂等回执仍核验旧表示。无候选/无实际校正、旧MD/PDF均完全不加空数组/默认policy。策略选择只能由main内部调用指定，不能成为renderer参数。缺新字段不是自动升级许可。

NI-PDF16在load前实测：ObjStm/XRef（含#转义）/超8MiB/超Name或obj数导致load调用0次；raw Parent/Kids环/深层/超量资源遍历在lookup上限前停止；不调用未限环便利API；ToUnicode=null/坏引用、Form/ExtGState/Pattern/SMask/annotation边界各自结果明确。映射正例为完整LTR同质候选，重复同unicode不同原码、RTL/vertical/Cf/过滤/重排/多码位候选均阻断；正常非GBK/合法ToUnicode/无候选保持原字符。每个反例不能用崩溃/最终timeout冒充有界证明。

NI-PDF17增加无图像校正的scope/plan/实际隔离PGlite审计正例，同最终文字不同proof拒绝，伪造offset/digest/空字段拒绝；旧MD、text-only PDF、带图像旧PDF固定golden不变；旧补检查与新重选策略分叉；半页失败、取消、迟到结果零采用。可在同一唯一编号内分子场景，但不能导入CLI访问用户数据库。完整命令固定为Node24 `--import tsx --test --test-name-pattern='^NI-PDF(?:16|17):' tests/unit/novel-import-pdf-source-text.test.ts`；既有相关回归仍按下节，不扩大suite。

## 拟改范围及串行所有权

- 新`desktop/main/novel-import-pdf-source-text.ts`：受限只读字体证据、逐字形对应与窄解码，不访问模型/应用数据。
- `desktop/main/novel-import-pdf-engine.ts`：在既有worker准入/诊断封口和字节预算内接入；保留所有图像/资源/源身份失败阻断。
- PDF shared/core检查台账及审计必要的可选策略字段；原字段缺失时scope/plan逐字不变。与预算/语义controller组合必须单owner串行，不在此补丁重写它们。
- 必要的worker依赖/资源profile/包入口验证：pdf-lib已有生产依赖，实际生成manifest会纳入worker引用，不能临时从repo回退。原201项CMap/字体库字节不改。

当前PDF-BR01/02和LB-CR01修复及独立code review先完成，主代理冻结基线后再取得修改权；21语义方案同样不得覆盖此增量。

## 限定定向用例

新增唯一编号，允许表驱动子情形，不运行全套：

| 精确名称/文件 | 必要断言 |
| --- | --- |
| `NI-PDF16: source-proven GBK glyph decoding preserves explicit Unicode and every other character` / 新`tests/unit/novel-import-pdf-source-text.test.ts` | 合成Type0 GBK-EUC-H无ToUnicode+A1AD原码→仅目标字形2026；同原码显式ToUnicode→22EF保持；非GBK/混合资源/嵌套Form/继承资源/循环与资源上限；bidi/重排/多码位/空白/首中尾/emoji；对应无法证明时不得猜位置，原PDF字节和原PNG不改；无候选时零字符变更 |
| `NI-PDF17: decoded PDF ledgers bind the policy without rewriting legacy checkpoints` / 同上 | 实际新worker输出文字、范围/拼接/源hash/校正证明与ledger/sourceKey/授权一致；改变策略/证明不能复用token；旧无字段MD/PDF计划/台账/已发布读取不补值不迁移；失败/取消/迟到结果零采用 |

回归仅现有NI-PDF01/02/07/09/10/14/15的直接边界，必须明确`.ts`绑定或真实最终CJS包，不能默认拾旧dist。确切Node24单文件/名称命令在审核中固定；NI15仍只选独立包用例，不运行其他打包suite。

真实重测：重新从同原件新建不可覆盖的production-v3提取证据；全178页与事前pypdf非空白内容必须逐字符一致，269个源编码点各有原码证明，不接受全局替换后的比较。再次视觉核验89/178 PNG不变/可读。再形成事前生产表示映射，进入RB-PDF01原生cover核对和RB-L01完整AI/十二类/两线/发布/语义/重开验收；此窄修复不代替整本测试。
