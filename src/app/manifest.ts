import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Task Launcher",
    short_name: "Task Launcher",
    description: "Быстрая постановка задач в Bitrix24",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f8",
    theme_color: "#f7f9f8",
    lang: "ru",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
