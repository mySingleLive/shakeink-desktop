# 场景结构化流内存定向用例

- SB01：真实AI SDK+MockLanguageModelV4分成大量小delta的完整合成JSON，保留显式responseFormat/schema和输出上限。仅计数并委托真实JSON.parse，识别已知合成JSON的不完整前缀，不将必要SSE或其它JSON解析算作问题。证明原Output.object对不完整前缀反复解析，修复后不解析前缀；最终文本、token和一次真实usage回调完整保真。有text-end和无text-end但finish-step正常两种流均完整交付。计数包装必须finally恢复、串行隔离，不mock解析成功。
- SB02：真实generateJSON最终本地schema仍拒绝完整但业务非法JSON，保持原有限两次纠错；持续非法/最终坏JSON/finish length仍拒绝，不因取消部分解析而接受不完整输出。
- SB03：大体量Unicode/非BMP及全部场景资料字段的多chunk输出完整返回，不截断、不删字段；普通未显式jsonOutputSchema调用保留文本模式、原分块/预览行为。
- SB04：中途取消仍拒绝，无错误用量成功值/模型重试；原供应商错误、授权/快照/typed/evidence门由受影响既有组覆盖。

只使用合成数据、不接provider、不依赖不稳定RSS阈值伪造单位通过。实际内存改善必须由修复后全书真实服务线程数值观察证明，同时完成场景、复核、发布、正常重开和快照比对。无需全仓测试。
