import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "미루지마 | 계획이 집중으로 이어지는 곳", template: "%s | 미루지마" },
  description: "계획, 사이트 차단, 집중 기록을 하나로 연결하는 집중 지원 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" data-scroll-behavior="smooth"><body><PwaRegister />{children}</body></html>;
}
