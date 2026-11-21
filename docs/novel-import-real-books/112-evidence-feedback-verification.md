# 引用纠正反馈：定向验证与真实恢复记录

2026-10-27。**定向代码、测试和构建通过；真实M01物品恢复仍失败，整书未通过。** 原session439f1633-9d21-40f5-9d8b-7f165cc66265保留，未丢弃或重建。

- 方案[109](109-evidence-feedback-plan.md) SHA48ed7a65…b1013；独立技术/限定用例[110](110-evidence-feedback-plan-review.md)最终PASS，首轮EF-TR01及仅两处J03提示前提修订历史保留。
- 独立代码[111](111-evidence-feedback-code-review.md) SHA2f58aa3c…3bf29，PASS无P1/P2；J01–10 51/51、A03/A06 2/2，0skip。首混合RED41/51与完整旧测试+仅新J10干净RED44/51分别留档；不能混为一次干净基线。
- 原算法、允许引用集合、精确短引文与排版恢复、原Error.message、一次结构纠正上限不变。只把已有四种内部原因映射为固定纠正信息，不改引用ID/正文，不跨单元补证据。真实rev63究竟是哪原因仍未知。
- [构建记录](evidence/evidence-feedback-root-build.json) SHA1d290dab…f513：global/audit类型检查及desktop构建均0；main037959保持，servicea457d3。UI未改未重复Next，五Monaco/PDFworker/主题及其它控制保持；未跑全量测试。

实际rev63物品失败快照afd45c3d…6374外部独占保存，成功outline1/character18/scene9与每类25覆盖保持。3827新进程启动前，92518正常菜单退出0，rev64 paused/resume failed，22项资料全等；无在途，不能计正式LIFE。原生重开同M01后rev66授权前22项、rev67授权后24项断言全真，原空目录device16777233/inode356642231保持。当前文本/审核两个逻辑角色仍同DeepSeek-V4.1-Flash deepseek-flash / api.deepseek.com，并非独立物理模型。

原生允许一次后rev80运行未完成item，operation4c7c35bc-bfaa-4bcc-9bb9-cdd8809ffe19，20:09:55.640Z开始pending。scope a28db76b…e13bc、资料payload74b9fd1c…9f34d与旧失败相同；固定校验反馈改变，不把payload哈希当完整纠正prompt相同。原正文23257/manual9/已成功材料和coverage均保留，不重抽成功类别、不发oracle答案。

角色/场景独立部分文学审核[报告](reviews/M01-D1-partial-characters-scenes.md)为当前NOT PASS，待最终QA新快照另验；55引文/31角色边/6地点父边机械有效不等于完备。大纲部分审核[报告](reviews/M01-D1-partial-outline.md)所记因果/归属缺口也保留。真实恢复的最终结果及后续类别尚待，不能计整书或六书测试通过。


## 本次实际结果：FAIL

rev81仍被invalid_schema拒绝，安全路径artifacts.8.evidence.0；item-evidence-feedback-failure-rev81.json SHAaebd3b024863b42830dda1b3b0daab6606d9e9c33fa9382d4c8c020ccec21d9f。runtime同operation4c7c35bc…fe19于20:09:55.640Z开始、20:12:07.445Z rejected。22项真实资料字段与rev63全等，物品0，后续未执行；原生UI已实见同一错误，未点再次重试。不能从路径猜具体quote、错单元或内层reason；本次细化反馈本身通过限定验证，但未解除实际物品阻断。

只读设置确认另有已配置文本模型“火山API / claude-opus-5-5”，保存的上下文上限为1000000，协议为Anthropic；这是用户配置声明，不验证供应商背后模型身份/质量或费用。查看后取消编辑，没有保存或改默认。已向用户请求临时更换默认文本模型后继续原稿、测试后恢复DeepSeek的设置变更选择；等待答复，不执行依赖动作。原稿保留且失败空闲，不算正式LIFE。

独立实际证据复核[报告](reviews/M01-D1-item-attempts.md) SHA f05f0e5c4eda67358238cdd98776eb2ff40c7a25498077613fff9f2e5053cc14：rev62→63→81的22项资料深等（当前375来源单元，不能套用早期373），原正文/manual9/28产物保持；两次pending→rejected冻结配对有效，物品阶段均FAIL、后续pending。审核者未亲自操作原生UI、不回推未知quote/reason，模型切换仍待用户选择。

## 用户决定：暂停 AI 重测

用户明确选择“保留 DeepSeek，先暂停 AI 重测”。保留原文本/审核模型配置，不切换备用模型，不新增AI请求。只读observer确认同session仍rev81 failed、原文精确与28项已有材料保持，runtime已settled/rejected，无需取消在途请求。原生确认错误仍在后仅收起窗口，入口仍为“导入需要处理 · RB-M01-20261027-D1”；未删除、重建或重试草稿。这里的暂停是用户工作安排，应用检查点仍是failed，不能冒称已执行paused阶段或正式LIFE。整书验收仍未通过，等待用户明确恢复后再继续AI重测。
