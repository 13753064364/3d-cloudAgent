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
  { name: 'EAGLE-01', status: '高空压制', confidence: '99%' },
  { name: 'HAWK-12', status: '机动截获', confidence: '95%' },
  { name: 'ORBIT-07', status: '电子侦察', confidence: '96%' },
  { name: 'GUARD-22', status: '末段拦截', confidence: '97%' },
]

const battleMetrics = [
  { label: '地球纹理精度', value: '8K' },
  { label: '目标锁定', value: '43 / 45' },
  { label: '链路时延', value: '24 ms' },
  { label: '实时追踪', value: '3 视角' },
]

const strategicEvents = [
  '已切换真实飞机与导弹模型，轨迹姿态由曲线切线实时驱动。',
  '地球使用 8K 日照/夜光/云层纹理，并开启大气辉光外壳。',
  '导弹末段制导触发爆闪、冲击环和火花散射效果。',
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

const createFallbackAircraft = (color: number) => {
  const aircraft = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.52, 12),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45 })
  )
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.016, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xd8e8f8, metalness: 0.25, roughness: 0.58 })
  )
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.012, 0.07),
    new THREE.MeshStandardMaterial({ color: 0xd8e8f8, metalness: 0.2, roughness: 0.6 })
  )
  wing.position.y = -0.03
  tail.position.y = -0.22
  aircraft.add(body, wing, tail)
  return aircraft
}

