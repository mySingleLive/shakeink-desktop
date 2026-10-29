# PDF源字形编码保真方案与用例独立审核

日期：2026-10-26。审核者：独立子代理 `remaining_books_oracle`。本轮只读审核25、指定PDF源/依赖API及隔离输入证据；仅新增本报告，不改生产代码、原PDF、oracle、journal、已有方案或测试。没有运行测试、worker提取、应用/CUA、模型或数据库。执行了现有两份JSON的独立逐页比较及pypdf只读ContentStream/字体元数据核验；这属于输入调查，不是新生产解析器或正式流程通过。

**当前最终结论：25技术方案PASS；NI-PDF16/17定向用例方案PASS。** 最新禁用名哨兵增量绑定25 SHA `c11590c641dcf839211dfa494f0da225161aecaabb7a1773d7270307069b77a1`，理由见末节。下列FAIL及此前PASS为各阶段的历史结论；当前无剩余本范围方案阻断。没有生产实现或测试执行通过声明。

## 初审分开结论（历史）

- **25技术方案：FAIL，暂不通过。** 窄修复目标、禁止全局替换和历史兼容方向成立；下述ST01–ST03需要在方案中闭环后才能编码。不是要求更换PDF库、放宽既有原文保真要求或改原件。
- **拟NI-PDF16/17用例：FAIL，暂不通过。** 已有正反例方向正确，但资源证明的解析前窗口、映射歧义的明确结果、无图像PDF的策略审计尚无具体断言。补入同两编号即可，不扩大测试suite。

本审核不重审仍由另一代理处理的PDF-BR02 metadata admission或预算代码，不批准合并编码；该修复及组合基线冻结仍是25既定前置。

审核的25 SHA-256为 `9ccda534d62bb76f43d20dd564464203e6e4ac595706d3bf65665aedd39ab62c`。CodeGraph工具未暴露，直接读取已指定源文件和锁定依赖，未初始化/改动索引。

## 独立输入复核

只读取用户隔离目录中的 `输入核验/L01-production-pdf-v2.json`、`L01-pages.json` 以及manifest指定原PDF；全文不写repo、不输出原文片段。

| 项目 | 本轮独立结果 |
| --- | --- |
| 原PDF SHA-256 | 读取前后均为 `fb1a231fc2cf94f38412566ad200d0a6d245ca92cdb6bae565e5329b462e9598` |
| v2证据JSON SHA-256 | `5d984be0a7c229e355c4a8d18ae658a42175e735000e8fbfa67f69e5c6428ab9` |
| 事前逐页JSON SHA-256 | `d6763cbba8d567a466a68d857a49e56ea3371fd34819f2e79fbe0609e8676f32` |
| 页/字符/提取文字hash | 两证据均178页；生产表示123760个UTF-16 code units；UTF-8 SHA `c728d4a96c55a4b4b97fb0e7b8a1bd0b0f5462f214916501bc4d535d4abb8ee3` |
| 逐页比较 | 按生产页UTF-16 offset切片后仅去空白：171页精确，所有页非空白长度相同；全部差异只有269对U+2026→U+22EF |
| 差异分布 | 页3=135、页4=124；页40/46/92/121/172各2；其他页无非空白差异 |
| 原始文字操作数 | 只读解析上述7页Tj/TJ等文字操作数：A1AD出现次数分别135/124/2/2/2/2/2；这些页所有Font资源均Type0、GBK-EUC-H且原字典无ToUnicode；GBK解码A1AD为U+2026 |

以上元数据和次数再次支持25的源编码调查，**没有执行候选helper的逐glyph定位**，不能把数量相等当作未来映射算法已经通过。v2证据还绑定当时engine SHA `1bb12511bb30d11a6bb0fbc5120a8d538257002cc33ef38e3d9bc74930033c0b`；本轮读取的工作树engine为 `bad0c316eaf923976ab9a2db4538432affd51271b1fe8f5dac08b678629d0ef5`，两者不同，不把v2结果宣称为当前或未来代码重测。

