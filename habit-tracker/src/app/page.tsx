'use client';

import { useEffect, useMemo, useState } from "react";

type Habit = {
  id: string;
  name: string;
  importance: number;
  targetMinutes?: number;
};

type HabitLog = {
  habitId: string;
  date: string;
  minutes: number;
};

type GratitudeEntry = {
  date: string;
  promptId: string;
  response: string;
};

type AppState = {
  habits: Habit[];
  logs: HabitLog[];
  gratitude: GratitudeEntry[];
  premium: boolean;
};

type Summary = {
  label: string;
  dateLabel: string;
  totalMinutes: number;
  averageMinutesPerHabit: number;
  topHabit?: {
    name: string;
    minutes: number;
  };
  activeDays: number;
  suggestedFocus: string;
};

const STORAGE_KEY = "habit-tracker-state-v1";

const GRATITUDE_PROMPTS = [
  { id: "prompt-1", text: "Name one habit that made you proud today." },
  { id: "prompt-2", text: "Recall a moment someone made you smile today." },
  { id: "prompt-3", text: "What are you grateful for that helped you stay consistent?" },
  { id: "prompt-4", text: "Write one tiny win you celebrated today." },
  { id: "prompt-5", text: "Who encouraged you recently? Capture their words." },
  { id: "prompt-6", text: "Describe a habit that felt effortless today." },
  { id: "prompt-7", text: "Share one improvement you noticed in yourself this week." },
  { id: "prompt-8", text: "What energized you most while working on your habits?" },
  { id: "prompt-9", text: "Write one positive surprise from your day." },
  { id: "prompt-10", text: "Which habit moved you closer to your goals today?" },
];

const defaultState: AppState = {
  habits: [],
  logs: [],
  gratitude: [],
  premium: false,
};

function readStateFromStorage(): AppState {
  if (typeof window === "undefined") {
    return defaultState;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return defaultState;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<AppState>;
    return {
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      gratitude: Array.isArray(parsed.gratitude) ? parsed.gratitude : [],
      premium: typeof parsed.premium === "boolean" ? parsed.premium : false,
    };
  } catch {
    return defaultState;
  }
}

function formatDateKey(date: Date): string {
  const utc = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return utc.toISOString().split("T")[0]!;
}

function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getPromptForDate(dateKey: string) {
  const hash = dateKey
    .split("")
    .map((char) => char.charCodeAt(0))
    .reduce((acc, code) => (acc + code * 31) % GRATITUDE_PROMPTS.length, 0);
  return GRATITUDE_PROMPTS[hash];
}

function asMinutes(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed);
}

function summarizeRange({
  logs,
  habits,
  label,
  start,
  end,
}: {
  logs: HabitLog[];
  habits: Habit[];
  label: string;
  start: Date;
  end: Date;
}): Summary {
  const startKey = formatDateKey(start);
  const endKey = formatDateKey(end);
  const activeLogs = logs.filter((log) => log.date >= startKey && log.date <= endKey);
  const totalsByHabit = new Map<string, number>();
  const activeDays = new Set<string>();

  for (const log of activeLogs) {
    totalsByHabit.set(log.habitId, (totalsByHabit.get(log.habitId) ?? 0) + log.minutes);
    if (log.minutes > 0) {
      activeDays.add(log.date);
    }
  }

  const totalMinutes = Array.from(totalsByHabit.values()).reduce((acc, curr) => acc + curr, 0);
  let topHabit: Summary["topHabit"];

  if (totalsByHabit.size > 0) {
    const [habitId, minutes] = Array.from(totalsByHabit.entries()).sort((a, b) => b[1] - a[1])[0]!;
    const habitName = habits.find((habit) => habit.id === habitId)?.name ?? "Unknown habit";
    topHabit = { name: habitName, minutes };
  }

  const averageMinutesPerHabit =
    totalsByHabit.size > 0 ? totalMinutes / totalsByHabit.size : 0;

  const focusHabit =
    Array.from(totalsByHabit.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => habits.find((habit) => habit.id === id)?.name ?? "")
      .find((name) => name.length > 0) ?? "Add more habits to unlock insights.";

  const suggestedFocus =
    totalsByHabit.size > 1
      ? `Consider investing more energy into "${focusHabit}" for a balanced routine.`
      : totalsByHabit.size === 1
        ? `Great consistency! Keep sharpening "${topHabit?.name}".`
        : "Log habits consistently to unlock personalized coaching.";

  return {
    label,
    dateLabel: `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`,
    totalMinutes,
    averageMinutesPerHabit: Number(averageMinutesPerHabit.toFixed(1)),
    topHabit,
    activeDays: activeDays.size,
    suggestedFocus,
  };
}

