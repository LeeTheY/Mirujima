import { StrictMode } from "react";
import { AppProvider } from "../shared/ui/AppContext";
import { BlockedApp } from "./BlockedApp";
import { mountApp } from "../shared/ui/mount";
import "../shared/ui/styles.css";

mountApp(<StrictMode><AppProvider><BlockedApp /></AppProvider></StrictMode>);
