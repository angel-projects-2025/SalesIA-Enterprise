import { useCallback, useEffect, useState, type FormEvent } from 'react'
import '../App.css'
import './Inventario.css'

interface Producto {
  id: number
  nombre: string
  precio: string | number
  stock: number
  categoria_id: number | null
  estado: boolean
}

interface Categoria {
  id: number
  nombre: string
}

interface Movimiento {
  id: number
  producto_id: number
  tipo: 'entrada' | 'salida'
  cantidad: number
  stock_anterior: number
  stock_nuevo: number
  motivo: string | null
  created_at: string
}

const API = 'https://salesia-enterprise-api.vercel.app/api'
const EVENTO_DATOS_ACTUALIZADOS = 'salesia:datos-actualizados'

async function comprobarRespuesta<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null)
    throw new Error(
      typeof error?.detail === 'string'
        ? error.detail
        : 'No se pudo completar la operación.',
    )
  }

  return respuesta.json() as Promise<T>
}

function moneda(valor: number) {
  return valor.toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN',
  })
}

function fechaLegible(fecha: string) {
  const valor = new Date(fecha)

  if (Number.isNaN(valor.getTime())) return fecha

  return valor.toLocaleString('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroStock, setFiltroStock] = useState('todos')
  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada')
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const [rp, rc, rm] = await Promise.all([
        fetch(`${API}/productos`, { cache: 'no-store' }),
        fetch(`${API}/categorias`, { cache: 'no-store' }),
        fetch(`${API}/inventario/movimientos`, { cache: 'no-store' }),
      ])

      const [p, c, m] = await Promise.all([
        comprobarRespuesta<Producto[]>(rp),
        comprobarRespuesta<Categoria[]>(rc),
        comprobarRespuesta<Movimiento[]>(rm),
      ])

      setProductos(p)
      setCategorias(c)
      setMovimientos(m)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo cargar el inventario.',
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargarDatos()
  }, [cargarDatos])

  const activos = productos.filter((p) => p.estado)
  const unidades = productos.reduce((suma, p) => suma + p.stock, 0)

  const valor = productos.reduce(
    (suma, p) => suma + Number(p.precio) * p.stock,
    0,
  )

  const stockBajo = activos.filter(
    (p) => p.stock > 0 && p.stock <= 5,
  ).length

  const agotados = activos.filter((p) => p.stock === 0).length

  const entradas = movimientos.filter((m) => m.tipo === 'entrada')
  const salidas = movimientos.filter((m) => m.tipo === 'salida')

  const unidadesEntradas = entradas.reduce((s, m) => s + m.cantidad, 0)
  const unidadesSalidas = salidas.reduce((s, m) => s + m.cantidad, 0)

  const recientes = [...movimientos]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime(),
    )
    .slice(0, 8)

  const productosFiltrados = productos.filter((p) => {
    const categoria =
      categorias.find((c) => c.id === p.categoria_id)?.nombre ?? ''

    const texto = busqueda.trim().toLowerCase()

    const coincideTexto =
      p.nombre.toLowerCase().includes(texto) ||
      categoria.toLowerCase().includes(texto)

    const coincideStock =
      filtroStock === 'todos' ||
      (filtroStock === 'disponible' && p.stock > 5) ||
      (filtroStock === 'bajo' && p.stock > 0 && p.stock <= 5) ||
      (filtroStock === 'agotado' && p.stock === 0)

    return coincideTexto && coincideStock
  })

  const stockMaximo = Math.max(
    ...productos.map((p) => p.stock),
    1,
  )

  async function registrarMovimiento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMensaje('')

    const id = Number(productoId)
    const cantidadNumero = Number(cantidad)

    if (!Number.isInteger(id) || id <= 0) {
      setError('Selecciona un producto válido.')
      return
    }

    if (!Number.isInteger(cantidadNumero) || cantidadNumero <= 0) {
      setError('La cantidad debe ser un entero mayor que cero.')
      return
    }

    setGuardando(true)

    try {
      const respuesta = await fetch(`${API}/inventario/movimientos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          producto_id: id,
          tipo,
          cantidad: cantidadNumero,
          motivo: motivo.trim() || null,
        }),
      })

      await comprobarRespuesta<Movimiento>(respuesta)

      setMensaje(
        `Movimiento de ${tipo} registrado correctamente. El stock se actualizó.`,
      )

      setCantidad('1')
      setMotivo('')

      await cargarDatos()

      window.dispatchEvent(new Event(EVENTO_DATOS_ACTUALIZADOS))
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo registrar el movimiento.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="inventario-page">
      {/* ENCABEZADO CON EL ESTILO DE CLIENTES */}
      <header className="clientes-hero inventario-header-pro">
        <div className="clientes-hero-texto">
          <div className="clientes-migas">
            <span>Gestión de almacén</span>
            <span className="clientes-migas-separador">/</span>
            <strong>Inventario</strong>
          </div>

          <div className="clientes-titulo-fila">
            <div className="clientes-titulo-icono">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m12 3 9 5-9 5-9-5 9-5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="m3 8 9 5 9-5M3 8v10l9 5 9-5V8M12 13v10"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              <h1>Inventario</h1>
              <p>
                Administra tus existencias, controla los movimientos y
                supervisa el stock.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="clientes-boton-principal clientes-boton-nuevo inventario-boton-actualizar"
          onClick={() => void cargarDatos()}
          disabled={cargando}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="inventario-svg-actualizar"
          >
            <path
              d="M20 7v5h-5M4 17v-5h5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="productos-alert productos-alert-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {mensaje && (
        <div
          className="productos-alert productos-alert-success"
          role="status"
        >
          {mensaje}
          <button
            type="button"
            onClick={() => setMensaje('')}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      <div className="inventario-metricas">
        {[
          {
            titulo: 'Productos registrados',
            valor: productos.length.toLocaleString('es-PE'),
            detalle: 'Productos en el sistema',
            icono: '▦',
            color: 'azul',
          },
          {
            titulo: 'Unidades disponibles',
            valor: unidades.toLocaleString('es-PE'),
            detalle: 'Unidades en almacén',
            icono: '▤',
            color: 'verde',
          },
          {
            titulo: 'Stock bajo',
            valor: stockBajo.toLocaleString('es-PE'),
            detalle: 'Requieren reposición',
            icono: '!',
            color: 'naranja',
          },
          {
            titulo: 'Productos agotados',
            valor: agotados.toLocaleString('es-PE'),
            detalle: 'Sin unidades disponibles',
            icono: '×',
            color: 'rojo',
          },
          {
            titulo: 'Valor del inventario',
            valor: moneda(valor),
            detalle: 'Valor referencial del stock',
            icono: 'S/',
            color: 'morado',
          },
        ].map((item) => (
          <article className="inventario-metrica" key={item.titulo}>
            <div className="inventario-metrica-top">
              <span>{item.titulo}</span>
              <span className={`inventario-metrica-icono ${item.color}`}>
                {item.icono}
              </span>
            </div>

            <strong
              className={`inventario-metrica-valor ${
                item.titulo === 'Valor del inventario'
                  ? 'inventario-valor-monetario'
                  : ''
              }`}
            >
              {item.valor}
            </strong>

            <p>{item.detalle}</p>
          </article>
        ))}
      </div>

      <section className="productos-panel inventario-registro">
        <div className="productos-panel-header">
          <div>
            <h2>Registrar movimiento</h2>
            <p>Registra entradas de compra o salidas de productos.</p>
          </div>
        </div>

        <form className="inventario-formulario" onSubmit={registrarMovimiento}>
          <label>
            Producto *
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              required
            >
              <option value="">Selecciona un producto</option>

              {activos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — Stock: {p.stock}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tipo de movimiento *
            <select
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as 'entrada' | 'salida')
              }
            >
              <option value="entrada">Entrada de stock</option>
              <option value="salida">Salida de stock</option>
            </select>
          </label>

          <label>
            Cantidad *
            <input
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              required
            />
          </label>

          <label>
            Motivo
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipo === 'entrada'
                  ? 'Ej. Compra a proveedor'
                  : 'Ej. Producto vendido'
              }
              maxLength={250}
            />
          </label>

          <div className="inventario-formulario-accion">
            <button
              type="submit"
              className="productos-btn-primary"
              disabled={guardando || activos.length === 0}
            >
              {guardando
                ? 'Registrando...'
                : tipo === 'entrada'
                  ? '＋ Registrar entrada'
                  : '− Registrar salida'}
            </button>
          </div>
        </form>
      </section>

      <section className="productos-panel inventario-existencias">
        <div className="productos-panel-header inventario-panel-compacto">
          <div>
            <span className="inventario-seccion-label">ALMACÉN</span>
            <h2>Existencias actuales</h2>
            <p>Consulta y filtra los productos de tu inventario.</p>
          </div>

          <span className="inventario-conteo">
            {productosFiltrados.length} productos
          </span>
        </div>

        <div className="inventario-filtros inventario-filtros-pro">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="⌕  Buscar producto o categoría..."
          />

          <select
            value={filtroStock}
            onChange={(e) => setFiltroStock(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="disponible">Stock disponible</option>
            <option value="bajo">Stock bajo</option>
            <option value="agotado">Agotados</option>
          </select>
        </div>

        {cargando ? (
          <div className="productos-vacio">Cargando inventario...</div>
        ) : productosFiltrados.length === 0 ? (
          <div className="productos-vacio">
            <h3>No se encontraron productos</h3>
            <p>Prueba cambiando la búsqueda o el filtro.</p>
          </div>
        ) : (
          <div className="inventario-productos-grid">
            {productosFiltrados.map((p) => {
              const categoria =
                categorias.find((c) => c.id === p.categoria_id)?.nombre ??
                'Sin categoría'

              const estado =
                p.stock === 0
                  ? 'agotado'
                  : p.stock <= 5
                    ? 'bajo'
                    : 'disponible'

              return (
                <article className="inventario-producto-card" key={p.id}>
                  <div className="inventario-producto-cabecera">
                    <span className="inventario-producto-avatar">
                      {p.nombre.charAt(0).toUpperCase()}
                    </span>

                    <span className={`inventario-etiqueta ${estado}`}>
                      {estado === 'agotado'
                        ? 'Agotado'
                        : estado === 'bajo'
                          ? 'Stock bajo'
                          : 'Disponible'}
                    </span>
                  </div>

                  <div className="inventario-producto-info">
                    <h3 title={p.nombre}>{p.nombre}</h3>
                    <p>{categoria}</p>
                  </div>

                  <div className="inventario-producto-precio">
                    <span>Precio unitario</span>
                    <strong>{moneda(Number(p.precio))}</strong>
                  </div>

                  <div className="inventario-stock-linea">
                    <div>
                      <span>Stock actual</span>
                      <strong>
                        {p.stock} <small>unid.</small>
                      </strong>
                    </div>

                    <span
                      className={`inventario-producto-estado ${
                        p.estado ? 'activo' : 'inactivo'
                      }`}
                    >
                      {p.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <div className="inventario-stock-track">
                    <span
                      className={estado}
                      style={{
                        width: `${
                          Math.min((p.stock / stockMaximo) * 100, 100)
                        }%`,
                      }}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="productos-panel inventario-analitica">
        <div className="productos-panel-header">
          <div>
            <span className="inventario-seccion-label">
              ANÁLISIS DE ACTIVIDAD
            </span>
            <h2>Historial de movimientos</h2>
            <p>Resumen visual de entradas y salidas registradas.</p>
          </div>

          <span className="inventario-conteo">
            {movimientos.length} movimientos
          </span>
        </div>

        <div className="inventario-resumen-movimientos">
          <article className="inventario-resumen-card">
            <div className="inventario-resumen-icono entrada">↓</div>
            <div>
              <span>Unidades ingresadas</span>
              <strong>{unidadesEntradas.toLocaleString('es-PE')}</strong>
              <small>{entradas.length} movimientos de entrada</small>
            </div>
          </article>

          <article className="inventario-resumen-card">
            <div className="inventario-resumen-icono salida">↑</div>
            <div>
              <span>Unidades retiradas</span>
              <strong>{unidadesSalidas.toLocaleString('es-PE')}</strong>
              <small>{salidas.length} movimientos de salida</small>
            </div>
          </article>
        </div>

        <div className="inventario-graficos">
          <article className="inventario-grafico-card">
            <div className="inventario-grafico-titulo">
              <div>
                <h3>Distribución de movimientos</h3>
                <p>Comparación por tipo de operación</p>
              </div>
            </div>

            <div className="inventario-barra-item">
              <div className="inventario-barra-label">
                <span>
                  <i className="inventario-punto entrada" /> Entradas
                </span>
                <strong>{entradas.length}</strong>
              </div>

              <div className="inventario-barra-fondo">
                <span
                  className="inventario-barra entrada"
                  style={{
                    width: `${
                      movimientos.length
                        ? (entradas.length / movimientos.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="inventario-barra-item">
              <div className="inventario-barra-label">
                <span>
                  <i className="inventario-punto salida" /> Salidas
                </span>
                <strong>{salidas.length}</strong>
              </div>

              <div className="inventario-barra-fondo">
                <span
                  className="inventario-barra salida"
                  style={{
                    width: `${
                      movimientos.length
                        ? (salidas.length / movimientos.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="inventario-grafico-pie">
              <div>
                <strong>{movimientos.length}</strong>
                <span>operaciones</span>
              </div>

              <div className="inventario-pie-leyenda">
                <span>
                  <i className="inventario-punto entrada" /> Entradas
                </span>
                <span>
                  <i className="inventario-punto salida" /> Salidas
                </span>
              </div>
            </div>
          </article>

          <article className="inventario-grafico-card">
            <div className="inventario-grafico-titulo">
              <div>
                <h3>Unidades por operación</h3>
                <p>Volumen total de unidades movidas</p>
              </div>
            </div>

            <div className="inventario-columnas">
              {[
                {
                  titulo: 'Entradas',
                  valor: unidadesEntradas,
                  color: 'entrada',
                },
                {
                  titulo: 'Salidas',
                  valor: unidadesSalidas,
                  color: 'salida',
                },
              ].map((item) => {
                const maximo = Math.max(
                  unidadesEntradas,
                  unidadesSalidas,
                  1,
                )

                return (
                  <div className="inventario-columna-item" key={item.titulo}>
                    <strong>{item.valor}</strong>

                    <div className="inventario-columna-fondo">
                      <span
                        className={item.color}
                        style={{
                          height: `${
                            Math.max((item.valor / maximo) * 100, 3)
                          }%`,
                        }}
                      />
                    </div>

                    <span>{item.titulo}</span>
                  </div>
                )
              })}
            </div>
          </article>
        </div>

        <div className="inventario-recientes">
          <div className="inventario-recientes-titulo">
            <div>
              <h3>Movimientos recientes</h3>
              <p>Últimas 8 operaciones registradas.</p>
            </div>
          </div>

          {cargando ? (
            <div className="productos-vacio">Cargando movimientos...</div>
          ) : recientes.length === 0 ? (
            <div className="productos-vacio">
              <h3>Aún no hay movimientos</h3>
              <p>
                Registra una entrada o salida para ver la actividad aquí.
              </p>
            </div>
          ) : (
            <div className="inventario-lista-movimientos">
              {recientes.map((m) => {
                const producto = productos.find(
                  (p) => p.id === m.producto_id,
                )

                const entrada = m.tipo === 'entrada'

                return (
                  <article className="inventario-movimiento-item" key={m.id}>
                    <span
                      className={`inventario-movimiento-icono ${
                        entrada ? 'entrada' : 'salida'
                      }`}
                    >
                      {entrada ? '↓' : '↑'}
                    </span>

                    <div className="inventario-movimiento-detalle">
                      <strong>
                        {producto?.nombre ?? `Producto #${m.producto_id}`}
                      </strong>
                      <span>{m.motivo || 'Sin motivo indicado'}</span>
                      <small>{fechaLegible(m.created_at)}</small>
                    </div>

                    <div className="inventario-movimiento-stock">
                      <strong
                        className={
                          entrada ? 'texto-entrada' : 'texto-salida'
                        }
                      >
                        {entrada ? '+' : '−'}
                        {m.cantidad} unid.
                      </strong>
                      <span>
                        Stock: {m.stock_anterior} → {m.stock_nuevo}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </section>
  )
}