"use client";

import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type PlanetParameters = {
  temperature: number;
  gravity: number;
  atmosphere: number;
  water: number;
};

type PlanetSceneProps = {
  values: PlanetParameters;
  reducedMotion: boolean;
};

type Crater = { u: number; v: number; radius: number; depth: number };
type SurfaceMaps = {
  noise: Float32Array;
  continental: Float32Array;
  polarIce: Float32Array;
  craterShade: Float32Array;
  craterRim: Float32Array;
  lavaChannels: Float32Array;
  clouds: Float32Array;
};

const textureWidth = 512;
const textureHeight = 256;
const baseColor = new THREE.Color();
const warmColor = new THREE.Color();
const coldColor = new THREE.Color();

function smoothNoise(x: number, y: number, seed: number) {
  return (
    Math.sin(x * 2.1 + seed) * Math.cos(y * 1.7 - seed * 0.7) * 0.35 +
    Math.sin(x * 4.2 - y * 2.8 + seed * 1.3) * 0.2 +
    Math.cos(x * 8.4 + y * 6.1 - seed) * 0.1 +
    Math.sin(x * 17 + y * 13 + seed * 0.5) * 0.045
  );
}

function createCraters(): Crater[] {
  let seed = 741;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  return Array.from({ length: 22 }, () => ({
    u: random(),
    v: 0.08 + random() * 0.84,
    radius: 0.004 + random() * 0.014,
    depth: 0.16 + random() * 0.28,
  }));
}

function createSurfaceMaps(craters: Crater[]): SurfaceMaps {
  const pixelCount = textureWidth * textureHeight;
  const maps: SurfaceMaps = {
    noise: new Float32Array(pixelCount),
    continental: new Float32Array(pixelCount),
    polarIce: new Float32Array(pixelCount),
    craterShade: new Float32Array(pixelCount),
    craterRim: new Float32Array(pixelCount),
    lavaChannels: new Float32Array(pixelCount),
    clouds: new Float32Array(pixelCount),
  };

  for (let y = 0; y < textureHeight; y += 1) {
    const v = y / textureHeight;
    const latitude = (v - 0.5) * Math.PI;
    for (let x = 0; x < textureWidth; x += 1) {
      const index = y * textureWidth + x;
      const u = x / textureWidth;
      const longitude = u * Math.PI * 2;
      const noise = smoothNoise(longitude, latitude, 2.4);
      maps.noise[index] = noise;
      maps.continental[index] = Math.sin(longitude * 1.35 + Math.sin(latitude * 3.2)) * 0.22 + noise;
      maps.polarIce[index] = Math.max(0, (Math.abs(latitude) - 0.95) * 1.8);
      const cloudNoise = smoothNoise(longitude * 1.35 + 13, latitude * 1.45 - 4, 7.1);
      maps.clouds[index] = THREE.MathUtils.smoothstep(cloudNoise, 0.02, 0.25);
      const fissure = Math.abs(Math.sin(longitude * 8 + Math.sin(latitude * 11) * 1.8) * Math.cos(latitude * 10 + longitude * 2.1));
      maps.lavaChannels[index] = 1 - THREE.MathUtils.smoothstep(fissure, 0.025, 0.105);

      let craterShade = 0;
      let craterRim = 0;
      for (const crater of craters) {
        let deltaU = Math.abs(u - crater.u);
        deltaU = Math.min(deltaU, 1 - deltaU) * Math.cos(latitude);
        const deltaV = (v - crater.v) * 0.5;
        const edge = Math.sqrt(deltaU * deltaU + deltaV * deltaV) / crater.radius;
        if (edge < 1) craterShade += crater.depth * (1 - edge * edge);
        if (edge >= 0.82 && edge < 1.12) craterRim = Math.max(craterRim, 0.15 * (1 - Math.abs(edge - 0.97) / 0.15));
      }
      maps.craterShade[index] = craterShade;
      maps.craterRim[index] = craterRim;
    }
  }
  return maps;
}