function generateAiEvaluation({
  habits,
  logs,
  gratitude,
}: {
  habits: Habit[];
  logs: HabitLog[];
  gratitude: GratitudeEntry[];
}): string {
  if (habits.length === 0 || logs.length === 0) {
    return "Hi trailblazer! Log a handful of habits and gratitude reflections to unlock a premium performance breakdown.";
  }

  const today = new Date();
  const lastSevenStart = new Date(today);
  lastSevenStart.setDate(today.getDate() - 6);
  const lastSevenKey = formatDateKey(lastSevenStart);
  const todayKey = formatDateKey(today);

  const weeklyLogs = logs.filter((log) => log.date >= lastSevenKey && log.date <= todayKey);

  const totalsByHabit = new Map<string, number>();
  const streaksByHabit = new Map<string, number>();
  const daysLogged = new Set<string>();

  for (const log of weeklyLogs) {
    totalsByHabit.set(log.habitId, (totalsByHabit.get(log.habitId) ?? 0) + log.minutes);
    if (log.minutes > 0) {
      daysLogged.add(log.date);
    }
  }

  const weekDays = 7;
  for (const habit of habits) {
    let streak = 0;
    for (let offset = 0; offset < weekDays; offset += 1) {
      const cursor = new Date(lastSevenStart);
      cursor.setDate(cursor.getDate() + offset);
      const cursorKey = formatDateKey(cursor);
      const hasLog = weeklyLogs.some(
        (log) => log.habitId === habit.id && log.date === cursorKey && log.minutes > 0,
      );
      if (hasLog) {
        streak += 1;
      } else if (streak > 0) {
        streak -= 0.5;
      }
    }
    streaksByHabit.set(habit.id, Math.max(0, Math.round(streak)));
  }

  const gratitudeCount = gratitude.filter(
    (entry) => entry.date >= lastSevenKey && entry.date <= todayKey && entry.response.trim().length > 0,
  ).length;

  const strongestHabit = Array.from(totalsByHabit.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([habitId, minutes]) => ({
      name: habits.find((habit) => habit.id === habitId)?.name ?? "Unknown habit",
      minutes,
      streak: streaksByHabit.get(habitId) ?? 0,
    }))[0];

  const mostImportantUnmet = habits
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .filter((habit) => !totalsByHabit.has(habit.id))[0];

  const reflectionTone =
    gratitudeCount >= 5
      ? "Your gratitude practice is anchoring resilience—keep that momentum."
      : gratitudeCount >= 3
        ? "Consider adding one more gratitude note to amplify your energy."
        : "Sprinkle more gratitude check-ins to boost motivation.";

  return [
    strongestHabit
      ? `⭐ Standout habit: "${strongestHabit.name}" with ${strongestHabit.minutes} minutes logged and a ${strongestHabit.streak}-day activity streak.`
      : "Log minutes for your most important habits to surface highlights.",
    mostImportantUnmet
      ? `🎯 Opportunity: "${mostImportantUnmet.name}" ranks high in importance but needs fresh reps. Schedule micro-sessions to restart momentum.`
      : "All high-importance habits saw activity—excellent alignment!",
    `🧠 Consistency: You recorded habits on ${daysLogged.size} of the last 7 days. Aim for 5+ to reinforce identity-level change.`,
    `💬 Gratitude: ${gratitudeCount} reflections captured this week. ${reflectionTone}`,
  ].join(" ");
}

