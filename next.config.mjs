/** Static export so the app can be hosted on GitHub Pages (or any static host).
 *  NEXT_PUBLIC_BASE_PATH lets it live under /<repo-name>. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export default {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};
