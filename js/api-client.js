(() => {
  'use strict';

  class IncentifyEmsApiClient {
    constructor(url) {
      this.baseUrl = String(url || '').trim();
      this.seq = 0;
      this.maxSafeAttempts = 2;
      this.safeRetryActions = new Set([
        'health','requestOtp','verifyOtp','validateSession','logout',
        'bootstrapAdmin','bootstrapEmployee','dashboard','listEmployees',
        'listAttendance','getSettings','listAccessUsers','listHolidays',
        'listAttendanceExceptions','getMyAttendance','getMyCheckoutStatus',
        'getAttendanceLinkContext','getMyFaceRegistrationStatus','mailDiagnostics','listMailLog','listSystemRuns',
        'requestReplayStatus'
      ]);
      // V21 persists successful mutation results by requestId in REQUEST_REPLAYS.
      // Repeating the same logical request after a lost browser response returns
      // the stored result instead of duplicating the mutation.
      this.replaySafeMutationActions = new Set([
        'createEmployee','updateEmployee','deleteEmployee','sendEnrollmentLink','deleteAttendance',
        'saveSettings','exportAttendanceXlsx','createCloudBackup','checkoutMyAttendance',
        'saveHoliday','deleteHoliday','createLateConcession','resendTodayAttendanceLink',
        'submitAttendanceLinkFace','setFaceCaptureAccess','unlockFaceRegistration','lockFaceRegistration','registerMyFace','createAccessUser','setAccessStatus','deleteAccessUser','sendTestEmail'
      ]);
      this.inflightSafe = new Map();
    }

    isConfigured() {
      return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(this.baseUrl)
        && !this.baseUrl.includes('PASTE_NEW_V21_APPS_SCRIPT');
    }

    waitReady(timeout = 12000) {
      return this.call('health', {}, timeout).then(() => undefined);
    }

    _encode(value) {
      const json = JSON.stringify(value || {});
      const bytes = new TextEncoder().encode(json);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    _networkError(message, code = 'NETWORK_ERROR') {
      const error = new Error(message);
      error.code = code;
      return error;
    }

    _serverResult(result) {
      const response = result || {};
      if (response.success === false) {
        const error = new Error(response.message || response.error || 'Server request failed.');
        error.code = response.error || 'SERVER_ERROR';
        error.details = response;
        throw error;
      }
      return response;
    }

    _requestId() {
      const bytes = new Uint8Array(16);
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      return `ems21_${Date.now()}_${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`;
    }

    _callbackName(attempt) {
      const suffix = `${Date.now()}_${++this.seq}_${attempt}_${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_]/g, '');
      return `__incentify_ems_v21_cb_${suffix}`;
    }

    _jsonUrl(encoded, attempt) {
      const sep = this.baseUrl.includes('?') ? '&' : '?';
      const nonce = `${Date.now()}_${attempt}_${Math.random().toString(36).slice(2)}`;
      return `${this.baseUrl}${sep}api=1&payload=${encodeURIComponent(encoded)}&v=${encodeURIComponent(window.INCENTIFY_EMS_CONFIG.BACKEND_VERSION || '21.0.0')}&transport=json&retry=${attempt}&_=${encodeURIComponent(nonce)}`;
    }

    _jsonpUrl(callback, encoded, attempt) {
      const sep = this.baseUrl.includes('?') ? '&' : '?';
      const nonce = `${Date.now()}_${attempt}_${Math.random().toString(36).slice(2)}`;
      return `${this.baseUrl}${sep}api=1&callback=${encodeURIComponent(callback)}&payload=${encodeURIComponent(encoded)}&v=${encodeURIComponent(window.INCENTIFY_EMS_CONFIG.BACKEND_VERSION || '21.0.0')}&transport=jsonp&retry=${attempt}&_=${encodeURIComponent(nonce)}`;
    }

    async _fetchOnce(encoded, timeout, attempt) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(this._jsonUrl(encoded, attempt), {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          redirect: 'follow', referrerPolicy: 'no-referrer', signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw this._networkError(`Apps Script returned HTTP ${response.status} (fetch attempt ${attempt}).`);
        const text = await response.text();
        let parsed;
        try { parsed = JSON.parse(text); }
        catch (_) { throw this._networkError(`Apps Script returned a non-JSON response (fetch attempt ${attempt}).`); }
        return this._serverResult(parsed);
      } catch (error) {
        if (error && error.code && error.code !== 'NETWORK_ERROR' && error.code !== 'TIMEOUT') throw error;
        if (error && error.name === 'AbortError') throw this._networkError(`Apps Script fetch timed out (attempt ${attempt}).`, 'TIMEOUT');
        if (error && error.code === 'NETWORK_ERROR') throw error;
        throw this._networkError(`Temporary Apps Script fetch/CORS error (attempt ${attempt}).`);
      } finally { clearTimeout(timer); }
    }

    _jsonpOnce(encoded, timeout, attempt) {
      return new Promise((resolve, reject) => {
        let done = false;
        const callback = this._callbackName(attempt);
        const script = document.createElement('script');
        let timer = null;
        const clear = () => {
          if (done) return false;
          done = true;
          if (timer) clearTimeout(timer);
          if (script.parentNode) script.parentNode.removeChild(script);
          try { delete window[callback]; } catch (_) { window[callback] = undefined; }
          return true;
        };
        window[callback] = result => {
          if (!clear()) return;
          try { resolve(this._serverResult(result)); } catch (error) { reject(error); }
        };
        script.async = true;
        script.referrerPolicy = 'no-referrer';
        script.src = this._jsonpUrl(callback, encoded, attempt);
        script.onerror = () => {
          if (!clear()) return;
          reject(this._networkError(`Temporary Apps Script JSONP error (attempt ${attempt}).`));
        };
        timer = setTimeout(() => {
          if (!clear()) return;
          reject(this._networkError(`Apps Script JSONP timed out (attempt ${attempt}).`, 'TIMEOUT'));
        }, timeout);
        document.head.appendChild(script);
      });
    }

    async _safeTransport(encoded, timeout) {
      const startedAt = Date.now();
      let lastError = null;
      for (let attempt = 1; attempt <= this.maxSafeAttempts; attempt++) {
        const remaining = timeout - (Date.now() - startedAt);
        if (remaining <= 0) break;
        const perTransportTimeout = Math.max(3500, Math.min(8500, Math.floor(remaining / 2) || remaining));
        try { return await this._jsonpOnce(encoded, perTransportTimeout, attempt); }
        catch (error) {
          const code = String(error && error.code || '');
          if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') throw error;
          lastError = error;
        }
        try { return await this._fetchOnce(encoded, perTransportTimeout, attempt); }
        catch (error) {
          const code = String(error && error.code || '');
          if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') throw error;
          lastError = error;
        }
        if (attempt < this.maxSafeAttempts) await this._sleep(180 * attempt);
      }
      const finalError = this._networkError('Could not reach the INCENTIFY EMS V21 backend after automatic recovery attempts.');
      finalError.cause = lastError || undefined;
      throw finalError;
    }

    async _probeMutation(requestId, action, timeout = 9000) {
      const encoded = this._encode({action:'requestReplayStatus', requestId, actionName:action});
      try {
        const response = await this._safeTransport(encoded, timeout);
        return response && response.found ? this._serverResult(response.result) : null;
      } catch (_) {
        return null;
      }
    }

    async _replaySafeMutationTransport(encoded, timeout, requestId, action) {
      const startedAt = Date.now();
      let lastError = null;
      const remaining = () => Math.max(0, timeout - (Date.now() - startedAt));
      const isFace = action === 'submitAttendanceLinkFace' || action === 'registerMyFace';
      const firstTimeout = isFace ? 28000 : 14000;
      const fallbackTimeout = isFace ? 18000 : 10000;

      try {
        return await this._jsonpOnce(encoded, Math.min(firstTimeout, Math.max(5000, remaining())), 1);
      } catch (error) {
        const code = String(error && error.code || '');
        if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') throw error;
        lastError = error;
      }

      const replayAfterFirst = await this._probeMutation(requestId, action, Math.min(8000, Math.max(3500, remaining())));
      if (replayAfterFirst) return replayAfterFirst;

      if (remaining() > 4000) {
        await this._sleep(220);
        try {
          return await this._fetchOnce(encoded, Math.min(fallbackTimeout, Math.max(4000, remaining())), 2);
        } catch (error) {
          const code = String(error && error.code || '');
          if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') throw error;
          lastError = error;
        }
      }

      const replayAfterFetch = await this._probeMutation(requestId, action, Math.min(7000, Math.max(3000, remaining())));
      if (replayAfterFetch) return replayAfterFetch;

      if (remaining() > 3500) {
        await this._sleep(280);
        try {
          return await this._jsonpOnce(encoded, Math.min(12000, Math.max(3500, remaining())), 3);
        } catch (error) {
          const code = String(error && error.code || '');
          if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') throw error;
          lastError = error;
        }
      }

      const finalReplay = await this._probeMutation(requestId, action, Math.min(6000, Math.max(2500, remaining())));
      if (finalReplay) return finalReplay;

      const finalError = this._networkError(
        isFace
          ? 'Secure face submission could not be confirmed after recovery attempts. Keep this page open and retry once; the backend will not duplicate a completed enrollment.'
          : 'The request could not be confirmed after automatic recovery attempts. Retrying the same action is safe in V21.'
      );
      finalError.cause = lastError || undefined;
      throw finalError;
    }

    async call(action, payload = {}, timeout = 30000) {
      if (!this.isConfigured()) throw new Error('V21 backend URL is not configured. Set the Apps Script /exec URL in js/config.js.');
      const a = String(action || '');
      const requestId = this._requestId();
      const request = { action: a, requestId, ...(payload || {}) };
      const encoded = this._encode(request);
      if (encoded.length > 11000) throw new Error('Request payload is too large for the V21 browser API transport.');

      // Coalesce identical health/bootstrap reads started in the same UI tick.
      if (this.safeRetryActions.has(a) && ['health','bootstrapAdmin','bootstrapEmployee'].includes(a)) {
        const key = `${a}:${payload && payload.token ? String(payload.token).slice(0,24) : ''}`;
        if (this.inflightSafe.has(key)) return this.inflightSafe.get(key);
        const promise = this._safeTransport(encoded, timeout).finally(() => this.inflightSafe.delete(key));
        this.inflightSafe.set(key, promise);
        return promise;
      }
      if (this.safeRetryActions.has(a)) return this._safeTransport(encoded, timeout);
      if (this.replaySafeMutationActions.has(a)) return this._replaySafeMutationTransport(encoded, timeout, requestId, a);
      return this._jsonpOnce(encoded, Math.min(timeout, 18000), 1);
    }
  }

  window.IncentifyEmsApiClient = IncentifyEmsApiClient;
  window.incentifyEmsApi = new IncentifyEmsApiClient(window.INCENTIFY_EMS_CONFIG.API_URL);
})();
