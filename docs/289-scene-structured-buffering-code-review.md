# 结构化流缓冲独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据287/288，检查generate.ts最小增量及structured-buffering专项，并独跑必要的structured-scene回归；未参与实现或测试编写，未读取真实profile、小说、配置或Key，未调用provider/API。

## 结论

**审核通过，无遗留代码阻塞。** 已验证显式schema模式不再解析未完成前缀，同时完整文本、服务器严格合同和原最终接受门保持。实际OOM是否解除仍须正常构建、真实全书及service isolate数值观察闭环，不能据本地合成测试宣称整书完成。

## 源码核对

`src/lib/ai/generate.ts`仅在callModel内为显式jsonOutputSchema构造output局部对象：展开原Output.object后，只覆盖parsePartialOutput为async undefined。已安装SDK的name、responseFormat、parseCompleteOutput及createElementStreamTransform均为原对象自有字段，展开保留其值/函数；没有换成Output.text、删服务器schema或改完整解析函数。

streamText原模型/providerOptions、maxOutputTokens、SDK零重试、abortSignal、onError/onChunk参数保持。无显式schema时不传output，普通文本路径和预览保持。没有修改SDK依赖、网络、并发、输出额度、heap或模型输入/业务数据。

SDK实际transform仍累积text，并在text-end或finish-step刷新缓冲；调用者继续等待原text/usage/finishReason。原generateJSON完整JSON解析、Zod、wire→canonical/身份/引用/证据及末端授权门未修改；finish非stop先拒绝，原两次纠错及用量/取消/错误传播不变。parseCompleteOutput保留不等于调用者新增消费stream.output；本审核最终接受依据是实际生成桥与原门。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-structured-buffering.test.ts tests/unit/novel-import-structured-scene.test.ts
git diff --check
```

**39/39通过，0失败、0跳过，退出0，约7.72秒**：buffering14项及structured-scene25项；diff检查退出0。不叠加此前同文件重复执行为新增测试，不运行全仓测试。

- SB01经真实AI SDK/MockLanguageModelV4分别输入1721及1722个小delta，对text-end和仅finish-step两种收尾完整交付。已知合成JSON的未完成前缀计数均0，完整候选均1次；最终text/数据、token、cost、一次usage记录和真实SDK schema/cap参数精确保持。
- JSON.parse计数只识别合成fixture前缀，委托真实parser并在finally恢复，串行子测试隔离；没有伪造解析成功或把正常协议/元数据解析计入故障。普通最终文本和业务数据仍由原parser/Zod实际处理。
- SB02完整坏JSON、完整业务非法及完整合法但length结束均保持两次失败；一次原有纠错可恢复且两次实际尝试用量累计。不是因为缓冲而接受不完整输出，也不跳过已完成但业务被拒绝的模型用量。
- SB03大体量中文/非BMP、全部场景事实与引文经generateImportAiJson→runImportAi→canonical门逐值保留，原请求和响应fixture不变；普通无schema流仍发布多次预览及完整末尾文本。
- SB04中途abort及供应商流错误保持原异常对象、仅一次模型调用、零该未完成流的成功usage记录，未变成格式重试。
- structured-scene回归使用真实Responses SDK和合成ModelService/ModelGateway确认实际出站json_schema strict、同model/endpoint、reasoning none、store false及两次相同32768上限；普通请求未增加这些参数。完整目录/父级/证据、所有严格反例、预算、有限恢复、controller保存及末端授权/快照/取消仍通过。

本次未独立执行真实内存/整书验证。后续只读数值observer仍需单独有限增量审核和身份冻结，不沿用R20 allocation采样或提前场景退出作为最终验收；完整复核、发布、正常退出及重开逐项/逐章一致性仍是通过门。
