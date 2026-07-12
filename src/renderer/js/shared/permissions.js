(function attachPermissions(global) {
  const CARD_EXPAND = {
    perm_reports_view: ['reports-view'],
    perm_audit_view: ['audit-view'],
    perm_profile_admin: ['user-manage', 'user-add', 'user-delete', 'user-unlock', 'user-enable'],
    perm_recipe_manage: ['recipe-manage', 'recipe-list', 'recipe-edit'],
    perm_recipe_approve: ['recipe-approve']
  };

  function permissionList(user) {
    if (!user) return [];
    const direct = Array.isArray(user.permissions) ? user.permissions : [];
    const cards = Array.isArray(user.permissionCards) ? user.permissionCards : [];
    return [...new Set([...direct, ...cards])];
  }

  function isFactoryUser(user) {
    return String((user && user.role) || '').trim().toLowerCase() === 'factory';
  }

  function hasPermission(user, key) {
    if (!user || !key) return false;
    const role = String(user.role || '').trim().toLowerCase();
    if (role === 'factory') return true;
    const keys = permissionList(user);
    if (keys.includes(key)) return true;
    for (const [card, internals] of Object.entries(CARD_EXPAND)) {
      if (keys.includes(card) && internals.includes(key)) return true;
    }
    for (const [card, internals] of Object.entries(CARD_EXPAND)) {
      if (key === card && internals.some((internal) => keys.includes(internal))) return true;
    }
    return false;
  }

  global.RLEPermissions = {
    isFactoryUser,
    hasPermission,
    canViewReports: (user) => hasPermission(user, 'reports-view') || hasPermission(user, 'perm_reports_view'),
    canDownloadReports: (user) => hasPermission(user, 'reports-view') || hasPermission(user, 'perm_reports_view'),
    canViewAudit: (user) => hasPermission(user, 'audit-view') || hasPermission(user, 'perm_audit_view'),
    canManageProfiles: (user) => !isFactoryUser(user) && (hasPermission(user, 'user-manage') || hasPermission(user, 'perm_profile_admin')),
    canAddUsers: (user) => !isFactoryUser(user) && (hasPermission(user, 'user-add') || hasPermission(user, 'perm_profile_admin')),
    canDeleteUsers: (user) => !isFactoryUser(user) && (hasPermission(user, 'user-delete') || hasPermission(user, 'perm_profile_admin')),
    canUnlockUsers: (user) => !isFactoryUser(user) && (hasPermission(user, 'user-unlock') || hasPermission(user, 'perm_profile_admin')),
    canEnableUsers: (user) => !isFactoryUser(user) && (hasPermission(user, 'user-enable') || hasPermission(user, 'perm_profile_admin')),
    canManageRecipes: (user) => hasPermission(user, 'recipe-manage')
      || hasPermission(user, 'recipe-list')
      || hasPermission(user, 'perm_recipe_manage'),
    canSyncData: (user) => global.RLEPermissions.canViewReports(user) || global.RLEPermissions.canViewAudit(user)
  };
})(window);
