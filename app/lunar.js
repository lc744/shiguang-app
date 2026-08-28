// 拾光 · 农历算法 + 节日 + 法定假日数据
/* ---------------- 农历核心（1900-2100） ---------------- */
const LUNAR_INFO = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x05360,0x0ea4f,
0x0aa50,0x1b6a0,0x06d00,0x056d0,0x04ae0,0x0a9b4,0x0a4b0,0x0d260,0x0d520,0x0f2df,
0x0c960];
const LUNAR_MONTH_NAMES = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const LUNAR_DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
'十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
'廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

function leapMonth(y){ return LUNAR_INFO[y-1900] & 0xf; }
function leapDays(y){ return leapMonth(y) ? ((LUNAR_INFO[y-1900] & 0x10000) ? 30 : 29) : 0; }
function monthDays(y, m){ return (LUNAR_INFO[y-1900] & (0x10000 >> m)) ? 30 : 29; }
function lunarYearDays(y){
  let sum = 348;
  for(let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y-1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}
// 公历日期字符串 → 农历对象 {year,month,day,isLeap}
function solarToLunar(dateStr){
  const parts = dateStr.split('-').map(Number);
  const base = Date.UTC(1900, 0, 31); // 1900-01-31 = 农历正月初一
  const cur = Date.UTC(parts[0], parts[1]-1, parts[2]);
  let offset = Math.floor((cur - base) / 86400000);
  let temp = 0, ly = 1900;
  for(ly = 1900; ly < 2101 && offset > 0; ly++){ temp = lunarYearDays(ly); offset -= temp; }
  if(offset < 0){ offset += temp; ly--; }
  const leap = leapMonth(ly);
  let isLeap = false, lm = 1;
  for(lm = 1; lm < 13 && offset > 0; lm++){
    if(leap > 0 && lm === leap + 1 && !isLeap){ lm--; isLeap = true; temp = leapDays(ly); }
    else { temp = monthDays(ly, lm); }
    if(isLeap && lm === leap + 1) isLeap = false;
    offset -= temp;
  }
  if(offset === 0 && leap > 0 && lm === leap + 1){
    if(isLeap){ isLeap = false; } else { isLeap = true; lm--; }
  }
  if(offset < 0){ offset += temp; lm--; }
  return { year: ly, month: lm, day: offset + 1, isLeap: !!isLeap };
}
// 农历 → 公历日期字符串（某年某月某日在该农历年内的公历表示）
function lunarDayLabel(lunar){
  if(lunar.day === 1) return (lunar.isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[lunar.month-1] + '月';
  return LUNAR_DAY_NAMES[lunar.day - 1];
}
function lunarFullLabel(lunar){
  return `农历${lunar.isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[lunar.month-1]}月${LUNAR_DAY_NAMES[lunar.day-1]}`;
}

/* ---------------- 公历节日 ---------------- */
const SOLAR_FESTIVALS = {
  '1-1':'元旦', '2-14':'情人节', '3-8':'妇女节', '3-12':'植树节', '4-1':'愚人节',
  '5-1':'劳动节', '5-4':'青年节', '6-1':'儿童节', '7-1':'建党节', '8-1':'建军节',
  '9-3':'胜利日', '9-10':'教师节', '10-1':'国庆节', '11-11':'双十一',
  '12-24':'平安夜', '12-25':'圣诞节'
};
/* ---------------- 农历节日（农历月-日 → 名称） ---------------- */
const LUNAR_FESTIVALS = {
  '1-1':'春节', '1-15':'元宵节', '2-2':'龙抬头', '5-5':'端午节', '7-7':'七夕节',
  '7-15':'中元节', '8-15':'中秋节', '9-9':'重阳节', '12-8':'腊八节', '12-23':'小年'
};

// 某公历日期的节日（含除夕判定：次日为正月初一 → 今天除夕）
function festivalOf(dateStr){
  const p = dateStr.split('-').map(Number);
  const solarKey = `${p[1]}-${p[2]}`;
  if(SOLAR_FESTIVALS[solarKey]) return SOLAR_FESTIVALS[solarKey];
  const lunar = solarToLunar(dateStr);
  const lunarKey = `${lunar.month}-${lunar.day}`;
  if(LUNAR_FESTIVALS[lunarKey]) return LUNAR_FESTIVALS[lunarKey];
  // 除夕：明天是正月初一
  const next = todayStr(new Date(Date.UTC(p[0], p[1]-1, p[2]) + 86400000 + 8*3600000));
  const nl = solarToLunar(next);
  if(nl.month === 1 && nl.day === 1) return '除夕';
  return '';
}

/* ---------------- 法定假日安排（国务院办公厅发布的官方调休表） ----------------
   rest = 放假日；work = 调休上班日。数据集中在这里，次年更新只改这张表。 */
const LEGAL_HOLIDAYS = {
  // 2026 年（据国务院办公厅 2025 年 11 月发布的通知）
  '2026-01-01':{n:'元旦',t:'rest'}, '2026-01-02':{n:'元旦',t:'rest'}, '2026-01-03':{n:'元旦',t:'rest'},
  '2026-01-04':{n:'调休上班',t:'work'},
  '2026-02-14':{n:'调休上班',t:'work'},
  '2026-02-15':{n:'春节',t:'rest'}, '2026-02-16':{n:'除夕',t:'rest'}, '2026-02-17':{n:'春节',t:'rest'},
  '2026-02-18':{n:'春节',t:'rest'}, '2026-02-19':{n:'春节',t:'rest'}, '2026-02-20':{n:'春节',t:'rest'},
  '2026-02-21':{n:'春节',t:'rest'}, '2026-02-22':{n:'春节',t:'rest'}, '2026-02-23':{n:'春节',t:'rest'},
  '2026-02-28':{n:'调休上班',t:'work'},
  '2026-04-04':{n:'清明节',t:'rest'}, '2026-04-05':{n:'清明节',t:'rest'}, '2026-04-06':{n:'清明节',t:'rest'},
  '2026-05-01':{n:'劳动节',t:'rest'}, '2026-05-02':{n:'劳动节',t:'rest'}, '2026-05-03':{n:'劳动节',t:'rest'},
  '2026-05-04':{n:'劳动节',t:'rest'}, '2026-05-05':{n:'劳动节',t:'rest'},
  '2026-05-09':{n:'调休上班',t:'work'},
  '2026-06-19':{n:'端午节',t:'rest'}, '2026-06-20':{n:'端午节',t:'rest'}, '2026-06-21':{n:'端午节',t:'rest'},
  '2026-09-25':{n:'中秋节',t:'rest'}, '2026-09-26':{n:'中秋节',t:'rest'}, '2026-09-27':{n:'中秋节',t:'rest'},
  '2026-10-01':{n:'国庆节',t:'rest'}, '2026-10-02':{n:'国庆节',t:'rest'}, '2026-10-03':{n:'国庆节',t:'rest'},
  '2026-10-04':{n:'国庆节',t:'rest'}, '2026-10-05':{n:'国庆节',t:'rest'}, '2026-10-06':{n:'国庆节',t:'rest'},
  '2026-10-07':{n:'国庆节',t:'rest'},
  '2026-10-10':{n:'调休上班',t:'work'}
};

// 计算式节日：母亲节（5月第2个周日）/父亲节（6月第3个周日）
function computedFestival(dateStr){
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1]-1, p[2]);
  const w = d.getDay(); // 0=周日
  if(p[1] === 5 && w === 0){
    const nth = Math.ceil(p[2] / 7);
    if(nth === 2) return '母亲节';
  }
  if(p[1] === 6 && w === 0){
    const nth = Math.ceil(p[2] / 7);
    if(nth === 3) return '父亲节';
  }
  return '';
}

// 日历格子显示文本：节日 > 农历日
function daySubLabel(dateStr){
  return festivalOf(dateStr) || computedFestival(dateStr) || lunarDayLabel(solarToLunar(dateStr));
}
// 详情标题：完整农历 + 节日 + 休/班
function dayFullLabel(dateStr){
  const lunar = solarToLunar(dateStr);
  const parts = [];
  const fest = festivalOf(dateStr) || computedFestival(dateStr);
  if(fest) parts.push(fest);
  parts.push(lunarFullLabel(lunar));
  const h = LEGAL_HOLIDAYS[dateStr];
  if(h) parts.push(h.t === 'rest' ? '法定假日' : '调休上班');
  return parts.join(' · ');
}
