# 新场景清单纠错增量验证（335）

2026-11-01。332/333按序独审后，仅service、payload及新RC测试修改，未改wire合法集合、原完整validator、canonical/main、两代生成上限或预算。原文/Key/raw不进入源码或证据。

原代码RED实际15节点：2pass/13fail。8个首坏后预置好控制已实际到第二代编译成功，失败在旧反馈无字段/根示例；RC03当时停在缺示例，预算子项未达。最小实现后RC17/17；作者相关8文件203/203（含重叠service/core等，不相加）。作者与334独立tsc及diff均0。

主代理最终8文件组合包括identity core/service/session/actions/closure/UI、持久化验证器及RC：176/176，fail/cancelled/skipped均0，日志`/private/tmp/scene-roster-correction-final-combined.txt`。其中新增验证器第3项已计入176，不再另加。原scope的mock/合成数据不冒称实际供应商成功。

`npm run build:desktop` exit0，日志`/private/tmp/scene-roster-correction-desktop-build.txt`；UI源未变，复核R28构建303 renderer文件hash均一致，复用该成功UI构建。构建身份`scene-import-verification/build-identity-r29.json`，新增334代码审核已限定通过，完整报告见334。

使用另外命名的私有helper重新bundle当前service/prompt，保留旧helper/manifest；protected main/service在helper构建时未改变，之后desktop按新源正常重建。当前单包诊断使用同一个按原controller重建的R28首包，不等同历史失败raw或新鲜全文。原private root、只读模型usage、拒绝DB/metadata写、state hash和正常app退出门保持。实际结果如下；新鲜全文、发布及重开仍未通过。

## 当前接口同包实际复验仍失败

32.865秒、2gen均stop，原state hash不变/app正常exit0。第一代wire形状合法55条：context label错误消失，但quote未匹配18次、literal不唯一2次、literal与name/alias不一致10次、name/alias未覆盖10次，21条有错。第二代wire合法30条：quote未匹配20次、literal与name/alias不一致1次、name/alias未覆盖1次，10条有错；均被原完整门拒绝。不得把这当新鲜R29全文成功，实际上R29全文未启动。安全标量见`scene-import-verification/r29-roster-readonly-probe.json`。

说明补充prompt/字段反馈解决了本包context及根结构问题，但不足以保证逐字转抄长输入的quote。下一步336/337评审应用有据片段索引替代编码：当前包精确连续片段编译成原Anchor后仍过全部原门，不能模糊配对/修改坏raw。
