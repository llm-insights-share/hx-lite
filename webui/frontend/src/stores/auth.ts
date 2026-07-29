import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken, clearToken, getToken } from '../api'

export type AuthUser = {
  id: number
  username: string
  email: string
  display_name: string
  avatar_url?: string
  roles: string
  is_active?: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const user = ref<AuthUser | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isOrgAdmin = computed(() => {
    const roles = (user.value?.roles || '').split(',').map((r) => r.trim())
    return roles.includes('org_admin')
  })
  const isProjectManager = computed(() => {
    const roles = (user.value?.roles || '').split(',').map((r) => r.trim())
    return roles.includes('org_admin') || roles.includes('project_owner')
  })

  async function login(username: string, password: string) {
    const body = new URLSearchParams()
    body.set('username', username)
    body.set('password', password)
    const { data } = await api.post('/auth/login', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    token.value = data.access_token
    setToken(data.access_token)
    await fetchMe()
  }

  async function register(payload: {
    email: string
    username: string
    password: string
    display_name?: string
  }) {
    const { data } = await api.post('/auth/register', {
      email: payload.email,
      username: payload.username,
      password: payload.password,
      display_name: payload.display_name || '',
    })
    token.value = data.access_token
    setToken(data.access_token)
    await fetchMe()
  }

  async function fetchMe() {
    if (!token.value) return
    const { data } = await api.get('/auth/me')
    user.value = data
  }

  function logout() {
    token.value = null
    user.value = null
    clearToken()
  }

  return { token, user, isLoggedIn, isOrgAdmin, isProjectManager, login, register, fetchMe, logout }
})
