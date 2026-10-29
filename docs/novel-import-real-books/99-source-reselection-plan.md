# 普通来源重新选择：技术方案与定向用例

日期：2026-10-27。状态：待100独立审核，尚未改代码或当前草稿。用户明确要求保留M01-20261027-D1，先修复入口；不得丢弃、重建session或写入私有journal恢复片段。

## 实测依据与范围

M01 session439f1633-9d21-40f5-9d8b-7f165cc66265首次识别前被严格来源proof拒绝。源哈希03d44b…、device/inode/size/mtime不变，仅ctime不同；零AI、零产物。外部source-metadata-change-before-first-ai.json保留准确纳秒值。不能归因某个OS组件，不能通过忽略ctime自动放行。

现reselect-source动作仅调用reselectPdfSource，普通来源没有入口；重新应用编码仍校验旧proof，添加同hash会被当重复来源。因此补齐用户主动重新选择**相同原文件、相同字节、相同解释文本**的授权更新。此次不做内容替换/跨格式转换，不丢分类、章节或草稿。PDF原分支逐字保留，不扩展其行为。

只改desktop/main/novel-import.ts、src/components/desktop/NovelImportDialog.tsx；新增tests/unit/novel-import-source-reselection.test.ts；tests/browser/novel-import.test.ts与其UI fixture仅追加新定向用例及必要夹具选项。可增补设计HTML中同一来源行按钮以同步文档，不新创独立弹窗，不修改主题/布局。复用已有主题Button outline；按当前实施约定允许继续，不再创设UI审批门。

## 产品行为与实现边界

1. 核对来源的普通已读取文件（TXT/MD/DOC/DOCX/HTML/HTM）增加“重新选择文件”，aria-label区分具体文件。旁注说明“重新选择相同原文件可更新读取授权，已核对的分类和卷章会保留”。入口只在尚未开始设定导入时出现；busy禁用。错误和取消不关闭草稿。现有核对原文、PDF图像页入口不变；无需加入更多菜单。
2. reselect-source先判断目标format，PDF继续走原函数，普通来源走新函数。服务器在任何picker前校验：source/select/confirm/paused/failed空闲阶段、无publication/steps/artifacts/decisions/semanticState、workingRevision为0、无除classify以外的非空coverage、无analysisCheckpoint、无活动jobs/PDF预览。禁止借重选覆盖已有设定导入/作者决定；界面隐藏不能代替后端门。已有成功来源分类/手动分类与卷章允许保留。
3. 通过现有options.choose()打开各平台既有统一选择器，不从action传路径。取消不变；多选、文件夹、不同canonical path/格式拒绝，原草稿不变。string测试/旧入口仍通过captureNovelSourceGrant获得新原生授权；实际grant也经现有scanNovelSources完整proof/祖先/保护目录/链接/大小限制检查。只允许当前old.path对应的一份普通文件；新对象必须具有实际完整读取后才会设置的fresh proof/ancestors/hash，hash精确等old.hash、bytes等old.bytes，格式相同；旧来源须已成功读取且编码已确认。禁止自动在旧路径重建grant而绕过用户选择。
4. TXT/MD/HTML/HTM若已有确认encoding，允许中间默认解码失败对象在满足上述完整fresh读取身份/字节前提后，使用现redecodeNovelFile及新proof按旧编码重读；不以error字符串猜原因，不跳过任何FS/大小/授权门。真正FS/链接/权限/保护/大小失败缺少完整新读取proof/hash而拒绝。DOC/DOCX用原extractor并直接拒绝scan error。最终重新解释对象须无error、无待确认编码，完整text必须逐UTF16等old.text，且encoding与旧确认精确相同；不trim/统一换行/改繁简。重新选择前后仍调用严格verifySources校验新proof，不忽略ctime/mtime/ancestor。若读取期间再次变化，拒绝保留旧草稿，供用户再主动重选。
5. 仅以clone替换指定file的proof和ancestors，所有其余file字段（含id/path/name/format/hash/text/encoding/included/parts）原样保留；files顺序/其他来源、units完整对象、chapters完整对象/手动模式、selected/targets/infer、title、budgetPolicy/legacyBudget、target身份全部保留。不新建session/fileID、不做本地重分类、不清空已确认卷章。撤销classificationGrant和analysisGrant及对应checkpoint（classify覆盖可保留供审计，后续AI识别因checkpoint撤销重新授权，不冒认新请求已执行）；phase回source、resumePhase清除、error清除、epoch递增。已有target则标需重新授权，AI不会自动发送。
6. 必须原子候选持久化后才采用。复用现commitCandidate：新增可选第三参resumePhase，默认仍running，所有既有调用不变；本入口传source，使提交窗口磁盘fallback为paused/resumePhase=source，错误提示仍与paused事实相符。候选只携带通过所有校验的proof更新。原save前失败保持完整旧owner/磁盘；rename之后owner后验失败采用已提交paused候选且candidateBlocked，禁止再次写/发AI，正常重开后原生核对来源。正常成功后沿用act尾save保存source阶段；不得手改journal。PDFcache/来源token不因普通重选扩大失效，不清其它文件确认。
7. 新动作本身不调用AI/模型、不改变预算/网络重试/生成契约，不发布、不读写业务库。来源scope目前不含proof，仍主动撤销发送grant，不把旧同scope当自动授权。

