# 场景资料字段澄清验证

2026-11-01，依314/315及独立方案/用例审核。R25、R26仍是未完整通过的历史运行，不因本轮静态通过回填为成功。

窄修仅native场景的固定TEXT_GUIDANCE及text.description，明确当前目标场景资料说明、全部不同有据事实与相关关系/历史/时间/归属完整。原小说/输入payload与全部事实值不改，原schema除该注释外的文法、适配validator、能力判断、模型/role/cap、纠错与终止门保持。没有字数硬裁、接受length或提高7分钟门槛。

TDD真实RED8节点5通过3失败（两个description缺失叶子及一个父节点）；SPG01缺失前置之后的长值保真、SPG05新增注释预算拒绝断言当时未到达，不补写执行。GREEN5组68/68，覆盖实际SDK MockLanguageModelV4 doStream/responseFormat业务说明、超过27529字符的text与四字段、Unicode/CRLF和8引用逐值保真、持续length拒绝、原两生成纠正、普通review与完整预算门。Mock仅证明交付及数据/门保持，不替代真实供应商行为。

根代理当前源码定向回归292/292，0失败/取消/跳过；无增量typecheck与diff检查通过。WG03仅剥text.description注释后保留原payload哈希19ffb899…4fb6和原schema文法哈希50e3f7d1…a34，不删除原断言。独审建议后又强化普通review的实际SDK prompt隔离断言，SPG8复跑通过（仅测试断言调整，产品不变）。代码独审、桌面构建、同目标实际复测与新鲜整书结果待补记。

此前旧prompt只读实测：[R26形态记录](scene-import-verification/r26-raw-shape-readonly-actual.json)。其首gen精确包含52/56个原文单位的JSON转义串，共47388/51388源字符；这是当前快照首请求重建的复写证据，未证明历史挂起流字节同一或具体字段位置。

316独立代码审核通过：独立68/68，SDK普通通道隔离补强后另8/8，不将重复节点相加。桌面构建exit0，仅有既有MODULE_TYPELESS_PACKAGE_JSON提示。新指导同R26目标实际只读复测1gen/stop/604输出token、1123响应字符、wire valid、完整资料1，通过全部原门；原56单元/51388字符未减，完整原文单元复写计数0，state hash不变/app正常退出0。新值并非应用截断，cap仍32768。此单项不代替整书：[新指导实际](scene-import-verification/r26-profile-guidance-readonly-actual.json)。

R27冻结18项新构建，1055/1055默认全选场景全部done，0失败/跳过/丢弃/映射警告/pageerror；282父级、5589/5589全文识别覆盖，1402章及正文hash保持。正式阶段297560.754958ms（约4分58秒，含进入verify被驱动观察）低于420000ms。完整body/facts复核正在进行，发布/重开尚未通过；只记场景阶段：[冻结构建](scene-import-verification/build-identity-r27.json)、[阶段结果](scene-import-verification/r27-scene-stage.json)。318/319仅为旧R23资料保留值扩散的离线草案，未实施、不改变本轮构建或验收门。

R27完整后置复核仍失败：2350首wave后，第二wave首77单元（工作索引2350–2426）未获credit，另30包保留成功，累计4718/5589正文、facts0、59pending冲突/19遗漏。safeError仅显示通用处理失败，driver2/app0，未发布/重开。原失败reply和历史payloadHash未持久化，不能断定根因。按2350不可变快照原planner重建77包，guard到生成前通过；当前接口只读重放1gen stop/118115输入35518输出token，返回1冲突/0遗漏，原main pure semanticMissing/addConflicts/queueMissing均通过，配置及source不变/app0。该重放未直接复现历史异常，不回填R27通过：[真实失败](scene-import-verification/r27-review-failure.json)、[单包重放](scene-import-verification/r27-review-packet-replay.json)。

两项独立原文阅读另确认提案可提交性风险：正常setting-body UI只允许source/inferred/rewrite，部分候选短句会整体覆盖多事实字段，部分关系候选给名称或自身ID，不能据此盲选或改写原小说。所有建议只在600私有文件，未作作者决定；320正在起草最小提案完整性/关系早校验方案，须独审及新鲜全流程验证。

320阶段A设计已独审批准：独立12组合成回复审计，3个合法正控全部通过；8类回复被JSON桥一次接受，却在service末端拒绝，均映射为通用UI错误，未能使用原第二生成纠正。重复unitIds原本已在JSON桥两次拒绝。没有service-final接受/main拒绝的缺口，人工坏例不代表丢失的R27历史回复。现仅批准将同request可证明的原missing门前移并保留末端/main，B/聚合未批准、318/319未实施：[合成缺口审计](scene-import-verification/r27-review-validation-gap-audit-scalars.json)。

320阶段A已完成321用例独审、RED/GREEN及322代码独审，独立92/92通过，末端与main校验保留。使用其独立诊断bundle对同一77单元实际只读请求复测，1次生成stop，152193ms，返回0冲突/1遗漏；service末端及原main pure校验均通过，owner写入0，配置和13项源码身份不变，app退出0。这只是当前合法回复的接收验证，不证明原历史失败已重现，也不替代新鲜全文导入。公共标量与源码身份见[遗漏校验实际单包复测](scene-import-verification/r27-early-missing-real-replay.json)。

用户已明确要求同名/泛称按小说具体地点分开。323具体身份方案最终稿经独立审核通过，进入324用例阶段；尚未实现或运行新身份版本的全文测试，R27仍按上面的真实失败状态保留。320B及318/319仍未实施。
