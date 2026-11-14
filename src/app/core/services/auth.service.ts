import { Injectable, inject, signal } from '@angular/core';
import { Rol, Usuario } from '../models';
import { DataService } from './data.service';

const KEY = 'flexya-session-v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly data = inject(DataService);
  readonly user = signal<Usuario | null>(this.restore());

  login(email: string, password: string): Usuario | null {
    const found = this.data
      .usuarios()
      .find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
    if (!found) return null;
    this.user.set(found);
    try {
      localStorage.setItem(KEY, found.id);
    } catch {
      /* sesión solo en memoria */
    }
    console.log('[Flexya] Sesión iniciada', found);
    return found;
  }

  logout() {
    this.user.set(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }

  homeFor(rol: Rol): string {
    return `/${rol}/inicio`;
  }

  private restore(): Usuario | null {
    try {
      const id = localStorage.getItem(KEY);
      return this.data.usuarios().find((u) => u.id === id) ?? null;
    } catch {
      return null;
    }
  }
}
