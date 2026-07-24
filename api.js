/**
 * ============================================================================
 * API SHIM — makes google.script.run work from a plain static site
 * ============================================================================
 * Every screen in this app was originally written against Apps Script's
 * built-in `google.script.run.withSuccessHandler(fn).withFailureHandler(fn)
 * .someServerFunction(args)` API. Rather than rewrite every one of those
 * call sites, this file reproduces that exact API on top of a plain
 * fetch() call to the Apps Script Web App (deployed as a JSON API — see
 * Code.gs's doPost). Every existing google.script.run.* call in
 * index.html / home.html / admin.html keeps working with zero changes.
 *
 * Content-Type is deliberately "text/plain;charset=utf-8", NOT
 * "application/json" — that keeps this a CORS "simple request", so the
 * browser never sends a preflight OPTIONS request (which Apps Script Web
 * Apps cannot answer). The server still parses the body as JSON regardless
 * of the declared content type.
 */
function callAppsScript_(fn, args, onSuccess, onFailure) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
    const msg = 'APPS_SCRIPT_URL is not configured yet — edit config.js first.';
    console.error(msg);
    if (onFailure) onFailure({ message: msg });
    return;
  }

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: fn, args: args })
  })
    .then(function (response) { return response.json(); })
    .then(function (payload) {
      if (payload.ok) {
        if (onSuccess) onSuccess(payload.result);
      } else {
        const err = new Error(payload.error || 'Server error');
        if (onFailure) onFailure(err); else console.error(err);
      }
    })
    .catch(function (networkError) {
      if (onFailure) onFailure(networkError); else console.error(networkError);
    });
}

function createGoogleScriptRunShim_() {
  const state = { success: null, failure: null };

  const base = {
    withSuccessHandler: function (fn) { state.success = fn; return proxy; },
    withFailureHandler: function (fn) { state.failure = fn; return proxy; }
  };

  const proxy = new Proxy(base, {
    get: function (target, prop) {
      if (prop in target) return target[prop];
      // Any other property access is treated as the server function to call,
      // e.g. google.script.run.withSuccessHandler(x).login(a, b, c)
      return function () {
        const args = Array.prototype.slice.call(arguments);
        const onSuccess = state.success;
        const onFailure = state.failure;
        state.success = null; // reset so the next chain starts clean
        state.failure = null;
        callAppsScript_(prop, args, onSuccess, onFailure);
      };
    }
  });

  return proxy;
}

window.google = window.google || {};
window.google.script = window.google.script || {};
window.google.script.run = createGoogleScriptRunShim_();

/**
 * Small session helper shared by home.html and admin.html — reads the
 * logged-in session out of localStorage (set by index.html on login) and
 * redirects to the login page if it's missing.
 */
function requireSession_() {
  const token = localStorage.getItem('rsams_token');
  const employeeRaw = localStorage.getItem('rsams_employee');
  if (!token || !employeeRaw) {
    window.location.href = 'index.html';
    return null;
  }
  try {
    return { token: token, employee: JSON.parse(employeeRaw) };
  } catch (e) {
    window.location.href = 'index.html';
    return null;
  }
}

function clearSession_() {
  localStorage.removeItem('rsams_token');
  localStorage.removeItem('rsams_employee');
  localStorage.removeItem('rsams_admin_viewing_own');
}
