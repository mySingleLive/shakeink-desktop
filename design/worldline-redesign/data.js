// Design-review sample data only (docs/577). Invented events; never shipped in the product.
// Density mirrors the measured 诡秘之主 import: most events packed into ~3 years, a few spread over ~20万 years,
// up to 5 events on one day, some durations, one uncertain window, two unplaced events.
window.WL = (() => {
  const Y = 360, M = 30
  const titles = ['钟楼守夜人在雾夜失踪', '港口商会签下秘密契约', '学徒在旧书中发现星图', '巡夜队封锁北区码头', '占卜师预言三日后的月蚀',
    '议员在宴会上遇刺未遂', '地下拍卖会出现古代银匙', '教会派出调查小队', '废弃矿井深处传出钟声', '学者破译石板第一段',
    '雨夜列车在河谷脱轨', '黑市药剂师被巡夜队逮捕', '灯塔看守交出航海日志', '巡夜队长在追捕中重伤', '一封匿名信送到报社',
    '王室宣布新的港口税法', '老城区连夜大火', '商会会长公开道歉', '学徒通过第一次晋升仪式', '月蚀之夜的仪式失控',
    '北区码头解除封锁', '调查小队带回三件遗物', '报社刊登匿名长信全文', '破译石板的学者失踪', '矿井被永久封闭',
    '新任巡夜队长上任', '银匙被秘密送往首都', '占卜师连夜离开城市', '钟楼重新敲响', '议会召开紧急会议',
    '学徒收到来自首都的邀请', '旧书店老板承认藏匿禁书', '码头工人罢工三天', '调查小队第二次进入矿井', '星图指向南方群岛']
  // Category index per title (0 冲突 1 谋划 2 揭示 3 关系 4 成长 5 变故 6 其他) and importance (3 关键, 2 重要, 1 一般).
  const CAT = [5,1,2,0,2,0,2,1,2,2,5,0,3,0,1,6,5,3,4,5,6,2,2,5,6,4,1,3,6,1,4,2,0,0,2]
  const KEY = new Set([2,5,18,19,23,34]), MAJOR = new Set([0,1,9,10,13,16,21,30])
  const categories = ["冲突","谋划","揭示","关系","成长","变故","其他"]
  const people = ['艾伦', '米拉', '柯斯', '诺瓦', '赛琳', '奥德']
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const facts = [
    '目击者称当晚雾气异常浓重，钟声停在了第十一下。',
    '契约正文只有两页，落款处盖着已经废弃多年的旧王室纹章。',
    '此事在三天内传遍全城，巡夜队对外只承认“例行检查”。',
    '现场留下的痕迹与半年前另一起案件高度相似，但无人公开提起。',
  ]
  const events = []
  let id = 0
  const add = (e) => { const ev = { id: 'e' + ++id, parent: null, category: 6, importance: 1, dur: 0, kind: 'point', precision: 'day', people: [], changes: [], ...e }; events.push(ev); return ev }
  // Ancient history, scattered over ~20万 years.
  add({ title: '旧纪诸王建立第一座石城', start: -200000 * Y + 120 * Y, precision: 'year', fact: '石城遗址的壁画记载了最早的星辰崇拜。' })
  add({ title: '大洪水淹没低地王国', start: -200000 * Y + 9400 * Y, precision: 'year', category: 5, importance: 3, fact: '多部古籍都提到这场持续四十天的洪水。' })
  add({ title: '七王盟约签订', start: 342 * Y + 4 * M, precision: 'month', category: 3, importance: 2, fact: '盟约确立了延续至今的港口自治传统。' })
  add({ title: '古城沉入海湾', start: 760 * Y, precision: 'year', fact: '渔民至今能在退潮时看到塔尖。' })
  add({ title: '王立大学建校', start: 1178 * Y + 8 * M + 11, precision: 'day', fact: '首任校长是一位来自南方群岛的学者。' })
  // The dense stretch: years 1348–1350.
  let t = 1348 * Y + 9 * M + 3
  titles.forEach((title, i) => {
    t += [0, 0, 1, 1, 2, 3, 5, 9, 16][Math.floor(rnd() * 9)]
    const e = add({
      title, start: t, fact: facts[i % facts.length] + (i % 3 ? '' : '\n\n后续调查显示，此事与港口商会的账目往来存在关联。'),
      people: people.filter(() => rnd() < 0.3).slice(0, 3),
      category: CAT[i], importance: KEY.has(i) ? 3 : MAJOR.has(i) ? 2 : 1,
    })
    if (i % 4 !== 2 && !e.people.length) e.people.push('艾伦')
    if (i % 7 === 3) { e.dur = 6 + Math.floor(rnd() * 20); e.kind = 'span' }
    if (i === 12) { e.kind = 'window'; e.windowEnd = t + 8; e.label = '原文只说“那一周的某天”' }
    if (i % 3 === 0) e.changes.push({ who: e.people[0] || '艾伦', dim: '身份', before: '普通学徒', after: '见习调查员' })
    if (i % 9 === 1) {
      e.dur = 12; e.kind = 'span'
      ;['先遣人员抵达现场', '与当地居民发生冲突', '带走关键证物'].forEach((c, k) =>
        add({ title: c, start: t + k * 4, parent: e.id, category: [1, 0, 2][k], fact: '这是“' + title + '”中的一个阶段。' }))
    }
  })
  add({ title: '某位学者的日记被人烧毁', start: null, kind: 'unknown', fact: '原文没有给出任何时间线索。' })
  add({ title: '一艘无名船只出现在雾中', start: null, kind: 'unknown', fact: '只出现在一段回忆里，时间不明。' })
  const periods = [
    { title: '旧纪', start: -200000 * Y, end: 0 },
    { title: '新历 · 持续中', start: 0, end: null },
    { title: '港口危机', start: 1348 * Y + 10 * M, end: 1349 * Y + 2 * M },
  ]
  const fmt = (d, precision = 'day') => {
    if (d === null) return '待定位'
    const y = Math.floor(d / Y), rest = d - y * Y, m = Math.floor(rest / M) + 1, day = Math.floor(rest % M) + 1
    const year = y < 0 ? `旧纪${y + 200000}年` : `新历${y}年`
    return precision === 'year' ? year : precision === 'month' ? `${year}${m}月` : `${year}${m}月${day}日`
  }
  const short = (d, precision = 'day') => {
    if (d === null) return ''
    const y = Math.floor(d / Y), rest = d - y * Y, m = Math.floor(rest / M) + 1, day = Math.floor(rest % M) + 1
    return precision === 'day' ? `${m}-${String(day).padStart(2, '0')}` : precision === 'month' ? `${y}年${m}月` : (y < 0 ? `旧纪${y + 200000}` : `${y}年`)
  }
  const span = (days) => days >= Y ? `约 ${Math.round(days / Y).toLocaleString()} 年` : days >= M ? `约 ${Math.round(days / M)} 个月` : `${Math.round(days)} 天`
  return { categories, people, events, periods, fmt, short, span, Y, M }
})()
