import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AuthUser {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export interface AuthResponse extends AuthUser {
  session_token: string;
  expires_at: string;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user: AuthUser | null = null;
  private _sessionToken: string | null = null;
  private base = 'https://travelmsswe-production.up.railway.app/api';

  constructor(private http: HttpClient) {
    const savedUser = localStorage.getItem('tms_user');
    const savedToken = localStorage.getItem('tms_session_token');

    if (savedUser) this._user = JSON.parse(savedUser);
    if (savedToken) this._sessionToken = savedToken;
  }

  get user(): AuthUser | null { return this._user; }
  get sessionToken(): string | null { return this._sessionToken; }
  get isLoggedIn(): boolean { return !!this._user && !!this._sessionToken; }
  get isAdmin(): boolean { return this._user?.role === 'Admin'; }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`, { email, password });
  }

  register(payload: RegisterPayload): Observable<unknown> {
    return this.http.post(`${this.base}/auth/register`, payload);
  }

  logoutRequest() {
    return this.http.post<{ success: boolean }>(`${this.base}/auth/logout`, {});
  }

  setSession(response: AuthResponse) {
    const { session_token, expires_at, ...user } = response;
    this._user = user;
    this._sessionToken = session_token;
    localStorage.setItem('tms_user', JSON.stringify(user));
    localStorage.setItem('tms_session_token', session_token);
    localStorage.setItem('tms_session_expires_at', expires_at);
  }

  logout() {
    this._user = null;
    this._sessionToken = null;
    localStorage.removeItem('tms_user');
    localStorage.removeItem('tms_session_token');
    localStorage.removeItem('tms_session_expires_at');
  }
}
