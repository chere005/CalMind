// CalMind desktop — the same web export in a native window. All behavior
// lives in the shared JS; this shell only opens the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running CalMind");
}
