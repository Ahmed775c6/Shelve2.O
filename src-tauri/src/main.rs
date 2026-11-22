// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(result) = shelve_lib::run_cli() {
        if let Err(error) = result {
            eprintln!("Reading reminder failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    shelve_lib::run()
}
