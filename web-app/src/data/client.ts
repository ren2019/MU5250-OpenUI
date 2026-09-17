// HTTP client for the agent: token handling, envelope unwrapping, timeouts.

export const API_BASE = `http://${window.location.hostname}:9090`
export const AUTH_EXPIRED_EVENT = 'zte-auth-expired'

let _token: string | null = sessionStorage.getItem('zte_token')

export function setToken(t: string) {
  _token = t
  sessionStorage.setItem('zte_token', t)
}

export function clearToken() {
  _token = null
  sessionStorage.removeItem('zte_token')
}

export function hasToken() {
  return !!_token
}

// Known agent errors are translated; preserve unknown diagnostics verbatim.
export function errorLabel(message: string): string {
  const labels: Record<string, string> = {
    'invalid credentials': '密码或 PIN 码不正确',
    unauthorized: '登录已失效，请重新登录',
    'provide either password or pin': '请填写密码或 PIN 码其中一项',
    "missing 'password' or 'pin' field": '请填写密码或 PIN 码',
    'PIN login is only available from mobile devices': 'PIN 码登录仅适用于移动设备',
    'no password configured. Set ZTE_AGENT_PASSWORD environment variable.': '管理服务尚未配置密码，请设置 ZTE_AGENT_PASSWORD 环境变量。',
    'destructive action requires X-Confirm: true header': '此操作需要确认（X-Confirm: true）',
    'no readable log file': '暂无可读取的日志文件',
    'request body exceeds 1 MiB': '请求内容超过 1 MiB',
    'not found': '未找到请求的资源',
    'invalid JSON': '请求的 JSON 格式无效',
    "missing 'command'": '缺少 AT 命令',
    'command not allowed. Only read-only AT commands are permitted.': '命令不在允许列表中，仅支持只读 AT 命令。',
    'ttl must be 1-255': 'TTL 必须在 1 至 255 之间',
    'duration must be 1–86400 seconds and interval 1–60 seconds': '记录时长须为 1 至 86400 秒，采样间隔须为 1 至 60 秒',
    'logger already running': '记录任务已在运行',
    'network mode is not supported by U60 Pro firmware': 'U60 Pro 固件不支持此网络模式',
    'memory info not available': '内存信息不可用',
    'reset_day must be between 1 and 31': '重置日必须在 1 至 31 日之间',
    'per_page must be between 1 and 500': '每页条数须在 1 至 500 之间',
    'message must contain 1 to 160 characters': '短信长度须在 1 至 160 个字符之间',
  }
  const retry = message.match(/^too many attempts, retry in (\d+)s$/)
  if (retry) return `尝试次数过多，请在 ${retry[1]} 秒后重试`
  return labels[message] ?? `服务返回：${message}`
}

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function emitAuthExpired() {
  clearToken()
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

export async function req(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  timeoutMs = 15_000,
  base = API_BASE,
  sendToken = true,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) }
  if (_token && sendToken) headers['Authorization'] = `Bearer ${_token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('连接管理服务超时')
      }
      throw new ApiError(`无法连接管理服务：${API_BASE}`)
    }

    let json: { ok?: boolean; data?: unknown; error?: string }
    try {
      json = await res.json()
    } catch {
      throw new ApiError(`管理服务响应无效（${res.status}）`, res.status)
    }

    if (res.status === 401 && sendToken && base === API_BASE && path !== '/api/auth/login') {
      emitAuthExpired()
    }
    if (!res.ok || !json.ok) {
      throw new ApiError(json.error ? errorLabel(json.error) : `请求失败（${res.status}）`, res.status)
    }
    return (json.data ?? {}) as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }
}

export const get = (path: string) => req('GET', path)
export const post = (path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
  req('POST', path, body, extraHeaders)
export const put = (path: string, body: unknown) => req('PUT', path, body)

export async function login(
  credentials: string | { password?: string; pin?: string },
): Promise<{ token: string }> {
  const body = typeof credentials === 'string' ? { password: credentials } : credentials
  const data = await req('POST', '/api/auth/login', body)
  return { token: data.token as string }
}

// Only the private IPv4 address explicitly submitted by the user may receive
// a single-use confirmation token during a LAN transition. Never transfer the
// general session token: the proposed address could already belong to another host.
export async function confirmLan(ip: string, confirmationToken: string) {
  const octets = ip.split('.').map(Number)
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || octets.some(n => n > 255) ||
      !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168))) {
    throw new ApiError('局域网重连地址无效')
  }
  return req('POST', '/api/router/lan/confirm', { token: confirmationToken }, undefined, 3000, `http://${ip}:9090`, false)
}

export async function readCsv(path: string): Promise<{ csv: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: _token ? { Authorization: `Bearer ${_token}` } : {}, signal: controller.signal,
    })
    if (response.status === 401) emitAuthExpired()
    if (!response.ok) throw new ApiError(`CSV 下载失败（${response.status}）`, response.status)
    // Older agents and the emulator return a JSON envelope.
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json()
      if (!body.ok || typeof body.data?.csv !== 'string') throw new ApiError('CSV 响应无效')
      return { csv: body.data.csv }
    }
    return { csv: await response.text() }
  } finally { clearTimeout(timeout) }
}
