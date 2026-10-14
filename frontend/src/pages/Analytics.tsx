import { useCallback, useEffect, useMemo, useState } from "react";
import "./Analytics.css";

const API = "https://salesia-enterprise-api.vercel.app/api";

interface DetalleVenta {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: string | number;
  subtotal: string | number;
}

interface Venta {
  id: number;
  cliente_id: number;
  usuario_id: number | null;
  total: string | number;
  estado: string;
  created_at: string;
  detalles: DetalleVenta[];
}

interface TendenciaMensual {
  mes: string;
  cantidad_ventas: number;
  monto_total: number;
  ingresos_pagados: number;
}

interface AnalyticsResumenAPI {
  total_ventas: number;
  ventas_pagadas: number;
  ventas_pendientes: number;
  ingresos_totales: number;
  monto_pendiente: number;
  ticket_promedio: number;
  media_ventas: number;
  mediana_ventas: number;
  venta_minima: number;
  venta_maxima: number;
  probabilidad_pago_observada: number;
  tendencia_mensual: TendenciaMensual[];
}

interface AnalisisIA {
  estado: string;
  mensaje: string;
  total_ventas: number;
  monto_total: number;
  ventas_pagadas: number;
  ventas_pendientes: number;
  porcentaje_pago_observado: number;
  media_ventas: number;
  mediana_ventas: number;
  venta_minima: number;
  venta_maxima: number;
  varianza_poblacional?: number;
  desviacion_estandar_poblacional?: number;
  variable_aleatoria?: {
    esperanza_matematica: number;
    varianza: number;
    desviacion_estandar: number;
  };
  probabilidades?: {
    venta_pagada: number;
    venta_pendiente: number;
    importe_alto: number;
  };
  analisis_bayes?: {
    definicion: string;
    probabilidad_pagada_dado_importe_alto: number;
    probabilidad_importe_alto_dado_pagada: number;
    interpretacion: string;
  };
  ventas_por_mes: {
    mes: string;
    cantidad_ventas: number;
    monto_total: number;
  }[];
  recomendaciones: string[];
  prediccion_disponible: boolean;
  historial_suficiente?: boolean;
  criterio_prediccion: string;
  fecha_analisis: string;
}

interface PrediccionMensual {
  mes: string;
  ingresos_estimados: number;
}

interface HistorialPrediccion {
  mes: string;
  ingresos: number;
  cantidad_ventas: number;
}

interface PrediccionVentas {
  estado: string;
  modelo: string;
  mensaje: string;
  historial_mensual: HistorialPrediccion[];
  meses_historicos: number;
  total_ventas_historicas: number;
  predicciones: PrediccionMensual[];
  error_medio_absoluto: number | null;
  evaluacion_disponible?: boolean;
  fecha_analisis?: string;
  moneda: string;
  requisitos?: {
    meses_minimos: number;
    ventas_minimas: number;
    meses_disponibles: number;
    ventas_disponibles: number;
  };
}

type Periodo = "7" | "30" | "todos";

const numero = (valor: string | number | null | undefined): number => {
  const resultado = Number(valor ?? 0);
  return Number.isFinite(resultado) ? resultado : 0;
};

const moneda = (valor: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(numero(valor));

const porcentaje = (valor: number | undefined) =>
  `${numero(valor).toFixed(2)}%`;

const fechaCorta = (fecha: string) =>
  new Date(fecha).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });

const nombreMes = (mes: string) => {
  const [anio, numeroMes] = mes.split("-").map(Number);

  return new Date(anio, numeroMes - 1, 1).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });
};

