# 99 普通来源重选后端实施证据

作者版冻结，待 101 独立代码审核；真实 M01 草稿未读写，实际恢复/原生选择器验收由主代理后续执行。只改 main 和新增 SR 测试，未改 UI、browser fixture、文件读取器、PDF 函数、模型/发布服务或真实 journal。

main 增加普通来源分支和独立 helper：在 picker 前严格拒绝设定分析/决定/出版/工作版本/非 classify 信用/检查点/在途活动；由实际 choose 结果产生 fresh grant，调用原 scanner 完整读取并核同 path/format/hash/bytes。文本默认解码错误只能在 fresh proof/ancestors/hash 已齐全后，按原确认编码调用原 redecode，并在重解释前后严格 verify；不按 error 文案猜原因、不校验旧失效 proof 来堵住重选。最终完整文本与 encoding 精确相同后，候选仅替换旧 file 的 proof/ancestors，撤发送 grant/checkpoint、清错误回 source、epoch 增加及已有 target 重新授权；其他 session 和来源字段逐项保留。

commitCandidate 只增加可选第三参，默认 running；新入口传 source。正常提交后的 act 尾部照常保存 source，rename 后后验失败则真实磁盘/内存候选为 paused/resumeSource、保留既有 blocked latch，重开后才能继续。原 PDF 重选函数逐字未变。完整反向核对可将 main 全文件还原到真实 fee1997 基线，不只核对选定行。

唯一测试命令为 freeze.json 记录的 Node24 绝对路径、`--test-concurrency=1 --test-name-pattern='^NI-SR0[123]:'` 新测试文件。实施前干净 RED 为 46 项 31 通过/15 失败，原因均是原普通来源误入 PDF 分支；最终 GREEN 为 46/46、0skip、exit0。首次 RED 的故障 hook 清理错误、首次实施 44/46 的既有 target 重授权前提错误分别原样保留，并在 manifest 说明；没有将 fixture 错误算生产缺陷，也没有修改 resume 顺序来规避重授权。

测试用隔离临时文件和真实 capture/scan/redecode/verify，实际覆盖 TXT、MD、HTML、HTM、最小真实 DOCX、获许可 test01.doc、GB18030、无 BOM UTF16；后者确证默认解码失败但完整 fresh 身份/hash 存在，按原编码再读后逐字相同。覆盖分类信用/手动章/标题/目标/预算/来源排序及其他源对象保持，错误/取消/链接/保护目录/祖先与读取竞态拒绝；临时文件 writeFile 真故障验证提交前状态不变，真实 rename 后 owner 后验拒绝验证 paused/source 候选与 blocked、重开和重新授权。只有最后显式再授权的合成分类回调执行一次，重选动作自身全程零 AI、零 publish；未向真实供应商发请求。choose 使用合成回调，因此这些不是各平台原生选择器通过证明。

owned TypeScript 诊断 0。完整 SHA、原始日志和 delta 见同目录 `source-reselection-backend-freeze.json`、`source-reselection-backend-delta-validation.json`；files/core/shared/AI/payload/wrapper 六个控制 SHA 均与原基线相等。作者未执行任何旧 PDF/R02、全文件或全仓 suite，也未构建/启动实际应用。
