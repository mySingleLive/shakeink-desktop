# 导入对话框主题样式方案独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。仅审25方案及已知真实Button、导入CSS／React fixture、globals、批准稿与实施边界；未编码、运行测试或操作应用／模型／用户数据。

25 SHA-256：`c88da317fee0b0f4a28cd5c765fc856752070dd72d5bc9eb04825adaca6b3dc3`。

**技术方案PASS；定向用例PASS，无必须修订的方案级P1/P2。** 本结论包含主代理补充的“两独立页面比较真实共享Button”做法，以下为实施／代码审核边界，不代表CSS已经修好或实际应用已验收。

## 恢复既有设计，无需再次批准UI

用户已明确要求修正导入弹窗与当前主题、尤其按钮的不一致；`implementation-boundaries.md`保留导入v4批准及任务定向验证约束。去掉局部涂装、恢复真实共享Button和已批准表面tokens是兑现现有设计，未新增流程、按钮含义或业务行为，因此无需再次要求UI批准。

根因与当前源码吻合：Button只输出data-slot及cva／Tailwind utilities，没有data-variant；未分层`.ni-dialog [data-slot="button"]`及局部hover／disabled／svg／focus规则会覆盖共享组件，而两个data-variant恢复分支不能匹配。应删除这些局部覆盖，保留组件原variant／size／事件，而非给全站Button新增属性或复制原型按钮CSS。

批准稿dialog确用input边框、chat-overlay表面及shadow-2，页脚同overlay。真实globals已有宣纸／玄墨tokens，且正式弹窗已带chatpane。按25恢复这些局部表面，保留原宽高、共享DialogContent定位、头尾／滚动／响应式、原生控件与业务状态。全站Button、tokens、其它面板、后台解析／导入／保存不在修改范围。

## 定向验证须使用真实层叠及独立参照

新fixture复用既有真实导入React及其隔离bridge，另单独mount真实共享Button。现有semantic-native浏览器测试已示范以真实globals绝对路径作为PostCSS from、使用已安装Tailwind插件编译；该做法能保留imports、layers、真实候选扫描、dark／ink变体及Dialog定位utilities，不需新增依赖。

UT01采用**两个独立页面**：导入弹窗页面与未置于ni-dialog祖先下的Button参照页面。两页使用同一完整生产globals编译结果及真实局部CSS、相同主题／字体环境，分别作真实hover及键盘Tab focus比较。不能把参照放进同一覆盖祖先、用手写近似Button CSS，或沿用旧fixture补translate来伪装生产cascade。

比较paint／高度／padding／圆角／opacity及focus状态时，还应独立核对default实际呈现primary／primary-foreground、ghost不被实心边框／背景覆盖，避免“两个都未加载utilities或同错”的相等假绿。只有真实浏览器computed值与实际hover／键盘focus，不以class字符串、脚本添加focus类或截图存在作通过依据。先在当前CSS取得行为RED，后删除局部覆盖GREEN。

UT02继续真实source／select／confirm页与checkbox交互；双主题、三个批准尺寸下核对dialog／页脚token、可见范围、横向溢出、真实Dialog Tab焦点约束和禁用按钮未触发隔离bridge。新测试保留合成截图作视觉核查，旧U02及其断言不改，不能把合成UI通过计入真实小说质量。

## 隔离与主题偏好

双主题切换仅在新建、可销毁的浏览器测试上下文中设置documentElement的主题class；不调用真实设置、主题偏好持久化、用户浏览器profile、app IPC或模型。独立页面不会改变当前用户主题。

正式构建后的实际应用核对只使用用户当前主题与现有会话。不得为验双主题而修改用户偏好，亦不回退／丢弃当前S02来源页、不替C1授权重建或自动发送AI。样式修复不改变正文、来源、选择和任何设置。

## 执行范围与后续

仅25指定的局部CSS、新theme fixture和新theme测试；不泛扩stylescope。只认可下面**两条命令**，覆盖新UT01／02及原U02三项用例，本文未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-UT0[12]:' tests/browser/novel-import-theme.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-U02:' tests/browser/novel-import.test.ts
```

独立代码审核须对真实基线与冻结身份验证上述范围、真实cascade／参照接线及RED／GREEN历史；禁止全suite。必要类型检查、正式Turbopack构建、desktop build与workers身份另记，不用webpack替代，也不把这些构建检查视为小说导入结果。随后实际当前主题视觉及会话保活仍须由主代理另验，真实小说／模型／发布任务继续按原标准进行。
