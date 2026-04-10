import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Expense, Trip, User } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Expenses</h2>
        <button (click)="toggleForm()">{{ showForm ? 'Cancel' : '+ Add Expense' }}</button>
      </div>

      @if (error) {
        <div class="error">{{ error }}</div>
      }

      @if (showForm) {
        <div class="form-box">
          <h3>{{ editId ? 'Edit Expense' : 'New Expense' }}</h3>
          <form (ngSubmit)="save()">
            <div class="form-row">
              <label>Trip
                <select [(ngModel)]="form.trip_id" name="trip_id" required>
                  <option [value]="0" disabled>Select trip</option>
                  @for (t of trips; track t.trip_id) {
                    <option [value]="t.trip_id">{{ t.destination }} ({{ t.start_date }})</option>
                  }
                </select>
              </label>
              @if (isAdmin) {
                <label>User
                  <select [(ngModel)]="form.user_id" name="user_id" required>
                    <option [value]="0" disabled>Select user</option>
                    @for (u of users; track u.user_id) {
                      <option [value]="u.user_id">{{ u.first_name }} {{ u.last_name }}</option>
                    }
                  </select>
                </label>
              }
            </div>
            <div class="form-row">
              <label>Category
                <select [(ngModel)]="form.category" name="category">
                  <option>Flight</option>
                  <option>Hotel</option>
                  <option>Meals</option>
                  <option>Transport</option>
                  <option>Other</option>
                </select>
              </label>
              <label>Amount ($)<input [(ngModel)]="form.amount" name="amount" type="number" min="0" step="0.01" required /></label>
            </div>
            <div class="form-row">
              <label>Date<input [(ngModel)]="form.expense_date" name="expense_date" type="date" /></label>
              <label>Receipt URL<input [(ngModel)]="form.receipt_url" name="receipt_url" type="url" /></label>
            </div>
            <label>Description<input [(ngModel)]="form.description" name="description" /></label>
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
              <th>ID</th><th>Trip</th><th>Category</th><th>Amount</th>
              <th>Date</th><th>Description</th><th>Receipt</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (e of expenses; track e.expense_id) {
              <tr>
                <td>{{ e.expense_id }}</td>
                <td>{{ e.destination }}</td>
                <td><span class="badge">{{ e.category }}</span></td>
                <td>{{ '$' + e.amount }}</td>
                <td>{{ e.expense_date }}</td>
                <td>{{ e.description }}</td>
                <td>
                  @if (e.receipt_url) {
                    <a [href]="e.receipt_url" target="_blank">View</a>
                  }
                </td>
                <td class="actions">
                  <button class="btn-edit" (click)="edit(e)">Edit</button>
                  <button class="btn-delete" (click)="delete(e.expense_id!)">Delete</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty">No expenses found.</td></tr>
            }
          </tbody>
        </table>
      }
    </div>
  `
})
export class ExpensesComponent implements OnInit {
  expenses: Expense[] = [];
  trips: Trip[] = [];
  users: User[] = [];
  loading = true;
  error = '';
  showForm = false;
  editId: number | null = null;
  form: Expense = this.blank();
  get isAdmin(): boolean { return this.auth.isAdmin; }

  constructor(private api: ApiService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.api.getTrips().subscribe({ next: (t) => { this.trips = t; this.cdr.detectChanges(); } });
    if (this.isAdmin) {
      this.api.getUsers().subscribe({ next: (u) => { this.users = u; this.cdr.detectChanges(); } });
    } else if (this.auth.user) {
      this.users = [{
        ...this.auth.user,
        phone_number: ''
      }];
      this.form.user_id = this.auth.user.user_id;
    }
    this.load();
  }

  load() {
    this.loading = true;
    this.api.getExpenses().subscribe({
      next: (data) => { this.expenses = data; this.loading = false; this.cdr.detectChanges(); },
      error: (err) => { this.error = err.message; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  blank(): Expense {
    return { trip_id: 0, user_id: 0, category: 'Flight', amount: 0, expense_date: '', description: '', receipt_url: '' };
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) { this.editId = null; this.form = this.blank(); }
  }

  edit(e: Expense) {
    this.editId = e.expense_id!;
    this.form = { ...e };
    this.showForm = true;
  }

  save() {
    if (!this.isAdmin && this.auth.user) {
      this.form.user_id = this.auth.user.user_id;
    }
    const action = this.editId
      ? this.api.updateExpense(this.editId, this.form)
      : this.api.createExpense(this.form);
    action.subscribe({
      next: () => { this.showForm = false; this.editId = null; this.form = this.blank(); this.cdr.detectChanges(); this.load(); },
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  delete(id: number) {
    if (confirm('Delete this expense?')) {
      this.api.deleteExpense(id).subscribe({
        next: () => this.load(),
        error: (err) => { this.error = err.error?.error || err.message; }
      });
    }
  }
}