原16只允许必要空白差异，269个码位差异仍不符合该条件。不得改oracle、以Unicode别名容忍使旧结果通过，也不得把A1AD调查直接解释成“所有22EF均可替换”。

## 已核实的API可行部分

| 只读源码依据 | 可确认的边界 |
| --- | --- |
| `pdf-lib` 1.17.1，`cjs/utils/arrays.js:118–130` | `PDFDocument.load(Uint8Array)`的toUint8Array分支返回原输入，不必再取pdf.getData或复制整文件；在PDF.js接管前读取同buffer可行。应明确 `updateMetadata:false`、严格无修复读取及不调用save/draw/normalize |
| `pdfjs-dist/legacy/build/pdf.worker.mjs:32429–32438,34818–34911` | Glyph有originalCharCode/unicode；charsToGlyphs先由CMap读原charcode，再构造Glyph。originalCharCode可用于判别原码A1AD，不能用fontChar替代它 |
| 同worker `40839–40849,41417–41451` | handleText返回glyph；TJ/单引号等文字操作被归并为OPS.showText，args中还可有数值字距。可以读取真实operator glyph，但必须处理这些操作/状态，不能只搜Tj或将args全部当字符 |
| 同worker `42006–42023,42190–42222,42243–42263` | getTextContent即使disableNormalization也会bidi；会过滤不可见格式标记、处理空白/位置并合并文本。不能认为其str天然与原operator按index对应 |
| 当前 `novel-import-pdf-engine.ts` | 已有operators、getTextContent、逐页文字append和诊断封口，窄解码有明确接点。必须在最终pageText、进度及ledger建立前完成；失败不能留下“已校正且可用”的部分台账 |

这里确认信息可获取，并不证明25第3步描述的“一一对应”已具体实现或对任意PDF成立。

## ST01 · P1 · 解析前预算与完整资源证明必须落实到具体API

25第2步只说限深度/对象数/资源数，但还未给定数值、解析前检查位置和超限结果；不能依靠后续资源遍历限额替代pdf-lib.load自身的工作界限。

具体依据：`PDFDocument.load`在 `cjs/api/PDFDocument.js:121–130` 先完整parseDocument，才返回可供字体遍历的文档；该API没有AbortSignal、对象总量或解压字节上限参数。ObjStm路径在 `PDFObjectStreamParser.js` 构造时调用 `ByteStream.fromPDFRawStream`，后者直接decode整个流；`DecodeStream.js:125–144` 持续readBlock并倍增Uint8Array，没有maxOutputLength。**在load返回后数资源，已经晚于这部分解压分配。** worker时间/JS堆限制不能表述成ArrayBuffer解压预算或循环可取消边界。此为25新增证明流程的资源问题，与另审的主进程FS准入不同。

另外，`PDFDocument.getPages()`内部调用未限环的Pages.traverse（`PDFDocument.js:26–28`）；`page.node.Resources()`内部getInheritableAttribute→ascend同样无访问集（`PDFPageLeaf.js:45–47,61–67,136–140`）。直接调用这些便捷API后再设置自己的visited/depth，无法兑现Parent/Kids恶意环的承诺。`PDFDict.has(ToUnicode)`及默认get还把显式PDFNull当缺失（`PDFDict.js:28–40`），不等于“原字典确实没有该键”。

最小修订要求：

1. 指定pdf-lib只读load选项、解析阶段可执行的受限/拒绝子集方案，以及数值化的页树/Parent/资源深度、总访问对象、字体、glyph/证明字节和解压/ObjStm预算；不能只写“worker限制”。若锁定API无法在分配前可靠限制某路径，明确拒绝该结构并给可验证的准入方式，而不是load后才检查。无需为此增加通用PDF功能。
2. 使用带visited及上限的原始字典/引用遍历，或先在受限路径证明页树/Parent链无环，再使用便捷API；原ToUnicode键存在性保留PDFNull/错误引用，不把无效显式键当“缺失”。资源证明必须是closed/eligible/ineligible/incomplete的明确结果。
3. 列出资源闭包：继承Resources、Form/Pattern自身资源/回退、ExtGState的Font与SMask/Group等会执行的字体来源，以及annotation/AP、Type3等不支持结构的明确排除/拒绝策略。可以保守拒绝，不必实现全部PDF特性；不能用“等”省略后声称全部相关字体eligible。
4. 所有解析/资源诊断沿现有封闭诊断收集器，取消/超时归原registry且实际退出后才settle；不能因证明失败而悄悄启用校正，也不能新造整文件快照。

