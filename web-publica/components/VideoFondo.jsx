import React, { useEffect, useRef } from 'react'

// Video de fondo del hero: se reproduce solo, sin sonido, en bucle y sin
// controles, tanto en escritorio como en celulares.
//
// Los navegadores móviles sólo permiten el autoplay si el video está SIN
// sonido y en línea (no a pantalla completa). Por eso:
//  - se fuerzan las propiedades muted / playsinline directamente en el
//    elemento (React no siempre refleja "muted" como atributo del DOM, e iOS
//    lo exige antes de llamar a play());
//  - se llama a play() cuando el video ya cargó y cada vez que la sección
//    vuelve a estar a la vista (se pausa fuera de pantalla para ahorrar batería);
//  - si el navegador igual bloquea el autoplay (modo de bajo consumo, ahorro
//    de datos), el error se ignora en silencio y se reintenta en el primer
//    toque o desplazamiento de la persona. Nunca se muestran controles.
export default function VideoFondo({ src, className = 'hero-video' }) {
  const ref = useRef(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return undefined
    video.muted = true
    video.defaultMuted = true
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')

    let visible = true
    const reproducir = () => {
      if (!visible || !video.paused) return
      const promesa = video.play()
      if (promesa && typeof promesa.catch === 'function') promesa.catch(() => {})
    }

    const observador = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entrada]) => {
        visible = entrada.isIntersecting
        if (visible) reproducir(); else video.pause()
      }, { threshold: 0.05 })
      : null
    observador?.observe(video)

    const alVolver = () => { if (!document.hidden) reproducir() }
    const eventosVideo = ['loadeddata', 'canplay']
    eventosVideo.forEach(nombre => video.addEventListener(nombre, reproducir))
    document.addEventListener('visibilitychange', alVolver)
    // Reintento con el primer gesto si el navegador bloqueó el autoplay.
    const eventosGesto = ['touchstart', 'pointerdown', 'scroll', 'keydown']
    eventosGesto.forEach(nombre => window.addEventListener(nombre, reproducir, { passive: true }))
    reproducir()

    return () => {
      observador?.disconnect()
      eventosVideo.forEach(nombre => video.removeEventListener(nombre, reproducir))
      document.removeEventListener('visibilitychange', alVolver)
      eventosGesto.forEach(nombre => window.removeEventListener(nombre, reproducir))
    }
  }, [src])

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload nofullscreen noremoteplayback"
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}
