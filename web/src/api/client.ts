import { authApi } from './authApi'
import { deviceApi } from './deviceApi'
import { invalidateCache, type FetchOptions } from './http'
import { nodeApi } from './nodeApi'
import { trafficApi, type QueryParams } from './trafficApi'

export type { QueryParams, FetchOptions }
export { authApi, deviceApi, trafficApi, nodeApi, invalidateCache }

export const api = {
  authStatus: authApi.status,
  authSetup: authApi.setup,
  authLogin: authApi.login,
  authLogout: authApi.logout,
  changePassword: authApi.changePassword,

  listDevices: () => deviceApi.list(),
  createDevice: deviceApi.create,
  updateDevice: deviceApi.update,
  deleteDevice: deviceApi.delete,

  getSettings: () => deviceApi.getSettings(),
  saveSettings: deviceApi.saveSettings,

  exportBackupUrl: deviceApi.exportBackupUrl,
  importBackup: deviceApi.importBackup,

  overview: (q: QueryParams, opts?: FetchOptions) => trafficApi.overview(q, opts),
  heatmap: (q: Pick<QueryParams, 'deviceId' | 'scope'>, opts?: FetchOptions) => trafficApi.heatmap(q, opts),
  timeseries: trafficApi.timeseries,
  bursts: trafficApi.bursts,
  apps: trafficApi.apps,
  appDetail: trafficApi.appDetail,
  domains: trafficApi.domains,
  domainDetail: trafficApi.domainDetail,

  nodes: nodeApi.nodes,

  liveSnapshot: trafficApi.liveSnapshot,
}