NI-PDF16需在**load/页树便捷API之前**覆盖ObjStm膨胀、Parent/Kids环、深层/超量资源、显式ToUnicode=null/错误引用，以及闭包中的非eligible字体。相应结果必须区分“正常ineligible保持原字符”与“证明不完整/超预算导致阻断”，不能以崩溃/最终超时冒充有界证明通过。

## ST02 · P1 · 字形到TextItem的映射还需可执行的接受子集与拒绝规则

25第3步同时提到“顺序、字符多重集、一一非空白序列”，却未定义接受算法、字体来源对应与bidi/过滤后的拒绝条件。多重集相等只能证明数量，不能定位；序列比较也必须说明逐glyph如何展开到Unicode scalar、如何映射回每个TextItem的UTF-16位置，以及重复字符/非显示glyph等歧义怎样排除。锁定API没有给TextItem输出operator/glyph身份或bidi位置映射；不能从最终str位置反推已证明身份。

最小修订不是要求重建通用PDF排版器。可以明确仅接受一个可证明的窄子集，例如单码位候选、完整非空白序列逐项相等且所有候选来源均无歧义，其他bidi/vertical/过滤/重排情形失败关闭。方案至少要固定：

- 完整的showText/TJ/引号、数值字距、save/restore、setFont/ExtGState字体与嵌套Form对应处理；如果以“全部资源字体eligible”替代逐font ID关联，须证明该闭包确实覆盖实际执行glyph。
- 对TextItem.dir、vertical、多码位glyph、隐形/零宽/被位置过滤文字、重复unicode但不同originalCharCode、annotation/pattern中额外文字分别规定：安全接受、原样不校正或候选页阻断。render/提取的annotation范围不同不能漏入一一对应判断。
- 在不改item.str任何空白的前提下建立Unicode scalar→UTF-16 offset映射；只改已证明单字形 `originalCharCode===0xA1AD && unicode==='\u22ef'` 的位置，其他22EF及其他字符保持。任何候选无法证明时该页阻断，不能部分修改后返回可用全文。
- 按流式/有界方式核对序列，给glyph累计数/证明计算上限与取消检查，不为每页/整书额外保留无限数组或全量glyph journal。

NI-PDF16目前罗列“bidi/重排/多码位/emoji”但未给每项期望；应明确每个正/反例究竟保持原字符、校正指定位置还是阻断，并包含重复同unicode不同原码、RTL/不可见格式标记、ExtGState字体、Form独立Resources与annotation文字的歧义反例。禁止测试把非空白多重集相等作为通过条件。L01的数量统计只能作为真实正例，不能代替这些反例。

## ST03 · P1 · 无图像PDF的校正策略也必须进入指纹与审计

25第5/6步方向正确，但需点明现有集成筛选，否则只扩展图像页台账会漏掉纯文字PDF：当前 `desktop/core/novel-import-pdf.ts` 的pdfReviewScope只选imagePageCount/blocker/页决定，pdfReviewAudit只选imagePageCount；`publicationRecord`只在该audit存在时保存PDF审计。一个没有图像、确实发生A1AD校正的有效PDF不会进入这些分支。文件textHash能绑定最终文字，不能单独绑定“相同文字采用了什么策略/证明”。

最小修订要求：

