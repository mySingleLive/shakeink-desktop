# 完整纠错与已核实事实保留：最小用例

2026-11-01。依据344，合成资料及受控真实generateJSON桥，不读小说/调用provider。新增定向测试；旧new-roster privacy只区分完整prior资料块与静态反馈，不能删prior来通过。

| ID | 固定fixture | 必须断言 |
| --- | --- | --- |
| RR01 | 首代多row，既有完全有效row，也有形状合法但一坏ref/primary的row，其余mentions/context仍有效；至少两端有据link、多个完整证据及长Unicode/CRLF窗口；含合法json fence首失败；第二代预定完整修复 | 原first失败；真实第二prompt含完整上一输出（含坏项与raw-only哨兵）的明确untrusted块，静态反馈不含哨兵。fence不能清空保护。第二代保留所有已证source facts并完整通过；记录重排/targetIndex正确重建、ref/raw/span等价编码可接受，不能锁旧行号。无结果拼接/第三代，首bad结果不能直接提交。 |
| RR02 | 第二代本身完全合法但删一个有效row/坏row内好mention、同数换位置、缩原quote窗口、删context证据、挪owner、删link/改relation/端点或证据；东/西同称两row合一（有/无context）；原rows仍全在但额外加AB bridge | 全部须被新增保留门拒绝，而非机械成功；最多原2gen。相同literal坐标却缩窗口仍失败；所有旧nonempty owner用对首代occurrence universe的**精确投影**保留，每个当前nonempty投影也恰匹配某旧owner，新增桥接不能放过。允许原overlap不变及真正新member，不只比总数/旧targetIndex。完全无grounded事实的幻觉不锁，旧full metadata下unknown literal不被派生洗白；未验证关联不强造来源，最终仍整份过原门。 |
| RR03 | 原完整实际第二prompt UTF8固定reserve精确N/N+1（含prior及真实反馈）；v1小窗实际prompt+6000 N/N+1及0/未知16000；初始payload越界；网络/取消/length；普通scope未配置回调 | N可执行原第二代；N+1首代1次/第二代0次且固定失败，不截断prior/增常量/cap/gen；v1不能借65k当额外额度，原profile不改；初始材料超限总0。generic未注入时原prompt、默认反馈、用量/取消/两代行为不变，回调不泄漏到generateText/provider options。原length仍拒绝，网络/abort不被结构纠错伪成功。 |
| RR04 | 控制字段/未知键/私密值位于完整prior，以及保留错误/静态指导；相同窗口不同unit及仅一端grounded的link | error.feedback/known paths/静态指导/普通日志不echo数据；完整prior按数据断言逐值保真，不误当泄漏。source key必须含unitHash与完整Anchor/ranges，不可跨单位重绑；不锁未经证明的endpoint或claim，不因其存在放过最终坏结果。 |

先真实入口RED：证明旧代码会接受缩减第二代，且缺完整prior；新回调API未实现可单列，不能冒作全部RED。记录实际节点/未达后置，必要现有new-roster及generic回归、tsc/diff后冻结。实际R32的42及31是343证据，不将合成测试或本门推断冒称全文已通过。
