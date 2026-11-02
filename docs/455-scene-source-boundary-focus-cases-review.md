# 455 独立用例审核

结论：454通过后，455按序通过，无实质阻塞，可先取得真实功能RED再实现。

审核版本SHA256：`7f020affcb63d57c00644e900488ad9d5439b80a09ae874233dcbf229eecbc9f`。

case1–4覆盖新增fresh策略/指纹与旧策略/cache/legacy隔离、旧跨1000的三字符缺陷经原resolver/full source gate真实复现、新单元max1000/连续slice/rejoin/ID、强句末/换行/CRLF/surrogate及无安全分隔fallback。原raw splitter不动、coalesce不增加切点及章节offset/content不变均有对应控制；不能只测新splitter输出长度而省略工作几何真正接线、旧cache身份与审核绑定，也不硬编码4912。

case5–8覆盖真实业务桥拒后完整focus、所选与全部合法候选完整quote、显式重新选择后原全门通过；不是把夹具或人工一CF替换冒作真实模型改正。未知ref、patch压缩、多任务/歧义、超16384或原fixed/context不足必须整块省略，原全量材料保持。实际转义后完整block的UTF8/边界、XML/JSON数据隔离、原文及模型哨兵不进入静态错误需实查；不能用截firstN或缩quote做预算正控。

生命周期控制有意义：真实source拒绝建立背景，下一轮invalidJSON不调用schema可保留旧值绑定背景，第四轮仍由模型明确返回；新parsed候选先清旧、当前source错误更新、source通过清除、早shape/range/未知形状不继承为当前诊断。须通过原parseJsonOutput和真实generateJSON/服务桥验证，而非只手调schema来宣称invalidJSON行为。原四代、Native和本地接受门、显式旧协议、source/retention/owner/工作限额/权限门保留。

case9保留原所有预算而计新完整焦点，测试超限块被省略后的下一次SDK仍含全部原source/CF/keep/draft/current；预算本身仍失败时不能额外调用SDK。旧130首轮+357历史代/146与27只作原几何控制，新fresh全planner按真实新单元集合覆盖，不采样、不冒旧SHA。最终类型/桌面构建/定向/独审与正常fresh全文、原420000ms、发布/重开另行验收，不执行全仓测试。

审核未改产品/测试，未调用App或模型API；只准TDD，不把文档/原型/人工改选记为产品或全书通过。
