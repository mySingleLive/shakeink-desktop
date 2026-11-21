# PDF 安装包资源窄范围独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 当前结论

**最终结论：PASS，仅限最终 N9r591 隔离包的 NI-PDF15、macOS arm64 离线资源与实际 PDF worker。** 已独立执行唯一获准用例，1/1通过、退出0；完整178页提取、269处源编码证明、三张PNG及三资源各缺失/损坏六个负例均通过。本范围没有剩余必须修订项，不代表原生应用、整书AI/语义/发布或Windows通过。

下文保留初审及失败历史，最终复审证据见末节。初审只做静态审核；最终复审才运行NI-PDF15，没有重建/重包、安装/启动应用、全套打包测试、真实模型、用户数据库或Key操作。renderer的同名三项独立测试及CR01修复结论见20，与本文件范围分开。

## 范围及版本

| 文件 | SHA-256 |
| --- | --- |
| `scripts/runtime-dependencies.mjs` | `2e3779c055d518b64cff17dbf5151188eeceacc37c78afc0e4d0d37d7b2337d2` |
| `scripts/inspect-packaged-app.mjs` | `a18db404645b22e68d327b262dbc6779f10a10405a45f98151aafda83aa52190` |
| `scripts/build-desktop.mjs` | `39254b186b4e57585eeb64d45368249dc473babf8faad0f82c758a1b2a4ece6c` |
| `scripts/verify-novel-import-pdf-package.mjs` | `18aacff388a5f345beea47078e76936cd7853a4ef59ec4f852c360d06bbe0183` |
| `tests/packaging/novel-import-pdf-package.test.ts` | `a32c9f3c17ac4b2aee9300d6394cb8344fb516221d012e4c0df3df57e4017bd1` |
| `tests/fixtures/novel-import-pdf-package-probe.cjs` | `fed6b5569bf9230e2a3fad911ef0148e733f988ab3efcb5a825944c85173f48d` |
| `electron-builder.config.cjs` | `998cb751a5b7f81242ede0987b0b685b0efc57ea736e58eda55c01271a7194c0` |
| `package.json` | `fea68e7f42f63b1e20c278ae4217f96546e632678a9fdd3edb6740f55aaad610` |
| `package-lock.json` | `019f14ee232cc0f2fa743869f04fd7def6fdcd95a0722f4725e32164837672b6` |

另外只读核对既有 `scripts/package-desktop.mjs` / `scripts/package-adhoc-macos.mjs` 的 capability 与 afterPack 调用，未扩展审核既有发布/签名业务。

## 已成立的代码约束

- 专用worker在build-desktop构建、runtimeEntries及builder正向文件清单中对应；runtime manifest的条目数/路径/hash验证仍严格。worker map、设计稿、源码/证据及撤回的旧worker未因本轮进入正向清单。
- Canvas是直接生产依赖，package与lock均精确 `1.0.10`，原版本/integrity及平台optional包保持；没有以开发环境存在转移依赖代替生产声明。
- `verifyProjectResources` 继续逐项比较项目输入与包内实际字节，新增PDF manifest资源、gzip及解压后TTF hash、Canvas版本核对；仅从枚举期望排除builder本来就会去掉的Finder `.DS_Store`，未放宽任意缺资源/格式。
- metadata恢复仅发生于 `prunePackagedDependencies` 的新staging capability范围：WeakMap不可伪造对象、单次使用、相同project、stage设备/inode、路径祖先无链接、构建manifest字节一致均在前。原PDF package.json自身必须匹配锁定资源hash。包内metadata只能等于原JSON，或原JSON缺失 `keywords` / `bugs` / `scripts` 的某个子集；其余字段变更/新增/丢失均拒绝，再写回锁定官方字节。没有修改项目node_modules、旧stage或已安装应用的接点。
- 专用harness使用真实electron-builder、复用正式正向清单和裁剪逻辑，创建全新staging，不签名/公证/发布/安装或启动应用；afterPack先裁剪再核验，随后把实际app资源复制到仓库外的独立临时目录。原正式/adhoc afterPack仍调用同一 capability-bound函数，未放宽为对任意旧包修补。
- probe在空cwd、临时HOME、无NODE_PATH的子进程加载隔离包Canvas及实际worker；检查Canvas解析路径与实际加载 `.node` 都在包根内、初始系统字体集合为空。worker启动前显式拒绝fetch/http/https/net/tls常见网络入口，不启动HTTP监听服务。这里是受控Node资源测试，并非OS网络沙箱或原生Electron执行证明。
- probe逐项比较锁定PDF资源、gzip/TTF、OFL，检查包内worker hash对runtime manifest；正式生成harness又将包内worker字节对当前dist输入核验。三类资源负例分别临时移走并写坏字体/OFL/CMap，必须封闭失败且没有成功value，finally恢复仅该一次性隔离副本。