1. 明确新的可选policy/proof严格schema、版本、canonical证明hash输入及大小上限，并列出shared、pdf core、scope/plan及publish/read-record的具体增量接点。证明应绑定sourceHash、页/资源闭包证明、候选/实际变更数量、前后文字hash及逐点对应摘要；不能只散存一个不可复核的count或给renderer任意政策参数。
2. 实际发生校正时，**无图像PDF也进入策略scope/plan/审计分支**；改变policy或proof但保持最终文字相同，仍使相关指纹不同。台账/hash校验及预览token不得接受混搭证明；无校正、旧无字段记录继续完全缺省，不添加 `[]`/默认policy。
3. 明确新choose/reselect与旧session恢复/旧PDF补检查的内部策略选择。缺字段的旧材料沿历史表示，不能把新helper作为所有inspect默认而在恢复检查时改旧file.text/workingProse/coverage；需要新语义必须经合法重选、失效和新授权，发布冻结计划/回执不迁移。

NI-PDF17需增加“无图像但实际校正”的scope、plan及真实发布审计正例；同最终文字、不同policy/proof的冲突反例；旧MD、纯文本PDF、带图像旧PDF的固定golden hash/plan/receipt/读取表示；旧PDF补检查与新重选策略分叉；伪造证明字段、空数组/默认值、半页校正失败、取消/迟到结果零采用。已有NI-PDF10可只跑相关事务边界，不把完整发布suite带进来。

## 保留通过方向与后续最小验证范围

同一已准入worker/同一源Uint8Array、禁止pdf.getData/save、只依据原字体字典而非生成的toUnicode、仅A1AD/22EF窄转换、不改渲染和CMap、全部其他字符严格相同，这些边界成立。当前可用API使**受限实现有可行路径**；本审核没有证明任意PDF的一般对应算法可行。

25修订ST01–ST03并将上述断言补入NI-PDF16/17后，再独立复审；本轮不开始TDD。最终新测试命令可固定为（文件尚未实现，**本轮未运行**）：

```sh
/Users/dt_flys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --import tsx --test --test-name-pattern='^NI-PDF(?:16|17):' tests/unit/novel-import-pdf-source-text.test.ts
```

新增worker路径须显式绑定源码.ts或最终冻结CJS，不能自动拾旧dist；直接回归仍仅25列出的NI-PDF01/02/07/09/10/14/15相关名称，包内pdf-lib/CMap资源仅其独立包用例，不运行全套。

修复后另存production-v3证据，逐页全部非空白字符与事前基线精确相同、269点各有实际新helper证明，原PDF/hash不变，并以相同渲染条件独立核对PNG未改；不能用“全局替换后比较相等”完成验收。该组件成功仍不是RB-L01的真实UI、AI、十二类/两线、20回语义、发布及重开通过。

## ST01–ST03 增量复审

同日只读复审25新增的优先收敛节，SHA-256为 `a292f6320f0f9cabbc7e169aa89740b64ba7229e64b4db910a10edc1dbfe08c3`。本次没有重读原件/真实输入、执行测试、worker、数据库、模型或界面；仅核对方案与锁定库源码。初审内容保留为历史。

| 初审项 | 增量结论 |
| --- | --- |
| ST01解析前解压、图遍历与闭包 | 大部分关闭：8MiB输入、Name/obj计数、#xx解码、load前拒ObjStm/XRef/Encrypt、解压预算0、load spy；raw dictionary自有visited/depth/引用/字体/资源限额；保留PDFNull；支持与incomplete资源边界、四态及取消点已具体化。但下面ST01-R的零复制事实需修订 |
| ST02字形映射 | 关闭：将所有目标限定为单scalar22EF且原码一致A1AD，其他原码同unicode或多scalar目标直接阻断。全部非空白scalar顺序完全相同后才映射TextItem UTF-16位置，保留空白/EOL；LTR/状态栈/文字模式/Format控制符/过滤重排与上限各有拒绝条件。重复同质目标不会误改另一种原码；不需要反向猜bidi位置 |
| ST03策略/审计/旧表示 | 关闭：严格可选sourceTextDecoding及source/closure/序列/前后文字/proof hash，offset正向与inverse digest检查；纯文本校正也进入scope/plan/发布审计；read-record仅摘要。旧恢复/补检查走legacy，text不同保旧阻断，仅新合法重选采用新策略；无候选不加字段。NI17固定golden及实际隔离事务正反例已明确 |

