# 481 补充 · 重开验收退出有界

待独审，尚未实施。481产品TDD范围不变。本补充仅处理真实重开验收工具finally中evaluate(app.quit)或exit事件可能永久等待的基础设施问题。

方案：新增scripts/lib/electron-normal-quit.mjs供scripts/verify-lotm-scenes-persistence.mjs使用。一次开始时刻和一个绝对deadline覆盖发出quit、evaluate settled及进程exit全过程，不顺序重启计时。返回不可变事实：正常退出是否满足、是否timeout、evaluate状态、观测exit与耗时。只有deadline前evaluate完成且进程code=0/signal=null才算正常退出；timeout或evaluate拒绝永久保持失败，后续cleanup观察到0不得改写。超时后的自有测试子进程可被终止清理，独立记录；不得将cleanup当正常退出，也不能继续写acceptance成功。工具仍只读业务路由，无App/API预探针。

用例：先对无helper的旧代码取得真实失败，再最小实现。使用纯fake application与EventEmitter，无实际App/DB/API：(1)正常evaluate及exit0成功；(2)evaluate永不结束但exit0出现仍在同一deadline失败；(3)evaluate结束但exit永不出现仍失败；(4)evaluate拒绝即使exit0也失败；(5)timeout后才exit0或cleanup0不改原失败。加断言listener/timer收束及记录不可变。私有r73-normal-quit.test.mjs独立运行，不扩大53文件产品回归组；其helper/测试和重开脚本全部进入R73冻结hash。仅此验证工具需要变更，不改产品源、旧证据或R72结论。

独立补充方案及用例通过后TDD，最终482 code review核源码/命令与正常重开真实证据。normalQuit不通过时全文重开验收仍不通过；不能以仅forest比较声称数据库生成ID逐值等于artifact ID，完整材料另用offline snapshot深等核验。
