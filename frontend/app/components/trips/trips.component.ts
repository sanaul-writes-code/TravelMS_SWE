import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Trip, User, ItineraryItem, TripMember } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Trips</h2>
        <button (click)="toggleForm()">{{ showForm ? 'Cancel' : '+ Add Trip' }}</button>
      </div>

      @if (error) {
        <div class="error">{{ error }}</div>
      }

      @if (showForm) {
        <div class="form-box">
          <h3>{{ editId ? 'Edit Trip' : 'New Trip' }}</h3>
          <form (ngSubmit)="save()">
            <div class="form-row">
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
              <label>Destination<input [(ngModel)]="form.destination" name="destination" required /></label>
            </div>
            <div class="form-row">
              <label>Start Date<input [(ngModel)]="form.start_date" name="start_date" type="date" /></label>
              <label>End Date<input [(ngModel)]="form.end_date" name="end_date" type="date" /></label>
            </div>
            <div class="form-row">
              <label>Purpose<input [(ngModel)]="form.purpose" name="purpose" /></label>
              <label>Budget ($)<input [(ngModel)]="form.estimated_budget" name="estimated_budget" type="number" min="0" step="0.01" /></label>
            </div>
            @if (isAdmin) {
              <label>Status
                <select [(ngModel)]="form.status" name="status">
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                  <option>Completed</option>
                </select>
              </label>
            }
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
              <th>ID</th>
              @if (isAdmin) { <th>User</th> }
              <th>Destination</th><th>Start</th><th>End</th>
              <th>Purpose</th><th>Budget</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of trips; track t.trip_id) {
              <tr>
                <td>{{ t.trip_id }}</td>
                @if (isAdmin) { <td>{{ t.user_name }}</td> }
                <td>{{ t.destination }}</td>
                <td>{{ t.start_date }}</td>
                <td>{{ t.end_date }}</td>
                <td>{{ t.purpose }}</td>
                <td>
                  <span>{{ t.estimated_budget ? ('$' + t.estimated_budget) : '—' }}</span>
                  @if (t.estimated_budget && t.estimated_budget > 0) {
                    <span> / {{ '$' + spent(t) }} spent</span>
                    @if (isOverBudget(t)) {
                      <span class="budget-alert budget-over"> ⚠ Over budget!</span>
                    } @else if (isNearBudget(t)) {
                      <span class="budget-alert budget-warn"> ⚠ Near limit</span>
                    }
                  }
                </td>
                <td><span class="badge status-{{ t.status?.toLowerCase() }}">{{ t.status }}</span></td>
                <td class="actions">
                  <button class="btn-itinerary" (click)="toggleItinerary(t)">
                    {{ openItineraryTripId === t.trip_id ? 'Hide Itinerary' : 'Itinerary' }}
                  </button>
                  @if (isOfflineSaved(t.trip_id!)) {
                    <button class="btn-offline-saved" (click)="removeOffline(t.trip_id!)">✓ Offline</button>
                  } @else {
                    <button class="btn-offline" (click)="saveOffline(t)">Save Offline</button>
                  }
                  @if (isAdmin || t.user_id === currentUserId) {
                    <button class="btn-members" (click)="toggleMembers(t)">
                      {{ openMembersTripId === t.trip_id ? 'Hide Members' : 'Members' }}
                    </button>
                  }
                  @if (isAdmin) {
                    @if (t.status === 'Pending') {
                      <button class="btn-approve" (click)="approve(t.trip_id!)">Approve</button>
                      <button class="btn-reject" (click)="reject(t.trip_id!)">Reject</button>
                    }
                    <button class="btn-edit" (click)="edit(t)">Edit</button>
                    <button class="btn-delete" (click)="delete(t.trip_id!)">Delete</button>
                  } @else {
                    @if (t.status === 'Pending') {
                      <button class="btn-edit" (click)="edit(t)">Edit</button>
                      <button class="btn-delete" (click)="delete(t.trip_id!)">Delete</button>
                    }
                  }
                </td>
              </tr>

              @if (openItineraryTripId === t.trip_id) {
                <tr>
                  <td [attr.colspan]="isAdmin ? 9 : 8" style="padding: 0;">
                    <div class="itinerary-panel">
                      <div class="itinerary-header">
                        <strong>Itinerary — {{ t.destination }}</strong>
                        <button (click)="showItineraryForm ? cancelItineraryForm() : addItineraryItem(t.trip_id!)">
                          {{ showItineraryForm ? 'Cancel' : '+ Add Item' }}
                        </button>
                      </div>

                      @if (itineraryError) {
                        <div class="error">{{ itineraryError }}</div>
                      }

                      @if (showItineraryForm) {
                        <form class="itinerary-form" (ngSubmit)="saveItinerary()">
                          <div class="form-row">
                            <label>Activity<input [(ngModel)]="itineraryForm.activity_name" name="activity_name" required /></label>
                            <label>Location<input [(ngModel)]="itineraryForm.location" name="location" /></label>
                          </div>
                          <div class="form-row">
                            <label>Date<input [(ngModel)]="itineraryForm.activity_date" name="activity_date" type="date" required /></label>
                            <label>Time<input [(ngModel)]="itineraryForm.activity_time" name="activity_time" type="time" /></label>
                          </div>
                          <label>Notes<input [(ngModel)]="itineraryForm.notes" name="notes" /></label>
                          <div class="form-actions">
                            <button type="submit">{{ itineraryEditId ? 'Update' : 'Add' }}</button>
                            <button type="button" (click)="cancelItineraryForm()">Cancel</button>
                          </div>
                        </form>
                      }

                      @if (itineraryLoading) {
                        <p>Loading itinerary...</p>
                      } @else if (itineraryItems.length === 0) {
                        <p class="empty">No itinerary items yet.</p>
                      } @else {
                        <table class="itinerary-table">
                          <thead>
                            <tr>
                              <th>Activity</th><th>Location</th><th>Date</th><th>Time</th><th>Notes</th><th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (item of itineraryItems; track item.itinerary_id) {
                              <tr>
                                <td>{{ item.activity_name }}</td>
                                <td>{{ item.location }}</td>
                                <td>{{ item.activity_date }}</td>
                                <td>{{ item.activity_time || '—' }}</td>
                                <td>{{ item.notes || '—' }}</td>
                                <td class="actions">
                                  <button class="btn-edit" (click)="editItinerary(item)">Edit</button>
                                  <button class="btn-delete" (click)="deleteItinerary(item.itinerary_id!)">Delete</button>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      }
                    </div>
                  </td>
                </tr>
              }
              @if (openMembersTripId === t.trip_id) {
                <tr>
                  <td [attr.colspan]="isAdmin ? 9 : 8" style="padding: 0;">
                    <div class="itinerary-panel">
                      <div class="itinerary-header">
                        <strong>Members — {{ t.destination }}</strong>
                      </div>

                      @if (membersError) {
                        <div class="error">{{ membersError }}</div>
                      }

                      <div class="members-add-row">
                        <select [(ngModel)]="addMemberUserId" name="addMemberUserId">
                          <option [value]="0" disabled>Select user to add</option>
                          @for (u of users; track u.user_id) {
                            <option [value]="u.user_id">{{ u.first_name }} {{ u.last_name }}</option>
                          }
                        </select>
                        <button (click)="addMember(t.trip_id!)">Add</button>
                      </div>

                      @if (membersLoading) {
                        <p>Loading members...</p>
                      } @else if (tripMembers.length === 0) {
                        <p class="empty">No collaborators yet.</p>
                      } @else {
                        <table class="itinerary-table">
                          <thead>
                            <tr><th>Name</th><th>Email</th><th>Added</th><th>Actions</th></tr>
                          </thead>
                          <tbody>
                            @for (m of tripMembers; track m.member_id) {
                              <tr>
                                <td>{{ m.user_name }}</td>
                                <td>{{ m.email }}</td>
                                <td>{{ m.added_at }}</td>
                                <td class="actions">
                                  <button class="btn-delete" (click)="removeMember(t.trip_id!, m.user_id)">Remove</button>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      }
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td [attr.colspan]="isAdmin ? 9 : 8" class="empty">No trips found.</td></tr>
            }
          </tbody>
        </table>
      }
      <!-- Offline Trips Section -->
      @if (offlineTrips.length > 0) {
        <div class="offline-section">
          <h3>Saved Offline</h3>
          @for (entry of offlineTrips; track entry.trip.trip_id) {
            <div class="offline-card">
              <div class="offline-card-header">
                <div>
                  <strong>{{ entry.trip.destination }}</strong>
                  <span class="offline-dates"> {{ entry.trip.start_date }} → {{ entry.trip.end_date }}</span>
                </div>
                <button class="btn-delete" (click)="removeOffline(entry.trip.trip_id!)">Remove</button>
              </div>
              <div class="offline-meta">
                Status: <span class="badge status-{{ entry.trip.status?.toLowerCase() }}">{{ entry.trip.status }}</span>
                @if (entry.trip.purpose) { &nbsp;· Purpose: {{ entry.trip.purpose }} }
                @if (entry.trip.estimated_budget) { &nbsp;· Budget: {{ '$' + entry.trip.estimated_budget }} }
              </div>
              @if (entry.itineraryItems.length > 0) {
                <table class="itinerary-table" style="margin-top:10px">
                  <thead>
                    <tr><th>Activity</th><th>Location</th><th>Date</th><th>Time</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    @for (item of entry.itineraryItems; track item.itinerary_id) {
                      <tr>
                        <td>{{ item.activity_name }}</td>
                        <td>{{ item.location }}</td>
                        <td>{{ item.activity_date }}</td>
                        <td>{{ item.activity_time || '—' }}</td>
                        <td>{{ item.notes || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="empty" style="margin:8px 0 0">No itinerary items saved.</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class TripsComponent implements OnInit {
  trips: Trip[] = [];
  users: User[] = [];
  loading = true;
  error = '';
  showForm = false;
  editId: number | null = null;
  form: Trip = this.blank();

  // Offline state
  offlineTrips: { trip: Trip, itineraryItems: ItineraryItem[] }[] = [];

  // Members state
  openMembersTripId: number | null = null;
  tripMembers: TripMember[] = [];
  membersLoading = false;
  membersError = '';
  addMemberUserId = 0;

  // Itinerary state
  openItineraryTripId: number | null = null;
  itineraryItems: ItineraryItem[] = [];
  itineraryLoading = false;
  itineraryError = '';
  showItineraryForm = false;
  itineraryEditId: number | null = null;
  itineraryForm: ItineraryItem = this.blankItinerary();

  get isAdmin(): boolean { return this.auth.isAdmin; }
  get currentUserId(): number { return this.auth.user?.user_id || 0; }

  constructor(private api: ApiService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (this.isAdmin) {
      this.api.getUsers().subscribe({ next: (u) => { this.users = u; this.cdr.detectChanges(); } });
    }
    this.loadOfflineTrips();
    this.load();
  }

  load() {
    this.loading = true;
    const userId = this.isAdmin ? undefined : this.auth.user!.user_id;
    this.api.getTrips(userId).subscribe({
      next: (data) => { this.trips = data; this.loading = false; this.cdr.detectChanges(); },
      error: (err) => { this.error = err.message; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  blank(): Trip {
    return { user_id: 0, destination: '', start_date: '', end_date: '', purpose: '', status: 'Pending', estimated_budget: 0 };
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) { this.editId = null; this.form = this.blank(); }
  }

  edit(t: Trip) {
    this.editId = t.trip_id!;
    this.form = { ...t };
    this.showForm = true;
  }

  save() {
    if (!this.isAdmin) {
      this.form.user_id = this.auth.user!.user_id;
      this.form.status = 'Pending';
    }
    const action = this.editId
      ? this.api.updateTrip(this.editId, this.form)
      : this.api.createTrip(this.form);
    action.subscribe({
      next: () => { this.showForm = false; this.editId = null; this.form = this.blank(); this.cdr.detectChanges(); this.load(); },
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  approve(id: number) {
    this.api.updateTripStatus(id, 'Approved').subscribe({
      next: () => this.load(),
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  reject(id: number) {
    this.api.updateTripStatus(id, 'Rejected').subscribe({
      next: () => this.load(),
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  delete(id: number) {
    if (confirm('Delete this trip? This will also delete its expenses.')) {
      this.api.deleteTrip(id).subscribe({
        next: () => this.load(),
        error: (err) => { this.error = err.error?.error || err.message; }
      });
    }
  }

  // ── Offline ──────────────────────────────────────────────────────────────────

  private offlineKey(): string { return `tms_offline_${this.auth.user?.user_id}`; }

  loadOfflineTrips() {
    try {
      const raw = localStorage.getItem(this.offlineKey());
      this.offlineTrips = raw ? JSON.parse(raw) : [];
    } catch { this.offlineTrips = []; }
    this.cdr.detectChanges();
  }

  isOfflineSaved(tripId: number): boolean {
    return this.offlineTrips.some(e => e.trip.trip_id === tripId);
  }

  saveOffline(t: Trip) {
    this.api.getItineraries(t.trip_id!).subscribe({
      next: (items) => {
        const existing = this.offlineTrips.filter(e => e.trip.trip_id !== t.trip_id);
        this.offlineTrips = [...existing, { trip: t, itineraryItems: items }];
        localStorage.setItem(this.offlineKey(), JSON.stringify(this.offlineTrips));
        this.cdr.detectChanges();
      },
      error: (err) => { this.error = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  removeOffline(tripId: number) {
    this.offlineTrips = this.offlineTrips.filter(e => e.trip.trip_id !== tripId);
    localStorage.setItem(this.offlineKey(), JSON.stringify(this.offlineTrips));
    this.cdr.detectChanges();
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  toggleMembers(t: Trip) {
    if (this.openMembersTripId === t.trip_id) {
      this.openMembersTripId = null;
      this.tripMembers = [];
      this.membersError = '';
    } else {
      this.openMembersTripId = t.trip_id!;
      this.addMemberUserId = 0;
      this.membersError = '';
      this.loadMembers(t.trip_id!);
    }
    this.cdr.detectChanges();
  }

  loadMembers(tripId: number) {
    this.membersLoading = true;
    this.api.getTripMembers(tripId).subscribe({
      next: (members) => { this.tripMembers = members; this.membersLoading = false; this.cdr.detectChanges(); },
      error: (err) => { this.membersError = err.error?.error || err.message; this.membersLoading = false; this.cdr.detectChanges(); }
    });
  }

  addMember(tripId: number) {
    if (!this.addMemberUserId) return;
    this.api.addTripMember(tripId, this.addMemberUserId).subscribe({
      next: () => { this.addMemberUserId = 0; this.loadMembers(tripId); },
      error: (err) => { this.membersError = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  removeMember(tripId: number, userId: number) {
    if (confirm('Remove this member from the trip?')) {
      this.api.removeTripMember(tripId, userId).subscribe({
        next: () => this.loadMembers(tripId),
        error: (err) => { this.membersError = err.error?.error || err.message; this.cdr.detectChanges(); }
      });
    }
  }

  // ── Budget helpers ───────────────────────────────────────────────────────────

  spent(t: Trip): number { return t.total_spent || 0; }
  isOverBudget(t: Trip): boolean { return this.spent(t) > (t.estimated_budget || 0); }
  isNearBudget(t: Trip): boolean { return !this.isOverBudget(t) && this.spent(t) >= (t.estimated_budget || 0) * 0.9; }

  // ── Itinerary ────────────────────────────────────────────────────────────────

  blankItinerary(): ItineraryItem {
    return { trip_id: 0, activity_name: '', location: '', activity_date: '', activity_time: null, notes: '' };
  }

  toggleItinerary(t: Trip) {
    if (this.openItineraryTripId === t.trip_id) {
      this.openItineraryTripId = null;
      this.itineraryItems = [];
      this.cancelItineraryForm();
    } else {
      this.openItineraryTripId = t.trip_id!;
      this.cancelItineraryForm();
      this.loadItineraries(t.trip_id!);
    }
    this.cdr.detectChanges();
  }

  loadItineraries(tripId: number) {
    this.itineraryLoading = true;
    this.itineraryError = '';
    this.api.getItineraries(tripId).subscribe({
      next: (items) => { this.itineraryItems = items; this.itineraryLoading = false; this.cdr.detectChanges(); },
      error: (err) => { this.itineraryError = err.error?.error || err.message; this.itineraryLoading = false; this.cdr.detectChanges(); }
    });
  }

  addItineraryItem(tripId: number) {
    this.itineraryEditId = null;
    this.itineraryForm = this.blankItinerary();
    this.itineraryForm.trip_id = tripId;
    this.showItineraryForm = true;
    this.cdr.detectChanges();
  }

  editItinerary(item: ItineraryItem) {
    this.itineraryEditId = item.itinerary_id!;
    this.itineraryForm = { ...item };
    this.showItineraryForm = true;
    this.cdr.detectChanges();
  }

  cancelItineraryForm() {
    this.showItineraryForm = false;
    this.itineraryEditId = null;
    this.itineraryForm = this.blankItinerary();
    this.itineraryError = '';
    this.cdr.detectChanges();
  }

  saveItinerary() {
    const action = this.itineraryEditId
      ? this.api.updateItinerary(this.itineraryEditId, this.itineraryForm)
      : this.api.createItinerary(this.itineraryForm);
    action.subscribe({
      next: () => {
        this.cancelItineraryForm();
        this.loadItineraries(this.openItineraryTripId!);
      },
      error: (err) => { this.itineraryError = err.error?.error || err.message; this.cdr.detectChanges(); }
    });
  }

  deleteItinerary(id: number) {
    if (confirm('Delete this itinerary item?')) {
      this.api.deleteItinerary(id).subscribe({
        next: () => this.loadItineraries(this.openItineraryTripId!),
        error: (err) => { this.itineraryError = err.error?.error || err.message; this.cdr.detectChanges(); }
      });
    }
  }
}
