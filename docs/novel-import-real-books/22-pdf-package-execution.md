# PDF 安装包资源定向执行记录

日期：2026-10-26。范围仅16中的 `NI-PDF15`，不包含完整打包回归、签名、公证、安装或 Windows 验收。当前状态：**主代理与23子代理最终N9r591副本独立定向绿测，均1/1通过**。历次失败/中间包记录如下保留。

## 25来源编码修复后的最终包复验

下文保留历次失败和早期通过，不能将旧worker哈希当成本轮最终包。32独立代码审核最终PASS后，使用其最终12项源码冻结值重新构建desktop并由真实builder建立`novel-pdf-iOU9BE`，复制到仓库外`shakeink-novel-pdf-package-N9r591/app`。主代理仅运行NI-PDF15，**1/1、退出0、0跳过，约5.00秒**，见[evidence/pdf-package-N9r591-result.txt](evidence/pdf-package-N9r591-result.txt)。新worker SHA256为`52645a7d85a982d1b4135fb09109061162d596f450c37abbc07be2e32e6e810a`。

在既有201资源、禁网络/系统字体、3页PNG和3种资源各缺失/损坏反例之外，同一唯一用例增加包内对原L01全部178页的真实inspect：完整177文字页+1图像页，269个源编码证明位置，完整提取文字SHA `df2c0077a06e3935e05b7e9b9bdd802bafae9c2ca2bb79a8c65c80228712c6de`及proof SHA `41c9e9652712b7a03bf0489fcb711b4c299d255b455094700bfd033fdb39df31`均与此前冻结的完整外部生产提取证据相同。这些常量只在测试断言，不在生产解码器中。原件不改，未把269次修改实现为全局替换。

新包89/178页PNG SHA分别仍为`7893f5bba99d10cf72ecd0449ead1b3e15ac0b2c88b5505a307435ff4bd892bf`与`bfdc5f25e7235b7f1a0e7441a9669661087fd5dfd77d6f970434cac18aea80fc`，与主代理已实际视觉检查的图像逐字节相同。中间Vx6ndT包通过记录保留，但它早于32对象头计数P1修复，不能代替最终包。23独立执行相同唯一用例1/1通过，退出0、0跳过、总4.291秒，并直接查看本次89/178图像，字形清晰；其静态复审确认pdf-lib在包内且无repo解码回退。此处不代表原生应用PDF来源核对或RB-L01真实模型整书导入通过。

先新增 `tests/packaging/novel-import-pdf-package.test.ts`，按 `^NI-PDF15:` 只运行一项；原实现因正向文件清单缺少独立PDF worker而红。随后增加专用构建入口、runtimeEntries、builder正向入口及精确的生产依赖Canvas 1.0.10。没有更新库版本；离线npm缓存不含该版本元数据，使用已安装package与lock的相同版本/原integrity完成直接依赖声明，未下载、运行安装脚本或更改系统权限。

`scripts/verify-novel-import-pdf-package.mjs` 用真实electron-builder生成全新、未签名的macOS arm64目录包，复用正式正向清单和运行依赖裁剪；随后将实际app资源复制到仓库外独立临时目录。它不替换/安装/启动任何应用。测试在空cwd与临时HOME、无NODE_PATH/模型环境下运行包内worker，显式禁止系统字体加载与网络；依赖解析必须位于隔离包内。

实际打包暴露两项阻断并保留失败输出：

- Finder `.DS_Store` 被builder默认排除，但旧验包脚本把其当必需资源；仅从预期项目资源枚举排除此系统元数据，不删除原文件。
- builder会移除pdfjs `package.json`的keywords/bugs/scripts，使201项锁定资源中仅这一个字节hash不同。保持worker严格身份校验，在仅持有本次新staging capability的依赖裁剪阶段，验证除这三类已知字段缺失外的语义完全一致，再恢复已锁定的官方原字节。任何其他变化仍拒绝；不接受任意包内metadata、不修改既有安装包或开发依赖。正式验包另外逐项验证PDF资源、压缩/解压字体及Canvas版本。

第三次真实builder输出与隔离副本为 `novel-pdf-geXk3C` / `shakeink-novel-pdf-package-chFv03/app`，完整绝对路径保存在其仓库外 `package-origin.json`。其资源hash/字体/worker/nativeCanvas与无系统字体断言通过；Helvetica合成小PDF真实PNG通过。L01原件第89页正式新worker返回封闭的render-failed，因此此版本 **NI-PDF15仍失败**，不能把开发态字体脚本成功视为包内通过。已交由后端定位封闭诊断，未豁免未知警告或改原PDF。根目录之外的原件只读，sha与冻结manifest相同。

