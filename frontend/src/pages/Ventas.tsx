import { useEffect, useMemo, useState } from "react";
import "./Ventas.css";

const API = "https://salesia-enterprise-api.vercel.app/api";
const EVENTO_DATOS_ACTUALIZADOS = "salesia:datos-actualizados";
const MAX_VENTAS_HISTORIAL = 5;

interface Cliente {
  id: number;
  nombre: string;
  documento?: string | null;
}

interface Producto {
  id: number;
  nombre: string;
  precio: number | string;
  stock: number;
  estado: boolean;
}

interface DetalleVenta {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number | string;
  subtotal: number | string;
}

interface Venta {
  id: number;
  cliente_id: number;
  usuario_id: number | null;
  total: number | string;
  estado: string;
  created_at: string | null;
  detalles: DetalleVenta[];
}

interface ItemCarrito {
  producto_id: number;
  cantidad: number;
}

interface Estadisticas {
  total_ventas: number;
  ventas_pendientes: number;
  ventas_pagadas: number;
  ingresos_totales: number;
  monto_pendiente: number;
  ticket_promedio: number;
}

const estadisticasIniciales: Estadisticas = {
  total_ventas: 0,
  ventas_pendientes: 0,
  ventas_pagadas: 0,
  ingresos_totales: 0,
  monto_pendiente: 0,
  ticket_promedio: 0,
};

function dinero(valor: number | string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(Number(valor) || 0);
}

