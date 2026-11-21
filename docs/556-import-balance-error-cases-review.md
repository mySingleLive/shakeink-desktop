# 556 导入时模型余额不足的错误提示 测试用例 · 独立审核

审核对象：`docs/556-import-balance-error-cases.md`（对照 `docs/555` 及其审核 `docs/555-import-balance-error-plan-review.md`）。用现有夹具在仓库外临时目录跑过只读探针，跑完已删除。审核时未修改任何源文件或测试。

## 发现

1. **OK：BE-01 到 BE-05 可以直接用现有写法执行。**
   - NI-J05 已经用 `Object.create(NovelImportController.prototype)` 单独调用 `safeError`（`tests/unit/novel-import-request-schema.test.ts:245-246`），图像映射也有同样写法（`tests/unit/novel-import-wizard.test.ts:336`）。
   - `ModelAuthorizationError` 从 `desktop/core/model-authorization.ts:6` 导入，它的 `message` 就是 code，BE-03 的第二种输入成立。
   - BE-02 应该直接改 NI-J05 的映射表（`:259`），不要另写一份，避免两处断言互相矛盾。

2. **should-fix：BE-05 的期望含糊，要写成确定值。**
   - 按现有前缀规则（`desktop/main/novel-import.ts:2059`）：
     - `模型接口请求失败（HTTP 4020）` 以「模型」开头，长度小于 180，会**原样返回**；
     - `IMAGE_HTTP_500` 不在映射表里，也不匹配前缀，返回通用文案；
     - `前缀 模型接口请求失败（HTTP 402）` 以「前」开头，返回通用文案。
   - 用例应逐条写明期望值，不能写「通用文案或原样」，否则实现改了行为，用例也照样通过。
   - 另外补两条输入：
     - `模型接口请求失败（HTTP 402）` 后面加空格或 `\n`：应该不返回余额文案；
     - `Error` 以外的值（字符串、`undefined`）：返回通用文案。

3. **must-fix：BE-06 和 BE-09 里的「模型恢复」「把模型改回可用」必须指同一个模型恢复响应，不能更换模型。**
   - 探针：在 `rosterAi` 夹具里，`roster:character` 第一次抛 402。之后 `f.setModels` 换成另一个文本模型，再点「重新识别」，`stepError` 变成 `模型配置或授权已变化，请重新允许`。连续重新识别、`resume{consent:true}` 都无法恢复，只有 `wizard-revise{to:'tree'}` 再 `wizard-next` 才能恢复（原因见 555 审核第 3 条，`novel-import.ts:578,1715,2166-2167`）。
   - 修改要求：
     - BE-06 的写法照 NIW-C22（`tests/unit/novel-import-wizard-session.test.ts:134-145`），用闭包让桩"第一次失败、之后成功"，模型保持不变；
     - BE-09 的本地桩用同一个端点切换响应（先 402，后 200），不在设置里改模型。
   - 另加一条用例，覆盖方案最终采用的「更换模型」路径：
     - 如果方案只改文案，就断言文案里写的步骤（返回修改选择 → 继续）确实能恢复；
     - 如果方案修复授权刷新，就断言换模型后出现「允许并继续」，并且能恢复。

4. **must-fix：缺少图片任务的用例。BE-03 只测了映射，没有测链路和显示。**
   - 现有夹具 `withImages`/`imageFake`（`tests/unit/novel-import-wizard-session.test.ts:368`）可以注入 `generateImage`。补控制器用例：`generate` 抛 `new ModelAuthorizationError('IMAGE_HTTP_402')`，断言：
     - 该图片任务为 `failed`，`task.error` 等于图像余额文案（写入点是 `novel-import.ts:976`）；
     - 实体任务不受影响；
     - 其他图片任务仍会各自请求（当前行为，用例要把它记录下来）。
   - 显示要另外处理：向导的图片 chip 不渲染 `i.error`（`src/components/desktop/NovelImportWizard.tsx:170`）。在 555 决定是否增加显示之前，不能写浏览器用例声称"图像余额文案可见"。如果维持现状，应在用例表中注明"只验证存储，界面不显示"。

