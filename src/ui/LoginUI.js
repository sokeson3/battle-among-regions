// ─────────────────────────────────────────────────────────────
// LoginUI.js — Login, Register, Email Verification, Password
//              Recovery, and Device Linking UI screens
// ─────────────────────────────────────────────────────────────

export class LoginUI {
    /**
     * @param {HTMLElement} container - #app element
     * @param {import('../services/AuthService.js').AuthService} authService
     * @param {Function} onComplete - called with { loggedIn: bool } when done
     */
    constructor(container, authService, onComplete) {
        this.container = container;
        this.auth = authService;
        this.onComplete = onComplete;
        this.screen = 'login'; // 'login' | 'register' | 'link' | 'verify' | 'forgot' | 'reset'
        this.error = '';
        this.success = '';
        this.loading = false;
        this._resetEmail = ''; // stored email for forgot-password flow
    }

    // ─── Entry Point ─────────────────────────────────────────

    show() {
        this.screen = 'login';
        this.error = '';
        this.success = '';
        this.loading = false;
        this._render();
    }

    // ─── Render ──────────────────────────────────────────────

    _render() {
        switch (this.screen) {
            case 'login': this._renderLogin(); break;
            case 'register': this._renderRegister(); break;
            case 'link': this._renderLink(); break;
            case 'verify': this._renderVerifyEmail(); break;
            case 'forgot': this._renderForgotPassword(); break;
            case 'reset': this._renderResetPassword(); break;
        }
    }

    _renderLogin() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">⚔</div>
                        <h1 class="login-title">Battle Among Regions</h1>
                        <p class="login-subtitle">War for Supremacy</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="login-username">Username</label>
                            <input class="login-input" type="text" id="login-username"
                                   placeholder="Enter username" autocomplete="username" autocapitalize="off" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="login-password">Password</label>
                            <input class="login-input" type="password" id="login-password"
                                   placeholder="Enter password" autocomplete="current-password" />
                        </div>
                        <button class="login-btn login-btn-primary" id="login-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Logging in...' : '🔑 Log In'}
                        </button>
                        <button class="login-btn login-btn-text" id="login-forgot">
                            Forgot Password?
                        </button>
                    </div>

                    <div class="login-divider"><span>or</span></div>

