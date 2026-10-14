
import { useCallback, useEffect, useMemo, useState } from "react";
import "./Pagos.css";

const API = "https://salesia-enterprise-api.vercel.app/api";
const EVENTO_DATOS_ACTUALIZADOS = "salesia:datos-actualizados";

interface Venta {
  id: number;
  cliente_id: number;
  total: number | string;
  estado: string;
  created_at?: string | null;
}

interface Cliente {
  id: number;
  nombre: string;
}

interface Pago {
  id: number;
  venta_id: number;
  cliente?: string;
  total_venta?: number;
  monto: number | string;
  metodo_pago: string;
  estado: string;
  referencia?: string | null;
  fecha_pago: string | null;
}

interface RespuestaPagos {
  pagos?: Pago[];
  resultados?: Pago[];
  items?: Pago[];
}

function dinero(valor: number | string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(Number(valor) || 0);
}

function fechaLegible(fecha: string | null): string {
  if (!fecha) return "â€”";

  const fechaValida = new Date(fecha);

  if (Number.isNaN(fechaValida.getTime())) return "â€”";

  return fechaValida.toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function mensajeError(detalle: unknown): string {
  if (typeof detalle === "string") return detalle;

  if (Array.isArray(detalle)) {
    return detalle
      .map((item) =>
        typeof item?.msg === "string" ? item.msg : "",
      )
      .filter(Boolean)
      .join(" ");
  }

  return "No se pudo completar la operaciÃ³n.";
}

export default function Pagos() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);

  const [ventaId, setVentaId] = useState("");
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState("yape");
  const [referencia, setReferencia] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const consultar = useCallback(async <T,>(ruta: string): Promise<T> => {
    const respuesta = await fetch(`${API}${ruta}`);

    if (!respuesta.ok) {
      const texto = await respuesta.text();
      throw new Error(texto || `Error HTTP ${respuesta.status}`);
    }

    return respuesta.json() as Promise<T>;
  }, []);

  const cargarDatos = useCallback(async () => {
    setError("");

    try {
      const [listaVentas, listaClientes, respuestaPagos] =
        await Promise.all([
          consultar<Venta[]>("/ventas"),
          consultar<Cliente[]>("/clientes"),
          consultar<Pago[] | RespuestaPagos>("/pagos"),
        ]);

      const listaPagos = Array.isArray(respuestaPagos)
        ? respuestaPagos
        : respuestaPagos.pagos ??
          respuestaPagos.resultados ??
          respuestaPagos.items ??
          [];

      setVentas(listaVentas);
      setClientes(listaClientes);
      setPagos(listaPagos);
    } catch (e) {
      setError(
        e instanceof Error
          ? `No se pudieron cargar los pagos: ${e.message}`
          : "No se pudieron cargar los pagos.",
      );
    } finally {
      setCargando(false);
    }
  }, [consultar]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const pagosPorVenta = useMemo(() => {
    const acumulados = new Map<number, number>();

    pagos.forEach((pago) => {
      if (pago.estado.toLowerCase() !== "completado") return;

      acumulados.set(
        pago.venta_id,
        (acumulados.get(pago.venta_id) ?? 0) +
          (Number(pago.monto) || 0),
      );
    });

    return acumulados;
  }, [pagos]);

  const ventasPendientes = useMemo(
    () =>
      ventas.filter((venta) => {
        if (venta.estado.toLowerCase() === "anulada") return false;

        const total = Number(venta.total) || 0;
        const abonado = pagosPorVenta.get(venta.id) ?? 0;

        return total - abonado > 0.009;
      }),
    [ventas, pagosPorVenta],
  );

  const ventaSeleccionada = ventasPendientes.find(
    (venta) => String(venta.id) === ventaId,
  );

  const abonadoSeleccionado = ventaSeleccionada
    ? pagosPorVenta.get(ventaSeleccionada.id) ?? 0
    : 0;

  const saldoSeleccionado = ventaSeleccionada
    ? Math.max(0, Number(ventaSeleccionada.total) - abonadoSeleccionado)
    : 0;

  const totalRecaudado = pagos.reduce(
    (suma, pago) =>
      pago.estado.toLowerCase() === "completado"
        ? suma + (Number(pago.monto) || 0)
        : suma,
    0,
  );

  const montoPendiente = ventas.reduce((suma, venta) => {
    if (venta.estado.toLowerCase() === "anulada") return suma;

    const total = Number(venta.total) || 0;
    const abonado = pagosPorVenta.get(venta.id) ?? 0;

    return suma + Math.max(0, total - abonado);
  }, 0);

  const pagosFiltrados = pagos.filter((pago) => {
    const cliente = clientes.find(
      (item) => item.id ===
        ventas.find((venta) => venta.id === pago.venta_id)?.cliente_id,
    );

    const texto = [
      pago.id,
      pago.venta_id,
      pago.cliente ?? "",
      cliente?.nombre ?? "",
      pago.metodo_pago,
      pago.estado,
      pago.referencia ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return texto.includes(busqueda.toLowerCase().trim());
  });

  async function registrarPago(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    setMensaje("");

    if (!ventaSeleccionada) {
      setError("Selecciona una venta pendiente.");
      return;
    }

    const importe = Number(monto);

    if (!Number.isFinite(importe) || importe <= 0) {
      setError("Ingresa un monto mayor que cero.");
      return;
    }

    if (importe > saldoSeleccionado + 0.001) {
      setError(
        `El monto supera el saldo pendiente de ${dinero(saldoSeleccionado)}.`,
      );
      return;
    }

    setGuardando(true);

    try {
      const respuesta = await fetch(`${API}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venta_id: Number(ventaId),
          monto: importe,
          metodo_pago: metodoPago,
          referencia: referencia.trim() || null,
        }),
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          mensajeError(resultado.detail) ||
            "No se pudo registrar el pago.",
        );
      }

      setMensaje(
        `Pago #${resultado.pago?.id ?? ""} registrado correctamente.`,
      );
      setMonto("");
      setReferencia("");
      setVentaId("");

      window.dispatchEvent(
        new CustomEvent(EVENTO_DATOS_ACTUALIZADOS),
      );

      await cargarDatos();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "OcurriÃ³ un error al registrar el pago.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pagos-page">
      <header className="pagos-header">
        <div>
          <span className="pagos-eyebrow">GESTIÃ“N FINANCIERA</span>
          <h1>Pagos</h1>
          <p>Registra abonos y consulta el estado de los cobros.</p>
        </div>

        <button
          type="button"
          className="pagos-btn-secundario"
          onClick={() => void cargarDatos()}
          disabled={cargando || guardando}
        >
          {cargando ? "Cargando..." : "Actualizar datos"}
        </button>
      </header>

      {error && (
        <div className="pagos-alerta pagos-alerta-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="pagos-alerta pagos-alerta-ok" role="status">
          {mensaje}
        </div>
      )}

      <section className="pagos-estadisticas">
        <article className="pagos-stat">
          <span>Total recaudado</span>
          <strong>{dinero(totalRecaudado)}</strong>
          <small>Suma de pagos completados</small>
        </article>

        <article className="pagos-stat">
          <span>Pagos registrados</span>
          <strong>{pagos.length}</strong>
          <small>Operaciones en el historial</small>
        </article>

        <article className="pagos-stat">
          <span>Saldo pendiente</span>
          <strong>{dinero(montoPendiente)}</strong>
          <small>{ventasPendientes.length} ventas por cobrar</small>
        </article>
      </section>

      <section className="pagos-panel">
        <div className="pagos-panel-titulo">
          <div>
            <h2>Registrar pago</h2>
            <p>Selecciona una venta y registra el importe recibido.</p>
          </div>
        </div>

        <form className="pagos-formulario" onSubmit={registrarPago}>
          <label className="pagos-campo">
            <span>Venta pendiente *</span>
            <select
              value={ventaId}
              onChange={(e) => {
                setVentaId(e.target.value);
                setMonto("");
              }}
              disabled={guardando || cargando}
              required
            >
              <option value="">Seleccionar venta</option>
              {ventasPendientes.map((venta) => {
                const cliente = clientes.find(
                  (item) => item.id === venta.cliente_id,
                );
                const abonado = pagosPorVenta.get(venta.id) ?? 0;
                const saldo = Math.max(
                  0,
                  Number(venta.total) - abonado,
                );

                return (
                  <option key={venta.id} value={venta.id}>
                    Venta #{venta.id} Â· {cliente?.nombre ?? `Cliente #${venta.cliente_id}`} Â· Saldo: {dinero(saldo)}
                  </option>
                );
              })}
            </select>
          </label>

          {ventaSeleccionada && (
            <div className="pagos-saldo">
              <div>
                <span>Total de la venta</span>
                <strong>{dinero(ventaSeleccionada.total)}</strong>
              </div>
              <div>
                <span>Abonado</span>
                <strong>{dinero(abonadoSeleccionado)}</strong>
              </div>
              <div>
                <span>Saldo pendiente</span>
                <strong>{dinero(saldoSeleccionado)}</strong>
              </div>
            </div>
          )}

          <div className="pagos-campos-dobles">
            <label className="pagos-campo">
              <span>Monto del pago (S/) *</span>
              <input
                type="number"
                min="0.01"
                max={saldoSeleccionado || undefined}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="Ej. 20.00"
                required
                disabled={guardando || !ventaSeleccionada}
              />
            </label>

            <label className="pagos-campo">
              <span>MÃ©todo de pago *</span>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                disabled={guardando}
                required
              >
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
          </div>

          <label className="pagos-campo">
            <span>Referencia (opcional)</span>
            <input
              type="text"
              maxLength={100}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="NÃºmero de operaciÃ³n o comprobante"
              disabled={guardando}
            />
          </label>

          <div className="pagos-formulario-pie">
            <p>El pago se guardarÃ¡ en la base de datos del sistema.</p>
            <button
              type="submit"
              className="pagos-btn-principal"
              disabled={guardando || cargando || !ventaSeleccionada}
            >
              {guardando ? "Registrando..." : "Registrar pago"}
            </button>
          </div>
        </form>
      </section>

      <section className="pagos-panel">
        <div className="pagos-panel-titulo pagos-historial-titulo">
          <div>
            <h2>Historial de pagos</h2>
            <p>Consulta los abonos registrados.</p>
          </div>

          <input
            className="pagos-busqueda"
            type="search"
            placeholder="Buscar pago, cliente, venta..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="pagos-tabla-contenedor">
          <table className="pagos-tabla">
            <thead>
              <tr>
                <th>Pago</th>
                <th>Venta</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>MÃ©todo</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={8} className="pagos-vacio">
                    Cargando pagos...
                  </td>
                </tr>
              ) : pagosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="pagos-vacio">
                    No se encontraron pagos registrados.
                  </td>
                </tr>
              ) : (
                pagosFiltrados.map((pago) => {
                  const venta = ventas.find(
                    (item) => item.id === pago.venta_id,
                  );
                  const cliente = clientes.find(
                    (item) => item.id === venta?.cliente_id,
                  );

                  return (
                    <tr key={pago.id}>
                      <td>#{pago.id}</td>
                      <td>#{pago.venta_id}</td>
                      <td>
                        {pago.cliente ??
                          cliente?.nombre ??
                          `Cliente #${venta?.cliente_id ?? "â€”"}`}
                      </td>
                      <td>{fechaLegible(pago.fecha_pago)}</td>
                      <td>
                        <span className="pagos-metodo">
                          {pago.metodo_pago}
                        </span>
                      </td>
                      <td>{pago.referencia || "â€”"}</td>
                      <td className="pagos-monto">
                        {dinero(pago.monto)}
                      </td>
                      <td>
                        <span
                          className={`pagos-estado pagos-estado-${pago.estado.toLowerCase()}`}
                        >
                          {pago.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
