# MFA / 2FA

Added multi-factor authentication to the frontend, integrating the documented MFA
backend contract (login challenge, TOTP, email OTP, manage/disable, admin reset).

## Login
- Two-step login: when an account has MFA on, signin returns a `challenge_token`
  (not a session token) and the user is taken to a verify screen to enter their
  6-digit code before any JWT is issued.
- The challenge token is kept in component memory only (never localStorage); a JWT
  is stored only after a no-MFA signin or a successful code verification.
- Verify screen handles wrong/expired codes, "Back to login", and (for email) a
  "Resend code" button with a 60s throttle.

## Setup & manage (logged-in users)
- New **Security** button in the Dashboard header opens a Two-factor dialog.
- **Authenticator app (TOTP):** renders a QR code + copyable manual key, then
  confirms with a 6-digit code.
- **Email codes (Email OTP):** sends a code to the user's email, then confirms.
- **Disable:** turns MFA off after password re-authentication.
- A user can have one method at a time; switching means disable then set up the
  other.

## Setup reminder popup
- After login, users without MFA see a "Secure your account" prompt with three
  choices: **Set up now**, **Remind me later** (re-nags after 24h), and
  **Don't show again** (permanent, per-device).
- The remind/dismiss decision is purely frontend state (localStorage); no backend
  values are sent. It survives logout and reappears on a different device/browser.

## Admin
- User list now reflects MFA state per row: a green **Reset MFA** action when MFA
  is set (with the method shown), or a red **"MFA not set"** badge when it isn't.
- Reset MFA removes a user's second factor (recovery for a lost authenticator),
  behind a confirmation prompt.

## UX polish
- OTP input cells made larger and clearer (filled background, bold digits,
  prominent active-cell ring, centered, auto-focused) so it's obvious where to
  type.
- On a failed code, the input is cleared and re-focused so the user can retype the
  latest code without clicking back in.

## Notes
- A wrong code on confirm/verify no longer logs the user out — only a genuinely
  expired session does.
- Dependency added: `qrcode.react` for rendering the TOTP QR.
- All MFA traffic goes through the existing Supabase `marine-api` edge-function
  proxy, with the session JWT sent as `X-Auth-Token` (as the rest of the app does).
