import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CONFIG } from '../config';
import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';

function destinoPublico() {
  return inject(DataService).necesitaConfiguracion() ? '/configuracion-inicial' : '/login';
}

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).verificarSesion() ? true : router.createUrlTree([destinoPublico()]);
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.verificarSesion()) return router.createUrlTree([destinoPublico()]);
  const user = auth.user()!;
  return user.rol === route.data['rol'] ? true : router.createUrlTree([auth.homeFor(user.rol)]);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (inject(DataService).necesitaConfiguracion()) return router.createUrlTree(['/configuracion-inicial']);
  const user = auth.verificarSesion() ? auth.user() : null;
  return user ? router.createUrlTree([auth.homeFor(user.rol)]) : true;
};

export const setupGuard: CanActivateFn = () =>
  inject(DataService).necesitaConfiguracion() ? true : inject(Router).createUrlTree(['/login']);

export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.verificarSesion()) return router.createUrlTree([auth.homeFor(auth.user()!.rol)]);
  return router.createUrlTree([destinoPublico()]);
};

export const correosGuard: CanActivateFn = () =>
  CONFIG.mostrarCorreosSimulados ? true : inject(Router).createUrlTree(['/login']);
