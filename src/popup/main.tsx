import { StrictMode } from "react";
import { AppProvider } from "../shared/ui/AppContext";
import { Root } from "../shared/ui/Root";
import { mountApp } from "../shared/ui/mount";
import "../shared/ui/styles.css";

document.documentElement.classList.add("popup-document");
mountApp(<StrictMode><AppProvider><Root variant="popup" /></AppProvider></StrictMode>);
