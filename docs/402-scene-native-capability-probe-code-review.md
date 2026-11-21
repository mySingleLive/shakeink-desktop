# 402 私有静态 schema 能力探针独立代码审核

结论：最终 V2 限定通过，无剩余阻塞。可由主代理冻结后执行一次 R48 四例观察。未启动 App/API，未发送或读取小说内容、实际请求/回复或 Key；本审核不认证供应商普遍能力、R47 历史 wire，或完整导入通过。

依据为 400/401 及两份独立审核。范围仅 PRIVATE executor/helper/cases/tests/builder、独立诊断 CJS 与 runner；产品源码、bundle、renderer 均未改。

四例均为固定合成内容，完整 Ajv schema 严格校验并先有合法 witness。第三例完整保留生产 3015-byte generic repair schema；合法 replace/reject 的 patchMinItems 明确 not-tested。第四例仅有两个全字段固定值，因此 uniqueItems 只在本例表达不同项，不外推一般 claimRef 或跨项语义。整份直接 JSON 与原 parser 候选分别校验，不裁剪/修复结果；错误只输出闭合 keyword 计数。schema 不符合属于观察结果，HTTP/外部失败校验 not-run，不能当作约束服从或违背。

helper 使用原 native factory、真实 generateText/SDK、ModelService/Gateway，固定 thinking-off、原默认输出上限、SDK/外层重试零。四例串行，每例一次生成，最终 fetch 前另有一次硬门。实际 matcher 校验 body.text.format 的 type/strict/schema SHA 和完整 input_text SHA，错配在发网前拒绝；旧 context 不能借下一例预算。授权、只读 usage、metadata 写拒绝及 broker 关闭/activeCount 检查保留。正常 vault/gateway 内部仍需凭据读取与授权，诊断不 inspect/store 凭据、headers/URL、开放错误或 cause；不能声称凭据读取次数为零。SDK 的 systemConfig 读取尝试由 deny-DB proxy 阻断，不冒称尝试零。

仅生成的合成文本及固定安全字段进入新 0700 目录、wx/0600 文件；delta 与不同 done/completed 备份分存。错误文本、headers、Key 及输入/body 不保存。写失败、授权失败、wire/调用预算失败和关闭失败不伪装成成功；全部例 settled 后关闭 broker，再正常退出 App。

独审关闭了两处问题：退出 deadline 原先在 await app.quit 后才建立，现同一最初 deadline 覆盖 evaluate 和退出等待，cleanup0 不能覆盖 timeout；原 Gateway 包装第二 fetch 拒绝后可能被归 external-failure/ok=true，现 catch 优先可信闭包 violation/wire 状态。补充真实 SDK→共用 helper matcher→原 Gateway/Service→fake 最终 transport 的集成控制，实际证明四例 wire、schema/input 哈希、默认 cap/thinking、每例一次 fetch；307 触发第二 fetch 被包装后仍为 harness 失败，最终 Gateway 撤权后仅一次网络调用并停止后例。

## 实际独立验证

- Node 24.18.0 + 绝对 tsx loader：cases、executor、integration、quit 四文件 **21/21**。日志 `/private/tmp/scene-native-capability-independent-final.txt`。首版 18 节点未覆盖新真实链，不与最终重跑相加。
- `node node_modules/typescript/bin/tsc --project /private/tmp/shakeink-scene-import-20261031/scene-native-capability-probe-tsconfig.json --noEmit --incremental false` exit 0，日志 `/private/tmp/scene-native-capability-independent-typecheck.txt` 为空。
- builder/runner `node --check`、`git diff --check` exit 0；本审核未执行 builder 或实际 runner。
- PRIVATE freeze 12 个文件/产物哈希与权限逐项核对通过。新 manifest 的 97 个输入、367 个保护文件以及 R47 全部产品文件、原运行时 SHA 均核对相同。

## 最终主要 SHA-256

| 文件/产物 | SHA-256 |
| --- | --- |
| executor | `e8f32c58f846e4ecccb4b3f07f1977c645747c33b2cf95cad54bb7467945c363` |
| helper | `1db302ac126f69a9608cbb7cbe40d9dddcf5b3a460a6d0ea9c1f21698de9d5e1` |
| cases | `fc8188f76da3d15a5d8b9449db682cb67119f8a8dcd17f9eee3d96ac509eeaf1` |
| integration test | `7b010aa91ffed3dba154d8d4c6147b294961ede275a40aab7398b37d89d31a4f` |
| runner | `8a84246e6418fdae776eee268a75afa418aba912948f4c10f6d7cf061373a525` |
| quit helper | `f6a00412fbdbe57ddbeb3d44aaa647aaa1e58bb086464b62518215ca9d9f6fa3` |
| CJS | `8abeb6433ff6025ad356aee0fc1bad0f8f40d89cef6427b056e61f773640e2d9` |
| build manifest | `4146217e952b9bcb5f7f872a1c05536c9d211f4ff04192f442ce376a420afd10` |

其余精确输入哈希见 PRIVATE `scene-native-capability-private-freeze.json`；实际四例必须按同次 receipt 分别报告，不循环到符合或据一次结果作普遍保证。
