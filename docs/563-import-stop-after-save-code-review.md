# 563 导入保存后停止/删除：代码审核

审核范围：任务指定的 docs/560 相关改动（R1–R8 与 561 修订为准）。未改源码与测试。
已运行：`tests/unit/novel-import-stop-after-save.test.ts` + `tests/integration/novel-import-discard.test.ts` 32/32 通过；`--test-name-pattern="SD-|IA-12a"` 跑 integration/close-confirmation/abandon 三个文件共 4/4 通过。另把 SD-08 复制到 /tmp 加打印后确认：排队的 resume 真的启动了 publish，publish 成功后 `discards=0`，作品被保留。

## [必须修改]

1. **英文错误原因会出现在 toast 中。** `desktop/main/novel-import.ts:2766` 把 `error.message` 原样拼进「导入已删除；目标目录 … 留有未完成的文件：{reason}」。业务门关闭时 `business-gate.ts:9` 抛 `BUSINESS_CLOSED`（维护、迁移、目录重定位期间点删除就会遇到）。worker 的 zod 解析错误、Prisma 错误也会原样带出：`workspaces.ts:262-271` 中 `catalog.read`、`find`、两处 `release()` 都在 try 之外，不经过 `:299` 的中文过滤。修改建议：主进程这里沿用 `:299` 的规则，不是中文开头的消息一律换成「本地服务暂不可用」。

2. **任意 realpath/stat 错误都会删除预留，并返回 `none`。** `workspaces.ts:270`：`try{…realpath…}catch{await release();return none}`。遇到 EACCES、网络盘暂时离线等情况时，目录和半成品其实都还在，代码却删掉了预留记录（`protectedDirectories` 从此不再保护该目录），作者也收不到「留有未完成的文件」的提示。只有 ENOENT/ENOTDIR 才应该 release，其他错误应走 `kept`。

3. **等待保存结束期间无法收起窗口（违反 R7「保持可收起」）。** `NovelImportDialog.tsx:231` 在 `closeConfirmBusyRef` 为真时会挡住 `dismissCloseConfirmation`；`:268` 的确认框在 busy 期间把「继续导入」也禁用了。确认框是叠在主窗口上的模态层，主窗口的收起按钮点不到。publish 期间等待最长可达 `initialize` 事务的 120 s，作者只能干等。修改建议：busy 时把「继续导入」改成「收起」，调用 `hideNovelImport()`，删除在后台继续。

4. **SD-13b 的用例名与实际断言不符。** `tests/unit/novel-import-stop-after-save.test.ts:136` 标为 SD-13/SD-14/SD-13b，但用例中没有 publication，也没有「已有 publication 时改选另一个非空目录被拒」这一步，测到的是 SD-13c（含其他作品清单）和 SD-14。按台账规则这属于错标覆盖。需要补一个真正的 SD-13b，或改掉标签。

## [建议]

