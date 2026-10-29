# PDF 后端代码独立审核

日期：2026-10-26。审核者：独立子代理 `cross_platform_picker_design`。本代理实现过 renderer/store；本次仅审核另一实施代理负责的 PDF 后端、主代理集成接点与服务发布路径，不自审 renderer。依据为已批准的15技术方案、16定向用例、17独立复审；21语义方案未编码部分不纳入本次结论。

当前结论：**后端代码独立审核 PASS。PDF-BR01、PDF-BR02 两项 P1 已修复并通过增量复审；PDF-TR01–03 无剩余必须修改项。** 最终冻结版本独立定向验证为 PDF 46/46、隔离 PGlite 发布1/1、指定旧回归32/32，全部0 fail/skip、exit0。初审事实与修复记录分别保留如下；本结论不代表真实 L01、真实 Electron/Windows 或安装包资源验收通过。

## 初审发现（均已关闭，最终复审见文末）

### PDF-BR01 · P1 · 全扫描页的非排除决定无法按界面承诺保存

`desktop/main/novel-import.ts:237` 在处理任何 `set-pdf-page-decisions` 前统一拒绝 `inspection.blocker`，包括完整扫描但标记 `ocr-required` 的来源。批准的页核对界面在此状态仍允许明确选择“图像含正文或设定”或“无法确定”并保存；真实后端会返回“PDF检查或来源已失效”，而 renderer 的 NI-PDF12 合成桥允许保存，因此该用例的成功没有覆盖真实后端这一分支。

这不会让全扫描通过发送或发布门控，但会让用户可提交的已批准决定在真实流程中失败。主代理确认按批准稿修正、不降为限制：在相同 source/ledger、完整扫描及合法已知图像页前提下，允许保存 `contains-content`、`uncertain` 和契约允许的明确 `pending`；保留全扫描的 OCR blocker、禁止颁发排除 token，`validatePdfPageReviews` 继续拒绝。source-changed、document-error、unknown raster、failed、incomplete/budget 状态不得同时放宽；任何批次带 `exclude-image` 仍必须整批拒绝。

本代理未修改生产代码，已将定位与最小修正方向发给主代理。

### PDF-BR02 · P1 · 已知 PDF 的首条导入身份链 FS 早于统一准入

初审 `scanNovelSources` 对直接选中的 `.pdf` 在 `client.inspect` 准入前仍执行 grant/root 身份链与 lstat/canonicalSelection/pathIdentity。snapshot/read/verify 已在 registry 内，但15文字要求准入早于第一次 PDF 身份链 FS；当时 sourceRead 计数没有观察这些前置 metadata 调用。主代理确认选择器签发授权与普通目录发现可在原入口，而已知 PDF 的导入阶段预验证必须进入统一 slot。因此按 P1 要求收敛到 registry 后，并在原 NI-PDF08/14 补真实 metadata promise 挂起、额外请求不启动身份 FS、取消仍计 active、实际 settle 后才 drain 的用例。

## 实现核对

