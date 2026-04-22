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
  { name: 'EAGLE-01', status: '森林上空巡航', confidence: '99%' },
  { name: 'HAWK-12', status: '海岸线压制', confidence: '96%' },
  { name: 'ORBIT-07', status: '高空云层侦察', confidence: '95%' },
  { name: 'GUARD-22', status: '末段拦截', confidence: '98%' },
]

const battleMetrics = [
  { label: '地形覆盖', value: '森林/海域/高空云' },
  { label: '导弹模型', value: '高精度 GLB' },
  { label: '目标锁定', value: '43 / 45' },
  { label: '实时追踪', value: '3 视角' },
]

const strategicEvents = [
  '已切换地表多地形战场：森林、海面与高空云层同步渲染。',
  '导弹与飞机使用真实 GLB 模型，轨迹姿态由曲线切线驱动。',
  '导弹末段制导触发爆闪、冲击环和火花散射效果。',
]

const terrainHeightAt = (x: number, z: number) => {
  const rolling = Math.sin(x * 0.07) * 2.1 + Math.cos(z * 0.06) * 1.6
  const details = Math.sin((x + z) * 0.12) * 0.85 + Math.cos((x - z) * 0.08) * 0.65
  return rolling + details
}

const createSoftCircleTexture = (size: number, color: string, alphaScale: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.5
  )
  gradient.addColorStop(0, `${color}${Math.round(alphaScale * 255).toString(16).padStart(2, '0')}`)
  gradient.addColorStop(0.5, `${color}${Math.round(alphaScale * 125).toString(16).padStart(2, '0')}`)
  gradient.addColorStop(1, `${color}00`)

  context.clearRect(0, 0, size, size)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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

