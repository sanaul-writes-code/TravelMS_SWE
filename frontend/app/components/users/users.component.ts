import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, User } from '../../services/api.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Users</h2>
        <button (click)="toggleForm()">{{ showForm ? 'Cancel' : '+ Add User' }}</button>
      </div>

      @if (error) {
        <div class="error">{{ error }}</div>
      }

      @if (showForm) {
        <div class="form-box">
          <h3>{{ editId ? 'Edit User' : 'New User' }}</h3>
          <form (ngSubmit)="save()">
            <div class="form-row">
              <label>First Name<input [(ngModel)]="form.first_name" name="first_name" required /></label>
              <label>Last Name<input [(ngModel)]="form.last_name" name="last_name" required /></label>
            </div>
            <div class="form-row">
              <label>Email<input [(ngModel)]="form.email" name="email" type="email" required /></label>
              <label>Phone<input [(ngModel)]="form.phone_number" name="phone_number" /></label>
            </div>
            <div class="form-row">
              <label>Role
                <select [(ngModel)]="form.role" name="role">
                  <option>Admin</option>
                  <option>User</option>
                </select>
              </label>
              <label>Status
                <select [(ngModel)]="form.is_active" name="is_active">
                  <option [ngValue]="1">Active</option>
                  <option [ngValue]="0">Inactive</option>
                </select>
              </label>
            </div>
            <div class="form-row">
              <label>
                {{ editId ? 'New Password (leave blank to keep)' : 'Password' }}
                <input
                  [(ngModel)]="form.password"
                  name="password"
                  type="password"
                  [required]="!editId"
                  placeholder="{{ editId ? 'Leave blank to keep current' : 'Set a password' }}"
                />
              </label>
            </div>
            <div class="form-actions">
              <button type="submit">{{ editId ? 'Update' : 'Create' }}</button>
              <button type="button" (click)="toggleForm()">Cancel</button>
            </div>
          </form>
        </div>
      }

      @if (loading) {
        <p>Loading...</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Phone</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users; track u.user_id) {
              <tr>
                <td>{{ u.user_id }}</td>
                <td>{{ u.first_name }} {{ u.last_name }}</td>
                <td>{{ u.email }}</td>
                <td><span class="badge">{{ u.role }}</span></td>
                <td><span class="badge">{{ u.is_active ? 'Active' : 'Inactive' }}</span></td>
                <td>{{ u.phone_number }}</td>
                <td class="actions">
                  <button class="btn-edit" (click)="edit(u)">Edit</button>
                  <button class="btn-delete" (click)="delete(u.user_id!)">Delete</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No users found.</td></tr>
            }
          </tbody>
        </table>
      }
    </div>
  `
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  loading = true;
  error = '';
  showForm = false;
  editId: number | null = null;
  form: User & { password?: string } = this.blank();

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.getUsers().subscribe({
      next: (data) => { this.users = data; this.loading = false; this.cdr.detectChanges(); },
      error: (err) => { this.error = err.message; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  blank(): User & { password?: string } {
    return { first_name: '', last_name: '', email: '', role: 'User', phone_number: '', is_active: 1, password: '' };
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) { this.editId = null; this.form = this.blank(); }
  }

  edit(u: User) {
    this.editId = u.user_id!;
    this.form = { ...u, password: '' };
    this.showForm = true;
  }

  save() {
    const action = this.editId
      ? this.api.updateUser(this.editId, this.form)
      : this.api.createUser(this.form);
    action.subscribe({
      next: () => { this.showForm = false; this.editId = null; this.form = this.blank(); this.cdr.detectChanges(); this.load(); },
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  delete(id: number) {
    if (confirm('Delete this user?')) {
      this.api.deleteUser(id).subscribe({
        next: () => this.load(),
        error: (err) => { this.error = err.error?.error || err.message; }
      });
    }
  }
}
