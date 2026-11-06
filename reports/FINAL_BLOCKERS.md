# Final Blockers

## 1. Missing Admin UI Screens
| Module | Expected UI | Current Status | Impact |
|--------|------------|----------------|--------|
| Settings | Dedicated settings page (RTL, dark theme) | ❌ No UI – only managed via Firebase console | Admins cannot adjust platform settings without technical knowledge. |
| Pricing | Pricing management screen | ❌ No UI – only via `pricing` node in console | Inability to update fares dynamically from the admin panel. |
| Wallet | Wallet balance view & transaction history | ❌ No UI – only available through `WalletEngine` API | Admins cannot audit or adjust user balances manually. |
| Stats | Detailed analytics dashboard | ❌ No UI – only displayed as widgets in Dashboard | Limited visibility into key performance metrics. |
| Admin Logs | Log viewer for audit trails | ❌ No UI – logs stored under `/admin_logs` but not displayed | Difficulty tracking admin actions, reducing traceability. |
| Admins | Admin user management screen | ❌ No UI – admin list only via console | Adding/removing admins requires console access, not UI. |
| Scheduled Trips | Scheduler interface | ❌ No UI – managed via console | Cannot create or modify scheduled rides from admin panel. |

## 2. Failing Firebase Rules Test
- **Test:** `rules‑regression.test.js` case 2.7 (unauthorized modification of a completed trip). 
- **Result:** 1 failure – the test correctly blocked the operation, confirming the rule works, but the existence of a failing test indicates a potential edge‑case that needs review and documentation. 
- **Required Action:** Review the rule logic for `trips/$tripId/.write` (line 25‑26) and add a specific unit test description or fix if the failure is unintended.

## 3. Placeholder Financial Integration
- **Function:** `WalletEngine.topUpWallet` returns the string `"requiresServer"` and contains no implementation. 
- **Consequence:** Real wallet top‑up via a payment provider is not possible; the current flow relies on mock data in the emulator. This is a blocker for any production deployment that requires actual monetary transactions.
- **Required Action:** Implement a secure server‑side endpoint (e.g., Cloud Function) that validates payment provider callbacks and writes to `/wallets/{uid}` using admin privileges.

## 4. Notification Write Rule Too Permissive
- **Rule:** `notifications/$uid/.write` is set to `auth != null`, allowing any authenticated user to write notifications for any UID they own, but also permits a malicious client to write arbitrary notifications for themselves. 
- **Risk:** Potential abuse for spam or phishing within the app. 
- **Recommendation:** Restrict the rule to admin users (`root.child('admins').child(auth.uid).val() === true`) for system‑generated alerts, while keeping a separate user‑owned path for personal notifications.

## 5. No Real‑Time Payment Gateway Integration
- The platform currently lacks integration with any external payment processor (e.g., Stripe, PayPal). All financial operations are simulated in the emulator, which is insufficient for production.

## Summary of Blockers
1. **Missing admin UI** for Settings, Pricing, Wallet, Stats, Admin Logs, Admin management, Scheduled Trips.
2. **One failing Firebase rules regression test** – needs clarification or fix.
3. **Placeholder `topUpWallet`** – no real payment handling.
4. **Permissive notification write rule** – security improvement needed.
5. **Absence of real payment gateway integration**.

These issues must be resolved before the Taxi Al‑Asama platform can be considered production‑ready.