export default function Home() {
  const initialState = useMemo(() => readStateFromStorage(), []);
  const [state, setState] = useState<AppState>(initialState);
  const todayKey = formatDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [habitName, setHabitName] = useState("");
  const [habitImportance, setHabitImportance] = useState(3);
  const [habitTargetMinutes, setHabitTargetMinutes] = useState("");
  const [gratitudeDraft, setGratitudeDraft] = useState(() => {
    const entry = initialState.gratitude.find((item) => item.date === todayKey);
    return entry?.response ?? "";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const habitsOrdered = useMemo(
    () =>
      state.habits
        .slice()
        .sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name)),
    [state.habits],
  );

  const logsForSelectedDate = useMemo(
    () => state.logs.filter((log) => log.date === selectedDate),
    [state.logs, selectedDate],
  );

  const summaryData = useMemo(() => {
    const today = new Date();
    const weeklyStart = new Date(today);
    weeklyStart.setDate(today.getDate() - 6);
    const monthlyStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearlyStart = new Date(today.getFullYear(), 0, 1);

    return [
      summarizeRange({
        logs: state.logs,
        habits: state.habits,
        label: "Weekly Pulse",
        start: weeklyStart,
        end: today,
      }),
      summarizeRange({
        logs: state.logs,
        habits: state.habits,
        label: "Monthly Momentum",
        start: monthlyStart,
        end: today,
      }),
      summarizeRange({
        logs: state.logs,
        habits: state.habits,
        label: "Year-End Spotlight",
        start: yearlyStart,
        end: today,
      }),
    ];
  }, [state.logs, state.habits]);

  const gratitudePrompt = useMemo(() => getPromptForDate(selectedDate), [selectedDate]);
  const selectedDateNice = useMemo(
    () =>
      parseDate(selectedDate).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [selectedDate],
  );

  const historyGroups = useMemo(() => {
    const byDate = new Map<string, { habits: HabitLog[]; gratitude?: GratitudeEntry }>();

    for (const log of state.logs) {
      if (!byDate.has(log.date)) {
        byDate.set(log.date, { habits: [log] });
      } else {
        byDate.get(log.date)!.habits.push(log);
      }
    }

    for (const entry of state.gratitude) {
      if (!byDate.has(entry.date)) {
        byDate.set(entry.date, { habits: [], gratitude: entry });
      } else {
        byDate.get(entry.date)!.gratitude = entry;
      }
    }

    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .map(([date, { habits, gratitude }]) => ({
        date,
        habits: habits.sort((a, b) => {
          const habitA = state.habits.find((habit) => habit.id === a.habitId);
          const habitB = state.habits.find((habit) => habit.id === b.habitId);
          return (habitB?.importance ?? 0) - (habitA?.importance ?? 0);
        }),
        gratitude,
      }));
  }, [state.logs, state.gratitude, state.habits]);

  const premiumInsights = useMemo(() => {
    if (!state.premium) return null;
    return generateAiEvaluation({
      habits: state.habits,
      logs: state.logs,
      gratitude: state.gratitude,
    });
  }, [state.habits, state.logs, state.gratitude, state.premium]);

  const handleAddHabit = () => {
    if (!habitName.trim()) {
      return;
    }
    const newHabit: Habit = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      name: habitName.trim(),
      importance: Math.max(1, Math.min(5, Math.round(habitImportance))),
      targetMinutes: habitTargetMinutes ? asMinutes(habitTargetMinutes) : undefined,
    };
    setState((prev) => ({
      ...prev,
      habits: [...prev.habits, newHabit],
    }));
    setHabitName("");
    setHabitImportance(3);
    setHabitTargetMinutes("");
  };

  const handleUpdateLog = (habitId: string, minutesInput: string) => {
    const minutes = asMinutes(minutesInput);
    setState((prev) => {
      const filtered = prev.logs.filter(
        (log) => !(log.habitId === habitId && log.date === selectedDate),
      );
      if (minutes <= 0) {
        return { ...prev, logs: filtered };
      }
      return {
        ...prev,
        logs: [...filtered, { habitId, date: selectedDate, minutes }],
      };
    });
  };

  const handleSaveGratitude = () => {
    const trimmed = gratitudeDraft.trim();
    setState((prev) => {
      const filtered = prev.gratitude.filter((entry) => entry.date !== selectedDate);
      if (!trimmed) {
        return { ...prev, gratitude: filtered };
      }
      return {
        ...prev,
        gratitude: [
          ...filtered,
          { date: selectedDate, promptId: gratitudePrompt.id, response: trimmed },
        ],
      };
    });
    setGratitudeDraft(trimmed);
  };

  const togglePremium = () => {
    setState((prev) => ({ ...prev, premium: !prev.premium }));
  };

  return (
    <div className="min-h-screen bg-slate-950 py-12 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4">
        <header className="rounded-3xl bg-slate-900/60 p-8 ring-1 ring-slate-800 backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Ritual Rhythm Habit Tracker
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                Map your habits, capture daily gratitude, and surface actionable insights that power
                weekly, monthly, and year-end reflections.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={togglePremium}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${state.premium ? "bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/40" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
              >
                {state.premium ? "Disable Premium AI" : "Unlock Premium AI"}
              </button>
              <div className="rounded-full bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
                {state.premium ? "Premium Active" : "Core Mode"}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
              <h2 className="text-xl font-semibold text-white">Habit Blueprint</h2>
              <p className="mt-1 text-sm text-slate-400">
                Define and order your habits by importance. Optional targets help you calibrate
                focused effort.
              </p>
              <div className="mt-4 space-y-4">
                <div className="grid gap-3">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Habit Name
                  </label>
                  <input
                    value={habitName}
                    onChange={(event) => setHabitName(event.target.value)}
                    placeholder="Morning workout, journaling, mindfulness..."
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Importance (1-5)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={habitImportance}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isNaN(value)) {
                          setHabitImportance(1);
                          return;
                        }
                        setHabitImportance(Math.max(1, Math.min(5, Math.round(value))));
                      }}
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Target Minutes (optional)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={habitTargetMinutes}
                      onChange={(event) => setHabitTargetMinutes(event.target.value)}
                      placeholder="e.g. 30"
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddHabit}
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold tracking-wide text-slate-950 transition hover:bg-emerald-400"
                >
                  Add Habit To Stack
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {habitsOrdered.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
                    Once you add habits, they will appear here ordered by importance.
                  </p>
                ) : (
                  habitsOrdered.map((habit) => (
                    <div
                      key={habit.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-white">{habit.name}</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Importance score {habit.importance}
                            {habit.targetMinutes
                              ? ` - Target: ${habit.targetMinutes} min`
                              : ""}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                          Priority {habit.importance}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8 md:col-span-7">
            <div className="rounded-3xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Daily Control Center</h2>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                    {selectedDateNice}
                  </p>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setSelectedDate(nextDate);
                    const entry = state.gratitude.find((item) => item.date === nextDate);
                    setGratitudeDraft(entry?.response ?? "");
                  }}
                  max={todayKey}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="mt-6 space-y-4">
                {habitsOrdered.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
                    Add habits to start logging your daily reps.
                  </p>
                ) : (
                  habitsOrdered.map((habit) => {
                    const existing = logsForSelectedDate.find(
                      (log) => log.habitId === habit.id,
                    );
                    return (
                      <div
                        key={`${habit.id}-${selectedDate}`}
                        className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold text-white">{habit.name}</h3>
                            <p className="text-xs text-slate-500">
                              Log minutes practiced today{" "}
                              {habit.targetMinutes ? `(target ${habit.targetMinutes} min)` : ""}
                            </p>
                          </div>
                          <input
                            key={`${habit.id}-${selectedDate}-${existing?.minutes ?? "empty"}`}
                            type="number"
                            min={0}
                            defaultValue={existing?.minutes ?? ""}
                            onBlur={(event) => handleUpdateLog(habit.id, event.target.value)}
                            className="w-32 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Gratitude Pulse</h2>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                    {gratitudePrompt.text}
                  </p>
                </div>
                <button
                  onClick={handleSaveGratitude}
                  className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  Save Reflection
                </button>
              </div>
              <textarea
                value={gratitudeDraft}
                onChange={(event) => setGratitudeDraft(event.target.value)}
                placeholder="Capture a moment, a person, or a habit that created gratitude today..."
                rows={5}
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-relaxed text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {summaryData.map((summary) => (
            <div
              key={summary.label}
              className="rounded-3xl bg-slate-900/60 p-6 ring-1 ring-slate-800"
            >
              <h3 className="text-lg font-semibold text-white">{summary.label}</h3>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                {summary.dateLabel}
              </p>
              <dl className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <dt>Total minutes logged</dt>
                  <dd className="text-base font-semibold text-emerald-400">
                    {summary.totalMinutes}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Average minutes per habit</dt>
                  <dd>{summary.averageMinutesPerHabit}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Active days</dt>
                  <dd>{summary.activeDays}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">
                    {summary.topHabit ? "Top habit" : "Add logs for highlights"}
                  </dt>
                  {summary.topHabit && (
                    <dd className="mt-1 font-semibold text-white">
                      {summary.topHabit.name} - {summary.topHabit.minutes} min
                    </dd>
                  )}
                </div>
              </dl>
              <p className="mt-4 text-xs text-slate-400">{summary.suggestedFocus}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Timeline Archive</h2>
              <p className="text-sm text-slate-400">
                Review your habit reps and gratitude reflections across time.
              </p>
            </div>
          </div>

          {historyGroups.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              Once you start logging, your daily history will appear here.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {historyGroups.map((group) => (
                <div
                  key={group.date}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">
                      {parseDate(group.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </h3>
                    <span className="text-xs uppercase tracking-[0.4em] text-slate-500">
                      {group.habits.length} habits logged
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    {group.habits.map((log) => {
                      const habit = state.habits.find((item) => item.id === log.habitId);
                      return (
                        <div
                          key={`${log.habitId}-${log.date}`}
                          className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-white">{habit?.name ?? "Habit"}</p>
                            <p className="text-xs text-slate-500">
                              Priority {habit?.importance ?? "-"}
                            </p>
                          </div>
                          <div className="text-sm font-semibold text-emerald-400">
                            {log.minutes} min
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {group.gratitude && (
                    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.4em] text-amber-300">
                        Gratitude Reflection
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-amber-100">
                        {group.gratitude.response}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {state.premium && premiumInsights && (
          <section className="rounded-3xl bg-gradient-to-br from-amber-400 to-rose-500 p-[1px]">
            <div className="h-full w-full rounded-[calc(1.5rem-1px)] bg-slate-950 p-6">
              <h2 className="text-xl font-semibold text-white">AI Performance Debrief</h2>
              <p className="mt-2 text-sm text-slate-200">{premiumInsights}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
