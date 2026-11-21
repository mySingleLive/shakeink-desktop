# PDF来源编码实现独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据25及28最终批准的受限方案/两次Name哨兵增补，读取实施摘要、冻结SHA、相关生产源及测试。只写本报告与独立定向日志，未修改生产代码、测试、原件或真实journal；没有运行真实模型、用户数据库、CUA、应用或原小说组件提取。

**最终结论：PASS。** 初审发现一项P1（ST-CR01：锁定库宽松对象头可绕过前置对象预算），已先报告主代理，由唯一实现owner修复。本轮独立增量核对及两组允许的定向验证通过；本范围没有剩余必须修订的P1/P2。PASS只针对下列最终冻结实现和定向断言，不代表NI-PDF15安装包、production-v3、原生UI或RB-L01真实模型/语义/发布全流程通过。

## 审核范围与独立性

初始12文件与 `evidence/pdf-source-text-final-sha.txt` 逐项相同；读取 `pdf-source-text-final-green.txt` 和 `pdf-source-text-implementation-summary.txt` 作为交付说明，未把其结果当独立执行。CodeGraph工具未暴露，直接读取指定文件和锁定pdf-lib/PDF.js源码；没有初始化索引或改生产依赖。

本轮唯一额外调用的测试为主代理授权的两个精确Node24名称过滤命令，初审与修复后各执行一次；没有运行全文件/全suite、全仓typecheck、完整浏览器/打包回归或其他名字。NI17/NI10中的实际PGlite仅使用测试临时目录的隔离合成作品，不读取用户DB。

## ST-CR01 · P1 · 初审发现及关闭

初始helper SHA `78a31dac3ffde23c7b9f6ae31c4db41bbd99d5d23d1ae28d12efdf58812401c4` 中，preflight只在原始obj的前后都是delimiter时计数。锁定 `pdf-lib/cjs/core/parser/PDFParser.js:103–113` 在generationNumber之后可零宽skipWhitespaceAndComments，再matchKeyword(obj)；后者也无关键词后界要求。因此 `1 0obj`、`1 0objnull` 等仍被库识别为对象头，超过20000项却可不进入原计数。load后资源图限额不能补偿load前的预算缺口。

已先向主代理报告，并与实现owner `source_picker_backend` 直接核对该事实。实现owner只修改helper及原NI16测试，保留原证据，新增的RED日志明确记录旧gate对超限紧贴头返回closed而非budget：[object-budget-red](evidence/pdf-source-text-object-budget-red.txt)。本审核未自行在旧源上运行额外probe；后续独立执行了其真实库正例和修复后的全部获准测试。

**关闭依据：** 最终helper在同一原始字节遍历中，对顶层当前位置和每个Name循环推进的位置检查全部原始小写obj子串，不依赖前后界；Name、stream及endobj也保守计数，明确这不是“实际PDF对象数量”。每个原位置检查一次；唯一跳过的有效#xx两位hex不可能含原始o，因此不会遗漏obj起点。仍为8MiB输入的一遍扫描、64KiB让出点、固定7字节危险名匹配，不新增全文件字符串/字节副本，不扩大危险Name准入。

新增NI16用实际 `PDFDocument.load` 解析三个紧贴头对象，证明库确实接受该语法；标准/紧贴/注释/Name内部/stream内部/endobj各类超20000原始出现均在20001处budget且load spy为0，单次出现边界不重复计数。独立最终11/11通过。最终helper SHA为 `9b8a7c0ed93b9e7c974a582c5e1c00893ec34123fb18a769c42f6f3d23f0d9c3`，ST-CR01关闭。

## 其余重点审查

