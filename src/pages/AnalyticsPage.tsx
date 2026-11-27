import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Clock3, Flame, Star, TrendingUp, Zap } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ErrorAlert } from "../components/error-feedback";
import { useLanguage } from "../components/language-provider";
import { loadRecords, type ReadingSessionRecord } from "../lib/storage";
import type { Book } from "../types";
import { SectionTitle } from "./shared";

type TrendPeriod = "day" | "week" | "month" | "year";

interface DailyActivity {
  pages: number;
  seconds: number;
  sessions: number;
}

interface TrendPoint {
  key: string;
  label: string;
  date: Date;
  pages: number;
  finished: number;
}

interface ChartCoordinate {
  x: number;
  y: number;
}

interface RadarDatum {
  label: string;
  value: number;
  detail: string;
}

const CHART_COLORS = ["#E5C07B", "#73C991", "#7AA2F7", "#C099FF"];
const CATEGORY_PALETTE = [
  { hue: 40, color: "#E5C07B" },
  { hue: 154, color: "#68B696" },
  { hue: 14, color: "#D97757" },
  { hue: 221, color: "#7AA2F7" },
  { hue: 255, color: "#A78BFA" },
  { hue: 351, color: "#E07A8C" },
  { hue: 175, color: "#4FD1C5" },
  { hue: 34, color: "#E09F3E" },
  { hue: 254, color: "#C4B5FD" },
  { hue: 210, color: "#9CA3AF" },
];
const TIME_BUCKETS = [
  { key: "morning", startHour: 5, endHour: 12, labelKey: "Morning" },
  { key: "afternoon", startHour: 12, endHour: 17, labelKey: "Afternoon" },
  { key: "evening", startHour: 17, endHour: 21, labelKey: "Evening" },
  { key: "night", startHour: 21, endHour: 5, labelKey: "Night" },
] as const;

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

function periodKey(date: Date, period: TrendPeriod): string {
  if (period === "day") return dayKey(date);
  if (period === "week") return dayKey(startOfWeek(date));
  if (period === "month") return monthKey(date);
  return String(date.getFullYear());
}

function makeTrendSlots(period: TrendPeriod, locale: string, now: Date): TrendPoint[] {
  if (period === "day") {
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + index);
      return { key: periodKey(date, period), label: date.toLocaleDateString(locale, { day: "numeric" }), date, pages: 0, finished: 0 };
    });
  }
  if (period === "week") {
    const thisWeek = startOfWeek(now);
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - (11 - index) * 7);
      return { key: periodKey(date, period), label: date.toLocaleDateString(locale, { month: "short", day: "numeric" }), date, pages: 0, finished: 0 };
    });
  }
  if (period === "month") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      return { key: periodKey(date, period), label: date.toLocaleDateString(locale, { month: "short" }), date, pages: 0, finished: 0 };
    });
  }
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(now.getFullYear() - 4 + index, 0, 1);
    return { key: periodKey(date, period), label: String(date.getFullYear()), date, pages: 0, finished: 0 };
  });
}

function validSession(session: ReadingSessionRecord): boolean {
  return Boolean(
    session &&
    typeof session.id === "string" &&
    typeof session.bookId === "string" &&
    parseDate(session.startedAt) &&
    Number.isFinite(session.durationSeconds) &&
    session.durationSeconds >= 0 &&
    Number.isFinite(session.pagesRead) &&
    session.pagesRead >= 0,
  );
}

function formatDuration(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(Math.round(seconds / 60));
}

function dayOrdinal(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function smoothLinePath(points: ChartCoordinate[]): string {
  if (points.length < 2) {
    const point = points[0];
    return point ? `M ${point.x} ${point.y}` : "";
  }
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    if (!previous) return path;
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const control1 = {
      x: previous.x + (point.x - beforePrevious.x) / 6,
      y: previous.y + (point.y - beforePrevious.y) / 6,
    };
    const control2 = {
      x: point.x - (next.x - previous.x) / 6,
      y: point.y - (next.y - previous.y) / 6,
    };
    return `${path} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${point.x} ${point.y}`;
  }, "");
}

