use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::sync::Mutex;
use tauri::State;

const LOCAL_USER_ID: &str = "local";
const WRITING_ID: &str = "00000000-0000-4000-8000-000000000001";

pub struct DatabaseState(pub Mutex<Connection>);

const RECORD_TABLES: &[&str] = &[
    "books",
    "notes",
    "writings",
    "reading_plans",
    "reading_sessions",
    "writing_sessions",
];

pub fn initialize(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS app_settings (
             key TEXT PRIMARY KEY NOT NULL,
             value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS schema_migrations (
             version INTEGER PRIMARY KEY NOT NULL,
             applied_at TEXT NOT NULL
         );
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
         CREATE TABLE IF NOT EXISTS sync_conflicts (
             id TEXT PRIMARY KEY NOT NULL,
             collection TEXT NOT NULL,
             record_id TEXT NOT NULL,
             local_data TEXT,
             remote_data TEXT,
             created_at TEXT NOT NULL,
             resolved_at TEXT
         );
         CREATE TABLE IF NOT EXISTS sync_queue (
             id TEXT PRIMARY KEY NOT NULL,
             collection TEXT NOT NULL,
             record_id TEXT NOT NULL,
             record_data TEXT NOT NULL,
             record_sync_status TEXT NOT NULL DEFAULT 'pending',
             asset_sync_status TEXT NOT NULL DEFAULT 'synced',
             status TEXT NOT NULL DEFAULT 'pending',
             attempt_count INTEGER NOT NULL DEFAULT 0,
             next_retry_at TEXT NOT NULL,
             last_error TEXT,
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             UNIQUE(collection, record_id)
         );
         CREATE INDEX IF NOT EXISTS sync_queue_ready_idx ON sync_queue(status, next_retry_at);
         CREATE TABLE IF NOT EXISTS local_files (
             file_key TEXT PRIMARY KEY NOT NULL,
             category TEXT NOT NULL,
             created_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS reading_plan_reminders (
             plan_id TEXT PRIMARY KEY NOT NULL,
             title TEXT NOT NULL,
             start_date TEXT NOT NULL,
             end_date TEXT NOT NULL,
             time TEXT NOT NULL,
             days_of_week TEXT NOT NULL,
             last_notified_date TEXT,
             is_enabled INTEGER NOT NULL DEFAULT 1
         );
         CREATE TABLE IF NOT EXISTS reading_plan_notifications (
             id TEXT PRIMARY KEY NOT NULL,
             plan_id TEXT NOT NULL,
             title TEXT NOT NULL,
             created_at TEXT NOT NULL,
             last_notified_at TEXT NOT NULL,
             acknowledged_at TEXT
         );
         CREATE INDEX IF NOT EXISTS reading_plan_notifications_created_idx
             ON reading_plan_notifications(created_at DESC);
         CREATE INDEX IF NOT EXISTS reading_plan_notifications_plan_idx
             ON reading_plan_notifications(plan_id, acknowledged_at);
         CREATE UNIQUE INDEX IF NOT EXISTS reading_plan_notifications_pending_idx
             ON reading_plan_notifications(plan_id) WHERE acknowledged_at IS NULL;
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
         INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
    )?;

    ensure_column(
        connection,
        "reading_plan_reminders",
        "is_enabled",
        "INTEGER NOT NULL DEFAULT 1",
    )?;

    for table in RECORD_TABLES {
        let extra = if *table == "notes" {
            ", book_id TEXT NOT NULL DEFAULT ''"
        } else {
            ""
        };
        connection.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS {table} (
                 id TEXT PRIMARY KEY NOT NULL,
                 user_id TEXT NOT NULL DEFAULT 'local',
                 updated_at TEXT NOT NULL,
                 deleted_at TEXT,
                 data_json TEXT NOT NULL
                 {extra}
             );"
        ))?;
        ensure_column(
            connection,
            table,
            "user_id",
            "TEXT NOT NULL DEFAULT 'local'",
        )?;
        ensure_column(connection, table, "updated_at", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(connection, table, "deleted_at", "TEXT")?;
        ensure_column(connection, table, "data_json", "TEXT NOT NULL DEFAULT '{}'")?;
        if *table == "notes" {
            ensure_column(connection, table, "book_id", "TEXT NOT NULL DEFAULT ''")?;
        }
    }

    migrate_legacy_notes(connection)?;
    migrate_legacy_writing(connection)?;
    for table in RECORD_TABLES {
        normalize_records(connection, table)?;
    }
    remove_legacy_sample_books(connection)?;
    Ok(())
}