const createFallbackMissile = () => {
  const missile = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.028, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e8eb, metalness: 0.55, roughness: 0.34 })
  )
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.11, 12),
    new THREE.MeshStandardMaterial({ color: 0xff7b5c, metalness: 0.18, roughness: 0.52 })
  )
  head.position.y = 0.26
  missile.add(shell, head)
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
    opacity: 0.52,
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

    let disposed = false
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x030914, 15, 40)

    const camera = new THREE.PerspectiveCamera(
      45,
      mountNode.clientWidth / mountNode.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 2.8, 9.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    mountNode.appendChild(renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0x87b7ff, 0.55)
    const sunlight = new THREE.DirectionalLight(0xffffff, 1.3)
    sunlight.position.set(6, 3.5, 5)
    const rimLight = new THREE.DirectionalLight(0x7ec4ff, 0.55)
    rimLight.position.set(-4, -2, -4)
    const warningLight = new THREE.PointLight(0xff7d5f, 0.42, 45)
    warningLight.position.set(3, -2, 3)
    scene.add(ambientLight, sunlight, rimLight, warningLight)

    const textureLoader = new THREE.TextureLoader()
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    const earthDay = textureLoader.load('/textures/earth_day_8k.jpg')
    const earthNight = textureLoader.load('/textures/earth_night_8k.jpg')
    const earthClouds = textureLoader.load('/textures/earth_clouds_8k.jpg')

    ;[earthDay, earthNight, earthClouds].forEach((texture) => {
      texture.anisotropy = maxAnisotropy
      texture.colorSpace = THREE.SRGBColorSpace
    })

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 200, 200),
      new THREE.MeshPhongMaterial({
        map: earthDay,
        bumpMap: earthDay,
        bumpScale: 0.05,
        specularMap: earthDay,
        specular: new THREE.Color(0x24303d),
        emissiveMap: earthNight,
        emissive: new THREE.Color(0x5f6f93),
        emissiveIntensity: 0.26,
        shininess: 20,
      })
    )
    scene.add(globe)

    const cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(2.235, 160, 160),
      new THREE.MeshPhongMaterial({
        map: earthClouds,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    scene.add(cloudLayer)

    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x46a8ff) },
        viewVector: { value: new THREE.Vector3(0, 0, 8) },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform vec3 viewVector;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.75 - dot(vNormal, normalize(viewVector)), 3.8);
          gl_FragColor = vec4(glowColor, 1.0) * intensity;
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.34, 140, 140), atmosphereMaterial)
    scene.add(atmosphere)

    const starGeometry = new THREE.BufferGeometry()
    const starVertices = new Float32Array(4200)
    for (let index = 0; index < starVertices.length; index += 1) {
      starVertices[index] = THREE.MathUtils.randFloatSpread(66)
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starVertices, 3))
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xa4d4ff,
        size: 0.03,
        transparent: true,
        opacity: 0.8,
      })
    )
    scene.add(stars)

    const targetCoordinates = [
      { latitude: 40.2, longitude: -74.5 },
      { latitude: 31.5, longitude: 121.6 },
      { latitude: 28.8, longitude: 44.2 },
      { latitude: -33.7, longitude: 151.3 },
      { latitude: 47.2, longitude: 17.8 },
    ]

    const targets: any[] = []
    targetCoordinates.forEach((target, index) => {
      const position = latLonToVector3(2.27, target.latitude, target.longitude)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 18, 18),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? 0x00ffd5 : 0xff6b73,
          emissive: index % 2 === 0 ? 0x007f6b : 0x7f2329,
          emissiveIntensity: 1.1,
        })
      )
      marker.position.copy(position)
      scene.add(marker)
      targets.push(marker)
    })

    const attackerPath = new THREE.CatmullRomCurve3(
      [
        latLonToVector3(2.31, 22.1, 110.1),
        latLonToVector3(2.38, 29.6, 90.4),
        latLonToVector3(2.34, 34.4, 58.5),
        latLonToVector3(2.29, 26.1, 24.2),
        latLonToVector3(2.31, 20.6, 69.7),
      ],
      true
    )

    const targetPath = new THREE.CatmullRomCurve3(
      [
        latLonToVector3(2.29, 24.8, 130.3),
        latLonToVector3(2.25, 30.3, 101.6),
        latLonToVector3(2.33, 33.5, 63.8),
        latLonToVector3(2.3, 28.8, 39.1),
        latLonToVector3(2.28, 23.4, 76.2),
      ],
      true
    )

    const attackerRoute = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(attackerPath.getPoints(240)),
      new THREE.LineBasicMaterial({ color: 0x4ce7ff, transparent: true, opacity: 0.62 })
    )
    const targetRoute = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(targetPath.getPoints(240)),
      new THREE.LineBasicMaterial({ color: 0xff7c82, transparent: true, opacity: 0.6 })
    )
    scene.add(attackerRoute, targetRoute)

    const attackerJet = new THREE.Group()
    const targetJet = new THREE.Group()
    const missile = new THREE.Group()
    missile.visible = false
    scene.add(attackerJet, targetJet, missile)

    const attackerVisual = new THREE.Group()
    const targetVisual = new THREE.Group()
    const missileVisual = new THREE.Group()
    attackerJet.add(attackerVisual)
    targetJet.add(targetVisual)
    missile.add(missileVisual)

    attackerVisual.add(createFallbackAircraft(0x56d7ff))
    targetVisual.add(createFallbackAircraft(0xff6e76))
    missileVisual.add(createFallbackMissile())

    const targetBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff5b6d, transparent: true, opacity: 0.9 })
    )
    targetBeacon.position.set(0, 0.22, 0)
    targetJet.add(targetBeacon)

    const attackerSmoke = createSmokeTrail(scene, 0xd8e2ea, 0.056, 96)
    const targetSmoke = createSmokeTrail(scene, 0xe5cfd4, 0.052, 96)
    const missileSmoke = createSmokeTrail(scene, 0xdbe2e9, 0.048, 84)

    const missileTrack = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: 0xffd36d,
        dashSize: 0.18,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.88,
      })
    )
    scene.add(missileTrack)

    const impactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.028, 16, 36),
      new THREE.MeshBasicMaterial({ color: 0xffcd7b, transparent: true, opacity: 0 })
    )
    impactRing.visible = false
    scene.add(impactRing)

    const impactFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffefc1, transparent: true, opacity: 0 })
    )
    impactFlash.visible = false
    scene.add(impactFlash)

    const sparkMaterials: any[] = []
    const sparks: Array<{ mesh: any; velocity: any }> = []
    for (let index = 0; index < 22; index += 1) {
      const sparkMaterial = new THREE.MeshBasicMaterial({
        color: 0xffa45d,
        transparent: true,
        opacity: 0,
      })
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), sparkMaterial)
      spark.visible = false
      scene.add(spark)
      sparkMaterials.push(sparkMaterial)
      sparks.push({ mesh: spark, velocity: new THREE.Vector3() })
    }

    const routeMarkers: FlightMarker[] = []
    for (let index = 0; index < 3; index += 1) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 14, 14),
        new THREE.MeshStandardMaterial({
          color: 0xfff38a,
          emissive: 0xffb347,
          emissiveIntensity: 1.1,
        })
      )
      scene.add(marker)
      routeMarkers.push({
        progress: Math.random(),
        speed: 0.0015 + index * 0.00024,
        curve: attackerPath,
        mesh: marker,
      })
    }

    const desiredCameraPosition = new THREE.Vector3(0, 2.8, 9.4)
    const desiredLookAt = new THREE.Vector3(0, 0, 0)
    let attackerProgress = 0.11
    let targetProgress = 0.56
    let missileProgress = 0
    let missileRoute: any = null
    let missileActive = false
    let missileCooldown = 80
    let impactProgress = 1
    let attackerTangent = new THREE.Vector3(0, 1, 0)
    let targetTangent = new THREE.Vector3(0, 1, 0)
    let missileTangent = new THREE.Vector3(0, 1, 0)

    const clearAnchor = (anchor: any) => {
      while (anchor.children.length > 0) {
        anchor.remove(anchor.children[0])
      }
    }

    const normalizeModelMaterials = (model: any) => {
      model.traverse((child: any) => {
        if (child.isMesh && child.material) {
          child.castShadow = false
          child.receiveShadow = true
          const material = child.material
          if (Array.isArray(material)) {
            material.forEach((inner) => {
              if (inner && inner.metalness !== undefined) {
                inner.metalness = Math.min(0.75, inner.metalness + 0.08)
              }
              if (inner && inner.roughness !== undefined) {
                inner.roughness = Math.max(0.2, inner.roughness - 0.06)
              }
            })
          } else {
            if (material.metalness !== undefined) {
              material.metalness = Math.min(0.75, material.metalness + 0.08)
            }
            if (material.roughness !== undefined) {
              material.roughness = Math.max(0.2, material.roughness - 0.06)
            }
          }
        }
      })
    }

    const loadRealModels = async () => {
      try {
        const loaderModule = await import('three/examples/jsm/loaders/GLTFLoader.js')
        if (disposed) {
          return
        }
        const loader = new (loaderModule as any).GLTFLoader()

        loader.load(
          '/models/aircraft.glb',
          (gltf: any) => {
            if (disposed) {
              return
            }
            const attackerModel = gltf.scene
            normalizeModelMaterials(attackerModel)
            attackerModel.scale.setScalar(0.0062)
            attackerModel.rotation.set(Math.PI / 2, Math.PI, 0)
            clearAnchor(attackerVisual)
            attackerVisual.add(attackerModel)

            const targetModel = gltf.scene.clone(true)
            normalizeModelMaterials(targetModel)
            targetModel.scale.setScalar(0.0062)
            targetModel.rotation.set(Math.PI / 2, Math.PI, 0)
            clearAnchor(targetVisual)
            targetVisual.add(targetModel)
          },
          undefined,
          () => undefined
        )

        loader.load(
          '/models/missile.glb',
          (gltf: any) => {
            if (disposed) {
              return
            }
            const missileModel = gltf.scene
            normalizeModelMaterials(missileModel)
            missileModel.scale.setScalar(0.0029)
            missileModel.rotation.set(Math.PI / 2, 0, Math.PI)
            clearAnchor(missileVisual)
            missileVisual.add(missileModel)
          },
          undefined,
          () => undefined
        )
      } catch {
        // 加载失败时保持内置简模，保证场景可运行。
      }
    }
    loadRealModels()

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
          (Math.random() - 0.5) * 0.11,
          (Math.random() - 0.5) * 0.11,
          (Math.random() - 0.5) * 0.11
        )
      })
    }

    let animationFrame = 0
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate)

      globe.rotation.y += 0.0009
      cloudLayer.rotation.y += 0.00135
      stars.rotation.y += 0.00015

      routeMarkers.forEach((flight) => {
        flight.progress = (flight.progress + flight.speed) % 1
        flight.mesh.position.copy(flight.curve.getPointAt(flight.progress))
      })

      attackerProgress = (attackerProgress + 0.00115) % 1
      targetProgress = (targetProgress + 0.00102) % 1

      const attackerPosition = attackerPath.getPointAt(attackerProgress)
      const targetPosition = targetPath.getPointAt(targetProgress)
      attackerTangent = attackerPath.getTangentAt(attackerProgress)
      targetTangent = targetPath.getTangentAt(targetProgress)

      orientObject(attackerJet, attackerPosition, attackerTangent)
      orientObject(targetJet, targetPosition, targetTangent)
      attackerJet.scale.setScalar(1.02)
      targetJet.scale.setScalar(0.95)

      pushSmokePoint(
        attackerSmoke,
        attackerPosition.clone().add(attackerTangent.clone().multiplyScalar(-0.25)),
        0.07
      )
      pushSmokePoint(
        targetSmoke,
        targetPosition.clone().add(targetTangent.clone().multiplyScalar(-0.2)),
        0.065
      )

      if (!missileActive) {
        missileCooldown -= 1
        if (missileCooldown <= 0) {
          const launchPoint = attackerPosition.clone()
          const targetPoint = targetPosition.clone()
          const control = launchPoint
            .clone()
            .add(targetPoint)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(3.45)
            .add(new THREE.Vector3(0, 0.9, 0))

          missileRoute = new THREE.QuadraticBezierCurve3(launchPoint, control, targetPoint)
          missileProgress = 0
          missileActive = true
          missile.visible = true
          missileTrack.visible = true

          const routePoints = missileRoute.getPoints(140)
          missileTrack.geometry.dispose()
          missileTrack.geometry = new THREE.BufferGeometry().setFromPoints(routePoints)
          ;(missileTrack as any).computeLineDistances()
        }
      }

      if (missileActive && missileRoute) {
        missileProgress = Math.min(1, missileProgress + 0.023)
        const missilePosition = missileRoute.getPointAt(missileProgress)
        missileTangent = missileRoute.getTangentAt(missileProgress)
        orientObject(missile, missilePosition, missileTangent)

        pushSmokePoint(
          missileSmoke,
          missilePosition.clone().add(missileTangent.clone().multiplyScalar(-0.16)),
          0.045
        )

        if (missileProgress >= 1) {
          missileActive = false
          missile.visible = false
          missileCooldown = 165
          triggerImpact(targetPosition)
          missileTrack.visible = false
          missileTrack.geometry.dispose()
          missileTrack.geometry = new THREE.BufferGeometry().setFromPoints([targetPosition, targetPosition])
        }
      }

      if (impactProgress < 1) {
        impactProgress += 0.034
        impactRing.scale.setScalar(1 + impactProgress * 5.8)
        impactFlash.scale.setScalar(1 + impactProgress * 3.9)
        ;(impactRing.material as any).opacity = Math.max(0, 0.95 - impactProgress * 1.2)
        ;(impactFlash.material as any).opacity = Math.max(0, 0.95 - impactProgress * 1.55)
        sparks.forEach((spark, index) => {
          spark.mesh.position.add(spark.velocity)
          spark.velocity.multiplyScalar(0.92)
          sparkMaterials[index].opacity = Math.max(0, 0.88 - impactProgress * 1.1)
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

      atmosphereMaterial.uniforms.viewVector.value.copy(camera.position)
      const mode = cameraModeRef.current
      if (mode === 'strategic') {
        desiredCameraPosition.set(0, 2.8, 9.4)
        desiredLookAt.set(0, 0.05, 0)
      } else if (mode === 'aircraft') {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-1.12))
          .add(new THREE.Vector3(0, 0.45, 0))
        desiredLookAt.copy(attackerJet.position).add(attackerTangent.clone().multiplyScalar(1.8))
      } else if (missileActive) {
        desiredCameraPosition
          .copy(missile.position)
          .add(missileTangent.clone().multiplyScalar(-0.42))
          .add(new THREE.Vector3(0, 0.24, 0))
        desiredLookAt.copy(missile.position).add(missileTangent.clone().multiplyScalar(1.2))
      } else {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-1.18))
          .add(new THREE.Vector3(0, 0.45, 0))
        desiredLookAt.copy(targetJet.position)
      }

      camera.position.lerp(desiredCameraPosition, 0.08)
      camera.lookAt(desiredLookAt)
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      camera.aspect = mountNode.clientWidth / mountNode.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountNode.clientWidth, mountNode.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      window.cancelAnimationFrame(animationFrame)
      scene.traverse((object: any) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach((material: { dispose: () => void }) => material.dispose())
          } else if (object.material) {
            object.material.dispose()
          }
        }
      })
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
              <span>蓝色: 我方真实飞机模型航迹</span>
              <span>红色: 目标飞机航迹</span>
              <span>黄色: 导弹拦截路径</span>
              <span>灰白: 飞机/导弹尾烟</span>
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
              已启用：真实模型 / 8K 地球细节 / 大气辉光 / 命中特效
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

export default Home
