# PDF 页复核 renderer 独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 当前结论

**针对性复审通过，PDF-UI-CR01 已关闭。** 同源旧响应的解码失败现可送后端验证并持久化，draft 保存仍严格 revision；修订后 NI-PDF11/12/13 三项独立运行 **3通过、0失败、0跳过**。本结论只针对 renderer、store 窄桥和三个既定浏览器用例，不代替 PDF 主进程、worker、安装包或真实 L01 验收。以下保留初审版本、阻断及复审经过。

## 范围与版本

对照已批准15技术方案、16用例和17独立方案审核，审核以下当前文件；未改生产代码：

| 文件 | SHA-256 |
| --- | --- |
| `src/components/desktop/PdfPageReview.tsx` | `63473efe24b2a1681517e8a9a6af1958fe6bc2c2d8c4976ca5e0d1b8ee9484e6` |
| `src/components/desktop/novel-import-pdf-pages.css` | `e082a081e5089b0e216a4fe4e1ba882236a9dc376235e1add9364b289570a94e` |
| `src/components/desktop/NovelImportDialog.tsx` | `6335444f8bd92029990b049b577faf4fa3d252c34c34708cbe809b70fd69515f` |
| `src/components/desktop/NovelImportRecord.tsx` | `93da972ef693c3fdca37508085121c2f5c31d9714ae166c8c265a4b16c2cb61c` |
| `src/lib/desktop/novel-import.ts` | `3bacadfae3139e680e2b41c6ccd0562db8570e2e43d7e2854cc36af61f9e9cc4` |
| `tests/browser/novel-import-pdf-pages.test.ts` | `7529b98f8f7fc2151885be72d1b45609b405d423e5eab3a4444caf049d2b2450` |
| `tests/helpers/novel-import-pdf-pages-fixture.tsx` | `d9052a660799430daeca6edb113fb765358cf31d624a89f7461985257d8a762b` |

## PDF-UI-CR01 · P1 · 同源 revision 推进不能在 renderer 吞掉已知解码失败报告

**依据：** `PdfPageReview.tsx` 的 `load` 在 ready 回执采用后等待 `image.decode()`，失败时以捕获的 `adopted` scope 调用 `markDisplayFailure`；对应约64行。`reportNovelImportPdfPreviewFailure` 当前复用 `submitPdfChange`，其 `novel-import.ts:184` 在发桥之前调用严格 revision 的 `assertPdfScope`（142行）。

具体窗口：已有有效确认的同源页取得 ready 回执；图片解码尚未完成；同 session/file/sourceKey/ledger 的权威 view revision 推进；随后实际 decode reject。此时旧 scope 报告被 renderer 的严格 revision 检查拒绝，`window.desktop.novelImport(report-pdf-preview-failure)` 根本没有发出。局部错误在子窗关闭后消失，主进程没有得到需持久化的已知失败；原决定仍在，来源可能重新显示可继续。

15技术方案62行已经明确此报告可使用响应的 requestRevision 或颁 token 时的权威 revision，且“其间仅view版本推进不能吞掉已知同源失败”。保存 checkbox draft 保持严格 revision 是正确行为，但失败报告不能复用相同的前置拒绝规则。

**必要修订：** 将报告发送与严格 draft 保存区分：只有同 session/file/sourceKey/ledger 的关联失败可用原 ready 响应版本发给后端，由后端已颁预览记录进一步验证；跨会话、换源、换 inspection/ledger 必须继续拒绝。回执采用仍不得覆盖更高 revision 或新来源。不能通过自动升级 checkbox/token 或重发旧 draft 处理。

**定向补证：** 在现有 NI-PDF12 内加入可控的 decode pending → 同源 revision bump → decode reject，断言报告确实送桥、旧已保存决定仍保留历史、持久失败阻断继续，取消/重开不清除；明确重试成功后才恢复。保留同名测试范围，禁止扩展为全套。已向主代理反馈；向实现代理的直接消息工具返回 `agent thread limit reached`，已请主代理转达。

## 已核对成立的部分