5. **should-fix：错误入口覆盖不全。现在只有角色清单（stepError）和角色实体（task.error）两处。** 按 555 审核第 5 条列出的写入点，用同一夹具补下面几条：
   - **会话错误 `s.error`**：分类识别（`classify` 的 ai 调用）抛 402，走 `launch` 的 catch（`novel-import.ts:2015`）。断言 `view.phase==='failed'`、`view.error` 等于 BE-01 文案。浏览器侧补一条断言：这时不出现「允许并继续」，因为 `/重新允许/` 没有命中（`NovelImportWizard.tsx:44,50`）。
   - **线步骤 stepError**：世界线或叙事抛 402，走 `novel-import.ts:1303`。界面走 `LineStep`，显示「重试」按钮（`NovelImportWizard.tsx:180-181`）。
   - **复核**：复核分包对 402 会重试，直到 `ROSTER_UNIT_ATTEMPTS=3` 次（`novel-import.ts:201,1467-1472`），然后写入 `failedPackets[].error`，再拼进 `checks` 的 consistency detail（`:1579`）。断言请求次数是 3，detail 里含新文案且总长不超过 400。
   - **设置任务**：设置任务的 task.error 也写在 `:976`。
   - 跟场景相关的现有用例里，402 被当作 `SCENE_FATAL` 立即结束（`tests/unit/novel-import-scene-roster-retry.test.ts:59` 用的是 HTTP 500）。可以在这个循环里加一条 HTTP 402，确认没有重复请求。

6. **should-fix：BE-08 需要修改 UI 夹具，并补齐断言。**
   - `recognitionFailed` 的 `stepError` 在夹具里写死为频率限制文案（`tests/helpers/novel-import-wizard-ui-fixture.tsx:31`）。要么给夹具加一个 `stepError` 覆盖项（这是测试 helper 的改动，需要写进用例文档），要么在现有用例 `tests/browser/novel-import-wizard.test.ts:218` 旁边新增一条。
   - 断言用 `getByRole('alert')` 的全文相等，不要用 `match`。
   - 另外断言 LineStep 的失败视图（`NovelImportWizard.tsx:180`）也显示全文。
   - 实体任务失败的 `ni-error-text` 在 11px 字号、窄宽度下会换行（`novel-import.css:41`），新文案约 50 字。截一张窄窗口截图作为证据，确认没有截断或溢出。

7. **should-fix：BE-09 和 AGENTS.md 兼容，但要补写约束。**
   - 兼容的依据：产品端点白名单本来就允许 loopback 的 `http:`（`desktop/core/model-authorization.ts:14-16`），本地桩不需要修改产品，产品也不会新开端口。桩只在测试进程里监听，不违反「无 HTTP 监听服务」。
   - 需要写进用例的约束：
     - **隔离数据根**：在全新的隔离根里添加桩模型。按既有经验，复制来的根要先移走 inbox lease receipt；`/private/tmp` 下的根可能已被清理，需要重新添加模型。
     - **密钥**：桩模型使用合成 Key，桩不回显请求头，日志和截图里不出现任何 Key。
     - **来源范围**：只选《诡秘之主》第一卷「小丑」，并使用新会话。
     - **证据**：证据目录放在本次运行的私有目录。台账结论写「本地 402 桩，真实 Electron」，不能写成供应商真实 402 通过。
   - 「重新识别成功」需要桩在 200 阶段返回 OpenAI 兼容的流式角色清单。如果桩不实现完整协议，这半句改由 BE-10 证明，并在 BE-09 里删掉。
   - 如果 555 采纳了 Anthropic 协议的修复（555 审核第 2 条），BE-09 要再跑一次 `protocol:anthropic` 的桩。没有采纳的话，补一条单元用例，记录现状：主进程合成的 402 正文，经 Anthropic SDK 解析后 message 为空。

8. **OK（需注明）：BE-10 是回归验证，不验证本次改动。**
   - 已充值账户上「识别角色」成功，只能证明原问题已消除，不能证明新文案。用例表应该写明这一点。
   - 运行方式沿用 LOTM 隔离运行时驱动（LotmVerification.app，Node 24），运行期间不构建。

9. **should-fix：台账与执行。**
   - BE-01 到 BE-10 和新增用例都要登记到 `docs/requirements-traceability.json`，只追加。
   - 单元和控制器用例的运行命令要写明 Node 24：`PATH=/Users/dt_flys/.nvm/versions/node/v24.18.0/bin:$PATH node --import tsx --test <文件>`。
   - 多个文件不要在 zsh 里用 `$FILES`，改用 xargs，并核对 tests 计数大于 0。

## 结论

**approve with changes**：单元层的用例可以执行，夹具也都现成。进入 TDD 之前必须先修改：

- 第 3 条：「恢复」不能靠更换模型；另加一条「更换模型」路径的用例。
- 第 4 条：补图片任务的控制器用例，并按 555 的决定写明界面显示的口径。

还应补充：

- 第 2 条：BE-05 写成确定的期望值。
- 第 5 条：补 `s.error`、线步骤、复核、设置任务这几处入口。
- 第 6 条：修改 BE-08 的夹具，用全文断言。
- 第 7 条：写明 BE-09 的隔离根、合成 Key、证据口径，以及 200 阶段的协议要求。
- 第 9 条：台账登记和运行命令。
