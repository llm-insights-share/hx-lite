import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue') },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      redirect: '/org',
      children: [
        { path: 'me/settings', redirect: { path: '/org', query: { settings: '1' } } },
        {
          path: 'org',
          component: () => import('../layouts/OrgLayout.vue'),
          redirect: '/org/dashboard',
          children: [
            { path: 'dashboard', component: () => import('../views/org/Dashboard.vue') },
            { path: 'profiles', component: () => import('../views/org/Profiles.vue') },
            { path: 'stages', component: () => import('../views/org/Stages.vue') },
            { path: 'guides', component: () => import('../views/org/Guides.vue') },
            { path: 'commands', component: () => import('../views/org/Commands.vue') },
            { path: 'bootstrap', component: () => import('../views/org/Bootstrap.vue') },
            { path: 'asset-submissions', component: () => import('../views/org/AssetSubmissions.vue') },
            { path: 'github', component: () => import('../views/org/Github.vue') },
            { path: 'users', component: () => import('../views/org/Users.vue') },
            { path: 'settings', component: () => import('../views/org/Settings.vue') },
          ],
        },
        {
          path: 'project',
          component: () => import('../layouts/ProjectLayout.vue'),
          redirect: '/project/dashboard',
          children: [
            { path: 'dashboard', component: () => import('../views/project/Dashboard.vue') },
            { path: 'list', component: () => import('../views/project/ProjectList.vue') },
            { path: 'config', redirect: '/project/list' },
            { path: 'artifacts', component: () => import('../views/project/Artifacts.vue') },
            { path: 'github-sync', component: () => import('../views/project/GithubSync.vue') },
            { path: 'guides', component: () => import('../views/project/Guides.vue') },
            { path: 'sensors', component: () => import('../views/project/Sensors.vue') },
            { path: 'shells', component: () => import('../views/project/Shells.vue') },
            { path: 'asset-submit', component: () => import('../views/project/AssetSubmit.vue') },
            { path: 'tasks', component: () => import('../views/project/CustomTasks.vue') },
            { path: 'tickets', component: () => import('../views/project/Tickets.vue') },
            { path: 'nhx-usage', component: () => import('../views/project/NhxUsage.vue') },
            { path: 'shell-usage', component: () => import('../views/project/ShellUsage.vue') },
            { path: ':id', component: () => import('../views/project/ProjectDetail.vue') },
          ],
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const publicPaths = ['/login', '/register']
  const hasNhxCallback = typeof to.query.nhx_callback === 'string' && !!to.query.nhx_callback
  if (!publicPaths.includes(to.path) && !getToken()) return '/login'
  // Allow staying on login/register when nhx CLI is waiting for a callback
  if (publicPaths.includes(to.path) && getToken() && !hasNhxCallback) return '/org'
})

export default router