const createSmokeTrail = (
  scene: any,
  color: number,
  size: number,
  maxPoints: number,
  smokeMap: any
): SmokeTrail => {
  const geometry = new THREE.BufferGeometry()
  const buffer = new Float32Array(maxPoints * 3)
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = 999
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3))

  const material = new THREE.PointsMaterial({
    color,
    map: smokeMap || null,
    size,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    alphaTest: 0.03,
    blending: THREE.NormalBlending,
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
  const [aircraftModelReady, setAircraftModelReady] = useState(false)
  const [missileModelReady, setMissileModelReady] = useState(false)
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
    scene.background = new THREE.Color(0x8aaccc)
    scene.fog = new THREE.Fog(0x8ea7bb, 70, 210)

    const camera = new THREE.PerspectiveCamera(
      45,
      mountNode.clientWidth / mountNode.clientHeight,
      0.1,
      500
    )
    camera.position.set(0, 32, 78)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    mountNode.appendChild(renderer.domElement)

    const hemiLight = new THREE.HemisphereLight(0x9cc5ea, 0x5d6f55, 0.88)
    const sunLight = new THREE.DirectionalLight(0xfff3da, 1.25)
    sunLight.position.set(36, 52, 18)
    const fillLight = new THREE.DirectionalLight(0xb9d8ff, 0.35)
    fillLight.position.set(-30, 18, -26)
    const warningLight = new THREE.PointLight(0xff8459, 0.65, 130)
    warningLight.position.set(12, 28, 16)
    scene.add(hemiLight, sunLight, fillLight, warningLight)

    const textureLoader = new THREE.TextureLoader()
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    const terrainTexture = textureLoader.load('/textures/terrain_grass.jpg')
    const waterNormals = textureLoader.load('/textures/water_normals.jpg')

    ;[terrainTexture, waterNormals].forEach((texture) => {
      texture.anisotropy = maxAnisotropy
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
    })
    terrainTexture.repeat.set(24, 24)
    waterNormals.repeat.set(8, 8)

    const terrainGeometry = new THREE.PlaneGeometry(190, 190, 220, 220)
    const terrainPosition = terrainGeometry.attributes.position as any
    for (let index = 0; index < terrainPosition.count; index += 1) {
      const x = terrainPosition.getX(index)
      const z = terrainPosition.getY(index)
      terrainPosition.setZ(index, terrainHeightAt(x, z))
    }
    terrainGeometry.computeVertexNormals()
    terrainGeometry.rotateX(-Math.PI / 2)

    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({
        map: terrainTexture,
        roughness: 0.95,
        metalness: 0.05,
      })
    )
    terrain.position.y = -6
    scene.add(terrain)

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 86, 1, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x2b668f,
        normalMap: waterNormals,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.16,
        metalness: 0.1,
        clearcoat: 0.5,
        transparent: true,
        opacity: 0.78,
      })
    )
    sea.rotation.x = -Math.PI / 2
    sea.position.set(48, -4.8, -22)
    scene.add(sea)

    const treeTrunkGeometry = new THREE.CylinderGeometry(0.14, 0.19, 2.1, 8)
    const treeTrunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f4028,
      roughness: 0.92,
      metalness: 0.02,
    })
    const treeCrownGeometry = new THREE.ConeGeometry(0.95, 2.8, 7)
    const treeCrownMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f6f3b,
      roughness: 0.88,
      metalness: 0.03,
    })
    const treeCount = 360
    const trunkInstances = new THREE.InstancedMesh(treeTrunkGeometry, treeTrunkMaterial, treeCount)
    const crownInstances = new THREE.InstancedMesh(treeCrownGeometry, treeCrownMaterial, treeCount)
    const tempMatrix = new THREE.Matrix4()
    const tempPosition = new THREE.Vector3()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3()
    for (let index = 0; index < treeCount; index += 1) {
      const x = THREE.MathUtils.randFloatSpread(170)
      const z = THREE.MathUtils.randFloatSpread(170)
      // 海面区域不种树，保留海湾地形。
      if (x > 10 && z < 28) {
        const fallbackX = x - 42
        const fallbackZ = z + 34
        tempPosition.set(fallbackX, terrainHeightAt(fallbackX, fallbackZ) - 6 + 1, fallbackZ)
      } else {
        tempPosition.set(x, terrainHeightAt(x, z) - 6 + 1, z)
      }

      tempQuaternion.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0))
      tempScale.setScalar(0.8 + Math.random() * 1.3)
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      trunkInstances.setMatrixAt(index, tempMatrix)

      tempPosition.y += 1.95
      tempScale.setScalar(0.7 + Math.random() * 0.8)
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      crownInstances.setMatrixAt(index, tempMatrix)
    }
    scene.add(trunkInstances, crownInstances)

    const cloudTexture = createSoftCircleTexture(220, '#ffffff', 0.78)
    const clouds: Array<{ sprite: any; speed: number }> = []
    for (let index = 0; index < 34; index += 1) {
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTexture || null,
          color: 0xffffff,
          transparent: true,
          opacity: 0.35 + Math.random() * 0.2,
          depthWrite: false,
        })
      )
      cloud.position.set(THREE.MathUtils.randFloatSpread(200), 24 + Math.random() * 12, THREE.MathUtils.randFloatSpread(200))
      const cloudSize = 9 + Math.random() * 15
      cloud.scale.set(cloudSize * 1.8, cloudSize, 1)
      scene.add(cloud)
      clouds.push({
        sprite: cloud,
        speed: 0.03 + Math.random() * 0.05,
      })
    }

    const cloudBand = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xe9f4ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    )
    cloudBand.rotation.x = -Math.PI / 2
    cloudBand.position.y = 31
    scene.add(cloudBand)

    const targetCoordinates = [
      new THREE.Vector3(-62, 16, -18),
      new THREE.Vector3(-28, 22, 24),
      new THREE.Vector3(6, 19, 10),
      new THREE.Vector3(38, 21, -14),
      new THREE.Vector3(66, 17, 21),
      new THREE.Vector3(20, 16, 46),
      new THREE.Vector3(-36, 20, 30),
    ]

    const targets: any[] = []
    targetCoordinates.forEach((target, index) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 18, 18),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? 0x00ffd5 : 0xff6b73,
          emissive: index % 2 === 0 ? 0x007f6b : 0x7f2329,
          emissiveIntensity: 1.1,
        })
      )
      marker.position.copy(target)
      scene.add(marker)
      targets.push(marker)
    })

    const attackerPath = new THREE.CatmullRomCurve3(targetCoordinates, true)
    const targetPath = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-58, 19, 52),
        new THREE.Vector3(-20, 24, 26),
        new THREE.Vector3(12, 18, 2),
        new THREE.Vector3(44, 22, 28),
        new THREE.Vector3(70, 16, -6),
        new THREE.Vector3(22, 20, -32),
        new THREE.Vector3(-26, 17, -40),
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

    const smokeMap = createSoftCircleTexture(120, '#f6f8fb', 0.9)
    const attackerSmoke = createSmokeTrail(scene, 0xd8e2ea, 0.9, 96, smokeMap)
    const targetSmoke = createSmokeTrail(scene, 0xe5cfd4, 0.85, 96, smokeMap)
    const missileSmoke = createSmokeTrail(scene, 0xdbe2e9, 0.75, 84, smokeMap)

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

    const desiredCameraPosition = new THREE.Vector3(0, 32, 78)
    const desiredLookAt = new THREE.Vector3(0, 6, 0)
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
            const attackerBox = new THREE.Box3().setFromObject(attackerModel)
            const attackerSize = new THREE.Vector3()
            attackerBox.getSize(attackerSize)
            const aircraftScale = 3.8 / Math.max(attackerSize.x, attackerSize.y, attackerSize.z, 1)
            attackerModel.scale.setScalar(aircraftScale)
            attackerModel.rotation.set(Math.PI / 2, Math.PI, 0)
            clearAnchor(attackerVisual)
            attackerVisual.add(attackerModel)

            const targetModel = gltf.scene.clone(true)
            normalizeModelMaterials(targetModel)
            targetModel.scale.setScalar(aircraftScale)
            targetModel.rotation.set(Math.PI / 2, Math.PI, 0)
            clearAnchor(targetVisual)
            targetVisual.add(targetModel)
            setAircraftModelReady(true)
          },
          undefined,
          () => setAircraftModelReady(false)
        )

        loader.load(
          '/models/missile.glb',
          (gltf: any) => {
            if (disposed) {
              return
            }
            const missileModel = gltf.scene
            normalizeModelMaterials(missileModel)
            const missileBox = new THREE.Box3().setFromObject(missileModel)
            const missileSize = new THREE.Vector3()
            missileBox.getSize(missileSize)
            const missileScale = 6.2 / Math.max(missileSize.x, missileSize.y, missileSize.z, 1)
            missileModel.scale.setScalar(missileScale)
            missileModel.rotation.set(Math.PI / 2, 0, Math.PI)
            clearAnchor(missileVisual)
            missileVisual.add(missileModel)
            setMissileModelReady(true)
          },
          undefined,
          () => setMissileModelReady(false)
        )
      } catch {
        // 加载失败时保持内置简模，保证场景可运行。
        setAircraftModelReady(false)
        setMissileModelReady(false)
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

      waterNormals.offset.x += 0.00055
      waterNormals.offset.y += 0.00035
      cloudBand.rotation.z += 0.0001
      clouds.forEach((cloud) => {
        cloud.sprite.position.x += cloud.speed
        if (cloud.sprite.position.x > 112) {
          cloud.sprite.position.x = -112
        }
      })

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
        missileProgress = Math.min(1, missileProgress + 0.0185)
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

      const mode = cameraModeRef.current
      if (mode === 'strategic') {
        desiredCameraPosition.set(0, 34, 82)
        desiredLookAt.set(0, 7, 0)
      } else if (mode === 'aircraft') {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-8))
          .add(new THREE.Vector3(0, 2.4, 0))
        desiredLookAt.copy(attackerJet.position).add(attackerTangent.clone().multiplyScalar(12))
      } else if (missileActive) {
        const right = new THREE.Vector3().crossVectors(missileTangent, new THREE.Vector3(0, 1, 0))
        if (right.lengthSq() < 0.0001) {
          right.set(1, 0, 0)
        } else {
          right.normalize()
        }
        desiredCameraPosition
          .copy(missile.position)
          .add(missileTangent.clone().multiplyScalar(-2.8))
          .add(right.multiplyScalar(2.2))
          .add(new THREE.Vector3(0, 0.9, 0))
        desiredLookAt.copy(missile.position).add(missileTangent.clone().multiplyScalar(6.5))
      } else {
        desiredCameraPosition
          .copy(attackerJet.position)
          .add(attackerTangent.clone().multiplyScalar(-9))
          .add(new THREE.Vector3(0, 2.4, 0))
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
      if (cloudTexture) {
        cloudTexture.dispose()
      }
      if (smokeMap) {
        smokeMap.dispose()
      }
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
              <span>绿色地表: 森林丘陵</span>
              <span>蓝色区域: 海面地形</span>
              <span>白色云层: 高空云海</span>
              <span>灰白粒子: 飞机与导弹尾烟</span>
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
              飞机模型状态：{aircraftModelReady ? '真实 GLB 已加载' : '回退简模（加载中/失败）'}
            </div>
            <div className={styles.effectHint}>
              导弹模型状态：{missileModelReady ? '真实 GLB 已加载' : '回退简模（加载中/失败）'}
            </div>
            <div className={styles.effectHint}>
              已启用：地表多地形 / 真实导弹模型 / 高空云层 / 命中特效
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

export default Home
