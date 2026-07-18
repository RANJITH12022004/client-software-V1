(function attachApiBridge(global) {
  function missingApi() {
    return Promise.resolve({
      ok: false,
      error: 'The app connection is unavailable. Open this screen from the installed app.'
    });
  }

  function group(name) {
    return global.electronAPI && global.electronAPI[name] ? global.electronAPI[name] : {};
  }

  function call(fn, fallback) {
    return typeof fn === 'function' ? fn : fallback || missingApi;
  }

  global.apiBridge = {
    devices: {
      list: call(group('devices').list),
      getActive: call(group('devices').getActive),
      setActive: call(group('devices').setActive),
      getSelected: call(group('devices').getSelected),
      setSelected: call(group('devices').setSelected),
      save: call(group('devices').save),
      remove: call(group('devices').remove),
      health: call(group('devices').health),
      checkAll: call(group('devices').checkAll),
      getHealthSnapshot: call(group('devices').getHealthSnapshot),
      probeUrl: call(group('devices').probeUrl),
      getNetworkIps: call(group('devices').getNetworkIps),
      onHealthUpdate: call(group('devices').onHealthUpdate, function () { return function noop() {}; })
    },
    reports: {
      list: call(group('reports').list),
      getPdf: call(group('reports').getPdf),
      savePdf: call(group('reports').savePdf),
      downloadPdf: call(group('reports').downloadPdf),
      downloadZip: call(group('reports').downloadZip),
      onZipProgress: call(group('reports').onZipProgress, function () { return function noop() {}; })
    },
    audit: {
      list: call(group('audit').list),
      download: call(group('audit').download)
    },
    members: {
      list: call(group('members').list),
      get: call(group('members').get),
      save: call(group('members').save),
      remove: call(group('members').remove),
      unlock: call(group('members').unlock),
      enable: call(group('members').enable),
      getPermissionCards: call(group('members').getPermissionCards),
      verifyApproval: call(group('members').verifyApproval)
    },
    embed: {
      getRecipeUrl: call(group('embed').getRecipeUrl),
      openExternal: call(group('embed').openExternal)
    },
    folder: {
      pick: call(group('folder').pick)
    },
    auth: {
      login: call(group('auth').login),
      me: call(group('auth').me),
      logout: call(group('auth').logout)
    },
    sync: {
      run: call(group('sync').run),
      getState: call(group('sync').getState),
      getSchedule: call(group('sync').getSchedule),
      setSchedule: call(group('sync').setSchedule),
      setBusy: call(group('sync').setBusy),
      onScheduledStarted: call(group('sync').onScheduledStarted, function () { return function noop() {}; }),
      onScheduledFinished: call(group('sync').onScheduledFinished, function () { return function noop() {}; }),
      onCloseBlocked: call(group('sync').onCloseBlocked, function () { return function noop() {}; })
    },
    messageFromResult: function messageFromResult(result, fallback) {
      if (!result) {
        return fallback || 'No response was returned.';
      }

      return result.ok ? fallback || 'Done.' : result.error || fallback || 'The request failed.';
    }
  };
})(window);