#[tauri::command]
pub fn db_mark_sync_assets_synced(state: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = lock_database(&state)?;
    connection
        .execute(
            "UPDATE sync_queue SET asset_sync_status='synced', updated_at=?1
         WHERE status IN ('pending', 'failed') AND asset_sync_status IN ('pending', 'failed')",
            [now_timestamp()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), rusqlite::Error> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    connection.execute_batch(&format!(
        "ALTER TABLE {table} ADD COLUMN {column} {definition}"
    ))
}

fn migrate_legacy_notes(connection: &Connection) -> Result<(), rusqlite::Error> {
    let has_legacy_table = {
        let mut statement = connection
            .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'book_notes'")?;
        statement.query_row([], |_| Ok(())).optional()?.is_some()
    };
    if has_legacy_table {
        connection.execute(
            "INSERT OR IGNORE INTO notes (id, user_id, book_id, updated_at, deleted_at, data_json)
             SELECT id, ?1, book_id, updated_at, NULL, data_json FROM book_notes",
            [LOCAL_USER_ID],
        )?;
    }
    Ok(())
}

fn migrate_legacy_writing(connection: &Connection) -> Result<(), rusqlite::Error> {
    let content = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'shelve-writing-v1'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(content) = content {
        let exists = connection
            .query_row(
                "SELECT 1 FROM writings WHERE id = ?1 AND user_id = ?2",
                params![WRITING_ID, LOCAL_USER_ID],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if exists {
            return Ok(());
        }
        let updated_at = now_timestamp();
        let record = json!({
            "id": WRITING_ID,
            "title": "Untitled note",
            "content": content,
            "updatedAt": updated_at
        });
        let serialized = serde_json::to_string(&record)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        connection.execute(
            "INSERT INTO writings (id, user_id, updated_at, deleted_at, data_json)
             VALUES (?1, ?2, ?3, NULL, ?4)",
            params![WRITING_ID, LOCAL_USER_ID, updated_at, serialized],
        )?;
    }
    Ok(())
}

fn normalize_records(connection: &Connection, table: &str) -> Result<(), rusqlite::Error> {
    let rows = {
        let mut statement = connection.prepare(&format!(
            "SELECT id, updated_at, deleted_at, data_json FROM {table} WHERE user_id = ?1"
        ))?;
        statement
            .query_map([LOCAL_USER_ID], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };

    for (id, stored_updated_at, stored_deleted_at, serialized) in rows {
        let mut record: Value = serde_json::from_str(&serialized)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let object = record.as_object_mut().ok_or_else(|| {
            rusqlite::Error::ToSqlConversionFailure("Local record must be a JSON object".into())
        })?;
        let updated_at = [
            Some(stored_updated_at.as_str()),
            object.get("updatedAt").and_then(Value::as_str),
        ]
        .into_iter()
        .flatten()
        .find(|value| chrono::DateTime::parse_from_rfc3339(value).is_ok())
        .map(str::to_owned)
        .unwrap_or_else(now_timestamp);
        let deleted_at = stored_deleted_at
            .or_else(|| {
                object
                    .get("deletedAt")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .filter(|value| !value.is_empty());
        object.insert("id".to_owned(), Value::String(id.clone()));
        object.insert("updatedAt".to_owned(), Value::String(updated_at.clone()));
        if let Some(deleted_at) = &deleted_at {
            object.insert("deletedAt".to_owned(), Value::String(deleted_at.clone()));
        } else {
            object.remove("deletedAt");
        }
        let data = serde_json::to_string(&record)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        connection.execute(
            &format!("UPDATE {table} SET updated_at = ?1, deleted_at = ?2, data_json = ?3 WHERE id = ?4 AND user_id = ?5"),
            params![updated_at, deleted_at, data, id, LOCAL_USER_ID],
        )?;
    }
    Ok(())
}

fn remove_legacy_sample_books(connection: &Connection) -> Result<(), rusqlite::Error> {
    let already_cleaned = connection
        .query_row(
            "SELECT 1 FROM app_settings WHERE key = 'legacy-sample-books-removed'",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if already_cleaned {
        return Ok(());
    }
    for id in [
        "white-nights",
        "1984",
        "meditations",
        "animal-farm",
        "and-then-there-were-none",
        "crime-and-punishment",
        "metamorphosis",
        "the-prince",
    ] {
        connection.execute("DELETE FROM books WHERE id = ?1", [id])?;
    }
    connection.execute(
        "INSERT INTO app_settings (key, value) VALUES ('legacy-sample-books-removed', ?1)",
        [now_timestamp()],
    )?;
    Ok(())
}

fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn is_valid_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
        && matches!(bytes[14].to_ascii_lowercase(), b'1'..=b'8')
        && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
}

fn lock_database<'a>(
    state: &'a State<'_, DatabaseState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .0
        .lock()
        .map_err(|error| format!("Could not lock the local database: {error}"))
}

fn json_timestamp(record: &Value) -> String {
    record
        .get("updatedAt")
        .and_then(Value::as_str)
        .filter(|value| chrono::DateTime::parse_from_rfc3339(value).is_ok())
        .map(str::to_owned)
        .unwrap_or_else(now_timestamp)
}

fn save_record(connection: &Connection, table: &str, record: &Value) -> Result<(), String> {
    save_record_impl(connection, table, record, true)
}

fn save_record_impl(
    connection: &Connection,
    table: &str,
    record: &Value,
    enqueue: bool,
) -> Result<(), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| is_valid_uuid(id))
        .ok_or_else(|| "A saved record must have a valid UUID id.".to_owned())?;
    let updated_at = json_timestamp(record);
    let deleted_at = record
        .get("deletedAt")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let book_id = if table == "notes" {
        record.get("bookId").and_then(Value::as_str).unwrap_or("")
    } else {
        ""
    };
    let mut normalized = record.clone();
    let object = normalized
        .as_object_mut()
        .ok_or_else(|| "A saved record must be a JSON object.".to_owned())?;
    object.insert("updatedAt".to_owned(), Value::String(updated_at.clone()));
    if let Some(deleted_at) = deleted_at {
        object.insert("deletedAt".to_owned(), Value::String(deleted_at.to_owned()));
    } else {
        object.remove("deletedAt");
    }
    let data = serde_json::to_string(&normalized).map_err(|error| error.to_string())?;
    if table == "notes" {
        connection
            .execute(
                "INSERT INTO notes (id, user_id, book_id, updated_at, deleted_at, data_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id,
                   book_id = excluded.book_id, updated_at = excluded.updated_at,
                   deleted_at = excluded.deleted_at, data_json = excluded.data_json",
                params![id, LOCAL_USER_ID, book_id, updated_at, deleted_at, data],
            )
            .map_err(|error| error.to_string())?;
    } else {
        connection
            .execute(
                &format!(
                    "INSERT INTO {table} (id, user_id, updated_at, deleted_at, data_json)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id,
                       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
                       data_json = excluded.data_json"
                ),
                params![id, LOCAL_USER_ID, updated_at, deleted_at, data],
            )
            .map_err(|error| error.to_string())?;
    }
    if enqueue {
        enqueue_sync_record(connection, table, id, &normalized)?;
    }
    Ok(())
}

fn enqueue_sync_record(
    connection: &Connection,
    table: &str,
    id: &str,
    record: &Value,
) -> Result<(), String> {
    let collection = match table {
        "books" => "books",
        "notes" => "notes",
        "writings" => "writings",
        "reading_plans" => "readingPlans",
        "reading_sessions" => "readingSessions",
        "writing_sessions" => "writingSessions",
        _ => return Err(format!("Unsupported sync collection: {table}")),
    };
    let has_assets = record.get("fileKey").and_then(Value::as_str).is_some()
        || record
            .get("coverImage")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("asset:"))
        || record
            .pointer("/coverDesign/imageKey")
            .and_then(Value::as_str)
            .is_some()
        || record
            .pointer("/coverDesign/appliedCoverKey")
            .and_then(Value::as_str)
            .is_some();
    let data = serde_json::to_string(record).map_err(|error| error.to_string())?;
    let now = now_timestamp();
    let asset_status = if has_assets { "pending" } else { "synced" };
    connection
        .execute(
            "INSERT INTO sync_queue (
             id, collection, record_id, record_data, record_sync_status, asset_sync_status,
             status, attempt_count, next_retry_at, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, 'pending', 0, ?6, ?6, ?6)
         ON CONFLICT(collection, record_id) DO UPDATE SET
             record_data = excluded.record_data,
             record_sync_status = 'pending',
             asset_sync_status = CASE
                 WHEN excluded.asset_sync_status = 'pending' THEN 'pending'
                 ELSE sync_queue.asset_sync_status
             END,
             status = CASE WHEN sync_queue.status = 'conflict' THEN 'conflict' ELSE 'pending' END,
             next_retry_at = excluded.next_retry_at,
             last_error = NULL,
             updated_at = excluded.updated_at",
            params![
                format!("{collection}:{id}"),
                collection,
                id,
                data,
                asset_status,
                now
            ],
        )
        .map_err(|error| format!("Could not queue local changes for sync: {error}"))?;
    Ok(())
}

