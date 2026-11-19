use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[allow(unused_mut)]
            let mut win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Hell's Factory Studio")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1000.0, 600.0)
                .maximized(true)
                .center()
                // let the page receive dropped files (subtitles, videos, zips)
                .disable_drag_drop_handler();

            // Automated tests only: HF_E2E_DEBUG_PORT opens WebView2 remote debugging on localhost.
            #[cfg(windows)]
            {
                let mut args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
                if let Ok(port) = std::env::var("HF_E2E_DEBUG_PORT") {
                    if port.chars().all(|c| c.is_ascii_digit()) {
                        args.push_str(&format!(" --remote-debugging-port={port}"));
                    }
                }
                win = win.additional_browser_args(&args);
            }

            win.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