- 父 `NovelImportDialog` 在页核对打开时暂停原 Dialog；子窗复用真实 Base UI `DialogContent` 的 initial/final focus。关闭子窗恢复来源按钮，关闭原导入窗恢复工作台触发器；没有新增全局 Tab 拦截。
- draft 使用页码 Map，只提交明确变更；切页保留两页 draft，取消丢弃未保存更改，显式撤销才提交 pending。外部 revision/来源变化清 draft/token，不自动以新 revision 重发旧 checkbox。保存已提交后的关闭文案明确不会撤销已提交请求。
- 单页读取和不带 revision 的 cancel 直接发既有窄桥，不排在 mutations/choosing/busy 后。切页、Escape、卸载使旧 sequence 失效；迟到响应不恢复子窗/提交决定。
- PNG 入 renderer 检查 Uint8Array、8MiB、PNG magic/IHDR、长边4096及400万像素，随后实际 `image.decode()`；只用 image/png Blob URL，切页/关闭/卸载撤销。成功预览不会自动勾选。当前三个用例覆盖正常 decode、失败报告及明确重试，但未覆盖 CR01 的 revision 窗口。
- 全扫描/OCR、来源变化、当前预览失败均禁新 exclude；来源取消纳入后的总数来自真实 included 集合，重新纳入仍依权威门控。记录页只渲染文件名/摘要hash/页码/文字计数/决定与事件，不渲染路径、proof、token或PNG，原冲突决定区域保持独立。
- CSS 为视口减32px、最大920px、grid固定头尾与中间滚动；390×600宣纸/玄墨的边界、横纵滚动、100%/fit、焦点恢复和URL回收有实际浏览器断言。该证据属于真实 React＋合成窄桥，不是原生 Electron/PDF 资源或真实小说通过。

## 独立定向运行

在上述最终文件 hash 核对后，仅执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-PDF(?:11|12|13):' tests/browser/novel-import-pdf-pages.test.ts
```

独立进程退出0：NI-PDF11、NI-PDF12、NI-PDF13 **3通过、0失败、0跳过**，总时长约6.99秒。用例用真实 React 组件和受控合成 metadata/PNG bridge；内存 setContent/script/style，除仓库文件图标外的请求被拦截，没有打开 HTTP 服务、file: 预览或绕过安全策略。没有运行其他测试、操作真实应用/CUA/模型、读取真实journal/Key/数据库。

CR01 未关闭前，不把三项绿测提升为 renderer 全部通过。待实现方修订后仅复审受影响文件并重跑同三项，追加最终结论。

## PDF-UI-CR01 针对性复审与最终结论

同日只复审受影响 store/test/fixture，其余四个生产文件 hash 与初审完全一致。新版本为：

| 文件 | 最终 SHA-256 |
| --- | --- |
| `src/lib/desktop/novel-import.ts` | `b54b6e295a860136b3824ac120cc867a0d9370cb4111b594acb72df7e1ac5ef9` |
| `tests/browser/novel-import-pdf-pages.test.ts` | `451cbffcb58dda4ebeda8733bd5ef0b904364cb6e40a88adae2ed8fa138fc844` |
| `tests/helpers/novel-import-pdf-pages-fixture.tsx` | `2c5b3764bb426c52daaeab015e286978e19ab3777e10a79871381712571f1008` |

失败报告 helper 现独立于严格保存路径：发送前校验相同 session/file/sourceKey/ledger，且当前 revision 不早于原响应 revision；桥上仍携带原 issued revision 与原 requestId，由已颁预览记录验证，未把旧 draft/token 升级。返回后再次核对当前与回执来源一致，仅在回执 revision 不早于当前 store 时采用，拒绝跨会话/换源且不会覆盖更新 view。`saveNovelImportPdfDecisions`/`submitPdfChange` 的严格 revision 检查保持。

NI-PDF12 新增真实异步分界：让 ready 已返回后 `HTMLImageElement.decode()` 保持 pending，推送同源 revision，再 reject decode。断言 `report-pdf-preview-failure` 的 revision 等于原请求 revision、报告送达、旧 exclude 决定保持、关闭/重开仍显示持久失败且不会自动再次读取或解除门控。夹具的报告校验只放行实际 issued request 与原 request/issued revision；其他 mutation 仍严格等于当前 revision，没有为绿测放宽所有动作。

核对实施代理的同名 RED/GREEN：`docs/novel-import/evidence/pdf-pages-ui-revision-decode-red.txt` 为 NI12 等待报告超时、2通过/1失败；`pdf-pages-ui-revision-decode-green.txt` 为三项通过。独立在上述最终 hash 下重新执行本文件同一精确命令：**退出0，3通过、0失败、0跳过，约7.20秒**，未运行其他测试。旧三项断言保持。

**最终：renderer 代码审核通过，CR01 关闭，无剩余必须修订项。** 本轮仅证明受控真实 React UI 与窄桥交互；后端能力归属、真实 worker/资源、离线包、原生 Electron 与 L01 整本语义仍由相应独立审核/实际验收证明。