### ST01-R · P1 · 普通Uint8Array的raw stream仍会复制

这是唯一剩余阻断，不要求扩大方案为通用PDF解析器。25新节称普通raw stream“不调用decode/getContents，仅保留源buffer view”，但锁定pdf-lib 1.17.1真实调用链为：

- `cjs/core/parser/PDFObjectParser.js:197`：`var contents = this.bytes.slice(start, end)`，在load解析阶段就执行，并不需要业务调用getContents。
- `cjs/core/parser/ByteStream.js:51–53`：转调底层 `this.bytes.slice(start,end)`。
- 普通Uint8Array的slice会分配副本。因此直接 `PDFDocument.load(bytes,...)` 即使拒绝所有ObjStm/XRef，仍会复制每个普通raw stream，不能按当前方案声称只有原buffer view；事后资源遍历无法防止这次分配。

同轮再次核对 `PDFParser.js:139–149`：自动stream解码分支确实只有Type ObjStm/XRef，完整Name预检对其采用0解压子集的方向成立；本剩余项是raw bytes复制而非发现另一条自动decode。

最小可行修订：主进程传入worker的同一精确Uint8Array上，建立 `Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)` 的**别名视图**后交给pdf-lib；`utils/arrays.js:118–130`会保留该Buffer对象，ByteStream的slice因此按Buffer.slice语义保留同一底层内存。不得用 `Buffer.from(bytes)`、`Uint8Array.from`、`.slice()`预复制输入；别名不得超出原byteOffset/byteLength。Node本地类型文档 `@types/node/buffer.buffer.d.ts:64–105,360–392`分别说明ArrayBuffer形式from及Buffer.slice共享内存。无需改node_modules或增加依赖。

NI-PDF16须追加实际raw-stream解析正例，断言load拿到别名、raw stream.contents的buffer与原输入buffer相同且byteOffset/byteLength落在原范围；带非零byteOffset输入验证不夹带前后邻接数据，并用spy防止路径退回复制形式。原source字节仍逐字相同。可以改选明确受限且有计账的复制预算，但那需要准确撤回view/零复制声明，并在load前证明预算，不能仅保留当前文字。

截至本次增量：**技术仍FAIL、NI-PDF16/17用例整体仍FAIL，仅剩ST01-R；ST02/ST03无剩余阻断。** 修订该buffer接点及对应断言即可做一次窄复审，不需重做已关闭条目。这里仍无生产实现或测试通过结论。

## ST01-R 最终增量复审与分别结论

同日只读核对25对唯一剩余项的修订，最终25 SHA-256：`3fba3e507ae3983ecf53862296b315e51a3f1eab37ce64ce5ccceb436f3e0710`。未执行任何代码试验或测试，未读写原件、journal、用户数据库、模型或界面；本次只修改28。

**ST01-R关闭。** 25现在明确：通过预检后以 `Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)` 建立精确范围别名再传load；禁止Buffer.from(bytes)/Uint8Array.from等源复制形式；不把Uint8Array.slice误称view；证明结束释放文档/别名引用，原Uint8Array再交PDF.js；如果发现别的自动decode/copy路径须继续收紧子集。NI16同步规定load spy和真实raw-stream底层buffer身份断言。

本次再次核对锁定库：toUint8Array保留Buffer；PDFObjectParser→ByteStream.slice→Buffer.slice确实能够在不修改node_modules的情况下保留同一ArrayBuffer。范围由原byteOffset/byteLength限定，不能用整个底层buffer代替原视图；实际测试需按此契约核对raw-stream buffer身份、范围及输入字节不变。load的自动decode分支仍为已预检排除的ObjStm/XRef，updateMetadata:false使构造阶段不执行默认元数据更新。没有发现需要再扩大本方案的剩余必须修订项。

其余已关闭条件保持：

