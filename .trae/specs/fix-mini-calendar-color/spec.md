# 迷你日历活动标记色修复 Spec

## Why
当前 `MiniCalendar.astro` 使用 `--kb-success`（绿色）作为「有笔记日期」的背景标记色。在 dark 主题下该绿色为鲜艳的 `oklch(72.3% 0.219 149.579)`，与 dark 主题的灰阶美学冲突；在 claude 主题下为 `#788c5d` 灰绿色，显得浑浊不清。用户反馈「有绿色不对」，需要移除绿色，改用与整体橙色品牌调一致的表现形式。

## What Changes
- 移除 `MiniCalendar.astro` 中 `.mini-cal-cell.is-active` 的绿色背景填充
- 改为「底部小圆点」指示器方案：日期数字下方放置一个橙色（`--kb-accent`）小圆点表示有笔记
- 今日（`is-today`）保持现有的橙色实心圆形高亮不变
- 图例同步更新：`is-active-dot` 颜色由绿色改为橙色
- hover 态：active 单元格 hover 时不再变深绿色，改为统一 hover 浅灰背景

## Impact
- Affected code: `src/components/KnowledgeWorkspace/MiniCalendar.astro`
- 不影响其他组件，不影响数据结构，仅视觉表现层调整

## ADDED Requirements
### Requirement: 活动标记使用品牌主色而非绿色
迷你日历中「有笔记的日期」 SHALL 使用橙色（`--kb-accent`）作为指示色，不得使用 `--kb-success` 绿色。

#### Scenario: 有笔记的日期显示
- **WHEN** 某日期在 `calendarActivity` 中存在记录
- **THEN** 该日期单元格底部显示一个橙色小圆点（4px 直径）
- **AND** 单元格背景保持默认透明，不填充绿色背景

#### Scenario: 今日高亮保持不变
- **WHEN** 日期为今天
- **THEN** 单元格显示橙色实心圆形背景 + 反色文字
- **AND** 不显示底部圆点（避免重复指示）

#### Scenario: 图例同步
- **WHEN** 用户查看日历底部图例
- **THEN** 「有笔记」图例项显示橙色圆点，而非绿色

## MODIFIED Requirements
### Requirement: 迷你日历单元格状态视觉
原：active 状态使用 `color-mix(in oklab, var(--kb-success) 22%, transparent)` 绿色背景填充。
改：active 状态仅在单元格底部显示 4px 橙色圆点，背景保持透明；hover 时使用 `--kb-surface-hover` 浅灰背景。
