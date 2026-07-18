const PERMISSIONS = Object.freeze({
  REPORTS_VIEW: 'perm_reports_view',
  AUDIT_VIEW: 'perm_audit_view',
  EXPORT_USB: 'perm_export_usb',
  PROFILE_ADMIN: 'perm_profile_admin',
  RECIPE_MANAGE: 'perm_recipe_manage',
  RECIPE_APPROVE: 'perm_recipe_approve',
  TEST_ACCESS: 'perm_test_access',
  TEST_REPORT_APPROVE: 'perm_test_report_approve',
  VALIDATION_TEST: 'perm_validation_test',
  VALIDATION_REPORT_APPROVE: 'perm_validation_report_approve',
  DATETIME: 'perm_datetime',
  EXPORT_APPROVE: 'perm_export_approve'
});

const DESKTOP_API = Object.freeze({
  HEALTH: '/api/desktop/v1/health',
  AUTH_LOGIN: '/api/desktop/v1/auth/login',
  AUTH_ME: '/api/desktop/v1/auth/me',
  AUTH_LOGOUT: '/api/desktop/v1/auth/logout',
  REPORTS: '/api/desktop/v1/reports',
  REPORT_PDF: '/api/desktop/v1/reports/{reportId}/pdf',
  REPORTS_DOWNLOAD: '/api/desktop/v1/reports/download',
  AUDIT: '/api/desktop/v1/audit',
  AUDIT_DOWNLOAD: '/api/desktop/v1/audit/download',
  NETWORK_IPS: '/api/desktop/v1/network/ips',
  MEMBERS: '/api/desktop/v1/members',
  MEMBER: '/api/desktop/v1/members/{memberId}',
  MEMBER_UNLOCK: '/api/desktop/v1/members/{memberId}/unlock',
  MEMBER_ENABLE: '/api/desktop/v1/members/{memberId}/enable',
  PROFILE: '/api/desktop/v1/profile',
  APPROVAL_VERIFY: '/api/desktop/v1/approval-verify',
  PERMISSION_CARDS: '/api/desktop/v1/permission-cards',
  RECIPES: '/api/desktop/v1/recipes',
  RECIPE: '/api/desktop/v1/recipes/{recipeId}',
  RECIPE_VALIDATE: '/api/desktop/v1/recipes/validate',
  EMBED_ISSUE: '/api/desktop/v1/embed/issue'
});

/** Main Pi kiosk API (fallback until desktop routes are deployed on the device). */
const MACHINE_API = Object.freeze({
  HEALTH: '/api/health',
  AUTH_LOGIN: '/api/data/auth/login',
  REPORTS: '/api/data/reports',
  AUDIT_LOG: '/api/data/audit-log'
});

const IPC_CHANNELS = Object.freeze({
  DEVICE_LIST: 'device:list',
  DEVICE_ACTIVE_GET: 'device:active:get',
  DEVICE_ACTIVE_SET: 'device:active:set',
  DEVICE_SELECTED_GET: 'device:selected:get',
  DEVICE_SELECTED_SET: 'device:selected:set',
  DEVICE_SAVE: 'device:save',
  DEVICE_REMOVE: 'device:remove',
  DEVICE_HEALTH: 'device:health',
  DEVICE_HEALTH_ALL: 'device:health:all',
  DEVICE_HEALTH_SNAPSHOT: 'device:health:snapshot',
  DEVICE_HEALTH_UPDATE: 'device:health:update',
  DEVICE_PROBE_URL: 'device:probe:url',
  DEVICE_NETWORK_IPS: 'device:network:ips',
  FOLDER_PICK: 'folder:pick',
  AUTH_LOGIN: 'auth:login',
  AUTH_ME: 'auth:me',
  AUTH_LOGOUT: 'auth:logout',
  SYNC_RUN: 'sync:run',
  SYNC_STATE_GET: 'sync:state:get',
  SYNC_SCHEDULE_GET: 'sync:schedule:get',
  SYNC_SCHEDULE_SET: 'sync:schedule:set',
  SYNC_BUSY_SET: 'sync:busy:set',
  SYNC_SCHEDULE_STARTED: 'sync:schedule:started',
  SYNC_SCHEDULE_FINISHED: 'sync:schedule:finished',
  APP_CLOSE_BLOCKED: 'app:close:blocked',
  REPORTS_LIST: 'reports:list',
  REPORTS_PDF_GET: 'reports:pdf:get',
  REPORTS_PDF_DOWNLOAD: 'reports:pdf:download',
  REPORTS_PDF_SAVE: 'reports:pdf:save',
  REPORTS_DOWNLOAD: 'reports:download',
  REPORTS_ZIP_PROGRESS: 'reports:zip-progress',
  AUDIT_LIST: 'audit:list',
  AUDIT_DOWNLOAD: 'audit:download',
  MEMBERS_LIST: 'members:list',
  MEMBERS_GET: 'members:get',
  MEMBERS_SAVE: 'members:save',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_UNLOCK: 'members:unlock',
  MEMBERS_ENABLE: 'members:enable',
  MEMBERS_PERMISSION_CARDS: 'members:getPermissionCards',
  APPROVAL_VERIFY: 'approval:verify',
  EMBED_RECIPE_URL: 'embed:getRecipeUrl',
  EMBED_OPEN_EXTERNAL: 'embed:openExternal'
});

module.exports = {
  PERMISSIONS,
  DESKTOP_API,
  MACHINE_API,
  IPC_CHANNELS
};
