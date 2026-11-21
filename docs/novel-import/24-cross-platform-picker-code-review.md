# 跨平台统一来源选择器 · 独立代码审核

日期：2026-10-26。审核者：独立子代理 `unified_picker_review`。

**最终结论：本轮独立代码复审通过，CP-CR01、CP-CR02、CP-CR03 全部关闭。** 无剩余必须修正项。代码审核不替代主代理最后一次目标用例、类型检查及生产构建；最新执行结果以25报告为准，真实Windows未执行边界仍保留。

## 范围与方法

对照用户已批准17–19产品/UI、20–21技术方案及22–23定向用例，独立只读核对本轮新增选择器与接线，不将之前完整导入功能的未提交代码当成本轮diff。不运行全仓/完整导入测试，不修改生产实现。

- `desktop/main/novel-import-source-picker.ts` 和 shared 动作/视图协议。
- `novel-import-files.ts` 的可信grant捕获/验证/扫描接点，以及 controller 的grant透传、取消、空来源反馈。
- main选择器构造、IPC、窗口/主frame/owner与关闭/迁移/失联接线、preload与shared bridge、命令注册与菜单去重。
- 真实React选择框、独立store、主题/短窗CSS、DesktopApp挂载/原导入对话框挂起、统一入口和添加来源。
- 选择入口inflight去重、无任务错误toast，以及本轮新增unit/browser、既有NI-L01/NI-U08/UP与修改生命周期回调的定向用例证据。

## 初审发现

### CP-CR01 · P1 · 初始grant捕获不能先解引用再授权

初审版本 `captureNovelSourceGrant` 先调用 `canonicalSelection(resolve(path))`，后者逐项lstat后最终realpath。原文件或祖先可在lstat后被换成junction/link；realpath随后解析到另一目标，后续仅验证新canonical链，将新目标当作本次合法初选对象。后续proof延续虽已正确，仍不能修补初次捕获时已改变的授权对象。

需在新grant边界先对原resolve路径固定/核对身份链，拒绝符号链接/junction及realpath不再等于原路径；不要先解引用后授权。可以局限新grant边界，保持既有原生scanner的macOS系统别名兼容逻辑。定向回归须注入第一次检查后、canonical读取前的换入。

### CP-CR02 · P1 · 默认IO预算必须为主进程其他FS工作留余量

初审服务默认 `maxPendingIo=4`，与Node常见默认线程池大小4相同。反复取消/重开若留下4个不能取消的fs等待，虽然计数有界，仍可能占满主进程工作池，使保存/关闭的其他fs任务没有余量。需采用小于默认池大小的生产预算（本轮已商定2），继续跨选择会话统计真实未settle工作，超时和取消不能释放真实预算。

### CP-CR03 · P2 · 失败目录也应淘汰未展示节点

`list` 在成功和超目录上限时prune，但其他元数据超时或后置身份验证失败分支可能保留本次已检查而未展示的节点映射到下一次成功导航。建议所有失败收尾也按当前/面包屑/places/已选/展示项prune，避免异常浏览重复积累无用能力。此项不改变选择/授权语义。

## 已成立的代码链路

| 接点 | 审核判断 |
| --- | --- |
| 统一入口和菜单 | 侧栏、原生命令、旧兼容命令和添加来源均走同一语义；mac原生混选，其他平台走应用内服务；冗余菜单隐藏，旧ID/绑定分派保留且标签同为导入作品 |
| 可信grant持续至读取 | controller将内部grant送到scanner，直接文件对照原文件proof及祖先，目录递归前后持续核对原授权根；renderer仅发送opaque ID，普通动作strict CAS |
| 取消与晚到回执 | cancel仅同owner/id、无revision，前后端绕过目录队列；main同步撤销session并resolve原choose，renderer先退休ID/切epoch；旧current、navigate、confirm和事件不得恢复新/旧会话 |
| 生命周期排空 | beginClose、stopTasks/closeData、releaseOwner、主frame导航/销毁及失联的关键路径先cancel，再pause/close或gate drain；null结果在尾owner断言之前返回 |
| 目录只读与边界 | 浏览只用元数据，不读正文/模型/发布，不启动shell/PowerShell；明确目录项/已选数量上限，受保护/链接/不支持项禁用；盘符串行短超时后停止 |
| 实际React交互 | 文件/目录同列表，筛选不改变选择；跨目录已选与当前目录独立。双击恢复首击前状态，行尾导航/键盘有独立入口；导航/删除焦点有后继，稳定region覆盖加载/空/错误状态 |
| 短窗口和共享Dialog | CSS复用现有Dialog定位而不另加重复translation；目录/已选区可滚动，底部操作不收缩，玄墨/宣纸主题复用既有tokens |
| 空来源与重复点击 | 空扫描结果有固定可行动提示；首次无任务时toast可见，追加沿原Dialog错误区；请求/追加共享inflight选择promise，取消后不会因排队重复点击再次弹框 |

