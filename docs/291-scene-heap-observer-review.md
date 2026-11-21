# R21只读数字heap观察独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。仅审核明确授权的数字observer、R21派生驱动及无真实数据的derivation元数据；未参与实现，未读取真实小说、profile、配置、Key或journal，未运行实际App/API。

**审核通过，无遗留阻塞，可在native bootstrap通过后开始R21完整流程。** 主代理已报告该bootstrap实际通过：worker1的四个非负safe-integer heap数有效、pending/writeFailures/timeouts均0、本地GET200、Electron exit0，并确认正常产品14项hash未变。本审核未读这些实际样本或将其改称独立执行。

## 有限协议与隐私

`observe-scene-heap-numbers.cjs`仅连接本地inspector；NodeWorker.enable固定waitForDebuggerOnStart=false，worker转发命令硬编码Runtime.getHeapUsage，随后disable/disconnect。没有HeapProfiler、Debugger、Runtime.evaluate、对象/脚本读取、业务包装、增heap或模型/DB参数修改。

JSONL只含时间/pid、main isolate的heapUsed/heapTotal及process-wide rss，worker仅序号及usedSize/totalSize/embedderHeapUsedSize/backingStorageSize四个非负安全整数；未知字段、消息、workerInfo/URL/名称及原错误内容不输出。不可把rss误当主isolate独有内存。目标路径须位于私有根目录内，真实parent路径也受限；文件wx独占创建、mode0600。

请求有固定10秒清理；stop取消timer、拒绝pending并等待在途sample/append，然后disable、移除监听、disconnect及清map。start失败走同一shutdown，stop期间不会新采样；计数/不可用状态保持静态。start的attached worker/sample计数本身不足以证明有效worker heap，故实际bootstrap必须检查四个数值；主代理已报告满足此条件。

## 正式验收门保留

独立反向移除R21驱动的4行observer flag/start/stop增量，恢复Playwright包导入及两处既有动态导入路径后，Buffer与当前`scripts/run-lotm-wizard-import.mjs`**逐字节相等**，源码hash为`f012f1b77efadbc538f1c1ea41d209bc4125db719f0f8dcaf91287284a9233c6`。不是仅相信作者derivation布尔值。

因而原新会话/全选/计时、任务/资料/正文与章界、失败保全、完整verify、pending conflicts、保存发布、完成及正常close等条件没有被这次派生削弱。observer在可信bootstrap后启动，在原finally排空；只增加私有数值侧记录，不插入成功结果。R21须继续正式发布及后续正常重开/快照比对，不沿用R20场景边界提前退出。

## 独立执行与冻结

纯VM/内存fs探针退出0：未知消息及合成秘密不回显、只固定数字字段和Runtime方法；pending主动清零，在途append未完成时不disable，排空后disconnect，stop后无新样本。该探针未启动真实inspector、模型或写实际观察文件。

两文件Node24 `--check`均exit0；独立SHA与冻结值匹配：

- observer：`d0d0aa99cc64d09e52865f211149605f267829935ce15caf9aa64c833c2c7095`
- driver：`3f6c1bd20b32189685e6ab07ce778f0ade0300180d13695dd3d79063e806773d`

本审核只确认该有限观察不会改业务输入/结果或验收门，不认证真实OOM已解决或整书已完成。仍以R21真实全部场景、正式用量、完整复核、发布、正常退出及重开逐项/逐章一致性结果为准。
