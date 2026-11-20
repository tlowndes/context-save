//! The Windows side of capture and restore: which windows are open, which
//! screens there are, and moving, minimising and starting things.
//! Other platforms get empty results so the UI can still be worked on.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ShowState {
    Normal,
    Maximised,
    Minimised,
}

#[derive(Clone, Debug, Serialize)]
pub struct LiveWindow {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub exe: String,
    pub rect: Rect,
    pub state: ShowState,
    pub monitor: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Monitor {
    pub id: String,
    pub bounds: Rect,
    pub work: Rect,
    pub primary: bool,
}

#[cfg(windows)]
mod imp {
    use super::{LiveWindow, Monitor, Rect, ShowState};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
        MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowPlacement, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed, SetWindowPos, ShowWindow, GWL_EXSTYLE, GW_OWNER,
        HWND_TOP, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_MAXIMIZE, SW_RESTORE, SW_SHOWMINNOACTIVE, WINDOWPLACEMENT, WS_EX_TOOLWINDOW,
    };

    const MONITORINFOF_PRIMARY: u32 = 1;

    fn rect(r: &RECT) -> Rect {
        Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top }
    }

    fn wide(buf: &[u16]) -> String {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end])
    }

    unsafe fn monitor_info(m: HMONITOR) -> Option<Monitor> {
        let mut info: MONITORINFOEXW = std::mem::zeroed();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(m, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO) == 0 {
            return None;
        }
        Some(Monitor {
            id: wide(&info.szDevice),
            bounds: rect(&info.monitorInfo.rcMonitor),
            work: rect(&info.monitorInfo.rcWork),
            primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
        })
    }

    unsafe extern "system" fn collect_monitor(m: HMONITOR, _: HDC, _: *mut RECT, lparam: LPARAM) -> BOOL {
        let out = &mut *(lparam as *mut Vec<Monitor>);
        if let Some(info) = monitor_info(m) {
            out.push(info);
        }
        1
    }

    pub fn list_monitors() -> Vec<Monitor> {
        let mut out: Vec<Monitor> = Vec::new();
        unsafe { EnumDisplayMonitors(null_mut(), std::ptr::null(), Some(collect_monitor), &mut out as *mut _ as LPARAM) };
        out
    }

    unsafe fn exe_path(pid: u32) -> String {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return String::new();
        }
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        if ok == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }

    struct Ctx {
        own_pid: u32,
        out: Vec<LiveWindow>,
    }

    unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut Ctx);
        if IsWindowVisible(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
            return 1;
        }
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW != 0 {
            return 1;
        }
        let mut cloaked: u32 = 0;
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, &mut cloaked as *mut _ as *mut _, 4);
        if cloaked != 0 {
            return 1;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len == 0 {
            return 1;
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == ctx.own_pid {
            return 1;
        }

        let monitor = monitor_info(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST));
        let state = if IsIconic(hwnd) != 0 {
            ShowState::Minimised
        } else if IsZoomed(hwnd) != 0 {
            ShowState::Maximised
        } else {
            ShowState::Normal
        };

        // A normal window's rect is where it is now. For maximised and minimised
        // windows use the placement's normal position, which is in workspace
        // coordinates (relative to the work area) and needs shifting to the screen.
        let rect = if state == ShowState::Normal {
            let mut r: RECT = std::mem::zeroed();
            if GetWindowRect(hwnd, &mut r) == 0 {
                return 1;
            }
            rect(&r)
        } else {
            let mut wp: WINDOWPLACEMENT = std::mem::zeroed();
            wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(hwnd, &mut wp) == 0 {
                return 1;
            }
            let mut r = rect(&wp.rcNormalPosition);
            if let Some(m) = &monitor {
                r.x += m.work.x - m.bounds.x;
                r.y += m.work.y - m.bounds.y;
            }
            r
        };

        ctx.out.push(LiveWindow {
            hwnd: hwnd as isize,
            pid,
            title,
            exe: exe_path(pid),
            rect,
            state,
            monitor: monitor.map(|m| m.id).unwrap_or_default(),
        });
        1
    }

    pub fn list_windows() -> Vec<LiveWindow> {
        let mut ctx = Ctx { own_pid: std::process::id(), out: Vec::new() };
        unsafe { EnumWindows(Some(collect_window), &mut ctx as *mut _ as LPARAM) };
        ctx.out
    }

    pub fn place(hwnd: isize, r: Rect, state: ShowState) -> Result<(), String> {
        let h = hwnd as HWND;
        unsafe {
            if IsWindow(h) == 0 {
                return Err("That window has closed.".into());
            }
            if IsIconic(h) != 0 || IsZoomed(h) != 0 {
                ShowWindow(h, SW_RESTORE);
            }
            if SetWindowPos(h, HWND_TOP, r.x, r.y, r.w, r.h, SWP_NOACTIVATE | SWP_SHOWWINDOW) == 0 {
                return Err("Windows wouldn't move this window.".into());
            }
            match state {
                ShowState::Maximised => {
                    ShowWindow(h, SW_MAXIMIZE);
                }
                ShowState::Minimised => {
                    ShowWindow(h, SW_SHOWMINNOACTIVE);
                }
                ShowState::Normal => {}
            }
        }
        Ok(())
    }

    pub fn minimise(hwnds: &[isize]) {
        for &hwnd in hwnds {
            let h = hwnd as HWND;
            unsafe {
                if IsWindow(h) != 0 {
                    ShowWindow(h, SW_SHOWMINNOACTIVE);
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{LiveWindow, Monitor, Rect, ShowState};
    pub fn list_monitors() -> Vec<Monitor> {
        Vec::new()
    }
    pub fn list_windows() -> Vec<LiveWindow> {
        Vec::new()
    }
    pub fn place(_hwnd: isize, _r: Rect, _state: ShowState) -> Result<(), String> {
        Err("Moving windows only works on Windows.".into())
    }
    pub fn minimise(_hwnds: &[isize]) {}
}

#[tauri::command]
pub fn list_windows() -> Vec<LiveWindow> {
    imp::list_windows()
}

#[tauri::command]
pub fn list_monitors() -> Vec<Monitor> {
    imp::list_monitors()
}

#[tauri::command]
pub fn place_window(hwnd: isize, rect: Rect, state: ShowState) -> Result<(), String> {
    if rect.w < 1 || rect.h < 1 {
        return Err("A window needs a size.".into());
    }
    imp::place(hwnd, rect, state)
}

#[tauri::command]
pub fn minimise_windows(hwnds: Vec<isize>) {
    imp::minimise(&hwnds)
}

/// Starts a program with optional arguments (a file or folder to open).
#[tauri::command]
pub fn launch(exe: String, args: Vec<String>) -> Result<(), String> {
    let path = std::path::Path::new(&exe);
    if !path.is_absolute() || !path.is_file() {
        return Err(format!("{exe} isn't on this PC."));
    }
    let mut cmd = std::process::Command::new(path);
    cmd.args(&args);
    if let Some(dir) = path.parent() {
        cmd.current_dir(dir);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// A recent-files shortcut by the file's name, e.g. "Brief.docx" → `Recent\Brief.docx.lnk`.
#[tauri::command]
pub fn recent_shortcut(name: String) -> Option<Vec<u8>> {
    if name.is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") {
        return None;
    }
    let appdata = std::env::var("APPDATA").ok()?;
    let p = std::path::Path::new(&appdata).join("Microsoft").join("Windows").join("Recent").join(format!("{name}.lnk"));
    std::fs::read(p).ok()
}
