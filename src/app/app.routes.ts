import { Routes } from '@angular/router';
import { authGuard, correosGuard, guestGuard, homeGuard, roleGuard, setupGuard } from './core/guards/auth.guards';
import { Shell } from './layout/shell';

const dashboard = () => import('./features/dashboard/dashboard').then((m) => m.Dashboard);
const envios = () => import('./features/envios/envios-list').then((m) => m.EnviosList);
const misParadas = () => import('./features/mensajero/mis-paradas').then((m) => m.MisParadas);
const entregaDetalle = () => import('./features/mensajero/entrega-detalle').then((m) => m.EntregaDetalle);
const cuenta = () => import('./features/auth/cuenta').then((m) => m.Cuenta);
const productos = () => import('./features/productos/productos').then((m) => m.Productos);
const deposito = () => import('./features/deposito/deposito').then((m) => m.Deposito);

const historial = () => import('./features/envios/historial').then((m) => m.Historial);
const clientes = () => import('./features/admin/clientes').then((m) => m.Clientes);
const mensajeros = () => import('./features/admin/mensajeros').then((m) => m.Mensajeros);
const pagos = () => import('./features/pagos/pagos').then((m) => m.Pagos);
const ganancias = () => import('./features/pagos/ganancias').then((m) => m.Ganancias);
const reportes = () => import('./features/admin/reportes').then((m) => m.Reportes);

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'configuracion-inicial',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/configuracion-inicial').then((m) => m.ConfiguracionInicial),
  },
  {
    path: 'activar/:token',
    data: { tipo: 'ACTIVACION' },
    loadComponent: () => import('./features/auth/clave-enlace').then((m) => m.ClaveEnlace),
  },
  {
    path: 'restablecer/:token',
    data: { tipo: 'RECUPERACION' },
    loadComponent: () => import('./features/auth/clave-enlace').then((m) => m.ClaveEnlace),
  },
  {
    path: 'olvide',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/olvide').then((m) => m.Olvide),
  },
  {
    path: 'correos',
    canActivate: [correosGuard],
    loadComponent: () => import('./features/auth/correos').then((m) => m.Correos),
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
          { path: 'cuenta', loadComponent: cuenta },
          { path: 'envios', loadComponent: envios },
          { path: 'deposito', loadComponent: deposito },
          { path: 'clientes', loadComponent: clientes },
          { path: 'mensajeros', loadComponent: mensajeros },
          { path: 'pagos', loadComponent: pagos },
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
          { path: 'cuenta', loadComponent: cuenta },
          { path: 'productos', loadComponent: productos },
          { path: 'envios', loadComponent: envios },
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
          { path: 'cuenta', loadComponent: cuenta },
          { path: 'envios', loadComponent: misParadas },
          { path: 'envios/:id', loadComponent: entregaDetalle },
          { path: 'ganancias', loadComponent: ganancias },
          { path: 'historial', loadComponent: historial },
        ],
      },
    ],
  },
  { path: '**', canActivate: [homeGuard], children: [] },
];
