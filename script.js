/**
 * ============================================================================
 * Calculator Menu Display - Interactive GUI Engine
 * Based on 'Calculator display menu.docx'
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const HISTORY_STORAGE_KEY = 'calc_menu_history_encrypted_v1';
  const HISTORY_LEGACY_OWNER_KEY = 'calc_menu_history_legacy_owner_v1';
  const HISTORY_LAST_USER_KEY = 'calc_menu_history_last_user_v1';
  const HISTORY_KDF_ITERATIONS = 600000;
  const SUPABASE_HISTORY_TABLE = 'calculator_history_entries';
  const SUPABASE_VAULT_TABLE = 'calculator_history_vaults';

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const state = {
    currentChoice: 1,
    operandA: null,
    operandB: null,
    iterationCount: 0,
    isExited: false,
    soundEnabled: true,
    theme: localStorage.getItem('calc_menu_theme') || 'dark',
    history: [],
    historyKey: null,
    historySalt: null,
    historyGeneration: null,
    historySaveQueue: Promise.resolve(),
    historySyncQueue: Promise.resolve(),
    syncedEntryIds: new Set(),
    cloudUser: null,
    cloudVault: null,
    cloudVaultError: null
  };

  // ==========================================
  // SOUND MANAGER (Web Audio API Synthesizer)
  // ==========================================
  class SoundEngine {
    constructor() {
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    }

    playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.04) {
      if (!state.soundEnabled) return;
      try {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Fallback gracefully if audio context is blocked
      }
    }

    click() { this.playTone(580, 'triangle', 0.04, 0.03); }
    calculate() { this.playTone(780, 'sine', 0.1, 0.05); }
    exit() { this.playTone(320, 'sawtooth', 0.2, 0.05); }
  }

  const sound = new SoundEngine();

  // ==========================================
  // DOM REFERENCES
  // ==========================================
  const themeToggle = document.getElementById('themeToggle');
  const soundToggle = document.getElementById('soundToggle');
  const sunIcon = themeToggle.querySelector('.sun-icon');
  const moonIcon = themeToggle.querySelector('.moon-icon');

  const menuButtons = document.querySelectorAll('.menu-option-btn, .advanced-function-btn');
  const inputA = document.getElementById('inputA');
  const inputB = document.getElementById('inputB');
  const inputBGroup = document.getElementById('inputBGroup');
  const inputStepHeading = document.querySelector('#operandsContainer .card-header h2');
  const swapBtn = document.getElementById('swapBtn');
  const operandsContainer = document.getElementById('operandsContainer');
  const exitStateCard = document.getElementById('exitStateCard');
  const restartGuiBtn = document.getElementById('restartGuiBtn');
  const calculateBtn = document.getElementById('calculateBtn');
  const clearBtn = document.getElementById('clearBtn');
  const stepButtons = document.querySelectorAll('.step-btn');

  const equationDisplay = document.getElementById('equationDisplay');
  const primaryResultDisplay = document.getElementById('primaryResultDisplay');
  const choiceDisplay = document.getElementById('choiceDisplay');
  const currentOpSymbol = document.getElementById('currentOpSymbol');
  const iterationBadge = document.getElementById('iterationBadge');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const exportHistoryBtn = document.getElementById('exportHistoryBtn');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const historyLockBtn = document.getElementById('historyLockBtn');
  const historyLockStatus = document.getElementById('historyLockStatus');
  const historyUnlockDialog = document.getElementById('historyUnlockDialog');
  const historyUnlockForm = document.getElementById('historyUnlockForm');
  const historyUnlockTitle = document.getElementById('historyUnlockTitle');
  const historyUnlockDescription = document.getElementById('historyUnlockDescription');
  const historyUnlockError = document.getElementById('historyUnlockError');
  const historyUnlockSubmit = document.getElementById('historyUnlockSubmit');
  const historyPassphrase = document.getElementById('historyPassphrase');
  const historyConfirmGroup = document.getElementById('historyConfirmGroup');
  const historyPassphraseConfirm = document.getElementById('historyPassphraseConfirm');
  const skipHistoryUnlock = document.getElementById('skipHistoryUnlock');
  const historySyncBtn = document.getElementById('historySyncBtn');
  const historyDialogSyncBtn = document.getElementById('historyDialogSyncBtn');
  const historySyncStatus = document.getElementById('historySyncStatus');
  const supabaseConfig = window.CALCULATOR_SUPABASE_CONFIG;
  const supabaseClient = window.supabase?.createClient &&
    supabaseConfig?.url &&
    supabaseConfig?.publishableKey
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
    : null;

  function getHistoryStorageKey() {
    const userId = state.cloudUser?.id || localStorage.getItem(HISTORY_LAST_USER_KEY);
    return userId ? `${HISTORY_STORAGE_KEY}_${userId}` : HISTORY_STORAGE_KEY;
  }

  function associateLegacyHistoryWithUser(userId) {
    localStorage.setItem(HISTORY_LAST_USER_KEY, userId);
    const accountStorageKey = `${HISTORY_STORAGE_KEY}_${userId}`;
    if (localStorage.getItem(accountStorageKey) !== null) return;

    const legacyOwner = localStorage.getItem(HISTORY_LEGACY_OWNER_KEY);
    const legacyHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!legacyHistory || (legacyOwner && legacyOwner !== userId)) return;

    localStorage.setItem(HISTORY_LEGACY_OWNER_KEY, userId);
    localStorage.setItem(accountStorageKey, legacyHistory);
  }

  // ==========================================
  // THEME MANAGEMENT
  // ==========================================
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('calc_menu_theme', theme);
    if (theme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    }
  }

  applyTheme(state.theme);

  themeToggle.addEventListener('click', () => {
    sound.click();
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  soundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    const soundOn = soundToggle.querySelector('.sound-on');
    const soundOff = soundToggle.querySelector('.sound-off');
    if (state.soundEnabled) {
      soundOn.classList.remove('hidden');
      soundOff.classList.add('hidden');
      sound.click();
    } else {
      soundOn.classList.add('hidden');
      soundOff.classList.remove('hidden');
    }
  });

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  // ==========================================
  // CALCULATOR LOGIC (Classic Menu Specification)
  // ==========================================
  const OPERATION_NAMES = {
    1: '1. Addition',
    2: '2. Subtraction',
    3: '3. Division',
    4: '4. Multiplication',
    5: 'sin',
    6: 'cos',
    7: 'tan',
    8: 'sin^-1',
    9: 'cos^-1',
    10: 'tan^-1',
    11: 'log10',
    12: 'loge',
    13: '5. Exit'
  };

  const OPERATION_SYMBOLS = {
    1: '+',
    2: '-',
    3: '/',
    4: '*',
    5: 'sin',
    6: 'cos',
    7: 'tan',
    8: 'sin^-1',
    9: 'cos^-1',
    10: 'tan^-1',
    11: 'log10',
    12: 'loge'
  };

  // Standard C float format specifier: %f (6 decimal places)
  function formatFloat(num) {
    if (isNaN(num)) return 'nan';
    if (!isFinite(num)) return num > 0 ? 'inf' : '-inf';
    return Number(num).toFixed(6);
  }

  function getExpression(choice, a, b) {
    const symbol = OPERATION_SYMBOLS[choice];
    return choice >= 5 && choice <= 12
      ? `${symbol}(${a})`
      : `${a} ${symbol} ${b}`;
  }

  function executeCalculator(recordHistory = true) {
    if (state.isExited) return;

    const choice = state.currentChoice;
    const isSingleInputChoice = choice >= 5 && choice <= 12;
    const hasA = inputA.value.trim() !== '';
    const hasB = isSingleInputChoice || inputB.value.trim() !== '';
    if (!hasA || !hasB) {
      equationDisplay.textContent = isSingleInputChoice
        ? `Enter a value for ${OPERATION_SYMBOLS[choice]}`
        : 'Enter values to calculate';
      primaryResultDisplay.innerHTML = '<span class="result-prefix">result=</span><span class="result-val"></span>';
      choiceDisplay.textContent = OPERATION_NAMES[choice];
      return false;
    }

    const a = Number(inputA.value);
    const b = isSingleInputChoice ? 0 : Number(inputB.value);
    let validationMessage = '';
    if (choice === 3 && b === 0) {
      validationMessage = 'Cannot divide by zero';
    } else if ((choice === 8 || choice === 9) && (a < -1 || a > 1)) {
      validationMessage = `${OPERATION_NAMES[choice]} requires a value from -1 to 1`;
    } else if ((choice === 11 || choice === 12) && a <= 0) {
      validationMessage = `${OPERATION_NAMES[choice]} requires a value greater than 0`;
    }

    if (validationMessage) {
      equationDisplay.textContent = validationMessage;
      primaryResultDisplay.innerHTML = '<span class="result-prefix">result=</span><span class="result-val"></span>';
      choiceDisplay.textContent = OPERATION_NAMES[choice];
      return false;
    }

    state.operandA = a;
    state.operandB = b;

    let result = 0;
    const symbol = OPERATION_SYMBOLS[choice];

    switch (choice) {
      case 1:
        result = a + b;
        break;
      case 2:
        result = a - b;
        break;
      case 3:
        result = a / b;
        break;
      case 4:
        result = a * b;
        break;
      case 5:
        result = Math.sin(a);
        break;
      case 6:
        result = Math.cos(a);
        break;
      case 7:
        result = Math.tan(a);
        break;
      case 8:
        result = Math.asin(a);
        break;
      case 9:
        result = Math.acos(a);
        break;
      case 10:
        result = Math.atan(a);
        break;
      case 11:
        result = Math.log10(a);
        break;
      case 12:
        result = Math.log(a);
        break;
    }

    const formatted = formatFloat(result);
    const equationText = getExpression(choice, a, b);

    // Update Output Display matching: printf("result=%f\n", result);
    currentOpSymbol.textContent = symbol;
    equationDisplay.textContent = equationText;
    choiceDisplay.textContent = OPERATION_NAMES[choice];
    primaryResultDisplay.innerHTML = `<span class="result-prefix">result=</span><span class="result-val">${formatted}</span>`;

    if (recordHistory) {
      state.iterationCount++;
      sound.calculate();
      addHistoryItem(choice, a, b, symbol, formatted);
    }
    return true;
  }

  function updateStatusPills() {
    const count = state.iterationCount;
    const label = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    iterationBadge.textContent = label;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function deriveHistoryKey(passphrase, salt) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: HISTORY_KDF_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptHistory(history, key, salt, generation) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(history))
    );
    return JSON.stringify({
      version: 1,
      kdf: 'PBKDF2-SHA-256',
      iterations: HISTORY_KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      generation,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    });
  }

  async function decryptHistory(record, key) {
    if (
      record.version !== 1 ||
      record.kdf !== 'PBKDF2-SHA-256' ||
      record.iterations !== HISTORY_KDF_ITERATIONS
    ) {
      throw new Error('The saved history uses an unsupported format.');
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext)
    );
    return validateHistory(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  function createEntryId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function encryptCloudEntry(entry, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(entry))
    );
    return {
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  async function decryptCloudEntry(record, key) {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext)
    );
    const entry = JSON.parse(new TextDecoder().decode(plaintext));
    validateHistory([entry]);
    return entry;
  }

  function validateHistory(history) {
    if (!Array.isArray(history) || history.some(entry =>
      !entry ||
      !Number.isInteger(entry.id) ||
      typeof entry.opName !== 'string' ||
      typeof entry.expression !== 'string' ||
      typeof entry.resultStr !== 'string' ||
      typeof entry.time !== 'string'
    )) {
      throw new Error('The saved history has an invalid format.');
    }
    history.forEach(entry => {
      if (typeof entry.entryId !== 'string') entry.entryId = createEntryId();
      if (!Number.isFinite(entry.createdAt)) entry.createdAt = 0;
    });
    return history;
  }

  function mergeHistory(...histories) {
    const entries = new Map();
    histories.flat().forEach(entry => {
      if (!entries.has(entry.entryId)) entries.set(entry.entryId, entry);
    });
    return [...entries.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  function updateSyncStatus(message) {
    if (!supabaseClient) {
      historySyncBtn.textContent = 'Sync setup required';
      historySyncBtn.disabled = true;
      historyDialogSyncBtn.textContent = 'Sync setup required';
      historyDialogSyncBtn.disabled = true;
      historySyncStatus.textContent = 'Create a Supabase project; see SUPABASE_SETUP.md.';
      return;
    }

    historySyncBtn.disabled = false;
    historyDialogSyncBtn.disabled = false;
    historySyncBtn.textContent = state.cloudUser ? 'Sign out' : 'Sync with GitHub';
    historyDialogSyncBtn.textContent = state.cloudUser ? 'Sign out' : 'Sync with GitHub';
    historySyncStatus.textContent = message || (state.cloudUser
      ? `Signed in as ${state.cloudUser.user_metadata?.user_name || state.cloudUser.email || 'GitHub user'}.`
      : 'Not signed in; history stays on this device.');
  }

  function updateHistoryLockStatus(message) {
    const isUnlocked = state.historyKey !== null;
    historyLockBtn.textContent = isUnlocked ? 'Lock' : 'Unlock';
    historyLockBtn.setAttribute(
      'aria-label',
      isUnlocked ? 'Lock encrypted calculation history' : 'Unlock encrypted calculation history'
    );
    historyLockStatus.textContent = message || (isUnlocked
      ? state.cloudUser
        ? 'Unlocked; history syncs when online.'
        : 'Unlocked; saved encrypted on this device.'
      : 'Locked; unlock to view saved history.');
  }

  async function loadCloudVault() {
    state.cloudVault = null;
    state.cloudVaultError = null;
    state.syncedEntryIds.clear();
    if (!supabaseClient || !state.cloudUser) return null;
    const userId = state.cloudUser.id;

    try {
      const { data, error } = await supabaseClient
        .from(SUPABASE_VAULT_TABLE)
        .select('salt, generation, format_version, kdf_iterations')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (state.cloudUser?.id !== userId) return null;
      if (data) {
        if (data.format_version !== 1 || data.kdf_iterations !== HISTORY_KDF_ITERATIONS) {
          throw new Error('The synced history uses an unsupported encryption format.');
        }
        if (typeof data.generation !== 'string') {
          throw new Error('The synced history is missing its generation marker.');
        }
        state.cloudVault = data;
      }
      return data;
    } catch (error) {
      if (state.cloudUser?.id !== userId) return null;
      state.cloudVaultError = error;
      throw error;
    }
  }

  async function ensureCloudVault(userId, salt, generation) {
    if (!supabaseClient || !state.cloudUser || state.cloudUser.id !== userId) return;
    if (!state.cloudVault) {
      const { data, error } = await supabaseClient
        .from(SUPABASE_VAULT_TABLE)
        .insert({
          user_id: userId,
          salt: bytesToBase64(salt),
          generation,
          format_version: 1,
          kdf_iterations: HISTORY_KDF_ITERATIONS
        })
        .select('salt, generation, format_version, kdf_iterations')
        .single();

      if (error && error.code !== '23505') throw error;
      if (error) {
        await loadCloudVault();
      } else {
        if (state.cloudUser?.id !== userId) return;
        state.cloudVault = data;
      }
    }

    if (
      state.cloudVault.salt !== bytesToBase64(salt) ||
      state.cloudVault.generation !== generation
    ) {
      throw new Error('This account already has an encrypted history vault. Reload the page and unlock with its passphrase to sync.');
    }
  }

  async function loadCloudHistory(key, userId = state.cloudUser?.id) {
    if (!supabaseClient || !userId || !state.cloudVault) return [];

    const generation = state.cloudVault.generation;
    const entries = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseClient
        .from(SUPABASE_HISTORY_TABLE)
        .select('entry_id, encrypted_entry')
        .eq('user_id', userId)
        .eq('generation', generation)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (state.cloudUser?.id !== userId || state.cloudVault?.generation !== generation) {
        throw new Error('The active sync account changed while history was loading.');
      }
      entries.push(...data);
      if (data.length < pageSize) break;
    }

    const decrypted = await Promise.all(entries.map(async row => {
      const entry = await decryptCloudEntry(row.encrypted_entry, key);
      if (entry.entryId !== row.entry_id) {
        throw new Error('A synced history entry failed its integrity check.');
      }
      return entry;
    }));
    if (state.cloudUser?.id !== userId || state.cloudVault?.generation !== generation) {
      throw new Error('The active sync account changed while history was decrypting.');
    }
    state.syncedEntryIds = new Set(entries.map(entry => entry.entry_id));
    return decrypted;
  }

  async function handleCloudSession(session) {
    const nextUser = session?.user ?? null;
    if (state.cloudUser?.id === nextUser?.id) return;

    const previousUserId = state.cloudUser?.id;
    if (previousUserId && previousUserId !== nextUser?.id) {
      await state.historySaveQueue;
      state.historyKey = null;
      state.historySalt = null;
      state.historyGeneration = null;
      state.history = [];
      state.iterationCount = 0;
      renderHistory();
    }

    state.cloudUser = nextUser;
    state.cloudVault = null;
    state.cloudVaultError = null;
    state.syncedEntryIds.clear();
    if (nextUser) associateLegacyHistoryWithUser(nextUser.id);
    updateSyncStatus();
    if (!nextUser) {
      updateHistoryLockStatus();
      if (previousUserId) openHistoryDialog();
      return;
    }

    try {
      await loadCloudVault();
      updateSyncStatus();
      if (!state.historyKey) {
        openHistoryDialog();
        return;
      }
      if (
        state.cloudVault &&
        (
          state.cloudVault.salt !== bytesToBase64(state.historySalt) ||
          state.cloudVault.generation !== state.historyGeneration
        )
      ) {
        updateSyncStatus('Cloud vault found. Lock history, then unlock using its passphrase to sync.');
        return;
      }

      const remoteHistory = await loadCloudHistory(state.historyKey, nextUser.id);
      state.history = mergeHistory(state.history, remoteHistory);
      renumberHistory();
      saveEncryptedHistory();
    } catch (error) {
      updateSyncStatus(`Sync unavailable: ${error.message || 'Check Supabase setup.'}`);
    }
  }

  async function initializeHistorySync() {
    if (!supabaseClient) {
      updateSyncStatus();
      updateHistoryLockStatus('Locked; unlock to view saved history.');
      openHistoryDialog();
      return;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      updateSyncStatus(`Could not restore sign-in: ${error.message}`);
    } else {
      state.cloudUser = data.session?.user ?? null;
      if (state.cloudUser) {
        associateLegacyHistoryWithUser(state.cloudUser.id);
        try {
          await loadCloudVault();
        } catch (vaultError) {
          updateSyncStatus(`Could not load synced vault: ${vaultError.message}`);
        }
      }
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        handleCloudSession(session).catch(error => {
          updateSyncStatus(`Sync unavailable: ${error.message || 'Check Supabase setup.'}`);
        });
      }, 0);
    });

    updateSyncStatus();
    updateHistoryLockStatus();
    openHistoryDialog();
  }

  async function syncHistoryToCloud(history, key, salt, generation) {
    if (!supabaseClient || !state.cloudUser) return;
    const userId = state.cloudUser.id;
    state.historySyncQueue = state.historySyncQueue.then(async () => {
      if (state.cloudUser?.id !== userId || state.historyKey !== key) return;
      if (state.cloudUser?.id !== userId) return;
      await ensureCloudVault(userId, salt, generation);
      if (state.cloudUser?.id !== userId) return;
      const unsynced = history.filter(entry => !state.syncedEntryIds.has(entry.entryId));
      if (unsynced.length === 0) {
        updateSyncStatus();
        return;
      }

      const rows = await Promise.all(unsynced.map(async entry => ({
        user_id: userId,
        generation,
        entry_id: entry.entryId,
        encrypted_entry: await encryptCloudEntry(entry, key)
      })));
      const { error } = await supabaseClient
        .from(SUPABASE_HISTORY_TABLE)
        .upsert(rows, { onConflict: 'user_id,generation,entry_id', ignoreDuplicates: true });
      if (error) throw error;
      if (state.cloudUser?.id !== userId) return [];
      unsynced.forEach(entry => state.syncedEntryIds.add(entry.entryId));
      updateSyncStatus('History synced securely.');
    }).catch(error => {
      updateSyncStatus(`Sync failed: ${error.message || 'Check your connection and Supabase setup.'}`);
      historyLockStatus.textContent = 'Local encrypted history is saved; cloud sync failed.';
    });
    await state.historySyncQueue;
  }

  function renderHistory() {
    historyList.replaceChildren();
    state.history.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      if (entry.opName === OPERATION_NAMES[13]) item.classList.add('exit-item');

      const tag = document.createElement('span');
      tag.className = 'iter-tag';
      tag.textContent = `#${entry.id}`;

      const calculation = document.createElement('span');
      calculation.className = 'iter-calc';
      calculation.textContent = entry.expression;

      const result = document.createElement('span');
      result.className = 'iter-res';
      result.textContent = entry.resultStr;
      if (entry.opName === OPERATION_NAMES[13]) {
        result.style.color = 'var(--accent-rose)';
      }

      item.append(tag, calculation, result);
      historyList.append(item);
    });
    updateStatusPills();
  }

  function hasSavedHistory() {
    return localStorage.getItem(getHistoryStorageKey()) !== null || state.cloudVault !== null;
  }

  function configureHistoryDialog(isExistingHistory) {
    historyUnlockTitle.textContent = isExistingHistory
      ? 'Unlock Calculation History'
      : 'Set a History Passphrase';
    historyUnlockDescription.textContent = isExistingHistory
      ? `Enter the history passphrase${state.cloudVault ? ' used on your other devices' : ' created for this browser'}. Your passphrase is never stored. If you forget it, the saved history cannot be recovered. Anyone using this page while it is unlocked can view the history.`
      : 'Create a passphrase of at least 12 characters. Use the same one on each device. History is encrypted in this browser and cannot be recovered if you forget the passphrase. Anyone using this page while it is unlocked can view the history.';
    historyConfirmGroup.classList.toggle('hidden', isExistingHistory);
    historyPassphraseConfirm.required = !isExistingHistory;
    historyPassphraseConfirm.value = '';
    historyPassphrase.value = '';
    historyUnlockError.textContent = '';
    historyUnlockSubmit.textContent = isExistingHistory ? 'Unlock' : 'Set passphrase';
    historyUnlockSubmit.disabled = !crypto.subtle || state.cloudVaultError !== null;
    if (!crypto.subtle) {
      historyUnlockError.textContent = 'Browser encryption is unavailable. Open this page in a modern browser over HTTPS or localhost.';
    } else if (state.cloudVaultError) {
      historyUnlockError.textContent = 'Could not check this account’s synced vault. Check the connection and reload before unlocking.';
    }
  }

  function openHistoryDialog() {
    try {
      configureHistoryDialog(hasSavedHistory());
    } catch (error) {
      configureHistoryDialog(false);
      historyUnlockSubmit.disabled = true;
      historyUnlockError.textContent = 'Browser storage is unavailable, so encrypted history cannot be accessed.';
    }
    if (!historyUnlockDialog.open) historyUnlockDialog.showModal();
    historyPassphrase.focus();
  }

  function renumberHistory() {
    state.history.forEach((entry, index) => {
      entry.id = state.history.length - index;
    });
    state.iterationCount = state.history.length;
    renderHistory();
  }

  function saveEncryptedHistory(syncCloud = true) {
    if (!state.historyKey) return;

    const key = state.historyKey;
    const salt = state.historySalt;
    const generation = state.historyGeneration;
    const storageKey = getHistoryStorageKey();
    const shouldSync = syncCloud && state.cloudUser !== null;
    const snapshot = JSON.stringify(state.history);
    state.historySaveQueue = state.historySaveQueue.then(async () => {
      const encryptedRecord = await encryptHistory(JSON.parse(snapshot), key, salt, generation);
      localStorage.setItem(storageKey, encryptedRecord);
      if (shouldSync) {
        await syncHistoryToCloud(JSON.parse(snapshot), key, salt, generation);
      }
    }).catch(() => {
      updateHistoryLockStatus('Save failed; encrypted history may be out of date.');
      showToast('Could not save encrypted history. Check browser storage and try again.');
    });
  }

  function addHistoryItem(choice, a, b, symbol, formatted) {
    const historyEntry = {
      id: state.iterationCount,
      choice,
      opName: OPERATION_NAMES[choice],
      a,
      b,
      symbol,
      entryId: createEntryId(),
      createdAt: Date.now(),
      expression: getExpression(choice, a, b),
      resultStr: `result=${formatted}`,
      time: new Date().toLocaleTimeString()
    };
    state.history.unshift(historyEntry);
    renderHistory();
    saveEncryptedHistory();
  }

  function updateInputVisibility(choice) {
    const isSingleInputChoice = choice >= 5 && choice <= 12;
    if (inputBGroup) {
      inputBGroup.classList.toggle('hidden', isSingleInputChoice);
    }
    if (swapBtn) {
      swapBtn.classList.toggle('hidden', isSingleInputChoice);
    }
    if (inputStepHeading) {
      inputStepHeading.textContent = isSingleInputChoice
        ? 'Enter a Value'
        : 'Enter Values of a and b';
    }
    const opIndicator = document.getElementById('currentOpSymbol');
    if (opIndicator) {
      opIndicator.classList.toggle('hidden', isSingleInputChoice);
      if (!isSingleInputChoice) {
        opIndicator.textContent = OPERATION_SYMBOLS[choice] || '+';
      }
    }
  }

  function handleChoiceSelection(choice) {
    state.currentChoice = choice;

    menuButtons.forEach(btn => {
      const btnChoice = parseInt(btn.getAttribute('data-choice'));
      const isActive = btnChoice === choice;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    updateInputVisibility(choice);

    if (choice === 13) {
      state.isExited = true;
      sound.exit();
      operandsContainer.classList.add('hidden');
      exitStateCard.classList.remove('hidden');

      equationDisplay.textContent = 'Session Terminated';
      primaryResultDisplay.innerHTML = `<span class="result-prefix" style="color: var(--accent-rose)">Exiting display</span>`;
      choiceDisplay.textContent = OPERATION_NAMES[choice];

      const exitEntry = {
        id: ++state.iterationCount,
        opName: OPERATION_NAMES[choice],
        entryId: createEntryId(),
        createdAt: Date.now(),
        expression: 'Option 5 (Exit)',
        resultStr: 'Exiting display',
        time: new Date().toLocaleTimeString()
      };
      state.history.unshift(exitEntry);
      renderHistory();
      saveEncryptedHistory();
    } else {
      state.isExited = false;
      operandsContainer.classList.remove('hidden');
      exitStateCard.classList.add('hidden');
      sound.click();
      executeCalculator(false);
      operandsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Choice button listeners
  menuButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const choice = parseInt(btn.getAttribute('data-choice'));
      handleChoiceSelection(choice);
    });
  });

  // Step increment/decrement buttons (+1 / -1)
  stepButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sound.click();
      const targetInput = document.getElementById(btn.getAttribute('data-input'));
      const stepVal = parseFloat(btn.getAttribute('data-step'));
      const cur = targetInput.value.trim() === '' ? 0 : parseFloat(targetInput.value);
      targetInput.value = (cur + stepVal).toString();
      executeCalculator();
    });
  });

  // Swap A and B button
  swapBtn.addEventListener('click', () => {
    sound.click();
    const temp = inputA.value;
    inputA.value = inputB.value;
    inputB.value = temp;
    executeCalculator();
  });

  // Calculate button
  calculateBtn.addEventListener('click', () => {
    executeCalculator();
    document.getElementById('equationDisplay').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Clear / Reset button
  clearBtn.addEventListener('click', () => {
    sound.click();
    inputA.value = '';
    inputB.value = '';
    executeCalculator();
  });

  // Restart GUI session
  restartGuiBtn.addEventListener('click', () => {
    sound.click();
    state.isExited = false;
    state.operandA = null;
    state.operandB = null;
    inputA.value = '';
    inputB.value = '';
    handleChoiceSelection(1);
  });

  // Copy Result Button
  copyResultBtn.addEventListener('click', () => {
    sound.click();
    const resultValue = primaryResultDisplay.querySelector('.result-val');
    if (!resultValue || resultValue.textContent.trim() === '') {
      showToast('Calculate a result before copying.');
      return;
    }

    const textToCopy = primaryResultDisplay.innerText.trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Copied result to clipboard!');
    }).catch(() => {
      showToast('Could not copy the result.');
    });
  });

  // Clear history
  clearHistoryBtn.addEventListener('click', async () => {
    sound.click();
    if (!state.historyKey || !state.historySalt || !state.historyGeneration) {
      showToast('Unlock history before clearing saved entries.');
      return;
    }

    clearHistoryBtn.disabled = true;
    try {
      await Promise.all([state.historySaveQueue, state.historySyncQueue]);
      if (state.cloudUser) {
        const userId = state.cloudUser.id;
        const { data: generation, error } = await supabaseClient.rpc('clear_calculator_history');
        if (error) {
          updateSyncStatus(`Could not clear synced history: ${error.message}`);
          showToast('Cloud history was not cleared. Check your connection and try again.');
          return;
        }
        if (state.cloudUser?.id !== userId) {
          showToast('Account changed before history could be cleared.');
          return;
        }
        state.cloudVault.generation = generation;
        state.historyGeneration = generation;
        state.syncedEntryIds.clear();
      }

      state.history = [];
      state.iterationCount = 0;
      renderHistory();
      saveEncryptedHistory(false);
      updateSyncStatus(state.cloudUser
        ? 'Synced history cleared on all devices.'
        : 'Local history cleared; cloud history was not changed.');
    } catch (error) {
      updateSyncStatus(`Could not clear history: ${error.message || 'Check your connection and try again.'}`);
      showToast('History was not cleared. Check your connection and try again.');
    } finally {
      clearHistoryBtn.disabled = false;
    }
  });

  // Export history
  exportHistoryBtn.addEventListener('click', () => {
    sound.click();
    if (state.history.length === 0) {
      showToast('No history entries to export.');
      return;
    }
    const logLines = state.history.map(item =>
      `[${item.time}] #${item.id} | ${item.opName} | ${item.expression} -> ${item.resultStr}`
    ).join('\n');

    const blob = new Blob([`Calculator Menu Display - Execution Log\n==========================================\n\n${logLines}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calculator_history_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a);
    showToast('Execution log downloaded!');
  });

  historyLockBtn.addEventListener('click', async () => {
    sound.click();
    if (state.historyKey) {
      historyLockBtn.disabled = true;
      await state.historySaveQueue;
      state.historyKey = null;
      state.historySalt = null;
      state.historyGeneration = null;
      state.history = [];
      state.iterationCount = 0;
      renderHistory();
      updateHistoryLockStatus();
      historyLockBtn.disabled = false;
      return;
    }
    openHistoryDialog();
  });

  async function toggleCloudSync() {
    sound.click();
    if (!supabaseClient) {
      showToast('Configure Supabase first; see SUPABASE_SETUP.md.');
      return;
    }
    historySyncBtn.disabled = true;
    historyDialogSyncBtn.disabled = true;
    try {
      if (state.cloudUser) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        await handleCloudSession(null);
      } else {
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: `${window.location.origin}${window.location.pathname}`
          }
        });
        if (error) throw error;
      }
    } catch (error) {
      updateSyncStatus(`GitHub sign-in failed: ${error.message || 'Check Supabase auth settings.'}`);
      historySyncBtn.disabled = false;
      historyDialogSyncBtn.disabled = false;
    }
  }

  historySyncBtn.addEventListener('click', toggleCloudSync);
  historyDialogSyncBtn.addEventListener('click', toggleCloudSync);

  historyUnlockForm.addEventListener('submit', async event => {
    event.preventDefault();
    historyUnlockSubmit.disabled = true;
    historyUnlockError.textContent = '';

    try {
      const passphrase = historyPassphrase.value;
      const storedValue = localStorage.getItem(getHistoryStorageKey());
      if (state.cloudVaultError) {
        throw new Error('Could not check this account’s cloud vault. Reload the page or sign out before unlocking.');
      }
      const localRecord = storedValue === null ? null : JSON.parse(storedValue);
      const localSalt = localRecord ? base64ToBytes(localRecord.salt) : null;
      const salt = state.cloudVault
        ? base64ToBytes(state.cloudVault.salt)
        : localSalt || crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveHistoryKey(passphrase, salt);
      let localHistory = [];
      let cloudHistory = [];

      if (localRecord) {
        const localKey = state.cloudVault && bytesToBase64(localSalt) !== state.cloudVault.salt
          ? await deriveHistoryKey(passphrase, localSalt)
          : key;
        localHistory = await decryptHistory(localRecord, localKey);
        if (
          state.cloudVault &&
          localRecord.generation &&
          localRecord.generation !== state.cloudVault.generation
        ) {
          localHistory = [];
        }
      }

      if (state.cloudVault) {
        cloudHistory = await loadCloudHistory(key);
      } else if (!localRecord) {
        if (passphrase.length < 12) {
          throw new Error('Choose a passphrase with at least 12 characters.');
        }
        if (passphrase !== historyPassphraseConfirm.value) {
          throw new Error('The passphrases do not match.');
        }
      }

      const generation = state.cloudVault?.generation ||
        localRecord?.generation ||
        createEntryId();
      const historyBeforeUnlock = state.history;
      state.historyKey = key;
      state.historySalt = salt;
      state.historyGeneration = generation;
      state.history = mergeHistory(historyBeforeUnlock, localHistory, cloudHistory);
      if (state.cloudUser && !state.cloudVault) {
        await ensureCloudVault(state.cloudUser.id, salt, generation);
      }
      if (state.cloudUser && state.cloudVault) {
        const latestCloudHistory = await loadCloudHistory(key);
        state.history = mergeHistory(state.history, latestCloudHistory);
      }
      renumberHistory();
      historyPassphrase.value = '';
      historyPassphraseConfirm.value = '';
      historyUnlockDialog.close();
      updateHistoryLockStatus();
      saveEncryptedHistory();
      updateSyncStatus();
      showToast('Encrypted history unlocked.');
    } catch (error) {
      state.historyKey = null;
      state.historySalt = null;
      state.historyGeneration = null;
      historyUnlockError.textContent = error instanceof Error
        ? error.message === 'The saved history uses an unsupported format.' ||
          error.message === 'The saved history has an invalid format.'
          ? error.message
          : error.name === 'OperationError' || error.name === 'DataError'
            ? 'Incorrect passphrase or encrypted history is damaged.'
            : error.message
        : 'Could not unlock encrypted history.';
      historyPassphrase.value = '';
      historyPassphrase.focus();
    } finally {
      historyUnlockSubmit.disabled = !crypto.subtle || state.cloudVaultError !== null;
    }
  });

  skipHistoryUnlock.addEventListener('click', () => {
    historyUnlockDialog.close();
    updateHistoryLockStatus('Locked; new entries will not be saved.');
  });

  historyUnlockDialog.addEventListener('close', () => {
    historyPassphrase.value = '';
    historyPassphraseConfirm.value = '';
  });

  // Live input changes
  inputA.addEventListener('input', () => executeCalculator(false));
  inputB.addEventListener('input', () => executeCalculator(false));

  // Keyboard navigation shortcuts
  document.addEventListener('keydown', (e) => {
    if (historyUnlockDialog.open) return;

    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (e.key === 'Enter') {
      if (activeEl && activeEl.tagName === 'BUTTON' && activeEl !== calculateBtn) return;
      e.preventDefault();
      executeCalculator();
      document.getElementById('equationDisplay').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!isTyping) {
      if (/^[1-5]$/.test(e.key)) {
        const key = parseInt(e.key, 10);
        e.preventDefault();
        handleChoiceSelection(key === 5 ? 13 : key);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        inputA.value = '';
        inputB.value = '';
        executeCalculator();
      }
    }
  });

  // Initial calculation
  updateStatusPills();
  updateInputVisibility(state.currentChoice);
  updateHistoryLockStatus('Locked; unlock to view saved history.');
  initializeHistorySync().catch(error => {
    updateSyncStatus(`Could not initialize cloud sync: ${error.message}`);
    openHistoryDialog();
  });
});
