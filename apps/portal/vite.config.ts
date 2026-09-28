import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: {
    // host: true 监听全部地址（默认 localhost 在 Node/Windows 下只绑 IPv6 ::1，浏览器走 IPv4 会打不开）
    host: true,
    port: 5174,
    // 后端未启用 CORS：门户必须经此代理同源访问 /api（生产由 nginx 反代，见根目录 nginx.conf）
    proxy: { "/api": "http://localhost:3001" },
  },
})
