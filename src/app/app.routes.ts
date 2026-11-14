import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeGuard, roleGuard } from './core/guards/auth.guards';
import { Shell } from './layout/shell';

const dashboard = () => import('./features/dashboard/dashboard').then((m) => m.Dashboard);
const envios = () => import('./features/envios/envios-list').then((m) => m.EnviosList);
const nuevoEnvio = () => import('./features/envios/nuevo-envio').then((m) => m.NuevoEnvio);
const misParadas = () => import('./features/mensajero/mis-paradas').then((m) => m.MisParadas);
const entregaDetalle = () => import('./features/mensajero/entrega-detalle').then((m) => m.EntregaDetalle);
const deposito = () => import('./features/deposito/deposito').then((m) => m.Deposito);

const historial = () => import('./features/envios/historial').then((m) => m.Historial);
const clientes = () => import('./features/admin/clientes').then((m) => m.Clientes);
const mensajeros = () => import('./features/admin/mensajeros').then((m) => m.Mensajeros);
const reportes = () => import('./features/admin/reportes').then((m) => m.Reportes);

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { rol: 'admin' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'inicio' },
          { path: 'inicio', loadComponent: dashboard },
          { path: 'envios', loadComponent: envios },
          { path: 'deposito', loadComponent: deposito },
          { path: 'clientes', loadComponent: clientes },
          { path: 'mensajeros', loadComponent: mensajeros },
          { path: 'reportes', loadComponent: reportes },
        ],
      },
      {
        path: 'cliente',
        canActivate: [roleGuard],
        data: { rol: 'cliente' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'inicio' },
          { path: 'inicio', loadComponent: dashboard },
          { path: 'envios', loadComponent: envios },
          { path: 'envios/nuevo', loadComponent: nuevoEnvio },
          { path: 'deposito', loadComponent: deposito },
          { path: 'historial', loadComponent: historial },
        ],
      },
      {
        path: 'mensajero',
        canActivate: [roleGuard],
        data: { rol: 'mensajero' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'inicio' },
          { path: 'inicio', loadComponent: dashboard },
          { path: 'envios', loadComponent: misParadas },
          { path: 'envios/:id', loadComponent: entregaDetalle },
          { path: 'historial', loadComponent: historial },
        ],
      },
    ],
  },
  { path: '**', canActivate: [homeGuard], children: [] },
];
