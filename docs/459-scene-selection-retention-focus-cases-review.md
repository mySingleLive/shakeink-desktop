# 459 独立用例审核

结论：458通过后，459按序通过，无实质阻塞，可真实功能RED后实施。

审核版本SHA256：`cbc899a352673b35103fc229cf5c9c099ff10e92f634c763b46a4099fcbc906c`。

case1须同时保留Native拒wrapper与本地真桥明确解包→原整数域/全部原门通过的对照；裸值等价及错误种类、0/越界/非整数/字符串/继承/extra/accessor/Proxy/数组/null、getter0均有意义。只在selection task使用该替代，不能包装replacement或偷偷变更上游schema。

case2–4覆盖缺完整窗口atom、换发生位置、缩窗、限定/关系端点、owner拆合/桥接的原拒绝保持；diagnose按旧universe投影，不误报重排、独立新增组或旧组内新成员。诊断前后状态及返回值变更隔离需证明deepcopy/freeze不暴露first。完整受影响旧组/端点与对应当前投影必须显示，不能只给缺两atom而漏掉atom齐全的owner错误。根恢复仍严格重生成，不剥额外根、局部采用或自动补事实；持续坏owner/window四代继续拒绝。

case5–6的原parser生命周期与焦点互斥是必要控制：新候选清两者、source早退、不进入retention；invalidJSON仅保此前一个背景，当前通过/早拒/新问题清理或更新，并发不串包。完整转义block的16KiB N/N+1、必要组/端点超限、原fixed/context N/N+1应真实触达；超限整块省略，原完整base/目录/keep/draft/tasks/schema及原fallback不变、无额外SDK。私密文本/模型值只在明确数据块，原静态错误/公开日志不回显。

case7–8明确历史与真实结果分开：保持原R66实际31/28/3及61输入SHA；只有wrapper语义等价带来的历史变更可列为预期，其他原门不改。所有204历史请求/418旧捕获均有账，测全部实际可达新prompt，提早接受后的unused逐请求说明，used+unused=418，不造第4代；原130/新129首轮、新完整预算、4912分区/正文/1402章覆盖不采样。根定向/类型/构建/diff及独立code review后，再以原420000ms正常fresh全文、全资料/发布/重开/DB比较验收；未执行或未通过保持失败。

审核未改产品/测试，未调用App或模型API。通过仅准TDD，不以离线反事实或新增背景的存在冒作模型行为改善。
