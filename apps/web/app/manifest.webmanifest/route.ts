import en from "../../locales/en/common.json";

export const dynamic = "force-static";
export function GET() {
  return Response.json(
    {
      id: "/",
      name: "Taff",
      short_name: "Taff",
      description: en.pwa.description,
      lang: "en",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0a1626",
      icons: [192, 512].map((size) => ({
        src: `/icons/taff-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any maskable",
      })),
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
