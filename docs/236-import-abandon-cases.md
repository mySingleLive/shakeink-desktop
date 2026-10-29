# 导入中断即删除草稿 测试用例（236）

日期：2026-10-30。方案见 `docs/235-import-abandon-plan.md`（含独立审核处理）。基线 `3162a4f`：`npm test` 2990 项，57 项既有失败，名单 `/tmp/shakeink-baseline-fails.txt`（与本次无关，仅作比对）。

## 主进程单元用例（新增 `tests/unit/novel-import-abandon.test.ts`）

夹具：沿用 `novel-import-session.test.ts` 的隔离临时根与合成来源/模型/保存目录（`mkdtemp`），不接触真实数据根。"草稿目录"指 `<root>/novel-imports/<id>/`。

| ID | 名称 | 步骤 | 预期 |
| --- | --- | --- | --- |
| IA-01 | 空闲阶段取消即删除 | choose → classify(local) → `cancel` | 响应 `view:null`；`current` 为 null；草稿目录不存在；`novel-imports/` 下无残留 |
| IA-02 | 运行中取消先排空再删除 | choose → classify(ai) 挂起 AI → `cancel` | `cancelAi` 收到在途 operationId；返回后 `active===0`；目录不存在；迟到的 AI 结果不重建会话 |
| IA-03 | 取消后再次导入为全新 | IA-01 后 choose | 新 id ≠ 旧 id；`picked` 增 1；新会话 `phase==='source'`、`revision` 从新开始，无旧选择 |
| IA-04 | 存在未保存草稿时直接 choose 被拒 | choose 后再次非追加 choose | 抛"已有未完成的导入"；`picked` 不增；原草稿不变 |
| IA-05 | 窗口关闭/应用退出删除 | choose → classify → `close()` → 新控制器 `initialize()` | 目录不存在；新控制器 `current` 为 null；choose 得新 id |
| IA-06 | 运行中关闭也删除 | AI 挂起时 `close()` | 先排空（`cancelAi` 调用），目录删除，`close()` 不抛 |
| IA-07 | 启动清理遗留未保存草稿 | 用旧控制器制造 paused 草稿（`pauseAll` 后不调 `close`），新控制器 `initialize()` | 草稿目录被删除；`current` 为 null |
| IA-08 | 启动清理只含 `.owner` 的中断目录 | 手工建只含有效 `.owner` 的目录 → `initialize()` | 目录被删除 |
| IA-09 | 启动不删归属无效/损坏目录 | 建 `.owner` 内容错误的目录、`session.json` 非法 JSON 的目录 → `initialize()` | 两个目录及内容原样保留 |
| IA-10 | 未知文件：校验在前，全部保留，会话解除 | 草稿目录放 `unrelated.txt`（及向导 `images/` 内已暂存图片）→ `cancel` | 抛含"未知文件"与 id；`unrelated.txt`、`session.json`、`.owner`、图片全部仍在（无部分删除）；`current` 为 null；随后 choose 可新建 |
| IA-11 | 链接拒绝删除 | 草稿目录放指向外部文件的符号链接 → `cancel` | 抛错；外部文件与链接均保留；会话解除 |
| IA-12 | 保存已开始：不删除 | 让 publish 失败（回执丢失）使 `publication` 存在、`phase==='failed'` → `cancel`；再 `close()` + 新控制器 `initialize()` | `cancel` 抛"保存已开始"；目录保留；重启后恢复同 id 且可 retry 发布成功 |
| IA-13 | publication 存在时 choose 返回当前草稿 | IA-12 状态下 choose | 返回同 id，`picked` 不增（维持现状） |
| IA-14 | 删除期间请求被门闩拒绝 | 挂起 AI → 并发发起 `cancel` 与 `resume`/`current` | `cancel` 完成前 `current` 返回 null；其它 mutation 拒绝"正在删除这次导入"；最终目录不存在、`active===0` |
| IA-15 | candidateBlocked 后可删除并新建 | 令 `commitCandidate` 落入 `CandidateCommittedBlocked`（保存回调后抛错）→ `cancel` → choose | 删除成功；choose 得新 id，不再抛 CandidateCommittedBlocked |
| IA-16 | 向导会话删除含运行时与图片 | wizard 选项会话，暂存 1 张图片、写 `runtime.json` → `cancel` | `images/`、`runtime.json`、临时文件、`session.json`、`.owner` 全部删除，目录不存在 |
| IA-17 | 暂停不删除 | 运行中 `pause` | phase 为 paused，目录保留，可 `resume` |
| IA-18 | `discard` 协议兼容 | choose → `discard` | 与 `cancel` 相同：目录删除，view null |
| IA-19 | PDF 预览中取消 | PDF 来源，挂起预览请求 → `cancel` | 预览请求取消、`pdfRequests` 清空；目录删除；PDF 准入重新打开（下一次 PDF 来源可检查） |

