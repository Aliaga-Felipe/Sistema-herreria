import React, { useState } from 'react'
import { api, dinero, useData } from './api.js'
import { Actions, CampoNumero, Empty, Heading, Modal, useAviso } from './ui.jsx'

const unidadesSugeridas = ['unidad', 'metro', 'kilo', 'litro', 'hoja', 'barra']

export default function PanelMateriales() {
  const materiales = useData('/materiales')
  const { mostrar, nodo } = useAviso()
  const [editando, setEditando] = useState(null)

  const guardar = async material => {
    const cuerpo = { nombre: material.nombre, unidad_medida: material.unidad_medida, precio_unitario: Number(material.precio_unitario) }
    if (material.id) await api.put(`/materiales/${material.id}`, cuerpo, materiales.token)
    else await api.post('/materiales', cuerpo, materiales.token)
    await materiales.load()
    mostrar(material.id ? 'Material actualizado.' : 'Material creado.')
    setEditando(null)
  }

  const alternarActivo = async material => {
    try {
      await api.patch(`/materiales/${material.id}/activo`, { activo: !material.activo }, materiales.token)
      await materiales.load()
      mostrar(material.activo ? 'Material desactivado.' : 'Material reactivado.')
    } catch (error) { mostrar(error.message, 'error') }
  }

  const eliminar = async material => {
    if (!window.confirm(`¿Eliminar "${material.nombre}"? Si está en uso en algún producto solo se desactivará.`)) return
    try {
      const respuesta = await api.del(`/materiales/${material.id}`, materiales.token)
      await materiales.load()
      mostrar(respuesta.mensaje)
    } catch (error) { mostrar(error.message, 'error') }
  }

  return (
    <>
      <Heading kicker="Costeo de productos" title="Materiales" text="Cargá cada material con su precio y unidad. Después los asociás a un producto, con la cantidad que usa, para calcular su costo.">
        <button className="primary" onClick={() => setEditando({})}>+ Nuevo material</button>
      </Heading>

      {nodo}

      {materiales.loading ? <p>Cargando materiales...</p> : materiales.error ? <p className="form-error">{materiales.error}</p> : materiales.data.length ? (
        <section className="ranking-tabla">
          <div className="ranking-head materiales-head">
            <span>Material</span><span>Unidad</span><span>Precio unitario</span><span>Estado</span><span></span>
          </div>
          {materiales.data.map(material => (
            <div className={`ranking-fila materiales-fila ${material.activo ? '' : 'inactivo'}`} key={material.id}>
              <b>{material.nombre}</b>
              <span>{material.unidad_medida}</span>
              <span>{dinero(material.precio_unitario)}</span>
              <span>{material.activo ? 'Activo' : 'Desactivado'}</span>
              <span className="card-buttons">
                <button onClick={() => setEditando(material)}>Editar</button>
                <button onClick={() => alternarActivo(material)}>{material.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="danger-link" onClick={() => eliminar(material)}>Eliminar</button>
              </span>
            </div>
          ))}
        </section>
      ) : (
        <Empty title="No hay materiales cargados" text="Creá el primer material para poder asociarlo a un producto." action={() => setEditando({})} label="Crear material" />
      )}

      {editando && <MaterialModal material={editando} close={() => setEditando(null)} save={guardar} />}
    </>
  )
}

function MaterialModal({ material, close, save }) {
  const editar = Boolean(material.id)
  const [nombre, setNombre] = useState(material.nombre || '')
  const [unidad, setUnidad] = useState(material.unidad_medida || 'unidad')
  const [precio, setPrecio] = useState(material.precio_unitario ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enviar = async event => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await save({ id: material.id, nombre, unidad_medida: unidad, precio_unitario: precio }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={editar ? 'Editar material' : 'Nuevo material'} subtitle="Precio y unidad de medida usados para calcular el costo de los productos." close={close}>
      <form onSubmit={enviar}>
        <label>Nombre
          <input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Caño estructural 20x20" />
        </label>

        <div className="form-grid config-grid">
          <label>Unidad de medida
            <input required list="unidades-sugeridas" value={unidad} onChange={event => setUnidad(event.target.value)} placeholder="unidad, metro, kilo..." />
            <datalist id="unidades-sugeridas">
              {unidadesSugeridas.map(opcion => <option key={opcion} value={opcion} />)}
            </datalist>
          </label>

          <label>Precio unitario
            <CampoNumero required min="0" step="0.01" value={precio} onChange={setPrecio} placeholder="0" />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        <Actions close={close} label={editar ? 'Guardar cambios' : 'Crear material'} busy={busy} />
      </form>
    </Modal>
  )
}