| 范围 | 已核对的行为与证据 |
| --- | --- |
| shared、core、条件指纹 | `importActionSchema` 对页码、变化批次、token、附加字段使用严格联合；取消不带 revision，失败报告只接受窄关联字段。`novel-import-pdf.ts` 校验台账页序、文字区间、统计、source/proof/ledger/决定绑定；`validatePdfPageReviews` 独立阻断未知栅格、解析错误、全扫描、预览失败及未确认图像。scope/plan 只在确有 PDF review 状态时展开字段；非 PDF/纯文字 PDF 不补空数组或无条件字段。冻结旧 MD classify/analyze/plan 三个 hash 及旧检查点直接回归通过。 |
| PDF-TR01 生命周期 | main 在 controller 初始化前创建并注入 PDF client；`beginClose` 首先取消 PDF 准入/任务，再进入 CloseCoordinator。stopTasks、closeData、服务退出及 owner 撤销覆盖同一 registry。controller `pauseAll/close` 在等待 tail 之前 cancel/drain；初次 choose 尚无 session、reselect、旧 PDF 补检查均有 generation/owner 检查。main `cancel-pdf-preview` 在 trusted/schema/ready/maintenance 检查后直接调用 controller，不进入 BusinessGate 运行队列或 initialize/serial。NI-PDF08 受控真实 FS/worker exit 及关闭函数体测试通过。 |
| PDF-TR02 资源准入 | `PdfJobRegistry` 限制一条运行管线与一项无源字节排队；PDF snapshot/verify/缓存验证进入 registry 后才执行来源读取。队列超时或取消不启动读取。运行取消只使 public result 失败，running job 仍保留至 work、handle close 与 tracked worker exit 实际结束；`active` 不提前归零。NI-PDF08/14 阻塞真实 snapshot/postverify IO 后观察实际 read、allocation、transfer、release 和关闭期限保留根目录，通过。初审 scanner 前置 metadata 缺口已由下文 BR02 修复与最终独立复测关闭。 |
| 来源与源字节 | `readNovelPdfSnapshot` 为核对 size 分配一份独立 ArrayBuffer，64KiB 分段填充、额外64KiB EOF 检查；worker transfer 后主进程不再持有完整活字节。后验/缓存/保存/每次发送前校验采用64KiB流式 hash，保留 O_NOFOLLOW、祖先身份、前后 fstat/lstat、ctime 与 hash。未采用 chunks+concat 的 PDF 读取。源 inode、祖先替换或链接、相同字节新文件及渲染中替换均拒绝，旧确认/能力失效。50MiB+64KiB是显式源快照预算，不是总 RSS 保证。 |
| token、失败及旧关联 | 普通成功预览不写 journal 或推进 revision；token 绑定当前 sourceKey、page、session、issued revision，限100项/10分钟；保存前重验原源，批次先全校验后一次保存。同值保存无操作。失败/清除旧失败才推进 revision；旧 saved 决定保留，独立 `pdfPreviewFailures` 持久阻断。`reportPdfFailure` 要求当前同源最新 issued request，只接受 requestRevision 或 issued revision；同源后续 revision 不吞报告，新来源/外页/未知或过期请求不可污染。与已另审 renderer 历史同源失败报告的契约一致。 |
| PDF-TR03 诊断封口 | 专用 worker 在动态导入 PDF.js 前替换本线程 console，固定码收集器不保留原始消息/对象/getter。每页128/任务512、未知/超长/溢出均阻断；真实缺失/非数字尺寸与损坏解码样本有可见正常内容，仍标 unknown/page-error。候选 PNG 必须等 render、loading.destroy、诊断 seal 及真实 worker exit；seal 后的 warning 通过 SharedArrayBuffer/Atomics 污染候选，客户端拒绝。stdout/stderr 排空后仅固定失败，不自动管道到应用日志。合法 PNG 但晚到诊断、异常输出、尺寸/像素/字节超限的组件负例通过。 |
| 固定资源与 worker 环境 | PDF.js/CMaps/standard fonts/wasm 逐文件固定 hash、固定根；字体 gz/解压 hash、OFL、限额与 glyph cmap 校验，Canvas 版本与路径检查。系统字体加载仅在 worker env 禁用；env 为显式白名单，不复制模型 Key 或整个 process.env。字体 fallback 只允许固定 warning 家族且所有相关字体 missingFile、页面字符具有 bundled glyph；其他资源/字体诊断阻断。没有添加 OCR、远程字体或 HTTP 服务。真实安装包/native 架构和可读性留 NI-PDF15/22/23 的独立结果。 |
| 全路径发送/发布 | `readable` 和首次本地/AI classify 使用 PDF 门控，不依赖 unknown 已完成分类；`validateImportCoverage/importSourceReady` 同步阻断。controller `ai` 在 classify/analyze/review/patch 每次发送前、返回后均 verify 并比较 epoch；start/resume/retry/resolve/apply-patches/repair 入口不能跳过。纯拷贝最终 publish 同样重验，服务 `assertPlan` 再校验 stored fields、coverage 与 importPlanHash。源变化后已发 AI 的迟到结果不进入 coverage。 |
| 发布审计与隐私 | PDF 逐页审计、文字 hash、当前确认及确认/撤销历史、保留文字说明与原 NOVEL_IMPORT snapshot、实体、ContentMutation 同事务保存；plan hash 包含相关决定和历史，同 request 修改历史产生 REQUEST_CONFLICT。renderer FileView 不含 proof/path/PNG；记录 API 投影剔除 proof，不返回 PNG/token/local path。NI-PDF10 使用真实隔离 PGlite 验证事务、同请求重试、正文拼接、审计持久化及只读投影。 |

CodeGraph 工具在本次代理工具清单中不可用，因此直接读取明确指定的源文件；未以全仓 grep 代替结构查询，也未运行 CodeGraph 初始化或修改索引。

## 独立执行的定向验证

运行时：`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`。仅下列名字匹配，没有运行完整文件、全量测试、NI-PDF15、真实应用/模型或用户数据库。

```sh
node --import tsx --test --test-name-pattern='^NI-PDF(?:0[1-9]|14):' tests/unit/novel-import-pdf.test.ts
node --import tsx --test --test-name-pattern='^NI-PDF10:' tests/integration/novel-import-pdf-publish.test.ts
node --import tsx --test --test-name-pattern='^NI-(?:F(?:04|07)|D(?:01|02)|S(?:02|07|08|10|11)|L(?:02|04)|W(?:04|06)):' tests/unit/novel-import-files.test.ts tests/unit/novel-import-domain.test.ts tests/unit/novel-import-session.test.ts tests/unit/novel-import-integration.test.ts tests/integration/novel-import-publish.test.ts
```

