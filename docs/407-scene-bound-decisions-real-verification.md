# R49 应用绑定决定真实验证

本轮未通过完整导入。按正常向导、全新隔离会话、原小说全1402章/5589工作单元运行，2026-11-01 06:20:40.675 UTC允许分析，06:21:20.009识别失败，06:21:22.399正常关闭；App退出0、驱动退出2。没有跳过、发布或重开验收。

构建前根定向30文件637/637，独审17文件348/348，类型/桌面构建/diff均0；UI未重建，303 renderer文件与冻结旧构建逐哈希相同。130 first与136历史回复驱动新提示预算全合格、最高fixed63751/65536、历史50接受13拒绝保持。这些没有替代真实接口验收。

实际17个roster RPC中4成功、13全部为HTTP400，覆盖163工作单元、46成员/41记录/41身份/1关系。32次传输含19个completed与13个非SSE空正文终止；观察器捕获闭合完整，pending/观察失败/写失败均0且已恢复。不能把HTTP错误空正文称为成功模型输出。

0API重建正常130包planner，17实际payload哈希全部匹配；使用实际operationId和19个completed原回复逐代恢复时，32个actual inputText SHA全部匹配。4个正常成功可由completed回复接受，13条路径只在已捕获非SSE边界显式停止，全部对应answers.items为数组的bound schema。此重建没有复造原HTTP错误；生产ModelService会取消供应商非ok正文并换安全通用HTTP消息，原始错误原因现在不可恢复。

关联新tuple编码是待证假说，不能从HTTP400直接排除definitions/$ref或其它供应商子集限制。本地SDK会保留Draft7 tuple items数组，Ajv/SDK测试只证明方言合法和原样出站。下一步仅用合成数据做同模型/同输入/同参数、两次fetch硬上限的编码A/B，原书不重发；实际新请求与全部本地接受门通过后仍需新鲜完整导入。

证据：[安全标量记录](scene-import-verification/r49-normal-http400-observation.json)、[构建指纹](scene-import-verification/build-identity-r49.json)、[代码独审](406-scene-bound-repair-decisions-code-review.md)。原文/回复及operation绑定只保留在权限隔离目录，未进入本文。

补充离线限定：13个HTTP400边界的重建options schema里，4个原本没有$ref或definitions（任务数2/2/1/11），另9个有引用。因此引用不能被认定为解释所有R49失败的唯一因素。这是与actual prompt SHA匹配的本地options重建，不是额外声称已捕获当时wire schema或原HTTP正文；不新增接口调用。
