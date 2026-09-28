import { describe, expect, it } from "vitest"
import { loadMcpConfig } from "../src/config.js"

describe("loadMcpConfig", () => {
  it("空环境使用默认值：stdio + 本地 API + 写入工具关闭", () => {
    const config = loadMcpConfig({})
    expect(config.transport).toBe("stdio")
    expect(config.apiUrl).toBe("http://localhost:3001")
    expect(config.httpHost).toBe("127.0.0.1")
    expect(config.httpPort).toBe(3002)
    expect(config.enableWriteTools).toBe(false)
    expect(config.username).toBeNull()
    expect(config.password).toBeNull()
  })

  it("去掉 API 地址尾部斜杠，避免拼出 //api/... ", () => {
    expect(loadMcpConfig({ SHADOVA_API_URL: "http://example.com:3001/" }).apiUrl).toBe("http://example.com:3001")
    expect(loadMcpConfig({ SHADOVA_API_URL: "http://example.com:3001///" }).apiUrl).toBe("http://example.com:3001")
  })

  it("写入开关识别 true/1，其余视为关闭", () => {
    expect(loadMcpConfig({ SHADOVA_ENABLE_WRITE_TOOLS: "true" }).enableWriteTools).toBe(true)
    expect(loadMcpConfig({ SHADOVA_ENABLE_WRITE_TOOLS: "1" }).enableWriteTools).toBe(true)
    expect(loadMcpConfig({ SHADOVA_ENABLE_WRITE_TOOLS: "0" }).enableWriteTools).toBe(false)
    expect(loadMcpConfig({ SHADOVA_ENABLE_WRITE_TOOLS: "yes" }).enableWriteTools).toBe(false)
  })

  it("非法传输方式直接报错，不静默降级", () => {
    expect(() => loadMcpConfig({ SHADOVA_TRANSPORT: "sse" })).toThrow(/stdio\/http/)
  })

  it("非法端口直接报错", () => {
    expect(() => loadMcpConfig({ SHADOVA_HTTP_PORT: "70000" })).toThrow(/1-65535/)
    expect(() => loadMcpConfig({ SHADOVA_HTTP_PORT: "abc" })).toThrow(/1-65535/)
  })
})