## 测试与真实平台边界

审核者只读代码和执行证据，不另跑全量测试。主代理补充NI-L04的no-op picker依赖并只回归该用例，属于本次新增生命周期cancel引用的接线回归，不是扩大到完整导入套件。最终通过条数、命令和最后源码构建状态由25验证报告承载，不能以最后生产修改前的构建当最新构建。

macOS真实OS多文件、目录和追加取消归UP-06证据；新选择器在当前机器的组件/固定平台分支验证不等同于真实Windows。Windows目标机未执行须保留；被策略拦截的HTML本地预览不借其他浏览器/HTTP绕过，也不将静态UI独审写为视觉实测。

## 初审状态（后续已关闭）

CP-CR01/02 已反馈实施者作定向TDD修订；待复读修订及最后相关证据后追加最终结论。除上述项，未发现新的必须改变已批准交互或扩大架构的阻断。

## 最终针对性独立复审

同日复读后端最后修订及新增用例，只读核对 [定向转绿日志](evidence/cross-picker-backend-review-green.txt)、[两项P1失败日志](evidence/cross-picker-backend-review-red.txt) 和 [能力淘汰失败日志](evidence/cross-picker-backend-prune-red.txt)。审核者未运行额外测试。

- **CP-CR01 已关闭**：新grant捕获从原始 `resolve(path)` 的 `pathIdentity` 开始，不先canonicalize。原路径逐项lstat拒绝链接，realpath必须仍等于原路径；随后access及checkIdentity再次对照原链。原生scanner的macOS系统别名逻辑保持原样。新增仅内部调用的beforeRealpath故障点在真实文件系统中注入目录链接、祖先链接及同路径目录替换，均拒绝新授权。故障点不在IPC/renderer schema中，生产调用不传该hook。
- **CP-CR02 已关闭**：默认跨会话在途预算降为2，为其他主进程FS工作保留默认池余量。超时或取消不释放真实未settle工作；五次取消/重开最多启动并保留2个真实等待，预算耗尽时拒绝新操作，迟到目录句柄关闭且真实settle后才释放计数。对应生产默认值子用例经历红转绿。
- **CP-CR03 已关闭**：目录失败catch在传播固定错误前同样prune，保留当前/面包屑/places/已选/展示项目，淘汰未展示的旧能力。新增失败导航后尝试旧未选ID的用例由可选入变为失效，证明不是只缩减显示清单。

此外，主代理补充的真实pending选择器 + `NovelImportController` + `BusinessGate` 用例使用仍等待places promise的实际服务，执行实际stopTasks回调，先cancel后撤销owner；原choose返回null、controller/gate在有界期限内排空，未结束IO仍计预算，关闭不会依赖目录IO先结束。旧命令标签已改为同一“导入作品”语义，兼容分派保留；这两项初审接线意见同样关闭。

最新UI/store、选择请求去重及空来源反馈的生产代码已核对，无新的必修项。至此可以进入主代理最终组合验证及总结，仍只执行22中本轮目标用例与必要编译。由于最后P1/prune修订发生在先前构建之后，最后构建及用例必须覆盖该源码状态；本复审不将修订前结果替代最终结果。