| 运行 | 结果（含子测试） | 日志 |
| --- | --- | --- |
| NI-PDF01–09/14 | 39/39 pass，0 fail/skip，exit0，26.4s | [pdf-backend-independent-pdf-tests.txt](evidence/pdf-backend-independent-pdf-tests.txt) |
| NI-PDF10 | 1/1 pass，0 fail/skip，exit0，4.4s | [pdf-backend-independent-pdf10.txt](evidence/pdf-backend-independent-pdf10.txt) |
| 指定直接旧回归 | 32/32 pass，0 fail/skip，exit0，7.4s | [pdf-backend-independent-regressions.txt](evidence/pdf-backend-independent-regressions.txt) |

初读 NI-PDF10 时发现其 `extractNovelText(bytes,'pdf')` 会在 dist 存在时取旧构建；已报告主代理，由主代理仅修改测试为显式注入 `desktop/main/novel-import-pdf-worker.ts` 后再执行，最终测试 SHA 为 `98c93505f250e34763f785e99869fab3830c9e334040d302b994c7c53a1a50f2`。本轮 NI-PDF unit/F04 也显式选源码 worker。真实 PDF.js+Canvas 渲染与受控 worker/IPC 函数体测试分开描述，不将替身、源码函数体或隔离数据库称作真实 Electron 验收。

## 初审冻结源文件（最终修订 hash 见文末）

独立计算的9个后端专用模块/资源 hash 与 `evidence/pdf-backend-final-source-sha.txt` 完全一致：

```text
0cc5f8125e937b2c0f35e22fb525eaa260c3bddef6d2a5d8f853fcc48c7a8259 desktop/main/novel-import-pdf-worker.ts
bad0c316eaf923976ab9a2db4538432affd51271b1fe8f5dac08b678629d0ef5 desktop/main/novel-import-pdf-engine.ts
a4123470e2066c17b64f471613207824b12947bd2cdd9b23c22f381022f47c48 desktop/main/novel-import-pdf-resources.ts
558e18b9e8b045fa3ce88f0f1f5268fd95c86d57786565058f5c1cfdc1a079cc desktop/main/novel-import-pdf-client.ts
0644e39d7611acf9b146817cf45da029a7e4cfefc9a7fdcb3419d0ff9d4bee24 desktop/main/novel-import-pdf-diagnostics.ts
0ce6cbdc0f9aaf5e4d42e2baf52c426ec24623c78780876a04f8cbdb811c9e04 desktop/main/novel-import-pdf-resource-manifest.json
4424b2c3ac3670a8068bea8c19786895e0f41ef96e1552e4fea3a3816c199e87 desktop/main/novel-import-files.ts
15d05a6b5a36dedb70d0f49a2cc262ead3577df3c8677b8938f2df991eff34a3 desktop/core/novel-import-pdf.ts
7b33251a779e163f646f5e6d13b02ae22edcb57a50ce5f84e3f4963f3759feea public/fonts/noto-sans-sc/pdf-import-provenance.json
cbbacdc7c78eacea355182a188fecd1b85119e776bcac5b50c0f5e055e74e1ff desktop/main/novel-import.ts
3360c883af7b0560ec7d2085cc6e8cd0c01a8519b5a97db146271841d4228526 desktop/shared/novel-import.ts
75efc17677b1322f72ce9e4570d835f511ef82b02d87899225c0c297154db3c2 desktop/core/novel-import.ts
0d49374352c2b010de39c98a71f3f5df7be078950ea8007d6153ba15e957c24a desktop/service/novel-import-publish.ts
02da4014d9f4404b71b34a8c0917881d63053dddd25772ed4c2daee098f10778 desktop/main/index.ts
```

测试快照：PDF unit `704b87deef37fc34023e891df502724d8a7f0900d5b2ce489bfacf3a530c1976`；files `56b02a86ae016772a0d1c29d1d105e46de58c932981e714a87e7ea422a5b2101`；domain `5f2649d2915041b4827d98e3c3914f14448165b4f624e83b700e643233c1f294`；session `198ce09ba4e0866e07c36ddf74fb97705d55e168627104d2a63348f942580bd8`；integration unit `683266ee41dd1953ba08c6d693d2edf388448d451762e4fbc0633bf3772da85c`；旧 publish `d6992d92a818d28f13bd31d96fa0049fc2470597d23d492b7f04ee4715d9bc1a`。

## 两项 P1 最终增量复审

同日对实施代理交付的修订进行只读增量复审，未修改生产代码。主代理同步的25 GBK仅修订文档、26预算分类恢复独立审核结论不计入本报告执行范围，也不冒充本报告跑过其测试。