function fechaLegible(fecha: string | null): string {
  if (!fecha) return "—";

  const fechaValida = new Date(fecha);

  if (Number.isNaN(fechaValida.getTime())) return "—";

  return fechaValida.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizarEstado(estado: string): string {
  const valor = estado.toLowerCase().trim();

  if (valor.includes("pagad") || valor.includes("complet")) return "pagada";
  if (valor.includes("anulad") || valor.includes("cancel")) return "anulada";
  if (valor.includes("pendient")) return "pendiente";

  return valor.replace(/\s+/g, "-") || "sin-estado";
}

function Icono({
  tipo,
}: {
  tipo: "ventas" | "dinero" | "pendiente" | "ticket" | "grafico" | "carrito";
}) {
  const comunes = {
    width: 23,
    height: 23,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (tipo) {
    case "ventas":
      return (
        <svg {...comunes}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h4" />
        </svg>
      );

    case "dinero":
      return (
        <svg {...comunes}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5c-.7-1-1.8-1.5-3.5-1.5-1.8 0-3 .9-3 2.2 0 3.4 6.5 1.3 6.5 4.8 0 1.5-1.4 2.5-3.5 2.5-1.5 0-2.8-.6-3.7-1.6M12 5v14" />
        </svg>
      );

    case "pendiente":
      return (
        <svg {...comunes}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "ticket":
      return (
        <svg {...comunes}>
          <path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Z" />
          <path d="M9 9h6M9 13h6" />
        </svg>
      );

    case "grafico":
      return (
        <svg {...comunes}>
          <path d="M4 19V5M4 19h17" />
          <rect x="7" y="11" width="3" height="5" rx="1" />
          <rect x="13" y="7" width="3" height="9" rx="1" />
          <rect x="19" y="3" width="2" height="13" rx="1" />
        </svg>
      );

    case "carrito":
      return (
        <svg {...comunes}>
          <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 1.9-1.5L21 8H6" />
          <circle cx="10" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
      );
  }
}

export default function Ventas() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [estadisticas, setEstadisticas] =
    useState<Estadisticas>(estadisticasIniciales);

  const [clienteId, setClienteId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function consultar<T>(ruta: string): Promise<T> {
    const respuesta = await fetch(`${API}${ruta}`);

    if (!respuesta.ok) {
      const contenido = await respuesta.text();
      throw new Error(contenido || `Error HTTP ${respuesta.status}`);
    }

    return respuesta.json() as Promise<T>;
  }

  async function cargarDatos() {
    setError("");
    setCargando(true);

    try {
      const [listaClientes, listaProductos, listaVentas, resumen] =
        await Promise.all([
          consultar<Cliente[]>("/clientes"),
          consultar<Producto[]>("/productos"),
          consultar<Venta[]>("/ventas"),
          consultar<Estadisticas>("/ventas/estadisticas"),
        ]);

      setClientes(listaClientes);
      setProductos(listaProductos);
      setVentas(listaVentas);
      setEstadisticas(resumen);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudieron cargar los datos: ${e.message}`
          : "No se pudieron cargar los datos.",
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  const productosActivos = useMemo(
    () => productos.filter((producto) => producto.estado),
    [productos],
  );

  const carritoDetallado = useMemo(
    () =>
      carrito.map((item) => {
        const producto = productos.find(
          (p) => p.id === item.producto_id,
        );

        return {
          ...item,
          producto,
          subtotal: (Number(producto?.precio) || 0) * item.cantidad,
        };
      }),
    [carrito, productos],
  );

  const total = carritoDetallado.reduce(
    (suma, item) => suma + item.subtotal,
    0,
  );

  const ventasNoAnuladas = useMemo(
    () =>
      ventas.filter(
        (venta) => normalizarEstado(venta.estado) !== "anulada",
      ),
    [ventas],
  );

  const ventasPagadas = useMemo(
    () =>
      ventasNoAnuladas.filter(
        (venta) => normalizarEstado(venta.estado) === "pagada",
      ),
    [ventasNoAnuladas],
  );

  const ventasPendientes = useMemo(
    () =>
      ventasNoAnuladas.filter(
        (venta) => normalizarEstado(venta.estado) === "pendiente",
      ),
    [ventasNoAnuladas],
  );

  const totalEstados = ventasPagadas.length + ventasPendientes.length;

  const porcentajePagadas =
    totalEstados > 0 ? (ventasPagadas.length / totalEstados) * 100 : 0;

  const porcentajePendientes =
    totalEstados > 0 ? (ventasPendientes.length / totalEstados) * 100 : 0;

  const ventasFiltradas = useMemo(() => {
    const termino = busqueda.toLowerCase().trim();

    return ventas
      .filter((venta) => {
        const cliente = clientes.find((c) => c.id === venta.cliente_id);
        const estado = normalizarEstado(venta.estado);

        const texto = [
          venta.id,
          cliente?.nombre ?? "",
          venta.estado,
          fechaLegible(venta.created_at),
        ]
          .join(" ")
          .toLowerCase();

        const coincideBusqueda = texto.includes(termino);

        const coincideEstado =
          filtroEstado === "todos" ||
          (filtroEstado === "pagada" && estado === "pagada") ||
          (filtroEstado === "pendiente" && estado === "pendiente") ||
          (filtroEstado === "anulada" && estado === "anulada");

        return coincideBusqueda && coincideEstado;
      })
      .sort((a, b) => {
        const fechaA = a.created_at
          ? new Date(a.created_at).getTime()
          : 0;
        const fechaB = b.created_at
          ? new Date(b.created_at).getTime()
          : 0;

        if (fechaA !== fechaB) return fechaB - fechaA;

        return b.id - a.id;
      });
  }, [ventas, clientes, busqueda, filtroEstado]);

  // El historial solo muestra las cinco ventas más recientes que coinciden
  // con la búsqueda y el filtro seleccionados.
  const ventasPaginadas = ventasFiltradas.slice(
    0,
    MAX_VENTAS_HISTORIAL,
  );

  const ventasPorMes = useMemo(() => {
    const meses: {
      clave: string;
      etiqueta: string;
      cantidad: number;
      total: number;
    }[] = [];

    const hoy = new Date();

    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(
        hoy.getFullYear(),
        hoy.getMonth() - i,
        1,
      );

      const clave = `${fecha.getFullYear()}-${String(
        fecha.getMonth() + 1,
      ).padStart(2, "0")}`;

      meses.push({
        clave,
        etiqueta: fecha
          .toLocaleDateString("es-PE", { month: "short" })
          .replace(".", ""),
        cantidad: 0,
        total: 0,
      });
    }

    ventasNoAnuladas.forEach((venta) => {
      if (!venta.created_at) return;

      const fecha = new Date(venta.created_at);

      if (Number.isNaN(fecha.getTime())) return;

      const clave = `${fecha.getFullYear()}-${String(
        fecha.getMonth() + 1,
      ).padStart(2, "0")}`;

      const mes = meses.find((item) => item.clave === clave);

      if (mes) {
        mes.cantidad += 1;
        mes.total += Number(venta.total) || 0;
      }
    });

    return meses;
  }, [ventasNoAnuladas]);

  const maximoMensual = Math.max(
    1,
    ...ventasPorMes.map((mes) => mes.total),
  );

  function agregarProducto() {
    setMensaje("");
    setError("");

    const id = Number(productoId);
    const unidades = Number(cantidad);
    const producto = productos.find((p) => p.id === id);

    if (!producto || !producto.estado) {
      setError("Selecciona un producto activo.");
      return;
    }

    if (!Number.isInteger(unidades) || unidades <= 0) {
      setError("La cantidad debe ser un número entero mayor que cero.");
      return;
    }

    const cantidadActual =
      carrito.find((item) => item.producto_id === id)?.cantidad ?? 0;

    if (cantidadActual + unidades > producto.stock) {
      setError(
        `Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}.`,
      );
      return;
    }

    setCarrito((actual) => {
      const existe = actual.some((item) => item.producto_id === id);

      if (existe) {
        return actual.map((item) =>
          item.producto_id === id
            ? { ...item, cantidad: item.cantidad + unidades }
            : item,
        );
      }

      return [...actual, { producto_id: id, cantidad: unidades }];
    });

    setProductoId("");
    setCantidad("1");
  }

  function cambiarCantidad(
    idProducto: number,
    nuevaCantidad: number,
  ) {
    const producto = productos.find((p) => p.id === idProducto);

    if (!producto) return;

    if (nuevaCantidad <= 0) {
      setCarrito((actual) =>
        actual.filter((item) => item.producto_id !== idProducto),
      );
      return;
    }

    if (
      !Number.isInteger(nuevaCantidad) ||
      nuevaCantidad > producto.stock
    ) {
      setError(`Stock insuficiente para ${producto.nombre}.`);
      return;
    }

    setError("");

    setCarrito((actual) =>
      actual.map((item) =>
        item.producto_id === idProducto
          ? { ...item, cantidad: nuevaCantidad }
          : item,
      ),
    );
  }

  async function registrarVenta() {
    setError("");
    setMensaje("");

    if (!clienteId) {
      setError("Selecciona un cliente antes de registrar la venta.");
      return;
    }

    if (carrito.length === 0) {
      setError("Agrega al menos un producto a la venta.");
      return;
    }

    const carritoInvalido = carrito.some((item) => {
      const producto = productos.find(
        (p) => p.id === item.producto_id,
      );

      return (
        !producto ||
        !producto.estado ||
        item.cantidad <= 0 ||
        item.cantidad > producto.stock
      );
    });

    if (carritoInvalido) {
      setError(
        "Revisa los productos y sus existencias antes de continuar.",
      );
      return;
    }

    setGuardando(true);

    try {
      const usuarioGuardado = localStorage.getItem("salesia_usuario");
      let usuarioId: number | null = null;

      if (usuarioGuardado) {
        try {
          const usuario = JSON.parse(usuarioGuardado);
          const id = Number(usuario.id);

          if (Number.isInteger(id) && id > 0) usuarioId = id;
        } catch {
          usuarioId = null;
        }
      }

      const respuesta = await fetch(`${API}/ventas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: Number(clienteId),
          usuario_id: usuarioId,
          detalles: carrito.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
          })),
        }),
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        const detalle = resultado.detail;

        throw new Error(
          typeof detalle === "string"
            ? detalle
            : "No se pudo registrar la venta.",
        );
      }

      setCarrito([]);
      setClienteId("");
      setProductoId("");
      setCantidad("1");
      setMensaje(`Venta #${resultado.id} registrada correctamente.`);

      window.dispatchEvent(
        new CustomEvent(EVENTO_DATOS_ACTUALIZADOS),
      );

      await cargarDatos();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Ocurrió un error al registrar la venta.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="ventas-page">
      <header className="ventas-header">
        <div className="ventas-header-contenido">
          <div className="ventas-migas">
            <span>Gestión comercial</span>
            <span className="ventas-migas-separador">/</span>
            <strong>Ventas</strong>
          </div>

          <div className="ventas-titulo-fila">
            <div className="ventas-header-icono">
              <Icono tipo="ventas" />
            </div>

            <div>
              <h1>Ventas</h1>
              <p>
                Registra operaciones y consulta el historial comercial.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="ventas-btn-actualizar"
          onClick={() => void cargarDatos()}
          disabled={cargando || guardando}
        >
          <span className={cargando ? "ventas-girando" : ""}>↻</span>
          {cargando ? "Actualizando..." : "Actualizar datos"}
        </button>
      </header>

      {error && (
        <div
          className="ventas-alerta ventas-alerta-error"
          role="alert"
        >
          <strong>Atención</strong>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {mensaje && (
        <div className="ventas-alerta ventas-alerta-ok" role="status">
          <strong>Operación completada</strong>
          <span>{mensaje}</span>
          <button
            type="button"
            onClick={() => setMensaje("")}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      <section className="ventas-estadisticas">
        <article className="ventas-stat">
          <div className="ventas-stat-superior">
            <span className="ventas-stat-icono ventas-icono-azul">
              <Icono tipo="ventas" />
            </span>
            <span className="ventas-stat-etiqueta">OPERACIONES</span>
          </div>

          <span className="ventas-stat-titulo">Ventas registradas</span>
          <strong className="ventas-stat-valor">
            {estadisticas.total_ventas}
          </strong>
          <small>Operaciones registradas</small>
        </article>

        <article className="ventas-stat">
          <div className="ventas-stat-superior">
            <span className="ventas-stat-icono ventas-icono-verde">
              <Icono tipo="dinero" />
            </span>
            <span className="ventas-stat-etiqueta">RECAUDACIÓN</span>
          </div>

          <span className="ventas-stat-titulo">Ingresos cobrados</span>
          <strong className="ventas-stat-valor">
            {dinero(estadisticas.ingresos_totales)}
          </strong>
          <small>Ventas marcadas como pagadas</small>
        </article>

        <article className="ventas-stat">
          <div className="ventas-stat-superior">
            <span className="ventas-stat-icono ventas-icono-ambar">
              <Icono tipo="pendiente" />
            </span>
            <span className="ventas-stat-etiqueta">POR COBRAR</span>
          </div>

          <span className="ventas-stat-titulo">Pendiente de pago</span>
          <strong className="ventas-stat-valor">
            {dinero(estadisticas.monto_pendiente)}
          </strong>
          <small>
            {estadisticas.ventas_pendientes} ventas pendientes
          </small>
        </article>

        <article className="ventas-stat">
          <div className="ventas-stat-superior">
            <span className="ventas-stat-icono ventas-icono-celeste">
              <Icono tipo="ticket" />
            </span>
            <span className="ventas-stat-etiqueta">PROMEDIO</span>
          </div>

          <span className="ventas-stat-titulo">Ticket promedio</span>
          <strong className="ventas-stat-valor">
            {dinero(estadisticas.ticket_promedio)}
          </strong>
          <small>Promedio por venta</small>
        </article>
      </section>

      <section className="ventas-panel ventas-nueva">
        <div className="ventas-panel-titulo">
          <div className="ventas-seccion-icono">
            <Icono tipo="carrito" />
          </div>

          <div>
            <span className="ventas-kicker">OPERACIÓN COMERCIAL</span>
            <h2>Nueva venta</h2>
            <p>
              Selecciona al cliente y agrega los productos de su compra.
            </p>
          </div>
        </div>

        <div className="ventas-formulario">
          <label className="ventas-campo">
            <span>
              Cliente <b>*</b>
            </span>

            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={guardando}
            >
              <option value="">Seleccionar cliente</option>

              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                  {cliente.documento ? ` — ${cliente.documento}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="ventas-agregar-producto">
            <label className="ventas-campo ventas-campo-producto">
              <span>Producto</span>

              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                disabled={guardando}
              >
                <option value="">Seleccionar producto</option>

                {productosActivos.map((producto) => (
                  <option
                    key={producto.id}
                    value={producto.id}
                    disabled={producto.stock <= 0}
                  >
                    {producto.nombre} — {dinero(producto.precio)} — Stock:{" "}
                    {producto.stock}
                  </option>
                ))}
              </select>
            </label>

            <label className="ventas-campo ventas-campo-cantidad">
              <span>Cantidad</span>

              <input
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                disabled={guardando}
              />
            </label>

            <button
              type="button"
              className="ventas-btn-agregar"
              onClick={agregarProducto}
              disabled={guardando}
            >
              <span>+</span> Agregar producto
            </button>
          </div>
        </div>

        <div className="ventas-carrito-encabezado">
          <div>
            <h3>Detalle de la compra</h3>
            <p>
              {carrito.length}{" "}
              {carrito.length === 1 ? "producto" : "productos"} diferentes
            </p>
          </div>

          <span className="ventas-carrito-contador">
            {carrito.reduce((suma, item) => suma + item.cantidad, 0)} unidades
          </span>
        </div>

        <div className="ventas-tabla-contenedor">
          <table className="ventas-tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio unitario</th>
                <th>Cantidad</th>
                <th>Subtotal</th>
                <th>Acción</th>
              </tr>
            </thead>

            <tbody>
              {carritoDetallado.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ventas-vacio">
                    <div className="ventas-vacio-icono">
                      <Icono tipo="carrito" />
                    </div>
                    <strong>Tu carrito está vacío</strong>
                    <span>
                      Selecciona un producto arriba para comenzar.
                    </span>
                  </td>
                </tr>
              ) : (
                carritoDetallado.map((item) => (
                  <tr key={item.producto_id}>
                    <td>
                      <div className="ventas-producto-celda">
                        <span className="ventas-producto-mini">
                          <Icono tipo="carrito" />
                        </span>
                        <strong>
                          {item.producto?.nombre ??
                            "Producto no encontrado"}
                        </strong>
                      </div>
                    </td>

                    <td>{dinero(item.producto?.precio ?? 0)}</td>

                    <td>
                      <input
                        className="ventas-input-cantidad"
                        type="number"
                        min="1"
                        max={item.producto?.stock ?? 1}
                        value={item.cantidad}
                        onChange={(e) =>
                          cambiarCantidad(
                            item.producto_id,
                            Number(e.target.value),
                          )
                        }
                        disabled={guardando}
                        aria-label={`Cantidad de ${item.producto?.nombre}`}
                      />
                    </td>

                    <td>
                      <strong className="ventas-subtotal">
                        {dinero(item.subtotal)}
                      </strong>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="ventas-btn-eliminar"
                        onClick={() =>
                          cambiarCantidad(item.producto_id, 0)
                        }
                        disabled={guardando}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ventas-total">
          <div className="ventas-total-descripcion">
            <span>Total de la venta</span>
            <small>Importe total a registrar</small>
          </div>

          <strong>{dinero(total)}</strong>

          <button
            type="button"
            className="ventas-btn-principal"
            onClick={() => void registrarVenta()}
            disabled={
              guardando || cargando || carrito.length === 0
            }
          >
            {guardando ? "Registrando venta..." : "Registrar venta"}
            {!guardando && <span>→</span>}
          </button>
        </div>

        <div className="ventas-nota">
          <span className="ventas-nota-icono">i</span>
          <p>
            La venta se registrará como pendiente de pago. Al confirmarla,
            el sistema actualizará el stock y guardará los movimientos de
            inventario.
          </p>
        </div>
      </section>

      <section className="ventas-analitica">
        <div className="ventas-analitica-encabezado">
          <div>
            <span className="ventas-kicker">VISIÓN COMERCIAL</span>
            <h2>Resumen de rendimiento</h2>
            <p>
              Indicadores calculados a partir de las ventas registradas.
            </p>
          </div>

          <span className="ventas-analitica-badge">
            <Icono tipo="grafico" /> Datos del sistema
          </span>
        </div>

        <div className="ventas-graficos-grid">
          <article className="ventas-grafico-card ventas-grafico-mensual">
            <div className="ventas-grafico-titulo">
              <div>
                <h3>Evolución de ventas</h3>
                <p>Importe registrado en los últimos seis meses</p>
              </div>

              <span className="ventas-grafico-etiqueta">Mensual</span>
            </div>

            {ventasNoAnuladas.length === 0 ? (
              <div className="ventas-grafico-vacio">
                <Icono tipo="grafico" />
                <strong>Aún no hay datos para analizar</strong>
                <span>
                  Los resultados aparecerán cuando existan ventas
                  registradas.
                </span>
              </div>
            ) : (
              <>
                <div className="ventas-grafico-leyenda">
                  <span className="ventas-punto-azul" />
                  Total vendido
                </div>

                <div className="ventas-barras">
                  {ventasPorMes.map((mes) => (
                    <div
                      className="ventas-barra-columna"
                      key={mes.clave}
                    >
                      <span className="ventas-barra-valor">
                        {mes.total > 0
                          ? new Intl.NumberFormat("es-PE", {
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(mes.total)
                          : "—"}
                      </span>

                      <div className="ventas-barra-fondo">
                        <div
                          className="ventas-barra"
                          style={{
                            height:
                              mes.total > 0
                                ? `${Math.max(
                                    5,
                                    (mes.total / maximoMensual) * 100,
                                  )}%`
                                : "0%",
                          }}
                          title={`${mes.etiqueta}: ${dinero(mes.total)}`}
                        />
                      </div>

                      <span className="ventas-barra-mes">
                        {mes.etiqueta}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ventas-grafico-pie">
                  <span>
                    <strong>
                      {dinero(
                        ventasPorMes.reduce(
                          (suma, mes) => suma + mes.total,
                          0,
                        ),
                      )}
                    </strong>
                    Total del periodo mostrado
                  </span>

                  <span>
                    <strong>
                      {ventasPorMes.reduce(
                        (suma, mes) => suma + mes.cantidad,
                        0,
                      )}
                    </strong>
                    Operaciones
                  </span>
                </div>
              </>
            )}
          </article>

          <article className="ventas-grafico-card">
            <div className="ventas-grafico-titulo">
              <div>
                <h3>Estado de cobros</h3>
                <p>Distribución de operaciones no anuladas</p>
              </div>
            </div>

            {totalEstados === 0 ? (
              <div className="ventas-grafico-vacio ventas-grafico-vacio-corto">
                <Icono tipo="pendiente" />
                <strong>Sin operaciones para comparar</strong>
                <span>El resumen se actualizará con tus ventas.</span>
              </div>
            ) : (
              <>
                <div
                  className="ventas-dona"
                  style={{
                    background: `conic-gradient(#16866b 0% ${porcentajePagadas}%, #e7a23b ${porcentajePagadas}% 100%)`,
                  }}
                  role="img"
                  aria-label={`${ventasPagadas.length} ventas pagadas y ${ventasPendientes.length} pendientes`}
                >
                  <div className="ventas-dona-centro">
                    <strong>{totalEstados}</strong>
                    <span>operaciones</span>
                  </div>
                </div>

                <div className="ventas-dona-leyenda">
                  <div>
                    <span className="ventas-leyenda-color ventas-color-pagada" />
                    <span>Pagadas</span>
                    <strong>{ventasPagadas.length}</strong>
                    <small>{porcentajePagadas.toFixed(0)}%</small>
                  </div>

                  <div>
                    <span className="ventas-leyenda-color ventas-color-pendiente" />
                    <span>Pendientes</span>
                    <strong>{ventasPendientes.length}</strong>
                    <small>{porcentajePendientes.toFixed(0)}%</small>
                  </div>
                </div>
              </>
            )}
          </article>
        </div>
      </section>

      <section className="ventas-panel ventas-historial">
        <div className="ventas-historial-cabecera">
          <div className="ventas-panel-titulo">
            <div className="ventas-seccion-icono">
              <Icono tipo="ventas" />
            </div>

            <div>
              <span className="ventas-kicker">REGISTRO COMERCIAL</span>
              <h2>Historial de ventas</h2>
              <p>Consulta las cinco ventas más recientes.</p>
            </div>
          </div>

          <span className="ventas-historial-total">
            {Math.min(
              ventasFiltradas.length,
              MAX_VENTAS_HISTORIAL,
            )}{" "}
            de {ventasFiltradas.length} ventas
          </span>
        </div>

        <div className="ventas-filtros">
          <label className="ventas-busqueda-contenedor">
            <span className="ventas-busqueda-icono">⌕</span>

            <input
              className="ventas-busqueda"
              type="search"
              placeholder="Buscar por número, cliente o estado..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>

          <label className="ventas-filtro-estado">
            <span>Estado de venta</span>

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="anulada">Anuladas</option>
            </select>
          </label>
        </div>

        <div className="ventas-tabla-contenedor">
          <table className="ventas-tabla ventas-tabla-historial">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Cliente</th>
                <th>Fecha de operación</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="ventas-vacio">
                    Cargando información...
                  </td>
                </tr>
              ) : ventasPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ventas-vacio">
                    <div className="ventas-vacio-icono">
                      <Icono tipo="ventas" />
                    </div>
                    <strong>No se encontraron ventas</strong>
                    <span>
                      Prueba con otra búsqueda o cambia el filtro.
                    </span>
                  </td>
                </tr>
              ) : (
                ventasPaginadas.map((venta) => {
                  const cliente = clientes.find(
                    (c) => c.id === venta.cliente_id,
                  );

                  const estado = normalizarEstado(venta.estado);

                  return (
                    <tr key={venta.id}>
                      <td>
                        <span className="ventas-numero">
                          #{venta.id}
                        </span>
                      </td>

                      <td>
                        <div className="ventas-cliente-celda">
                          <span className="ventas-avatar">
                            {(cliente?.nombre ?? "C")
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <strong>
                            {cliente?.nombre ??
                              `Cliente #${venta.cliente_id}`}
                          </strong>
                        </div>
                      </td>

                      <td>{fechaLegible(venta.created_at)}</td>

                      <td>
                        <span className="ventas-productos-cantidad">
                          {venta.detalles?.length ?? 0}
                        </span>
                      </td>

                      <td>
                        <strong className="ventas-total-historial">
                          {dinero(venta.total)}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`ventas-estado ventas-estado-${estado}`}
                        >
                          <span />
                          {venta.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="ventas-paginacion">
          <span>
            {ventasPaginadas.length === 0
              ? "No hay ventas para mostrar"
              : `Mostrando ${ventasPaginadas.length} de ${ventasFiltradas.length} ventas`}
          </span>
        </div>
      </section>
    </div>
  );
}