定向命令始终是Node24 `--import tsx --test --test-name-pattern='^NI-PDF15:' tests/packaging/novel-import-pdf-package.test.ts`，显式指定本次隔离副本 `SHAKEINK_PDF_PACKAGE_ROOT`。三资源（字体/OFL/CMap）缺失及损坏负例、89/178字形可读性、最终hash和独立审核尚未全部完成。不运行 `test:package` 或其他包测试。

后端确认89页阻断来自锁定PDF.js的字体家族替代分支；新增封闭诊断映射仍要求该页字体全部未嵌入、锁定包资源及每个字符有真实字形，未豁免未知/嵌入字体损坏。另一次重包被Monaco离线worker验包拦下：受限环境默认Turbopack停留后试用的webpack输出未生成既定worker，因此此输出不用于桌面验收。恢复项目既定Turbopack，在编译所需权限下生产构建exit0，7.4秒compile、24.9秒TypeScript，离线Monaco worker重新存在。没有修改编辑器或降低验包要求。

全新builder阶段`novel-pdf-tw2ZVC`和仓库外`shakeink-novel-pdf-package-HRHMLt/app`已建立，新增四项实际准入断言均通过：缺少cap拒绝不改metadata；同新stage未知字段篡改拒绝且不改篡改字节；恢复真实builder输入后同cap成功还原官方metadata；已消费cap再次使用拒绝。四flag随实际断言写入外部package-origin.json，NI-PDF15还会核对，不能以手写flag代替测试。

该隔离副本再次执行NI-PDF15，三页真实PNG均成功，包括L01物理89/178页；随后在字体缺失负例返回分类处失败，所以整项尚未通过。主代理实际视觉检查两张617×862 PNG：中页标题、正文汉字、页码85清晰，末页正文结尾、蓝字及页码174清晰，没有方框代字或空白页；这些是字体回退后的页面渲染，不是正文截图替代源PDF。图片保留于外部该副本的`pdf-evidence/`，SHA分别`7893f5bba99d10cf72ecd0449ead1b3e15ac0b2c88b5505a307435ff4bd892bf`与`bfdc5f25e7235b7f1a0e7441a9669661087fd5dfd77d6f970434cac18aea80fc`。已要求将必要资源文件系统异常统一为封闭resource-missing，并保留所有失败阻断。

资源异常已在loadPdfResources入口统一封闭为PDF_RESOURCE，安装布局存在out时不回退public字体。再次正式构建并全新builder输出`novel-pdf-pjpXFu`、隔离副本`shakeink-novel-pdf-package-loEmZe/app`，原命令NI-PDF15 **1/1通过、退出0、0跳过，约2.62秒**；原始输出保留`evidence/pdf-package-loEmZe-result.txt`。201项锁定资源、gz/解压TTF/OFL/provenance、native arm64、无系统字体/网络、三页真实渲染、三资源各缺失/损坏六个负例均完成。worker最终hash `2b4eed0e693561021db534140438a168808bfe02606ff4936554b53eecc63ca8`；worker真实exit后还核对SharedArrayBuffer诊断封口标志。新包89/178 PNG与上述实际视觉检查的hash完全相同，检查结果可直接对应，未用非空像素数量代替汉字可读性。仍待子代理独立执行/审核，尚不代表真实应用L01整书流程通过。

## 相关发布数据定向检查

主代理新增独立`tests/integration/novel-import-pdf-publish.test.ts`的NI-PDF10，使用真实PDF worker提取2页合成PDF（图像封面+末页正文），在隔离的真实PGlite作品执行发布、重复同请求、读取记录。核对原proof、全部页范围/文字hash、确认→撤销→确认三次历史与汇总历史、正文保真；未确认时零发布；读取不带proof/path/PNG/token；篡改事件历史按REQUEST_CONFLICT拒绝。第一次运行仅末项中文错误正则不匹配，改为断言正式ContentError.code，不记为生产实现RED。

限定命令 `node --import tsx --test --test-name-pattern='^(?:NI-PDF10|NI-W(?:04|06)):' tests/integration/novel-import-pdf-publish.test.ts tests/integration/novel-import-publish.test.ts`，实际Node24绝对路径，**4/4通过、退出0、0跳过，约6.74秒**。此结果包括原W04两项及W06一项，未执行其他集成用例、真实模型或真实用户数据库。仍需独立复审，不替代RB-L01整本导入。
