(function initProfilesModule() {
  const tableBody = document.querySelector('#profiles-table-body');
  const addBtn = document.querySelector('#profiles-add-btn');
  const refreshBtn = document.querySelector('#profiles-refresh-btn');
  const editModal = document.querySelector('#profile-edit-modal');
  const editForm = document.querySelector('#profile-edit-form');
  const editStatus = document.querySelector('#profile-edit-status');
  const cardsContainer = document.querySelector('#profile-edit-cards');
  const approvalModal = document.querySelector('#approval-verify-modal');
  const approvalForm = document.querySelector('#approval-verify-form');
  const approvalStatus = document.querySelector('#approval-verify-status');

  // Local display metadata (same as machine rbac.js). API supplies keys/labels.
  const CARD_META = {
    perm_test_access: {
      description: 'Quick test (including step setup), recipe-based test runs, and configuring recipe steps.',
      accent: 0
    },
    perm_test_report_approve: {
      description: 'Approve pending test reports.',
      accent: 1
    },
    perm_recipe_manage: {
      description: 'Create and edit recipes.',
      accent: 2
    },
    perm_recipe_approve: {
      description: 'Participate in recipe approval / verification.',
      accent: 3
    },
    perm_profile_admin: {
      description: 'Add, disable, edit, lock, unlock, and change roles for profiles.',
      accent: 4
    },
    perm_validation_test: {
      description: 'Run validation tests (USP 1 / USP 2).',
      accent: 5
    },
    perm_validation_report_approve: {
      description: 'Approve pending validation reports.',
      accent: 6
    },
    perm_datetime: {
      description: 'Change system date, time, and RTC.',
      accent: 7
    },
    perm_reports_view: {
      description: 'Open, preview, and print reports.',
      accent: 8
    },
    perm_audit_view: {
      description: 'View audit log and export audit trails to USB.',
      accent: 9
    },
    perm_export_usb: {
      description: 'Export to USB (requires report or audit access for the data being exported).',
      accent: 10
    },
    perm_export_approve: {
      description: 'Verify another user’s USB export (secondary approval).',
      accent: 11
    },
    perm_calibration_test: {
      description: 'Run calibration tests.',
      accent: 5
    },
    perm_calibration_report_approve: {
      description: 'Approve pending calibration reports.',
      accent: 6
    },
    perm_calibration: {
      description: 'Access calibration functions.',
      accent: 5
    }
  };

  let permissionCards = [];
  let selectedCardKeys = [];
  let membersCache = [];
  let currentUser = null;
  let pendingDeleteId = null;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setEditStatus(message, type) {
    if (!editStatus) return;
    editStatus.textContent = message || '';
    editStatus.className = `toast${type ? ` ${type}` : ''}`;
  }

  function setApprovalStatus(message, type) {
    if (!approvalStatus) return;
    approvalStatus.textContent = message || '';
    approvalStatus.className = `toast${type ? ` ${type}` : ''}`;
  }

  function memberStatusLabel(member) {
    const status = String(member.status || 'active').toLowerCase();
    if (status === 'locked') return 'Locked';
    if (status === 'disabled') return 'Disabled';
    return 'Active';
  }

  function canEdit() {
    return window.RLEPermissions && window.RLEPermissions.canManageProfiles(currentUser);
  }

  function enrichCard(card, index) {
    const meta = CARD_META[card.key] || {};
    return {
      key: card.key,
      label: card.label || card.key,
      description: card.description || meta.description || 'Select or clear this functionality.',
      accent: card.accent != null ? Number(card.accent) : (meta.accent != null ? meta.accent : (index % 12))
    };
  }

  function renderPermissionCards() {
    if (!cardsContainer) return;
    const selectedSet = new Set(selectedCardKeys || []);
    cardsContainer.innerHTML = '';

    permissionCards.forEach((raw, index) => {
      const card = enrichCard(raw, index);
      const selected = selectedSet.has(card.key);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `permission-card${selected ? ` is-selected permission-card--accent-${card.accent}` : ''}`;
      el.dataset.featureKey = card.key;
      el.setAttribute('aria-pressed', selected ? 'true' : 'false');
      el.title = 'Select or clear this functionality';
      el.innerHTML = `
        <div class="permission-card-title">${escapeHtml(card.label)}</div>
        <div class="permission-card-desc">${escapeHtml(card.description)}</div>
        <div class="permission-card-state">${selected ? 'Selected' : 'Not selected'}</div>
      `;
      el.addEventListener('click', () => togglePermissionCard(card.key));
      cardsContainer.appendChild(el);
    });
  }

  function togglePermissionCard(featureKey) {
    if (!featureKey) return;
    const index = selectedCardKeys.indexOf(featureKey);
    if (index === -1) selectedCardKeys.push(featureKey);
    else selectedCardKeys.splice(index, 1);
    renderPermissionCards();
  }

  function openEditModal(member) {
    if (!editModal) return;
    const isNew = !member;
    document.querySelector('#profile-edit-title').textContent = isNew ? 'Add User' : 'Edit Profile';
    document.querySelector('#profile-edit-id').value = member ? member.id : '';
    document.querySelector('#profile-edit-name').value = member ? (member.name || '') : '';
    document.querySelector('#profile-edit-username').value = member ? (member.username || '') : '';
    document.querySelector('#profile-edit-username').disabled = Boolean(member);
    document.querySelector('#profile-edit-password').value = '';
    document.querySelector('#profile-edit-role').value = member ? (member.role || 'operator') : 'operator';
    selectedCardKeys = member && member.featureOverrides && Array.isArray(member.featureOverrides.allow)
      ? member.featureOverrides.allow.slice()
      : [];
    renderPermissionCards();
    const cardsWrap = document.querySelector('#profile-edit-cards-wrap');
    if (cardsWrap) cardsWrap.hidden = !window.RLEPermissions.canAddUsers(currentUser);
    setEditStatus('');
    editModal.classList.add('active');
  }

  function closeEditModal() {
    if (editModal) editModal.classList.remove('active');
  }

  function openApprovalModal(memberId) {
    pendingDeleteId = memberId;
    setApprovalStatus('');
    if (approvalModal) approvalModal.classList.add('active');
  }

  function closeApprovalModal() {
    pendingDeleteId = null;
    if (approvalModal) approvalModal.classList.remove('active');
  }

  function renderTable() {
    if (!tableBody) return;
    if (!membersCache.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No members found.</td></tr>';
      return;
    }

    tableBody.innerHTML = membersCache.map((member) => {
      const id = member.id;
      const actions = [];
      if (canEdit()) {
        actions.push(`<button type="button" class="ghost profile-edit-btn" data-id="${id}">Edit</button>`);
      }
      if (window.RLEPermissions.canUnlockUsers(currentUser) && String(member.status).toLowerCase() === 'locked') {
        actions.push(`<button type="button" class="ghost profile-unlock-btn" data-id="${id}">Unlock</button>`);
      }
      if (window.RLEPermissions.canEnableUsers(currentUser) && String(member.status).toLowerCase() === 'disabled') {
        actions.push(`<button type="button" class="ghost profile-enable-btn" data-id="${id}">Enable</button>`);
      }
      if (window.RLEPermissions.canDeleteUsers(currentUser) && String(member.status).toLowerCase() !== 'disabled') {
        actions.push(`<button type="button" class="ghost danger profile-disable-btn" data-id="${id}">Disable</button>`);
      }
      return `<tr>
        <td>${escapeHtml(member.name || '—')}</td>
        <td>${escapeHtml(member.username || '—')}</td>
        <td>${escapeHtml(member.role || '—')}</td>
        <td>${escapeHtml(memberStatusLabel(member))}</td>
        <td class="col-actions">${actions.join(' ') || '—'}</td>
      </tr>`;
    }).join('');
  }

  async function loadPermissionCards() {
    const result = await window.apiBridge.members.getPermissionCards();
    if (result.ok && result.data && Array.isArray(result.data.cards)) {
      permissionCards = result.data.cards;
    }
  }

  async function loadMembers() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';
    const result = await window.apiBridge.members.list();
    if (!result.ok) {
      tableBody.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(result.error || 'Failed to load members.')}</td></tr>`;
      return;
    }
    membersCache = (result.data && result.data.members) || [];
    renderTable();
  }

  async function saveMember(event) {
    event.preventDefault();
    const id = document.querySelector('#profile-edit-id').value;
    const password = document.querySelector('#profile-edit-password').value;
    const payload = {
      name: document.querySelector('#profile-edit-name').value.trim(),
      username: document.querySelector('#profile-edit-username').value.trim(),
      role: document.querySelector('#profile-edit-role').value
    };
    if (id) payload.id = Number(id);
    if (!payload.name || !payload.username) {
      setEditStatus('Name and username are required.', 'error');
      return;
    }
    if (!id && !String(password || '').trim()) {
      setEditStatus('Password is required for new users (min 8 chars, upper, lower, digit, special).', 'error');
      return;
    }
    if (String(password || '').trim()) {
      payload.password = password;
    }

    if (window.RLEPermissions.canAddUsers(currentUser)) {
      const cardsWrap = document.querySelector('#profile-edit-cards-wrap');
      if (cardsWrap && !cardsWrap.hidden && !selectedCardKeys.length) {
        setEditStatus('Select at least one permission card.', 'error');
        return;
      }
      payload.featureOverrides = { allow: selectedCardKeys.slice(), deny: [] };
    }

    setEditStatus('Saving…');
    const result = await window.apiBridge.members.save(payload);
    if (!result.ok) {
      setEditStatus(result.error || 'Save failed.', 'error');
      return;
    }
    setEditStatus('Saved.', 'success');
    closeEditModal();
    loadMembers();
  }

  async function disableMember(memberId, verifyToken) {
    const result = await window.apiBridge.members.remove({ memberId, verifyToken });
    if (!result.ok) {
      window.DashboardNotify && window.DashboardNotify(result.error || 'Disable failed.', 'error');
      return;
    }
    window.DashboardNotify && window.DashboardNotify('User disabled.', 'success');
    loadMembers();
  }

  window.ProfilesModule = {
    async init(user) {
      currentUser = user;
      if (window.RLEPermissions.isFactoryUser(user)) return;
      if (!window.RLEPermissions.canManageProfiles(user)
        && !window.RLEPermissions.canAddUsers(user)
        && !window.RLEPermissions.canDeleteUsers(user)) {
        return;
      }
      await loadPermissionCards();
      await loadMembers();
    },
    refresh: loadMembers
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (!window.RLEPermissions.canAddUsers(currentUser)) return;
      openEditModal(null);
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', loadMembers);

  if (editForm) editForm.addEventListener('submit', saveMember);
  document.querySelector('#profile-edit-close-btn')?.addEventListener('click', closeEditModal);
  document.querySelector('#profile-edit-cancel-btn')?.addEventListener('click', closeEditModal);

  if (tableBody) {
    tableBody.addEventListener('click', async (event) => {
      const editBtn = event.target.closest('.profile-edit-btn');
      if (editBtn) {
        const member = membersCache.find((m) => String(m.id) === editBtn.dataset.id);
        if (member) openEditModal(member);
        return;
      }
      const unlockBtn = event.target.closest('.profile-unlock-btn');
      if (unlockBtn) {
        const result = await window.apiBridge.members.unlock(Number(unlockBtn.dataset.id));
        window.DashboardNotify && window.DashboardNotify(
          window.apiBridge.messageFromResult(result, 'User unlocked.'),
          result.ok ? 'success' : 'error'
        );
        if (result.ok) loadMembers();
        return;
      }
      const enableBtn = event.target.closest('.profile-enable-btn');
      if (enableBtn) {
        const result = await window.apiBridge.members.enable(Number(enableBtn.dataset.id));
        window.DashboardNotify && window.DashboardNotify(
          window.apiBridge.messageFromResult(result, 'User enabled.'),
          result.ok ? 'success' : 'error'
        );
        if (result.ok) loadMembers();
        return;
      }
      const disableBtn = event.target.closest('.profile-disable-btn');
      if (disableBtn) openApprovalModal(Number(disableBtn.dataset.id));
    });
  }

  if (approvalForm) {
    approvalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = document.querySelector('#approval-verify-username').value.trim();
      const password = document.querySelector('#approval-verify-password').value;
      setApprovalStatus('Verifying…');
      const verify = await window.apiBridge.members.verifyApproval({
        method: 'credentials',
        purpose: 'user_admin',
        username,
        password
      });
      if (!verify.ok || !verify.data || !verify.data.token) {
        setApprovalStatus(verify.error || 'Verification failed.', 'error');
        return;
      }
      closeApprovalModal();
      await disableMember(pendingDeleteId, verify.data.token);
    });
  }

  document.querySelector('#approval-verify-cancel-btn')?.addEventListener('click', closeApprovalModal);
})();