fn get_records(
    connection: &Connection,
    table: &str,
    include_deleted: bool,
) -> Result<Vec<Value>, String> {
    let sql = if include_deleted {
        format!("SELECT data_json FROM {table} WHERE user_id = ?1 ORDER BY updated_at DESC")
    } else {
        format!(
            "SELECT data_json FROM {table} WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC"
        )
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([LOCAL_USER_ID], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        let serialized = row.map_err(|error| error.to_string())?;
        serde_json::from_str(&serialized)
            .map_err(|error| format!("Local record contains invalid JSON: {error}"))
    })
    .collect()
}

fn get_records_command(
    state: &State<'_, DatabaseState>,
    table: &str,
) -> Result<Vec<Value>, String> {
    let connection = lock_database(state)?;
    get_records(&connection, table, false)
}

fn save_record_command(
    state: &State<'_, DatabaseState>,
    table: &str,
    record: Value,
) -> Result<(), String> {
    let connection = lock_database(state)?;
    save_record(&connection, table, &record)
}

fn delete_record(
    connection: &Connection,
    table: &str,
    id: &str,
    updated_at: &str,
) -> Result<(), String> {
    let mut record = connection
        .query_row(
            &format!("SELECT data_json FROM {table} WHERE id = ?1 AND user_id = ?2"),
            params![id, LOCAL_USER_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .map(|serialized| serde_json::from_str::<Value>(&serialized))
        .transpose()
        .map_err(|error| error.to_string())?;
    if let Some(record) = record.as_mut() {
        let object = record
            .as_object_mut()
            .ok_or_else(|| "The local record is invalid.".to_owned())?;
        object.insert("deletedAt".to_owned(), Value::String(updated_at.to_owned()));
        object.insert("updatedAt".to_owned(), Value::String(updated_at.to_owned()));
        save_record(connection, table, record)?;
    }
    Ok(())
}

fn merge_record(connection: &Connection, table: &str, incoming: &Value) -> Result<(), String> {
    let id = incoming
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "An imported record must have an id.".to_owned())?;
    let incoming_time = json_timestamp(incoming);
    let existing = connection
        .query_row(
            &format!("SELECT updated_at FROM {table} WHERE id = ?1 AND user_id = ?2"),
            params![id, LOCAL_USER_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if existing.as_ref().is_some_and(|time| time >= &incoming_time) {
        return Ok(());
    }
    if table == "books" && existing.is_some() {
        let current = connection
            .query_row(
                "SELECT data_json FROM books WHERE id = ?1 AND user_id = ?2",
                params![id, LOCAL_USER_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if let Some(serialized) = current {
            let current: Value =
                serde_json::from_str(&serialized).map_err(|error| error.to_string())?;
            if incoming.get("updatedAt") != current.get("updatedAt") {
                let incoming_json =
                    serde_json::to_string(incoming).map_err(|error| error.to_string())?;
                let current_json =
                    serde_json::to_string(&current).map_err(|error| error.to_string())?;
                connection.execute(
                    "INSERT OR IGNORE INTO sync_conflicts(id, collection, record_id, local_data, remote_data, created_at)
                     VALUES (?1, 'books', ?2, ?3, ?4, ?5)",
                    params![format!("books:{id}"), id, incoming_json, current_json, now_timestamp()],
                ).map_err(|error| error.to_string())?;
                connection
                    .execute(
                        "UPDATE sync_queue SET status='conflict',record_sync_status='conflict'
                     WHERE collection='books' AND record_id=?1",
                        [id],
                    )
                    .map_err(|error| error.to_string())?;
                return Ok(());
            }
        }
    }
    save_record_impl(connection, table, incoming, false)
}

#[tauri::command]
pub fn db_get_books(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "books")
}

#[tauri::command]
pub fn db_save_book(state: State<'_, DatabaseState>, book: Value) -> Result<(), String> {
    save_record_command(&state, "books", book)
}

#[tauri::command]
pub fn db_update_book(state: State<'_, DatabaseState>, book: Value) -> Result<(), String> {
    save_record_command(&state, "books", book)
}

#[tauri::command]
pub fn db_delete_book(
    state: State<'_, DatabaseState>,
    book_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(&connection, "books", &book_id, &updated_at)?;
    for (table, record_field) in [("notes", "bookId"), ("reading_sessions", "bookId")] {
        let records = get_records(&connection, table, false)?;
        for record in records {
            if record.get(record_field).and_then(Value::as_str) == Some(&book_id) {
                let id = record.get("id").and_then(Value::as_str).unwrap_or_default();
                delete_record(&connection, table, id, &updated_at)?;
            }
        }
    }
    for mut plan in get_records(&connection, "reading_plans", false)? {
        let Some(object) = plan.as_object_mut() else {
            continue;
        };
        let Some(book_ids) = object.get_mut("bookIds").and_then(Value::as_array_mut) else {
            continue;
        };
        let old_len = book_ids.len();
        book_ids.retain(|id| id.as_str() != Some(&book_id));
        if book_ids.len() != old_len {
            object.insert("updatedAt".to_owned(), Value::String(updated_at.clone()));
            save_record(&connection, "reading_plans", &plan)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn db_update_progress(
    state: State<'_, DatabaseState>,
    book_id: String,
    current_page: u32,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    let serialized = connection
        .query_row(
            "SELECT data_json FROM books WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL",
            params![book_id, LOCAL_USER_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Book not found in the local database.".to_owned())?;
    let mut book: Value = serde_json::from_str(&serialized).map_err(|error| error.to_string())?;
    let object = book
        .as_object_mut()
        .ok_or_else(|| "The local book record is invalid.".to_owned())?;
    object.insert("currentPage".to_owned(), json!(current_page));
    object.insert("updatedAt".to_owned(), Value::String(updated_at));
    save_record(&connection, "books", &book)
}

#[tauri::command]
pub fn db_get_notes(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "notes")
}

#[tauri::command]
pub fn db_save_note(state: State<'_, DatabaseState>, note: Value) -> Result<(), String> {
    save_record_command(&state, "notes", note)
}

#[tauri::command]
pub fn db_delete_note(
    state: State<'_, DatabaseState>,
    note_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(&connection, "notes", &note_id, &updated_at)
}

#[tauri::command]
pub fn db_get_writings(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "writings")
}

#[tauri::command]
pub fn db_save_writing(state: State<'_, DatabaseState>, writing: Value) -> Result<(), String> {
    save_record_command(&state, "writings", writing)
}

#[tauri::command]
pub fn db_delete_writing(
    state: State<'_, DatabaseState>,
    writing_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(&connection, "writings", &writing_id, &updated_at)
}

#[tauri::command]
pub fn db_get_reading_plans(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "reading_plans")
}

#[tauri::command]
pub fn db_save_reading_plan(
    state: State<'_, DatabaseState>,
    reading_plan: Value,
) -> Result<(), String> {
    save_record_command(&state, "reading_plans", reading_plan)
}

#[tauri::command]
pub fn db_delete_reading_plan(
    state: State<'_, DatabaseState>,
    reading_plan_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(&connection, "reading_plans", &reading_plan_id, &updated_at)
}

#[tauri::command]
pub fn db_get_reading_sessions(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "reading_sessions")
}

#[tauri::command]
pub fn db_save_reading_session(
    state: State<'_, DatabaseState>,
    reading_session: Value,
) -> Result<(), String> {
    save_record_command(&state, "reading_sessions", reading_session)
}

#[tauri::command]
pub fn db_delete_reading_session(
    state: State<'_, DatabaseState>,
    reading_session_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(
        &connection,
        "reading_sessions",
        &reading_session_id,
        &updated_at,
    )
}

#[tauri::command]
pub fn db_get_writing_sessions(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    get_records_command(&state, "writing_sessions")
}

#[tauri::command]
pub fn db_save_writing_session(
    state: State<'_, DatabaseState>,
    writing_session: Value,
) -> Result<(), String> {
    save_record_command(&state, "writing_sessions", writing_session)
}

#[tauri::command]
pub fn db_delete_writing_session(
    state: State<'_, DatabaseState>,
    writing_session_id: String,
    updated_at: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    delete_record(
        &connection,
        "writing_sessions",
        &writing_session_id,
        &updated_at,
    )
}

#[tauri::command]
pub fn db_get_setting(
    state: State<'_, DatabaseState>,
    key: String,
) -> Result<Option<String>, String> {
    let connection = lock_database(&state)?;
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn db_save_setting(
    state: State<'_, DatabaseState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    connection
        .execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_register_local_file(
    state: State<'_, DatabaseState>,
    file_key: String,
    category: String,
) -> Result<(), String> {
    if !is_valid_uuid(&file_key) || !matches!(category.as_str(), "files" | "covers") {
        return Err("The local file reference is invalid.".to_owned());
    }
    let connection = lock_database(&state)?;
    connection
        .execute(
            "INSERT INTO local_files(file_key,category,created_at) VALUES(?1,?2,?3)
         ON CONFLICT(file_key) DO UPDATE SET category=excluded.category",
            params![file_key, category, now_timestamp()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_unregister_local_file(
    state: State<'_, DatabaseState>,
    file_key: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    connection
        .execute("DELETE FROM local_files WHERE file_key=?1", [file_key])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_clear_local_data(
    state: State<'_, DatabaseState>,
    clear_settings: bool,
) -> Result<(), String> {
    let mut connection = lock_database(&state)?;
    let reminder_ids = {
        let mut statement = connection
            .prepare("SELECT plan_id FROM reading_plan_reminders")
            .map_err(|error| {
                format!("Could not read reading reminders before clearing local data: {error}")
            })?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| {
                format!("Could not read reading reminders before clearing local data: {error}")
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| {
                format!("Could not read reading reminders before clearing local data: {error}")
            })?
    };
    for reminder_id in reminder_ids {
        crate::reading_reminders::remove_os_job(&reminder_id)?;
    }
    clear_local_data_impl(&mut connection, clear_settings)
}

fn clear_local_data_impl(connection: &mut Connection, clear_settings: bool) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for table in RECORD_TABLES {
        transaction
            .execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute("DELETE FROM sync_queue", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM sync_conflicts", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM local_files", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM reading_plan_reminders", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM reading_plan_notifications", [])
        .map_err(|error| error.to_string())?;
    if clear_settings {
        transaction
            .execute("DELETE FROM app_settings", [])
            .map_err(|error| error.to_string())?;
    } else {
        transaction
            .execute(
                "DELETE FROM app_settings WHERE key = 'cloud-sync-pending'",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn db_get_orphan_local_files(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    let connection = lock_database(&state)?;
    let mut referenced = std::collections::HashSet::new();
    for table in RECORD_TABLES {
        for record in get_records(&connection, table, true)? {
            collect_file_references(&record, &mut referenced);
        }
    }
    let mut statement = connection
        .prepare(
            "SELECT file_key, category FROM local_files
         WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut orphans = Vec::new();
    for row in rows {
        let (key, category) = row.map_err(|error| error.to_string())?;
        if !referenced.contains(&key) {
            orphans.push(json!({"key": key, "category": category}));
        }
    }
    Ok(orphans)
}

fn collect_file_references(value: &Value, result: &mut std::collections::HashSet<String>) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                if matches!(key.as_str(), "fileKey" | "imageKey" | "appliedCoverKey") {
                    if let Some(value) = value.as_str() {
                        result.insert(value.to_owned());
                    }
                }
                if key == "coverImage" {
                    if let Some(value) = value
                        .as_str()
                        .and_then(|value| value.strip_prefix("asset:"))
                    {
                        result.insert(value.to_owned());
                    }
                }
                collect_file_references(value, result);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_file_references(value, result);
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn db_export_all_json(state: State<'_, DatabaseState>) -> Result<Value, String> {
    let connection = lock_database(&state)?;
    let books = get_records(&connection, "books", true)?;
    let mut progress = Vec::with_capacity(books.len());
    for book in &books {
        let id = book
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "A local book is missing its id.".to_owned())?;
        let current_page = book
            .get("currentPage")
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("Local book {id} has invalid reading progress."))?;
        let updated_at = book
            .get("updatedAt")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("Local book {id} is missing its update timestamp."))?;
        progress.push(json!({
            "id": id,
            "bookId": id,
            "currentPage": current_page,
            "updatedAt": updated_at,
            "deletedAt": book.get("deletedAt").cloned().unwrap_or(Value::Null)
        }));
    }
    let mut payload = serde_json::Map::new();
    payload.insert("schemaVersion".to_owned(), json!(1));
    payload.insert("exportedAt".to_owned(), json!(now_timestamp()));
    payload.insert("books".to_owned(), json!(books));
    payload.insert("progress".to_owned(), json!(progress));
    payload.insert(
        "notes".to_owned(),
        json!(get_records(&connection, "notes", true)?),
    );
    payload.insert(
        "writings".to_owned(),
        json!(get_records(&connection, "writings", true)?),
    );
    payload.insert(
        "readingPlans".to_owned(),
        json!(get_records(&connection, "reading_plans", true)?),
    );
    payload.insert(
        "readingSessions".to_owned(),
        json!(get_records(&connection, "reading_sessions", true)?),
    );
    payload.insert(
        "writingSessions".to_owned(),
        json!(get_records(&connection, "writing_sessions", true)?),
    );
    Ok(Value::Object(payload))
}

#[tauri::command]
pub fn db_import_merge_json(state: State<'_, DatabaseState>, payload: Value) -> Result<(), String> {
    let object = payload
        .as_object()
        .ok_or_else(|| "The imported library data is invalid.".to_owned())?;
    let connection = lock_database(&state)?;
    for (name, table) in [
        ("books", "books"),
        ("notes", "notes"),
        ("writings", "writings"),
        ("readingPlans", "reading_plans"),
        ("readingSessions", "reading_sessions"),
        ("writingSessions", "writing_sessions"),
    ] {
        let Some(records) = object.get(name) else {
            continue;
        };
        let records = records
            .as_array()
            .ok_or_else(|| format!("{name} must be an array."))?;
        for record in records {
            merge_record(&connection, table, record)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn db_get_sync_status(state: State<'_, DatabaseState>) -> Result<Value, String> {
    let connection = lock_database(&state)?;
    let mut statement = connection
        .prepare("SELECT status, COUNT(*) FROM sync_queue GROUP BY status")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut counts = serde_json::Map::new();
    for row in rows {
        let (status, count) = row.map_err(|error| error.to_string())?;
        counts.insert(status, json!(count));
    }
    Ok(json!({
        "pending": counts.get("pending").cloned().unwrap_or(json!(0)),
        "failed": counts.get("failed").cloned().unwrap_or(json!(0)),
        "conflict": counts.get("conflict").cloned().unwrap_or(json!(0)),
        "synced": counts.get("synced").cloned().unwrap_or(json!(0)),
    }))
}

#[tauri::command]
pub fn db_get_sync_queue(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    let connection = lock_database(&state)?;
    let mut statement = connection
        .prepare(
            "SELECT id, collection, record_id, record_data, record_sync_status,
                asset_sync_status, status, attempt_count, next_retry_at, last_error
         FROM sync_queue WHERE status IN ('pending', 'failed')
         ORDER BY next_retry_at, created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let record_json: String = row.get(3)?;
            let record = serde_json::from_str::<Value>(&record_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "collection": row.get::<_, String>(1)?,
                "recordId": row.get::<_, String>(2)?,
                "record": record,
                "recordSyncStatus": row.get::<_, String>(4)?,
                "assetSyncStatus": row.get::<_, String>(5)?,
                "status": row.get::<_, String>(6)?,
                "attemptCount": row.get::<_, u32>(7)?,
                "nextRetryAt": row.get::<_, String>(8)?,
                "lastError": row.get::<_, Option<String>>(9)?,
            }))
        })
        .map_err(|error| error.to_string())?;
    rows.map(|row| row.map_err(|error| error.to_string()))
        .collect()
}

#[tauri::command]
pub fn db_mark_sync_queue_failed(
    state: State<'_, DatabaseState>,
    message: String,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    mark_sync_queue_failed(&connection, &message, chrono::Utc::now())
}

fn mark_sync_queue_failed(
    connection: &Connection,
    message: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare("SELECT id, attempt_count FROM sync_queue WHERE status IN ('pending', 'failed')")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);
    for (id, attempts) in items {
        let delay = 1u64.checked_shl(attempts.min(6)).unwrap_or(60).min(60);
        let retry_at = (now + chrono::Duration::seconds(delay as i64))
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        connection.execute(
            "UPDATE sync_queue SET status='failed', record_sync_status='failed',
                 asset_sync_status=CASE WHEN asset_sync_status='pending' THEN 'failed' ELSE asset_sync_status END,
                 attempt_count=attempt_count+1, next_retry_at=?1, last_error=?2, updated_at=?3
             WHERE id=?4 AND status IN ('pending', 'failed')",
            params![retry_at, message, now.to_rfc3339(), id],
        ).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn db_mark_sync_queue_synced(state: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = lock_database(&state)?;
    connection
        .execute(
            "UPDATE sync_queue SET status='synced', record_sync_status='synced',
             asset_sync_status='synced', last_error=NULL, updated_at=?1
         WHERE status IN ('pending', 'failed')",
            [now_timestamp()],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM sync_queue WHERE status='synced'
         AND updated_at < datetime('now', '-30 days')",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_retry_sync_queue(state: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = lock_database(&state)?;
    connection
        .execute(
            "UPDATE sync_queue SET status='pending',record_sync_status='pending',
             next_retry_at=?1,last_error=NULL,updated_at=?1
         WHERE status='failed'",
            [now_timestamp()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_store_sync_conflicts(
    state: State<'_, DatabaseState>,
    conflicts: Vec<Value>,
) -> Result<(), String> {
    let mut connection = lock_database(&state)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for conflict in conflicts {
        let id = conflict
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync conflict is missing its id.".to_owned())?;
        let collection = conflict
            .get("collection")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync conflict is missing its collection.".to_owned())?;
        let record_id = conflict
            .get("recordId")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync conflict is missing its record id.".to_owned())?;
        let local = serde_json::to_string(conflict.get("localData").unwrap_or(&Value::Null))
            .map_err(|error| error.to_string())?;
        let remote = serde_json::to_string(conflict.get("remoteData").unwrap_or(&Value::Null))
            .map_err(|error| error.to_string())?;
        transaction.execute(
            "INSERT INTO sync_conflicts(id, collection, record_id, local_data, remote_data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO NOTHING",
            params![id, collection, record_id, local, remote, now_timestamp()],
        ).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE sync_queue SET status='conflict', record_sync_status='conflict',
                 last_error='Conflicting cloud and local versions need a decision.', updated_at=?1
             WHERE collection=?2 AND record_id=?3",
                params![now_timestamp(), collection, record_id],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn db_get_sync_conflicts(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    let connection = lock_database(&state)?;
    let mut statement = connection
        .prepare(
            "SELECT id, collection, record_id, local_data, remote_data, created_at
         FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let local: String = row.get(3)?;
            let remote: String = row.get(4)?;
            let local_data = serde_json::from_str::<Value>(&local).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            let remote_data = serde_json::from_str::<Value>(&remote).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "collection": row.get::<_, String>(1)?,
                "recordId": row.get::<_, String>(2)?,
                "localData": local_data,
                "remoteData": remote_data,
                "createdAt": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|error| error.to_string())?;
    rows.map(|row| row.map_err(|error| error.to_string()))
        .collect()
}

#[tauri::command]
pub fn db_resolve_sync_conflict(
    state: State<'_, DatabaseState>,
    conflict_id: String,
    record: Option<Value>,
    conflict_copy: Option<Value>,
) -> Result<(), String> {
    let mut connection = lock_database(&state)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    if let Some(record) = record {
        let conflict: (String, String) = transaction.query_row(
            "SELECT collection, record_id FROM sync_conflicts WHERE id=?1 AND resolved_at IS NULL",
            [&conflict_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|error| error.to_string())?;
        let table = match conflict.0.as_str() {
            "books" => "books",
            "notes" => "notes",
            "writings" => "writings",
            "readingPlans" => "reading_plans",
            "readingSessions" => "reading_sessions",
            "writingSessions" => "writing_sessions",
            _ => return Err("The conflict uses an unsupported collection.".to_owned()),
        };
        save_record_impl(&transaction, table, &record, false)?;
        if let Some(copy) = conflict_copy {
            save_record_impl(&transaction, table, &copy, false)?;
        }
        transaction
            .execute(
                "UPDATE sync_queue SET status='synced', record_sync_status='synced',
                 asset_sync_status='synced', last_error=NULL, updated_at=?1
             WHERE collection=?2 AND record_id=?3",
                params![now_timestamp(), conflict.0, conflict.1],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE sync_conflicts SET resolved_at=?1 WHERE id=?2 AND resolved_at IS NULL",
            params![now_timestamp(), conflict_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_record(id: &str, cover_image: &str) -> Value {
        json!({
            "id": id,
            "title": "Offline book",
            "author": "Test author",
            "coverImage": cover_image,
            "updatedAt": "2026-11-21T08:00:00Z"
        })
    }

    #[test]
    fn queued_record_survives_database_reinitialization() {
        let connection = Connection::open_in_memory().expect("open in-memory SQLite");
        initialize(&connection).expect("initialize SQLite");
        save_record(
            &connection,
            "books",
            &test_record(
                "123e4567-e89b-42d3-a456-426614174000",
                "asset:123e4567-e89b-42d3-a456-426614174001",
            ),
        )
        .expect("save and queue local book");

        initialize(&connection).expect("reinitialize SQLite");
        let row: (String, String, String, u32) = connection
            .query_row(
                "SELECT status, record_sync_status, asset_sync_status, attempt_count
                 FROM sync_queue WHERE collection='books' AND record_id=?1",
                ["123e4567-e89b-42d3-a456-426614174000"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read queued book after reinitialization");
        assert_eq!(
            row,
            ("pending".into(), "pending".into(), "pending".into(), 0)
        );
    }

    #[test]
    fn local_data_reset_clears_library_and_sync_but_can_keep_settings() {
        let mut connection = Connection::open_in_memory().expect("open in-memory SQLite");
        initialize(&connection).expect("initialize SQLite");
        save_record(
            &connection,
            "books",
            &test_record(
                "123e4567-e89b-42d3-a456-426614174000",
                "asset:123e4567-e89b-42d3-a456-426614174001",
            ),
        )
        .expect("save local book");
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES('theme', 'dark')",
                [],
            )
            .expect("save retained setting");
        connection
            .execute(
                "INSERT INTO sync_conflicts(id, collection, record_id, created_at)
             VALUES('conflict-1', 'books', 'book-1', '2026-11-21T08:00:00Z')",
                [],
            )
            .expect("save conflict");
        connection
            .execute(
                "INSERT INTO local_files(file_key, category, created_at)
             VALUES('cover-1', 'covers', '2026-11-21T08:00:00Z')",
                [],
            )
            .expect("register local cover");
        connection
            .execute(
                "INSERT INTO reading_plan_reminders
                   (plan_id, title, start_date, end_date, time, days_of_week)
                VALUES('plan-1', 'Reading', '2026-11-21', '2026-12-21', '21:00', '[\"Mon\"]')",
                [],
            )
            .expect("save reading reminder");
        connection
            .execute(
                "INSERT INTO reading_plan_notifications
                   (id, plan_id, title, created_at, last_notified_at)
                 VALUES('notification-1', 'plan-1', 'Reading', '2026-11-21T08:00:00Z', '2026-11-21T08:00:00Z')",
                [],
            )
            .expect("save reading notification");

        clear_local_data_impl(&mut connection, false).expect("clear library data");

        let book_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
            .expect("count books");
        let queue_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM sync_queue", [], |row| row.get(0))
            .expect("count sync queue");
        let conflict_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM sync_conflicts", [], |row| row.get(0))
            .expect("count conflicts");
        let file_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM local_files", [], |row| row.get(0))
            .expect("count local files");
        let reminder_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM reading_plan_reminders", [], |row| {
                row.get(0)
            })
            .expect("count reading reminders");
        let notification_count: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM reading_plan_notifications",
                [],
                |row| row.get(0),
            )
            .expect("count reading notifications");
        let retained_setting: String = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key='theme'",
                [],
                |row| row.get(0),
            )
            .expect("read retained setting");
        assert_eq!(
            (book_count, queue_count, conflict_count, file_count),
            (0, 0, 0, 0)
        );
        assert_eq!(reminder_count, 0);
        assert_eq!(notification_count, 0);
        assert_eq!(retained_setting, "dark");

        clear_local_data_impl(&mut connection, true).expect("clear all local settings");
        let setting_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
            .expect("count settings");
        assert_eq!(setting_count, 0);
    }

    #[test]
    fn retry_backoff_doubles_and_caps_at_sixty_seconds() {
        let connection = Connection::open_in_memory().expect("open in-memory SQLite");
        initialize(&connection).expect("initialize SQLite");
        save_record(
            &connection,
            "books",
            &test_record("123e4567-e89b-42d3-a456-426614174002", ""),
        )
        .expect("save and queue local book");
        let start = chrono::DateTime::parse_from_rfc3339("2026-11-21T08:00:00Z")
            .expect("valid test timestamp")
            .with_timezone(&chrono::Utc);

        for (attempt, delay) in [1i64, 2, 4, 8, 16, 32, 60, 60].into_iter().enumerate() {
            let now = start + chrono::Duration::seconds(attempt as i64 * 70);
            mark_sync_queue_failed(&connection, "temporary network error", now)
                .expect("record sync failure");
            let (attempt_count, retry_at, status): (u32, String, String) = connection
                .query_row(
                    "SELECT attempt_count, next_retry_at, status FROM sync_queue
                     WHERE collection='books' AND record_id=?1",
                    ["123e4567-e89b-42d3-a456-426614174002"],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .expect("read retry state");
            assert_eq!(attempt_count, attempt as u32 + 1);
            assert_eq!(status, "failed");
            let expected = (now + chrono::Duration::seconds(delay))
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            assert_eq!(retry_at, expected);
        }
    }
}
