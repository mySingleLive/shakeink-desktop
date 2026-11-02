# 场景复核修复与真实整书续验

2026-10-31，依据296/297及300独审，298/299及301独审。当前未完成新会话实际整书保存/重开验收，不能将本文件的定向通过当作完整导入完成。

新增普通scene-only复核的严格全文unitIndex编码、完整单位副本显式索引及独立复核prompt；保留原精确raw引用接受集合、作者解释分支、投影/锁定/知识/范围/授权门。仅向导普通场景复核使用最多31包wave，原预算/包内容/body-facts屏障/完整任务几何不变，不改审核模型或thinking；候选提交前在serial内重核权限/来源/epoch，失败排空、成功包可保留，覆盖按完整任务顺序保存。

UR真实RED8节点（1通过7失败），新协议后置部分子项当时未执行；GREEN UR11+原RA38共49/49，300独审另跑49/49。pool首份无效夹具RED不计业务证明，修正后有效RED16节点2通过14失败，主要到31屏障及lane拒绝，不回填为全部后置门已执行。实现首GREEN11/16，抓到候选替换grant引用及legacy成功包未跳过两处问题；修复后16/16，301独跑16/16。另真实RPC传回形式的机器码/固定中文拒绝先RED3/3失败（错误保留30个成功credit），窄修精确本地错误白名单后GREEN3/3，301独跑3/3。

最终同一源码定向组**349/349通过，0失败/取消/跳过**，含原319、新UR11及wave19节点。无增量类型检查、桌面构建及diff检查通过；只见既有MODULE_TYPELESS_PACKAGE_JSON提示，不运行全仓测试。非wizard/组合/作者解释保持原通道，审核配置不变；合成controller的私有review重试不是普通UI/journal恢复验收。

R22保留原结果：935场景阶段全部成功、294014.56ms，完整后置第三包引文错误失败、driver2/app0，未发布。旧91单元/137资料请求在新增完整索引元数据后，严格预算门于generate前拒绝（0模型调用）；这属于应有预算校验，不能记为新provider失败或扩大额度绕过。采用原planner对同checkpoint剩余全部5405单元重排，首个合法包的只读复测与全新R23随后补记；不裁材料、不伪造R22 publication恢复。

原planner已实际离线重排：60个合法body包精确且无重覆盖全部5405待复核单元（5589减已完成184），原checkpoint/semanticState不变、AI/fetch均0。首包90单元、137资料及投影、935目录，payload245700字符，低于原81920×3上限；纯service guard证明该包到达生成入口，而旧91包仍在生成前拒绝。仅做合法重排，不把首包或离线计数当全文复核通过。

该首合法90单元范围已由当前DeepSeek接口实际只读验证通过：1次生成、stop、114566输入token/51356输出token、1290响应字符，完整runImportAi末端门通过，配置hash不变且正常app退出0；审核模型thinking未改、输出额度未扩大。只证明本包，不能代替整书。[离线重排](scene-import-verification/r22-review-replan.json)、[只读实际结果](scene-import-verification/r22-replanned-reference-actual.json)。R23新会话已启动，全部场景默认全选及完整body/facts复核、保存/重开结果待实际完成。

R23冻结16项构建身份：[构建](scene-import-verification/build-identity-r23.json)；数字-only观测器沿用291/22已审字节；driver只增加303独审通过的冲突现场保持分支，等待正常作者处理而不退出删除草稿，不自动resolve或发布：[观测身份](scene-import-verification/r23-observation-identity.json)。真实Key、全文、完整journal和响应只在隔离private临时目录，仓库证据只记录计数/哈希/结果。

R23实际结果：924/924默认全选场景全部done，0失败/跳过/丢弃/映射警告，289上级引用，5589/5589清单识别单元覆盖，1402章及正文hash保持；完整场景时钟400793.818084ms（6分40秒，含进入verify被驱动观察），满足420000ms。全部5589正文单元的review随后真实完成，但facts阶段在原`模型结构事实超过复核分片预算，请细分设定后重试`门失败：合法scene2长字段达27529字符，旧piece上限16384。**完整发布/重开仍未通过**。[场景阶段](scene-import-verification/r23-scene-stage.json)。

另已验证冲突来源版本问题：原前36项的16个source.value与真实当前字段不匹配；32次合法原semanticDecision分支（15 source/inferred、1 a/b）均在AI和写入前以原版本门拒绝，网络/模型/提交0，原文件和私有owner不变。不能靠放宽版本门、清空冲突或假造通过解决；306/307独立修复该编码。[只读版本门证明](scene-import-verification/r23-source-version-guard.json)。

为保全测试现场并停止重复费用，先SIGSTOP已核对的驱动2492以防自动继续；正常UI返回修改选择→仅修改名称与目录→确认返回work，全部924资料/任务/候选/作者决定/章界/正文/title/target逐值与事前相同，runtime待处理0。此次返回时jobs已空、epoch未变，**没有新增pause proof，不声称drained暂停验收**。随后正常app.quit，observer停止且pending0/无写失败，退出处理器记录code0；恢复旧驱动释放调试连接后PS确认2492/2493均退出。驱动因受控关闭后的TargetClosed结束1，不冒称导入成功或正常全流程退出；完整私有前后检查点已保留，public标量不含正文。308/309长字段方案与306/307版本方案进入独审/TDD，之后使用新构建重新做真实完整验收。
