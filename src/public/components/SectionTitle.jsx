import React from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal.jsx'

export default function SectionTitle({ kicker, title, text, verTodo }) {
  return (
    <Reveal as="div" className="titulo-seccion">
      <div>
        {kicker && <p className="eyebrow-public">{kicker}</p>}
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {verTodo && <Link className="enlace-ver-todo" to={verTodo.to}>{verTodo.label}</Link>}
    </Reveal>
  )
}
