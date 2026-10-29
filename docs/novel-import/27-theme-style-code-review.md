# 导入对话框主题样式独立代码与视觉审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据25／26，审核局部CSS、新真实React fixture及新定向浏览器测试。

**最终限定PASS，无本范围必须修订的P1/P2。** 恢复既有共享Button及批准主题，不需重新批准UI。此结论限于代码、隔离浏览器与代表截图；正式构建后用户当前主题／实际会话仍须主代理另验，不计真实小说或模型验收通过。

未修改生产／测试源码、全局Button／tokens或用户设置，未操作实际应用、导入会话、模型或用户数据。仅执行两条批准命令；测试用临时无界面Chrome、独立上下文和全网络拦截，不使用用户Chrome profile。

## 冻结身份与范围

| 文件 | SHA-256 |
| --- | --- |
| `src/components/desktop/novel-import.css` | `a3a5a67b554148469fb2788380124c031b221a43a35d40d55bcf40e9eecf6f92` |
| `tests/helpers/novel-import-theme-fixture.tsx` | `9f2709d95fc2cff9512e3fac7a2b908a8df23f91cba7fe63a2f4435c6d2c2530` |
| `tests/browser/novel-import-theme.test.ts` | `7ff5fd38e47dc72574d0725818e2cd3ea6243f5d32ab9b9baa0b4b2b72313499` |

执行前后身份匹配。`/private/tmp/novel-import-theme-25-baseline/`六份真实原文均与manifest匹配；全局Button、globals、preview设计、旧browser测试与旧fixture五项控制文件SHA均未变。59已审main／service／四个core接点和session测试身份也保持原冻结值。未以空git diff宣称全仓无变化。

独立从CSS真实基线及两个新增文件重新生成完整差异，与作者文件逐字节一致，SHA=`be70a4dd90d6a724f73baba4806704045cca27b5da9e1e4e48ff1356d3df2852`。详见[theme-independent-review.json](evidence/theme-independent-review.json)，SHA=`9dbd38de2537a78b98b7a0c54e1dfd60c0fedc1f33143093fa2974c1ff201a24`，含控制文件、后台身份、完整差异与原始日志hash。

## 实现与防假绿核对

CSS只移除`.ni-dialog [data-slot="button"]`的paint／geometry／font及不存在的data-variant分支、hover filter、统一svg尺寸与disabled opacity；原生按钮手型保留，局部focus规则明确排除共享Button。弹窗边框改用input、表面与页脚用chat-overlay回退popover，shadow用shadow-2。宽高、共享Dialog定位、头尾、滚动、响应式、原生表单和业务事件原字节保留；没有给全站Button增属性或复制原型按钮CSS。

新fixture直接import既有真实导入fixture及共享Button，参照单独mount于另一页面、无ni-dialog祖先。两页均加载从真实globals、真实PostCSS／Tailwind插件及绝对from路径编译的生产cascade，再加载局部CSS；没有手写Button近似、translate／focus补丁或全局token修改。

UT01不仅比较两份computed样式，还独立要求主操作实际等于primary／primary-foreground，ghost透明背景／边框，防止两边都受错误覆盖或缺utilities而同错相等。default／outline／ghost图标及两类disabled与真实参照比较paint、尺寸、圆角、字体、opacity、svg、hover与focus；hover用指针，focus用真实Tab并检查focus-visible／可见ring。禁用控件实际鼠标点击不增加隔离bridge调用。

UT02用真实Dialog及source／select／confirm、两主题／三尺寸测表面与页脚tokens、边界、无横向溢出、Tab回流、禁用跳过及来源／补全选择保活。等待真实新标题、动画完成与BaseUI焦点guard稳定，没有手动focus、移除焦点约束或改布局源码来过测。生产CSS仍保留32px视口差值，即四周16px布局；旧U02原定位／尺寸断言未改。