                    <div class="login-links">
                        <button class="login-btn login-btn-secondary" id="login-create">
                            ✨ Create Account
                        </button>
                        <button class="login-btn login-btn-ghost" id="login-link-device">
                            🔗 Link Device
                        </button>
                        <button class="login-btn login-btn-ghost" id="login-guest">
                            👤 Continue as Guest
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachLoginEvents();
    }

    _renderRegister() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">✨</div>
                        <h1 class="login-title">Create Account</h1>
                        <p class="login-subtitle">Join the battle</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="reg-username">Username</label>
                            <input class="login-input" type="text" id="reg-username"
                                   placeholder="3–24 chars, letters/numbers/_" autocomplete="username" autocapitalize="off" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reg-display">Display Name</label>
                            <input class="login-input" type="text" id="reg-display"
                                   placeholder="How others see you" autocomplete="off" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reg-email">Email</label>
                            <input class="login-input" type="email" id="reg-email"
                                   placeholder="For verification & password recovery" autocomplete="email" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reg-password">Password</label>
                            <input class="login-input" type="password" id="reg-password"
                                   placeholder="At least 4 characters" autocomplete="new-password" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reg-confirm">Confirm Password</label>
                            <input class="login-input" type="password" id="reg-confirm"
                                   placeholder="Re-enter password" autocomplete="new-password" />
                        </div>
                        <button class="login-btn login-btn-primary" id="reg-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Creating...' : '✨ Create Account'}
                        </button>
                    </div>

                    <div class="login-links">
                        <button class="login-btn login-btn-ghost" id="reg-back">
                            ← Back to Login
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachRegisterEvents();
    }

    _renderLink() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">🔗</div>
                        <h1 class="login-title">Link Device</h1>
                        <p class="login-subtitle">Enter the code from your other device</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="link-code">Link Code</label>
                            <input class="login-input login-input-code" type="text" id="link-code"
                                   placeholder="ABC123" maxlength="6" autocomplete="off"
                                   autocapitalize="characters" style="text-transform:uppercase;letter-spacing:0.3em;text-align:center;font-size:1.5rem" />
                        </div>
                        <p class="login-hint">
                            On your other device, go to your profile and tap <strong>"Link Device"</strong> to get a code.
                        </p>
                        <button class="login-btn login-btn-primary" id="link-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Linking...' : '🔗 Link This Device'}
                        </button>
                    </div>

                    <div class="login-links">
                        <button class="login-btn login-btn-ghost" id="link-back">
                            ← Back to Login
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachLinkEvents();
    }

    _renderVerifyEmail() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">📧</div>
                        <h1 class="login-title">Verify Email</h1>
                        <p class="login-subtitle">Check your inbox for a 6-digit code</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}
                    ${this.success ? `<div class="login-success">${this._escapeHtml(this.success)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="verify-code">Verification Code</label>
                            <input class="login-input login-input-code" type="text" id="verify-code"
                                   placeholder="123456" maxlength="6" autocomplete="off"
                                   inputmode="numeric" pattern="[0-9]*"
                                   style="letter-spacing:0.3em;text-align:center;font-size:1.5rem" />
                        </div>
                        <button class="login-btn login-btn-primary" id="verify-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Verifying...' : '✅ Verify Email'}
                        </button>
                        <button class="login-btn login-btn-ghost" id="verify-resend" ${this.loading ? 'disabled' : ''}>
                            📧 Resend Code
                        </button>
                    </div>

                    <div class="login-links">
                        <button class="login-btn login-btn-ghost" id="verify-skip">
                            Skip for now →
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachVerifyEvents();
    }

    _renderForgotPassword() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">🔒</div>
                        <h1 class="login-title">Forgot Password</h1>
                        <p class="login-subtitle">Enter the email linked to your account</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}
                    ${this.success ? `<div class="login-success">${this._escapeHtml(this.success)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="forgot-email">Email Address</label>
                            <input class="login-input" type="email" id="forgot-email"
                                   placeholder="Enter your email" autocomplete="email" />
                        </div>
                        <button class="login-btn login-btn-primary" id="forgot-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Sending...' : '📧 Send Reset Code'}
                        </button>
                    </div>

                    <div class="login-links">
                        <button class="login-btn login-btn-ghost" id="forgot-back">
                            ← Back to Login
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachForgotEvents();
    }

    _renderResetPassword() {
        this.container.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="login-logo-icon">🔑</div>
                        <h1 class="login-title">Reset Password</h1>
                        <p class="login-subtitle">Enter the code sent to your email</p>
                    </div>

                    ${this.error ? `<div class="login-error">${this._escapeHtml(this.error)}</div>` : ''}
                    ${this.success ? `<div class="login-success">${this._escapeHtml(this.success)}</div>` : ''}

                    <div class="login-form">
                        <div class="login-field">
                            <label class="login-label" for="reset-code">Reset Code</label>
                            <input class="login-input login-input-code" type="text" id="reset-code"
                                   placeholder="123456" maxlength="6" autocomplete="off"
                                   inputmode="numeric" pattern="[0-9]*"
                                   style="letter-spacing:0.3em;text-align:center;font-size:1.5rem" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reset-password">New Password</label>
                            <input class="login-input" type="password" id="reset-password"
                                   placeholder="At least 4 characters" autocomplete="new-password" />
                        </div>
                        <div class="login-field">
                            <label class="login-label" for="reset-confirm">Confirm New Password</label>
                            <input class="login-input" type="password" id="reset-confirm"
                                   placeholder="Re-enter new password" autocomplete="new-password" />
                        </div>
                        <button class="login-btn login-btn-primary" id="reset-submit" ${this.loading ? 'disabled' : ''}>
                            ${this.loading ? '⏳ Resetting...' : '🔑 Reset Password'}
                        </button>
                    </div>

                    <div class="login-links">
                        <button class="login-btn login-btn-ghost" id="reset-back">
                            ← Back to Login
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._attachResetEvents();
    }

    // ─── Event Handlers ──────────────────────────────────────

    _attachLoginEvents() {
        const submit = document.getElementById('login-submit');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');

        const doLogin = async () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            if (!username || !password) {
                this.error = 'Please enter both username and password.';
                this._render();
                return;
            }
            this.error = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.login(username, password);
                this.onComplete({ loggedIn: true });
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doLogin;

        // Enter key submits
        const handleEnter = (e) => { if (e.key === 'Enter') doLogin(); };
        usernameInput.addEventListener('keydown', handleEnter);
        passwordInput.addEventListener('keydown', handleEnter);

        document.getElementById('login-create').onclick = () => {
            this.screen = 'register';
            this.error = '';
            this._render();
        };

        document.getElementById('login-link-device').onclick = () => {
            this.screen = 'link';
            this.error = '';
            this._render();
        };

        document.getElementById('login-guest').onclick = () => {
            this.onComplete({ loggedIn: false });
        };

        document.getElementById('login-forgot').onclick = () => {
            this.screen = 'forgot';
            this.error = '';
            this.success = '';
            this._render();
        };

        usernameInput.focus();
    }

    _attachRegisterEvents() {
        const submit = document.getElementById('reg-submit');
        const usernameInput = document.getElementById('reg-username');
        const passwordInput = document.getElementById('reg-password');
        const confirmInput = document.getElementById('reg-confirm');

        const doRegister = async () => {
            const username = usernameInput.value.trim();
            const displayName = document.getElementById('reg-display').value.trim() || username;
            const email = document.getElementById('reg-email').value.trim();
            const password = passwordInput.value;
            const confirm = confirmInput.value;

            if (!username || !password) {
                this.error = 'Please fill in all required fields.';
                this._render();
                return;
            }
            if (password !== confirm) {
                this.error = 'Passwords do not match.';
                this._render();
                return;
            }
            this.error = '';
            this.loading = true;
            this._render();
            try {
                const result = await this.auth.register(username, password, displayName, email);
                // If email was provided, show verification screen
                if (email) {
                    this.screen = 'verify';
                    this.loading = false;
                    this.error = '';
                    this.success = '';
                    this._render();
                } else {
                    this.onComplete({ loggedIn: true });
                }
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doRegister;
        confirmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });

        document.getElementById('reg-back').onclick = () => {
            this.screen = 'login';
            this.error = '';
            this._render();
        };

        usernameInput.focus();
    }

    _attachLinkEvents() {
        const submit = document.getElementById('link-submit');
        const codeInput = document.getElementById('link-code');

        const doLink = async () => {
            const code = codeInput.value.trim().toUpperCase();
            if (!code || code.length !== 6) {
                this.error = 'Please enter a valid 6-character code.';
                this._render();
                return;
            }
            this.error = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.redeemLinkCode(code);
                this.onComplete({ loggedIn: true });
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doLink;
        codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLink(); });

        document.getElementById('link-back').onclick = () => {
            this.screen = 'login';
            this.error = '';
            this._render();
        };

        codeInput.focus();
    }

    _attachVerifyEvents() {
        const submit = document.getElementById('verify-submit');
        const codeInput = document.getElementById('verify-code');

        const doVerify = async () => {
            const code = codeInput.value.trim();
            if (!code || code.length !== 6) {
                this.error = 'Please enter a valid 6-digit code.';
                this._render();
                return;
            }
            this.error = '';
            this.success = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.verifyEmail(code);
                this.onComplete({ loggedIn: true });
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doVerify;
        codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });

        document.getElementById('verify-resend').onclick = async () => {
            this.error = '';
            this.success = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.resendVerification();
                this.loading = false;
                this.success = 'Verification code resent! Check your inbox.';
                this._render();
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        document.getElementById('verify-skip').onclick = () => {
            this.onComplete({ loggedIn: true });
        };

        codeInput.focus();
    }

    _attachForgotEvents() {
        const submit = document.getElementById('forgot-submit');
        const emailInput = document.getElementById('forgot-email');

        const doForgot = async () => {
            const email = emailInput.value.trim();
            if (!email) {
                this.error = 'Please enter your email address.';
                this._render();
                return;
            }
            this.error = '';
            this.success = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.forgotPassword(email);
                this._resetEmail = email;
                this.screen = 'reset';
                this.loading = false;
                this.error = '';
                this.success = 'If an account with that email exists, a reset code has been sent.';
                this._render();
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doForgot;
        emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doForgot(); });

        document.getElementById('forgot-back').onclick = () => {
            this.screen = 'login';
            this.error = '';
            this.success = '';
            this._render();
        };

        emailInput.focus();
    }

    _attachResetEvents() {
        const submit = document.getElementById('reset-submit');
        const codeInput = document.getElementById('reset-code');
        const passwordInput = document.getElementById('reset-password');
        const confirmInput = document.getElementById('reset-confirm');

        const doReset = async () => {
            const code = codeInput.value.trim();
            const newPassword = passwordInput.value;
            const confirm = confirmInput.value;

            if (!code || code.length !== 6) {
                this.error = 'Please enter a valid 6-digit code.';
                this._render();
                return;
            }
            if (!newPassword || newPassword.length < 4) {
                this.error = 'Password must be at least 4 characters.';
                this._render();
                return;
            }
            if (newPassword !== confirm) {
                this.error = 'Passwords do not match.';
                this._render();
                return;
            }

            this.error = '';
            this.success = '';
            this.loading = true;
            this._render();
            try {
                await this.auth.resetPassword(this._resetEmail, code, newPassword);
                this.screen = 'login';
                this.loading = false;
                this.error = '';
                this.success = '';
                // Show success on login screen
                this._render();
                // Insert a success message after render
                const card = this.container.querySelector('.login-card .login-logo');
                if (card) {
                    const msg = document.createElement('div');
                    msg.className = 'login-success';
                    msg.textContent = 'Password reset successfully! You can now log in.';
                    card.insertAdjacentElement('afterend', msg);
                }
            } catch (err) {
                this.loading = false;
                this.error = err.message;
                this._render();
            }
        };

        submit.onclick = doReset;
        confirmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doReset(); });

        document.getElementById('reset-back').onclick = () => {
            this.screen = 'login';
            this.error = '';
            this.success = '';
            this._render();
        };

        codeInput.focus();
    }

    // ─── Helpers ─────────────────────────────────────────────

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
