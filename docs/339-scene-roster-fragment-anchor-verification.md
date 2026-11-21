# 原文片段索引的实现及当前接口诊断（339）

2026-11-01。336/337独审后实施；FA旧代码RED实际23节点，17pass/6fail，真实generation新wire拒绝与缺模块/缺工厂分别记录，后置未达未倒填。新增FA29与原RC17合并46/46，相关9文件232/232均0失败；主代理包含identity/UI/closure等最终9文件205/205，重叠不相加。作者及338独立tsc/diff0；桌面build0；R28 UI源与303产物hash复核未变并复用。构建身份见build-identity-r30.json；这些均不是实际全书证据。

按最新controller.stageRequests计入全部fragments metadata后，全书原5589 units为72包，首包71 units、payload244195字符，SHA e1232b19666376077b1c5d89184cb41044d5d045edaf7e4ecc0403b21a60964a。没有沿用旧94单位/旧payload身份。另命名新helper实际bundle，旧helper保留，原授权/只读usage/DB与metadata拒写/state hash/正常退出门不变。

## R30新首包实际仍拒绝

2gen均stop。第一代invalid_json；第二代JSON/wire形状通过，29条中一项primaryMentionIndex=1但该项仅一条mention，原编译门拒绝。额外只读计数（不是接受路径）发现8条至少一个问题：literal在所选quote中未覆盖或重复6次、context label未覆盖2次、primary越界1次。索引本身无范围错、无引文转抄字节错误。三处literal在toFragment所指片，模型按含尾界理解，而原wire明确不含尾界；另有少数选择其它位置。没有修改该raw或容忍索引错误。

## R31连续前24单位手动小包诊断

仅取上述首包连续前24单位（20129源字符），使用相同冻结代码和原两代/角色/校验，**不是stageRequests包、不是全书/coverage验收**。实际11.950秒，2gen均stop/invalid_schema；第二代14条中3条有错：literal未覆盖5次、context label未覆盖1次，其中4处literal恰在toFragment（被半开区间排除）的片段，另1处选择其它位置。说明纯缩小输入不足以消除数值换算错误。正常app exit0、state hash不变，未发布/重开。

两次安全标量在scene-import-verification/r30-roster-readonly-probe.json、r31-roster-readonly-probe.json。模型raw/小说值不复制进本证据。接下来340/341评审opaque ref及首mention名称编码，保留旧wire含义和所有原双唯一/source/canonical/main门；全书真实验收仍未通过。
