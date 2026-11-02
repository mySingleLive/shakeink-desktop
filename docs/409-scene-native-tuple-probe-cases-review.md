# 409 独立用例审核

结论：408 通过后，409 按序通过，可执行 PRIVATE TDD；尚未认证实现或实际接口结果。

审核版本：`409-scene-native-tuple-probe-cases.md`，SHA256 `d20b431d4f61c598af972bf0c170d41dbdc0635ffe66d4968ffd2d3e19621fa8`。

TP01–TP05 覆盖当前工厂单变量/完整引用、共同合法见证、真实 SDK 到 Gateway 的合成出口、逐例和全局实际 fetch 上限、秘密哨兵安全投影、原 Response/异常身份、有界读取与挂起取消，以及撤权、存储、原退出失败和 hash 不变。没有用 mock options 代替实际出站检查。

64KiB 边界应分别覆盖“恰等上限且已知结束”与“达到上限但仍有后续/无法确认结束”；后者必须不完整。后台读取故障可使诊断失败，但不得改变业务结果。HTTP/not-run、未知和失败不得追加请求补测。正式最多两次静态请求及 410 代码独审仍由主代理负责。

本审核仅文档，只读已定位生产 schema/ModelService 以核边界；未运行 App/API、未读真实小说、Key 或历史原始回复。

## TP04 真实 tee 链控制补充

按 408 的窄修正，TP04 必须实际组合原生 Response、原 ModelService/Gateway 及 fake400 源，分别覆盖慢读、悬挂 read、超 64KiB。检查 observer 立即返回同一 Response；随后原 `body.cancel()` 可等待 clone，但 clone 达固定期限/上限并发起取消后，原取消、transfer 释放、close/drain 皆能 settle，不以未等待的后台 promise 掩盖悬挂。用事件/可控时钟证明先后与有界性，不能用零延迟断言代替。

悬挂 clone.cancel 的隔离控制只证明 observer 不等待其 promise，不能证明真实 tee 的原取消已经完成。正常 HTTP400 链的额外读取等待允许达到 1000ms 诊断期限；源码和审查不得承诺原取消零延迟。此增量可执行合成 TDD，最终实现/证据由 410 独审，本子任务未运行 App/API。
