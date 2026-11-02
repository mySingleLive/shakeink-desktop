# R71预检恢复及R72补充启动身份独审

结论：通过纯测试基础设施恢复审核，允许主代理按冻结补充身份执行新的正常R72验收。不是新的产品通过结论，不改变478产品审核、475实际失败或原R71文件。

原R71 driver第22行读取缺失临时baseline时即退出，electron.launch在第30行尚未到达；无App/API/consent，原evidence目录空，四个状态文件和draft内容均未变化。因此仅记为启动前预检中止，不记全文成功或失败，也没有重置已开始的验收计时。

独立0API checker exit0（私有`verify-r72-recovery-reviewer.mjs`、`r72-recovery-reviewer-safe.json`）：恢复两候选只投影已独审R70快照，原session SHA `acdb3383…`及安全收据`079f4102…`匹配。原文件9468472 bytes、GB18030严格解码4803440 UTF16字符与旧快照文件文本精确相等；正文4785312字符及原SHA、1402完整title/volume/start/end/content元组精确一致，章节重接全文，每章在原文件中的来源范围精确唯一、有序无重叠。新JSON明确是语义等价候选，未宣称找回原run/expected字节，未用R71新导入输出作期望。

恢复目录700，三JSON均600/wx；候选run SHA `6416a7c8…`、expected SHA `2387029c…`、provenance SHA `ac708755…`与冻结补充一致。原R71 manifest SHA `8fe473441f937e24c630636d3786faf52abf5d1b573b607bc66b34ee4475173f`保持，全部原source/bundle/renderer/test/helper/review/tool、runtime和observer源/产物/依赖哈希复核通过，补充11项哈希亦相符。

新R72 driver仅一个baseline路径常量变化，逆替后整份精确等于原R71；final verifier仅两个baseline文件路径变化，其它逐字相等；snapshot verifier与原版逐字相等。相关Node语法检查通过。新launcher守护原manifest全部groups及补充哈希，使用全新`scenes-r72-complete`、`SCENES-R72`和R72 before/after状态目录，不复用、移动或覆写R71 once/空目录/快照。原按钮、业务断言、正常关闭、420000ms门均保持，计时从R72首次正常consent开始。

后续仍须正常全文全部场景及完整复核、发布、重开与DB一致实际通过；draft内容变化沿原逐文件取证明确审核。本审核未启动App/API、未改产品/测试或原验收工件，私有正文未公开。