**PDF-BR01 关闭。** controller 仅对 `blocker === 'ocr-required'` 且完整已知合法 ledger、无失败/未扫描/unknown raster/异常诊断/纯空白页/预览失败的来源，允许全批非 `exclude-image` 决定。source invalidated、ledger 不符、非 complete、其他 blocker 仍拒绝；任何批次包含排除决定均不适用该例外。保存仍先校验全批、再同一 PDF registry 源重验，最后一次 journal 保存；没有改变 `validatePdfPageReviews`、token 颁发、AI 或服务发布门控。新增真实 controller NI-PDF06 验证 `contains-content/uncertain/pending` 持久保存，预览不颁排除 token，排除失败不推进版本，sourceReady/pdfReady 始终 false；原 NI-PDF07 的发送、重试、冲突、patch 和发布相关拒绝继续通过。

**PDF-BR02 关闭。** scanner 在对已知直接/目录发现 `.pdf` 做 grant 重验、lstat、canonicalSelection、pathIdentity、visit 重复身份链前，先调用 `client.inspectSelected` 取得同一 registry slot。`prepareNovelPdfSource` 所有 metadata 调用用 `identityIo` 在 await 前后检查取消；同一 context 传入 `inspectWithin`，继续 snapshot→transfer/worker→postverify→root/grant 后验，没有嵌套 registry 或新增完整源字节副本。名为 `materials.pdf` 的真实目录先在 slot 内核对身份，返回有界 metadata、释放 slot 后走普通目录枚举；发现的 PDF 子文件另行逐个准入。选择器本身签发授权与普通目录发现保持已批准边界。

新增 NI-PDF14 对 native、grant、目录发现三种路径实际调用 `node:fs/promises.lstat` 并控制其返回 promise：首条 PDF metadata 已 active=1，唯一排队项不启动第二身份链，第三请求 busy，取消后 public 返回但 slot 与 drain 保持，实际 promise 结束后不启动下一 metadata/快照。目录命名负例验证恰好两次 registry job、一份源 allocation/transfer，未发生嵌套互等。新增 NI-PDF08 使用实际 main stopTasks 函数体及真实 controller，在首条 metadata 挂起时达到等价受控关闭期限，原根/窗口提交边界保留、未创建导入 session；实际结束后可重试关闭。以上与原 snapshot、后验 FS、worker exit 的生命周期用例一起通过。

独立复核最终 hash：

```text
b4ef686b61b3c7ac08df121bdaf3347bba898ecdbe4c777824155ef19ee25f28 desktop/main/novel-import.ts
ef8f2c7c5164ff18e305e35a9643b1a4ee10b2e2e5bf5a29adb679df7f0b3f2a desktop/main/novel-import-pdf-client.ts
76d3ae60ef2308a53cb27553be0ce305a1f88517f1fc316ff776c3177412965c desktop/main/novel-import-files.ts
da1ac9d8319b870d506f3794a21a6ea0a3dab9c97df1b12c1c1265b995a8ea96 tests/unit/novel-import-pdf.test.ts
```

专用9项清单除 client/files 外同初审；其余 shared/core/publish/main index hash 同上表。NI-PDF10 测试仍为 `98c93505f250e34763f785e99869fab3830c9e334040d302b994c7c53a1a50f2`，显式注入源码 `.ts` worker，未拾 dist。独立重跑与上文完全相同的三个精确命令，最终日志单列，没有覆盖初审历史：

| 最终运行 | 结果（含子测试） | 日志 |
| --- | --- | --- |
| NI-PDF01–09/14，含两项修复增量 | 46/46 pass，0 fail/cancel/skip，exit0，27.9s | [pdf-backend-independent-final-pdf-tests.txt](evidence/pdf-backend-independent-final-pdf-tests.txt) |
| NI-PDF10，真实隔离 PGlite | 1/1 pass，0 fail/cancel/skip，exit0，6.0s | [pdf-backend-independent-final-pdf10.txt](evidence/pdf-backend-independent-final-pdf10.txt) |
| 指定直接旧回归，含 W04/W06 | 32/32 pass，0 fail/cancel/skip，exit0，7.6s | [pdf-backend-independent-final-regressions.txt](evidence/pdf-backend-independent-final-regressions.txt) |

**最终 PASS 只针对本报告冻结的后端生产实现及批准的定向验证范围。** 无剩余必须修复的 P1/P2；资源包需随依赖图更新重新构建并按其独立审核处理。未运行全量测试、NI-PDF15、真实应用/模型、用户 journal/数据库或原 L01 文件；安装包与真实目标阶段仍由主代理组合验收，本报告不修改 RB-L01 历史失败或未执行记录。
