# 410 私有 Native items A/B 诊断独立代码审核

结论：最终冻结增量通过，无剩余阻塞。可由主代理执行一次 R50，两例各一次、最多两次最终 fetch。不准重跑小说或 R48；本审核未运行 App/API，未读取实际小说、请求/回复或 Key。新观察不能复原 R49 已取消的错误正文，也不能证明供应商普遍遵守 schema 或全文验收通过。

依据为 408/409 及其独立审核，包含 tee 有界等待补充。仅 PRIVATE 工具与独立诊断 CJS，R49 产品未变。

A 直接来自当前两任务/三 choices 的生产工厂，保留完整 tuple、definitions/$ref 和 replacement 三支；B 只将同节点 items 换成精确去重 anyOf 对象并删除 additionalItems，其余深等。去重对象键序无关、数组顺序保留；共同静态 prompt/witness 经完整 Ajv 验证可满足。不通过过滤或修正模型答案制造成功。

真实 SDK 经过共用 matcher、原 ModelService/Gateway 和最终 fetch 硬门；每例一次生成/一次实际 fetch、全局两次、SDK/外层重试零，模型、输入、thinking-off 与默认输出 cap 保持。wire 的 schema/input SHA 必须匹配，错配或 Gateway 包装后的调用预算失败仍是 harness 失败。HTTP 校验 not-run，错误/未知结果不补试；授权期间取消零生成，写/关闭/捕获不完整均不能冒充完成。

non-ok 仅后台 clone 读取，原 fetch 返回同一 Response，不改其身份或原异常。错误正文、开放 code/param/message、headers/URL/Key 不落盘：只输出固定状态、闭合 code/param 和九个关键词“提及”布尔；未知串为 other，不作根因断言。读限 64KiB、总 deadline 1000ms；恰限且 EOF 与恰限但未结束分别处理，截断/超时/读取或 clone 失败都不伪装完整。结果绑定捕获时的 context/owner，不以稍后的全局 active 关联另一例。

`Response.clone()` 会 tee，因此不能声称原取消零延迟。原 ModelService 的 body.cancel 可等待 clone 直至诊断上限/期限取消，另有调度及原链开销。真实 Response+原 Gateway/Service 的慢读、悬挂 read、超限、恰限 EOF/未 EOF 及实际默认 1000ms 控制，均证明原取消、transfer 释放、close/drain 可有限完成。单独挂起 clone.cancel 的控制只证明 observer 不等待其 promise；原底层 source.cancel 自身永挂另有 baseline，未宣称此工具能修复它。

只写新 0700 目录、wx/0600 文件；保留生成文本与不同 final 备份，完整 transport 但漏 delta/与 SDK text 不同仍判捕获失败。readonly usage、metadata/DB 写拒绝与正常 vault/gateway 授权保留；诊断不检查凭据，不声称正常授权凭据读取次数为零。原 quit deadline 覆盖退出调用与进程等待，cleanup0 不覆盖初始超时。

## 实际独立验证

- Node 24.18.0 + 绝对 tsx loader 执行新 probe test 与原 quit test：**21/21**，日志 `/private/tmp/scene-native-tuple-probe-independent.txt`。包含真实 SDK→同 helper matcher→原 Gateway/Service→fake 最终 fetch 的 A400/B200、redirect 二次 fetch 硬拒、真实 tee 链、隐私及资源控制。
- `node node_modules/typescript/bin/tsc --project /private/tmp/shakeink-scene-import-20261031/scene-native-tuple-probe-tsconfig.json --noEmit --incremental false` exit 0，日志 `/private/tmp/scene-native-tuple-probe-independent-typecheck.txt` 为空。
- builder/runner `node --check`、`git diff --check` exit 0。本审核未执行 builder/runner。
- author freeze 八文件/产物哈希及权限、101 个构建输入、R49 全部 **368** 产品源码/bundle/renderer 和原运行时逐项核对相同。runner 相对已审 R48 仅保护版本、私有路径/标签及两例/两 fetch 要求，原退出模块字节不变。

412/413 已另按序条件审核；410 通过不触发产品 TDD。仍须 411 的实际 R50 条件、原 tuple schema 对 B 的本地复验及共同合法 witness、全部 wire/保护/资源门成立，才可考虑后续窄编码实现。

## 最终 SHA-256

| 文件/产物 | SHA-256 |
| --- | --- |
| probes | `980d4c720530291220379fca4a5a1bd28b9d5c72e6dbe9839cf5726583c2b896` |
| cases | `557eb0bc58fde857c8ac518e23e59417bf012a7201fe6584f15b3986c99b9805` |
| helper | `e6cd98ec0f93d93d5412feaf617a7a486f98cae285520591bce5507c47498b5d` |
| test | `a68468bc8a62c160541d8fb4e9a902582189589bbe6ff70215321f5d2872875a` |
| builder | `be942e79de6357782b0e352debb1beff4660e0fec64f8afd26210ae4194959f6` |
| runner | `899fcc91a74819e9687b8fa85bb280ac9007621025a05e4990d045717c602e61` |
| CJS | `324b046ddf8e736254f2fe57ffdf4ce2bb499b0d6377eb14c89a1148eaa8401d` |
| manifest | `9535e0a33d30161092a3917f2aae1dd048a6257cf2162715d3008ffca55e8866` |
