# 官方引用编码静态探针独立代码审核

结论：无阻塞，限定准入 root 执行 R64 两例合成静态诊断，各一次、最终 fetch总计2；不准入产品实施或正常全文验收。446/447及按序独审已核。R63 B失败与441条件未满足保持原事实；须本次A/C均实际通过全部既定条件后，才可进入已审的条件产品TDD。

独立 Node24 新OR9+原quit3，共12/12，fail/cancel/skip0；私有tsconfig全依赖类型检查exit0、日志0字节，runner/builder语法检查0。首RED仅模块缺失，不冒作产品功能回归；首次完整控制通过后补目标引用负控，最终9项均实跑。没有运行App/API或builder，没有改产品/测试。

转换锁定冻结R63 A/B及原prompt SHA，C只将definitions改为单数`$def`、受控指针前缀同步改名，并在目标自身已声明相同type后删除ref上的冗余type。其它兄弟字段不能丢弃；未知/外部/悬空指针、多余sibling、错type、缺type或已有冲突容器均拒绝。R63输入保持不变。实际C为2931B、SHA `3ab3ef1aec9b1de31f8a14361c58c3a39da8300d8f234a8f38e63285382f3f9d`；A仍18946B/原a8306b69，prompt仍81381c86，完整三record、逐键域、所有上限、0资格不变。

独立验证只在诊断副本反命名后交原受限inliner，完整canonical与A相等，未反命名真实wire。修改被引用anchor的枚举后，原见证真拒、改为合法choice2的见证真过；缺choice及新增目标required亦真拒，避免把unknown容器keyword被忽略误作引用校验通过。原冻结tuple、production decoder、exactkeys/换序/类型/范围/三严格metadata/getter不触发等正负控继续通过。

新helper相对443已审helper仅case导入、命名及新私有路径，真实SDK/model工厂→原ModelService/Gateway→最终fakefetch控制核完整A/C原样schema、sameprompt、strict=true；去schema后整份body深等，none thinking/cap/store不变。wrong strict/schema/prompt/binding在main前拒绝；307第二fetch被原闭包硬门拒绝。原冻结执行器、161词闭合错误投影、1000ms/64KiB tee/流收尾、授权、readonlyUsage/maxNetworkRetries0、metadata拒写、normal quit原超时及cleanup不能洗白规则均保留。设置探测仍被denyDB代理阻断，不声称尝试读取0；凭据仅正常gateway内部使用。

新私有目录700、文件600/wx，错误开放串、headers、URL、Key、小说不入日志。真实输出仅合成材料。runner与R63相比仅namespace/manifest标签变化，368保护、runtime前后SHA、状态、页面错误、exact2和正常退出门保持。条件脚本含独立runtimeSHA、可信case.id、每例2xx/stop/directJSON/schema/原tuple/decoder/手写五任务见证、delta=SDK与保护检查；root须同时绑定实际runner exit0。harness观察完成不等于候选兼容，任一例失败不能标产品条件成立或补试。

独立核7项author freeze、manifest108输入、R62的57源+8bundles+303renderer=368保护、入口/CJS与runtime当前SHA全一致；旧R63七项及R54/R60历史私有源/CJS保护控制均通过。保护状态仍为R62正常全文失败、keyed候选预算未验证、normalFullBookPermitted=false，没有提前放行产品。

关键冻结SHA：cases `01ed6dbb65ee201d378d81eebad6ff8e12fb285340006ba1872ca629bdf938e4`；helper `893dfcd1b8e26f1a4169aa57a0e9ac40f0f018754bdcaf5f225e4a084572ea26`；test `c1e84809aeffba78edd42db70e2b7c54a73ef6215632a27aea55a7316679bc3e`；新CJS `8d55df0422d9277d85a239a4deb26ff1901e9370a336eaf76d39eaf44c0048e1`；manifest `10b451de9226e7be762da1691611e7c4ec7bf2bc93fad0f937b742472cfc3052`。runner `98539aeca90e9028a823e0b3f46b5195b10735f05c7681aecea54aefd3c4e82f`；条件脚本 `4c270e93c9c56c60ef65271678d0b9ba99f6c53334e0d86cd0c81fff48325951`。

实际命令：Node24 `--import tsx --test` 私有`scene-keyed-official-ref-probe.test.ts`与`scene-native-capability-runner-state.test.mjs`；Node24 tsc `--project scene-keyed-official-ref-probe-tsconfig.json --noEmit --incremental false`；runner/builder `node --check`、新旧helper/runner diff、freeze/manifest/runtime SHA断言及本文件diff检查。独立日志 `/private/tmp/scene-keyed-official-ref-independent-controls.txt`、`/private/tmp/scene-keyed-official-ref-independent-typecheck.txt`。未读取小说/Key或真实模型回复，没有启动App或调用模型API。