## 主进程接线静态用例（同文件）

| ID | 名称 | 预期 |
| --- | --- | --- |
| IA-S01 | `cancel`/`discard` 在 `serial` 外分派 | `act` 中 `cancel`、`discard` 分支位于 `this.serial(` 之前；`choose()` 体内不调用 `abandon` |
| IA-S02 | 关闭链路仍调用 `close()` | `desktop/main/index.ts` 的 `closeData`、`releaseOwner`、`disconnected` 仍调 `novelImport.close()`；`stopTasks` 仍调 `pauseAll()` |

## 浏览器用例（改写 `tests/browser/novel-import.test.ts`、`novel-import-wizard.test.ts`；真实 Chromium + 真实 NovelImportDialog/Wizard，夹具 `tests/helpers/novel-import-ui-fixture.tsx`）

| ID | 名称 | 步骤 | 预期 |
| --- | --- | --- | --- |
| IA-B01 | 关闭按钮/Esc/点击外部均删除 | 分别在 source、running、paused、failed(无 publication)、conflicts 屏 Esc、点击遮罩、"取消导入" | 每次夹具记录 `cancel` 动作；对话框隐藏；任务栏不显示导入按钮 |
| IA-B02 | 不再出现保留草稿与收起 | 遍历 source/select/confirm/running/paused/failed/conflicts/patches 屏 | 不存在"停止并保留草稿""丢弃导入草稿""稍后处理""收起"按钮；不存在"后台继续"文案 |
| IA-B03 | 向导停止导入直接删除 | 向导运行步骤点"停止导入"；识别中步骤点"停止导入" | 记录 `cancel`；无二次确认；对话框隐藏 |
| IA-B04 | 再次导入作品先询问替换 | 有未完成导入时点击侧栏"导入作品" | 对话框打开为"开始新的导入"，含标题；"返回当前导入"回到原屏且无动作；"删除并重新选择"依次记录 `cancel`、`choose` |
| IA-B05 | 配置模型不删除 | 点击"配置模型"（经典与向导图像模型） | 不记录 `cancel`；派发 `desktop:settings-section`；夹具关闭设置后对话框恢复原屏 |
| IA-B06 | 保存已开始只收起 | publication 存在、failed（retryPublication）时 Esc 与"收起" | 不记录 `cancel`；对话框隐藏；任务栏按钮可重新打开 |
| IA-B07 | 完成后关闭不删除 | completed 屏点"关闭" | 不记录 `cancel`；任务栏显示"导入完成"按钮 |
| IA-B08 | 删除失败提示且对话框关闭 | 夹具让 `cancel` 拒绝"导入草稿目录含未知文件，已保留：<id>"并随后 `current` 返回 null | toast 显示该错误；对话框隐藏 |
| IA-B09 | 非本端删除提示 | 对话框打开时夹具推送 `view:null` 事件 | toast"导入已中断并删除，请重新导入作品"；对话框隐藏 |
| IA-B10 | PDF 页核对子窗口不触发删除 | 打开 PDF 页核对再关闭；打开导入记录再关闭 | 不记录 `cancel`；回到导入对话框 |

## 真实目标系统验证（隔离数据根，打包前 `npm start` 构建产物）

