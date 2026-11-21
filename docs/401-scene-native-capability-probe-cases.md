# R48 静态 schema 诊断用例

1. 四个固定 fixture：正控与单值 rr/pc/cf 反指令同 schema；原生产完整 generic repair schema 哈希/3015 bytes 对照不变；双分支所有值固定、数组 2 项 uniqueItems 的结构性 distinctness 可由完整 schema 表达。合成合法/错 enum/空 claims/重复 A/合法其它 generic 分支分别判定，不把本例外的语义唯一性加入断言。
2. 真实 SDK→合成 ModelService/Gateway→fake 最终 transport：逐例捕获 body.text.format 的 type/strict/schema hash，恰等该例预定 schema；不只断言 options。生产 factory/thinking-off/default cap/正常出口保持，fake transport 从不读 headers、URL、凭据。直接 JSON 与原容错 parser 两种布尔独立，格式 fence/坏 JSON 不自动修。
3. 私有执行器注入 generate/clock/writer：严格串行、每例generateText及实际fetch均最多一次（第二fetch发网前硬拒），本地先证明各schema可满足；外部失败仅固定码且不补试、schema校验not-run；授权/撤权/abort/usage/write error 不变成成功或额外请求。readonlyUsage、metadata/settings 写计数为 0。逐例输出 finish/完整校验布尔，未知/开放错误哨兵不回显；每个输入只有固定合成资料。
4. 0700 新目录、0600/wx、不覆盖/不逃逸/不跟随符号链接，错误/headers/真实配置哨兵不落盘/日志；只合成输出可留私有文本。全部 settled 后 broker close，失败也关闭；runner quit timeout→cleanup0 仍失败，退出/资源/pending 检查准确。
5. 先真实控制 RED→GREEN，402 独审后 root 实际四例各一次，静态 schema 与实际 wire SHA 均有回执，产品/R47 source/bundle/renderer hash 不变。无小说输入、不宣称普遍供应商保证或全文通过，不循环到符合预期。