主题只在隔离页面documentElement设置class，fixture bridge与fetch均为明确合成数据；未调用真实设置持久化、用户profile或模型。正式实际应用不能为核对第二主题而改用户偏好，不能回退／丢弃当前S02或为C1代授权发送。

## TDD及独立实际执行

[真实RED](evidence/theme-ut01-ut02-red.txt)为0/2，SHA=`5f54f63152c2fa485f75402f09c9f860a784f8c4e06c85f0c1af160cd1bc6c99`：旧ink主按钮实际`rgb(13,11,10)`而primary为`rgb(224,122,95)`，旧表面／边框／shadow也与批准token不符。它直接命中真实cascade问题。

沙箱Chrome启动失败另存，不算产品RED；实施后两次fixture时序失败分别是即时读取焦点guard及动画未结束的bbox，记录保留，不冒称全部阶段首次即绿。最终测试等待真实状态稳定，断言仍在。本代理未切回旧CSS或制造RED。

仅独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-UT0[12]:' tests/browser/novel-import-theme.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-U02:' tests/browser/novel-import.test.ts
```

| 范围 | 实际结果 | 独立原始日志／SHA-256 |
| --- | --- | --- |
| UT01／02 | exit0，2/2；fail/cancelled/skipped均0；14508.583208ms | [theme-independent-ut01-ut02.txt](evidence/theme-independent-ut01-ut02.txt)，`03805fa4aa5c1aab2374a5d132d5160aaa487f76b24f60e41bfd957bb0f5b3a8` |
| 原U02 | exit0，1/1；fail/cancelled/skipped均0；1978.1125ms | [theme-independent-u02.txt](evidence/theme-independent-u02.txt)，`68393688a630c357c6be118e7934f7801833164ff2fa6a84ea62213eb6ebb6ff` |

两命令按明确授权在隔离headless Chrome所需沙箱权限执行；没有全suite、实际应用或用户数据访问。作者owned类型诊断0只作作者证据，本代理未另跑类型／构建。

## 代表视觉核对与截图保存

独立复验生成22张图：18个双主题／三页／三尺寸表面及4个按钮／真实参照。测试固定文件名会重用作者路径，因此执行前保存全部25张作者红／绿原图，执行后将独立图另存`theme-independent-27-…`，再将作者25图逐字节恢复。没有覆盖TDD历史。独立图清单及hash见[theme-independent-screenshots.json](evidence/theme-independent-screenshots.json)，SHA=`c166c8a3ecd8e1ee42bca13030f3a63e30bd9fac38b480f6e0b9b57fea050fad`；编译cascade ID为`5efe93c3d138`。

已实际查看六张代表图（一个原RED、五个独立GREEN）：

- [旧ink来源页](evidence/theme-ink-source-1280x800-909301f9998f.png)与[新ink来源页1280×800](evidence/theme-independent-27-ink-source-1280x800-5efe93c3d138.png)：主操作恢复主题珊瑚色，辅助按钮与透明图标层级可辨，表面／页脚统一。
- [宣纸选择页390×640](evidence/theme-independent-27-paper-select-390x640-5efe93c3d138.png)及[ink确认页680×460](evidence/theme-independent-27-ink-confirm-680x460-5efe93c3d138.png)：边缘、固定头尾与操作可见，长内容留在中间滚动区，无横向裁切。
- [宣纸确认页1280×800](evidence/theme-independent-27-paper-confirm-1280x800-5efe93c3d138.png)与[真实共享Button参照](evidence/theme-independent-27-paper-reference-5efe93c3d138.png)：表面与按钮主题一致，disabled呈共享组件状态，focus环可见；未见需修正的视觉问题。

这不是人工查看全部22图，也不是安装版当前主题验收。主代理仍须正常退出应用后进行正式Turbopack／desktop构建并核对workers身份，再在用户当前主题下保留原会话核验实际样式；不得运行中替换out资产。真实小说、语义、发布及其它原任务按原标准继续，不能由本次视觉PASS冲抵。