## 仍须获得的定向证据

1. **实际NI-PDF15完整绿测。** 当前22明确页89失败，后续页178和三资源missing/corrupt并未因此完成。后端修订后需重新构建当前worker、生成新的实际隔离包、按 `^NI-PDF15:` 执行唯一用例，并固定构建/worker/profile/包根与结果hash。不能使用旧包或开发环境成功覆盖这一失败。
2. **恢复metadata新分支的窄负例代码已补，待新包实际结果。** 初审NI-PDF15缺少“无capability拒绝、不改旧字节；只删除三字段允许恢复；其他字段变化拒绝且不裁剪”的实际分支断言。主代理随后补入同一NI-PDF15对应的真实builder harness，具体复审见下节；未扩大为完整packaging suite。
3. **非空PNG不等于字形可读。** probe的 `ink > 1000` 检查只能排除空白位图，错误字形/方框也可能满足。最终页89/178的实际PNG必须再有视觉核对证据，若宣称CJK字体哨兵通过，还应对应可识别的预期字符。22已如实保留“字形可读性尚未完成”，该限制应继续保留到实际完成。
4. **平台和执行边界保持明确。** harness只接纳macOS当前架构，成功加载其本地模块可证明这一进程架构兼容；不会证明Windows或其他架构。独立包资源测试不代替原生Electron/CUA、178页ledger/177页文字完整提取、模型/语义、发布和重开。

上述待验项已告知主代理，未自行放宽诊断、改资源/原PDF、执行包测试或接触真实状态。待全部定向证据交付且必要修订复审后，再追加包验收最终结论。

## metadata 准入补证的静态复审

同日只复审两文件改动：`scripts/verify-novel-import-pdf-package.mjs` SHA-256 `8fdbaeab7563cafca849379bcf704147ddc2ae4255919b417bf6e2218c0309b2`，`tests/packaging/novel-import-pdf-package.test.ts` SHA-256 `2b455f4ac8ba8ae2753a73fa2387b092084179337b2eeb7bd4ef68be87d70392`。

harness 在真实builder的当前新stage afterPack内保留原builder metadata字节，实际断言：无cap调用拒绝且字节不变；加额外unknown字段后同cap调用拒绝且篡改字节不变；恢复builder原字节后同cap成功，并与锁定官方metadata原字节完全相等；消费过的cap再次调用拒绝。四个admission flag均在各对应实际断言完成后才置true，再写仓库外 `package-origin.json`，NI-PDF15读取该origin并精确比较四flag及隔离包根。

该补证没有为测试放宽生产恢复条件，也不会修改旧stage/安装版；同cap失败后可修复当前一次性stage输入再试，消费后不可复用。静态复审无新增必须修订项。当前仅证明测试代码具备所需断言，新隔离包尚在生成，未在本复审中运行builder或NI-PDF15，继续保留待验结论。

## 最终 N9r591 隔离包独立复审

同日，在32最终源解码实现审核PASS、主代理重新构建并以真实builder产生全新隔离副本之后，独立复核NI-PDF15新增的完整原PDF检查及包内依赖接点；只修改本报告。指定副本为：

```text
/private/var/folders/xj/5c__pm_j6s74shtqfcbg87640000gn/T/shakeink-novel-pdf-package-N9r591/app
```

该副本的仓库外 `package-origin.json` 记录 `darwin` / `arm64`、新stage `novel-pdf-iOU9BE`，隔离根完全一致，四个metadata admission flag均为true。真实builder和四个反例由主代理执行；本审核读取其origin和已审核的harness，不把读取flag称作本审核另行执行builder。

### 新增断言与依赖边界

