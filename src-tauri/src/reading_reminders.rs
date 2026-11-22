use chrono::{
    DateTime, Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime, SecondsFormat, Utc,
    Weekday,
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    io::Write,
    path::Path,
    process::{Command, Output, Stdio},
};
use tauri::{Manager, State};

use crate::database::DatabaseState;

#[cfg(any(target_os = "linux", target_os = "macos"))]
use std::path::PathBuf;

#[cfg(target_os = "macos")]
const NAMESPACE: &str = "com.ahmed.shelve";

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
use notify_rust::Notification;

const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NOTIFICATION_RETRY_INTERVAL: Duration = Duration::minutes(5);
const NOTIFICATION_SOUND: &[u8] = include_bytes!("../../public/ping.mp3");

#[tauri::command]
pub fn reading_reminders_supported() -> bool {
    cfg!(any(
        target_os = "linux",
        target_os = "macos",
        target_os = "windows"
    ))
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPlanReminder {
    id: String,
    title: String,
    start_date: String,
    end_date: String,
    time: String,
    days_of_week: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPlanNotification {
    pub id: String,
    pub plan_id: String,
    pub title: String,
    pub created_at: String,
    pub last_notified_at: String,
    pub acknowledged_at: Option<String>,
}

#[tauri::command]
pub fn get_reading_plan_notifications(
    state: State<'_, DatabaseState>,
) -> Result<Vec<ReadingPlanNotification>, String> {
    let connection = state
        .0
        .lock()
        .map_err(|error| format!("Could not access the local database: {error}"))?;
    let mut statement = connection
        .prepare(
            "SELECT id, plan_id, title, created_at, last_notified_at, acknowledged_at
             FROM reading_plan_notifications
             WHERE acknowledged_at IS NULL
                OR id IN (
                    SELECT id FROM reading_plan_notifications
                    WHERE acknowledged_at IS NOT NULL
                    ORDER BY created_at DESC LIMIT 100
                )
             ORDER BY created_at DESC",
        )
        .map_err(|error| format!("Could not read reading notifications: {error}"))?;
    statement
        .query_map([], |row| {
            Ok(ReadingPlanNotification {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                last_notified_at: row.get(4)?,
                acknowledged_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("Could not read reading notifications: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read reading notifications: {error}"))
}

#[tauri::command]
pub fn acknowledge_reading_plan_notification(
    state: State<'_, DatabaseState>,
    notification_id: String,
) -> Result<(), String> {
    validate_notification_id(&notification_id)?;
    let mut connection = state
        .0
        .lock()
        .map_err(|error| format!("Could not access the local database: {error}"))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not acknowledge the reading reminder: {error}"))?;
    let plan_id = transaction
        .query_row(
            "SELECT plan_id FROM reading_plan_notifications WHERE id = ?1",
            [&notification_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not find the reading notification: {error}"))?
        .ok_or_else(|| "This reading notification no longer exists.".to_owned())?;
    transaction
        .execute(
            "UPDATE reading_plan_notifications SET acknowledged_at = ?1
             WHERE id = ?2 AND acknowledged_at IS NULL",
            params![utc_timestamp(), notification_id],
        )
        .map_err(|error| format!("Could not acknowledge the reading reminder: {error}"))?;
    let should_remove_job = clear_disabled_reminder_if_idle(&transaction, &plan_id)?;
    transaction
        .commit()
        .map_err(|error| format!("Could not finish acknowledging the reminder: {error}"))?;
    drop(connection);
    if should_remove_job {
        remove_os_job(&plan_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_reading_plan_notification(
    state: State<'_, DatabaseState>,
    notification_id: String,
) -> Result<(), String> {
    validate_notification_id(&notification_id)?;
    let mut connection = state
        .0
        .lock()
        .map_err(|error| format!("Could not access the local database: {error}"))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not delete the reading notification: {error}"))?;
    let plan_id = transaction
        .query_row(
            "SELECT plan_id FROM reading_plan_notifications WHERE id = ?1",
            [&notification_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not find the reading notification: {error}"))?;
    transaction
        .execute(
            "DELETE FROM reading_plan_notifications WHERE id = ?1",
            [&notification_id],
        )
        .map_err(|error| format!("Could not delete the reading notification: {error}"))?;
    let should_remove_job = match plan_id.as_deref() {
        Some(plan_id) => clear_disabled_reminder_if_idle(&transaction, plan_id)?,
        None => false,
    };
    transaction
        .commit()
        .map_err(|error| format!("Could not finish deleting the reading notification: {error}"))?;
    drop(connection);
    if should_remove_job {
        if let Some(plan_id) = plan_id {
            remove_os_job(&plan_id)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn clear_reading_plan_notifications(state: State<'_, DatabaseState>) -> Result<(), String> {
    let mut connection = state
        .0
        .lock()
        .map_err(|error| format!("Could not access the local database: {error}"))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not clear reading notifications: {error}"))?;
    let disabled_plan_ids = {
        let mut statement = transaction
            .prepare("SELECT plan_id FROM reading_plan_reminders WHERE is_enabled = 0")
            .map_err(|error| format!("Could not read inactive reading reminders: {error}"))?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Could not read inactive reading reminders: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Could not read inactive reading reminders: {error}"))?
    };
    transaction
        .execute("DELETE FROM reading_plan_notifications", [])
        .map_err(|error| format!("Could not clear reading notifications: {error}"))?;
    transaction
        .execute(
            "DELETE FROM reading_plan_reminders WHERE is_enabled = 0",
            [],
        )
        .map_err(|error| format!("Could not clear inactive reading reminders: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("Could not finish clearing reading notifications: {error}"))?;
    drop(connection);
    for plan_id in disabled_plan_ids {
        remove_os_job(&plan_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn sync_reading_plan_reminders(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    reminders: Vec<ReadingPlanReminder>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate Shelve's data directory: {error}"))?;
    let database_path = app_data_dir.join("shelve.db");
    let executable = env::current_exe()
        .map_err(|error| format!("Could not locate the Shelve executable: {error}"))?;

    let mut desired = Vec::with_capacity(reminders.len());
    let mut ids = HashSet::with_capacity(reminders.len());
    for reminder in reminders {
        let reminder = validate_reminder(reminder)?;
        if !ids.insert(reminder.id.clone()) {
            return Err(
                "A reading plan was included more than once in the reminder schedule.".to_owned(),
            );
        }
        desired.push(reminder);
    }

    let mut connection = state
        .0
        .lock()
        .map_err(|error| format!("Could not access the local database: {error}"))?;
    let existing_ids = {
        let mut statement = connection
            .prepare("SELECT plan_id FROM reading_plan_reminders")
            .map_err(|error| format!("Could not read existing reading reminders: {error}"))?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Could not read existing reading reminders: {error}"))?
            .collect::<Result<HashSet<_>, _>>()
            .map_err(|error| format!("Could not read existing reading reminders: {error}"))?
    };
    let pending_ids = {
        let mut statement = connection
            .prepare(
                "SELECT DISTINCT plan_id FROM reading_plan_notifications
                 WHERE acknowledged_at IS NULL",
            )
            .map_err(|error| format!("Could not read pending reading notifications: {error}"))?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Could not read pending reading notifications: {error}"))?
            .collect::<Result<HashSet<_>, _>>()
            .map_err(|error| format!("Could not read pending reading notifications: {error}"))?
    };

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not update reading reminders: {error}"))?;
    for reminder in &desired {
        let days = serde_json::to_string(&reminder.days_of_week)
            .map_err(|error| format!("Could not encode reading reminder days: {error}"))?;
        transaction
            .execute(
                "INSERT INTO reading_plan_reminders
                    (plan_id, title, start_date, end_date, time, days_of_week)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(plan_id) DO UPDATE SET
                    title = excluded.title,
                    start_date = excluded.start_date,
                    end_date = excluded.end_date,
                    time = excluded.time,
                    days_of_week = excluded.days_of_week,
                    is_enabled = 1",
                params![
                    reminder.id,
                    reminder.title,
                    reminder.start_date,
                    reminder.end_date,
                    reminder.time,
                    days
                ],
            )
            .map_err(|error| format!("Could not save reading reminder: {error}"))?;
    }
    for id in existing_ids.difference(&ids) {
        if pending_ids.contains(id) {
            transaction
                .execute(
                    "UPDATE reading_plan_reminders SET is_enabled = 0 WHERE plan_id = ?1",
                    [id],
                )
                .map_err(|error| {
                    format!("Could not preserve a pending reading reminder: {error}")
                })?;
        } else {
            transaction
                .execute(
                    "DELETE FROM reading_plan_reminders WHERE plan_id = ?1",
                    [id],
                )
                .map_err(|error| {
                    format!("Could not remove an outdated reading reminder: {error}")
                })?;
        }
    }
    transaction
        .commit()
        .map_err(|error| format!("Could not finish updating reading reminders: {error}"))?;
    drop(connection);

    for id in existing_ids.difference(&ids) {
        if !pending_ids.contains(id) {
            remove_os_job(id)?;
        }
    }
    for reminder in &desired {
        register_os_job(reminder, &executable, &database_path).map_err(|error| {
            format!(
                "Could not schedule a reminder for \"{}\": {error}",
                reminder.title
            )
        })?;
    }
    Ok(())
}

pub fn run_cli() -> Option<Result<(), String>> {
    let mut args = env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--reading-reminder")) {
        return None;
    }
    let Some(database_path) = args.next() else {
        return Some(Err(
            "The reading reminder is missing its database path.".to_owned()
        ));
    };
    let Some(plan_id) = args.next() else {
        return Some(Err(
            "The reading reminder is missing its plan identifier.".to_owned()
        ));
    };
    if args.next().is_some() {
        return Some(Err(
            "The reading reminder received unexpected arguments.".to_owned()
        ));
    }
    Some(deliver_reminder(
        Path::new(&database_path),
        plan_id.to_string_lossy().as_ref(),
    ))
}

fn deliver_reminder(database_path: &Path, plan_id: &str) -> Result<(), String> {
    if !valid_id(plan_id) {
        return Err("The reading reminder has an invalid plan identifier.".to_owned());
    }
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("Could not open the local reminder database: {error}"))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not access the local reminder database: {error}"))?;
    let reminder = transaction
        .query_row(
            "SELECT title, start_date, end_date, time, days_of_week, last_notified_date, is_enabled
             FROM reading_plan_reminders WHERE plan_id = ?1",
            [plan_id],
            |row| {
                Ok(StoredReminder {
                    title: row.get(0)?,
                    start_date: row.get(1)?,
                    end_date: row.get(2)?,
                    time: row.get(3)?,
                    days_of_week: row.get(4)?,
                    last_notified_date: row.get(5)?,
                    is_enabled: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("Could not load the reading reminder: {error}"))?;

    let Some(reminder) = reminder else {
        transaction
            .commit()
            .map_err(|error| format!("Could not finish reading reminder cleanup: {error}"))?;
        remove_os_job(plan_id)?;
        return Ok(());
    };

    let pending = transaction
        .query_row(
            "SELECT id, title, last_notified_at FROM reading_plan_notifications
             WHERE plan_id = ?1 AND acknowledged_at IS NULL",
            [plan_id],
            |row| {
                Ok(PendingNotification {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    last_notified_at: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("Could not load the pending reading notification: {error}"))?;

    if let Some(pending) = pending {
        let now = Utc::now();
        if retry_interval_elapsed(&pending.last_notified_at, now)? {
            show_os_notification(&pending.title)?;
            transaction
                .execute(
                    "UPDATE reading_plan_notifications SET last_notified_at = ?1 WHERE id = ?2",
                    params![now.to_rfc3339_opts(SecondsFormat::Millis, true), pending.id],
                )
                .map_err(|error| format!("Could not update the reading notification: {error}"))?;
            transaction.commit().map_err(|error| {
                format!("Could not finish repeating the reading reminder: {error}")
            })?;
            drop(connection);
            if let Err(error) = play_notification_sound(database_path) {
                eprintln!("Reading reminder sound failed: {error}");
            }
        } else {
            transaction.commit().map_err(|error| {
                format!("Could not finish checking the reading reminder: {error}")
            })?;
        }
        return Ok(());
    }

    if !reminder.is_enabled {
        transaction
            .execute(
                "DELETE FROM reading_plan_reminders WHERE plan_id = ?1",
                [plan_id],
            )
            .map_err(|error| format!("Could not remove the inactive reading reminder: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("Could not finish reading reminder cleanup: {error}"))?;
        drop(connection);
        remove_os_job(plan_id)?;
        return Ok(());
    }

    let now = Local::now().naive_local();
    let end_date = parse_date(&reminder.end_date, "finish-by date")?;
    if now.date() > end_date {
        transaction
            .execute(
                "DELETE FROM reading_plan_reminders WHERE plan_id = ?1",
                [plan_id],
            )
            .map_err(|error| format!("Could not expire the reading reminder: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("Could not finish reading reminder cleanup: {error}"))?;
        drop(connection);
        remove_os_job(plan_id)?;
        return Ok(());
    }

    let days_of_week: Vec<String> = serde_json::from_str(&reminder.days_of_week)
        .map_err(|error| format!("The saved reading reminder days are invalid: {error}"))?;
    let schedule = ReadingPlanReminder {
        id: plan_id.to_owned(),
        title: reminder.title,
        start_date: reminder.start_date,
        end_date: reminder.end_date,
        time: reminder.time,
        days_of_week,
    };
    let due = is_due(&schedule, reminder.last_notified_date.as_deref(), now)?;
    if due {
        let timestamp = utc_timestamp();
        let notification_id = format!("{plan_id}-{}", Utc::now().timestamp_millis());
        transaction
            .execute(
                "INSERT INTO reading_plan_notifications
                    (id, plan_id, title, created_at, last_notified_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![notification_id, plan_id, schedule.title, timestamp],
            )
            .map_err(|error| format!("Could not save the reading notification: {error}"))?;
        transaction
            .execute(
                "UPDATE reading_plan_reminders SET last_notified_date = ?1 WHERE plan_id = ?2",
                params![now.date().format("%Y-%m-%d").to_string(), plan_id],
            )
            .map_err(|error| format!("Could not record the delivered reading reminder: {error}"))?;
        show_os_notification(&schedule.title)?;
        transaction.commit().map_err(|error| {
            format!("Could not finish delivering the reading reminder: {error}")
        })?;
        drop(connection);
        if let Err(error) = play_notification_sound(database_path) {
            eprintln!("Reading reminder sound failed: {error}");
        }
        return Ok(());
    }
    transaction
        .commit()
        .map_err(|error| format!("Could not finish delivering the reading reminder: {error}"))?;
    Ok(())
}

struct PendingNotification {
    id: String,
    title: String,
    last_notified_at: String,
}

struct StoredReminder {
    title: String,
    start_date: String,
    end_date: String,
    time: String,
    days_of_week: String,
    last_notified_date: Option<String>,
    is_enabled: bool,
}

fn retry_interval_elapsed(value: &str, now: DateTime<Utc>) -> Result<bool, String> {
    let last_notified_at = DateTime::parse_from_rfc3339(value)
        .map_err(|error| format!("The saved notification time is invalid: {error}"))?
        .with_timezone(&Utc);
    Ok(now.signed_duration_since(last_notified_at) >= NOTIFICATION_RETRY_INTERVAL)
}

fn utc_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn validate_notification_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 120
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("A reading notification has an invalid identifier.".to_owned());
    }
    Ok(())
}

fn clear_disabled_reminder_if_idle(
    transaction: &rusqlite::Transaction<'_>,
    plan_id: &str,
) -> Result<bool, String> {
    let is_enabled = transaction
        .query_row(
            "SELECT is_enabled FROM reading_plan_reminders WHERE plan_id = ?1",
            [plan_id],
            |row| row.get::<_, bool>(0),
        )
        .optional()
        .map_err(|error| format!("Could not inspect the reading reminder: {error}"))?;
    if is_enabled != Some(false) {
        return Ok(false);
    }
    let has_pending = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM reading_plan_notifications
             WHERE plan_id = ?1 AND acknowledged_at IS NULL)",
            [plan_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("Could not inspect pending reading notifications: {error}"))?;
    if has_pending {
        return Ok(false);
    }
    transaction
        .execute(
            "DELETE FROM reading_plan_reminders WHERE plan_id = ?1 AND is_enabled = 0",
            [plan_id],
        )
        .map_err(|error| format!("Could not remove the inactive reading reminder: {error}"))?;
    Ok(true)
}

fn show_os_notification(title: &str) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    {
        let body = format!(
            "It is time to read \"{title}\". Open Shelve and mark it received to stop reminders."
        );
        let mut notification = Notification::new();
        notification
            .summary("Shelve reading reminder")
            .body(&body)
            .show()
            .map_err(|error| format!("Could not show the reading reminder: {error}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = title;
        Err("Closed-app reading reminders are not supported on this platform.".to_owned())
    }
}

fn play_notification_sound(database_path: &Path) -> Result<(), String> {
    let sound_path = database_path
        .parent()
        .ok_or_else(|| "Could not locate the notification sound directory.".to_owned())?
        .join("ping.mp3");
    if !sound_path.exists() {
        write_private_file(&sound_path, NOTIFICATION_SOUND)?;
    }

    #[cfg(target_os = "linux")]
    {
        let mut playback_error = None;
        for player in ["ffplay", "mpv", "paplay"] {
            let mut command = Command::new(player);
            match player {
                "ffplay" => {
                    command.args(["-nodisp", "-autoexit", "-loglevel", "error"]);
                }
                "mpv" => {
                    command.args(["--no-video", "--really-quiet", "--"]);
                }
                _ => {}
            }
            command
                .arg(&sound_path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            match run_audio_process(&mut command) {
                Ok(status) if status.success() => return Ok(()),
                Ok(status) => {
                    playback_error = Some(format!(
                        "{player} could not play the reminder sound (exit status {status})."
                    ))
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => {
                    playback_error = Some(format!(
                        "Could not start {player} to play the reminder sound: {error}"
                    ))
                }
            }
        }
        Err(playback_error.unwrap_or_else(|| {
            "No supported MP3 player (ffplay, mpv, or paplay) is installed.".to_owned()
        }))
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("afplay");
        command
            .arg(&sound_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let status = run_audio_process(&mut command).map_err(|error| {
            format!("Could not start afplay to play the reminder sound: {error}")
        })?;
        if status.success() {
            Ok(())
        } else {
            Err(format!(
                "afplay could not play the reminder sound (exit status {status})."
            ))
        }
    }
    #[cfg(target_os = "windows")]
    {
        let script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([Uri]::new($env:SHELVE_PING_PATH)); $player.Play(); Start-Sleep -Milliseconds 4000";
        let mut command = Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("SHELVE_PING_PATH", &sound_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let status = run_audio_process(&mut command).map_err(|error| {
            format!("Could not start Windows Media Player to play the reminder sound: {error}")
        })?;
        if status.success() {
            Ok(())
        } else {
            Err(format!(
                "Windows Media Player could not play the reminder sound (exit status {status})."
            ))
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = sound_path;
        Err("Custom reminder sounds are not supported on this platform.".to_owned())
    }
}

fn run_audio_process(command: &mut Command) -> Result<std::process::ExitStatus, std::io::Error> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.status()
}

fn validate_reminder(mut reminder: ReadingPlanReminder) -> Result<ReadingPlanReminder, String> {
    if !valid_id(&reminder.id) {
        return Err("A reading plan has an invalid reminder identifier.".to_owned());
    }
    let title = reminder.title.trim();
    if title.is_empty() || title.len() > 200 || title.chars().any(char::is_control) {
        return Err("A reading plan has an invalid reminder title.".to_owned());
    }
    reminder.title = title.to_owned();

    let start_date = parse_date(&reminder.start_date, "start date")?;
    let end_date = parse_date(&reminder.end_date, "finish-by date")?;
    if end_date < start_date {
        return Err("A reading reminder's finish-by date is before its start date.".to_owned());
    }
    NaiveTime::parse_from_str(&reminder.time, "%H:%M")
        .map_err(|_| "A reading reminder has an invalid time.".to_owned())?;

    let selected: HashSet<String> = reminder.days_of_week.iter().cloned().collect();
    if selected.is_empty()
        || selected.len() != reminder.days_of_week.len()
        || selected.iter().any(|day| !WEEKDAYS.contains(&day.as_str()))
    {
        return Err("A reading reminder must have unique, valid weekdays.".to_owned());
    }
    reminder.days_of_week = WEEKDAYS
        .iter()
        .filter(|day| selected.contains(**day))
        .map(|day| (*day).to_owned())
        .collect();
    Ok(reminder)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn parse_date(value: &str, label: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| format!("The reading reminder has an invalid {label}."))
}

fn is_due(
    reminder: &ReadingPlanReminder,
    last_notified_date: Option<&str>,
    now: NaiveDateTime,
) -> Result<bool, String> {
    let start_date = parse_date(&reminder.start_date, "start date")?;
    let end_date = parse_date(&reminder.end_date, "finish-by date")?;
    let time = NaiveTime::parse_from_str(&reminder.time, "%H:%M")
        .map_err(|_| "The reading reminder has an invalid time.".to_owned())?;
    let today = now.date();
    if today < start_date || today > end_date || now.time() < time {
        return Ok(false);
    }
    let weekday = match today.weekday() {
        Weekday::Mon => "Mon",
        Weekday::Tue => "Tue",
        Weekday::Wed => "Wed",
        Weekday::Thu => "Thu",
        Weekday::Fri => "Fri",
        Weekday::Sat => "Sat",
        Weekday::Sun => "Sun",
    };
    let today_key = today.format("%Y-%m-%d").to_string();
    Ok(reminder.days_of_week.iter().any(|day| day == weekday)
        && last_notified_date != Some(today_key.as_str()))
}

fn job_id(plan_id: &str) -> String {
    format!("reading-plan-{plan_id}")
}

fn command_output(command: &mut Command, action: &str) -> Result<(), String> {
    let output = output_of(command).map_err(|error| format!("{action}: {error}"))?;
    if !output.status.success() {
        let mut details = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if details.is_empty() {
            details = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        }
        if details.is_empty() {
            details = output.status.to_string();
        }
        return Err(format!("{action}: {details}"));
    }
    Ok(())
}

fn output_of(command: &mut Command) -> Result<Output, std::io::Error> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.output()
}

#[cfg(target_os = "linux")]
fn register_os_job(
    reminder: &ReadingPlanReminder,
    executable: &Path,
    database_path: &Path,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let config_dir = if let Some(path) = env::var_os("XDG_CONFIG_HOME") {
        PathBuf::from(path)
    } else {
        let home = env::var_os("HOME")
            .ok_or_else(|| "Could not locate the user's configuration directory.".to_owned())?;
        PathBuf::from(home).join(".config")
    };
    let unit_dir = config_dir.join("systemd/user");
    fs::create_dir_all(&unit_dir)
        .map_err(|error| format!("Could not create the systemd user unit directory: {error}"))?;
    fs::set_permissions(&unit_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Could not secure the systemd user unit directory: {error}"))?;

    let id = job_id(&reminder.id);
    let service_path = unit_dir.join(format!("{id}.service"));
    let timer_path = unit_dir.join(format!("{id}.timer"));
    let command = [
        executable.to_string_lossy().into_owned(),
        "--reading-reminder".to_owned(),
        database_path.to_string_lossy().into_owned(),
        reminder.id.clone(),
    ]
    .iter()
    .map(|argument| systemd_quote(argument))
    .collect::<Result<Vec<_>, _>>()?
    .join(" ");
    let service = format!(
        "[Unit]\nDescription=Shelve reading plan reminder\n\n[Service]\nType=oneshot\nExecStart={command}\n"
    );
    write_private_file(&service_path, service.as_bytes())?;

    let days = reminder.days_of_week.join(",");
    let timer = format!(
        "[Unit]\nDescription=Shelve reading plan reminder\n\n[Timer]\nOnCalendar={days} *-*-* {}:00\nOnCalendar=*-*-* *:0/5\nPersistent=true\nUnit={id}.service\n\n[Install]\nWantedBy=timers.target\n",
        reminder.time
    );
    write_private_file(&timer_path, timer.as_bytes())?;

    command_output(
        Command::new("systemctl").args(["--user", "daemon-reload"]),
        "Could not reload the systemd user manager",
    )?;
    command_output(
        Command::new("systemctl").args(["--user", "enable", "--now", &format!("{id}.timer")]),
        "Could not enable the systemd reading reminder",
    )?;
    command_output(
        Command::new("systemctl").args(["--user", "restart", &format!("{id}.timer")]),
        "Could not update the systemd reading reminder",
    )
}

#[cfg(target_os = "linux")]
pub fn remove_os_job(plan_id: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    if !valid_id(plan_id) {
        return Err("A reading reminder has an invalid plan identifier.".to_owned());
    }
    let config_dir = if let Some(path) = env::var_os("XDG_CONFIG_HOME") {
        PathBuf::from(path)
    } else {
        let home = env::var_os("HOME")
            .ok_or_else(|| "Could not locate the user's configuration directory.".to_owned())?;
        PathBuf::from(home).join(".config")
    };
    let unit_dir = config_dir.join("systemd/user");
    let id = job_id(plan_id);
    let service_path = unit_dir.join(format!("{id}.service"));
    let timer_path = unit_dir.join(format!("{id}.timer"));
    if !service_path.exists() && !timer_path.exists() {
        return Ok(());
    }
    command_output(
        Command::new("systemctl").args(["--user", "disable", "--now", &format!("{id}.timer")]),
        "Could not disable the systemd reading reminder",
    )?;
    remove_file_if_exists(&timer_path)?;
    remove_file_if_exists(&service_path)?;
    fs::set_permissions(&unit_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Could not secure the systemd user unit directory: {error}"))?;
    command_output(
        Command::new("systemctl").args(["--user", "daemon-reload"]),
        "Could not reload the systemd user manager",
    )
}

#[cfg(target_os = "linux")]
fn systemd_quote(value: &str) -> Result<String, String> {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for character in value.chars() {
        match character {
            '\n' | '\r' | '\0' => {
                return Err("A systemd command argument contains an invalid character.".to_owned());
            }
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '%' => escaped.push_str("%%"),
            '$' => escaped.push_str("$$"),
            _ => escaped.push(character),
        }
    }
    escaped.push('"');
    Ok(escaped)
}

#[cfg(target_os = "macos")]
fn register_os_job(
    reminder: &ReadingPlanReminder,
    executable: &Path,
    database_path: &Path,
) -> Result<(), String> {
    let home = env::var_os("HOME")
        .ok_or_else(|| "Could not locate the user's home directory.".to_owned())?;
    let agent_dir = PathBuf::from(home).join("Library/LaunchAgents");
    fs::create_dir_all(&agent_dir)
        .map_err(|error| format!("Could not create the launch agent directory: {error}"))?;
    let label = format!("{NAMESPACE}.{}", job_id(&reminder.id));
    let path = agent_dir.join(format!("{label}.plist"));
    unload_launch_agent(&label)?;
    let arguments = [
        executable.to_string_lossy().into_owned(),
        "--reading-reminder".to_owned(),
        database_path.to_string_lossy().into_owned(),
        reminder.id.clone(),
    ];
    let weekdays = reminder
        .days_of_week
        .iter()
        .map(|day| {
            let index = WEEKDAYS
                .iter()
                .position(|candidate| *candidate == day.as_str())
                .ok_or_else(|| "A reading reminder contains an unknown weekday.".to_owned())?;
            Ok(format!(
                "<dict><key>Weekday</key><integer>{}</integer><key>Hour</key><integer>{}</integer><key>Minute</key><integer>{}</integer></dict>",
                (index + 1) % 7,
                reminder.time[..2].parse::<u32>().map_err(|error| error.to_string())?,
                reminder.time[3..].parse::<u32>().map_err(|error| error.to_string())?,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?
        .join("");
    let program_arguments = arguments
        .iter()
        .map(|argument| format!("<string>{}</string>", xml_escape(argument)))
        .collect::<String>();
    let contents = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>Label</key><string>{}</string><key>ProgramArguments</key><array>{program_arguments}</array><key>StartCalendarInterval</key><array>{weekdays}</array><key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><false/><key>ProcessType</key><string>Background</string></dict></plist>\n",
        xml_escape(&label)
    );
    write_private_file(&path, contents.as_bytes())?;
    let domain = launch_domain()?;
    command_output(
        Command::new("launchctl").args(["bootstrap", &domain, path.to_string_lossy().as_ref()]),
        "Could not register the Shelve launch agent",
    )
}

#[cfg(target_os = "macos")]
pub fn remove_os_job(plan_id: &str) -> Result<(), String> {
    if !valid_id(plan_id) {
        return Err("A reading reminder has an invalid plan identifier.".to_owned());
    }
    let home = env::var_os("HOME")
        .ok_or_else(|| "Could not locate the user's home directory.".to_owned())?;
    let label = format!("{NAMESPACE}.{}", job_id(plan_id));
    let path = PathBuf::from(home)
        .join("Library/LaunchAgents")
        .join(format!("{label}.plist"));
    unload_launch_agent(&label)?;
    remove_file_if_exists(&path)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn unload_launch_agent(label: &str) -> Result<(), String> {
    let domain = launch_domain()?;
    let target = format!("{domain}/{label}");
    let loaded = Command::new("launchctl")
        .args(["print", &target])
        .output()
        .map_err(|error| format!("Could not inspect the Shelve launch agent: {error}"))?
        .status
        .success();
    if loaded {
        command_output(
            Command::new("launchctl").args(["bootout", &target]),
            "Could not remove the previous Shelve launch agent",
        )?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_domain() -> Result<String, String> {
    let output = Command::new("id")
        .arg("-u")
        .output()
        .map_err(|error| format!("Could not determine the current user for launchd: {error}"))?;
    if !output.status.success() {
        return Err("Could not determine the current user for launchd.".to_owned());
    }
    let uid = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if uid.is_empty() || !uid.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("The current user identifier for launchd is invalid.".to_owned());
    }
    Ok(format!("gui/{uid}"))
}

#[cfg(target_os = "macos")]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(target_os = "windows")]
fn register_os_job(
    reminder: &ReadingPlanReminder,
    executable: &Path,
    database_path: &Path,
) -> Result<(), String> {
    let task_name = format!("Shelve-{}", job_id(&reminder.id));
    let start_date = windows_short_date(&reminder.start_date)?;
    let end_date = windows_short_date(&reminder.end_date)?;
    let days = reminder
        .days_of_week
        .iter()
        .map(|day| day.to_uppercase())
        .collect::<Vec<_>>()
        .join(",");
    let executable = executable.to_string_lossy();
    let database_path = database_path.to_string_lossy();
    let command_line = format!(
        "{} --reading-reminder {} {}",
        windows_quote(executable.as_ref()),
        windows_quote(database_path.as_ref()),
        windows_quote(&reminder.id)
    );
    command_output(
        Command::new("schtasks.exe").args([
            "/Create",
            "/TN",
            &task_name,
            "/TR",
            &command_line,
            "/SC",
            "WEEKLY",
            "/D",
            &days,
            "/ST",
            &reminder.time,
            "/SD",
            &start_date,
            "/ED",
            &end_date,
            "/F",
            "/IT",
        ]),
        "Could not register the Windows reading reminder",
    )?;
    let retry_start = Local::now() + Duration::minutes(5);
    let retry_date = windows_short_date(&retry_start.date_naive().format("%Y-%m-%d").to_string())?;
    let retry_time = retry_start.format("%H:%M").to_string();
    command_output(
        Command::new("schtasks.exe").args([
            "/Create",
            "/TN",
            &format!("{task_name}-retry"),
            "/TR",
            &command_line,
            "/SC",
            "MINUTE",
            "/MO",
            "5",
            "/ST",
            &retry_time,
            "/SD",
            &retry_date,
            "/F",
            "/IT",
        ]),
        "Could not register the Windows reading reminder retry",
    )
}

#[cfg(target_os = "windows")]
pub fn remove_os_job(plan_id: &str) -> Result<(), String> {
    if !valid_id(plan_id) {
        return Err("A reading reminder has an invalid plan identifier.".to_owned());
    }
    let task_name = format!("Shelve-{}", job_id(plan_id));
    let primary = remove_windows_task(&task_name);
    let retry = remove_windows_task(&format!("{task_name}-retry"));
    match (primary, retry) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(primary), Ok(())) => Err(primary),
        (Ok(()), Err(retry)) => Err(retry),
        (Err(primary), Err(retry)) => Err(format!("{primary}; {retry}")),
    }
}

#[cfg(target_os = "windows")]
fn remove_windows_task(task_name: &str) -> Result<(), String> {
    let script = format!(
        "$ErrorActionPreference='Stop'; Get-Command -Name Get-ScheduledTask -ErrorAction Stop | Out-Null; $task = Get-ScheduledTask -TaskName '{task_name}' -ErrorAction SilentlyContinue; if ($null -ne $task) {{ Unregister-ScheduledTask -TaskName '{task_name}' -Confirm:$false -ErrorAction Stop }}"
    );
    let output = output_of(Command::new("powershell.exe").args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        &script,
    ]))
    .map_err(|error| format!("Could not remove the Windows reading reminder: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not remove the Windows reading reminder: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_short_date(value: &str) -> Result<String, String> {
    let script = format!(
        "([datetime]::ParseExact('{}','yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)).ToString((Get-Culture).DateTimeFormat.ShortDatePattern)",
        value
    );
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    let output = output_of(&mut command)
        .map_err(|error| format!("Could not format the Windows reminder date: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not format the Windows reminder date: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let date = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if date.is_empty() {
        return Err("Windows returned an empty reminder date.".to_owned());
    }
    Ok(date)
}

#[cfg(target_os = "windows")]
fn windows_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn register_os_job(
    _reminder: &ReadingPlanReminder,
    _executable: &Path,
    _database_path: &Path,
) -> Result<(), String> {
    Err("Closed-app reading reminders are not supported on this operating system.".to_owned())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub fn remove_os_job(plan_id: &str) -> Result<(), String> {
    if !valid_id(plan_id) {
        return Err("A reading reminder has an invalid plan identifier.".to_owned());
    }
    Err("Closed-app reading reminders are not supported on this operating system.".to_owned())
}

fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension(format!("tmp-{}", std::process::id()));
    let mut file = fs::File::create(&temp_path)
        .map_err(|error| format!("Could not write the reading reminder schedule: {error}"))?;
    file.write_all(contents)
        .map_err(|error| format!("Could not write the reading reminder schedule: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not save the reading reminder schedule: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("Could not install the reading reminder schedule: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Could not secure the reading reminder schedule: {error}"))?;
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove a reading reminder schedule: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder() -> ReadingPlanReminder {
        ReadingPlanReminder {
            id: "plan-1".to_owned(),
            title: "Evening reading".to_owned(),
            start_date: "2025-11-17".to_owned(),
            end_date: "2025-11-23".to_owned(),
            time: "21:00".to_owned(),
            days_of_week: vec!["Mon".to_owned(), "Wed".to_owned(), "Sun".to_owned()],
        }
    }

    #[test]
    fn reminder_is_due_only_on_selected_days_inside_its_date_range() {
        let schedule = reminder();
        let monday = NaiveDateTime::parse_from_str("2025-11-17 21:00", "%Y-%m-%d %H:%M").unwrap();
        let tuesday = NaiveDateTime::parse_from_str("2025-11-18 21:00", "%Y-%m-%d %H:%M").unwrap();
        let before_time =
            NaiveDateTime::parse_from_str("2025-11-17 20:59", "%Y-%m-%d %H:%M").unwrap();
        let before_start =
            NaiveDateTime::parse_from_str("2025-11-16 21:00", "%Y-%m-%d %H:%M").unwrap();
        let after_time =
            NaiveDateTime::parse_from_str("2025-11-19 21:10", "%Y-%m-%d %H:%M").unwrap();
        let after_end =
            NaiveDateTime::parse_from_str("2025-11-24 21:00", "%Y-%m-%d %H:%M").unwrap();

        assert!(is_due(&schedule, None, monday).unwrap());
        assert!(!is_due(&schedule, None, tuesday).unwrap());
        assert!(!is_due(&schedule, None, before_time).unwrap());
        assert!(!is_due(&schedule, None, before_start).unwrap());
        assert!(is_due(&schedule, None, after_time).unwrap());
        assert!(!is_due(&schedule, None, after_end).unwrap());
        assert!(!is_due(&schedule, Some("2025-11-19"), after_time).unwrap());
    }

    #[test]
    fn reminder_validation_normalizes_weekday_order_and_rejects_bad_days() {
        let mut schedule = reminder();
        schedule.days_of_week = vec!["Sun".to_owned(), "Mon".to_owned()];
        let normalized = validate_reminder(schedule).unwrap();
        assert_eq!(normalized.days_of_week, vec!["Mon", "Sun"]);

        let mut invalid = reminder();
        invalid.days_of_week = vec!["Funday".to_owned()];
        assert!(validate_reminder(invalid).is_err());
    }

    #[test]
    fn pending_reminders_repeat_after_five_minutes() {
        let last_notified_at = "2025-11-17T21:00:00Z";
        let before_retry = DateTime::parse_from_rfc3339("2025-11-17T21:04:59Z")
            .unwrap()
            .with_timezone(&Utc);
        let retry_due = DateTime::parse_from_rfc3339("2025-11-17T21:05:00Z")
            .unwrap()
            .with_timezone(&Utc);

        assert!(!retry_interval_elapsed(last_notified_at, before_retry).unwrap());
        assert!(retry_interval_elapsed(last_notified_at, retry_due).unwrap());
        assert!(retry_interval_elapsed("invalid", retry_due).is_err());
    }

    #[test]
    fn inactive_reminder_is_kept_until_its_notification_is_acknowledged() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialize(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO reading_plan_reminders
                    (plan_id, title, start_date, end_date, time, days_of_week, is_enabled)
                 VALUES ('plan-1', 'Evening reading', '2025-11-17', '2025-11-23', '21:00', '[\"Mon\"]', 0)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO reading_plan_notifications
                    (id, plan_id, title, created_at, last_notified_at)
                 VALUES ('plan-1-1763413200000', 'plan-1', 'Evening reading',
                    '2025-11-17T21:00:00Z', '2025-11-17T21:00:00Z')",
                [],
            )
            .unwrap();

        let transaction = connection.transaction().unwrap();
        assert!(!clear_disabled_reminder_if_idle(&transaction, "plan-1").unwrap());
        transaction
            .execute(
                "UPDATE reading_plan_notifications SET acknowledged_at = ?1 WHERE plan_id = ?2",
                params![utc_timestamp(), "plan-1"],
            )
            .unwrap();
        assert!(clear_disabled_reminder_if_idle(&transaction, "plan-1").unwrap());
        transaction.commit().unwrap();

        let reminder_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM reading_plan_reminders", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(reminder_count, 0);
    }
}
