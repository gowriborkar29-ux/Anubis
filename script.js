/**
 * ============================================================================
 * Calculator Menu Display - Interactive GUI Engine
 * Based on 'Calculator display menu.docx'
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const HISTORY_STORAGE_KEY = 'calc_menu_history_encrypted_v1';
  const HISTORY_KDF_ITERATIONS = 600000;

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
    historySaveQueue: Promise.resolve()
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

  async function encryptHistory(history, key, salt) {
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
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    });
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
    return history;
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

  function updateHistoryLockStatus(message) {
    const isUnlocked = state.historyKey !== null;
    historyLockBtn.textContent = isUnlocked ? 'Lock' : 'Unlock';
    historyLockBtn.setAttribute(
      'aria-label',
      isUnlocked ? 'Lock encrypted calculation history' : 'Unlock encrypted calculation history'
    );
    historyLockStatus.textContent = message || (isUnlocked
      ? 'Unlocked; saved encrypted on this device.'
      : 'Locked; unlock to view saved history.');
  }

  function hasSavedHistory() {
    return localStorage.getItem(HISTORY_STORAGE_KEY) !== null;
  }

  function configureHistoryDialog(isExistingHistory) {
    historyUnlockTitle.textContent = isExistingHistory
      ? 'Unlock Calculation History'
      : 'Set a History Passphrase';
    historyUnlockDescription.textContent = isExistingHistory
      ? 'Enter the passphrase you created for this browser. Your passphrase is never stored. If you forget it, the saved history cannot be recovered. Anyone using this page while it is unlocked can view the history.'
      : 'Create a passphrase of at least 12 characters. History is encrypted in this browser and cannot be recovered if you forget the passphrase. Anyone using this page while it is unlocked can view the history.';
    historyConfirmGroup.classList.toggle('hidden', isExistingHistory);
    historyPassphraseConfirm.required = !isExistingHistory;
    historyPassphraseConfirm.value = '';
    historyPassphrase.value = '';
    historyUnlockError.textContent = '';
    historyUnlockSubmit.textContent = isExistingHistory ? 'Unlock' : 'Set passphrase';
    historyUnlockSubmit.disabled = !crypto.subtle;
    if (!crypto.subtle) {
      historyUnlockError.textContent = 'Browser encryption is unavailable. Open this page in a modern browser over HTTPS or localhost.';
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
    historyUnlockDialog.showModal();
    historyPassphrase.focus();
  }

  function renumberHistory() {
    state.history.forEach((entry, index) => {
      entry.id = state.history.length - index;
    });
    state.iterationCount = state.history.length;
    renderHistory();
  }

  function saveEncryptedHistory() {
    if (!state.historyKey) return;

    const key = state.historyKey;
    const snapshot = JSON.stringify(state.history);
    state.historySaveQueue = state.historySaveQueue.then(async () => {
      const record = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));
      const salt = base64ToBytes(record.salt);
      const encryptedRecord = await encryptHistory(JSON.parse(snapshot), key, salt);
      localStorage.setItem(HISTORY_STORAGE_KEY, encryptedRecord);
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
  clearHistoryBtn.addEventListener('click', () => {
    sound.click();
    const hasPersistedHistory = state.historyKey === null && hasSavedHistory();
    state.history = [];
    state.iterationCount = 0;
    renderHistory();
    saveEncryptedHistory();
    if (hasPersistedHistory) {
      showToast('Unlock history to clear the saved entries.');
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
      const pendingSaves = state.historySaveQueue;
      state.historyKey = null;
      state.history = [];
      state.iterationCount = 0;
      renderHistory();
      updateHistoryLockStatus();
      await pendingSaves;
      return;
    }
    openHistoryDialog();
  });

  historyUnlockForm.addEventListener('submit', async event => {
    event.preventDefault();
    historyUnlockSubmit.disabled = true;
    historyUnlockError.textContent = '';

    try {
      const passphrase = historyPassphrase.value;
      const storedValue = localStorage.getItem(HISTORY_STORAGE_KEY);
      let key;
      let savedHistory = [];

      if (storedValue !== null) {
        const record = JSON.parse(storedValue);
        key = await deriveHistoryKey(passphrase, base64ToBytes(record.salt));
        savedHistory = await decryptHistory(record, key);
      } else {
        if (passphrase.length < 12) {
          throw new Error('Choose a passphrase with at least 12 characters.');
        }
        if (passphrase !== historyPassphraseConfirm.value) {
          throw new Error('The passphrases do not match.');
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        key = await deriveHistoryKey(passphrase, salt);
        const combinedHistory = state.history.slice();
        combinedHistory.forEach((entry, index) => {
          entry.id = combinedHistory.length - index;
        });
        const encryptedRecord = await encryptHistory(combinedHistory, key, salt);
        localStorage.setItem(HISTORY_STORAGE_KEY, encryptedRecord);
        savedHistory = [];
      }

      const sessionHistory = state.history;
      state.historyKey = key;
      state.history = sessionHistory.concat(savedHistory);
      renumberHistory();
      historyPassphrase.value = '';
      historyPassphraseConfirm.value = '';
      historyUnlockDialog.close();
      updateHistoryLockStatus();
      if (storedValue !== null && sessionHistory.length > 0) {
        saveEncryptedHistory();
      }
      showToast('Encrypted history unlocked.');
    } catch (error) {
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
      historyUnlockSubmit.disabled = !crypto.subtle;
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
  updateHistoryLockStatus('Locked; unlock to view or save encrypted history.');
  openHistoryDialog();
});
