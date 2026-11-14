import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).user() ? true : router.createUrlTree(['/login']);
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);
  return user.rol === route.data['rol'] ? true : router.createUrlTree([auth.homeFor(user.rol)]);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.user();
  return user ? inject(Router).createUrlTree([auth.homeFor(user.rol)]) : true;
};

export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.user();
  return inject(Router).createUrlTree([user ? auth.homeFor(user.rol) : '/login']);
};
