# R52 本地引用展开诊断独立代码审核

结论：限定通过，可由主代理执行一次固定两例、最多2次 final fetch 的 PRIVATE 合成诊断。无产品改动，无小说输入；412/413仍未准入，实际结果不自动授权产品实施。

独立 Node24 执行新 reference 控制7项及原 quit 控制3项，10/10通过；独立 private tsc exit0、日志0字节。另以纯合成输入核对未知/外部/带 sibling 引用、跨 definitions/$defs 循环均固定拒绝，合法 `$defs` 的 `~0/~1` 指针精确展开。原RP02c getter反例已修，拒绝时调用0次。不是供应商实测。

源码审核无阻塞：仅root-local纯 `$ref` 的受限DAG，严格own/data descriptor取值、路径与循环门、10000节点/128深度上限；完整clone且不改输入。输出检查无引用后才删根definitions/$defs。原/展开Ajv共同见证及固定反控一致，A′/B′差异仍只有原items/additionalItems。另存原tuple和共同见证校验，不把宽B′合法当作原位置规则通过。

新helper直接复用冻结R50 matcher、execute、最终fetch计数和64KiB/1000ms HTTP闭合投影/有界tee机制，保留正常授权、readonlyUsage、retries0、串行each1/global2、post-assert取消、流完整性、close/drain和原始quit超时门。真实SDK→原ModelService/Gateway→fake最终出口已核wire为strict json_schema、0ref、同prompt、none、默认cap及单次调用；HTTP正文秘密哨兵未进入记录。新目录700、wx文件600。正常凭据仍仅在既有gateway内部使用，诊断不inspect/store Key、headers、URL或开放异常。

R52 runner相对R50仅标签/manifest/前缀替换后逐字相同，语法exit0。独立逐hash核103项新产物输入、368项R49产品/renderer及R50历史8项源/CJS，全部匹配；新freeze全部7项相符。

冻结锚点：cases `b5dc48762d5be1facb0fede3cbcb96e9c37b33bb4591685bac8649f6c9f74185`；helper `65ea6ba840511adad10fc7253dde0d6e04a8b9211bb24302e85ddc539d57d8e5`；runner `bc44e24586bf957337a142e1de86df8f8ed3df46b008e7b2123b9f959dc941e2`；CJS `f347592d746064ccda2f61eed5e2066a8bab03d7e664d26ca4ff309c6c223124`。A′ schema4880字节/SHA `fd40a69bc457169c7b5a21dd5fe2b3a851803876ebc85f2d1482908ef6218c28`；B′4866字节/SHA `273cd07be320239e5f4c39c6e1059afb44d85dcb750a6c39b889ff153cb70396`；均原10ref→剩余0。

实际命令：Node24 `--import …/tsx/dist/loader.mjs --test …/scene-native-reference-probe.test.ts …/scene-native-capability-runner-state.test.mjs`；`tsc --project …/scene-native-reference-probe-tsconfig.json --noEmit --incremental false`；runner `node --check`；纯Node hash/额外引用正负控。独立日志 `/private/tmp/scene-native-reference-independent-controls.txt`、`/private/tmp/scene-native-reference-independent-typecheck.txt`。本审核未启动App/API、未读取真实小说/模型文本/Key，未修改产品或仓库测试。
