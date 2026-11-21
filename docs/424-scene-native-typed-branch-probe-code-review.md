# R56 有类型联合诊断独立代码审核

结论：限定通过PRIVATE TU01–03，可由主代理执行固定两例、最多2次final fetch的合成诊断。产品TU04–06尚未准入；只有候选②实际满足422全部条件后才可执行条件产品TDD，①单独成功不足。诊断不是全文验收。

独立Node24最终测试8/8（新5项及原quit3项）、private tsc exit0/0字节日志。TU01实际入口RED为原B′固定wrapper无type，非缺模块；GREEN是合成控制，不是供应商结果。

源码审核无阻塞：①前验冻结B′ schema/prompt SHA，只在固定items.anyOf[1]的纯联合节点追加object，三个原分支均先证type=object；②仅对items纯anyOf按关联律递归展开，完整typed叶按对象键序无关精确结构去重。带约束叶保持原样，不合并范围或裁分支；无type且带siblings节点拒绝。原输入不变、容量超限失败，不取前N或部分结果。原/①/②17组完整Ajv见证及固定正负接受一致，三个replacement、别名边界、多CF和完整字段保留。更宽uniform跨位置答案可通过schema，但原tuple/witness单独失败，未伪称tuple与uniform接受集相同。

新helper直接import冻结R54 transport/fetch、execute/161词闭合projector/tee，无新流机制。真实SDK→同helper alias→原ModelService/Gateway→fake最终出口核完整schema、type/strict、同prompt、none/defaultcap、each1/global2/retries0、HTTP not-run、delta/直接JSON/原tuple/witness分存。原权限/取消/readonlyUsage/正常退出门不变；700新目录/wx600。凭据仅原gateway内部正常使用，诊断不inspect/store Key/headers/URL/开放错误。R56 runner仅R54标签、manifest及前缀替换后逐字相同，语法0。

独立逐hash复核freeze7项、105项产物输入、368项R49产品/renderer、R48/R50/R52/R54历史35项源/CJS，全部匹配。cases `d249a4eceb12bed72db8b618440926cb0a6d4d83d729ab42004b42f2b72e4dcf`；helper `3d09a049240a36a0c814eeb0abb8f36c59faff41e8de0f50523ed0c37b0a07e3`；runner `ee2a3ee1889c588d9924f93996f94d844c4090f2bd515dbbf4d5e98868502e61`；CJS `6ff2edeb6217048660c160379425f5e2923215ed02786d56310245789009ae2c`。①4882字节/schemaSHA `b362dca31ab75a3e3b7b8a8e202867e3fa27c3c8fea01f6ec1f27dc648d866e7`；②4854字节/schemaSHA `c4ec88220c597280f5f01a86996c14acc6adfa74eee28c89df808c166dd48392`。

实际命令：Node24 `--import …/tsx/dist/loader.mjs --test …/scene-native-typed-branch-probe.test.ts …/scene-native-capability-runner-state.test.mjs`；`tsc --project …/scene-native-typed-branch-probe-tsconfig.json --noEmit --incremental false`；runner语法和纯Node全hash复核。独立日志 `/private/tmp/scene-native-typed-branch-independent-controls.txt`、`/private/tmp/scene-native-typed-branch-independent-typecheck.txt`。本审核未App/API、未读真实小说/模型文本/Key/开放HTTP正文，未改产品或仓库测试。