- 测试先核对原L01文件SHA，再把原字节复制到测试临时目录；probe将这些字节发给隔离包内实际 `novel-import-pdf-worker.cjs`，调用 `inspect` / `sourceTextPolicy:'current'`，等待worker真实退出并检查diagnostic seal。全书不是把预览三页的结果相加，也没有由测试生成提取文字或proof。
- 新断言读取实际返回值，核对完整ledger为178页、1图像页/177文字页、无blocker、269处changedOffsets，以及完整提取文字和proof摘要。预期hash是冻结输入证据的断言值；生产worker没有L01文件名、178/269计数或这两个预期摘要的分支。源解码仍为32已审核的原资源闭包、glyph对应及页内原子校正；没有全局替换或repo文字回退。
- 包内worker直接 `require('pdf-lib')`；其所在包的正常 `node_modules/pdf-lib/cjs/index.js` 实际存在，runtime manifest将pdf-lib列为该worker的外部运行依赖，包内production dependencies保留1.17.1。最近的包内依赖由这个CJS文件加载，测试顶层开发依赖pdf-lib只用于生成独立Helvetica哨兵，未用来计算L01的检查结果。Canvas与PDF.js继续使用已审核的包根路径约束。
- 子进程空cwd/临时HOME、无NODE_PATH，worker网络入口显式拒绝、初始系统字体为空；201项锁定资源及字体gzip/解压后TTF/OFL/provenance检查保持。负例仍只改一次性副本并finally恢复，没有降低resource-missing条件或修补安装版。

| 本次实际复核文件/产物 | SHA-256 |
| --- | --- |
| `tests/packaging/novel-import-pdf-package.test.ts` | `46ae96f49282b832df6d8f60e7d62f92b0640563e1d3fe4e867af8e1fbde49df` |
| `tests/fixtures/novel-import-pdf-package-probe.cjs` | `a2ce4bf4c9696eeced05385ff13237022111607de9f5ca7b23281c7f93e5368a` |
| `scripts/verify-novel-import-pdf-package.mjs`（四准入反例逻辑未变） | `8fdbaeab7563cafca849379bcf704147ddc2ae4255919b417bf6e2218c0309b2` |
| 隔离包实际worker（与其runtime manifest相同） | `52645a7d85a982d1b4135fb09109061162d596f450c37abbc07be2e32e6e810a` |
| 完整原L01提取text（UTF-8） | `df2c0077a06e3935e05b7e9b9bdd802bafae9c2ca2bb79a8c65c80228712c6de` |
| sourceTextDecoding proof | `41c9e9652712b7a03bf0489fcb711b4c299d255b455094700bfd033fdb39df31` |

上述text/proof摘要与冻结输入核验的 `evidence/pdf-source-text-real-counts-final.json` 相同。本审核没有另跑production-v3或重建事前oracle，而是核对当前最终包实际结果与冻结摘要；32修复前的组件结果/代码SHA不会被冒充为本次包worker。

### 唯一独立执行及实际结果

```sh
SHAKEINK_PDF_PACKAGE_ROOT=/private/var/folders/xj/5c__pm_j6s74shtqfcbg87640000gn/T/shakeink-novel-pdf-package-N9r591/app /Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-PDF15:' tests/packaging/novel-import-pdf-package.test.ts
```

独立结果：**exit0，1/1 pass，0 fail/cancel/skip，4291.227083ms**（用例4106.908125ms）。诊断为 `passed:true, systemFonts:false, network:false, nativeArchitecture:'arm64', checkedResources:201, renderedPages:3, negativeResources:3, inspectedPages:178, sourceDecodedCharacters:269`；`negativeResources:3`表示字体、OFL、CMap三类，每类实际执行缺失和损坏两个分支，合计六个负例。

独立运行后的仓库外 `pdf-evidence/result.json` 保留上述worker、资源profile、完整text/proof摘要。没有运行其他用例或重新构建包。主代理的另一次同项日志为 `evidence/pdf-package-N9r591-result.txt`；本节记录的是本审核自己的运行结果，不以该日志代替独立执行。

### PNG直接查看及最终范围

本审核直接查看本次运行产生的89/178页PNG：页眉、正文汉字、页码85/174和末页蓝字清晰，没有方框代字或空白。两张图片hash与此前22实际视觉检查完全相同，预览仍取原PDF字形，不取校正后的正文进行替代绘制。

| PNG | SHA-256 |
| --- | --- |
| Helvetica哨兵 | `a3c0eb4c465242f0985372f5072c570e71f3ca99cd1456a8bdeb7704d697ef2b` |
| L01物理89页 | `7893f5bba99d10cf72ecd0449ead1b3e15ac0b2c88b5505a307435ff4bd892bf` |
| L01物理178页 | `bfdc5f25e7235b7f1a0e7441a9669661087fd5dfd77d6f970434cac18aea80fc` |

初审所列NI-PDF15、metadata准入及两页字形待验项在本范围关闭。**最终PASS只证明指定macOS arm64副本在受控离线Node worker中的包内资源、完整提取及三页渲染；显式网络拒绝不等于OS网络沙箱。** 未安装/启动原生Electron，未操作逐页UI、模型、真实用户DB、发布/重开，未验证Windows或其他架构，也不代表RB-L01整书验收通过。
