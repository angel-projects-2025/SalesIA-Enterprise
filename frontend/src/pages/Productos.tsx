import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import '../App.css'

interface Categoria {
  id: number
  nombre: string
  descripcion: string | null
}

interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  precio: string | number
  stock: number
  categoria_id: number | null
  estado: boolean
}

interface ProductoFormulario {
  nombre: string
  descripcion: string
  precio: string
  stock: string
  categoria_id: string
  estado: boolean
}

const API = 'https://salesia-enterprise-api.vercel.app/api'
const POR_PAGINA = 5

const formularioVacio: ProductoFormulario = {
  nombre: '',
  descripcion: '',
  precio: '',
  stock: '0',
  categoria_id: '',
  estado: true,
}

async function comprobarRespuesta<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null)
    const mensaje = error?.detail
    throw new Error(
      typeof mensaje === 'string'
        ? mensaje
        : 'No se pudo completar la operación.',
    )
  }

  if (respuesta.status === 204) return undefined as T
  return respuesta.json() as Promise<T>
}

function formatoPrecio(precio: string | number) {
  return Number(precio).toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN',
  })
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [formulario, setFormulario] =
    useState<ProductoFormulario>(formularioVacio)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const [respuestaProductos, respuestaCategorias] = await Promise.all([
        fetch(`${API}/productos`),
        fetch(`${API}/categorias`),
      ])

      const [datosProductos, datosCategorias] = await Promise.all([
        comprobarRespuesta<Producto[]>(respuestaProductos),
        comprobarRespuesta<Categoria[]>(respuestaCategorias),
      ])

      setProductos(datosProductos)
      setCategorias(datosCategorias)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudieron cargar los productos.',
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargarDatos()
  }, [cargarDatos])

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()

    return productos.filter((producto) => {
      const categoria =
        categorias.find((item) => item.id === producto.categoria_id)?.nombre ?? ''

      const coincideBusqueda =
        producto.nombre.toLowerCase().includes(termino) ||
        (producto.descripcion ?? '').toLowerCase().includes(termino) ||
        categoria.toLowerCase().includes(termino)

      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' && producto.estado) ||
        (filtroEstado === 'inactivos' && !producto.estado) ||
        (filtroEstado === 'stock-bajo' && producto.stock <= 5)

      return coincideBusqueda && coincideEstado
    })
  }, [productos, categorias, busqueda, filtroEstado])

  const totalPaginas = Math.max(
    1,
    Math.ceil(productosFiltrados.length / POR_PAGINA),
  )

  const productosPagina = productosFiltrados.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA,
  )

  useEffect(() => {
    setPagina((actual) => Math.min(actual, totalPaginas))
  }, [totalPaginas])

  const activos = productos.filter((p) => p.estado).length
  const unidades = productos.reduce((total, p) => total + p.stock, 0)
  const valorInventario = productos.reduce(
    (total, p) => total + Number(p.precio) * p.stock,
    0,
  )
  const stockBajo = productos.filter((p) => p.stock <= 5)
  const agotados = productos.filter((p) => p.stock === 0).length

  const datosGrafico = useMemo(() => {
    return [...productos]
      .sort((a, b) => b.stock - a.stock || a.nombre.localeCompare(b.nombre))
      .slice(0, 5)
  }, [productos])

  const maxStock = Math.max(1, ...datosGrafico.map((p) => p.stock))

  const abrirNuevo = () => {
    setProductoEditar(null)
    setFormulario(formularioVacio)
    setError('')
    setMensaje('')
    setModalAbierto(true)
  }

  const abrirEdicion = (producto: Producto) => {
    setProductoEditar(producto)
    setFormulario({
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      precio: String(producto.precio),
      stock: String(producto.stock),
      categoria_id: producto.categoria_id
        ? String(producto.categoria_id)
        : '',
      estado: producto.estado,
    })
    setError('')
    setMensaje('')
    setModalAbierto(true)
  }

  const actualizarCampo = (
    campo: keyof ProductoFormulario,
    valor: string | boolean,
  ) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  const guardarProducto = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setMensaje('')

    const precio = Number(formulario.precio)
    const stock = Number(formulario.stock)

    if (!formulario.nombre.trim()) {
      setError('Ingresa el nombre del producto.')
      return
    }

    if (
      formulario.precio.trim() === '' ||
      !Number.isFinite(precio) ||
      precio < 0
    ) {
      setError('Ingresa un precio válido igual o mayor a cero.')
      return
    }

    if (
      formulario.stock.trim() === '' ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setError('El stock debe ser un número entero igual o mayor a cero.')
      return
    }

    if (
      formulario.categoria_id &&
      !categorias.some((c) => c.id === Number(formulario.categoria_id))
    ) {
      setError('Selecciona una categoría válida.')
      return
    }

    const datos = {
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim() || null,
      precio,
      stock,
      categoria_id: formulario.categoria_id
        ? Number(formulario.categoria_id)
        : null,
      estado: formulario.estado,
    }

    setGuardando(true)

    try {
      const url = productoEditar
        ? `${API}/productos/${productoEditar.id}`
        : `${API}/productos`

      const respuesta = await fetch(url, {
        method: productoEditar ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })

      await comprobarRespuesta<Producto>(respuesta)

      setModalAbierto(false)
      setMensaje(
        productoEditar
          ? 'Producto actualizado correctamente.'
          : 'Producto registrado correctamente.',
      )
      setPagina(1)
      await cargarDatos()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo guardar el producto.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const eliminarProducto = async (producto: Producto) => {
    const confirmar = window.confirm(
      `¿Seguro que deseas eliminar "${producto.nombre}"?`,
    )

    if (!confirmar) return

    setError('')
    setMensaje('')

    try {
      const respuesta = await fetch(`${API}/productos/${producto.id}`, {
        method: 'DELETE',
      })

      await comprobarRespuesta<unknown>(respuesta)

      setMensaje('Producto eliminado correctamente.')
      await cargarDatos()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo eliminar el producto.',
      )
    }
  }

  return (
    <section className="productos-page">
      <header className="productos-header">
        <div>
          <span className="productos-eyebrow">GESTIÓN COMERCIAL</span>
          <h1>Productos</h1>
          <p>Administra tu catálogo, precios y existencias.</p>
        </div>

        <button className="productos-btn-primary" onClick={abrirNuevo}>
          <span>＋</span> Nuevo producto
        </button>
      </header>

      {error && (
        <div className="productos-alert productos-alert-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Cerrar error">×</button>
        </div>
      )}

      {mensaje && (
        <div className="productos-alert productos-alert-success" role="status">
          <span>{mensaje}</span>
          <button onClick={() => setMensaje('')} aria-label="Cerrar mensaje">×</button>
        </div>
      )}

      <div className="productos-metricas">
        <article className="productos-metrica">
          <span className="productos-metrica-icono">▦</span>
          <div>
            <span>Total de productos</span>
            <strong>{productos.length}</strong>
          </div>
        </article>

        <article className="productos-metrica">
          <span className="productos-metrica-icono verde">✓</span>
          <div>
            <span>Productos activos</span>
            <strong>{activos}</strong>
          </div>
        </article>

        <article className="productos-metrica">
          <span className="productos-metrica-icono morado">▤</span>
          <div>
            <span>Unidades en stock</span>
            <strong>{unidades.toLocaleString('es-PE')}</strong>
          </div>
        </article>

        <article className="productos-metrica">
          <span className="productos-metrica-icono dorado">S/</span>
          <div>
            <span>Valor referencial del stock</span>
            <strong>{formatoPrecio(valorInventario)}</strong>
          </div>
        </article>
      </div>

      <div className="productos-layout">
        <section className="productos-panel productos-catalogo">
          <div className="productos-panel-header">
            <div>
              <h2>Catálogo de productos</h2>
              <p>Consulta y administra los productos registrados.</p>
            </div>

            <button
              className="productos-btn-secondary"
              onClick={() => void cargarDatos()}
              disabled={cargando}
            >
              ↻ Actualizar
            </button>
          </div>

          <div className="productos-filtros">
            <label className="productos-buscador">
              <span>⌕</span>
              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setPagina(1)
                }}
                placeholder="Buscar productos..."
              />
            </label>

            <select
              className="productos-filtro-estado"
              aria-label="Filtrar productos"
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value)
                setPagina(1)
              }}
            >
              <option value="todos">Todos los productos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="stock-bajo">Stock bajo (0–5)</option>
            </select>
          </div>

          <div className="productos-resultados">
            {productosFiltrados.length} resultado(s)
            <span> · Máximo {POR_PAGINA} por página</span>
          </div>

          {cargando ? (
            <div className="productos-vacio">Cargando productos...</div>
          ) : productosFiltrados.length === 0 ? (
            <div className="productos-vacio">
              <span>▦</span>
              <h3>No se encontraron productos</h3>
              <p>
                {busqueda || filtroEstado !== 'todos'
                  ? 'Prueba cambiando la búsqueda o los filtros.'
                  : 'Registra tu primer producto para comenzar.'}
              </p>
              {!busqueda && filtroEstado === 'todos' && (
                <button className="productos-btn-primary" onClick={abrirNuevo}>
                  Nuevo producto
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="productos-tabla-contenedor">
                <table className="productos-tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Precio</th>
                      <th>Stock</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosPagina.map((producto) => {
                      const categoria = categorias.find(
                        (c) => c.id === producto.categoria_id,
                      )

                      return (
                        <tr key={producto.id}>
                          <td>
                            <div className="productos-nombre">
                              <span className="productos-avatar">
                                {producto.nombre.charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <strong>{producto.nombre}</strong>
                                <small>
                                  {categoria?.nombre ?? 'Sin categoría'}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td className="productos-precio">
                            {formatoPrecio(producto.precio)}
                          </td>
                          <td>
                            <span
                              className={`productos-stock ${
                                producto.stock === 0
                                  ? 'productos-stock-agotado'
                                  : producto.stock <= 5
                                    ? 'productos-stock-bajo'
                                    : ''
                              }`}
                            >
                              {producto.stock}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`productos-estado ${
                                producto.estado ? 'activo' : 'inactivo'
                              }`}
                            >
                              {producto.estado ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td>
                            <div className="productos-acciones">
                              <button
                                className="productos-accion-editar"
                                onClick={() => abrirEdicion(producto)}
                                title="Editar producto"
                              >
                                Editar
                              </button>
                              <button
                                className="productos-accion-eliminar"
                                onClick={() => void eliminarProducto(producto)}
                                title="Eliminar producto"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <footer className="productos-paginacion">
                <span>
                  Mostrando{' '}
                  {Math.min((pagina - 1) * POR_PAGINA + 1, productosFiltrados.length)}
                  –{Math.min(pagina * POR_PAGINA, productosFiltrados.length)} de{' '}
                  {productosFiltrados.length}
                </span>
                <div>
                  <button
                    className="productos-pagina-btn"
                    disabled={pagina === 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    ‹
                  </button>
                  <span className="productos-pagina-numero">
                    {pagina} / {totalPaginas}
                  </span>
                  <button
                    className="productos-pagina-btn"
                    disabled={pagina === totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    aria-label="Página siguiente"
                  >
                    ›
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>

        <aside className="productos-analisis">
          <section className="productos-panel productos-grafico-panel">
            <div className="productos-panel-header">
              <div>
                <h2>Stock por producto</h2>
                <p>Los 5 productos con más unidades.</p>
              </div>
              <span className="productos-grafico-icono">▥</span>
            </div>

            {datosGrafico.length === 0 ? (
              <div className="productos-grafico-vacio">
                Todavía no hay datos para mostrar.
              </div>
            ) : (
              <div className="productos-barras">
                {datosGrafico.map((producto) => (
                  <div className="productos-barra-item" key={producto.id}>
                    <div className="productos-barra-info">
                      <span title={producto.nombre}>{producto.nombre}</span>
                      <strong>{producto.stock}</strong>
                    </div>
                    <div className="productos-barra-fondo">
                      <div
                        className={`productos-barra ${
                          producto.stock <= 5 ? 'bajo' : ''
                        }`}
                        style={{
                          width: `${(producto.stock / maxStock) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="productos-leyenda">
                  <span />
                  Unidades disponibles
                </div>
              </div>
            )}
          </section>

          <section className="productos-panel productos-alertas-panel">
            <div className="productos-panel-header">
              <div>
                <h2>Estado del inventario</h2>
                <p>Productos que requieren atención.</p>
              </div>
            </div>

            <div className="productos-resumen-stock">
              <div className="productos-resumen-item">
                <span className="productos-resumen-icono rojo">!</span>
                <div>
                  <strong>{agotados}</strong>
                  <span>Productos agotados</span>
                </div>
              </div>
              <div className="productos-resumen-item">
                <span className="productos-resumen-icono naranja">↓</span>
                <div>
                  <strong>{stockBajo.length}</strong>
                  <span>Con 5 unidades o menos</span>
                </div>
              </div>
            </div>

            {stockBajo.length > 0 ? (
              <div className="productos-lista-alertas">
                {stockBajo.slice(0, 4).map((producto) => (
                  <div className="productos-alerta-stock" key={producto.id}>
                    <div>
                      <strong>{producto.nombre}</strong>
                      <span>
                        {producto.stock === 0 ? 'Sin existencias' : 'Stock bajo'}
                      </span>
                    </div>
                    <b>{producto.stock} un.</b>
                  </div>
                ))}
                {stockBajo.length > 4 && (
                  <p className="productos-mas-alertas">
                    Y {stockBajo.length - 4} producto(s) más.
                  </p>
                )}
              </div>
            ) : (
              <div className="productos-sin-alertas">
                <span>✓</span>
                No hay productos con stock bajo.
              </div>
            )}
          </section>

          <div className="productos-nota-analisis">
            <span>i</span>
            <p>
              El valor del inventario se calcula multiplicando el precio de cada
              producto por sus unidades disponibles.
            </p>
          </div>
        </aside>
      </div>

      {modalAbierto && (
        <div
          className="productos-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardando) {
              setModalAbierto(false)
              setError('')
            }
          }}
        >
          <section
            className="productos-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="productos-modal-titulo"
          >
            <header className="productos-modal-header">
              <div>
                <span className="productos-eyebrow">CATÁLOGO COMERCIAL</span>
                <h2 id="productos-modal-titulo">
                  {productoEditar ? 'Editar producto' : 'Nuevo producto'}
                </h2>
                <p>Completa la información del producto.</p>
              </div>
              <button
                type="button"
                className="productos-cerrar"
                onClick={() => {
                  setModalAbierto(false)
                  setError('')
                }}
                disabled={guardando}
                aria-label="Cerrar formulario"
              >
                ×
              </button>
            </header>

            {error && (
              <div className="productos-alert productos-alert-error" role="alert">
                {error}
              </div>
            )}

            <form className="productos-formulario" onSubmit={guardarProducto}>
              <label>
                Nombre del producto *
                <input
                  value={formulario.nombre}
                  onChange={(e) => actualizarCampo('nombre', e.target.value)}
                  placeholder="Ej. Teclado inalámbrico"
                  maxLength={150}
                  required
                />
              </label>

              <label>
                Descripción
                <textarea
                  value={formulario.descripcion}
                  onChange={(e) =>
                    actualizarCampo('descripcion', e.target.value)
                  }
                  placeholder="Descripción del producto"
                  rows={3}
                />
              </label>

              <div className="productos-form-grid">
                <label>
                  Precio (S/) *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formulario.precio}
                    onChange={(e) => actualizarCampo('precio', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>

                <label>
                  Stock *
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formulario.stock}
                    onChange={(e) => actualizarCampo('stock', e.target.value)}
                    required
                  />
                </label>
              </div>

              <label>
                Categoría
                <select
                  value={formulario.categoria_id}
                  onChange={(e) =>
                    actualizarCampo('categoria_id', e.target.value)
                  }
                >
                  <option value="">Sin categoría</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="productos-checkbox">
                <input
                  type="checkbox"
                  checked={formulario.estado}
                  onChange={(e) =>
                    actualizarCampo('estado', e.target.checked)
                  }
                />
                Producto activo
              </label>

              <footer className="productos-form-acciones">
                <button
                  type="button"
                  className="productos-btn-secondary"
                  onClick={() => {
                    setModalAbierto(false)
                    setError('')
                  }}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="productos-btn-primary"
                  disabled={guardando}
                >
                  {guardando
                    ? 'Guardando...'
                    : productoEditar
                      ? 'Guardar cambios'
                      : 'Registrar producto'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}