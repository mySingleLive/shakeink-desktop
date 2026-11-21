# R52 本地引用展开真实观察

诊断执行完整，但两例仍均HTTP400，不准入产品改动。A′ tuple和B′ homogeneous均已完整展开10个原本地引用，剩余0ref；schema分别4880/4866字节，原prompt完全相同，actual wire schema/input SHA符合预定。两次各一个final fetch，共2次，无重试、不发送小说。

错误投影仍分别为A′219B、B′206B，code invalid_request_error，完整parsed；A′提及schema/ref，B′仅提及schema。这并不表示展开失败或B′含ref，实际wire已核无ref。HTTP输出校验均not-run；没有模型JSON可用于原位置/witness正控。

App正常退出0、无quit timeout/page error，103个输入及368个产品/renderer文件前后哈希相同，状态/旧R50源与CJS保持。private10/10、类型/构建及416独审均通过。当前产品仍R49，412条件继续不成立。

与R50合看，引用原样/展开和tuple/uniform这四种已测编码均失败。不能继续据关键词猜唯一根因，也不能把测试工具通过当产品通过。下一步应使用此前成功的最小静态请求作当前对照，并在闭合白名单范围提取更有诊断意义的错误原因；不再盲试小说或直接扩大产品修改。

证据：[安全标量](scene-import-verification/r52-native-reference-observation.json)、[独立审核](416-scene-native-reference-probe-code-review.md)。全部场景导入、复核、发布及重开仍未通过。
