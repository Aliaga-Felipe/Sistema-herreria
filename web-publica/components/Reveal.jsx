import React, { useEffect, useRef, useState } from 'react'

// Envoltorio liviano que agrega la clase "visible" cuando el elemento entra
// en pantalla, para la aparición progresiva de secciones (fade-in sutil).
export default function Reveal({ as: Tag = 'div', className = '', children, ...resto }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    // Si el navegador no soporta IntersectionObserver, se muestra directamente.
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(
      entradas => entradas.forEach(entrada => { if (entrada.isIntersecting) { setVisible(true); observer.unobserve(nodo) } }),
      { threshold: 0.12 }
    )
    observer.observe(nodo)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${visible ? 'visible' : ''} ${className}`} {...resto}>
      {children}
    </Tag>
  )
}
