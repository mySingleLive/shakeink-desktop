# 场景七分钟用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_review`。仅阅读254及相关既有scope/模型/调度测试设计，未访问真实小说、配置、Key或journal。

## 结论

**SP-01—04及SP-REAL用例设计通过，可先编写RED。** 允许按用户新增硬指标更新旧scene“模型策略保持原对象”的断言，但不能同时更新无关类别快照掩盖范围扩张。

## 具体检查点

- **SP-01**：scene entity的DeepSeek关闭thinking，原resolved对象及其嵌套options不变；model/modelRecord引用保留，store:false及原provider其它选项保留。普通scene/review/reconcile/item/world保持原对象；角色/roster沿用旧提取策略。不要只断言新字段存在而漏掉输入被原地修改的回归。
- **SP-02**：30+地点含仅别名在当前unit出现的条目、三级父级及确实无关的条目。逐请求核对自由instruction目录ID集合恰好为目标/名称或别名命中/父级闭包；完整request.entities仍为全选集合。所有units的id/text/start/end及evidenceOptions逐值对照，合法父级、四字段、text和证据最终保持；无关项的确被省略但不影响其它候选各自任务。避免只用请求字节数变小推断没有误删资料。
- **SP-03**：真实64场景controller路径记录缓存resolve/compute次数和每个请求的payload hash，第一次完整scope与grant.hash相等，同一epoch计算一次但每请求hash独立。scene的错误grant在AI前拒绝、warm/cold、对象/id/epoch/workingRevision/grant对象或hash变化、unverified及普通分析不走缓存分别覆盖。暂停恢复必须计算新的epoch scope并保留已持久化任务不重跑；可以参数化既有角色生命周期/暂停测试，但需有实际scene控制路径。
- **SP-04**：复验SI-07实际31pending/runtime/proof、合批慢写/写失败门，以及SI-09字段/anchor精确纠错上限和原生/证据/父级/发布用例。相关组测试数按真实结果记录，不把主代理与独立重复运行计数相加当新增测试数。
- **SP-REAL**：全1402章、默认全部本轮识别场景、完整5589等实际unit集合，数量按本轮真实结果。计时使用单调时钟，从授权识别前开始直到全部资料完成进入verify，固定阈值420000ms；另记entity阶段耗时和清晰边界UTC时间。超时/缺起点/使用旧进度/任一完整性断言失败均不能成功退出。不要在重试、清单确认或驱动重启后重新计时；不要把中途进度当结束时点。

计时门建议至少经代码审核核对0、阈值相等、越限/缺起点的控制流，特别是超时标记不能随后被completed分支覆写；无需为简单计时公式编写镜像实现测试。每个真实成功证据仍须包含导入完成断言、构建身份、正常关闭与数据库重开比较。受控选择器继续明确记录，不把它称为原生文件对话框验证。

本审核不表示新方案已满足七分钟，也不表示真实整书已完整导入。

## R8与SP-05补充用例审核

阅读254新增SP-05，**补充设计通过，可先编写RED。** 对原SI-08“缺parent失败”的断言按明确新合同更新为省略元数据可补全的正例；显式错误拒绝必须独立保留。

具体检查：

- 有可信parent的scene target省略entityType/parentId均补为确切目录值，根target只补PLACE、不添加parent。schema、生成桥、最终服务结果一致，四业务字段/text/有效证据和来源逐值不变，原输入对象不被修改。
- 模型显式给出错误PLACE、null/空串控制值、外部父级，以及**目录中另一合法PLACE但不等于该目标确认parent**时仍拒绝；根目标显式添加已有PLACE同样拒绝。不能只测未知父级而漏掉归属错配。
- facts整体缺失/null/数组/数字等非法形状、未知键仍拒绝；确认目录缺entityType或不是PLACE在AI前拒绝，不因补全获得权限。普通scene分析和其它实体不补缺省值。
- 分别用真实controller→runImportAi→generateImportAiJson链路制造invalid_json与finishReason不完整，前两轮失败第三轮有效须精确2请求/3生成，持续非法精确2请求/4生成后失败。中途取消/网络/授权/预算/持久化错误不增加请求；不能用宽泛异常正则代替错误类别和次数断言。
- 有据资料、父级及证据保持的成功例与显式错误负例并存；计时驱动固定七分钟仍包含所有纠错。不复制旧进度、不跳过场景、不以部分成功通过。

本补充只审核测试设计，没有读取真实失败响应或认证实际导入成功。

### SP-05可用外键提示用例补充

新增“仅有scene目录时固定提示不列characterId/itemId；加入合法character目录后列出characterId且最终合法引用原值保留”的用例设计通过。应断言固定提示段、非自由小说payload；最终schema仍须拒绝不存在或错kind外键，不能为了消除提示诱导而静默删引用。实际主流程scene目录裁剪和全可信目录校验保持不变。
