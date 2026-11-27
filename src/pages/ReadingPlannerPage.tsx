import { useCallback, useEffect, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { arSA } from "date-fns/locale/ar-SA";
import { de } from "date-fns/locale/de";
import { enUS } from "date-fns/locale/en-US";
import { fr } from "date-fns/locale/fr";
import {
  Bell,
  BellOff,
  BookOpen,
  CalendarDays,
  Clock3,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { loadRecords, saveRecords, type StoredRecord } from "../lib/storage";
import type { Book } from "../types";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { useConfirmationDialog } from "../components/confirmation-dialog";
import { Calendar, CalendarDayButton } from "../components/ui/calendar";
import { SectionTitle } from "./shared";

interface ReadingPlan extends StoredRecord {
  title: string;
  startDate: string;
  endDate: string;
  time: string;
  daysOfWeek: string[];
  bookIds: string[];
  reminderEnabled: boolean;
  isActive?: boolean;
}

interface PlanForm {
  title: string;
  startDate: string;
  endDate: string;
  time: string;
  daysOfWeek: string[];
  bookIds: string[];
  reminderEnabled: boolean;
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function testReminderTime(): string {
  const timestamp = Math.ceil((Date.now() + 3 * 60_000) / 60_000) * 60_000;
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function createEmptyForm(): PlanForm {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return {
    title: "Evening reading",
    startDate: localDateInputValue(start),
    endDate: localDateInputValue(end),
    time: "21:00",
    daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    bookIds: [],
    reminderEnabled: false,
  };
}

function isReadingPlan(value: unknown): value is ReadingPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const plan = value as Partial<ReadingPlan>;
  return (
    typeof plan.id === "string" &&
    typeof plan.title === "string" &&
    typeof plan.startDate === "string" &&
    typeof plan.endDate === "string" &&
    typeof plan.time === "string" &&
    Array.isArray(plan.daysOfWeek) &&
    plan.daysOfWeek.every((day) => typeof day === "string") &&
    Array.isArray(plan.bookIds) &&
    plan.bookIds.every((bookId) => typeof bookId === "string") &&
    typeof plan.reminderEnabled === "boolean" &&
    (plan.isActive === undefined || typeof plan.isActive === "boolean")
  );
}

function formatPlanDate(value: string, locale: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function finishedBook(book: Book | undefined): boolean {
  return Boolean(book && (book.status === "archived" || (book.totalPages > 0 && book.currentPage >= book.totalPages)));
}

function completedPlan(plan: ReadingPlan, books: Book[]): boolean {
  const associatedBooks = plan.bookIds.map((id) => books.find((book) => book.id === id));
  return associatedBooks.length > 0 && associatedBooks.every((book) => Boolean(book && finishedBook(book)));
}

function isScheduledOnDate(plan: ReadingPlan, value: string): boolean {
  if ((plan.isActive ?? true) === false || plan.bookIds.length === 0 || value < plan.startDate || value > plan.endDate) return false;
  const date = new Date(`${value}T12:00:00`);
  const day = weekDays[(date.getDay() + 6) % 7];
  return plan.daysOfWeek.includes(day);
}

export default function ReadingPlannerPage({ books }: { books: Book[] }) {
  const { language, locale, t } = useLanguage();
  const calendarLocale = language === "ar" ? arSA : language === "fr" ? fr : language === "de" ? de : enUS;
  const { confirm, dialog: confirmationDialog } = useConfirmationDialog();
  const [plans, setPlans] = useState<ReadingPlan[]>([]);
  const [form, setForm] = useState<PlanForm>(() => ({ ...createEmptyForm(), title: t("Evening reading") }));
  const [dateRange, setDateRange] = useState<DateRange>();
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remindersSupported, setRemindersSupported] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => localDateInputValue(new Date()));

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<boolean>("reading_reminders_supported")
      .then((supported) => {
        if (active) setRemindersSupported(supported);
      })
      .catch((supportError: unknown) => {
        console.error("Could not check reading reminder support:", supportError);
      });
    return () => {
      active = false;
    };
  }, []);

  const syncReminderSchedules = useCallback(async (nextPlans: ReadingPlan[]) => {
    if (!isTauri() || !remindersSupported) return;
    const today = localDateInputValue(new Date());
    const reminders = nextPlans
      .filter((plan) => {
        return plan.reminderEnabled
          && (plan.isActive ?? true)
          && plan.bookIds.length > 0
          && !completedPlan(plan, books)
          && plan.endDate >= today;
      })
      .map(({ id, title, startDate, endDate, time, daysOfWeek }) => ({
        id,
        title,
        startDate,
        endDate,
        time,
        daysOfWeek,
      }));
    await invoke("sync_reading_plan_reminders", { reminders });
  }, [books, remindersSupported]);

  useEffect(() => {
    let active = true;
    const refresh = () => loadRecords<ReadingPlan>("readingPlans")
      .then((records) => {
        if (!records.every(isReadingPlan)) throw new Error("Saved reading plans have an invalid format.");
        if (active) setPlans(records);
        return syncReminderSchedules(records);
      })
      .catch((loadError: unknown) => {
        console.error("Could not load reading plans:", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your reading plans.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    void refresh();
    window.addEventListener("shelve:cloud-refresh", refresh);
    return () => {
      active = false;
      window.removeEventListener("shelve:cloud-refresh", refresh);
    };
  }, [syncReminderSchedules]);

  const openForm = () => {
    setError("");
    setNotice("");
    setDateRangeOpen(false);
    const newForm = { ...createEmptyForm(), title: t("Evening reading") };
    setForm(newForm);
    setDateRange({
      from: dateFromInputValue(newForm.startDate),
      to: dateFromInputValue(newForm.endDate),
    });
    setIsFormOpen(true);
  };

  const prepareReminderTest = () => {
    const start = localDateInputValue(new Date());
    const firstUnfinishedBook = books.find((book) => !finishedBook(book));
    const end = form.endDate < start
      ? (() => {
        const date = dateFromInputValue(start);
        date.setDate(date.getDate() + 30);
        return localDateInputValue(date);
      })()
      : form.endDate;
    setForm((current) => ({
      ...current,
      startDate: start,
      endDate: end,
      time: testReminderTime(),
      daysOfWeek: weekDays,
      bookIds: current.bookIds.some((id) => {
        const book = books.find((item) => item.id === id);
        return Boolean(book && !finishedBook(book));
      })
        ? current.bookIds
        : firstUnfinishedBook ? [firstUnfinishedBook.id] : books[0] ? [books[0].id] : [],
      reminderEnabled: true,
    }));
    setDateRange({
      from: dateFromInputValue(start),
      to: dateFromInputValue(end),
    });
    setError("");
  };

  const toggleBook = (bookId: string) => {
    setForm((current) => ({
      ...current,
      bookIds: current.bookIds.includes(bookId)
        ? current.bookIds.filter((id) => id !== bookId)
        : [...current.bookIds, bookId],
    }));
  };

  const toggleDay = (day: string) => {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((selectedDay) => selectedDay !== day)
        : [...current.daysOfWeek, day],
    }));
  };

  const savePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (form.bookIds.length === 0) {
      setError(t("Choose at least one book for this plan."));
      return;
    }
    if (!form.title.trim()) {
      setError(t("Enter a name for this reading plan."));
      return;
    }
    if (form.daysOfWeek.length === 0) {
      setError(t("Choose at least one day for your reading sessions."));
      return;
    }
    if (form.endDate < form.startDate) {
      setError(t("The finish-by date must be on or after the start date."));
      return;
    }

    setIsSaving(true);
    const plan: ReadingPlan = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      time: form.time,
      daysOfWeek: form.daysOfWeek,
      bookIds: form.bookIds,
      reminderEnabled: form.reminderEnabled,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    try {
      const nextPlans = [plan, ...plans];
      await saveRecords("readingPlans", nextPlans);
      setPlans(nextPlans);
      setIsFormOpen(false);
      setDateRangeOpen(false);
      setNotice(t("Your reading plan is saved."));
      try {
        await syncReminderSchedules(nextPlans);
      } catch (scheduleError) {
        console.error("Could not schedule reading plan reminders:", scheduleError);
        setError(`${t("Your plan was saved, but its reminder could not be scheduled.")} ${scheduleError instanceof Error ? scheduleError.message : ""}`.trim());
      }
    } catch (saveError) {
      console.error("Could not save reading plan:", saveError);
      setError(t(saveError instanceof Error ? saveError.message : "Could not save your reading plan."));
    } finally {
      setIsSaving(false);
    }
  };

  const updatePlan = async (plan: ReadingPlan, action: "pause" | "resume" | "delete" | "toggle-reminder") => {
    if (action === "delete" && !await confirm({
      title: `${t("Delete reading plan")}: ${plan.title}`,
      message: t("This action cannot be undone."),
      confirmLabel: t("Delete"),
    })) return;
    setError("");
    setNotice("");
    const nextPlans = action === "delete"
      ? plans.filter((item) => item.id !== plan.id)
      : plans.map((item) => item.id === plan.id
        ? {
          ...item,
          ...(action === "toggle-reminder"
            ? { reminderEnabled: !item.reminderEnabled }
            : { isActive: action === "resume" }),
          updatedAt: new Date().toISOString(),
        }
        : item);
    try {
      await saveRecords("readingPlans", nextPlans);
      setPlans(nextPlans);
      try {
        await syncReminderSchedules(nextPlans);
        setNotice(t(action === "delete"
          ? "Reading plan deleted."
          : action === "pause"
            ? "Reading plan paused."
            : action === "resume"
              ? "Reading plan resumed."
              : plan.reminderEnabled ? "Reminder disabled." : "Reminder enabled."));
      } catch (scheduleError) {
        console.error("Could not update reading plan reminders:", scheduleError);
        const message = action === "toggle-reminder"
          ? "Your reminder setting was saved, but could not be applied."
          : "Your plan was updated, but its reminder could not be scheduled.";
        setError(`${t(message)} ${scheduleError instanceof Error ? scheduleError.message : ""}`.trim());
      }
    } catch (updateError) {
      console.error(`Could not ${action} reading plan:`, updateError);
      setError(t(updateError instanceof Error ? updateError.message : action === "delete"
        ? "Could not delete this reading plan."
        : action === "pause"
          ? "Could not pause this reading plan."
          : action === "resume"
            ? "Could not resume this reading plan."
            : "Could not update this reading plan reminder."));
    }
  };

  const completedPlanIds = new Set(plans.filter((plan) => completedPlan(plan, books)).map((plan) => plan.id));
  const selectedPlans = plans.filter((plan) => isScheduledOnDate(plan, selectedDate) && !completedPlanIds.has(plan.id));

  return (
    <div className="p-4  ">
      {confirmationDialog}
      <SectionTitle eyebrow={t("MAKE TIME FOR A GOOD STORY")} title={t("Reading planner")} detail={t("Build a routine and track books toward your finish-by date.")} />
      <section className="w-full " aria-labelledby="scheduled-reading-title">
        <div className="scheduled-reading-heading">
          <div>
            <h2 id="scheduled-reading-title"><CalendarDays size={16} /> {t("Scheduled reading")}</h2>
            <p>{t("Create a routine and track the books you plan to finish.")}</p>
          </div>
          {!isFormOpen && <button className="button button-primary" onClick={openForm}><Plus size={14} /> {t("New plan")}</button>}
        </div>

        {!isFormOpen && (error
          ? <ErrorAlert className="planner-alert planner-alert-error" message={error} />
          : notice && <p className="planner-alert planner-alert-success" role="status">{t(notice)}</p>)}

        {isFormOpen && createPortal(
          <div className="dialog-backdrop scheduled-plan-backdrop" onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsFormOpen(false);
              setDateRangeOpen(false);
            }
          }}>
          <section className="dialog scheduled-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduled-plan-dialog-title">
          <div className="scheduled-plan-dialog-heading">
            <div>
              <h2 id="scheduled-plan-dialog-title">{t("New reading plan")}</h2>
              <p>{t("Create a routine and track the books you plan to finish.")}</p>
            </div>
            <button type="button" className="scheduled-plan-dialog-close" aria-label={t("Cancel")} onClick={() => {
              setIsFormOpen(false);
              setDateRangeOpen(false);
            }}><X size={15} /></button>
          </div>
          {error && <ErrorAlert className="planner-alert planner-alert-error" message={error} />}
          <form className="scheduled-plan-form" onSubmit={(event) => void savePlan(event)}>
            <div className="scheduled-plan-fields">
              <label>{t("Plan name")}<input required maxLength={80} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <div className="scheduled-time-field">
                <label>{t("Reading time")}<input required type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} /></label>
                <p>{t("The plan shows 24-hour time (13:45 = 1:45 PM).")}</p>
                <button type="button" className="button button-outline scheduled-test-reminder" disabled={!remindersSupported || books.length === 0} onClick={prepareReminderTest}>
                  <Bell size={13} />{t("Set up a 3-minute reminder test")}
                </button>
              </div>
              <div className="scheduled-date-range-field">
                <span className="scheduled-date-range-label">{t("Plan dates")}</span>
                <BasePopover.Root open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
                  <BasePopover.Trigger type="button" className="button button-outline scheduled-date-range-trigger" aria-label={`${t("Plan dates")}: ${formatPlanDate(form.startDate, locale)} – ${formatPlanDate(form.endDate, locale)}`}>
                    <CalendarDays size={14} />
                    <span>{formatPlanDate(form.startDate, locale)} – {formatPlanDate(form.endDate, locale)}</span>
                  </BasePopover.Trigger>
                  {dateRangeOpen && <BasePopover.Portal>
                    <BasePopover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
                      <BasePopover.Popup className="scheduled-date-range-popover" role="dialog" aria-label={t("Plan dates")}>
                        <Calendar
                          mode="range"
                          selected={dateRange}
                          defaultMonth={dateRange?.from}
                          locale={calendarLocale}
                          onSelect={(range) => {
                            setDateRange(range);
                            if (!range?.from) return;
                            const startDate = localDateInputValue(range.from);
                            const endDate = localDateInputValue(range.to ?? range.from);
                            setForm((current) => ({ ...current, startDate, endDate }));
                            if (range.to) setDateRangeOpen(false);
                          }}
                        />
                        <p>{t("Choose a start date, then an end date.")}</p>
                      </BasePopover.Popup>
                    </BasePopover.Positioner>
                  </BasePopover.Portal>}
                </BasePopover.Root>
              </div>
            </div>

            <fieldset className="scheduled-plan-fieldset">
              <legend>{t("Repeat on")}</legend>
              <div className="scheduled-weekday-presets">
                <button type="button" className={form.daysOfWeek.length === 7 ? "selected" : ""} aria-pressed={form.daysOfWeek.length === 7} onClick={() => setForm((current) => ({ ...current, daysOfWeek: weekDays }))}>{t("Every day")}</button>
                <button type="button" className={form.daysOfWeek.length === 5 && weekDays.slice(0, 5).every((day) => form.daysOfWeek.includes(day)) ? "selected" : ""} aria-pressed={form.daysOfWeek.length === 5 && weekDays.slice(0, 5).every((day) => form.daysOfWeek.includes(day))} onClick={() => setForm((current) => ({ ...current, daysOfWeek: weekDays.slice(0, 5) }))}>{t("Weekdays")}</button>
              </div>
              <div className="scheduled-weekdays">
                {weekDays.map((day) => (
                  <label key={day} className={form.daysOfWeek.includes(day) ? "selected" : ""}>
                    <input type="checkbox" checked={form.daysOfWeek.includes(day)} onChange={() => toggleDay(day)} />
                    {t(day)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="scheduled-plan-fieldset">
              <legend>{t("Books to finish by")} {formatPlanDate(form.endDate, locale)}</legend>
              {books.length === 0
                ? <p className="scheduled-empty">{t("Add a book to your library before creating a plan.")}</p>
                : <div className="scheduled-book-choices">
                  {books.map((book) => (
                    <label key={book.id} className="scheduled-book-choice">
                      <input type="checkbox" checked={form.bookIds.includes(book.id)} onChange={() => toggleBook(book.id)} />
                      <span><strong>{book.title}</strong><small>{book.author}</small></span>
                    </label>
                  ))}
                </div>}
            </fieldset>

            <label className={`scheduled-reminder${!remindersSupported ? " scheduled-reminder-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={form.reminderEnabled}
                disabled={!remindersSupported}
                onChange={(event) => setForm((current) => ({ ...current, reminderEnabled: event.target.checked }))}
              />
              <span><Bell size={14} /> {t("Remind me at this time")}</span>
            </label>
            {!remindersSupported && <p className="scheduled-reminder-note">{t("Reminders require the Shelve desktop app.")}</p>}

            <div className="scheduled-form-actions">
              <button type="button" className="button button-outline" onClick={() => {
                setIsFormOpen(false);
                setDateRangeOpen(false);
              }}>{t("Cancel")}</button>
              <button type="submit" className="button button-primary" disabled={isSaving || books.length === 0}>{isSaving ? t("Saving…") : t("Save reading plan")}</button>
            </div>
          </form>
          </section>
          </div>,
          document.body,
        )}
   <section className="scheduled-plans-section mb-10" aria-labelledby="scheduled-plans-title">
          <h3 id="scheduled-plans-title">{t("Your reading plans")}</h3>
          {isLoading ? <p className="scheduled-empty" role="status">{t("Loading reading plans…")}</p> : plans.length === 0
          ? !isFormOpen && !error && <div className="scheduled-empty scheduled-empty-dashed"><BookOpen size={20} /><p>{t("No reading plans yet. Set a time and choose what you’d like to finish.")}</p></div>
          : <div className="scheduled-plan-grid">
            {plans.map((plan) => {
              const associatedBooks = plan.bookIds.map((id) => books.find((book) => book.id === id));
              const completed = associatedBooks.filter(finishedBook).length;
              const total = plan.bookIds.length;
              const percent = total ? Math.round((completed / total) * 100) : 0;
              const trackedBooks = associatedBooks.filter((book): book is Book => Boolean(book?.totalPages));
              const totalPages = trackedBooks.reduce((sum, book) => sum + book.totalPages, 0);
              const pagesRead = trackedBooks.reduce((sum, book) => sum + Math.min(Math.max(0, book.currentPage), book.totalPages), 0);
              const isComplete = total > 0 && completed === total;
              const isPastDeadline = plan.endDate < localDateInputValue(new Date());
              const active = plan.isActive ?? true;
              return (
                <article className="scheduled-plan-card" key={plan.id}>
                  <div className="scheduled-plan-card-heading">
                    <div className="scheduled-plan-card-title">
                      <h3>{plan.title}</h3>
                      <p><span><Clock3 size={12} />{plan.time}</span><span>{plan.daysOfWeek.map(t).join(", ")}</span>{plan.reminderEnabled && active && !isComplete && !isPastDeadline && <span><Bell size={12} />{t("Reminder on")}</span>}</p>
                    </div>
                    <span className={`scheduled-plan-status ${isComplete || active ? "active" : ""}`}>{isComplete ? t("Completed") : active ? t("Active") : t("Paused")}</span>
                  </div>
                  <p className={`scheduled-plan-dates ${isPastDeadline && completed < total ? "past-deadline" : ""}`}>{formatPlanDate(plan.startDate, locale)} – {t("finish by")} {formatPlanDate(plan.endDate, locale)}{isPastDeadline && completed < total ? ` · ${t("deadline passed")}` : ""}</p>
                  <div className="scheduled-progress-heading"><span>{completed.toLocaleString(locale)} {t("of")} {total.toLocaleString(locale)} {t("books finished")}</span><span>{percent.toLocaleString(locale)}%</span></div>
                  <div className="scheduled-progress-track"><span style={{ width: `${percent}%` }} /></div>
                  {totalPages > 0 && <p className="scheduled-progress-pages">{pagesRead.toLocaleString(locale)} {t("of")} {totalPages.toLocaleString(locale)} {t("pages read")}</p>}
                  <ul className="scheduled-progress-books">
                    {associatedBooks.map((book, index) => {
                      const complete = finishedBook(book);
                      const bookProgress = book?.totalPages
                        ? Math.min(100, Math.max(0, Math.round((book.currentPage / book.totalPages) * 100)))
                        : complete ? 100 : 0;
                      return <li key={`${plan.bookIds[index]}-${index}`}>
                        <div className="scheduled-progress-book-heading">
                          <span className={complete ? "finished" : ""}>{book?.title ?? t("Book no longer in library")}</span>
                          <span>{complete ? t("Finished") : book?.totalPages ? `${book.currentPage.toLocaleString(locale)} / ${book.totalPages.toLocaleString(locale)} ${t("pages")}` : t("Progress unavailable")}</span>
                        </div>
                        {book?.totalPages ? <div className="scheduled-progress-book-track"><span style={{ width: `${bookProgress}%` }} /></div> : null}
                      </li>;
                    })}
                  </ul>
                  <div className="scheduled-plan-actions">
                    {!isComplete && <button className="button button-outline" onClick={() => void updatePlan(plan, active ? "pause" : "resume")}>{active ? <Pause size={12} /> : <Play size={12} />}{active ? t("Pause") : t("Resume")}</button>}
                    {remindersSupported && !isComplete && !isPastDeadline && total > 0 && <button className="button button-outline" aria-label={`${t(plan.reminderEnabled ? "Disable reminder" : "Enable reminder")} ${plan.title}`} onClick={() => void updatePlan(plan, "toggle-reminder")}>{plan.reminderEnabled ? <BellOff size={12} /> : <Bell size={12} />}{t(plan.reminderEnabled ? "Disable reminder" : "Enable reminder")}</button>}
                    <button className="button button-outline scheduled-delete" aria-label={`${t("Delete")} ${plan.title}`} onClick={() => void updatePlan(plan, "delete")}><Trash2 size={12} /> {t("Delete")}</button>
                  </div>
                </article>
              );
            })}
          </div>}
        </section>
          <h3 id="scheduled-calendar-title " className = "text-center  text-2xl mb-10">{t("Reading schedule")}</h3>
        <section className="scheduled-calendar  " aria-labelledby="scheduled-calendar-title">
        
      <div className= "flex gap-3 flex-row">
    <Calendar
            mode="single"
            className="scheduled-calendar-widget"
            month={calendarMonth}
            selected={dateFromInputValue(selectedDate)}
            locale={calendarLocale}
            onMonthChange={setCalendarMonth}
            onSelect={(date) => {
              if (date) setSelectedDate(localDateInputValue(date));
            }}
            components={{
              DayButton: (props) => {
                const value = localDateInputValue(props.day.date);
                const dayPlans = plans.filter((plan) => isScheduledOnDate(plan, value) && !completedPlanIds.has(plan.id));
                const dateLabel = props.day.date.toLocaleDateString(locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                });
                return (
                  <CalendarDayButton
                    locale={calendarLocale}
                    {...props}
                    aria-label={`${dateLabel}${dayPlans.length ? `, ${dayPlans.length} ${t("planned sessions")}` : ""}`}
                  >
                    {props.children}
                    {dayPlans.length > 0 && <span className="scheduled-calendar-dot" aria-hidden="true" />}
                  </CalendarDayButton>
                );
              },
            }}
          />
          


      </div>
      



          <div className="scheduled-calendar-day-plans">
            <h4>{formatPlanDate(selectedDate, locale)}</h4>
            {selectedPlans.length === 0
              ? <p>{t("No reading scheduled for this day.")}</p>
              : <ul>{selectedPlans.map((plan) => (
                <li key={plan.id}><span>{plan.title}</span><span><Clock3 size={12} />{plan.time}</span></li>
              ))}</ul>}
          </div>
        </section>

     
      </section>
      <p className="planner-notice">{t("Plans are saved locally and can be included in cloud sync.")}</p>
    </div>
  );
}
