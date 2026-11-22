mod database;
mod reading_reminders;

use tauri::Manager;

const AUTH_SERVICE: &str = "com.ahmed.shelve";
const AUTH_ENTRY: &str = "cloud-session";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = rusqlite::Connection::open(data_dir.join("shelve.db"))?;
            database::initialize(&connection)?;
            app.manage(database::DatabaseState(std::sync::Mutex::new(connection)));

            #[cfg(not(mobile))]
            tauri::WebviewWindowBuilder::new(
                app,
                "splash",
                tauri::WebviewUrl::App("splash.html".into()),
            )
            .title("Shelve — Loading")
            .inner_size(420.0, 280.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .center()
            .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            store_auth_session,
            load_auth_session,
            clear_auth_session,
            database::db_get_books,
            database::db_save_book,
            database::db_update_book,
            database::db_delete_book,
            database::db_update_progress,
            database::db_get_notes,
            database::db_save_note,
            database::db_delete_note,
            database::db_get_writings,
            database::db_save_writing,
            database::db_delete_writing,
            database::db_get_reading_plans,
            database::db_save_reading_plan,
            database::db_delete_reading_plan,
            reading_reminders::reading_reminders_supported,
            reading_reminders::get_reading_plan_notifications,
            reading_reminders::acknowledge_reading_plan_notification,
            reading_reminders::delete_reading_plan_notification,
            reading_reminders::clear_reading_plan_notifications,
            reading_reminders::sync_reading_plan_reminders,
            database::db_get_reading_sessions,
            database::db_save_reading_session,
            database::db_delete_reading_session,
            database::db_get_writing_sessions,
            database::db_save_writing_session,
            database::db_delete_writing_session,
            database::db_get_setting,
            database::db_save_setting,
            database::db_clear_local_data,
            database::db_register_local_file,
            database::db_unregister_local_file,
            database::db_get_orphan_local_files,
            database::db_export_all_json,
            database::db_import_merge_json,
            database::db_get_sync_status,
            database::db_get_sync_queue,
            database::db_mark_sync_queue_failed,
            database::db_mark_sync_queue_synced,
            database::db_retry_sync_queue,
            database::db_mark_sync_assets_synced,
            database::db_store_sync_conflicts,
            database::db_get_sync_conflicts,
            database::db_resolve_sync_conflict
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn run_cli() -> Option<Result<(), String>> {
    reading_reminders::run_cli()
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn store_auth_session(session: String) -> Result<(), String> {
    let entry = keyring::Entry::new(AUTH_SERVICE, AUTH_ENTRY).map_err(|error| error.to_string())?;
    entry
        .set_password(&session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_auth_session() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(AUTH_SERVICE, AUTH_ENTRY).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(session) => Ok(Some(session)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn clear_auth_session() -> Result<(), String> {
    let entry = keyring::Entry::new(AUTH_SERVICE, AUTH_ENTRY).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
