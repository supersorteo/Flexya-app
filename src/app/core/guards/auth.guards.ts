import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { CONFIG } from '../config';
import { rutaSegura } from '../ruta-segura';
import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';

function destinoPublico() {
  return inject(DataService).necesitaConfiguracion() ? '/configuracion-inicial' : '/login';
}

/** Sin sesión se va a iniciar sesión, pero se recuerda a dónde se quería ir para volver después (por ejemplo, a un paquete escaneado). */
function aIniciarSesion(router: Router, state?: RouterStateSnapshot) {
  const volver = rutaSegura(state?.url);
  return router.createUrlTree([destinoPublico()], volver && destinoPublico() === '/login' ? { queryParams: { volver } } : {});
}

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService).verificarSesion() ? true : aIniciarSesion(router, state);
};

export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.verificarSesion()) return aIniciarSesion(router, state);
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

export const homeGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.verificarSesion()) return router.createUrlTree([auth.homeFor(auth.user()!.rol)]);
  return aIniciarSesion(router, state);
};

export const correosGuard: CanActivateFn = () =>
  CONFIG.mostrarCorreosSimulados ? true : inject(Router).createUrlTree(['/login']);
