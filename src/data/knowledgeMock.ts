/**
 * 知识工作台 mock 数据
 * 后续接入后端时替换为真实接口
 */

export interface RecentNote {
  id: string;
  title: string;
  time: string;
  category: string;
  categoryColor: 'orange' | 'green' | 'blue' | 'amber';
  href: string;
}

export interface PendingStat {
  label: string;
  value: number;
  accent: 'orange' | 'amber' | 'green' | 'slate';
}

export interface CalendarActivity {
  date: string; // YYYY-MM-DD
  count: number;
}

export const recentNotes: RecentNote[] = [
  {
    id: '1',
    title: 'MT6765 相机闪光灯时序问题复盘',
    time: '今天 10:32',
    category: '相机',
    categoryColor: 'amber',
    href: '/camera/',
  },
  {
    id: '2',
    title: 'GMS CTS 定位失败问题分析',
    time: '今天 09:15',
    category: 'GMS 认证',
    categoryColor: 'blue',
    href: '/gms/',
  },
  {
    id: '3',
    title: '屏幕花屏排查思路与记录',
    time: '昨天 18:47',
    category: '显示',
    categoryColor: 'orange',
    href: '/display/',
  },
  {
    id: '4',
    title: '音频无声问题定位流程',
    time: '昨天 16:22',
    category: '音频',
    categoryColor: 'green',
    href: '/audio/',
  },
];

export const pendingStats: PendingStat[] = [
  { label: '待复盘', value: 5, accent: 'orange' },
  { label: '未归档日志', value: 12, accent: 'amber' },
  { label: '待总结', value: 3, accent: 'green' },
  { label: '草稿笔记', value: 7, accent: 'slate' },
];

export const calendarActivity: CalendarActivity[] = [
  { date: '2026-07-01', count: 1 },
  { date: '2026-07-02', count: 2 },
  { date: '2026-07-03', count: 1 },
  { date: '2026-07-04', count: 3 },
  { date: '2026-07-05', count: 2 },
  { date: '2026-07-06', count: 2 },
];

/** 今日知识日历统计 */
export const todayCalendarStats = {
  todayNotes: 2,
  weekNotes: 8,
  streakDays: 12,
};

/** 随机复习候选笔记 */
export const randomReviewPool: RecentNote[] = [
  {
    id: 'r1',
    title: 'ADB 常用命令速查',
    time: '2026-06-12',
    category: '工具',
    categoryColor: 'slate',
    href: '/tools/adb-tool-guide/',
  },
  {
    id: 'r2',
    title: 'MTK debug 关键词整理',
    time: '2026-06-08',
    category: '工具',
    categoryColor: 'slate',
    href: '/tools/mtk-debug-keywords/',
  },
  {
    id: 'r3',
    title: '霍尔驱动调试记录',
    time: '2026-05-22',
    category: 'MTK 平台',
    categoryColor: 'blue',
    href: '/mtk/hall-driver/',
  },
  {
    id: 'r4',
    title: '充电 IC 配置与节点说明',
    time: '2026-05-10',
    category: '工具',
    categoryColor: 'orange',
    href: '/tools/charging-knowledge/',
  },
];
