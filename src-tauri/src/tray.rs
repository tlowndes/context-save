//! The tray icon: the app's only permanent presence.
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::{settings::Settings, windows};

const ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn build(app: &AppHandle, s: &Settings) -> tauri::Result<()> {
    let save = MenuItem::with_id(app, "save", format!("Save context\t{}", s.save_shortcut), true, None::<&str>)?;
    let restore = MenuItem::with_id(app, "restore", format!("Restore…\t{}", s.restore_shortcut), true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Context Save", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(app, &[&save, &restore, &sep()?, &settings, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(ICON)?)
        .tooltip("Context Save")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "save" => windows::open_save(app),
            "restore" => windows::open_restore(app),
            "settings" => windows::open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                windows::open_restore(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
