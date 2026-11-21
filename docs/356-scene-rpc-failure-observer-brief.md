# 隔离导入的安全RPC失败观察

R35全文首批存在RPC rejected，但消息经过safeError后为generic，原供应商回复未捕获，根因未知。仅新增私有测试observer及另名driver；产品源码/bundle不改。通过同一Node内置Worker.prototype.postMessage/emit观察既有实例的`novel-import-ai`请求与对应响应，原方法以原this/参数/返回值/异常原样执行。正常模型授权、用量DB、网络设置、全部输入及原计时门不变，不复用readonlyUsage。

私表仅关联RPC id、operationId及原payload SHA。响应仅记录fulfilled/rejected与**固定字符串完全匹配**的预算/不可定位分类；有限已知HTTP格式、Prisma代码只记安全数值/代码及“消息提及”分类，不能据此断言历史根因。未知只记unclassified，不保存message/stack/cause/value/raw/header。观察器异常和落盘失败均吞于观察边界，不吞原错误；输出目录私有，文件600，正常停止恢复原prototype并等待自身写队列。

独立审357后TDD私有合成Worker控制，再独审代码/driver差异；源hash不变后以新fresh正常流程复验。非RPC的main后处理失败仍可能未知，不能把观察器无错误当业务成功。R35已失败事实保留，R36只观察新运行。