export default function Analytics() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [analyticsAPI, setAnalyticsAPI] =
    useState<AnalyticsResumenAPI | null>(null);
  const [analisisIA, setAnalisisIA] = useState<AnalisisIA | null>(null);
  const [prediccion, setPrediccion] = useState<PrediccionVentas | null>(null);

  const [error, setError] = useState("");
  const [errorIA, setErrorIA] = useState("");
  const [errorPrediccion, setErrorPrediccion] = useState("");

  const [cargando, setCargando] = useState(true);
  const [actualizandoIA, setActualizandoIA] = useState(false);
  const [cargandoPrediccion, setCargandoPrediccion] = useState(false);

  const [periodo, setPeriodo] = useState<Periodo>("30");

  const cargarDatos = useCallback(async () => {
    try {
      setError("");

      const [respuestaVentas, respuestaAnalytics] = await Promise.all([
        fetch(`${API}/ventas`, { cache: "no-store" }),
        fetch(`${API}/analytics/resumen`, { cache: "no-store" }),
      ]);

      if (!respuestaVentas.ok) {
        throw new Error("No se pudo consultar el historial de ventas.");
      }

      if (!respuestaAnalytics.ok) {
        throw new Error("No se pudo consultar el resumen de Analytics.");
      }

      const datosVentas: Venta[] = await respuestaVentas.json();
      const datosAnalytics: AnalyticsResumenAPI =
        await respuestaAnalytics.json();

      setVentas(datosVentas);
      setAnalyticsAPI(datosAnalytics);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "OcurriÃ³ un error al cargar Analytics.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarAnalisisIA = useCallback(async () => {
    try {
      setActualizandoIA(true);
      setErrorIA("");

      const respuesta = await fetch(`${API}/ia/ventas`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!respuesta.ok) {
        throw new Error(
          `El anÃ¡lisis respondiÃ³ con el cÃ³digo ${respuesta.status}.`,
        );
      }

      const datos: AnalisisIA = await respuesta.json();
      setAnalisisIA(datos);
    } catch (err) {
      setErrorIA(
        err instanceof Error
          ? err.message
          : "No se pudo obtener el anÃ¡lisis de ventas.",
      );
    } finally {
      setActualizandoIA(false);
    }
  }, []);

  const cargarPrediccion = useCallback(async () => {
    try {
      setCargandoPrediccion(true);
      setErrorPrediccion("");

      const respuesta = await fetch(`${API}/ia/prediccion-ventas`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!respuesta.ok) {
        throw new Error(
          `La predicciÃ³n respondiÃ³ con el cÃ³digo ${respuesta.status}.`,
        );
      }

      const datos: PrediccionVentas = await respuesta.json();
      setPrediccion(datos);
    } catch (err) {
      setErrorPrediccion(
        err instanceof Error
          ? err.message
          : "No se pudo consultar la predicciÃ³n de ventas.",
      );
    } finally {
      setCargandoPrediccion(false);
    }
  }, []);

  const actualizarTodo = useCallback(() => {
    void cargarDatos();
    void cargarAnalisisIA();
    void cargarPrediccion();
  }, [cargarDatos, cargarAnalisisIA, cargarPrediccion]);

  useEffect(() => {
    void cargarDatos();
    void cargarAnalisisIA();
    void cargarPrediccion();

    window.addEventListener("salesia:datos-actualizados", actualizarTodo);
    window.addEventListener("focus", actualizarTodo);

    return () => {
      window.removeEventListener(
        "salesia:datos-actualizados",
        actualizarTodo,
      );
      window.removeEventListener("focus", actualizarTodo);
    };
  }, [cargarDatos, cargarAnalisisIA, cargarPrediccion, actualizarTodo]);

  const ventasFiltradas = useMemo(() => {
    const validas = ventas.filter(
      (venta) => venta.estado.toLowerCase() !== "anulada",
    );

    if (periodo === "todos") return validas;

    const dias = Number(periodo);
    const limite = new Date();

    limite.setDate(limite.getDate() - (dias - 1));
    limite.setHours(0, 0, 0, 0);

    return validas.filter((venta) => {
      const fecha = new Date(venta.created_at);
      return !Number.isNaN(fecha.getTime()) && fecha >= limite;
    });
  }, [ventas, periodo]);

  const resumen = useMemo(() => {
    const montos = ventasFiltradas.map((venta) => numero(venta.total));
    const cantidad = montos.length;
    const totalVentas = montos.reduce((suma, monto) => suma + monto, 0);
    const promedio = cantidad > 0 ? totalVentas / cantidad : 0;
    const ordenados = [...montos].sort((a, b) => a - b);

    let mediana = 0;

    if (cantidad > 0) {
      const mitad = Math.floor(cantidad / 2);

      mediana =
        cantidad % 2 === 0
          ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
          : ordenados[mitad];
    }

    const pagadas = ventasFiltradas.filter(
      (venta) => venta.estado.toLowerCase() === "pagada",
    );

    const pendientes = ventasFiltradas.filter(
      (venta) => venta.estado.toLowerCase() === "pendiente",
    );

    const anuladas = ventas.filter(
      (venta) => venta.estado.toLowerCase() === "anulada",
    );

    const montoPendiente = pendientes.reduce(
      (suma, venta) => suma + numero(venta.total),
      0,
    );

    const ingresos = pagadas.reduce(
      (suma, venta) => suma + numero(venta.total),
      0,
    );

    return {
      cantidad,
      totalVentas,
      promedio,
      mediana,
      minimo: cantidad > 0 ? Math.min(...montos) : 0,
      maximo: cantidad > 0 ? Math.max(...montos) : 0,
      cantidadPagadas: pagadas.length,
      cantidadPendientes: pendientes.length,
      montoPendiente,
      ingresos,
      anuladas: anuladas.length,
      porcentajePagadas:
        cantidad > 0 ? (pagadas.length / cantidad) * 100 : 0,
    };
  }, [ventas, ventasFiltradas]);

  const grafico = useMemo(() => {
    const agrupacion = new Map<
      string,
      { fecha: string; total: number; cantidad: number }
    >();

    ventasFiltradas.forEach((venta) => {
      const fecha = new Date(venta.created_at);
      if (Number.isNaN(fecha.getTime())) return;

      const clave = [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, "0"),
        String(fecha.getDate()).padStart(2, "0"),
      ].join("-");

      const registro = agrupacion.get(clave) ?? {
        fecha: clave,
        total: 0,
        cantidad: 0,
      };

      registro.total += numero(venta.total);
      registro.cantidad += 1;
      agrupacion.set(clave, registro);
    });

    return [...agrupacion.values()]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(-10);
  }, [ventasFiltradas]);

  const productos = useMemo(() => {
    const agrupacion = new Map<
      number,
      { productoId: number; cantidad: number; ingresos: number }
    >();

    ventasFiltradas.forEach((venta) => {
      venta.detalles?.forEach((detalle) => {
        const registro = agrupacion.get(detalle.producto_id) ?? {
          productoId: detalle.producto_id,
          cantidad: 0,
          ingresos: 0,
        };

        registro.cantidad += numero(detalle.cantidad);
        registro.ingresos += numero(detalle.subtotal);
        agrupacion.set(detalle.producto_id, registro);
      });
    });

    return [...agrupacion.values()]
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [ventasFiltradas]);

  const tendenciaMensual = analyticsAPI?.tendencia_mensual ?? [];
  const maximoGrafico = Math.max(...grafico.map((dato) => dato.total), 1);
  const maximoProducto = Math.max(
    ...productos.map((producto) => producto.cantidad),
    1,
  );
  const mejorDia = [...grafico].sort((a, b) => b.total - a.total)[0];

  const variableAleatoria = analisisIA?.variable_aleatoria;
  const probabilidades = analisisIA?.probabilidades;
  const bayes = analisisIA?.analisis_bayes;

  if (cargando) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <span className="analytics-spinner" />
          <p>Analizando los datos de ventas...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <span className="analytics-eyebrow">
            INTELIGENCIA DE NEGOCIOS
          </span>
          <h1>Analytics</h1>
          <p>
            Analiza las ventas, interpreta los resultados estadÃ­sticos y
            conoce mejor el rendimiento de tu negocio.
          </p>
        </div>

        <div className="analytics-filter">
          <label htmlFor="analytics-periodo">Periodo de anÃ¡lisis</label>
          <select
            id="analytics-periodo"
            value={periodo}
            onChange={(evento) =>
              setPeriodo(evento.target.value as Periodo)
            }
          >
            <option value="7">Ãšltimos 7 dÃ­as</option>
            <option value="30">Ãšltimos 30 dÃ­as</option>
            <option value="todos">Todo el historial</option>
          </select>
        </div>
      </header>

      {error && (
        <div className="analytics-error" role="alert">
          <strong>No se pudieron cargar los datos.</strong>
          <p>{error}</p>
          <button onClick={actualizarTodo}>Volver a intentar</button>
        </div>
      )}

      <section className="analytics-section-heading">
        <div>
          <h2>Resumen del negocio</h2>
          <p>
            Indicadores calculados con las ventas almacenadas en PostgreSQL.
          </p>
        </div>
        <span className="analytics-live">
          <span /> Datos de PostgreSQL
        </span>
      </section>

      <section className="analytics-kpis">
        <article className="analytics-kpi">
          <div className="analytics-kpi-top">
            <span>Ventas registradas</span>
            <span className="analytics-icon purple">â†—</span>
          </div>
          <strong>{resumen.cantidad}</strong>
          <small>Ventas vÃ¡lidas del periodo</small>
        </article>

        <article className="analytics-kpi">
          <div className="analytics-kpi-top">
            <span>Importe de ventas</span>
            <span className="analytics-icon blue">S/</span>
          </div>
          <strong>{moneda(resumen.totalVentas)}</strong>
          <small>Excluye ventas anuladas</small>
        </article>

        <article className="analytics-kpi">
          <div className="analytics-kpi-top">
            <span>Ticket promedio</span>
            <span className="analytics-icon green">âˆ‘</span>
          </div>
          <strong>{moneda(resumen.promedio)}</strong>
          <small>Promedio por venta vÃ¡lida</small>
        </article>

        <article className="analytics-kpi">
          <div className="analytics-kpi-top">
            <span>Importe pendiente</span>
            <span className="analytics-icon orange">!</span>
          </div>
          <strong>{moneda(resumen.montoPendiente)}</strong>
          <small>{resumen.cantidadPendientes} ventas pendientes</small>
        </article>
      </section>

      <section className="analytics-main-grid">
        <article className="analytics-card analytics-chart-card">
          <div className="analytics-card-heading">
            <div>
              <h2>Comportamiento de ventas</h2>
              <p>Importe total agrupado por dÃ­a.</p>
            </div>
            <span className="analytics-chart-legend">
              <span /> Importe en S/
            </span>
          </div>

          {grafico.length === 0 ? (
            <div className="analytics-empty">
              No hay ventas para mostrar en este periodo.
            </div>
          ) : (
            <div className="analytics-bars">
              {grafico.map((dato) => (
                <div className="analytics-bar-column" key={dato.fecha}>
                  <span className="analytics-bar-value">
                    {moneda(dato.total)}
                  </span>
                  <div className="analytics-bar-track">
                    <div
                      className="analytics-bar"
                      style={{
                        height: `${Math.max(
                          (dato.total / maximoGrafico) * 100,
                          3,
                        )}%`,
                      }}
                      title={`${moneda(dato.total)} Â· ${dato.cantidad} ventas`}
                    />
                  </div>
                  <span className="analytics-bar-label">
                    {fechaCorta(`${dato.fecha}T12:00:00`)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="analytics-chart-footer">
            <span>{grafico.length} dÃ­as con ventas</span>
            <span>{resumen.cantidad} operaciones analizadas</span>
          </div>
        </article>

        <article className="analytics-card">
          <div className="analytics-card-heading">
            <div>
              <h2>Indicadores estadÃ­sticos</h2>
              <p>Medidas calculadas sobre los importes de las ventas.</p>
            </div>
          </div>

          {[
            ["Media aritmÃ©tica", "Promedio de los importes", moneda(resumen.promedio)],
            ["Mediana", "Valor central de las ventas", moneda(resumen.mediana)],
            ["Venta mÃ­nima", "Menor importe vÃ¡lido", moneda(resumen.minimo)],
            ["Venta mÃ¡xima", "Mayor importe vÃ¡lido", moneda(resumen.maximo)],
            ["Ventas pagadas", "ProporciÃ³n observada", `${resumen.porcentajePagadas.toFixed(1)}%`],
          ].map(([titulo, descripcion, valor]) => (
            <div className="analytics-stat-row" key={titulo}>
              <div>
                <span>{titulo}</span>
                <small>{descripcion}</small>
              </div>
              <strong>{valor}</strong>
            </div>
          ))}

          <div className="analytics-stat-note">
            La media puede verse afectada por importes elevados. La mediana
            representa el valor central de las ventas ordenadas.
          </div>
        </article>
      </section>

      <section className="analytics-bottom-grid">
        <article className="analytics-card">
          <div className="analytics-card-heading">
            <div>
              <h2>Tendencia mensual</h2>
              <p>Resumen calculado por el backend.</p>
            </div>
          </div>

          {tendenciaMensual.length === 0 ? (
            <div className="analytics-empty">
              TodavÃ­a no hay ventas para mostrar por mes.
            </div>
          ) : (
            <div className="analytics-month-list">
              {tendenciaMensual.map((dato) => (
                <div className="analytics-stat-row" key={dato.mes}>
                  <div>
                    <span>{nombreMes(dato.mes)}</span>
                    <small>{dato.cantidad_ventas} ventas registradas</small>
                  </div>
                  <strong>{moneda(dato.monto_total)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="analytics-stat-note">
            La tendencia mensual muestra el historial completo del backend;
            el filtro superior afecta los indicadores y el grÃ¡fico diario.
          </div>
        </article>

        <article className="analytics-card">
          <div className="analytics-card-heading">
            <div>
              <h2>Productos mÃ¡s vendidos</h2>
              <p>Ordenados por unidades registradas en las ventas.</p>
            </div>
          </div>

          {productos.length === 0 ? (
            <div className="analytics-empty">
              TodavÃ­a no hay detalles de ventas para analizar.
            </div>
          ) : (
            <div className="analytics-products">
              {productos.map((producto, indice) => (
                <div className="analytics-product-row" key={producto.productoId}>
                  <span className="analytics-product-rank">{indice + 1}</span>

                  <div className="analytics-product-info">
                    <div className="analytics-product-label">
                      <strong>Producto #{producto.productoId}</strong>
                      <span>{producto.cantidad} unidades</span>
                    </div>

                    <div className="analytics-product-track">
                      <div
                        className="analytics-product-progress"
                        style={{
                          width: `${(producto.cantidad / maximoProducto) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <strong>{moneda(producto.ingresos)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="analytics-card analytics-insights-card">
        <div className="analytics-card-heading">
          <div>
            <h2>Insights del negocio</h2>
            <p>Observaciones basadas en los resultados estadÃ­sticos.</p>
          </div>
          <span className="analytics-insight-symbol">âœ¦</span>
        </div>

        {resumen.cantidad === 0 ? (
          <div className="analytics-empty">
            Registra ventas para generar conclusiones basadas en datos.
          </div>
        ) : (
          <div className="analytics-insights">
            <div className="analytics-insight">
              <span className="analytics-insight-dot blue-dot" />
              <div>
                <strong>Importe promedio</strong>
                <p>
                  El importe promedio es <b>{moneda(resumen.promedio)}</b>,
                  calculado a partir de {resumen.cantidad} ventas vÃ¡lidas.
                </p>
              </div>
            </div>

            <div className="analytics-insight">
              <span className="analytics-insight-dot green-dot" />
              <div>
                <strong>DistribuciÃ³n de importes</strong>
                <p>
                  La mediana es <b>{moneda(resumen.mediana)}</b>.
                  {resumen.promedio > resumen.mediana
                    ? " El promedio supera la mediana, lo que puede indicar que las ventas de importe elevado lo estÃ¡n aumentando."
                    : resumen.promedio < resumen.mediana
                      ? " El promedio estÃ¡ por debajo de la mediana, lo que puede indicar que algunos importes bajos lo reducen."
                      : " La media y la mediana coinciden en este periodo."}
                </p>
              </div>
            </div>

            <div className="analytics-insight">
              <span className="analytics-insight-dot orange-dot" />
              <div>
                <strong>Seguimiento de cobros</strong>
                <p>
                  Hay {resumen.cantidadPendientes} ventas pendientes por{" "}
                  <b>{moneda(resumen.montoPendiente)}</b>. Se recomienda
                  revisar esos cobros.
                </p>
              </div>
            </div>

            <div className="analytics-insight">
              <span className="analytics-insight-dot purple-dot" />
              <div>
                <strong>Rango de ventas</strong>
                <p>
                  Los importes van desde <b>{moneda(resumen.minimo)}</b> hasta{" "}
                  <b>{moneda(resumen.maximo)}</b> en el periodo seleccionado.
                </p>
              </div>
            </div>

            {mejorDia && (
              <div className="analytics-insight">
                <span className="analytics-insight-dot blue-dot" />
                <div>
                  <strong>DÃ­a con mayor importe</strong>
                  <p>
                    El dÃ­a {fechaCorta(`${mejorDia.fecha}T12:00:00`)} registrÃ³{" "}
                    <b>{moneda(mejorDia.total)}</b> en ventas.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ANALISIS ESTADISTICO E IA */}
      <section className="analytics-card analytics-insights-card">
        <div className="analytics-card-heading">
          <div>
            <span className="analytics-eyebrow">SALESIA INTELLIGENCE</span>
            <h2>âœ¦ AnÃ¡lisis de ventas con IA</h2>
            <p>
              AnÃ¡lisis estadÃ­stico calculado en el backend a partir de las
              ventas almacenadas en PostgreSQL.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void cargarAnalisisIA()}
            disabled={actualizandoIA}
          >
            {actualizandoIA ? "Analizando..." : "â†» Actualizar anÃ¡lisis"}
          </button>
        </div>

        {errorIA && (
          <div className="analytics-error" role="alert">
            <strong>No se pudo obtener el anÃ¡lisis de ventas.</strong>
            <p>{errorIA}</p>
            <button onClick={() => void cargarAnalisisIA()}>Reintentar</button>
          </div>
        )}

        {!analisisIA && !errorIA && (
          <div className="analytics-empty">
            {actualizandoIA ? "Analizando las ventas..." : "TodavÃ­a no hay un anÃ¡lisis disponible."}
          </div>
        )}

        {analisisIA && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
              <span style={{ padding: "7px 12px", borderRadius: 20, background: "#e0f7ed", color: "#087f5b", fontSize: 13, fontWeight: 700 }}>
                â— AnÃ¡lisis {analisisIA.estado === "ok" ? "completado" : analisisIA.estado}
              </span>

              <span style={{ padding: "7px 12px", borderRadius: 20, background: analisisIA.prediccion_disponible ? "#e0f2fe" : "#fff0d9", color: analisisIA.prediccion_disponible ? "#075985" : "#92400e", fontSize: 13, fontWeight: 700 }}>
                {analisisIA.prediccion_disponible ? "PredicciÃ³n disponible" : "PredicciÃ³n no disponible"}
              </span>
            </div>

            <p style={{ marginBottom: 20 }}>{analisisIA.mensaje}</p>

            <div className="analytics-kpis">
              <article className="analytics-kpi">
                <div className="analytics-kpi-top"><span>Ventas analizadas</span><span className="analytics-icon purple">âœ¦</span></div>
                <strong>{analisisIA.total_ventas}</strong>
                <small>Ventas incluidas en el anÃ¡lisis</small>
              </article>

              <article className="analytics-kpi">
                <div className="analytics-kpi-top"><span>Monto analizado</span><span className="analytics-icon blue">S/</span></div>
                <strong>{moneda(analisisIA.monto_total)}</strong>
                <small>Importe de ventas vÃ¡lidas</small>
              </article>

              <article className="analytics-kpi">
                <div className="analytics-kpi-top"><span>Pago observado</span><span className="analytics-icon green">%</span></div>
                <strong>{numero(analisisIA.porcentaje_pago_observado).toFixed(1)}%</strong>
                <small>{analisisIA.ventas_pagadas} pagadas de {analisisIA.total_ventas}</small>
              </article>

              <article className="analytics-kpi">
                <div className="analytics-kpi-top"><span>Ventas pendientes</span><span className="analytics-icon orange">!</span></div>
                <strong>{analisisIA.ventas_pendientes}</strong>
                <small>Requieren seguimiento de cobro</small>
              </article>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="analytics-card-heading">
                <div>
                  <h2>Medidas estadÃ­sticas</h2>
                  <p>Medidas de tendencia central y dispersiÃ³n de los importes.</p>
                </div>
              </div>

              <div className="analytics-main-grid">
                <div className="analytics-card">
                  {[
                    ["Media aritmÃ©tica", "Promedio de las ventas", moneda(analisisIA.media_ventas)],
                    ["Mediana", "Valor central de los importes", moneda(analisisIA.mediana_ventas)],
                    ["Valor mÃ­nimo", "Venta de menor importe", moneda(analisisIA.venta_minima)],
                    ["Valor mÃ¡ximo", "Venta de mayor importe", moneda(analisisIA.venta_maxima)],
                  ].map(([titulo, descripcion, valor]) => (
                    <div className="analytics-stat-row" key={titulo}>
                      <div><span>{titulo}</span><small>{descripcion}</small></div>
                      <strong>{valor}</strong>
                    </div>
                  ))}
                </div>

                <div className="analytics-card">
                  <div className="analytics-stat-row">
                    <div><span>Esperanza matemÃ¡tica</span><small>Valor esperado de una venta</small></div>
                    <strong>{moneda(variableAleatoria?.esperanza_matematica ?? analisisIA.media_ventas)}</strong>
                  </div>

                  <div className="analytics-stat-row">
                    <div><span>Varianza poblacional</span><small>DispersiÃ³n de los importes al cuadrado</small></div>
                    <strong>{numero(variableAleatoria?.varianza ?? analisisIA.varianza_poblacional).toLocaleString("es-PE", { maximumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="analytics-stat-row">
                    <div><span>DesviaciÃ³n estÃ¡ndar</span><small>DispersiÃ³n respecto a la media</small></div>
                    <strong>{moneda(variableAleatoria?.desviacion_estandar ?? analisisIA.desviacion_estandar_poblacional ?? 0)}</strong>
                  </div>

                  <div className="analytics-stat-note">
                    Una desviaciÃ³n estÃ¡ndar alta indica que los importes de las ventas estÃ¡n mÃ¡s dispersos alrededor de la media.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="analytics-card-heading">
                <div>
                  <h2>Probabilidades observadas</h2>
                  <p>Proporciones calculadas a partir de las ventas registradas.</p>
                </div>
              </div>

              {probabilidades ? (
                <div className="analytics-kpis">
                  <article className="analytics-kpi">
                    <div className="analytics-kpi-top"><span>Probabilidad de pago</span><span className="analytics-icon green">âœ“</span></div>
                    <strong>{porcentaje(probabilidades.venta_pagada)}</strong>
                    <small>ProporciÃ³n de ventas que estÃ¡n pagadas</small>
                  </article>

                  <article className="analytics-kpi">
                    <div className="analytics-kpi-top"><span>Probabilidad de pendiente</span><span className="analytics-icon orange">!</span></div>
                    <strong>{porcentaje(probabilidades.venta_pendiente)}</strong>
                    <small>ProporciÃ³n de ventas pendientes</small>
                  </article>

                  <article className="analytics-kpi">
                    <div className="analytics-kpi-top"><span>Probabilidad de importe alto</span><span className="analytics-icon purple">â†—</span></div>
                    <strong>{porcentaje(probabilidades.importe_alto)}</strong>
                    <small>Ventas iguales o superiores a la mediana</small>
                  </article>
                </div>
              ) : (
                <div className="analytics-empty">El backend todavÃ­a no devuelve los datos de probabilidades.</div>
              )}

              <div className="analytics-stat-note" style={{ marginTop: 16 }}>
                Estas probabilidades describen las ventas registradas. No garantizan que el mismo resultado ocurra en el futuro.
              </div>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="analytics-card-heading">
                <div>
                  <h2>Teorema de Bayes</h2>
                  <p>AnÃ¡lisis de la relaciÃ³n entre los importes altos y el estado de pago.</p>
                </div>
              </div>

              {bayes ? (
                <div className="analytics-card">
                  <div className="analytics-stat-note">
                    <strong>DefiniciÃ³n utilizada</strong>
                    <p style={{ marginTop: 8 }}>{bayes.definicion}</p>
                  </div>

                  <div className="analytics-main-grid" style={{ marginTop: 18 }}>
                    <div className="analytics-card">
                      <span style={{ color: "#64748b", fontSize: 13 }}>Probabilidad de pago dado un importe alto</span>
                      <h2 style={{ marginTop: 10 }}>{porcentaje(bayes.probabilidad_pagada_dado_importe_alto)}</h2>
                      <p style={{ fontSize: 13, color: "#64748b" }}>P(Pagada | Importe alto)</p>
                    </div>

                    <div className="analytics-card">
                      <span style={{ color: "#64748b", fontSize: 13 }}>Probabilidad de importe alto dado que estÃ¡ pagada</span>
                      <h2 style={{ marginTop: 10 }}>{porcentaje(bayes.probabilidad_importe_alto_dado_pagada)}</h2>
                      <p style={{ fontSize: 13, color: "#64748b" }}>P(Importe alto | Pagada)</p>
                    </div>
                  </div>

                  <div className="analytics-stat-note" style={{ marginTop: 18 }}>
                    <strong>InterpretaciÃ³n de los resultados</strong>
                    <p style={{ marginTop: 8 }}>{bayes.interpretacion}</p>
                  </div>
                </div>
              ) : (
                <div className="analytics-empty">El backend todavÃ­a no devuelve el anÃ¡lisis de Bayes.</div>
              )}
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="analytics-card-heading">
                <div>
                  <h2>Recomendaciones del anÃ¡lisis</h2>
                  <p>Sugerencias generadas por el backend segÃºn los datos actuales.</p>
                </div>
              </div>

              {!analisisIA.recomendaciones?.length ? (
                <div className="analytics-empty">No hay recomendaciones para mostrar.</div>
              ) : (
                <div className="analytics-insights">
                  {analisisIA.recomendaciones.map((recomendacion, indice) => (
                    <div className="analytics-insight" key={indice}>
                      <span className="analytics-insight-dot purple-dot" />
                      <div><strong>RecomendaciÃ³n {indice + 1}</strong><p>{recomendacion}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analisisIA.ventas_por_mes?.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div className="analytics-card-heading">
                  <div><h2>Datos mensuales analizados</h2><p>Importes y cantidad de ventas por mes.</p></div>
                </div>

                {analisisIA.ventas_por_mes.map((dato) => (
                  <div className="analytics-stat-row" key={dato.mes}>
                    <div><span>{nombreMes(dato.mes)}</span><small>{dato.cantidad_ventas} ventas</small></div>
                    <strong>{moneda(dato.monto_total)}</strong>
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 22, fontSize: 12, color: "#64748b" }}>
              Ãšltimo anÃ¡lisis: {new Date(analisisIA.fecha_analisis).toLocaleString("es-PE")}
            </p>
          </>
        )}
      </section>

      {/* PREDICCION REAL DE LOS PROXIMOS TRES MESES */}
      <section className="analytics-card analytics-insights-card">
        <div className="analytics-card-heading">
          <div>
            <span className="analytics-eyebrow">SALESIA PREDICTIVE</span>
            <h2>PredicciÃ³n de ventas</h2>
            <p>
              EstimaciÃ³n de ingresos futuros mediante regresiÃ³n lineal de
              scikit-learn.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void cargarPrediccion()}
            disabled={cargandoPrediccion}
          >
            {cargandoPrediccion ? "Calculando..." : "â†» Actualizar predicciÃ³n"}
          </button>
        </div>

        {errorPrediccion && (
          <div className="analytics-error" role="alert">
            <strong>No se pudo obtener la predicciÃ³n.</strong>
            <p>{errorPrediccion}</p>
            <button onClick={() => void cargarPrediccion()}>Reintentar</button>
          </div>
        )}

        {!prediccion && !errorPrediccion && (
          <div className="analytics-empty">
            {cargandoPrediccion
              ? "Consultando el modelo predictivo..."
              : "TodavÃ­a no hay resultados disponibles."}
          </div>
        )}

        {prediccion && (
          <>
            <div className="analytics-kpis">
              <article className="analytics-kpi">
                <div className="analytics-kpi-top">
                  <span>Meses histÃ³ricos</span>
                  <span className="analytics-icon purple">â—·</span>
                </div>
                <strong>{prediccion.meses_historicos}</strong>
                <small>Meses con ventas registradas</small>
              </article>

              <article className="analytics-kpi">
                <div className="analytics-kpi-top">
                  <span>Ventas histÃ³ricas</span>
                  <span className="analytics-icon blue">â†—</span>
                </div>
                <strong>{prediccion.total_ventas_historicas}</strong>
                <small>Ventas vÃ¡lidas analizadas</small>
              </article>

              <article className="analytics-kpi">
                <div className="analytics-kpi-top">
                  <span>Error medio absoluto</span>
                  <span className="analytics-icon orange">Â±</span>
                </div>
                <strong>
                  {prediccion.error_medio_absoluto === null
                    ? "N/D"
                    : moneda(prediccion.error_medio_absoluto)}
                </strong>
                <small>
                  {prediccion.evaluacion_disponible
                    ? "EvaluaciÃ³n de los Ãºltimos dos meses"
                    : "AÃºn no se puede evaluar el modelo"}
                </small>
              </article>
            </div>

            <div className="analytics-stat-note" style={{ marginTop: 16 }}>
              <strong>{prediccion.modelo}</strong>
              <p style={{ marginTop: 8 }}>{prediccion.mensaje}</p>
              <p style={{ marginTop: 8 }}>
                <strong>Estado:</strong>{" "}
                {prediccion.estado === "entrenado"
                  ? "Modelo entrenado"
                  : "Historial insuficiente"}
              </p>
            </div>

            {prediccion.estado === "entrenado" &&
            prediccion.predicciones.length > 0 ? (
              <div style={{ marginTop: 24 }}>
                <div className="analytics-card-heading">
                  <div>
                    <h2>Ingresos estimados</h2>
                    <p>Predicciones calculadas para los siguientes tres meses.</p>
                  </div>
                </div>

                <div className="analytics-kpis">
                  {prediccion.predicciones.map((dato, indice) => (
                    <article className="analytics-kpi" key={dato.mes}>
                      <div className="analytics-kpi-top">
                        <span>{nombreMes(dato.mes)}</span>
                        <span className="analytics-icon green">{indice + 1}</span>
                      </div>
                      <strong>{moneda(dato.ingresos_estimados)}</strong>
                      <small>Ingreso mensual estimado</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="analytics-stat-note" style={{ marginTop: 16 }}>
                <strong>Â¿QuÃ© falta para generar predicciones?</strong>
                <p style={{ marginTop: 8 }}>
                  El modelo requiere al menos seis meses con ventas registradas
                  y un mÃ­nimo de treinta ventas vÃ¡lidas.
                </p>

                {prediccion.requisitos && (
                  <ul>
                    <li>
                      Meses disponibles: {prediccion.requisitos.meses_disponibles}
                      {" / "}
                      {prediccion.requisitos.meses_minimos}
                    </li>
                    <li>
                      Ventas disponibles: {prediccion.requisitos.ventas_disponibles}
                      {" / "}
                      {prediccion.requisitos.ventas_minimas}
                    </li>
                  </ul>
                )}
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <div className="analytics-card-heading">
                <div>
                  <h2>Historial utilizado por el modelo</h2>
                  <p>Ingresos y cantidad de ventas agrupados por mes.</p>
                </div>
              </div>

              {prediccion.historial_mensual.length === 0 ? (
                <div className="analytics-empty">No hay historial mensual disponible.</div>
              ) : (
                <div className="analytics-month-list">
                  {prediccion.historial_mensual.map((dato) => (
                    <div className="analytics-stat-row" key={dato.mes}>
                      <div>
                        <span>{nombreMes(dato.mes)}</span>
                        <small>{dato.cantidad_ventas} ventas</small>
                      </div>
                      <strong>{moneda(dato.ingresos)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="analytics-stat-note" style={{ marginTop: 16 }}>
              Las predicciones son estimaciones, no ingresos garantizados. El
              error medio absoluto mide la diferencia promedio entre los
              ingresos observados y los estimados durante la evaluaciÃ³n.
            </div>

            {prediccion.fecha_analisis && (
              <p style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
                Fecha del cÃ¡lculo:{" "}
                {new Date(prediccion.fecha_analisis).toLocaleString("es-PE")}
              </p>
            )}
          </>
        )}
      </section>

      <footer className="analytics-footer">
        <span>SalesIA Enterprise Â· MÃ³dulo Analytics e IA</span>
        <span>
          Backend conectado Â· {analyticsAPI?.total_ventas ?? 0} ventas en el sistema
        </span>
      </footer>
    </main>
  );
}