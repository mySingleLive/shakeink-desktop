# 有类型联合最小用例及条件TDD

先422→423顺序独审。PRIVATE代码424独审后root最多执行两次；候选②达到422实际条件才可实施下列产品用例，否则产品全部未执行。旧R49本地门不放宽。

| ID | 固定fixture | 必要断言/证据范围 |
| --- | --- | --- |
| TU01 | 冻结R52 B′真实2tasks（selection 2项、不可reject完整replacement）、同原prompt/witness | ①仅该纯anyOf object节点追加type；②仅items纯anyOf展开+对象键序无关精确叶去重。schema diff范围精确、原对象/hash不变、①全部anyOf branches有type，②无嵌套纯anyOf/ref/defs。原/①/②完整Ajv见证及固定wrong-count/range/缺字段/额外字段/各三种record/别名20+1等结果相同；重复叶键重排也去重，非等叶不可合并。 |
| TU02 | 新两例真实SDK→新helper共享匹配→生产ModelService/Gateway→fake最终出口 | 同promptSHA与witness，候选schema实际text.format type/strict/schemaSHA正确，thinking/cap原样；each1/global2/retries0，不因失败补试；200的delta/SDK/直接JSON/原tuple/witness分别记录，400仅现闭合原因投影、不跑response schema。原R54执行/tee/161表不改，真实当前接口由root另执行。 |
| TU03 | PRIVATE存储、流/资源/撤权/取消等原控制 | 复用已证R54控制并精确hash核复用源，700/600/wx、原quit timeout不可cleanup0覆盖、全settle/drain、旧各批源/CJS及368保护hash同。只保存synthetic输出和固定投影；无真实资料/Key/headers/URL/开放error。 |
| TU04（条件） | 从产品原schema派生uniform基线 vs 新factory，tasks0/1/multi，selection/可reject与不可rejectreplacement混合，完整三record与多CF | 新raw Native only表示无refs/defs/tuple items，所有union叶有原type，完整结构值/上限不丢；原uniform基线与新union固定正负接受结果等价，不把它们与旧tuple的更窄Native接受集混同。选择0仅原应用task资格；legacy name/aliases、primary、新三数组均可表达。无range合并/取首N；坏位置即使满足uniform union仍被原应用位置门拒。 |
| TU05（条件） | 经runImportAi/实际SDK options边界的合法answers及错count/越界/错task类型/非法0/错误replacement；首轮/根恢复/旧repairs回归 | 新schema实际发出；所有canonical/source/retention/owner/版本/四代/Native first与root模式原门保持，不能靠新schema吞非法答案。此本地验证不是当前供应商行为。新功能先真实RED，再GREEN，旧断言只调整有意schema表示，不能删语义断言。 |
| TU06（条件） | 原CI16K临界、实际130 first及历史77+59代完整材料/草稿/当前回复/全部目录/keep/任务/native schema | 所有实际bytes计入原预算，2/3/4 N/N-1与fixed N/N+1必要定向控制；0API全130+136量测，源hash前后绑定。超预算不抬容量/截断/删候选，公开只安全标量。新产品代码独审及root fresh全文均另记，不能把静态两例成功当fullacceptance。 |

实际HTTP400/timeout/非JSON/错误witness均如实记，不增加第三次；①通过而②未达条件仍禁止该产品方案。联合展开只验证受限实际factory树，不借此实现通用JSON Schema优化器。
