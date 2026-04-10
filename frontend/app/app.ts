import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ApiService, AppNotification } from './services/api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  notifications: AppNotification[] = [];
  showNotifications = false;

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.is_read).length;
  }

  constructor(public auth: AuthService, private api: ApiService, private router: Router) {
    this.refreshNotifications();
  }

  refreshNotifications() {
    if (!this.auth.isLoggedIn) {
      this.notifications = [];
      this.showNotifications = false;
      return;
    }

    this.api.getNotifications().subscribe({
      next: (notifications) => {
        this.notifications = notifications;
      },
      error: () => {
        this.notifications = [];
      }
    });
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.refreshNotifications();
    }
  }

  markNotificationRead(notification: AppNotification) {
    if (notification.is_read) return;

    this.api.markNotificationRead(notification.notification_id).subscribe({
      next: () => {
        notification.is_read = 1;
      }
    });
  }

  logout() {
    this.auth.logoutRequest().subscribe({
      next: () => {
        this.auth.logout();
        this.notifications = [];
        this.showNotifications = false;
        this.router.navigate(['/login']);
      },
      error: () => {
        this.auth.logout();
        this.notifications = [];
        this.showNotifications = false;
        this.router.navigate(['/login']);
      }
    });
  }
}
