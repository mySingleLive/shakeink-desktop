# 具体地点清单提示与纠错：最小定向用例

2026-11-01。依据332，全部合成资料；仅新增`tests/unit/novel-import-scene-roster-correction.test.ts`。通过真实`generateImportAiJson → generateJSON`桥及受控generation边界检查第二代实际prompt；受控输出预先固定，不因看到提示才伪造成功，不调用provider。实际节点数与RED到达范围写私有日志，不以本表数量替代实测。

| ID | 固定fixture及操作 | 必须断言 |
| --- | --- | --- |
| RC01 | 一组当前包原文含两具体地点、同literal不同上下文及Unicode/CRLF；分别首回根数组/字符串、合法shape但context元标签、名称/alias缺mention、unknown literal、声明unit不匹配quote、literal重复及坏link；第二代预置完整合法对象 | 首代原门拒绝；实际第二prompt出现对应白名单field/index及静态可执行说明，根类型得到JSON对象示例；第二代正常编译完整flat roster和sidecar，所有mentions/context/links、长精确quote、Unicode/换行及输入原值完整保留；只生成2次。不是供应商成功保证。 |
| RC02 | 持续两代坏shape或坏锚点；多行先合法后坏、多证据先好后坏；未知键/值、私密名称/ID/quote带独特合成标记；直接对象含own undefined额外键 | 两次仍失败，不drop坏项或容忍坏raw，不进入canonical成功；诊断最多6项且每message≤250字符，仅known路径/安全索引，不含任何合成私密标记或未知键。未知原因使用固定安全fallback。原strict schema/完整validator仍拒绝，shape先于semantic诊断；不以JSON.stringify抹掉undefined来测严格性。 |
| RC03 | 提示、wire/完整payload及既有非scope基线；实际role的原完整UTF-8预算边界；既有links/ownership/旧scene及非scene回归 | 新prompt逐项明示332规则及JSON对象示例；payload逐值/byte不变，wire合法集合与canonical结果不变，新增文字完整计入既有预算，16KiB wrapper reserve未改；临界不足仍原门0gen拒绝。旧scope反馈及行为保持原合同；原取消/网络/最终授权门使用既有覆盖，不以本增量模拟冒称实际系统通过。 |

实现文件仅service/payload与新测试。先记录真正旧代码RED（说明哪些后置断言未达），再GREEN与必要既有服务回归、tsc及diff检查；全书/原App/provider验收由主代理另做。
