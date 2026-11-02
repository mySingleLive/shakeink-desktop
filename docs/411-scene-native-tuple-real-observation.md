# R50 两次 Native 编码真实观察

诊断执行完整，产品修复条件未成立。当前同一配置接口对 tuple-array 和 homogeneous-items **均返回HTTP400**；两次各一个final fetch，共2次，无重试、无小说输入。两份出站schema/input与预定SHA一致，共同prompt相同。两次HTTP失败的模型输出校验均为not-run，不能称B成功或满足原位置规则。

错误正文仅在内存限64KiB/1000ms读取，持久化为闭合投影。两者均完整parsed、code为invalid_request_error；A为219字节，关键词schema/ref提及，B为206字节，仅schema提及。固定关键词不能定位具体根因，原错误正文/任意provider字符串未留存。不能据A的ref提及认定definitions/ref是唯一原因。

App正常退出0、无quit timeout/page error，101个输入与368个产品/renderer文件前后哈希相同，状态未变、metadata写尝试0、broker关闭成功。private控制及独审21/21、类型/构建已过；这些只说明本次诊断有效，不说明供应商接受任意schema或整书成功。

root的412条件核验在B HTTP成功断言明确失败，未生成条件通过记录。412/413继续仅为未准入条件稿，禁止据其修改产品。后续先区分两份schema共有的引用/定义编码等候选，仍只用合成数据；不重新发送原小说碰运气。

证据：[安全标量](scene-import-verification/r50-native-tuple-observation.json)、[诊断代码独审](410-scene-native-tuple-probe-code-review.md)。当前产品仍为R49冻结版，完整场景导入/发布/重开均未通过。
