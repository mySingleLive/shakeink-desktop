# 结构化流缓冲方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。先审核287，再审核288。仅读取方案、用例及当前generate/已安装AI SDK相关源码；未参与实现，未读取真实profile、小说、配置或Key，未调用模型/API。

**方案通过，无设计阻塞，可先取得真实SDK分块RED再实施。** 已安装`ai/dist/index.js`的Output.object返回name、responseFormat、parseCompleteOutput、parsePartialOutput、createElementStreamTransform五个自有字段。其默认部分解析调用parsePartialJson；createOutputTransformStream在部分结果undefined时仍累积文本，并在text-end或finish-step发布剩余textChunk。generateText当前只消费最终text/usage/finishReason，不消费部分对象或element stream，因此收窄这条未使用路径可保持产品需要的最终结果。

实施须保持：

- 仅显式jsonOutputSchema模式覆盖parsePartialOutput为async undefined；通过保留原Output.object全部其它字段维持服务器JSON responseFormat/schema及完整解析能力。普通未显式schema模式不变，不修改SDK依赖、网络/stream模式、模型或端点。
- 不把parsePartialOutput换成文本输出模式，不跳过原最终generateJSON JSON解析和Zod/wire→canonical/身份/证据/原生/授权门。SDK的parseCompleteOutput保留不等于调用者一定消费它；实际完整业务接受仍须由原生成桥与后续原门证明。
- 最终text必须逐字完整保留，text-end与finish-step两种收尾都验证；不trim、截断、减少facts/引文或限制中文/非BMP。保持原输出上限、finishReason先于成功判定、两次生成及外层请求上限、用量和取消。
- 显式模式会缓冲到收尾，此处不承诺继续发布部分对象；当前调用者不消费这些对象。普通文本的分块与预览仍须独立验证，不因共用generate函数而改变。
- R20的分配位置是有据定位，尚不是完整保留链或已修复证明。测试不靠不稳定RSS阈值过关；新代码仍须实际全书服务isolate内存与完整流程闭环，不能用合成900场景或较小在途请求替代。

真实SDK测试、独立代码审核和定向/类型/构建通过后，可另审只读数值heap观察增量并冻结身份，再使用正常产品构建完成真实全文全部场景、复核、发布和重开。该观察仅允许固定Runtime.getHeapUsage数值，不沿用R20 allocation采样、业务包装或跳过后置步骤；R20仍永久作为诊断而非最终验收。
