import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface User {
  user_id?: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  phone_number: string;
  is_active?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Trip {
  trip_id?: number;
  user_id: number;
  destination: string;
  start_date: string;
  end_date: string;
  purpose: string;
  status: string;
  estimated_budget: number;
  user_name?: string;
  total_spent?: number;
}

export interface Expense {
  expense_id?: number;
  trip_id: number;
  user_id: number;
  category: string;
  amount: number;
  expense_date: string;
  description: string;
  receipt_url: string;
  destination?: string;
}

export interface TripMember {
  member_id: number;
  user_id: number;
  user_name: string;
  email: string;
  added_at: string;
}

export interface ItineraryItem {
  itinerary_id?: number;
  trip_id: number;
  activity_name: string;
  location: string;
  activity_date: string;
  activity_time: string | null;
  notes: string;
  created_at?: string;
}

export interface Report {
  report_id?: number;
  trip_id: number;
  generated_by: number;
  total_expenses?: number;
  report_status?: string;
  destination?: string;
  generated_by_name?: string;
  generated_at?: string;
}

export interface AppNotification {
  notification_id: number;
  user_id: number;
  trip_id: number;
  message: string;
  notification_type: string;
  is_read: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  // Users
  getUsers(): Observable<User[]> { return this.http.get<User[]>(`${this.base}/users`); }
  createUser(u: User): Observable<User> { return this.http.post<User>(`${this.base}/users`, u); }
  updateUser(id: number, u: User): Observable<unknown> { return this.http.put(`${this.base}/users/${id}`, u); }
  deleteUser(id: number): Observable<unknown> { return this.http.delete(`${this.base}/users/${id}`); }

  // Trips
  getTrips(userId?: number): Observable<Trip[]> {
    const url = userId ? `${this.base}/trips?user_id=${userId}` : `${this.base}/trips`;
    return this.http.get<Trip[]>(url);
  }
  createTrip(t: Trip): Observable<Trip> { return this.http.post<Trip>(`${this.base}/trips`, t); }
  updateTrip(id: number, t: Trip): Observable<unknown> { return this.http.put(`${this.base}/trips/${id}`, t); }
  updateTripStatus(id: number, status: string): Observable<unknown> {
    return this.http.patch(`${this.base}/trips/${id}/status`, { status });
  }
  deleteTrip(id: number): Observable<unknown> { return this.http.delete(`${this.base}/trips/${id}`); }

  // Trip Members
  getTripMembers(tripId: number): Observable<TripMember[]> {
    return this.http.get<TripMember[]>(`${this.base}/trips/${tripId}/members`);
  }
  addTripMember(tripId: number, userId: number): Observable<unknown> {
    return this.http.post(`${this.base}/trips/${tripId}/members`, { user_id: userId });
  }
  removeTripMember(tripId: number, userId: number): Observable<unknown> {
    return this.http.delete(`${this.base}/trips/${tripId}/members/${userId}`);
  }

  // Itineraries
  getItineraries(tripId: number): Observable<ItineraryItem[]> {
    return this.http.get<ItineraryItem[]>(`${this.base}/itineraries?trip_id=${tripId}`);
  }
  createItinerary(item: ItineraryItem): Observable<ItineraryItem> {
    return this.http.post<ItineraryItem>(`${this.base}/itineraries`, item);
  }
  updateItinerary(id: number, item: ItineraryItem): Observable<unknown> {
    return this.http.put(`${this.base}/itineraries/${id}`, item);
  }
  deleteItinerary(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/itineraries/${id}`);
  }

  // Expenses
  getExpenses(): Observable<Expense[]> { return this.http.get<Expense[]>(`${this.base}/expenses`); }
  createExpense(e: Expense): Observable<Expense> { return this.http.post<Expense>(`${this.base}/expenses`, e); }
  updateExpense(id: number, e: Expense): Observable<unknown> { return this.http.put(`${this.base}/expenses/${id}`, e); }
  deleteExpense(id: number): Observable<unknown> { return this.http.delete(`${this.base}/expenses/${id}`); }

  // Reports
  getReports(dateFrom?: string, dateTo?: string): Observable<Report[]> {
    const params: string[] = [];
    if (dateFrom) params.push(`date_from=${dateFrom}`);
    if (dateTo)   params.push(`date_to=${dateTo}`);
    const qs = params.length ? '?' + params.join('&') : '';
    return this.http.get<Report[]>(`${this.base}/reports${qs}`);
  }
  createReport(r: { trip_id: number; generated_by: number }): Observable<Report> {
    return this.http.post<Report>(`${this.base}/reports`, r);
  }
  updateReportStatus(id: number, status: string): Observable<unknown> {
    return this.http.patch(`${this.base}/reports/${id}/status`, { status });
  }
  deleteReport(id: number): Observable<unknown> { return this.http.delete(`${this.base}/reports/${id}`); }

  // Notifications
  getNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.base}/notifications`);
  }
  markNotificationRead(id: number): Observable<unknown> {
    return this.http.patch(`${this.base}/notifications/${id}/read`, {});
  }
}
