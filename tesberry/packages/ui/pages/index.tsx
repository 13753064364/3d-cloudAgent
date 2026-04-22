import type { NextPage } from 'next'
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import styles from '../styles/MilitarySituation.module.css'

type CameraMode = 'strategic' | 'aircraft' | 'missile'

type FlightMarker = {
  progress: number
  speed: number
  curve: any
  mesh: any
}

type SmokeTrail = {
  maxPoints: number
  points: any
  positions: any[]
  buffer: Float32Array
}

const radarTracks = [
  { name: 'EAGLE-01', status: '巡逻中', confidence: '98%' },
  { name: 'HAWK-12', status: '电子压制', confidence: '93%' },
  { name: 'ORBIT-07', status: '电子侦察', confidence: '95%' },
  { name: 'GUARD-22', status: '拦截待命', confidence: '97%' },
]

const battleMetrics = [
  { label: '空域覆盖', value: '98.1%' },
  { label: '目标锁定', value: '43 / 45' },
  { label: '数据延迟', value: '26 ms' },
  { label: '友军在线', value: '26 单位' },
]

const strategicEvents = [
  '打击窗口开启：导弹引导链路稳定，进入终端制导阶段。',
  '敌机规避机动触发，战术 AI 正在实时修正拦截轨迹。',
  '多域传感器融合正常，打击判定阈值自动更新。',
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

const createAircraftModel = (primaryColor: number, accentColor: number) => {
  const aircraft = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.1, 0.7, 12),
    new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.2,
      metalness: 0.35,
      roughness: 0.48,
    })
  )
  aircraft.add(body)

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.2, 12),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.25,
      metalness: 0.22,
      roughness: 0.5,
    })
  )
  nose.position.y = 0.44
  aircraft.add(nose)

  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.018, 0.18),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.15,
      metalness: 0.25,
      roughness: 0.58,
    })
  )
  wing.position.y = -0.02
  aircraft.add(wing)

  const tailWing = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.014, 0.1),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.1,
      metalness: 0.2,
      roughness: 0.62,
    })
  )
  tailWing.position.y = -0.29
  aircraft.add(tailWing)

  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.13, 0.08),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.16,
      metalness: 0.25,
      roughness: 0.55,
    })
  )
  fin.position.set(0, -0.23, 0)
  aircraft.add(fin)

  return aircraft
}

const createMissileModel = () => {
  const missile = new THREE.Group()

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.036, 0.5, 10),
    new THREE.MeshStandardMaterial({
      color: 0xf4f5f8,
      emissive: 0x8aa2b4,
      emissiveIntensity: 0.2,
      metalness: 0.52,
      roughness: 0.38,
    })
  )
  missile.add(shell)

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, 0.12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xff6c4f,
      emissive: 0xff6c4f,
      emissiveIntensity: 0.34,
      metalness: 0.2,
      roughness: 0.42,
    })
  )
  head.position.y = 0.3
  missile.add(head)

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.026, 0.13, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffc75e,
      transparent: true,
      opacity: 0.85,
    })
  )
  flame.position.y = -0.33
  flame.rotation.x = Math.PI
  missile.add(flame)

  return missile
}

const createSmokeTrail = (scene: any, color: number, size: number, maxPoints: number): SmokeTrail => {
  const geometry = new THREE.BufferGeometry()
  const buffer = new Float32Array(maxPoints * 3)
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = 999
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3))

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })

  const points = new THREE.Points(geometry, material)
  scene.add(points)

  return {
    maxPoints,
    points,
    positions: [],
    buffer,
  }
}