真实 Electron，数据根指向新的 `mkdtemp` 目录（不使用 `~/.shakeink` 与 LOTM 根），合成 `.txt` 来源，无模型。

| ID | 步骤 | 预期 |
| --- | --- | --- |
| IA-R01 | 导入作品 → 选文件 → 到选择内容屏 → Esc | 对话框关闭；`novel-imports/` 下无目录 |
| IA-R02 | 导入到选择内容屏 → 退出应用 → 再启动 → 导入作品 | 直接打开文件选择，为全新导入；磁盘无旧目录 |
| IA-R03 | 导入到选择内容屏，关闭对话框前再点侧栏导入作品 | 出现替换询问；确认后旧目录删除、新导入开始 |

## 既有用例改写原则

- 依赖"重启恢复未保存草稿"的用例（以实现后全量运行失败清单为准，预计含 NI-S08、NI-S12、NI-S13、NI-LB04、NI-LB05、NI-LB07、LOTM-V03、LOTM-L-V01、NIW-C17、NI-L04、NI-PDF08/17、LOTM-E01 等）：
  - 若断言目标是"publication 存在时恢复"，保持并确保夹具已进入 publication；
  - 若断言目标是跨重启的冻结/检查点字段本身（预算策略、卷章归属、语义状态），改为在同一控制器内用 `pause`→`resume` 或直接读取 `session.json` 验证；不在测试中加入产品不可达的"恢复开关"；
  - 若断言目标就是"恢复未保存草稿"，改为断言删除（由 IA-05/IA-07 覆盖）并在用例表登记替代关系。
- 每条改写在 `docs/237-import-abandon-verification.md` 列出：原 ID、原断言、改写后断言、理由。
- 不得删除与本次无关的断言凑绿；基线既有 57 项失败单独列出，不计入本次通过/失败。

## 通过标准

- IA-01～IA-19、IA-S01～S02、IA-B01～B10、IA-R01～R03 全部通过。
- 全量 `npm test` 失败集合为基线 57 项的子集（不新增失败）；`npm run typecheck` 本次改动文件 0 错误；`docs/requirements-traceability.json` NI-07 更新。

## 独立审核与补充（2026-10-30）

子代理只读审核结论：有条件通过。已核对其证据（`novel-import-ui-fixture.tsx:54/61/78`、`index.ts:78` `SHAKEINK_TEST_ROOT`、`scripts/verify-sidebar-navigation.mjs:162`）。以下补充与修订优先于上文。

### 浏览器夹具修改（`tests/helpers/novel-import-ui-fixture.tsx`）

- `cancel`/`discard` 返回 `{view:null}`，此后 `current` 返回 null；`options.cancelMode:'unknown-files'|'publication'` 使 `cancel` 拒绝（前者随后 `current` 返回 null，后者保持 view）。
- 渲染 `NovelImportTaskButton`；`suspended` 由夹具状态切换（`setSuspended(bool)`）；记录 `desktop:settings-section` 事件；暴露 `pushView(view|null)` 模拟主进程事件。
- IA-B01 追加：用户发起的取消后不出现"导入已中断并删除"提示（IA-B09 的反向）。

### 新增 / 修订用例

