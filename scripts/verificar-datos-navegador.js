// Pegar en F12 > Console con la app abierta. Compara la base actual con los respaldos automáticos.
// Sirve para saber si se perdieron datos y de cuál respaldo se pueden recuperar.
(() => {
  const cuenta = (d) => Object.fromEntries(Object.entries(d).map(([n, v]) => [n, Array.isArray(v) ? v.length : v]));
  const leer = (k) => JSON.parse(localStorage.getItem(k));
  const actual = leer('flexya-datos');
  console.log('ACTUAL (versión ' + actual.version + ')', cuenta(actual.db));
  Object.keys(localStorage)
    .filter((k) => k.startsWith('flexya-respaldo'))
    .sort()
    .forEach((k) => console.log(k, '→', new Date(Number(k.split('-').pop())).toLocaleString('es-AR'), cuenta(leer(k).db)));
  console.table(actual.db.envios.map((e) => ({ id: e.id, estado: e.estado, cliente: e.clienteId, creado: e.creadoEn, retiro: e.fechaRetiro })));
})();