- ST01：8MiB及Name/obj/图遍历/引用/字体/证明的数值限额、完整#xx解码后load前拒绝自动解压结构、raw字典受限遍历/PDFNull、资源闭包四态和不支持结构阻断。
- ST02：LTR普通文字、同质A1AD目标、全scalar顺序匹配后映射UTF-16位置，不以数量/多重集猜测；其他原码、多scalar目标、格式控制/重排/无法证明情形阻断，所有空白/EOL保留，页内原子采用。
- ST03：仅实际变化保存严格可选policy/proof，绑定源/closure/前后页摘要/offset/序列；按每个pages项的完整pageText核验after摘要及inverse before摘要，整书拼接另由既有页范围/ledger覆盖验证。纯文字校正也进入scope/plan/审计，旧无字段/legacy补检查不迁移，新语义必须合法重选和重新授权。

**分别审核结果：**

| 范围 | 最终结论 | 含义 |
| --- | --- | --- |
| 25受限源字形解码技术方案 | **PASS** | ST01/ST02/ST03及ST01-R均关闭；可按已冻结组合基线进行该窄增量的TDD，不许可扩大为通用重排、全局Unicode替换或改原PDF |
| NI-PDF16/17定向用例方案 | **PASS** | 接受/保持/阻断结果、解析前load spy、buffer身份、无图像审计/隔离事务、legacy golden和取消/迟到零采用足够具体；仅批准这两编号及25明确的直接回归范围，尚未执行 |

只读看到26预算及27后端报告已各有最终PASS；本28不复跑或代签其代码结论。实施仍须遵循主代理冻结/单owner组合，红绿证据及独立代码审核；随后重新取得production-v3逐页/269点证明、相同渲染条件PNG保真及真实RB-PDF01/RB-L01证据。此PASS只解除技术与用例阶段门，不代表decoder已实现、码位差异已修复、原L01导入或模型/发布/语义验收通过。

## 二进制长段的危险Name精确匹配：最小预检修订复审

同日只读复审25的最小预检增量，SHA-256：`4954ea9fcccecbca66a8aa4be313a55aa6339305465a3d9131bb71bce48d62bd`。主代理报告旧全字节Name128预检在原L01普通二进制流随机斜线后的长段上保守误拒（names291/obj62、load0、原hash不变）；本次没有重读原件或复现实测，也没有运行v3、测试、worker、数据库、模型或界面。只核对方案及锁定pdf-lib的Name/parseName/自动解码分支，仅修改28。

**技术增量PASS，NI-PDF16对应增量PASS；NI-PDF17与其余已批准范围保持PASS。** 理由与实施必须遵循的解释如下：

1. 三个完整危险名为ObjStm（6字节）、XRef（4字节）、Encrypt（7字节）。匹配器最多保存7个解码字节；一旦完整解码长度大于7，便不可能精确等于其中任何一个。此时丢弃匹配内容但保持“已超长”状态，继续向前消费完整原始Name，不截断后再做前缀比较，也不在长段中重置为新Name。完整名字结束后才判断危险名，故危险名前后附字符不被误拒，独立危险名仍被拒绝。
2. 原始PDF delimiter/空白决定Name终止；`#xx`按原有规则完整验证和消费，包括大小写/逐字符转义，解码出的分隔符仍属于该Name的值，不能被当作原始边界重新起词。超过7字节后仍须验证后续escape，不能为长二进制段跳过验证。锁定pdf-lib的parseName按原始分隔符终止，PDFName.of解码名称后再做精确身份比较，没有将普通长名字的危险前缀视作Type值的语义。预检解码比锁定库更保守的合法转义拒绝不形成漏检许可。
3. 仍扫描全体原字节，不跳stream、不寻找伪造endstream边界；8MiB总输入/处理预算、100000个Name起点、20000个obj关键词、处理让出点和词法不完整拒绝均保留。不分配长名字数组，不把整文件转字符串，也不以“非危险”结果跳过其余原字节。因此零ObjStm/XRef自动解压准入未放宽；其他异常仍按原四态处理，不采用备用解析器。
4. 128字节限制移至真实字体资源Name的受限遍历；这准确区分了全字节保守哨兵与业务字体元数据约束。pdf-lib内部普通名称字符串可能分配，现文档已承认其受8MiB输入及既有worker限制，而非声称Name字符串零分配。Buffer精确别名/raw-stream共享底层内存、严格load选项、资源闭包、同质glyph证明与legacy指纹规则均未变化。

