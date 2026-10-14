import { useEffect, useMemo, useState } from "react";
import "./Reportes.css";

const API = "https://salesia-enterprise-api.vercel.app/api";

type Registro = Record<string, unknown>;
type TipoReporte = "ventas" | "pagos" | "inventario";

function obtenerLista(data: unknown): Registro[] {
  if (Array.isArray(data)) return data as Registro[];

  if (data && typeof data === "object") {
    const objeto = data as Registro;

    for (const clave of [
      "data",
      "items",
      "resultados",
      "ventas",
      "pagos",
      "productos",
      "clientes",
    ]) {
      if (Array.isArray(objeto[clave])) {
        return objeto[clave] as Registro[];
      }
    }
  }

  return [];
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined || valor === ""
    ? "—"
    : String(valor);
}

function numero(valor: unknown): number {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : 0;
}

function moneda(valor: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
  }).format(valor);
}

function fechaRegistro(registro: Registro): string {
  const valor =
    registro.created_at ??
    registro.fecha ??
    registro.fecha_venta ??
    registro.fecha_pago;

  if (!valor) return "";

  const fecha = new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) return "";

  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ].join("-");
}

function fechaVisible(valor: unknown): string {
  if (!valor) return "—";

  const fecha = new Date(String(valor));
  return Number.isNaN(fecha.getTime())
    ? texto(valor)
    : fecha.toLocaleDateString("es-PE");
}

function nombreDeCliente(registro: Registro): string {
  const nombre = registro.nombre_completo ?? registro.nombre;
  const apellido = registro.apellido;

  if (nombre && apellido) return `${nombre} ${apellido}`;

  return texto(
    nombre ??
      registro.razon_social ??
      registro.nombre_cliente ??
      registro.cliente_nombre
  );
}

function importe(registro: Registro): number {
  return numero(
    registro.total ??
      registro.monto ??
      registro.importe ??
      registro.precio_total
  );
}

function estadoRegistro(registro: Registro): string {
  return texto(registro.estado ?? registro.status);
}

function idRegistro(registro: Registro): string {
  return String(registro.id ?? registro.codigo ?? "");
}

function normalizarEstado(registro: Registro): string {
  return estadoRegistro(registro)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clasificarEstado(registro: Registro): string {
  const estado = normalizarEstado(registro);

  if (
    estado.includes("anulad") ||
    estado.includes("cancelad") ||
    estado.includes("rechazad")
  ) {
    return "Anuladas";
  }

  if (
    estado.includes("complet") ||
    estado.includes("pagad") ||
    estado.includes("finaliz") ||
    estado.includes("aprob")
  ) {
    return "Completadas";
  }

  if (
    estado.includes("pendient") ||
    estado.includes("proceso") ||
    estado.includes("parcial")
  ) {
    return "Pendientes";
  }

  return estado && estado !== "—" ? "Otros estados" : "Sin estado";
}

function nombreMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, 1);

  return fecha.toLocaleDateString("es-PE", {
    month: "short",
    year: "2-digit",
  });
}

