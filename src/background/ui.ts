import type { MainUI } from "../shared/types/models";

export async function syncMainUI(mainUI: MainUI): Promise<void> {
  if (mainUI === "popup") {
    await chrome.action.setPopup({ popup: "popup.html" });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } else {
    await chrome.action.setPopup({ popup: "" });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
