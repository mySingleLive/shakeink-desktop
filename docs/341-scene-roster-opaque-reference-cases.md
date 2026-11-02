# 精确片段ref与首提及记录：最小用例

2026-11-01。依据340，仅合成资料。新增`tests/unit/novel-import-scene-roster-opaque-reference.test.ts`，既有FA仅适配获准新增ref表示，原完整文字/metadata/预算/旧协议断言不弱化。

| ID | 固定fixture | 必须断言 |
| --- | --- | --- |
| OR01 | 原raw合法基线；新首提及record+ref包含两处同称地点、真实别名、长Unicode/CRLF、context/links | 经真实runImportAi→generateImportAiJson→generateJSON桥，新合法wire产出与原raw相同完整canonical；第一literal定name，其余exact distinct aliases原序生成，所有重复mentions仍保留。首未知ref→预定完整好第二代恢复，持续两代坏仍拒绝。旧代码先真实入口RED，不以新helper函数缺失代替。 |
| OR02 | 确定性表、同片文本在不同位置/单位重复、空/空白单位；id/file/start/end/text逐项变动、单位重排；重复同一输入制造实际ref重复 | ref格式及固定版本hash/range与独立fixture期望一致，全部片段concat原文；当前绑定每次重建，不复用旧ID缓存。重复ref整表固定拒绝、不覆盖。表/快照不可外改，resolver返回值改动不影响后续，ref仅恢复一片不拼邻片；未知/改大小写/空白/改hex精确拒绝，不能从后缀猜坐标。 |
| OR03 | 混合三种record/anchor、多键/own undefined、自填目录；第一条坏但后有好mention，原primary=1/len1、原raw坏name或quote；21种其它literal；重复quote/重复literal及跨片literal | whole strict wire先拒坏shape；不能丢坏项/换分支/取首好项/修raw/截断aliases。原primary、半开和raw合法备选保持原义；显式半开扩大/窄raw可解单片无法满足的唯一引用，ref本身不隐式修复。canonical仍原双唯一、名称/别名覆盖与完整门；首派生name/alias错误只指mentions等真实wire字段。 |
| OR04 | 新metadata完整payload及实际text/review角色预算N/N+1；非scope字节基线；受控错误包含raw-only秘密哨兵 | ref全部进入原完整serialize及worker预算，planner同原serialize，不去掉单位/尾白/片段，不增加重试/cap/16KiB reserve。每次纠错最多6条且message≤250 UTF-16，只known路径/固定说明，不泄露ref/私密值/未知键；非scope旧表示、旧generic及canonical合同不变。 |

记录真实RED/GREEN节点和未达后置范围，必要FA/RC/CI回归、tsc/diff后冻结交338之后独立增量review。无provider/App/build/真实小说读取；实际诊断及全文由主代理执行。