| ID | 名称 | 步骤 | 预期 |
| --- | --- | --- | --- |
| IA-03（修订） | 取消后再次导入为全新 | IA-01 后 choose | 新 id ≠ 旧 id；`picked` 为 2；新会话 `phase==='source'`、`revision===1`、`selected` 为空 |
| IA-07（修订） | 启动清理遗留草稿 | 旧控制器 `pauseAll()` 后不 close，**先**以新控制器 `initialize()`，再处置旧控制器 | 新控制器初始化后目录已不存在；`current` 为 null |
| IA-10（修订） | 未知文件 | 同上 | 错误文本精确为 `导入草稿目录含未知文件，已保留：<id>`；其余同上 |
| IA-11（修订） | 链接与硬链接 | 符号链接；另一草稿 `session.json` 建硬链接（`nlink>1`） | 均拒绝、全部保留、会话解除 |
| IA-12（修订） | 保存已开始不删除 | 同上 | `cancel` 抛"保存已开始"；重启恢复同 id；retry 后 `published===1`，`publication.requestId` 等于会话 id 未变 |
| IA-14（修订） | 删除期间门闩 | `cancelAi` 为挂起的 deferred；发起 `cancel` 不等待；期间 `current`、`resume` | `current` 为 `view:null`；`resume` 拒绝"正在删除这次导入"；释放后目录不存在、`active===0` |
| IA-14b | 重新加载竞争 | 挂起 AI；并发 `close()` 与 `current` | `current` 为 null；close 结束后目录不存在 |
| IA-15（修订） | candidateBlocked | 复用 `novel-import-source-reselection.test.ts:60` 的 owner 提交后失败手法 → `cancel` → choose | 删除成功；choose 得新 id 不抛 |
| IA-19（修订） | PDF 预览中取消 | `novel-import-pdf.test.ts` 的 `isolatedPdf` hold/release；预览挂起 → `cancel` | 客户端 `active===0`；目录删除；随后新 PDF 会话 `read-pdf-page` 成功（准入重开） |
| IA-20 | 保存中退出保留 | publish 挂起 deferred → `close()` 与新控制器 `initialize()`（close 等待 publish 结束） | 目录保留；`publication` 存在；新控制器恢复同 id |
| IA-21 | 完成后新导入 | 完成一次导入 → choose | 新 id；旧 completed 目录与作品不变 |
| IA-22 | 追加来源不受影响 | choose → `choose({append:true})` | 不拒绝、不删除，文件数增加，id 不变 |
| IA-23 | 启动遇未知文件跳过 | 遗留草稿目录含 `unrelated.txt` → `initialize()` | 不抛；不加载（`current` null）；目录及文件原样保留 |
| IA-24 | 删除中途失败可恢复 | 故障注入使 `.owner` 删除/rmdir 失败 → `cancel` | 仅剩 `.owner` 的目录；下次 `initialize()` 删除它 |
| IA-25 | 向导图片生成中取消 | `generateImage` 挂起 → `cancel` | 收到 abort；`imageOperations` 为空；目录删除 |
| IA-26 | 运行中取消无死锁 | AI 挂起时 `cancel` | 2 秒内完成（替代 IA-S01 的源码顺序检查，S01 保留为辅助） |
| IA-B04b | 保存已开始时再点导入 | publication 存在 → 点导入作品 | 打开当前导入，无替换屏，无 `cancel` |
| IA-B04c | 替换时删除失败 | `cancelMode:'unknown-files'` → 删除并重新选择 | 不发 `choose`；toast 显示错误 |
| IA-B05（修订） | 配置模型不删除 | 同上，另静态断言 | `NovelImportWizard.tsx` 与 `NovelImportDialog.tsx` 的配置模型入口不再调用 `hideNovelImport()` |

### 真实目标系统（修订 IA-R01～R03）

用 Playwright `_electron.launch`，`env.SHAKEINK_TEST_ROOT=<mkdtemp>`（`index.ts:78`），沿用 `scripts/verify-sidebar-navigation.mjs:162` 的模式；`app.evaluate` 替换 `dialog.showOpenDialog`，返回合成 `.txt` 并计数。IA-R02"直接打开文件选择"判定为：替换后的选择计数 +1、新 id ≠ 旧 id、磁盘无旧目录。新增脚本 `scripts/verify-import-abandon.mjs`。

### 既有用例改写（补充）

明确纳入：NI-S07（`choose` 返回暂停草稿、`picked===1` 与 IA-04 相反）、NI-S10、`novel-import-source-reselection.test.ts:60`（close→重开恢复 candidate-blocked 草稿）；`fixture().dispose()` 调 `close()` 后会删除草稿，处置后再查磁盘的断言需改到处置前。

基线失败名单复制为 `docs/evidence/236-baseline-fails.txt`；改写的用例不得属于基线 57 项失败，防止失败掩盖行为变化（NI-LB07 属基线失败，改写时单独记录其改写前后失败原因相同）。
