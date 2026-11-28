export type Language = 'zh' | 'en'

export interface CatalogEntry {
  zh: string
  en: string
}

export interface ServiceCatalog {
  version: number
  process_aliases: Record<string, CatalogEntry>
  exact_hosts: Record<string, CatalogEntry>
  root_domains: Record<string, CatalogEntry>
}

export interface TranslationMessages {
  common: {
    loadingApp: string
    unknownProcess: string
    unknown: string
    direct: string
    proxy: string
    reject: string
    tun: string
    save: string
    cancel: string
    close: string
    copy: string
    copied: string
    copyFailed: string
    expandAll: string
    collapseAll: string
    daysSuffix: (n: number) => string
    connsCount: (n: number) => string
    appsCount: (n: number) => string
    domainsCount: (n: number) => string
    itemsCount: (n: number) => string
    other: string
    ruleLabel: string
    fallbackBadge: string
  }
  auth: {
    subtitle: string
    loginTitle: string
    setupTitle: string
    loginDesc: string
    setupDesc: string
    passwordLabel: string
    passwordPlaceholder: string
    confirmLabel: string
    confirmPlaceholder: string
    errMinLength: string
    errMismatch: string
    errLoginFailed: string
    submitting: string
    enterDashboard: string
    completeSetup: string
  }
  nav: {
    overview: string
    apps: string
    nodes: string
    live: string
    devices: string
    localMode: string
    trafficMonitor: string
    collapseSidebar: string
    expandSidebar: string
    collapseSidebarTitle: string
    logout: string
  }
  topbar: {
    allDevices: string
    openDashboardTitle: (name: string) => string
    adminPanel: string
    liveStreamTitle: string
    devicesSettingsTitle: string
    scopeAll: string
    scopeProxy: string
    scopeDirect: string
    clearCustomDay: string
    viewLiveTitle: string
    switchToLight: string
    switchToDark: string
    exitKiosk: string
    enterKiosk: string
    toggleLangTitle: string
    langShort: string
  }
  appearance: {
    buttonTitle: string
    themeStyle: string
    openGallery: string
    galleryTitle: string
    gallerySubtitle: string
    previewDark: string
    previewLight: string
    pinned: string
    pinQuick: string
    inUse: string
    applyTheme: string
    pinnedCountHint: string
    overviewLayout: string
    classicLayout: string
    bentoLayout: string
    privacyMode: string
    privacyDesc: string
    languageSection: string
    langZh: string
    langEn: string
    themes: Record<string, { name: string; description: string }>
  }
  overview: {
    dismissWarningTitle: string
    dismissWarningAria: (target: string) => string
    tunSnifferTitle: string
    tunSnifferMessage: (deviceName: string) => string
    todayTraffic: string
    vsYesterday: (pct: number) => string
    proxyShort: (val: string) => string
    directShort: (val: string) => string
    monthAndQuota: string
    onlineDevices: (online: number, total: number) => string
    billedProgress: (billed: string, quotaGb: number) => string
    selectedRange: (val: string) => string
    allTimeTotal: (val: string) => string
    liveTotalSpeed: string
    activeConnsLabel: (n: number) => string
    topConsumerTitle: string
    drillDown: string
    calculating: string
    noRangeData: string
    heatmapTitle: string
    heatmapSubtitle: string
    heatmapActiveDays: string
    heatmapStreak: string
    heatmapDailyAvg: string
    heatmapPeak: string
    heatmapNone: string
    heatmapTooltipTotal: string
    heatmapTooltipHint: string
    heatmapMonths: string[]
    heatmapDays: string[]
    stackTitle: string
    stackSubtitle: string
    dimProcess: string
    dimDomain: string
    dimDevice: string
    dimNode: string
    dimDirection: string
    brushActive: string
    brushIdle: string
    tooltipNoFlow: string
    tooltipBucketTotal: string
    spikeInspectTitle: string
    querying: string
    closeInspectTitle: string
    spikeEmpty: string
    burstsTitle: string
    burstsSubtitle: string
    burstsEmpty: string
    rankingTitle: string
    topAppsTab: string
    topDomainsTab: string
    noAppsRank: string
    noDomainsRank: string
  }
  apps: {
    title: string
    subtitle: string
    onlyMatchTitle: string
    onlyMatchBtn: string
    byAppTab: string
    byDomainTab: string
    searchAppPlaceholder: string
    searchDomainPlaceholder: string
    noAppsData: string
    noDomainsData: string
    appTotalBytes: string
    proxyVsDirect: string
    downVsUp: string
    relatedDomainsConns: string
    connsTimes: (n: number) => string
    domainTrendTitle: string
    sankeyTitle: string
    sankeySubtitle: string
    sankeyEmpty: string
    sankeyNoTag: string
    domainDetailTableTitle: string
    filterDomainPrefix: (val: string) => string
    filterEgressPrefix: (val: string) => string
    clearFilter: string
    yamlRules: string
    colDomainService: string
    colTotal: string
    colShare: string
    colProxy: string
    colDirect: string
    colDownUpAction: string
    emptyFilteredDomains: string
    emptyVisitedDomains: string
    copyDirectRuleTitle: string
    lowFreqSubdomainLabel: string
    copyExactRuleTitle: string
    copyRuleBtn: string
    domainRootLabel: string
    domainDetailFallback: string
    domainTotalBytes: string
    visitingAppsCount: string
    appTrendTitle: string
    visitingAppsTitle: string
    colProcess: string
    emptyFilteredApps: string
    emptyVisitingApps: string
    selectAppPrompt: string
    copyRuleToastFmt: (fmt: 'yaml' | 'js') => string
    copyRuleToastRaw: (rule: string) => string
  }
  nodes: {
    title: string
    subtitle: string
    configQuotaBtn: string
    routeProxy: string
    routeDirect: string
    routeReject: string
    actualBytes: string
    billedBytes: string
    quotaCycleTitle: string
    actualProxyTraffic: (val: string) => string
    quotaUsedSummary: (pct: number, avg: string) => string
    quotaProjectedSummary: (gb: number, days: number) => string
    quotaNotConfigured: string
    configQuotaNow: string
    routeDonutTitle: string
    proxyRatioLabel: string
    totalShort: (val: string) => string
    topNodesTitle: string
    proxyAuditTitle: string
    proxyAuditSubtitle: string
    noProxyFlows: string
    nodePrefix: (node: string) => string
    rulePrefix: (rule: string) => string
    actualShort: (val: string) => string
    rulesRankTitle: string
    colRule: string
    colPolicy: string
    colTraffic: string
    colConns: string
    noRuleHits: string
  }
  live: {
    downSpeedSeries: string
    upSpeedSeries: string
    globalDown: string
    globalUp: string
    speedSplit: (proxy: string, direct: string) => string
    totalActiveConns: string
    wsPushHint: string
    onlineDevicesCard: string
    offlineBufferHint: string
    speedCurveTitle: string
    noOnlineDevices: string
    openClashPanelTitle: string
    panelShort: string
    tunNoSnifferTitle: string
    processDetectMode: (mode: string) => string
    heartbeatLabel: (rel: string) => string
    topProcessesTitle: string
    hoverLocked: string
    dampedSortingHint: string
    noActiveProcessTraffic: string
    idleKept: string
    topConnsTitle: string
    frozenNotice: string
    hoverOrderLocked: (pending: number) => string
    sortTitle: string
    sortByTotal: string
    sortByRate: string
    filterPlaceholder: string
    clearFilterTitle: string
    resumeTitle: string
    pauseTitle: string
    resumeBtn: string
    pauseBtn: string
    colDevice: string
    colProcess: string
    colHost: string
    colEgress: string
    colInbound: string
    colDownRate: string
    colUpRate: string
    colConnTotal: string
    emptyFilteredConns: string
    emptyActiveConns: string
    mergedConnsTitle: (n: number) => string
    copyTargetTitle: string
  }
  devices: {
    subTabDevices: (n: number) => string
    subTabSettings: string
    addDeviceTitle: string
    addDeviceDesc: string
    deviceNamePlaceholder: string
    dashboardUrlPlaceholder: string
    osDesktop: string
    osLaptop: string
    osLinux: string
    createTokenBtn: string
    createDeviceErr: string
    confirmDeleteDevice: (name: string) => string
    tokenMintedTitle: (name: string) => string
    tokenMintedHint: string
    hideTokenTitle: string
    showTokenTitle: string
    hideToken: string
    showToken: string
    download: string
    copyYaml: string
    copyCmd: string
    copiedCmd: string
    registeredDevicesTitle: string
    noDevicesYet: string
    diagTunNoSniffer: string
    diagOffline: (rel: string) => string
    deviceNameShort: string
    dashboardUrlShort: string
    editDeviceTitle: string
    openPanelTitle: (name: string) => string
    adminPanel: string
    coreLabel: (v: string) => string
    snifferLabel: (on: boolean) => string
    lastHeartbeatLabel: (rel: string) => string
    todayTotal: (v: string) => string
    todayProxy: (v: string) => string
    toggleCmdTitle: string
    startCmdBtn: string
    deleteDeviceTitle: string
    tokenHashNoticePrefix: string
    copyCmdTemplate: string
    copiedTemplate: string
    settingsTitle: string
    quotaGbLabel: string
    resetDayLabel: string
    burstMbLabel: string
    minuteRetentionLabel: string
    minuteRetention3: string
    minuteRetention7: string
    hourlyRetentionLabel: string
    hourlyRetention30: string
    multiplierRulesLabel: string
    addRuleBtn: string
    nodePatternPlaceholder: string
    customDomainAliasLabel: string
    addAliasBtn: string
    domainPlaceholder: string
    aliasPlaceholder: string
    savingSettings: string
    saveSettings: string
    settingsSaved: string
    settingsSaveFailed: string
    backupTitle: string
    backupDesc: string
    importOverwriteSettings: string
    exportBackupBtn: string
    importingBackup: string
    importBackupBtn: string
    importSuccess: (devsNew: number, devsOld: number, totals: number, flows: number, withSettings: boolean) => string
    importFailed: string
    privacyTitle: string
    privacyDesc: string
    privacyEnabledBtn: string
    privacyEnableBtn: string
    storageTitle: string
    refreshStats: string
    refreshingStats: string
    storageTotalSize: string
    storageDbDetail: (db: string, wal: string) => string
    storageRowCount: string
    storageRowsUnit: (n: number) => string
    storageTierDetail: (minRows: number, hourRows: number, dayRows: number) => string
    storageTimeSpan: string
    storageToDate: (d: string) => string
    storageLoading: string
    compactDesc: (minDays: number, hourDays: number) => string
    compacting: string
    compactNowBtn: string
    compactSuccess: (prunedMin: number, archivedHour: number, dailyUpserted: number, before: string, after: string) => string
    compactFailed: string
    retainRecentPrefix: string
    preserveSummaryLabel: string
    vacuumLabel: string
    pruneExpiredBtn: string
    pruneSuccess: (deleted: number, before: string, after: string) => string
    pruneFailed: string
    passwordTitle: string
    oldPasswordLabel: string
    newPasswordLabel: string
    updatePasswordBtn: string
    passwordUpdated: string
    passwordUpdateFailed: string
    pruneConfirmTitle: string
    pruneConfirmDesc: (days: number, preserveSummary: boolean, vacuum: boolean) => string
    pruning: string
    confirmPruneBtn: string
  }
}