## 定向测试（先RED再实现，禁止全量）

NI-SR01：真实临时TXT/MD、实际capture/scan/read/verify，制造同字节mtime/ctime或inode变化，首次旧proof验证确实拒绝；用户重新选择后同session/fileID、完整来源/分类/章节/标题/目标/预算均精确保留，仅proof/ancestor和规定控制字段变化；当前新proof能过严格verify，后续再次变化仍拒绝。显式旧编码（GB18030和无BOM UTF-16）保留同解释：后者须证明默认scan因NUL失败但已拥有fresh读取proof/hash，按原确认编码再解码成功；HTML、DOCX最小真实格式及已有获许可test01.doc也须实际覆盖，不虚构原生平台结果。

NI-SR02：取消、多选、目录、不同path/格式、changed bytes、解码文本不等、来源link/授权或fresh capture→scan/verify期间的祖先漂移、真正scanner安全失败、非文本scan error及最终旧编码解释失败均拒绝且旧owner及session.json不变（取消允许原action普通save仅revision/timestamp变化，业务不变）；含其他来源时顺序与对象不变。已有设定分析/作者决定/工作版本/发布或in-flight请求在picker前拒绝；invalid actions不能发AI或触发布。classify覆盖/手动边界保留、grant撤销、后续允许AI必须新授权。

NI-SR03：同真实controller save接点注入pre-rename写失败与rename后owner拒绝，前者旧内容未变，后者live等实际已提交paused/source并blocked；正常重开恢复同session/来源/边界/章节/预算，可重新分类授权。只注入/tmp合成文件，真实草稿不注入。

NI-U12：真实React受控桥验证source行按钮各有正确aria-label/动作fileId；busy禁用，取消保留当前屏幕，成功回来源且不发classify/start，错误仍可见；preview旧分页缓存不影响重新进入核对；已有分析/完成隐藏入口；纸/墨主题与窄窗口可操作，无新溢出。合成桥不作原生证明。

相关保留：NI-PDF04和精确“NI-PDF08: inspection and preview cancellation drain real jobs before controller serial waits”、NI-R02的既有候选提交边界仅在helper签名变化需要时精确执行。

预定命令：

```
node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SR0[123]:' tests/unit/novel-import-source-reselection.test.ts
node --import tsx --test --test-name-pattern='^NI-U12:' tests/browser/novel-import.test.ts
node --import tsx --test --test-name-pattern='^NI-PDF(?:04:|08: inspection and preview cancellation drain real jobs before controller serial waits$)' tests/unit/novel-import-pdf.test.ts
node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

必要global/audit类型检查、Next Turbopack UI构建（保Monaco资源）、desktop构建单独记录。不得运行完整suite，不增加真实AI次数作为合成测试。

## 真实恢复

100技术/用例及101代码独审通过后，先正常菜单退出当前应用，不弃M01草稿，保留原检查点/失败。构建重开当前session，保存修复前后身份与新构建hash；通过新入口实际选择同一M01原件，取消/失败不改变草稿。核对sourceHash/units/chapters/id/title/targets/budget/空target及零AI结果保持，新proof与当前实物匹配；旧失败证明不覆盖。再经原生来源/章节/识别授权流程继续该中篇完整测试。新增入口通过不表示M01或S02文学质量通过；原D1与其余小说/正式LIFE的未完成状态保留。

## SR-TR01首轮复审收敛

接受独审P2：无BOM UTF-16的合法旧编码不能在默认扫描error处提前误拒。以上第3/4点及SR01/02已修订，允许的仅是已通过完整fresh字节读取门、同path/format/hash/bytes后按原确认编码重新解释，最终仍严格相等和verify。不能凭错误文案猜测或恢复不完整FS读取，PDF/decoder/source proof本身不改。加入实际DOC fixture。首轮NOT PASS保留在100，待同一审核者复审。

旧身份到新身份的显式重新授权允许inode或ancestor更新，只要用户再次选中相同canonical path、完整fresh读取和同字节/同解释校验全部通过；不要求新proof等旧proof。安全反例的“漂移”指fresh授权后发生变化。