export default function Reportes() {
  const [tipo, setTipo] = useState<TipoReporte>("ventas");

  const [ventas, setVentas] = useState<Registro[]>([]);
  const [pagos, setPagos] = useState<Registro[]>([]);
  const [productos, setProductos] = useState<Registro[]>([]);
  const [clientes, setClientes] = useState<Registro[]>([]);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargarReportes() {
    setCargando(true);
    setError("");

    try {
      const rutas = [
        `${API}/ventas`,
        `${API}/pagos`,
        `${API}/productos`,
        `${API}/clientes`,
      ];

      const respuestas = await Promise.all(
        rutas.map(async (ruta) => {
          try {
            const respuesta = await fetch(ruta);

            if (!respuesta.ok) {
              return { correcta: false, datos: [] as Registro[] };
            }

            return {
              correcta: true,
              datos: obtenerLista(await respuesta.json()),
            };
          } catch {
            return { correcta: false, datos: [] as Registro[] };
          }
        })
      );

      const [resVentas, resPagos, resProductos, resClientes] =
        respuestas;

      if (
        !resVentas.correcta &&
        !resPagos.correcta &&
        !resProductos.correcta
      ) {
        throw new Error(
          "No se pudieron cargar los reportes. Verifica que el backend esté iniciado."
        );
      }

      setVentas(resVentas.datos);
      setPagos(resPagos.datos);
      setProductos(resProductos.datos);
      setClientes(resClientes.datos);

      if (respuestas.some((respuesta) => !respuesta.correcta)) {
        setError(
          "Algunos datos no pudieron cargarse. Verifica las rutas en la documentación de la API."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar los reportes."
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarReportes();
  }, []);

  const mapaClientes = useMemo(() => {
    const mapa = new Map<string, string>();

    clientes.forEach((cliente) => {
      const id = idRegistro(cliente);
      if (id) mapa.set(id, nombreDeCliente(cliente));
    });

    return mapa;
  }, [clientes]);

  function obtenerNombreCliente(venta: Registro): string {
    const cliente = venta.cliente;

    if (cliente && typeof cliente === "object") {
      return nombreDeCliente(cliente as Registro);
    }

    const nombreDirecto =
      venta.cliente_nombre ?? venta.nombre_cliente;

    if (nombreDirecto) return String(nombreDirecto);

    const idCliente = venta.cliente_id;

    if (idCliente !== undefined && idCliente !== null) {
      return mapaClientes.get(String(idCliente)) ?? `Cliente #${idCliente}`;
    }

    return "Cliente no identificado";
  }

  const registros = useMemo(() => {
    if (tipo === "ventas") return ventas;
    if (tipo === "pagos") return pagos;
    return productos;
  }, [tipo, ventas, pagos, productos]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return registros.filter((registro) => {
      if (tipo !== "inventario") {
        const fecha = fechaRegistro(registro);
        if (desde && (!fecha || fecha < desde)) return false;
        if (hasta && (!fecha || fecha > hasta)) return false;
      }

      if (!termino) return true;

      const valores = Object.values(registro).flatMap((valor) => {
        if (valor === null || valor === undefined) return [];

        if (typeof valor !== "object") return [String(valor)];

        if (Array.isArray(valor)) {
          return valor.flatMap((elemento) =>
            elemento && typeof elemento === "object"
              ? Object.values(elemento as Registro).map((dato) =>
                  String(dato ?? "")
                )
              : [String(elemento ?? "")]
          );
        }

        return Object.values(valor as Registro).map((dato) =>
          String(dato ?? "")
        );
      });

      if (tipo === "ventas") {
        valores.push(obtenerNombreCliente(registro));
      }

      if (tipo === "pagos") {
        valores.push(
          String(registro.cliente ?? ""),
          String(registro.referencia ?? "")
        );
      }

      return valores.some((valor) =>
        valor.toLowerCase().includes(termino)
      );
    });
  }, [
    registros,
    tipo,
    desde,
    hasta,
    busqueda,
    mapaClientes,
  ]);

  const totalImporte = useMemo(
    () =>
      filtrados.reduce((suma, registro) => {
        if (tipo === "inventario") {
          const stock = numero(
            registro.stock ??
              registro.stock_actual ??
              registro.cantidad
          );
          const precio = numero(
            registro.precio ?? registro.precio_venta
          );

          return suma + stock * precio;
        }

        return suma + importe(registro);
      }, 0),
    [filtrados, tipo]
  );

  const analisisVentas = useMemo(() => {
    const porEstado = new Map<string, number>();
    const porMes = new Map<string, number>();
    const porCliente = new Map<string, number>();

    let importeCompletado = 0;
    let importePendiente = 0;
    let importeAnulado = 0;

    filtrados.forEach((venta) => {
      const monto = importe(venta);
      const estado = clasificarEstado(venta);
      const fecha = fechaRegistro(venta);
      const cliente = obtenerNombreCliente(venta);

      porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1);

      if (estado === "Completadas") importeCompletado += monto;
      else if (estado === "Pendientes") importePendiente += monto;
      else if (estado === "Anuladas") importeAnulado += monto;

      if (fecha) {
        const mes = fecha.slice(0, 7);
        porMes.set(mes, (porMes.get(mes) ?? 0) + monto);
      }

      porCliente.set(cliente, (porCliente.get(cliente) ?? 0) + monto);
    });

    const meses = [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([clave, monto]) => ({
        clave,
        etiqueta: nombreMes(clave),
        monto,
      }));

    const clientesTop = [...porCliente.entries()]
      .map(([nombre, monto]) => ({ nombre, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    const estados = [...porEstado.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const totalMes = meses.reduce((suma, mes) => suma + mes.monto, 0);
    const maxMes = Math.max(...meses.map((mes) => mes.monto), 1);
    const maxCliente = Math.max(
      ...clientesTop.map((cliente) => cliente.monto),
      1
    );
    const totalEstados = estados.reduce(
      (suma, estado) => suma + estado.cantidad,
      0
    );

    return {
      porEstado: estados,
      meses,
      clientesTop,
      importeCompletado,
      importePendiente,
      importeAnulado,
      ticketPromedio: filtrados.length ? totalImporte / filtrados.length : 0,
      totalMes,
      maxMes,
      maxCliente,
      totalEstados,
    };
  }, [filtrados, mapaClientes, totalImporte]);

  const titulo =
    tipo === "ventas"
      ? "Análisis de ventas"
      : tipo === "pagos"
        ? "Reporte de pagos"
        : "Reporte de inventario";

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
    setBusqueda("");
  }

  const coloresEstado: Record<string, string> = {
    Completadas: "#16856b",
    Pendientes: "#e8a23a",
    Anuladas: "#d95757",
    "Otros estados": "#4979ad",
    "Sin estado": "#9aa9bb",
  };

  return (
    <main className="reportes-page">
      <header className="reportes-header">
        <div>
          <span className="reportes-eyebrow">GESTIÓN EMPRESARIAL</span>
          <h1>Reportes</h1>
          <p>
            Analiza el rendimiento comercial y consulta la información
            de tu empresa.
          </p>
        </div>

        <button
          className="reportes-btn reportes-btn-primary"
          onClick={() => window.print()}
          disabled={cargando || filtrados.length === 0}
        >
          <span>▤</span> Imprimir / Guardar PDF
        </button>
      </header>

      <section className="reportes-resumen">
        <article className="reporte-card">
          <div className="reporte-card-icon ventas-icon">▥</div>
          <div>
            <span>Total de ventas</span>
            <strong>{ventas.length}</strong>
            <small>Registros disponibles</small>
          </div>
        </article>

        <article className="reporte-card">
          <div className="reporte-card-icon pagos-icon">S/</div>
          <div>
            <span>Total de pagos</span>
            <strong>{pagos.length}</strong>
            <small>Pagos registrados</small>
          </div>
        </article>

        <article className="reporte-card">
          <div className="reporte-card-icon productos-icon">▦</div>
          <div>
            <span>Productos</span>
            <strong>{productos.length}</strong>
            <small>Productos registrados</small>
          </div>
        </article>

        <article className="reporte-card">
          <div className="reporte-card-icon importe-icon">S/</div>
          <div>
            <span>
              {tipo === "inventario"
                ? "Valor del inventario"
                : tipo === "pagos"
                  ? "Total de pagos filtrados"
                  : "Importe de ventas"}
            </span>
            <strong>{moneda(totalImporte)}</strong>
            <small>{filtrados.length} registros filtrados</small>
          </div>
        </article>
      </section>

      <section className="reportes-panel">
        <div className="reportes-panel-heading">
          <div>
            <h2>Centro de reportes</h2>
            <p>Selecciona la información que deseas analizar.</p>
          </div>

          <button
            className="reportes-btn reportes-btn-secondary"
            onClick={() => void cargarReportes()}
            disabled={cargando}
          >
            ↻ Actualizar
          </button>
        </div>

        <div className="reportes-tabs">
          <button
            className={tipo === "ventas" ? "activo" : ""}
            onClick={() => setTipo("ventas")}
          >
            ▥ Ventas
          </button>
          <button
            className={tipo === "pagos" ? "activo" : ""}
            onClick={() => setTipo("pagos")}
          >
            S/ Pagos
          </button>
          <button
            className={tipo === "inventario" ? "activo" : ""}
            onClick={() => setTipo("inventario")}
          >
            ▦ Inventario
          </button>
        </div>

        <div className="reportes-filtros">
          <label>
            Desde
            <input
              type="date"
              value={desde}
              disabled={tipo === "inventario"}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>

          <label>
            Hasta
            <input
              type="date"
              value={hasta}
              disabled={tipo === "inventario"}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>

          <label className="reporte-busqueda">
            Buscar
            <input
              type="search"
              placeholder="Buscar en los registros..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>

          <button
            className="reportes-btn reportes-btn-secondary"
            onClick={limpiarFiltros}
          >
            Limpiar
          </button>
        </div>

        {tipo === "inventario" && (
          <p className="reportes-nota">
            El valor del inventario se calcula multiplicando el stock
            disponible por el precio de cada producto.
          </p>
        )}

        {error && <div className="reportes-alerta">{error}</div>}

        {cargando ? (
          <div className="reportes-cargando">Cargando información...</div>
        ) : tipo === "ventas" ? (
          <>
            <div className="analisis-encabezado">
              <div>
                <span className="analisis-etiqueta">RESUMEN COMERCIAL</span>
                <h3>Rendimiento de ventas</h3>
                <p>
                  Indicadores calculados con los registros que cumplen
                  los filtros seleccionados.
                </p>
              </div>
              <div className="analisis-total">
                <span>Importe analizado</span>
                <strong>{moneda(totalImporte)}</strong>
                <small>{filtrados.length} ventas</small>
              </div>
            </div>

            <div className="analisis-kpis">
              <article className="analisis-kpi">
                <span className="analisis-kpi-icon azul">▥</span>
                <div>
                  <small>Ventas registradas</small>
                  <strong>{filtrados.length}</strong>
                  <span>Según filtros actuales</span>
                </div>
              </article>

              <article className="analisis-kpi">
                <span className="analisis-kpi-icon verde">✓</span>
                <div>
                  <small>Importe completado</small>
                  <strong>{moneda(analisisVentas.importeCompletado)}</strong>
                  <span>Ventas completadas</span>
                </div>
              </article>

              <article className="analisis-kpi">
                <span className="analisis-kpi-icon amarillo">◷</span>
                <div>
                  <small>Importe pendiente</small>
                  <strong>{moneda(analisisVentas.importePendiente)}</strong>
                  <span>Ventas por completar</span>
                </div>
              </article>

              <article className="analisis-kpi">
                <span className="analisis-kpi-icon celeste">S/</span>
                <div>
                  <small>Ticket promedio</small>
                  <strong>{moneda(analisisVentas.ticketPromedio)}</strong>
                  <span>Importe promedio por venta</span>
                </div>
              </article>
            </div>

            <div className="analisis-graficos">
              <article className="analisis-panel">
                <div className="analisis-panel-titulo">
                  <div>
                    <h3>Ventas por mes</h3>
                    <p>Importe mensual de los registros filtrados</p>
                  </div>
                  <span className="analisis-mini-badge">S/ PEN</span>
                </div>

                {analisisVentas.meses.length === 0 ? (
                  <div className="analisis-sin-datos">
                    No hay fechas válidas para construir el gráfico.
                  </div>
                ) : (
                  <div className="grafico-barras">
                    {analisisVentas.meses.map((mes) => {
                      const alto = Math.max(
                        (mes.monto / analisisVentas.maxMes) * 100,
                        mes.monto > 0 ? 5 : 0
                      );

                      return (
                        <div className="grafico-barra-columna" key={mes.clave}>
                          <span className="grafico-barra-importe">
                            {moneda(mes.monto)}
                          </span>
                          <div className="grafico-barra-area">
                            <div
                              className="grafico-barra"
                              style={{ height: `${alto}%` }}
                              title={`${mes.etiqueta}: ${moneda(mes.monto)}`}
                            />
                          </div>
                          <span className="grafico-barra-etiqueta">
                            {mes.etiqueta}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="analisis-panel-pie">
                  <span>
                    Total de los meses mostrados
                  </span>
                  <strong>{moneda(analisisVentas.totalMes)}</strong>
                </div>
              </article>

              <article className="analisis-panel">
                <div className="analisis-panel-titulo">
                  <div>
                    <h3>Estado de las ventas</h3>
                    <p>Distribución de registros por estado</p>
                  </div>
                </div>

                {analisisVentas.totalEstados === 0 ? (
                  <div className="analisis-sin-datos">
                    No hay ventas para analizar.
                  </div>
                ) : (
                  <>
                    <div className="estado-resumen-total">
                      <strong>{analisisVentas.totalEstados}</strong>
                      <span>ventas analizadas</span>
                    </div>

                    <div className="estado-lista">
                      {analisisVentas.porEstado.map((estado) => {
                        const porcentaje =
                          (estado.cantidad /
                            analisisVentas.totalEstados) *
                          100;

                        return (
                          <div className="estado-item" key={estado.nombre}>
                            <div className="estado-item-cabecera">
                              <span>
                                <i
                                  className="estado-punto"
                                  style={{
                                    background:
                                      coloresEstado[estado.nombre] ??
                                      coloresEstado["Otros estados"],
                                  }}
                                />
                                {estado.nombre}
                              </span>
                              <strong>
                                {estado.cantidad} · {porcentaje.toFixed(0)}%
                              </strong>
                            </div>
                            <div className="estado-progreso-fondo">
                              <div
                                className="estado-progreso"
                                style={{
                                  width: `${porcentaje}%`,
                                  background:
                                    coloresEstado[estado.nombre] ??
                                    coloresEstado["Otros estados"],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </article>
            </div>

            <article className="analisis-panel analisis-clientes">
              <div className="analisis-panel-titulo">
                <div>
                  <h3>Principales clientes</h3>
                  <p>
                    Ranking por importe acumulado de las ventas filtradas
                  </p>
                </div>
                <span className="analisis-mini-badge">TOP 5</span>
              </div>

              {analisisVentas.clientesTop.length === 0 ? (
                <div className="analisis-sin-datos">
                  No hay clientes para mostrar.
                </div>
              ) : (
                <div className="ranking-clientes">
                  {analisisVentas.clientesTop.map((cliente, indice) => (
                    <div className="ranking-cliente" key={cliente.nombre}>
                      <span className="ranking-numero">
                        {String(indice + 1).padStart(2, "0")}
                      </span>

                      <div className="ranking-datos">
                        <div className="ranking-cabecera">
                          <strong>{cliente.nombre}</strong>
                          <span>{moneda(cliente.monto)}</span>
                        </div>
                        <div className="ranking-fondo">
                          <div
                            className="ranking-progreso"
                            style={{
                              width: `${
                                (cliente.monto / analisisVentas.maxCliente) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <footer className="reportes-tabla-footer">
              <span>
                Reporte generado el {new Date().toLocaleDateString("es-PE")}
              </span>
              <span>Ventas incluidas: {filtrados.length}</span>
            </footer>
          </>
        ) : (
          <>
            <div className="reportes-tabla-header">
              <div>
                <h3>{titulo}</h3>
                <span>{filtrados.length} registros encontrados</span>
              </div>
              <span className="reporte-etiqueta">
                {tipo === "inventario" ? "Stock actual" : "Datos registrados"}
              </span>
            </div>

            <div className="reportes-tabla-contenedor">
              <table className="reportes-tabla">
                <thead>
                  {tipo === "pagos" && (
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>Venta</th>
                      <th>Fecha</th>
                      <th>Método</th>
                      <th>Estado</th>
                      <th className="alinear-derecha">Importe</th>
                    </tr>
                  )}

                  {tipo === "inventario" && (
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th className="alinear-derecha">Stock</th>
                      <th className="alinear-derecha">Precio</th>
                      <th className="alinear-derecha">Valor total</th>
                    </tr>
                  )}
                </thead>

                <tbody>
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="reporte-vacio">
                        No hay registros para mostrar con los filtros
                        seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filtrados.map((registro, indice) => {
                      const stock = numero(
                        registro.stock ??
                          registro.stock_actual ??
                          registro.cantidad
                      );
                      const precio = numero(
                        registro.precio ?? registro.precio_venta
                      );

                      return (
                        <tr
                          key={texto(
                            registro.id ?? registro.codigo ?? indice
                          )}
                        >
                          {tipo === "pagos" && (
                            <>
                              <td className="reporte-codigo">
                                {texto(registro.id ?? registro.codigo)}
                              </td>
                              <td>
                                {texto(
                                  registro.cliente_nombre ??
                                    registro.nombre_cliente ??
                                    registro.cliente
                                )}
                              </td>
                              <td>
                                {texto(registro.venta_id ?? registro.venta)}
                              </td>
                              <td>
                                {fechaVisible(
                                  registro.fecha_pago ?? registro.created_at
                                )}
                              </td>
                              <td>
                                {texto(
                                  registro.metodo_pago ?? registro.metodo
                                )}
                              </td>
                              <td>
                                <span className="reporte-estado">
                                  {estadoRegistro(registro)}
                                </span>
                              </td>
                              <td className="alinear-derecha">
                                {moneda(importe(registro))}
                              </td>
                            </>
                          )}

                          {tipo === "inventario" && (
                            <>
                              <td className="reporte-codigo">
                                {texto(registro.id ?? registro.codigo)}
                              </td>
                              <td>
                                {texto(
                                  registro.nombre ?? registro.nombre_producto
                                )}
                              </td>
                              <td>
                                {texto(
                                  registro.categoria_nombre ??
                                    registro.categoria_id
                                )}
                              </td>
                              <td className="alinear-derecha">{stock}</td>
                              <td className="alinear-derecha">
                                {moneda(precio)}
                              </td>
                              <td className="alinear-derecha">
                                {moneda(stock * precio)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="reportes-tabla-footer">
              <span>
                Reporte generado el {new Date().toLocaleDateString("es-PE")}
              </span>
              <span>Total de registros: {filtrados.length}</span>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}