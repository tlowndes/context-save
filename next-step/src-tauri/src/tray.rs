//! The tray icon: left-click opens the panel, right-click the menu.
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::windows;

const ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Show waiting emails", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Next Step", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &sep, &settings, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(ICON)?)
        .tooltip("Next Step")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => windows::open_panel(app),
            "settings" => windows::open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                windows::toggle_panel(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// "Next Step · 3 waiting" on hover.
#[tauri::command]
pub fn set_waiting(app: AppHandle, n: usize) {
    if let Some(tray) = app.tray_by_id("main") {
        let tip = if n == 0 { "Next Step · nothing waiting".to_string() } else { format!("Next Step · {n} waiting") };
        let _ = tray.set_tooltip(Some(tip));
    }
}
