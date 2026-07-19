import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("welcome actions open their intended account mode directly", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /onClick=\{\(\) => showWelcomeAuth\("signup"\)\}>Get Started<\/button>/);
  assert.match(app, /onClick=\{\(\) => showWelcomeAuth\("signin"\)\}>I Already Have an Account<\/button>/);
  assert.match(app, /setAuthMode\(mode\);/);
  assert.doesNotMatch(app, /account-selection|Choose (?:an )?account action|Choose Sign In or Create Account/);
});

test("one account panel switches between Create Account and Sign In", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /role="tab"[^>]*aria-selected=\{authMode === "signin"\}[^>]*onClick=\{\(\) => showWelcomeAuth\("signin"\)\}>Sign In/);
  assert.match(app, /role="tab"[^>]*aria-selected=\{authMode === "signup"\}[^>]*onClick=\{\(\) => showWelcomeAuth\("signup"\)\}>Create Account/);
  assert.match(app, /<form key=\{authMode\}[^>]*onSubmit=\{handleAuthSubmit\}>/);
  assert.doesNotMatch(app, /authMode === "signin"[^\n]*<form[\s\S]*authMode === "signup"[^\n]*<form/);
});

test("account panel closes to welcome and restores focus", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /const closeWelcomeAuth = useCallback\(\(\) => \{/);
  assert.match(app, /setWelcomeAuthOpen\(false\);/);
  assert.match(app, /authTriggerRef\.current\?\.focus\?\.\(\)/);
  assert.match(app, /aria-label="Close account panel"/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /role="dialog" aria-modal="true"/);
});

test("account validation stays simple and provider errors remain visible", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /authPassword !== authPasswordConfirm/);
  assert.match(app, /The password confirmation does not match/);
  assert.match(app, /friendlyAccountError\(error/);
  assert.match(app, /className="auth-error" role="alert"/);
  assert.doesNotMatch(app, /uppercase letter|lowercase letter|special character|must contain a number|password checklist/i);
  assert.match(app, /authSubmitPendingRef\.current/);
});

test("password recovery, session restoration, and guest access remain reachable", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, />Forgot password\?<\/button>/);
  assert.match(app, /resetPasswordForEmail\(email/);
  assert.match(app, /Back to sign in/);
  assert.match(app, /client\.auth\.getSession\(\)/);
  assert.match(app, /client\.auth\.onAuthStateChange/);
  assert.match(app, /onClick=\{continueAsGuest\}>Continue as Guest<\/button>/);
});

test("mobile account modal keeps internal scrolling and safe-area clearance", async () => {
  const styles = await read("../src/App.css");
  assert.match(styles, /\.welcome-auth-backdrop \{[^}]*position: fixed;[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/);
  assert.match(styles, /\.welcome-auth-card \{[^}]*max-height:[^}]*overflow-y: auto;/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.welcome-auth-backdrop \{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.welcome-auth-card \{[^}]*max-height: 100dvh;[^}]*min-height: 100%;/);
});
