import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "미루지마 Mirujima",
    short_name: "미루지마",
    description: "계획부터 집중 실행까지 연결하는 집중 지원 플랫폼",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F8FC",
    theme_color: "#101C32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
