# 清单首轮失败的安全枚举诊断

R37正常全文仍有unlocatable-json，R38对首个实际失败payload精确重建的新只读请求则一次成功；不猜历史回复。仅在原candidate无法取得、即将抛出同一失败的位置，附加固定内部诊断码：本次native合同是否启用、原StructuredGenerationError.kind、用原parseJsonOutput(z.unknown)得到的**候选类别**。类别只含unparsed/null/array/string/number/boolean/object-no-roster/object-roster-nonarray/object-roster-extra/object-roster-only/roster-oversize，绝不输出任意键名、值、text、message、stack或header。

保留原错误文案前缀并附固定ASCII枚举码，主界面仍经原safeError处理；只供内部RPC和私有测试observer严格解析为已知字段。候选类别不等于供应商原始根事实。观察器扩展仅接受闭合枚举，不能回显未知后缀。输入、输出、采用集合、次数、预算、模型及正常用量完全不改。

补充结束原因：generateJSON捕获自身StructuredGenerationError时，仅附不可枚举的可选诊断字段finishReason，取本次SDK结果的stop/length/content-filter/tool-calls/error/other/unknown白名单，未识别或不存在为unknown；不改错误identity、kind/message或回调结构/生成选项。service将该字段纳入固定内部码，以免把length与content-filter都只记作incomplete。没有SDK结果的直接parser分类不得猜stop。

固定内部码为原前缀加` [SRU1 native=<0或1> kind=<三种kind> finish=<上述七种> candidateRoot=<闭合候选类别>]`，每项实际单值；私有observer整条全锚定，未知后缀直接unclassified。

scope：service现有roster repair失败分支及必要pure分类函数/测试，generateJSON仅上述不可枚举诊断字段；私有RPC observer小幅识别该安全码、另名bundle/driver。365按序独审后TDD与独立代码审核，再新正常全文；不据诊断自行截取或采用首答。