function smoothAreaPath(points: ChartCoordinate[], baseline: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `${smoothLinePath(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function CustomRadarChart({
  data,
  maxValue,
  color = "var(--accent-primary)",
  ariaLabel,
}: {
  data: RadarDatum[];
  maxValue: number;
  color?: string;
  ariaLabel: string;
}) {
  const width = 360;
  const height = 260;
  const centerX = width / 2;
  const centerY = 129;
  const radius = 82;
  const labelRadius = 104;
  const chartMax = Math.max(maxValue, 1);
  const coordinates = data.map((item, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
    const distance = radius * Math.min(1, Math.max(0, item.value / chartMax));
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      labelX: centerX + Math.cos(angle) * labelRadius,
      labelY: centerY + Math.sin(angle) * labelRadius,
      angle,
    };
  });
  const polygonPoints = (scale: number) => data.map((_, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
    return `${centerX + Math.cos(angle) * radius * scale},${centerY + Math.sin(angle) * radius * scale}`;
  }).join(" ");
  const valuePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <svg className="analytics-custom-radar" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon key={scale} points={polygonPoints(scale)} className="analytics-radar-grid" />
      ))}
      {data.map((item, index) => {
        const point = coordinates[index];
        if (!point) return null;
        return (
          <line
            key={`axis-${item.label}`}
            x1={centerX}
            y1={centerY}
            x2={centerX + Math.cos(point.angle) * radius}
            y2={centerY + Math.sin(point.angle) * radius}
            className="analytics-radar-axis"
          />
        );
      })}
      <polygon points={valuePoints} className="analytics-radar-area" style={{ fill: color, stroke: color }} />
      {data.map((item, index) => {
        const point = coordinates[index];
        if (!point) return null;
        const textAnchor = Math.cos(point.angle) > 0.25 ? "start" : Math.cos(point.angle) < -0.25 ? "end" : "middle";
        const dominantBaseline = Math.sin(point.angle) > 0.5 ? "hanging" : Math.sin(point.angle) < -0.5 ? "auto" : "middle";
        return (
          <g key={item.label}>
            <circle cx={point.x} cy={point.y} r="3" className="analytics-radar-point">
              <title>{item.detail}</title>
            </circle>
            <text x={point.labelX} y={point.labelY} textAnchor={textAnchor} dominantBaseline={dominantBaseline} className="analytics-radar-label">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getRandomUniqueHue(usedHues: Set<number>): number {
  const start = Math.floor(Math.random() * 360);
  let bestHue = start;
  let bestSeparation = -1;
  for (let offset = 0; offset < 360; offset += 1) {
    const hue = (start + offset) % 360;
    let separation = 360;
    for (const usedHue of usedHues) {
      const difference = Math.abs(hue - usedHue);
      separation = Math.min(separation, Math.min(difference, 360 - difference));
    }
    if (separation > bestSeparation) {
      bestHue = hue;
      bestSeparation = separation;
    }
    if (separation >= 28) return hue;
  }
  if (bestSeparation > 0) return bestHue;
  throw new Error("Could not generate a unique category color.");
}

export default function AnalyticsPage({ books }: { books: Book[] }) {
  const { locale, t } = useLanguage();
  const readingBooks = books.filter((book) => book.status === "reading");
  const finishedBooks = books.filter((book) => book.status === "archived");
  const unreadBooks = books.filter((book) => book.status === "unread");
  const [sessions, setSessions] = useState<ReadingSessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("week");
  const [hoveredStatusKey, setHoveredStatusKey] = useState<string | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRecords<ReadingSessionRecord>("readingSessions")
      .then((records) => {
        if (!cancelled) setSessions(records.filter(validSession));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Could not load reading analytics:", error);
          setSessionsError(error instanceof Error ? error.message : "Could not load reading analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const dailyActivity = useMemo(() => {
    const result = new Map<string, DailyActivity>();
    for (const session of sessions) {
      const date = parseDate(session.startedAt);
      if (!date) continue;
      const key = dayKey(date);
      const activity = result.get(key) ?? { pages: 0, seconds: 0, sessions: 0 };
      activity.pages += Math.max(0, session.pagesRead);
      activity.seconds += Math.max(0, session.durationSeconds);
      activity.sessions += 1;
      result.set(key, activity);
    }
    return result;
  }, [sessions]);

  const booksById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);
  const totals = useMemo(() => {
    let pages = 0;
    let seconds = 0;
    let sessionCount = 0;
    for (const activity of dailyActivity.values()) {
      pages += activity.pages;
      seconds += activity.seconds;
      sessionCount += activity.sessions;
    }
    return { pages, seconds, sessionCount };
  }, [dailyActivity]);

  const trend = useMemo(() => {
    const points = makeTrendSlots(trendPeriod, locale, new Date());
    const byKey = new Map(points.map((point) => [point.key, point]));
    for (const session of sessions) {
      const date = parseDate(session.startedAt);
      if (!date) continue;
      const point = byKey.get(periodKey(date, trendPeriod));
      if (point) point.pages += Math.max(0, session.pagesRead);
    }
    for (const book of books) {
      const date = parseDate(book.finishedAt);
      if (!date) continue;
      const point = byKey.get(periodKey(date, trendPeriod));
      if (point) point.finished += 1;
    }
    return points;
  }, [books, locale, sessions, trendPeriod]);

  const monthlyComparison = useMemo(() => {
    const months = makeTrendSlots("month", locale, new Date());
    const pagesByMonth = new Map(months.map((month) => [month.key, 0]));
    for (const session of sessions) {
      const date = parseDate(session.startedAt);
      if (!date) continue;
      const key = monthKey(date);
      if (pagesByMonth.has(key)) {
        pagesByMonth.set(key, (pagesByMonth.get(key) ?? 0) + Math.max(0, session.pagesRead));
      }
    }
    const yearlyPages = [...pagesByMonth.values()].reduce((sum, pages) => sum + pages, 0);
    return months.map((month) => {
      const pages = pagesByMonth.get(month.key) ?? 0;
      const share = yearlyPages ? Math.round((pages / yearlyPages) * 100) : 0;
      return {
        key: month.key,
        label: month.label,
        value: pages,
        share,
        detail: `${month.label}: ${pages.toLocaleString(locale)} ${t("pages")} · ${share}%`,
      };
    });
  }, [locale, sessions, t]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      const category = book.category.trim() || t("Uncategorized");
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const sorted = [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, locale));
    const usedHues = new Set(CATEGORY_PALETTE.map(({ hue }) => hue));
    return sorted.map((item, index) => {
      if (index < CATEGORY_PALETTE.length) {
        const color = CATEGORY_PALETTE[index]?.color;
        if (color) return { ...item, color };
      }
      const hue = getRandomUniqueHue(usedHues);
      usedHues.add(hue);
      return { ...item, color: `hsl(${hue} 68% 56%)` };
    });
  }, [books, locale, t]);

  const favoriteCategory = useMemo(() => {
    const pagesByCategory = new Map<string, number>();
    for (const session of sessions) {
      const category = booksById.get(session.bookId)?.category.trim() || t("Uncategorized");
      pagesByCategory.set(category, (pagesByCategory.get(category) ?? 0) + Math.max(0, session.pagesRead));
    }
    const favorite = [...pagesByCategory.entries()]
      .filter(([, pages]) => pages > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale))[0];
    return favorite ? { category: favorite[0], pages: favorite[1] } : null;
  }, [booksById, locale, sessions, t]);

  const timeDistribution = useMemo(() => {
    const buckets = TIME_BUCKETS.map((bucket) => ({ ...bucket, seconds: 0 }));
    for (const session of sessions) {
      const date = parseDate(session.startedAt);
      if (!date) continue;
      const hour = date.getHours();
      const bucket = buckets.find((item) => item.key === "night"
        ? hour >= item.startHour || hour < item.endHour
        : hour >= item.startHour && hour < item.endHour);
      if (bucket) bucket.seconds += session.durationSeconds;
    }
    return buckets;
  }, [sessions]);
  const totalTimeSeconds = timeDistribution.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const favoriteTime = timeDistribution.reduce<(typeof timeDistribution)[number] | null>(
    (best, item) => item.seconds > (best?.seconds ?? 0) ? item : best,
    null,
  );

  const weekdayActivity = useMemo(() => {
    const firstDay = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + index);
      const activity = dailyActivity.get(dayKey(date)) ?? { pages: 0, seconds: 0, sessions: 0 };
      return {
        date,
        weekday: date.toLocaleDateString(locale, { weekday: "short" }),
        dayNumber: new Intl.NumberFormat(locale, { useGrouping: false }).format(date.getDate()),
        pages: activity.pages,
        seconds: activity.seconds,
        sessions: activity.sessions,
      };
    });
  }, [dailyActivity, locale]);
  const totalWeekdayPages = weekdayActivity.reduce((sum, day) => sum + day.pages, 0);
  const weekdayPeriodLabel = weekdayActivity[0]?.date.toLocaleDateString(locale, { month: "long", year: "numeric" }) ?? "";
  const maxWeekdayPages = Math.max(...weekdayActivity.map((day) => day.pages), 0);
  const maxTimeSeconds = Math.max(...timeDistribution.map((bucket) => bucket.seconds), 0);

  const timeAverages = useMemo(() => {
    const activeWeeks = new Set<string>();
    for (const session of sessions) {
      const date = parseDate(session.startedAt);
      if (date) activeWeeks.add(periodKey(date, "week"));
    }
    return {
      activeWeeks: activeWeeks.size,
      perActiveDay: dailyActivity.size ? totals.seconds / dailyActivity.size : 0,
      perActiveWeek: activeWeeks.size ? totals.seconds / activeWeeks.size : 0,
    };
  }, [dailyActivity, sessions, totals.seconds]);

  const durationBuckets = useMemo(() => {
    const buckets = [
      { label: "< 15m", count: 0 },
      { label: "15–30m", count: 0 },
      { label: "30–60m", count: 0 },
      { label: "60m+", count: 0 },
    ];
    for (const session of sessions) {
      const minutes = session.durationSeconds / 60;
      const index = minutes < 15 ? 0 : minutes < 30 ? 1 : minutes < 60 ? 2 : 3;
      const bucket = buckets[index];
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [sessions]);
  const totalDurationSessions = durationBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  const efficiencyBuckets = useMemo(() => {
    const buckets = [
      { label: "≤0.5", count: 0 },
      { label: "0.5–1", count: 0 },
      { label: "1–2", count: 0 },
      { label: "2+", count: 0 },
    ];
    for (const session of sessions) {
      if (session.durationSeconds < 30 || session.pagesRead <= 0) continue;
      const pagesPerMinute = session.pagesRead / (session.durationSeconds / 60);
      const index = pagesPerMinute <= 0.5 ? 0 : pagesPerMinute <= 1 ? 1 : pagesPerMinute <= 2 ? 2 : 3;
      const bucket = buckets[index];
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [sessions]);
  const totalEfficiencySessions = efficiencyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const averageEfficiency = totals.seconds > 0 ? totals.pages / (totals.seconds / 60) : 0;

  const streaks = useMemo(() => {
    const activeKeys = [...dailyActivity.keys()].sort();
    let longest = 0;
    let run = 0;
    let previousOrdinal: number | null = null;
    for (const key of activeKeys) {
      const ordinal = dayOrdinal(key);
      run = previousOrdinal !== null && ordinal === previousOrdinal + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previousOrdinal = ordinal;
    }
    const today = new Date();
    let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!dailyActivity.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (dailyActivity.has(dayKey(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { current, longest };
  }, [dailyActivity]);

  const now = new Date();
  const calendarStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 52 * 7);
  const calendarDays = Array.from({ length: 53 * 7 }, (_, index) => {
    const date = new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate() + index);
    const activity = dailyActivity.get(dayKey(date)) ?? { pages: 0, seconds: 0, sessions: 0 };
    const level = activity.pages === 0 ? 0 : activity.pages < 3 ? 1 : activity.pages < 6 ? 2 : activity.pages < 11 ? 3 : 4;
    const isFuture = date > new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { date, activity, level: isFuture ? 0 : level };
  });
  const calendarMonths = calendarDays
    .map((item, index) => ({ label: item.date.toLocaleDateString(locale, { month: "short" }), column: Math.floor(index / 7) + 1, date: item.date }))
    .filter((item) => item.date.getDate() === 1);
  const calendarActiveDays = calendarDays.filter((item) => item.activity.pages > 0 && item.date <= now).length;
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Date(2023, 0, 1 + index).toLocaleDateString(locale, { weekday: "short" }),
  );

  const trendPagesTotal = trend.reduce((sum, point) => sum + point.pages, 0);
  const trendFinishedTotal = trend.reduce((sum, point) => sum + point.finished, 0);
  const trendChart = useMemo(() => {
    const width = 980;
    const left = 24;
    const right = width - 18;
    const top = 14;
    const baseline = 178;
    const height = baseline - top;
    const maxPages = Math.max(...trend.map((point) => point.pages), 0) || 1;
    const maxFinished = Math.max(...trend.map((point) => point.finished), 0) || 1;
    const pages = trend.map((point, index) => ({
      x: left + (trend.length > 1 ? (index / (trend.length - 1)) * (right - left) : (right - left) / 2),
      y: baseline - (point.pages / maxPages) * height,
    }));
    const finished = trend.map((point, index) => ({
      x: left + (trend.length > 1 ? (index / (trend.length - 1)) * (right - left) : (right - left) / 2),
      y: baseline - (point.finished / maxFinished) * height,
    }));
    const labelStep = Math.max(1, Math.ceil(trend.length / 6));
    const labels = trend.flatMap((point, index) => (
      index % labelStep === 0 || index === trend.length - 1
        ? [{ label: point.label, x: pages[index]?.x ?? left }]
        : []
    ));
    return { width, left, right, top, baseline, pages, finished, labels };
  }, [trend]);
  const hoveredTrendPoint = hoveredTrendIndex === null ? null : trend[hoveredTrendIndex] ?? null;
  const maxMonthlyPages = Math.max(...monthlyComparison.map((month) => month.value), 1);
  const statusData = [
    { key: "reading", label: t("Currently reading"), count: readingBooks.length, color: "#E5C07B" },
    { key: "finished", label: t("Finished"), count: finishedBooks.length, color: "#68B696" },
    { key: "unread", label: t("To read"), count: unreadBooks.length, color: "#334155" },
  ];
  const activeStatus = statusData.find((slice) => slice.key === hoveredStatusKey);
  const activeStatusPercent = activeStatus && books.length
    ? Math.round((activeStatus.count / books.length) * 100)
    : 0;
  const activeShelfPercent = books.length
    ? Math.round((readingBooks.length / books.length) * 100)
    : 0;
  const nextCompletionMilestone = books.length
    ? Math.min(100, (Math.floor((finishedBooks.length / books.length) * 4) + 1) * 25)
    : 25;
  const booksToNextMilestone = books.length
    ? Math.max(0, Math.ceil((books.length * nextCompletionMilestone) / 100) - finishedBooks.length)
    : 0;
  const durationData = durationBuckets.map((bucket) => ({
    ...bucket,
    percent: totalDurationSessions ? (bucket.count / totalDurationSessions) * 100 : 0,
  }));
  const efficiencyData = efficiencyBuckets.map((bucket, index) => ({
    ...bucket,
    percent: totalEfficiencySessions ? (bucket.count / totalEfficiencySessions) * 100 : 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const bookProgressData = readingBooks.map((book) => ({
    id: book.id,
    title: book.title,
    currentPage: Math.max(0, book.currentPage),
    totalPages: Math.max(0, book.totalPages),
    progress: book.totalPages > 0 ? Math.min(100, Math.max(0, (book.currentPage / book.totalPages) * 100)) : 0,
  }));
  const booksWithPageCounts = bookProgressData.filter((book) => book.totalPages > 0);
  const averageBookProgress = booksWithPageCounts.length
    ? booksWithPageCounts.reduce((sum, book) => sum + book.progress, 0) / booksWithPageCounts.length
    : 0;

  return (
    <div className="page-shell analytics-page">
      <SectionTitle eyebrow={t("YOUR READING, IN PERSPECTIVE")} title={t("Reading insights")} detail={t("A quiet look at your reading journey.")} />

      <div className="stats-grid analytics-stats">
        <div className="stat-card analytics-stat-card">
          <div className="analytics-stat-heading"><span>{t("Pages read")}</span><i><BookOpen size={15} /></i></div>
          <strong>{totals.pages.toLocaleString(locale)}</strong>
          <small>{t("Tracked reading activity")}</small>
        </div>
        <div className="stat-card stat-accent analytics-stat-card">
          <div className="analytics-stat-heading"><span>{t("Reading time")}</span><i><Clock3 size={15} /></i></div>
          <strong>{formatDuration(totals.seconds, locale)}</strong>
          <small>{totals.sessionCount.toLocaleString(locale)} {t("sessions")}</small>
        </div>
        <div className="stat-card analytics-stat-card">
          <div className="analytics-stat-heading"><span>{t("Active days")}</span><i><CalendarDays size={15} /></i></div>
          <strong>{calendarActiveDays.toLocaleString(locale)}</strong>
          <small>{t("in the last year")}</small>
        </div>
        <div className="stat-card analytics-stat-card">
          <div className="analytics-stat-heading"><span>{t("Current streak")}</span><i><Flame size={15} /></i></div>
          <strong>{streaks.current} <small>{t("days")}</small></strong>
          <small>{t("Longest streak")}: {streaks.longest} {t("days")}</small>
        </div>
        <div className="stat-card analytics-stat-card analytics-stat-summary">
          <div className="analytics-stat-heading"><span>{t("Average per active day")}</span><i><Clock3 size={15} /></i></div>
          <strong>{formatDuration(timeAverages.perActiveDay, locale)}</strong>
          <small>{t("Average reading time on days you read")}</small>
        </div>
        <div className="stat-card analytics-stat-card analytics-stat-summary">
          <div className="analytics-stat-heading"><span>{t("Average per active week")}</span><i><CalendarDays size={15} /></i></div>
          <strong>{formatDuration(timeAverages.perActiveWeek, locale)}</strong>
          <small>{timeAverages.activeWeeks.toLocaleString(locale)} {t("active reading weeks")}</small>
        </div>
        <div className="stat-card analytics-stat-card analytics-stat-summary">
          <div className="analytics-stat-heading"><span>{t("Favorite category")}</span><i><Star size={15} /></i></div>
          <strong>{favoriteCategory?.category ?? t("...")}</strong>
          <small>{favoriteCategory ? `${favoriteCategory.pages.toLocaleString(locale)} ${t("pages")} ${t("read")}` : t("Read more to discover your favorite category.")}</small>
        </div>
        <div className="stat-card analytics-stat-card analytics-stat-summary">
          <div className="analytics-stat-heading"><span>{t("Favorite reading time")}</span><i><Clock3 size={15} /></i></div>
          <strong>{favoriteTime && favoriteTime.seconds > 0 ? t(favoriteTime.labelKey) : t("...")}</strong>
          <small>{favoriteTime && favoriteTime.seconds > 0 ? `${formatDuration(favoriteTime.seconds, locale)} ${t("of tracked reading time")}` : t("Track a reading session to discover your favorite time.")}</small>
        </div>
      </div>

      {sessionsError && <ErrorAlert className="analytics-session-error" message={sessionsError} />}

      <section className="mb-4 analytics-chart-card analytics-calendar-card">
        <header className="analytics-chart-heading">
          <div><span className="eyebrow">{t("READING ACTIVITY")}</span><h2>{t("Reading calendar")}</h2></div>
          <div className="analytics-calendar-summary">
            <strong>{calendarActiveDays.toLocaleString(locale)}</strong><span>{t("active days in the last year")}</span>
          </div>
        </header>
        <div className="analytics-calendar-scroll">
          <div className="analytics-calendar-inner">
            <div className="analytics-calendar-months">
              {calendarMonths.map((month) => (
                <span key={month.label + month.column} style={{ gridColumn: `${month.column} / span 4` }}>{month.label}</span>
              ))}
            </div>
            <div className="analytics-calendar-body">
              <div className="analytics-weekday-labels">
                {weekdayLabels.map((label, index) => <span key={index}>{index % 2 === 0 ? label : ""}</span>)}
              </div>
              <div className="analytics-heatmap" dir="ltr">
                {calendarDays.map(({ date, activity, level }) => {
                  const minutes = Math.round(activity.seconds / 60);
                  return (
                    <span
                      key={dayKey(date)}
                      className={`analytics-heat-cell level-${level}`}
                      title={`${date.toLocaleDateString(locale, { dateStyle: "medium" })}: ${activity.pages} ${t("pages")}, ${formatDuration(activity.seconds, locale)}`}
                      aria-label={`${date.toLocaleDateString(locale, { dateStyle: "medium" })}: ${activity.pages} ${t("pages")}, ${minutes} ${t("minutes")}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <footer className="analytics-calendar-footer">
          <span>{sessionsLoading ? t("Loading reading activity…") : t("Reading activity tracking starts with your next session.")}</span>
          <span className="analytics-calendar-scale">{t("Less")} <i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /> {t("More")}</span>
        </footer>
      </section>

      <section className="mb-4 analytics-chart-card analytics-trend-card">
        <header className="analytics-chart-heading analytics-trend-heading">
          <div><span className="eyebrow">{t("PAGES & FINISHES")}</span><h2>{t("Pages read")} &amp; {t("Books finished")}</h2></div>
          <div className="analytics-trend-controls">
            <div className="analytics-segmented-control analytics-period-control" role="group" aria-label={t("Time period")}>
              {(["day", "week", "month", "year"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={trendPeriod === period}
                  onClick={() => {
                    setTrendPeriod(period);
                    setHoveredTrendIndex(null);
                  }}
                >
                  {t(period === "day" ? "Day" : period === "week" ? "Week" : period === "month" ? "Month" : "Year")}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="analytics-trend-total">
          <span className="analytics-trend-total-item"><i className="analytics-trend-pages-dot" /><strong>{trendPagesTotal.toLocaleString(locale)}</strong>{t("Pages read")}</span>
          <span className="analytics-trend-total-item"><i className="analytics-trend-finished-dot" /><strong>{trendFinishedTotal.toLocaleString(locale)}</strong>{t("Books finished")}</span>
        </div>
        <div
          className="analytics-trend-chart"
          role="group"
          tabIndex={0}
          aria-label={`${t("Pages read")}: ${trendPagesTotal}, ${t("Books finished")}: ${trendFinishedTotal}`}
          aria-describedby={hoveredTrendPoint ? "analytics-trend-tooltip" : undefined}
          onMouseMove={(event) => {
            if (trend.length < 2) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (bounds.width === 0) return;
            const chartX = ((event.clientX - bounds.left) / bounds.width) * trendChart.width;
            const ratio = Math.min(1, Math.max(0, (chartX - trendChart.left) / (trendChart.right - trendChart.left)));
            setHoveredTrendIndex(Math.round(ratio * (trend.length - 1)));
          }}
          onMouseLeave={() => setHoveredTrendIndex(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setHoveredTrendIndex((index) => Math.min(trend.length - 1, (index ?? -1) + 1));
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              setHoveredTrendIndex((index) => Math.max(0, (index ?? trend.length) - 1));
            }
          }}
        >
          <svg
            className="analytics-trend-svg"
            viewBox={`0 0 ${trendChart.width} 220`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="analyticsPagesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity=".4" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity=".02" />
              </linearGradient>
              <linearGradient id="analyticsFinishedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity=".22" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((line) => {
              const y = trendChart.top + (trendChart.baseline - trendChart.top) * (line / 4);
              return <line key={line} x1={trendChart.left} x2={trendChart.right} y1={y} y2={y} className="analytics-trend-grid-line" />;
            })}
            <path d={smoothAreaPath(trendChart.finished, trendChart.baseline)} fill="url(#analyticsFinishedFill)" />
            <path d={smoothAreaPath(trendChart.pages, trendChart.baseline)} fill="url(#analyticsPagesFill)" />
            <path d={smoothLinePath(trendChart.finished)} className="analytics-trend-finished-line" />
            <path d={smoothLinePath(trendChart.pages)} className="analytics-trend-pages-line" />
            {trendChart.labels.map((item) => (
              <text
                key={`${item.label}-${item.x}`}
                x={item.x}
                y={204}
                textAnchor={item.x === trendChart.left ? "start" : item.x === trendChart.right ? "end" : "middle"}
                className="analytics-trend-label"
              >
                {item.label}
              </text>
            ))}
          </svg>
          {hoveredTrendPoint && (
            <div
              className="analytics-trend-tooltip"
              id="analytics-trend-tooltip"
              role="status"
              aria-live="polite"
            >
              <strong>
                {trendPeriod === "year"
                  ? hoveredTrendPoint.date.getFullYear().toLocaleString(locale)
                  : hoveredTrendPoint.date.toLocaleDateString(locale, { dateStyle: "medium" })}
              </strong>
              <span>
                <i className="analytics-trend-pages-dot" />
                {t("Pages read")}
                <b>{hoveredTrendPoint.pages.toLocaleString(locale)}</b>
                <small>{trendPagesTotal ? Math.round((hoveredTrendPoint.pages / trendPagesTotal) * 100) : 0}%</small>
              </span>
              <span>
                <i className="analytics-trend-finished-dot" />
                {t("Books finished")}
                <b>{hoveredTrendPoint.finished.toLocaleString(locale)}</b>
                <small>{trendFinishedTotal ? Math.round((hoveredTrendPoint.finished / trendFinishedTotal) * 100) : 0}%</small>
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="analytics-chart-grid">
        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("READING NOW")}</span><h2>{t("Currently reading progress")}</h2></div>
            {booksWithPageCounts.length > 0 && (
              <span className="analytics-chart-count">
                {averageBookProgress.toLocaleString(locale, { maximumFractionDigits: 0 })}% {t("average progress")}
              </span>
            )}
          </header>
          {bookProgressData.length ? (
            <div className="analytics-reading-progress-scroll">
              <div className="analytics-reading-progress-list">
                {bookProgressData.map((book) => {
                  const percentage = Math.round(book.progress);
                  return (
                    <div className="analytics-reading-progress-item" key={book.id}>
                      <div className="analytics-reading-progress-heading">
                        <span title={book.title}>{book.title}</span>
                        <strong>{percentage}%</strong>
                      </div>
                      <div
                        className="analytics-reading-progress-track"
                        role="progressbar"
                        aria-label={`${book.title}: ${percentage}%`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <span style={{ width: `${book.progress}%` }} />
                      </div>
                      <small>
                        {book.totalPages
                          ? `${book.currentPage.toLocaleString(locale)} / ${book.totalPages.toLocaleString(locale)} ${t("pages")}`
                          : t("Page count not available")}
                      </small>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="analytics-empty-chart">{t("No books currently in reading status.")}</p>
          )}
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("YOUR COLLECTION")}</span><h2>{t("Collection status")}</h2></div>
          </header>
          <div className="analytics-status-content">
            <div
              className="analytics-donut"
              role="img"
              aria-label={`${books.length} ${t("books across your collection")}`}
              onMouseLeave={() => setHoveredStatusKey(null)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    stroke="var(--bg-card)"
                    onMouseEnter={(_data, index) => setHoveredStatusKey(statusData[index]?.key ?? null)}
                  >
                    {statusData.map((slice) => {
                      const isActive = hoveredStatusKey === slice.key;
                      const isDimmed = hoveredStatusKey !== null && !isActive;
                      return (
                        <Cell
                          key={slice.key}
                          fill={slice.color}
                          opacity={isDimmed ? 0.38 : 1}
                          stroke={isActive ? "var(--text-primary)" : "var(--bg-card)"}
                          strokeWidth={isActive ? 2 : 1}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value) => {
                      const count = Number(value);
                      return [`${count.toLocaleString(locale)} · ${books.length ? Math.round((count / books.length) * 100) : 0}%`, t("Books")];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="analytics-pie-center">
                <strong>{(activeStatus?.count ?? books.length).toLocaleString(locale)}</strong>
                <span>{activeStatus ? `${activeStatus.label} (${activeStatusPercent}%)` : t("All books")}</span>
              </div>
            </div>
            <div className="analytics-status-legend" role="list" aria-label={t("Collection status")}>
              {statusData.map((slice) => (
                <div
                  className="analytics-status-row"
                  key={slice.key}
                  role="listitem"
                  tabIndex={0}
                  data-active={hoveredStatusKey === slice.key}
                  onMouseEnter={() => setHoveredStatusKey(slice.key)}
                  onMouseLeave={() => setHoveredStatusKey(null)}
                  onFocus={() => setHoveredStatusKey(slice.key)}
                  onBlur={() => setHoveredStatusKey(null)}
                >
                  <span><i style={{ backgroundColor: slice.color }} />{slice.label}</span>
                  <strong className={slice.count === 0 ? "analytics-status-zero" : undefined}>
                    {slice.count.toLocaleString(locale)}
                    <small>{` · ${books.length ? Math.round((slice.count / books.length) * 100) : 0}%`}</small>
                  </strong>
                </div>
              ))}
            </div>
            <div
              className="analytics-status-stack"
              role="img"
              aria-label={statusData.map((slice) => `${slice.label}: ${slice.count} (${books.length ? Math.round((slice.count / books.length) * 100) : 0}%)`).join(", ")}
            >
              {statusData.map((slice) => (
                <span
                  key={slice.key}
                  title={`${slice.label}: ${slice.count.toLocaleString(locale)} · ${books.length ? Math.round((slice.count / books.length) * 100) : 0}%`}
                  style={{ flex: `${slice.count} 1 0%`, backgroundColor: slice.color }}
                />
              ))}
            </div>
            {books.length > 0 && (
              <div className="analytics-status-insight">
                <span><strong>{activeShelfPercent}%</strong> {t("Active shelf")}</span>
                <span className="analytics-status-insight-detail">
                  {finishedBooks.length === books.length
                    ? t("Collection complete")
                    : `${booksToNextMilestone} ${t(booksToNextMilestone === 1 ? "book away from" : "books away from")} ${nextCompletionMilestone}% ${t("completion")}`}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("Category")}</span><h2>{t("Category distribution")}</h2></div>
          </header>
          <div className="analytics-category-content">
            <div className="analytics-category-pie" role="img" aria-label={t("Category distribution")}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="count" nameKey="category" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--bg-card)">
                    {categoryData.map((item) => <Cell key={item.category} fill={item.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value) => {
                      const count = Number(value);
                      return [`${count.toLocaleString(locale)} · ${books.length ? Math.round((count / books.length) * 100) : 0}%`, t("Books")];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="analytics-pie-center"><strong>{books.length.toLocaleString(locale)}</strong><span>{t("All books")}</span></div>
            </div>
            <div className="analytics-category-legend">
              {categoryData.map((item) => (
                <div key={item.category}>
                  <span><i style={{ backgroundColor: item.color }} />{item.category}</span>
                  <strong>{item.count.toLocaleString(locale)}<small>{books.length ? ` · ${Math.round((item.count / books.length) * 100)}%` : ""}</small></strong>
                </div>
              ))}
              {favoriteCategory ? (
                <div className="analytics-favorite-category"><span>{t("Favorite category")}</span><strong>{favoriteCategory.category} <small>· {favoriteCategory.pages.toLocaleString(locale)} {t("pages")}</small></strong></div>
              ) : (
                <div className="analytics-favorite-category"><span>{t("Favorite category")}</span><strong>{t("Not enough reading history yet.")}</strong></div>
              )}
            </div>
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("BY SESSION START")}</span><h2>{t("Reading time distribution")}</h2></div>
            {favoriteTime && favoriteTime.seconds > 0 && <span className="analytics-favorite-badge"><Star size={12} fill="currentColor" /> {t(favoriteTime.labelKey)}</span>}
          </header>
          <div className="analytics-custom-bar-chart analytics-time-distribution" role="list" aria-label={t("Reading time distribution")}>
            {timeDistribution.map((bucket) => {
              const share = totalTimeSeconds ? Math.round((bucket.seconds / totalTimeSeconds) * 100) : 0;
              const barHeight = maxTimeSeconds ? (bucket.seconds / maxTimeSeconds) * 100 : 0;
              return (
                <div
                  className="analytics-custom-bar-column"
                  key={bucket.key}
                  role="listitem"
                  aria-label={`${t(bucket.labelKey)}: ${formatDuration(bucket.seconds, locale)}, ${share}%`}
                >
                  <div className="analytics-custom-bar-values">
                    <strong>{formatDuration(bucket.seconds, locale)}</strong>
                    <small>{share}%</small>
                  </div>
                  <div className="analytics-custom-bar-track" aria-hidden="true">
                    <span style={{ height: `${barHeight}%` }} />
                  </div>
                  <span className="analytics-custom-bar-label">{t(bucket.labelKey)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div>
              <span className="eyebrow">{t("WEEKLY PATTERN")}</span>
              <h2>{t("Reading by day of week")}</h2>
              <span className="analytics-chart-period">{weekdayPeriodLabel}</span>
            </div>
          </header>
          <div className="analytics-custom-bar-chart analytics-weekday-distribution" role="list" aria-label={t("Reading by day of week")}>
            {weekdayActivity.map((day) => {
              const share = totalWeekdayPages ? Math.round((day.pages / totalWeekdayPages) * 100) : 0;
              const barHeight = maxWeekdayPages ? (day.pages / maxWeekdayPages) * 100 : 0;
              return (
                <div
                  className="analytics-custom-bar-column"
                  key={day.date.toISOString()}
                  role="listitem"
                  aria-label={`${day.date.toLocaleDateString(locale, { dateStyle: "full" })}: ${day.pages.toLocaleString(locale)} ${t("Pages read")}, ${share}%`}
                >
                  <div className="analytics-custom-bar-values">
                    <strong>{day.pages.toLocaleString(locale)}</strong>
                    <small>{share}%</small>
                  </div>
                  <div className="analytics-custom-bar-track" aria-hidden="true">
                    <span style={{ height: `${barHeight}%` }} />
                  </div>
                  <span className="analytics-weekday-label">
                    <strong>{day.dayNumber}</strong>
                    <small>{day.weekday}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div>
              <span className="eyebrow">{t("MONTHLY COMPARISON")}</span>
              <h2>{t("Monthly reading comparison")}</h2>
            </div>
          </header>
          <div className="analytics-radar-chart">
            <CustomRadarChart
              data={monthlyComparison}
              maxValue={maxMonthlyPages}
              ariaLabel={t("Monthly reading comparison")}
            />
          </div>
          <div className="analytics-monthly-details" role="list" aria-label={t("Monthly reading comparison")}>
            {monthlyComparison.map((month) => (
              <div className="analytics-monthly-detail" key={month.key} role="listitem" aria-label={month.detail}>
                <span>{month.label}</span>
                <strong>{month.value.toLocaleString(locale)} <small>{month.share}%</small></strong>
                <div className="analytics-monthly-detail-track" aria-hidden="true">
                  <span style={{ width: `${(month.value / maxMonthlyPages) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("SESSION LENGTH")}</span><h2>{t("Session duration distribution")}</h2></div>
          </header>
          <div className="analytics-radar-chart">
            <CustomRadarChart
              data={durationData.map((bucket) => ({
                label: bucket.label,
                value: bucket.percent,
                detail: `${bucket.label}: ${Math.round(bucket.percent)}% · ${bucket.count} ${t("sessions")}`,
              }))}
              maxValue={100}
              ariaLabel={t("Session duration distribution")}
            />
          </div>
        </section>

        <section className="analytics-chart-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("PACE")}</span><h2>{t("Reading efficiency distribution")}</h2></div>
            <span className="analytics-chart-count"><Zap size={12} /> {averageEfficiency.toLocaleString(locale, { maximumFractionDigits: 1 })} {t("pages/min")}</span>
          </header>
          <div className="analytics-radial-layout">
            <div className="analytics-recharts analytics-radial-chart">
              <ResponsiveContainer width="100%" height={205}>
                <RadialBarChart data={efficiencyData} innerRadius="18%" outerRadius="92%" startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="percent" background cornerRadius={5}>
                    {efficiencyData.map((item) => <Cell key={item.label} fill={item.color} />)}
                  </RadialBar>
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value, _name, item) => [`${Number(value).toFixed(0)}% · ${item.payload.count} ${t("sessions")}`, t("Share of sessions")]}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="analytics-radial-legend">
              {efficiencyData.map((bucket) => (
                <div key={bucket.label}>
                  <span><i style={{ backgroundColor: bucket.color }} />{bucket.label} {t("pages/min")}</span>
                  <strong>{bucket.count}<small> · {bucket.percent.toFixed(0)}%</small></strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="analytics-chart-card analytics-streak-card">
          <header className="analytics-chart-heading">
            <div><span className="eyebrow">{t("CONSISTENCY")}</span><h2>{t("Reading streaks")}</h2></div>
            <Flame size={18} className="analytics-streak-flame" />
          </header>
          <div className="analytics-streak-stats">
            <div><span>{t("Current streak")}</span><strong>{streaks.current}<small>{t("days")}</small></strong></div>
            <div><span>{t("Longest streak")}</span><strong>{streaks.longest}<small>{t("days")}</small></strong></div>
          </div>
          {!totals.sessionCount && <p className="analytics-tracking-note">{t("Reading activity tracking starts with your next session.")}</p>}
        </section>
      </div>

      <section className="insight-note"><TrendingUp size={17} /><div><strong>{t("Keep your rhythm")}</strong><p>{t("Every page you read adds to your personal story. Small, steady sessions are a great way to build a lasting habit.")}</p></div></section>
    </div>
  );
}