| 范围 | 源文件依据与结论 |
| --- | --- |
| 全字节前置准入 | `desktop/main/novel-import-pdf-source-text.ts`先限8MiB，再计Name起点/原始obj、消费全部原字节。危险名仅保存7个解码字节，完整Name结束后精确匹配ObjStm/XRef/Encrypt；长段不重起伪边界。非法#只字面消费并使该Name非危险，后续独立Name不跳过；有效#xx一次处理、编码delimiter不作raw边界、#23不递归。NI16核对锁定库身份、危险名转义/前后缀、长段、EOF及load0。没有跳stream或放开零ObjStm/XRef自动解压边界 |
| Buffer与库读取 | 预检后建立精确 `Buffer.from(bytes.buffer,byteOffset,byteLength)` 别名，load固定updateMetadata:false/ignoreEncryption:false/throwOnInvalidObject:true/Slow；禁止的便利API/decoded contents/save/normalize/pdf.getData未使用。锁定库ByteStream.slice在Buffer输入下保留view。NI16实际解析raw stream并检查底层buffer、非零offset范围及原字节hash，不只检查load入参类型 |
| 原始资源闭包 | 原PDFDict/PDFArray/PDFRef遍历自有visited、Parent/Kids/资源深度与全局20000计账；PDFNull和坏引用不当缺失。继承、Form独立/回退Resources和ExtGState.Font均核对；Pattern/SMask/Annots/Type3/未知执行资源按批准边界incomplete。ToUnicode或非GBK为正常ineligible且保持原输出；无原始ToUnicode、固定Type0/GBK及未嵌入前提全部成立才eligible |
| 字体memo与预算 | fontCache为当前只读pdf-lib文档内的WeakMap，只有完整验证结束才记eligible/ineligible；相同不可变PDFDict复用其已验证证明，仍经过本页资源计账/引用resolve。不同字体不共享缓存，fonts独立限4096；失败不缓存为eligible。全局tick在lookup前检查，耗尽后后续页只写budget结果、不再查询资源；2500页夹具断言lookups恰为20000。不是以memo降低证明覆盖 |
| 完整glyph对应 | 使用实际OPS.showText（TJ/引号已由PDF.js归并）并忽略数值字距；跟踪font、save/restore、Form、GState、支持的文字模式，未知状态/控制字符/双向或vertical/顺序与数量异常阻断。真实commonObjs验证font存在，解决styles不含纯空白font的情况，未按特定文件/页/字体名放行。只有全部单scalar22EF都来自A1AD的同质候选集才可能校正；混入其他原码或多scalar目标一律无proof |
| UTF-16与页内原子性 | 全部非布局scalar逐序相同后才按TextItem实际UTF-16长度定位，str与EOL/附加空格保留。原码22EF与目标2026各占一个UTF-16单元，其他字符/emoji不变；NI16固定emoji前后offset。helper失败返回原text、不附proof；engine先检查proof字节预算后才替换pageText并入账，部分页不能半改半成功 |
| 封口、失败与取消 | 源证明在PDF.js接管同buffer前计算，文字校正在诊断/渲染检查后、append/最终ledger前；预览任务仍使用原PDF字形、没有调用校正。文档级迟到诊断会逆置先前改点并删除sourceProofs；页/预算失败使整个来源不可发送。progress刻意保留未校正页文字，worker失败/timeout的partial ledger不能携带无完整证明的校正片段。registry取消仍需实际worker退出/FS settle，迟到proof不进入会话；NI17与NI14分别覆盖 |
| 逆向证明与存储验证 | core严格schema限定policy/sourceHash、页序、范围、64KiB/128页/4096点、每页2048点、hex摘要、递增唯一offset。final[offset]必须为2026，按offset逆置22EF后核对before UTF-8 hash，最终页核对after hash；candidateCount与offset数一致，proofHash与ledgerHash/source identity一致。检查2026本身也排除了半个surrogate的位置。原资源/glyph证明来自可信worker，renderer无提交/选择policy通道 |
| 纯文本审计/同请求 | 无图像但实际有sourceTextDecoding也进入pdfReviewScope、scope/plan、pdfReviewAudit及事务publicationRecord。相同最终文字而证明变化仍变更sourceKey/授权/计划，旧token不跨ledger。实际隔离PGlite NI17核对私有完整证明、章节拼接、同请求幂等及不同证明REQUEST_CONFLICT；公开FileView/read-record只投影policy/页数/改点数，无proof全文、offset、路径或PNG |
| legacy不改旧正文 | 旧无ledger补检查明确传legacy，只在临时结果text/pages与旧表示精确相同时补账；不同则保留旧file.text/units/workingProse/workingUnits/coverage/checkpoint，投影sourceInvalidated并要求重选。新choose/reselect才采用current并按既有invalidate重授权。旧MD、纯文本PDF、带图像PDF的golden scope/plan不补空字段或默认policy；旧已发布记录仅按既有表示读取/回执校验 |

本轮没有发现需要扩大为Unicode别名容忍、改原渲染/字体库或改真实oracle的理由。校正成立依赖原码与字体闭包证明，不能把“看起来相同的省略点”当替换规则。

