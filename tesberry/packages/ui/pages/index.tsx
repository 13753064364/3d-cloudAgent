import type { NextPage } from 'next'
import Head from 'next/head'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import styles from '../styles/MilitarySituation.module.css'

type FlightMarker = {
  progress: number
  speed: number
  curve: THREE.QuadraticBezierCurve3
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
}

const radarTracks = [
  { name: 'EAGLE-01', status: '巡逻中', confidence: '98%' },
  { name: 'HAWK-12', status: '接敌预警', confidence: '91%' },
  { name: 'ORBIT-07', status: '电子侦察', confidence: '95%' },
  { name: 'GUARD-22', status: '区域封控', confidence: '89%' },
]

const battleMetrics = [
  { label: '空域覆盖', value: '97.4%' },
  { label: '目标锁定', value: '42 / 45' },
  { label: '数据延迟', value: '38 ms' },
  { label: '友军在线', value: '26 单位' },
]

const strategicEvents = [
  '北部防区发现高速目标，已切入二级追踪。',
  '东南海域完成无人机编队重组，航迹稳定。',
  '联合作战链路校准完成，跨域同步正常。',
]

const latLonToVector3 = (radius: number, latitude: number, longitude: number) => {
  const phi = (90 - latitude) * (Math.PI / 180)
  const theta = (longitude + 180) * (Math.PI / 180)

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

const Home: NextPage = () => {
  const sceneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mountNode = sceneRef.current

    if (!mountNode) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x02050c, 12, 34)

    const camera = new THREE.PerspectiveCamera(
      45,
      mountNode.clientWidth / mountNode.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 2.4, 8.7)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mountNode.appendChild(renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0x9cb8ff, 0.46)
    const directionalLight = new THREE.DirectionalLight(0x7bc8ff, 0.9)
    directionalLight.position.set(5, 5, 7)
    const pointLight = new THREE.PointLight(0x00ffcc, 0.7, 50)
    pointLight.position.set(-4, 2, -5)
    scene.add(ambientLight, directionalLight, pointLight)

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0a203c,
        emissive: 0x071425,
        emissiveIntensity: 0.7,
        metalness: 0.18,
        roughness: 0.35,
      })
    )
    scene.add(globe)

    const globeGrid = new THREE.Mesh(
      new THREE.SphereGeometry(2.24, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x1ee6ff,
        transparent: true,
        opacity: 0.25,
        wireframe: true,
      })
    )
    scene.add(globeGrid)

    const radarRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.03, 20, 160),
      new THREE.MeshBasicMaterial({ color: 0x33f7ff, transparent: true, opacity: 0.45 })
    )
    radarRing.rotation.x = Math.PI / 2
    scene.add(radarRing)

    const starGeometry = new THREE.BufferGeometry()
    const starVertices = new Float32Array(3000)
    for (let i = 0; i < starVertices.length; i += 1) {
      starVertices[i] = THREE.MathUtils.randFloatSpread(60)
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starVertices, 3))
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0x9fd6ff,
        size: 0.03,
        transparent: true,
        opacity: 0.8,
      })
    )
    scene.add(stars)

    const targetCoordinates = [
      { latitude: 38.9, longitude: -77.04 },
      { latitude: 31.23, longitude: 121.47 },
      { latitude: 25.27, longitude: 55.29 },
      { latitude: -33.86, longitude: 151.2 },
      { latitude: 48.85, longitude: 2.35 },
    ]

    const targets: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = []
    targetCoordinates.forEach((target, index) => {
      const position = latLonToVector3(2.26, target.latitude, target.longitude)
      const targetMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 20, 20),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? 0x00ffd5 : 0xff5f62,
          emissive: index % 2 === 0 ? 0x008f77 : 0x8b2830,
          emissiveIntensity: 1.25,
        })
      )
      targetMesh.position.copy(position)
      scene.add(targetMesh)
      targets.push(targetMesh)
    })

    const routes: FlightMarker[] = []
    const routeColor = new THREE.Color(0x6de8ff)
    for (let index = 0; index < targetCoordinates.length - 1; index += 1) {
      const start = latLonToVector3(2.26, targetCoordinates[index].latitude, targetCoordinates[index].longitude)
      const end = latLonToVector3(2.26, targetCoordinates[index + 1].latitude, targetCoordinates[index + 1].longitude)
      const control = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(3.4)
      const curve = new THREE.QuadraticBezierCurve3(start, control, end)
      const points = curve.getPoints(80)
      const routeGeometry = new THREE.BufferGeometry().setFromPoints(points)
      const routeLine = new THREE.Line(
        routeGeometry,
        new THREE.LineBasicMaterial({ color: routeColor, transparent: true, opacity: 0.72 })
      )
      scene.add(routeLine)

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xfff38a,
          emissive: 0xffb347,
          emissiveIntensity: 1.4,
        })
      )
      scene.add(marker)

      routes.push({
        progress: Math.random(),
        speed: 0.0018 + index * 0.00035,
        curve,
        mesh: marker,
      })
    }

    let animationFrame = 0
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate)
      globe.rotation.y += 0.0015
      globeGrid.rotation.y += 0.0018
      radarRing.rotation.z += 0.003
      stars.rotation.y += 0.0002

      routes.forEach((flight) => {
        flight.progress = (flight.progress + flight.speed) % 1
        const position = flight.curve.getPointAt(flight.progress)
        flight.mesh.position.copy(position)
      })

      targets.forEach((target, index) => {
        const pulse = 1 + Math.sin(Date.now() * 0.004 + index) * 0.2
        target.scale.setScalar(pulse)
      })

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!mountNode) {
        return
      }
      camera.aspect = mountNode.clientWidth / mountNode.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountNode.clientWidth, mountNode.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.cancelAnimationFrame(animationFrame)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose())
          } else {
            object.material.dispose()
          }
        }
      })
      starGeometry.dispose()
      renderer.dispose()
      mountNode.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <>
      <Head>
        <title>三维态势指挥平台</title>
        <meta name="description" content="军事三维态势可视化指挥网页" />
      </Head>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div>
            <p className={styles.tag}>JOINT OPS / LIVE FEED</p>
            <h1 className={styles.title}>三维态势联合作战指挥平台</h1>
          </div>
          <div className={styles.statusBox}>
            <span className={styles.dot} />
            全链路在线
          </div>
        </div>

        <div className={styles.layout}>
          <aside className={styles.panel}>
            <h2>雷达航迹</h2>
            <ul className={styles.trackList}>
              {radarTracks.map((track) => (
                <li key={track.name}>
                  <strong>{track.name}</strong>
                  <span>{track.status}</span>
                  <small>置信度 {track.confidence}</small>
                </li>
              ))}
            </ul>
          </aside>

          <section className={styles.sceneWrap}>
            <div ref={sceneRef} className={styles.scene} />
            <div className={styles.legend}>
              <span>蓝色: 我方覆盖</span>
              <span>红色: 高威胁目标</span>
              <span>黄色: 动态航迹</span>
            </div>
          </section>

          <aside className={styles.panel}>
            <h2>战场指标</h2>
            <div className={styles.metricGrid}>
              {battleMetrics.map((metric) => (
                <div key={metric.label} className={styles.metricCard}>
                  <p>{metric.label}</p>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
            <h3>态势播报</h3>
            <ul className={styles.eventList}>
              {strategicEvents.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  )
}

export default Home
