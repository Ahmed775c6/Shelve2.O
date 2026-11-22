import type { WritingSession } from "../../types";

export interface WritingActivityDay {
  date: string;
  label: string;
  words: number;
  seconds: number;
}

export interface WritingAnalytics {
  todayWords: number;
  dailyProgress: number;
  activityDays: WritingActivityDay[];
  writingStreak: number;
  weeklyWords: number;
  weeklySeconds: number;
  averageWpm: number;
}

export function calculateWritingAnalytics(
  sessions: WritingSession[],
  projectId: string | undefined,
  dailyGoal: number,
  locale: string,
  now = new Date(),
): WritingAnalytics {
  const today = now.toISOString().slice(0, 10);
  const todayWords = sessions
    .filter((session) => session.date === today && session.projectId === projectId)
    .reduce((sum, session) => sum + session.wordsWritten, 0);
  const activityDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      label: date.toLocaleDateString(locale, { weekday: "short" }),
      words: sessions.filter((session) => session.date === key).reduce((sum, session) => sum + session.wordsWritten, 0),
      seconds: sessions.filter((session) => session.date === key).reduce((sum, session) => sum + session.durationSeconds, 0),
    };
  });
  let writingStreak = 0;
  const streakStart = sessions.some((session) => session.date === today && session.wordsWritten > 0) ? 0 : 1;
  for (let offset = streakStart; offset < streakStart + 365; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    if (!sessions.some((session) => session.date === key && session.wordsWritten > 0)) break;
    writingStreak += 1;
  }
  const weeklyWords = activityDays.reduce((sum, day) => sum + day.words, 0);
  const weeklySeconds = activityDays.reduce((sum, day) => sum + day.seconds, 0);
  return {
    todayWords,
    dailyProgress: Math.min(100, Math.round(todayWords / Math.max(1, dailyGoal) * 100)),
    activityDays,
    writingStreak,
    weeklyWords,
    weeklySeconds,
    averageWpm: weeklySeconds > 0 ? Math.round(weeklyWords / (weeklySeconds / 60)) : 0,
  };
}
