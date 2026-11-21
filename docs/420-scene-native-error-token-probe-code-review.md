# R54 闭合原因词诊断独立代码审核

结论：限定通过，可由主代理执行固定新两例、最多2次 final fetch 的 PRIVATE 静态诊断。仅已知正控与失败对照，不是单变量schema实验；412/413仍未准入，不能据诊断结果直接修改产品或宣称全文成功。

最终418/419及窄澄清已独立通过，文档SHA分别为 `de7aee1de30654c7eb61c57ee31026a93a20ccc3ef2552bb3499bd37b159b567`、`3c74a222b85f35cda53300b74268aa6a5e99dae1b74ce57128b708433c01c60e`。独立Node24执行最终新控制15项加原quit3项，18/18通过；独立private tsc exit0、日志0字节。非供应商结果。

源码无阻塞。仅成功完整解析HTTP JSON后，从固定own error.message或无error封套的own message取词，不猜任意嵌套或根fallback。先丢URL、Authorization/Bearer行段，再按完整Unicode段识别，数字前缀/中文/连字符/路径中的白名单子串不被捡取；纯数字不输出。仅精确映射预先声明的161个规范词或other，连续other合并，128项及独立截断标记。Map私有、导出词表冻结，集合SHA `3dbf70687442994beab17da86ba6aefe7ef979711ae4797fe14f043b30b6be44`；没有运行时扩词、开放字符串或Key出口。预审实证的123schema子串缺口已真实RED后修正，补充纯合成反控也通过。

复制HTTP/execute文件仅新增类型/初值及pure projector；逆构后与原R50整文件逐字相等。原Response身份、立即delegate、64KiB/1000ms、tee有限等待、cancel/drain、授权/取消、each1/global2最终fetch、readonlyUsage、retries0、SSE完整性及原始quit超时门保持。真实SDK→同helper匹配段→原ModelService/Gateway→fake最终出口、慢/悬挂/超限/精确EOF及默认一秒释放均实跑通过。正常vault内部凭据使用保持，诊断不inspect/store Key、headers、URL；不声称实际凭据读取次数为0。

两例schema/prompt/witness前验精确绑定R48 enum-positive与R52 B′；原ID保留而purpose显式写入私有文件及summary。原生type/strict、thinking none、默认cap、完整wire SHA均验证。700新目录、wx600文件；HTTP失败本地模型JSON校验not-run，不补第三次。R54 runner仅替换R52标签/manifest/前缀后逐字相同。

重新逐hash核最终freeze8项、103个产物输入、368个R49产品/renderer及R48/R50/R52历史27项源/CJS，全部一致。锚点：projector `5f489fc526ce6cf2e71144492cc4b1026e8955d57be013c2941bf7b046f7bc58`；helper `37c7690256f3e5af25418d908b50c040fd91066c40c6d3a2ef3fe0a953a5ba3a`；runner `67b42922d50d52b87ab8ace3d03374990af889edeb284433d5592bccd37ca170`；CJS `f04ccb913f960518cd757840103a054ae14687cd24916349b9275c9b8540e086`。

实际命令：Node24 `--import …/tsx/dist/loader.mjs --test …/scene-native-error-token-probe.test.ts …/scene-native-capability-runner-state.test.mjs`；`tsc --project …/scene-native-error-token-probe-tsconfig.json --noEmit --incremental false`；runner语法检查、纯Node hash及补充隐私反控。独立日志 `/private/tmp/scene-native-error-token-independent-controls-final.txt`、`/private/tmp/scene-native-error-token-independent-typecheck.txt`。本审核未启动App/API、未读真实小说/模型文本/Key/开放HTTP正文，未修改产品或仓库测试。
