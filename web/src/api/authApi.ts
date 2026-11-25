import type { AuthStatusResponse } from '../types/api'
import { invalidateCache, reqJSON } from './http'

export const authApi = {
  // Always bypass cache for auth session verification
  status: () => reqJSON<AuthStatusResponse>('/api/v1/auth/status'),
  setup: async (password: string) => {
    const res = await reqJSON<{ ok: boolean }>('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    invalidateCache()
    return res
  },
  login: async (password: string) => {
    const res = await reqJSON<{ ok: boolean }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    invalidateCache()
    return res
  },
  logout: async () => {
    try {
      return await reqJSON<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      invalidateCache()
    }
  },
  changePassword: (old_password: string, new_password: string) =>
    reqJSON<{ ok: boolean }>('/api/v1/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ old_password, new_password }),
    }),
}