- **R2 的保留原因可能丢失。** `novel-import.ts:2747-2749`：discard 返回 `kept` 后，如果 `removeDraftDirectory` 也抛错（草稿含未知文件），异常会盖掉 `retained`，作者只看到草稿的错误，看不到目标目录留有文件的提示。可以把两条原因合并后再抛出。
- **删除时恰好保存成功，作者不会得到任何提示。** 删除等待中的保存如果成功（SD-02、SD-08），作品被保留，但 `abandonDraft` 只返回 `{view:null}`。确认框却写着「目标目录中未完成的文件都会删除」，作者会以为什么都没留下。建议返回一个标志，由渲染端提示「保存已完成，作品已保留在作品列表」。
- **两种品牌清单同时存在时没有拒绝。** `workspaces.ts:273` 用 `BRAND_NAMES.find` 先命中 legacy；current 的 `shakeink-work.json` 不以 `.` 开头，`:284` 的陌生检查不会拦它，于是按 legacy 名清理。`readWorkBrand` 在这种情况下会报 `BRAND_MARKER_CONFLICT`。建议两种都存在时直接返回 `kept`。
- **TOCTOU。** `removeTree`（`workspaces.ts:37-41`）在 lstat 与 readdir/rmdir 之间不复核身份。`guard()` 只在每个顶层条目删除前核对根目录，没有核对子目录。如果有本机进程在这段时间把 `database/` 下的子目录换成符号链接，readdir 会跟随链接。风险低，但可以在 readdir 之后再 lstat 一次，比对 dev/ino 是否不变。
- **目录锁。** `:288` 读不到 `owner.json`（`owner===null`）时把锁当作遗留锁删除；`lockDirectory` 在 mkdir 与写入 owner 之间存在空窗。实例锁限制了影响范围，但更稳的做法是：`owner` 缺失且锁目录非空时返回 `kept`。另外 `:295` 用 `removeTree(lock)` 会连锁目录里的未知文件一起删除，而 `lockDirectory` 的 release 遇到未知文件会拒绝（`:80`），两边规则不一致。
- **`chooseTarget` 的检查顺序。** `novel-import.ts:2036` 的空目录检查排在「恢复分析必须重新授权原来的目录」之前。旧草稿如果当初选了非空目录（改动前选择目录时不检查），恢复分析时只会看到「请选择空目录」，而原目录又被拒，只能删除这次导入。另外 `readdir` 失败会带出含路径的英文 errno。建议 catch 后给中文提示，并把空目录检查放到原目录判断之后。
- **测试强度。** SD-08（`:92`）只断言草稿被删，没断言 publish 确实执行、`discards===0`，即使 resume 被拒用例也会通过。SD-12（`:188`）标题称「step 21 仍是唯一首次保存入口」，实际只测了第 22 步的删除，入口的结论依赖 NIW-C61。SD-06 被并在 SD-02 里测，标题没有列出这个编号。
- **台账。** `docs/requirements-traceability.json` 中还没有 SD-* 条目。SD-01～19 用的是 mock 的 `discardPublication`，真实清理只在 integration 中验证。主进程到 worker 再到 Workspaces 的整条链路只有 SD-35 的接线文本检查，登记时不要标为端到端真实通过。

## [确认无误]

- **在途保存与删除。** `abandonDraft` 在 `abandoning=true` 之后排空 tail 和 jobs，publishing 状态下不调用 pause，而是等待 publish job 结束（`novel-import.ts:2730-2742`）；清理在 `serial` 内、`removeDraftDirectory` 之前执行（R5）。删除期间 `act` 拒绝新操作，`current` 返回 null（`:549`）。`close()` 等待 `abandonRun`（`:2721`，SD-19b）。
- **worker 层。** `novel-import-discard` 已加入准入列表，与同 id 的 publish 互斥，用 `discard:<id>` 登记，计入 task-status、stop-tasks 和 close（`desktop/service/index.ts:122-145`）。SD-31 对真实回调做 AST 求值后验证了这一点。
- **清理只在 `works.serialize` 内执行。** 判断顺序为：catalog 中已有作品返回 `work`；预留不存在或身份不符时只删除预留；requestId 和 requestHash 都要与清单一致；`ready` 返回 `kept`；只删已知条目，删除顺序符合 R4，清单最后删除，预留在清单之后释放。陌生文件和 `.DS_Store` 保留。顶层出现符号链接、`restores/`、`preserved/` 时整个目录保留。品牌名由清单决定（SD-32）。
- **`release` 的条件。** 只有在请求锁内、字段一致且 `phase==='pending'` 时才删除记录（`work-creation-reservations.ts:51-56`）。
- **`.DS_Store`。** 只在 `create` 中过滤这一个名称（`workspaces.ts:206`），SD-20/20b 用真实 PGlite 验证。
- **第 22 步。** 先校验 hash，再判断授权，不索取发送授权（`novel-import.ts:1725-1731`，R6）。`ResumeConsent` 在 `done` 时隐藏；「继续保存」在 `!targetReady` 时禁用，并发送 `consent:false`；保存中只显示「停止导入」。文案没有提到发送内容（SD-40～44）。
- **渲染端判断。** `deletableImport` 和 `abandonableImport` 分开（R1，SD-34）；有 publication 时关闭窗口只收起，删除必须经过确认（SD-43）。toast 中的目标路径是计划规定的提示内容，不属于泄漏。
