# 九类设定真实消费者用例独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 当前结论

**增量复审通过，SC-CR01夹具启动问题已关闭。** 最终测试显式等待模块真实入口ready后才mount，并保留初始化错误诊断；独立唯一NI-SEM-B01运行 **1通过、0失败、0跳过**，实际走完九类真实消费者、真实worker回信及零错误/零网络断言。以下保留初审失败，避免将夹具失败写成产品RED；通过仅为消费者契约，不代表正式导入/发布或应用验收。

仅审主代理指定两测试文件，没有产品改动、真实app/模型/数据库/CUA或额外browser suite：

| 文件 | 初审SHA-256 |
| --- | --- |
| `tests/browser/novel-import-semantic-native.test.ts` | `79df51877cdf8f83654cd339a09594fdd8481f2a5350484927df3e92f9803a0b` |
| `tests/helpers/novel-import-semantic-native-fixture.tsx` | `7a3a173c52ca96f55b78123d281cc23d8e45b471defdd3cad5be65f4556a73e8` |

## 初审代码判断

- fixture直接使用仓库真实 `SettingContentEditor` 及生产 `monaco-setup` 的本地Monaco注入，未实现替代Setting/MarkdownEditor。安装版 `monaco-editor/esm/vs/editor/editor.worker.js` 由esbuild独立打成IIFE，Blob worker URL只是适配内存opaque-origin文档；返回的是实际Worker并收集message/error，没有stub worker、伪造响应或把主线程fallback当成功。
- 所有React/CSS/main bundle/worker由about:blank的内存setContent/style/script传入，不创建HTTP监听、HTTP/file导航或借设计稿抵充。全网络route拒绝；API fetch也记录并拒绝。最后断言requests/意外fetch/pageerror/workererror均空，且真实worker至少有一次回信，测试成功才可证明这些条件。
- LEVEL_SYSTEM覆盖single、多途径、子等级；CONCEPT、FACTION及六类{text}均使用已有消费者。可见控件/预览断言源首末文本，输入只改指定目标字段后对完整native对象deepEqual，防止其他字段/末项被替换或丢失。六文本与CONCEPT通过真实Monaco定位后键盘输入并回到真实Markdown预览，未通过setValue伪造编辑结果。
- 合成数据与onChange属于消费者契约，未走导入helper/publisher或数据库。即使本用例通过，也不证明NI-SEM-P01/02的真实导入投影、资料语义或实际应用验收。旧消费者本来支持这些形状，早期module Blob/opaque-origin失败只能记夹具兼容问题，不当生产RED。

## SC-CR01 · 夹具模块ready需要可靠握手或明确初始化诊断

初审测试在 `page.addScriptTag({content:script,type:'module'})` 后紧接 `page.evaluate(window.mountSemanticNative...)`，没有显式等待这个导出就绪；若模块初始化失败，当前finally关闭页面而没有带出已收集的pageerror。独立执行实际在test37失败为：

```text
page.evaluate: TypeError: window.mountSemanticNative is not a function
```

应在本两测试文件范围内定位模块初始化/时序原因，等待明确ready并在失败中保留受控pageerror诊断；不能通过改生产、stub worker、换HTTP/file预览环境绕过。已向主代理反馈，由其安排单owner，本审核未改源码。

## 独立精确执行记录

唯一获准命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM-B01:' tests/browser/novel-import-semantic-native.test.ts
```

第一次在上述hash下独立执行：exit1，tests1/pass0/fail1/cancelled0/skipped0，总时长约2.47秒；失败发生在mount前，不能记九类实际消费已验证。为区分启动时序/稳定失败，在原文件未改时重跑同一命令，1/1通过、约3.71秒；已明确通知主代理，不能仅靠重跑绿关闭该可出现的启动race。没有执行其他名称、产品/app或真实数据。

待夹具稳定后只复审受影响测试文件，并按相同精确命令运行，追加最终消费者契约结论；仍保留与正式导入/发布及原生应用验收的边界。

## SC-CR01增量复审与最终结论

最终仅改test：`tests/browser/novel-import-semantic-native.test.ts` SHA-256 `1a416e1974d944a097d53f6eae15a359dc235b470e662e503c5b7b8bcd6f78e3`；fixture仍为 `7a3a173c52ca96f55b78123d281cc23d8e45b471defdd3cad5be65f4556a73e8`，没有产品/worker实现变更。

module插入后用 `waitForFunction(typeof window.mountSemanticNative==='function')` 等实际入口ready，再调用mount；没有sleep、重试、stub或测试环境换导航。等待超时会连同已捕获pageerror/console error与原cause报出，测试末尾还要求consoleErrors为空，未隐藏模块/Monaco真实错误。原九类内容/编辑/deepEqual、真实worker回信/worker零错误、零请求断言均保留。

独立在最终hash下仅执行本文件同一精确命令一次：**退出0，tests1/pass1/fail0/cancelled0/skipped0，总时长约3.86秒**。这次实际经过完整九类消费者断言，而非停在模块插入。未执行任何其他browser/NI、模型、app/UI/CUA或用户DB。

**最终：此新增SEM-B01消费者用例及夹具审核通过，SC-CR01关闭，无剩余本范围必须修订项。** 现有真实SettingContentEditor/MarkdownEditor/Monaco本来支持这些native形状；本用例只提供其消费契约证据，不能当作SEM-P01/P02真实导入产物、业务字段映射、语义正确性、正常应用或真实整书验收通过。初审opaque-origin/初始化问题始终保留为夹具问题，不记生产RED。