NI-PDF16已要求补长非危险Name、危险名全转义/大小写/完整边界、前后缀不误报以及总扫描限额反例。实施用例应以同一匹配器验证：大于128字节的非危险长段只消耗既定总量预算；完整危险名无论转义与否仍在load前被拒且load调用为0；危险前后缀不因7字节截断误报；超长后出现不完整escape仍失败；Name数/obj数/8MiB边界不能借长段绕过。无须新增测试编号或扩大suite。

本次PASS仅批准上述预检契约与其定向断言，不代签正在实施的typed proof/legacy代码，也不授权其他实现owner私改该预检。旧保守误拒保留为真实失败证据；production-v3尚未执行，不能以方案通过声明原L01现在已通过预检、269点校正、PNG核对或完整导入。

## 禁用名哨兵中的非法#字面：最小增量复审

同日只读复审25新增的非法转义处理说明，SHA-256：`c11590c641dcf839211dfa494f0da225161aecaabb7a1773d7270307069b77a1`。主代理报告旧全字节哨兵把普通二进制数据210处非双hex的#当作词法错误；本次不重新读取原件、不复现该计数、不运行v3或测试，仅核对锁定源码并更新28。

**本次技术与NI-PDF16增量均PASS；NI-PDF17保持PASS。** 这取代上一轮“全字节哨兵遇不完整escape必须失败”的特定断言，未取消真正资源Name的严格格式/128字节规则，也未改变其他词法/预算失败边界。

锁定API依据是 `PDFObjectParser.js` 的parseName只按原始delimiter/空白读取字符串，然后交PDFName.of；`PDFName.js:9–10` 的decodeName只对 `/#([\dABCDEF]{2})/g` 作一次replace。无法匹配该规则的#保留字面，生成的#不再递归处理。`PDFParser.js:139–149`自动解压时比较的是原解析PDFName对象与固定ObjStm/XRef常量，并没有再次对其decodeText后调用PDFName.of。因此含保留字面#的完整名字不能等于不含#的危险名，不需要用无关二进制片段的完整语法有效性作为该哨兵准入条件。

批准的安全条件及对应NI16断言为：

- 非双hex的#只消费该**单个字面字节**并使当前Name匹配状态永久非危险，继续消费当前完整raw Name。不能吞掉其后可能为delimiter的字节，不能重置匹配或跳到流尾。例如非法#后紧邻下一个 `/ObjStm` 时，后一个独立Name仍须被识别并在load前拒绝。
- 有效#xx仍完整消费/解码；编码出的slash、空白等是Name值的一部分，不是raw边界。`#23`生成#仅处理一次，不能再把后续字符当第二轮转义。对锁定库未识别的合法大小写转义采取更保守拒绝可以接受；任何锁定库实际识别为完整危险名的转义组合均不得漏拒。
- 完整名字在raw delimiter或EOF终止后才精确判断；非法#、尾部#或#加单个hex均按该哨兵字面规则处理，危险名前后缀仍不因截断被误拒。真正资源Name的结构校验在后续受限遍历独立执行，不能把本哨兵的非危险结果当字体eligible证明。
- 全字节扫描不跳stream、不重新猜测边界；8MiB、Name起点100000、obj20000、固定scratch及7解码字节保存上限、让出点、0自动解压和Buffer精确别名均不变。非危险长段仍消耗总扫描/Name预算，不能因出现非法#跳过后续独立Name。

NI16现在包括非法#字面/EOF、#23非递归、编码delimiter、所有危险名合法转义和相邻边界，并要求实测库的Type身份判定与哨兵无漏拒、load spy保持危险入口load0；这些断言足以审核该最小修订。无需新测试编号、OCR能力、替代解析器或扩大字体/Unicode证明。

本次只解除这一哨兵修订的技术/用例阶段门，不代签其实现或正在进行的typed proof/legacy改动。原L01旧失败保留，production-v3仍未执行，未确认新的预检、269点修复、PNG或整本导入成功。
