# 跨平台统一来源选择器定向用例

日期：2026-10-26。依据20方案及21独审。仅执行本表指定文件/用例，不运行全仓或完整导入/打包套件。

| ID | 输入与操作 | 预期/执行层 |
| --- | --- | --- |
| CP-P01 | 动作schema、navigate/toggle/confirm id+revision；cancel仅id；注入path、错误ID、旧revision | 严格拒绝任意路径/未知字段，普通变更CAS；cancel旧rev场景不需rev；只作用当前会话。新source-picker unit |
| CP-F01 | 真实隔离目录，文件夹/七扩展/未知格式/符号链接/受保护目录/自然排序；导航parent/places；当前目录 | 同列表可选文件和目录，禁用项有原因；只读元数据，非文本不读；空确认禁用，current目录可选；2000项超限显式报错。source-picker unit |
| CP-F02 | 跨目录勾选、移除、清空、筛选；确认多文件/目录/混选；重复入口与取消初次/追加 | 选中集合保持；confirm得到可信grant后复用真实scanner；取消resolve null，controller不建任务/不改revision；新id令旧操作失效。source-picker unit + UP-03定向回归 |
| CP-F03 | 文件勾选后换inode/改字节，目录或祖先重命名后同路径换入；confirm后扫描前替换 | confirm与scanner读取边界对照原grant；无法导入替换内容/沿链接越界，原文件不改。实际文件系统+grant/scanner定向用例 |
| CP-L01 | navigate未回loading时立即cancel；confirm检查中cancel；owner/主frame变化、退出/迁移/worker失联 | cancel绕过前后端队列与revision，立即resolve；旧view/confirm不重新打开；先cancel后controller.close/pause及gate drain，纯取消不因尾owner断言变错误。unit有界IO+实际main AST接线 |
| CP-L02 | 超时目录读/盘符、迟到opendir、反复cancel重开 | 取消不等IO；真实settle前占共享预算，超限不再启动；迟到Dir关闭、无迟到view。可控制等待点，非真实Windows验收 |
| CP-U01 | 真实React选择框，主进程事件/current、跨目录选择/筛选/移除、文件夹双击、当前文件夹 | 无文件/文件夹模式下拉；同一选择区；动作opaque IDs；双击保持原选择再导航；信息及图标源真实view，不复制示例资料到产品。新browser文件/合成bridge |
| CP-U02 | loading/空目录/无权限/变化；Tab/Space/Enter/方向键/Esc；导航/删除后焦点；680×460/390×640两主题 | 焦点保留在Dialog；Esc立即cancel；无选/错误项目不能确认；跨目录已选保持；底部操作可达，无合成IO完成计时器。新browser文件/合成bridge |
| CP-U03 | 主入口、native菜单与添加来源，macOS和Windows属性 | 两平台同一语义入口；原命令ID兼容但菜单不重复；source页统一添加来源；mac调用真实dialog组合，win调用picker服务而非组合属性。更新NI-L01、NI-U08和UP-05，仅执行这些现有用例 |
| CP-B01 | 新IPC/preload、DesktopApp全局Dialog接线，UI与desktop生产构建 | 严格bridge/受信frame/owner检查；所有异步关闭接点cancel在排空前；编译成功、命令目录指纹更新；无新增外网/HTTP监听/依赖 |

已批准合成HTML的浏览器预览受file:安全策略限制，不绕过。本阶段浏览器测试只加载本次新生产React组件的隔离合成bridge，不打开被拦截的HTML。没有Windows目标机时，Windows真实运行单列未执行，不能由属性模拟或受控bridge冒充通过。macOS原生UP-06保持本次证据；若mac原生接点变化，仅针对其新连接定向回归。

计划新文件：tests/unit/novel-import-source-picker.test.ts、tests/browser/novel-import-source-picker.test.ts及必要fixture；现有只跑 tests/unit/novel-import-integration.test.ts 的 NI-L01/新增CP-L01，以及本次改动关闭钩子所涉及的 `NI-L04: publication`（验证原检查点/发布排空不被picker取消接线破坏）；tests/unit/novel-import-picker.test.ts 的UP编号/CP-F02和 tests/browser/novel-import.test.ts 的NI-U08。CP-F03可在新unit内直接调用真实scanner，不需跑所有解析器格式用例。补充初次捕获期间替换原路径链接，以及默认2个未结束IO仍给保存/关闭保留线程池余量。各ID允许拆为子用例，结果按实际测试条数报告。