function makeSurfaceTexture(colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) {
  const data = new Uint8Array(textureWidth * textureHeight * 4);
  const texture = new THREE.DataTexture(data, textureWidth, textureHeight, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function updatePlanetTextures(
  textures: { surface: THREE.DataTexture; ocean: THREE.DataTexture; ice: THREE.DataTexture; lava: THREE.DataTexture },
  values: PlanetParameters,
  maps: SurfaceMaps,
) {
  const surface = textures.surface.image.data as Uint8Array;
  const oceanMask = textures.ocean.image.data as Uint8Array;
  const iceMask = textures.ice.image.data as Uint8Array;
  const lavaMap = textures.lava.image.data as Uint8Array;
  const temperature = values.temperature / 100;
  const gravity = values.gravity / 100;
  const water = values.water / 100;
  const cold = coldColor.set("#eef0ec");
  const oceanColor = new THREE.Color("#365f68");
  const temperateLand = baseColor.set("#89745e");
  const volcanicRock = warmColor.set("#302523");
  const coldBlend = 1 - THREE.MathUtils.smoothstep(temperature, 0.12, 0.46);
  const heatBlend = THREE.MathUtils.smoothstep(temperature, 0.55, 0.84);
  const activeWater = THREE.MathUtils.smoothstep(water, 0.025, 0.42);
  const oceanThreshold = -0.42 + water * 0.78;

  for (let index = 0; index < maps.noise.length; index += 1) {
    const pixel = index * 4;
    const noise = maps.noise[index];
    const oceanCoverage = activeWater * (1 - THREE.MathUtils.smoothstep(maps.continental[index], oceanThreshold - 0.08, oceanThreshold + 0.12));
    const iceCoverage = THREE.MathUtils.clamp(
      Math.max(maps.polarIce[index] * (0.45 + coldBlend), coldBlend * (0.54 + (noise + 0.5) * 0.4)),
      0,
      1,
    );
    const landShade = THREE.MathUtils.clamp(0.78 + (noise + 0.35) * (0.42 + gravity * 0.72), 0.55, 1.32);
    const craterShade = THREE.MathUtils.clamp(1 - maps.craterShade[index] * (0.55 + gravity * 0.75) + maps.craterRim[index], 0.42, 1.24);
    const landR = THREE.MathUtils.lerp(temperateLand.r, volcanicRock.r, heatBlend) * landShade * craterShade;
    const landG = THREE.MathUtils.lerp(temperateLand.g, volcanicRock.g, heatBlend) * landShade * craterShade;
    const landB = THREE.MathUtils.lerp(temperateLand.b, volcanicRock.b, heatBlend) * landShade * craterShade;
    const waterBlend = oceanCoverage * (1 - iceCoverage * coldBlend * 0.34);
    const colorR = THREE.MathUtils.lerp(landR, oceanColor.r, waterBlend);
    const colorG = THREE.MathUtils.lerp(landG, oceanColor.g, waterBlend);
    const colorB = THREE.MathUtils.lerp(landB, oceanColor.b, waterBlend);
    surface[pixel] = Math.round(linearToSrgb(THREE.MathUtils.clamp(THREE.MathUtils.lerp(colorR, cold.r, iceCoverage), 0, 1)) * 255);
    surface[pixel + 1] = Math.round(linearToSrgb(THREE.MathUtils.clamp(THREE.MathUtils.lerp(colorG, cold.g, iceCoverage), 0, 1)) * 255);
    surface[pixel + 2] = Math.round(linearToSrgb(THREE.MathUtils.clamp(THREE.MathUtils.lerp(colorB, cold.b, iceCoverage), 0, 1)) * 255);
    surface[pixel + 3] = 255;

    const ocean = Math.round(oceanCoverage * 255);
    oceanMask[pixel] = ocean;
    oceanMask[pixel + 1] = ocean;
    oceanMask[pixel + 2] = ocean;
    oceanMask[pixel + 3] = 255;

    const ice = Math.round(iceCoverage * 255);
    iceMask[pixel] = ice;
    iceMask[pixel + 1] = ice;
    iceMask[pixel + 2] = ice;
    iceMask[pixel + 3] = 255;

    const lava = Math.round(maps.lavaChannels[index] * heatBlend * (1 - oceanCoverage * 0.8) * 255);
    lavaMap[pixel] = 255;
    lavaMap[pixel + 1] = Math.round(92 + noise * 70);
    lavaMap[pixel + 2] = 18;
    lavaMap[pixel + 3] = lava;
  }

  Object.values(textures).forEach((texture) => { texture.needsUpdate = true; });
}

function linearToSrgb(value: number) {
  return value < 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function makePlanetGeometry() {
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  geometry.userData.basePositions = (geometry.attributes.position.array as Float32Array).slice();
  return geometry;
}

function updateCloudTexture(texture: THREE.DataTexture, cloudCoverage: Float32Array) {
  const pixels = texture.image.data as Uint8Array;
  for (let index = 0; index < cloudCoverage.length; index += 1) {
    const pixel = index * 4;
    const alpha = Math.round(cloudCoverage[index] * 255);
    pixels[pixel] = 255;
    pixels[pixel + 1] = alpha;
    pixels[pixel + 2] = 255;
    pixels[pixel + 3] = 255;
  }
  texture.needsUpdate = true;
}

function updatePlanetRelief(geometry: THREE.SphereGeometry, gravity: number) {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const original = geometry.userData.basePositions as Float32Array;
  const relief = 0.008 + (1 - gravity / 100) * 0.052;
  for (let i = 0; i < positions.count; i += 1) {
    const x = original[i * 3];
    const y = original[i * 3 + 1];
    const z = original[i * 3 + 2];
    const height = smoothNoise(x * 5 + z * 2, y * 5 - z, 3.1) * relief;
    const factor = 1 + height;
    positions.setXYZ(i, x * factor, y * factor, z * factor);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function RotatingPlanet({ values, reducedMotion }: PlanetSceneProps) {
  const group = useRef<THREE.Group>(null);
  const cloudGroup = useRef<THREE.Group>(null);
  const surfaceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const oceanMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const iceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const lavaMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const cloudMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const atmosphereMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const surfaceTexture = useMemo(() => makeSurfaceTexture(), []);
  const oceanTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const iceTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const lavaTexture = useMemo(() => makeSurfaceTexture(), []);
  const cloudTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const geometry = useMemo(() => makePlanetGeometry(), []);
  const craters = useMemo(() => createCraters(), []);
  const surfaceMaps = useMemo(() => createSurfaceMaps(craters), [craters]);

  useEffect(() => {
    updatePlanetTextures(
      { surface: surfaceTexture, ocean: oceanTexture, ice: iceTexture, lava: lavaTexture },
      values,
      surfaceMaps,
    );
  }, [iceTexture, lavaTexture, oceanTexture, surfaceMaps, surfaceTexture, values]);

  useEffect(() => {
    updateCloudTexture(cloudTexture, surfaceMaps.clouds);
  }, [cloudTexture, surfaceMaps]);

  useEffect(() => {
    updatePlanetRelief(geometry, values.gravity);
    if (surfaceMaterial.current) {
      surfaceMaterial.current.bumpScale = 0.014 + (1 - values.gravity / 100) * 0.078;
    }
    if (oceanMaterial.current) {
      oceanMaterial.current.roughness = 0.32 - (values.water / 100) * 0.18;
      oceanMaterial.current.clearcoat = 0.25 + (values.water / 100) * 0.65;
    }
  }, [geometry, values.gravity, values.water]);

  useEffect(() => {
    const temperature = values.temperature / 100;
    const atmosphere = values.atmosphere / 100;
    if (iceMaterial.current) iceMaterial.current.opacity = 0.18 + (1 - temperature) * 0.72;
    if (lavaMaterial.current) lavaMaterial.current.opacity = THREE.MathUtils.smoothstep(temperature, 0.55, 0.82);
    if (cloudMaterial.current) cloudMaterial.current.opacity = atmosphere * (0.5 + temperature * 0.12);
    if (atmosphereMaterial.current) atmosphereMaterial.current.opacity = 0.015 + atmosphere * 0.28;
  }, [values.atmosphere, values.temperature]);

  useEffect(() => () => {
    [surfaceTexture, oceanTexture, iceTexture, lavaTexture, cloudTexture].forEach((texture) => texture.dispose());
    geometry.dispose();
  }, [cloudTexture, geometry, iceTexture, lavaTexture, oceanTexture, surfaceTexture]);

  useFrame((_, delta) => {
    if (!reducedMotion) {
      if (group.current) group.current.rotation.y += delta * 0.035;
      if (cloudGroup.current) cloudGroup.current.rotation.y += delta * 0.043;
    }
  });

  const temperature = values.temperature / 100;
  const gravity = values.gravity / 100;
  const atmosphere = values.atmosphere / 100;
  const planetScale = 0.97 + gravity * 0.06;
  const atmosphereScale = 1.025 + atmosphere * 0.08;
  const atmosphereColor = new THREE.Color().setHSL(0.72 - temperature * 0.58, 0.45, 0.67);

  return (
    <group ref={group} scale={planetScale}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          ref={surfaceMaterial}
          map={surfaceTexture}
          bumpMap={surfaceTexture}
          bumpScale={0.014 + (1 - gravity) * 0.078}
          roughness={0.92 - (values.water / 100) * 0.16}
          metalness={0.025}
        />
      </mesh>
      <mesh scale={1.006}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshPhysicalMaterial
          ref={oceanMaterial}
          color="#b4d1d0"
          alphaMap={oceanTexture}
          transparent
          opacity={0.95}
          roughness={0.23}
          metalness={0.12}
          clearcoat={0.65}
          clearcoatRoughness={0.16}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.008}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial
          ref={iceMaterial}
          color="#f4f1ea"
          alphaMap={iceTexture}
          transparent
          opacity={0.4}
          roughness={0.72}
          metalness={0.04}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.01}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshBasicMaterial
          ref={lavaMaterial}
          map={lavaTexture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={cloudGroup}>
        <mesh scale={1.022}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshBasicMaterial
            ref={cloudMaterial}
            color="#e8e0d8"
            alphaMap={cloudTexture}
            transparent
            opacity={0.25}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <mesh scale={atmosphereScale}>
        <sphereGeometry args={[1, 64, 48]} />
        <meshBasicMaterial
          ref={atmosphereMaterial}
          color={atmosphereColor}
          transparent
          opacity={0.015 + atmosphere * 0.28}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[1.4, 0.25, 1.3]}
        color="#ff5b25"
        intensity={THREE.MathUtils.smoothstep(temperature, 0.58, 0.88) * 2.2}
        distance={4}
      />
    </group>
  );
}

function StaticPlanetFallback({ values }: Pick<PlanetSceneProps, "values">) {
  const temperature = values.temperature < 34 ? "frozen" : values.temperature > 66 ? "scorching" : "temperate";
  const gravity = values.gravity < 34 ? "low" : values.gravity > 66 ? "high" : "earth-like";
  const atmosphere = values.atmosphere < 34 ? "thin" : values.atmosphere > 66 ? "dense" : "breathable";
  const water = values.water < 34 ? "none" : values.water > 66 ? "subsurface-oceans" : "surface-oceans";
  return (
    <div
      className="planet-fallback planet-stage"
      role="img"
      aria-label="CSS planet fallback illustration"
      data-temperature={temperature}
      data-gravity={gravity}
      data-atmosphere={atmosphere}
      data-water={water}
      style={{
        "--planet-scale": `${0.94 + values.gravity / 1000}`,
        "--surface-detail": `${0.45 + values.gravity / 250}`,
        "--atmosphere-opacity": `${0.18 + values.atmosphere / 185}`,
        "--atmosphere-width": `${3 + values.atmosphere * 0.12}px`,
        "--water-opacity": `${values.water / 100}`,
        "--temperature-texture": "0.16",
      } as CSSProperties}
    >
      <div className="planet-halo" />
      <div className="atmosphere-layer atmosphere-layer-outer" />
      <div className="atmosphere-layer atmosphere-layer-inner" />
      <div className="planet">
        <div className="planet-atmosphere" />
        <div className="planet-land planet-land-one" />
        <div className="planet-land planet-land-two" />
        <div className="planet-land planet-land-three" />
        <div className="planet-cloud planet-cloud-one" />
        <div className="planet-cloud planet-cloud-two" />
        <div className="planet-water" />
        <div className="planet-surface-cracks" />
        <div className="planet-subsurface" />
        <div className="planet-ice" />
        <div className="planet-shadow" />
        <div className="planet-grain" />
      </div>
      <div className="planet-ring" />
    </div>
  );
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function PlanetScene({ values, reducedMotion }: PlanetSceneProps) {
  const [webglAvailable] = useState(() => {
    if (typeof document === "undefined") return false;
    const testCanvas = document.createElement("canvas");
    const context = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    const supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  });

  if (!webglAvailable) return <StaticPlanetFallback values={values} />;

  return (
    <SceneErrorBoundary fallback={<StaticPlanetFallback values={values} />}>
      <Canvas
        className="planet-canvas"
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        aria-label="Rotating procedural 3D planet"
      >
        <ambientLight intensity={0.48} />
        <directionalLight position={[3, 2, 4]} intensity={2.1} color="#fff0dd" />
        <RotatingPlanet values={values} reducedMotion={reducedMotion} />
      </Canvas>
    </SceneErrorBoundary>
  );
}
