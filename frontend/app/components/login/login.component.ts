import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">TravelMS</div>

        @if (mode === 'login') {
          <h2 class="login-title">Sign In</h2>

          @if (error) { <div class="login-error">{{ error }}</div> }

          <form (ngSubmit)="login()">
            <div class="login-field">
              <label>Email</label>
              <input [(ngModel)]="email" name="email" type="email"
                placeholder="you@example.com" required autofocus />
            </div>
            <div class="login-field">
              <label>Password</label>
              <input [(ngModel)]="password" name="password" type="password"
                placeholder="••••••••" required />
            </div>
            <button type="submit" class="login-btn" [disabled]="loading">
              {{ loading ? 'Signing in…' : 'Sign In' }}
            </button>
          </form>

          <p class="login-switch">
            Don't have an account?
            <a (click)="switchMode('register')">Create one</a>
          </p>
        }

        @if (mode === 'register') {
          <h2 class="login-title">Create Account</h2>

          @if (error) { <div class="login-error">{{ error }}</div> }
          @if (success) { <div class="login-success">{{ success }}</div> }

          <form (ngSubmit)="register()">
            <div class="login-field-row">
              <div class="login-field">
                <label>First Name</label>
                <input [(ngModel)]="reg.first_name" name="first_name" required autofocus />
              </div>
              <div class="login-field">
                <label>Last Name</label>
                <input [(ngModel)]="reg.last_name" name="last_name" required />
              </div>
            </div>
            <div class="login-field">
              <label>Email</label>
              <input [(ngModel)]="reg.email" name="email" type="email"
                placeholder="you@example.com" required />
            </div>
            <div class="login-field">
              <label>Phone (optional)</label>
              <input [(ngModel)]="reg.phone_number" name="phone_number" />
            </div>
            <div class="login-field">
              <label>Password</label>
              <input [(ngModel)]="reg.password" name="password" type="password"
                placeholder="••••••••" required />
            </div>
            <button type="submit" class="login-btn" [disabled]="loading">
              {{ loading ? 'Creating account…' : 'Create Account' }}
            </button>
          </form>

          <p class="login-switch">
            Already have an account?
            <a (click)="switchMode('login')">Sign in</a>
          </p>
        }
      </div>
    </div>
  `
})
export class LoginComponent {
  mode: 'login' | 'register' = 'login';

  // Login fields
  email = '';
  password = '';

  // Register fields
  reg = { first_name: '', last_name: '', email: '', phone_number: '', password: '' };

  error = '';
  success = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  switchMode(m: 'login' | 'register') {
    this.mode = m;
    this.error = '';
    this.success = '';
    this.cdr.detectChanges();
  }

  login() {
    this.error = '';
    this.loading = true;
    this.cdr.detectChanges();

    this.auth.login(this.email, this.password).subscribe({
      next: (response) => {
        this.auth.setSession(response);
        this.loading = false;
        this.cdr.detectChanges();
        this.router.navigate([response.role === 'Admin' ? '/users' : '/trips']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Login failed. Check your credentials.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  register() {
    this.error = '';
    this.loading = true;
    this.cdr.detectChanges();

    this.auth.register(this.reg).subscribe({
      next: () => {
        // Auto-login after successful registration
        this.auth.login(this.reg.email, this.reg.password).subscribe({
          next: (response) => {
            this.auth.setSession(response);
            this.loading = false;
            this.cdr.detectChanges();
            this.router.navigate(['/trips']);
          },
          error: (err) => {
            this.error = err.error?.error || 'Account created but login failed.';
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.error = err.error?.error || 'Registration failed.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