## 独立执行的精确定向命令

执行路径为 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`，两组均显式源码worker.ts；没有默认拾dist。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-PDF(?:16|17):' tests/unit/novel-import-pdf-source-text.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-PDF(?:01|02|07|09|10|14):' tests/unit/novel-import-pdf.test.ts tests/integration/novel-import-pdf-publish.test.ts
```

| 运行 | 独立结果 | 日志 |
| --- | --- | --- |
| 初审NI16/17（尚无ST-CR01新增反例） | exit0，10/10 pass，0 fail/cancel/skip，11.23s；绿测未覆盖初审发现，不能据此忽略P1 | [initial-16-17](evidence/pdf-source-text-independent-16-17.txt) |
| 初审直接回归 | exit0，19/19 pass，0 fail/cancel/skip，11.16s | [initial-regressions](evidence/pdf-source-text-independent-regressions.txt) |
| ST-CR01修复后NI16/17，含真实宽松对象头和前置预算负例 | **exit0，11/11 pass，0 fail/cancel/skip，11.22s** | [final-16-17](evidence/pdf-source-text-independent-final-16-17.txt) |
| 最终直接回归NI01/02/07/09/10/14（含子测试） | **exit0，19/19 pass，0 fail/cancel/skip，11.13s** | [final-regressions](evidence/pdf-source-text-independent-final-regressions.txt) |

测试覆盖真实PDF.js/Canvas、隔离控制器/registry/受控worker退出以及临时PGlite，按各自层级记录；不能将合成输入、受控AI调用计数或数据库夹具称作真实Electron/供应商/原L01全流程。

## 最终冻结SHA

初始12项全部比对相同；ST-CR01之后仅helper和NI16/17测试文件变化，其余10项保持。最终12项已独立重新计算，全部与 `evidence/pdf-source-text-object-budget-sha.txt` 相同；初始 `pdf-source-text-final-sha.txt` 保留为修复前历史，不混用。最终值如下：

```text
9b8a7c0ed93b9e7c974a582c5e1c00893ec34123fb18a769c42f6f3d23f0d9c3 desktop/main/novel-import-pdf-source-text.ts
27c5c1f9a1ac9951d00a71b0f1e9a4dd25a0008bf19c25c76b0c8e0102971841 desktop/core/novel-import-pdf-source-text.ts
7646106b347f7688d5af4cc604bca88562dd0c11d30611e6face67f2faf60410 desktop/main/novel-import-pdf-worker.ts
b591c58571ab9e311f2d9767c4479957b221be9aed1eaed5b46d97c45ba08107 desktop/main/novel-import-pdf-engine.ts
1019a064409d6c27773dffa18cf3e2c25ea07e7e84000a3f0067744f32dcc53c desktop/main/novel-import-pdf-client.ts
76d3ae60ef2308a53cb27553be0ce305a1f88517f1fc316ff776c3177412965c desktop/main/novel-import-files.ts
9ebbfac07e229a98c717a7cb5aa059420d7e1ffbd1dfab5be38091ecc8ac0d2d desktop/main/novel-import.ts
7b4eb3221d5b889db8387c073259f56f62a377c76c022e84e33cd439d2a35a41 desktop/shared/novel-import.ts
7cc93cf4cc7820d167f2432aef2c7c9de46dcd977dd21576cac4e5f4c3b9d905 desktop/core/novel-import-pdf.ts
d8a3ff88122698450052b1e121dc8fcdcfa6fde8a6627f72656a688b20274b81 desktop/core/novel-import.ts
d63d33fadd04db22c79ac1127ab8f679e607476e1f8c80ba774d2ea64861d373 desktop/service/novel-import-publish.ts
859b96904c0d529497a0982eea483a4564764d5de07fc93675c9d6d2e8c76219 tests/unit/novel-import-pdf-source-text.test.ts
```

## 最终范围

**本实现code review及上述批准定向验证PASS，ST-CR01关闭。** 代码变更使旧包字节不再对应最终helper，主代理须以本清单重新组合构建并取得NI-PDF15包内资源/完整提取等相应证据，不能复用修复前包的PASS。implementation-summary中的原书组件统计和root的UI/组件证据未被本审核转换成真实全流程结论；原L01仍须独立production-v3/269点源证明、原生逐页决定、真实AI十二类/两线、20回语义、事务发布及正常重开验收。