const pushSmokePoint = (trail: SmokeTrail, point: any, jitter: number) => {
  const jittered = point.clone()
  jittered.x += (Math.random() - 0.5) * jitter
  jittered.y += (Math.random() - 0.5) * jitter
  jittered.z += (Math.random() - 0.5) * jitter

  trail.positions.unshift(jittered)
  if (trail.positions.length > trail.maxPoints) {
    trail.positions.pop()
  }

  for (let index = 0; index < trail.maxPoints; index += 1) {
    const offset = index * 3
    const smokePoint = trail.positions[index]
    if (smokePoint) {
      trail.buffer[offset] = smokePoint.x
      trail.buffer[offset + 1] = smokePoint.y
      trail.buffer[offset + 2] = smokePoint.z
    } else {
      trail.buffer[offset] = 999
      trail.buffer[offset + 1] = 999
      trail.buffer[offset + 2] = 999
    }
  }

  trail.points.geometry.attributes.position.needsUpdate = true
}

const orientObject = (object: any, position: any, tangent: any) => {
  const forwardAxis = new THREE.Vector3(0, 1, 0)
  const normalized = tangent.clone().normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(forwardAxis, normalized)
  object.position.copy(position)
  object.quaternion.copy(quaternion)
}

const Home: NextPage = () => {
  const [cameraMode, setCameraMode] = useState<CameraMode>('strategic')
  const sceneRef = useRef<HTMLDivElement>(null)
  const cameraModeRef = useRef<CameraMode>('strategic')

  useEffect(() => {
    cameraModeRef.current = cameraMode
  }, [cameraMode])

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
    const warningLight = new THREE.PointLight(0xff725c, 0.34, 45)
    warningLight.position.set(2, -3, 4)
    scene.add(ambientLight, directionalLight, pointLight, warningLight)

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
      { latitude: 27.9, longitude: 43.2 },
      { latitude: -33.86, longitude: 151.2 },
      { latitude: 46.91, longitude: 19.3 },
    ]

    const targets: any[] = []
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

    const attackerPath = new THREE.CatmullRomCurve3([
      latLonToVector3(2.28, 21.8, 110.2),
      latLonToVector3(2.35, 28.1, 88.4),
      latLonToVector3(2.31, 34.2, 54.5),
      latLonToVector3(2.27, 26.9, 22.6),
      latLonToVector3(2.3, 19.8, 66.1),
    ], true)

    const targetPath = new THREE.CatmullRomCurve3([
      latLonToVector3(2.3, 25.7, 131.9),
      latLonToVector3(2.27, 30.1, 98.1),
      latLonToVector3(2.33, 33.4, 65.4),
      latLonToVector3(2.3, 29.2, 35.9),
      latLonToVector3(2.28, 23.4, 74.8),
    ], true)

    const attackerRoute = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(attackerPath.getPoints(200)),
      new THREE.LineBasicMaterial({
        color: 0x4ce7ff,
        transparent: true,
        opacity: 0.65,
      })
    )
    scene.add(attackerRoute)

    const targetRoute = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(targetPath.getPoints(200)),
      new THREE.LineBasicMaterial({
        color: 0xff8a87,
        transparent: true,
        opacity: 0.55,
      })
    )
    scene.add(targetRoute)

    const attackerJet = createAircraftModel(0x43d4ff, 0x92ecff)
    const targetJet = createAircraftModel(0xff7277, 0xffb1b4)
    scene.add(attackerJet, targetJet)

    const attackerSmoke = createSmokeTrail(scene, 0xc8d4e0, 0.055, 80)
    const targetSmoke = createSmokeTrail(scene, 0xd6c4c7, 0.052, 78)

    const missile = createMissileModel()
    missile.visible = false
    scene.add(missile)
    const missileSmoke = createSmokeTrail(scene, 0xd3dae1, 0.048, 64)

    const missileTrack = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: 0xffd66b,
        dashSize: 0.18,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.85,
      })
    )
    scene.add(missileTrack)

    const impactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.026, 12, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
      })
    )
    impactRing.visible = false
    scene.add(impactRing)

    const impactFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfff2ba,
        transparent: true,
        opacity: 0,
      })
    )
    impactFlash.visible = false
    scene.add(impactFlash)

    const sparkMaterials: any[] = []
    const sparks: Array<{ mesh: any; velocity: any }> = []
    for (let index = 0; index < 18; index += 1) {
      const sparkMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb36b,
        transparent: true,
        opacity: 0,
      })
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), sparkMaterial)
      spark.visible = false
      scene.add(spark)
      sparkMaterials.push(sparkMaterial)
      sparks.push({
        mesh: spark,
        velocity: new THREE.Vector3(0, 0, 0),
      })
    }

    const routeMarkers: FlightMarker[] = []
    for (let index = 0; index < 3; index += 1) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 14, 14),
        new THREE.MeshStandardMaterial({
          color: 0xfff38a,
          emissive: 0xffb347,
          emissiveIntensity: 1.2,
        })
      )
      scene.add(marker)
      routeMarkers.push({
        progress: Math.random(),
        speed: 0.0015 + index * 0.00022,
        curve: attackerPath,
        mesh: marker,
      })
    }

    const desiredCameraPosition = new THREE.Vector3(0, 2.5, 8.8)
    const desiredLookAt = new THREE.Vector3(0, 0, 0)

    let attackerProgress = 0.12
    let targetProgress = 0.58
    let missileProgress = 0
    let missileRoute: any = null
    let missileActive = false
    let missileCooldown = 80
    let impactProgress = 1
    let attackerTangent = new THREE.Vector3(0, 1, 0)
    let targetTangent = new THREE.Vector3(0, 1, 0)
    let missileTangent = new THREE.Vector3(0, 1, 0)

    const triggerImpact = (position: any) => {
      impactProgress = 0
      impactRing.visible = true
      impactFlash.visible = true
      impactRing.position.copy(position)
      impactFlash.position.copy(position)
      impactRing.scale.setScalar(1)
      impactFlash.scale.setScalar(1)
      ;(impactRing.material as any).opacity = 0.95
      ;(impactFlash.material as any).opacity = 0.95

      sparks.forEach((spark) => {
        spark.mesh.visible = true
        spark.mesh.position.copy(position)
        spark.velocity.set(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        )
      })
    }

    let animationFrame = 0
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate)
      globe.rotation.y += 0.0015
      globeGrid.rotation.y += 0.0018
      radarRing.rotation.z += 0.003
      stars.rotation.y += 0.0002

      routeMarkers.forEach((flight) => {
        flight.progress = (flight.progress + flight.speed) % 1
        const position = flight.curve.getPointAt(flight.progress)
        flight.mesh.position.copy(position)
      })

      attackerProgress = (attackerProgress + 0.0012) % 1
      targetProgress = (targetProgress + 0.001) % 1

      const attackerPosition = attackerPath.getPointAt(attackerProgress)
      const targetPosition = targetPath.getPointAt(targetProgress)
      attackerTangent = attackerPath.getTangentAt(attackerProgress)
      targetTangent = targetPath.getTangentAt(targetProgress)

      orientObject(attackerJet, attackerPosition, attackerTangent)
      orientObject(targetJet, targetPosition, targetTangent)

      attackerJet.scale.setScalar(1.05)
      targetJet.scale.setScalar(0.95)

      pushSmokePoint(
        attackerSmoke,
        attackerPosition.clone().add(attackerTangent.clone().multiplyScalar(-0.2)),
        0.07
      )
      pushSmokePoint(
        targetSmoke,
        targetPosition.clone().add(targetTangent.clone().multiplyScalar(-0.18)),
        0.065
      )

      if (!missileActive) {
        missileCooldown -= 1
        if (missileCooldown <= 0) {
          const launchFrom = attackerPosition.clone()
          const attackTo = targetPosition.clone()
          const controlPoint = launchFrom
            .clone()
            .add(attackTo)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(3.35)
            .add(new THREE.Vector3(0, 0.9, 0))

          missileRoute = new THREE.QuadraticBezierCurve3(launchFrom, controlPoint, attackTo)
          missileProgress = 0
          missileActive = true
          missile.visible = true

          const routePoints = missileRoute.getPoints(120)
          missileTrack.geometry.dispose()
          missileTrack.geometry = new THREE.BufferGeometry().setFromPoints(routePoints)
          ;(missileTrack as any).computeLineDistances()
        }
      }

      if (missileActive && missileRoute) {
        missileProgress = Math.min(1, missileProgress + 0.024)
        const missilePosition = missileRoute.getPointAt(missileProgress)
        missileTangent = missileRoute.getTangentAt(missileProgress)
        orientObject(missile, missilePosition, missileTangent)
        pushSmokePoint(
          missileSmoke,
          missilePosition.clone().add(missileTangent.clone().multiplyScalar(-0.15)),
          0.04
        )

        if (missileProgress >= 1) {
          missileActive = false
          missile.visible = false
          missileCooldown = 180
          triggerImpact(targetPosition)
          missileTrack.geometry.dispose()
          missileTrack.geometry = new THREE.BufferGeometry().setFromPoints([targetPosition, targetPosition])
        }
      }

      if (impactProgress < 1) {
        impactProgress += 0.032
        const scale = 1 + impactProgress * 5.6
        impactRing.scale.setScalar(scale)
        impactFlash.scale.setScalar(1 + impactProgress * 3.8)
        ;(impactRing.material as any).opacity = Math.max(0, 0.95 - impactProgress * 1.2)
        ;(impactFlash.material as any).opacity = Math.max(0, 0.92 - impactProgress * 1.6)

        sparks.forEach((spark, index) => {
          spark.mesh.position.add(spark.velocity)
          spark.velocity.multiplyScalar(0.92)
          sparkMaterials[index].opacity = Math.max(0, 0.85 - impactProgress * 1.1)
        })
      } else if (impactRing.visible) {
        impactRing.visible = false
        impactFlash.visible = false
        sparks.forEach((spark, index) => {
          spark.mesh.visible = false
          sparkMaterials[index].opacity = 0
        })
      }

      targets.forEach((target, index) => {
        const pulse = 1 + Math.sin(Date.now() * 0.004 + index) * 0.2
        target.scale.setScalar(pulse)
      })

      const activeCameraMode = cameraModeRef.current
      if (activeCameraMode === 'strategic') {
        desiredCameraPosition.set(0, 2.55, 8.8)
        desiredLookAt.set(0, 0.05, 0)
      } else if (activeCameraMode === 'aircraft') {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-0.95))
          .add(new THREE.Vector3(0, 0.45, 0))
        desiredLookAt.copy(attackerJet.position).add(attackerTangent.clone().multiplyScalar(1.55))
      } else if (missileActive) {
        desiredCameraPosition
          .copy(missile.position)
          .add(missileTangent.clone().multiplyScalar(-0.35))
          .add(new THREE.Vector3(0, 0.22, 0))
        desiredLookAt.copy(missile.position).add(missileTangent.clone().multiplyScalar(1.1))
      } else {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-1.1))
          .add(new THREE.Vector3(0, 0.45, 0))
        desiredLookAt.copy(targetJet.position)
      }

      camera.position.lerp(desiredCameraPosition, 0.08)
      camera.lookAt(desiredLookAt)

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
      scene.traverse((object: any) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach((material: { dispose: () => void }) => material.dispose())
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
        <div className={styles.cameraSwitch}>
          <button
            className={cameraMode === 'strategic' ? styles.activeCameraButton : styles.cameraButton}
            onClick={() => setCameraMode('strategic')}
            type="button"
          >
            全局视角
          </button>
          <button
            className={cameraMode === 'aircraft' ? styles.activeCameraButton : styles.cameraButton}
            onClick={() => setCameraMode('aircraft')}
            type="button"
          >
            飞机跟随
          </button>
          <button
            className={cameraMode === 'missile' ? styles.activeCameraButton : styles.cameraButton}
            onClick={() => setCameraMode('missile')}
            type="button"
          >
            导弹跟随
          </button>
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
              <span>蓝色: 我方飞机与巡航航线</span>
              <span>红色: 敌机机动航迹</span>
              <span>黄色: 导弹拦截轨迹</span>
              <span>灰白: 尾烟轨迹</span>
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
            <div className={styles.effectHint}>
              已启用：飞机尾烟 / 导弹尾烟 / 命中爆闪特效
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

export default Home
